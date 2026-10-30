#!/usr/bin/env node
import fs from 'node:fs';
import {configure} from './configure.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const base = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, item.name);
    if (item.isDirectory() && !['.git','node_modules','dist','build','.work'].includes(item.name)) walk(p);
    else if(item.isFile()) files.push(p);
  }
}
walk(base);
const composition=configure();
if(composition.extension)walk(composition.extension);
const errors = [];
const definitions = new Map();
let deprecatedRequirementCount = 0;
const requirementFiles = files.filter(p => p.endsWith('/requirements.md'));
for (const file of requirementFiles) {
  const text = fs.readFileSync(file, 'utf8');
  const executive = fs.readFileSync(path.join(path.dirname(file), 'executive.md'), 'utf8');
  const headings = [...text.matchAll(/^### (REQ-[A-Z]+-\d{3}): (.+)$/gm)];
  let deprecatedCount = 0;
  let completeCount = 0;
  for (let i = 0; i < headings.length; i++) {
    const [, id, title] = headings[i];
    if (definitions.has(id)) errors.push(`Duplicate definition: ${id}`);
    if (!executive.includes(`**${id}:** ${title}`)) errors.push(`Executive identity mismatch: ${id}`);
    const start = headings[i].index + headings[i][0].length;
    const body = text.slice(start, headings[i + 1]?.index ?? text.length);
    definitions.set(id, { file: path.relative(base, file), title, deprecated: body.includes('**DEPRECATED:**') });
    if (body.includes('**DEPRECATED:**')) { deprecatedCount++; deprecatedRequirementCount++; }
    else if (executive.split('\n').some(line => line.startsWith(`| **${id}:**`) && line.includes('| ✅ Complete |'))) completeCount++;
    if (!body.includes('**Rationale:**')) errors.push(`Missing rationale: ${id}`);
    if (!/SHALL\b/.test(body)) errors.push(`Missing obligation: ${id}`);
    if (/\b(TODO|TBD|previously|recently|for now|as before|MVP)\b/i.test(body)) errors.push(`Unresolved or temporal requirement wording: ${id}`);
  }
  const expectedProgress = deprecatedCount
    ? `**Progress:** ${completeCount} of ${headings.length - deprecatedCount} active requirements complete; ${deprecatedCount} deprecated requirement${deprecatedCount === 1 ? '' : 's'} retained.`
    : `**Progress:** ${completeCount} of ${headings.length} complete.`;
  if (!executive.includes(expectedProgress)) errors.push(`Progress mismatch: ${file}`);
}
for (const file of files.filter(p => /\.(md|allium)$/.test(p))) {
  const text = fs.readFileSync(file, 'utf8');
  for (const id of text.match(/REQ-[A-Z]+-\d{3}/g) ?? []) {
    if (!definitions.has(id)) errors.push(`Undefined ${id} in ${path.relative(base, file)}`);
    else if (definitions.get(id).deprecated && (file.endsWith('.allium') || file.endsWith('/verification/acceptance.md'))) {
      errors.push(`Deprecated requirement appears in active model/acceptance obligations: ${id} in ${path.relative(base, file)}`);
    }
  }
  if (file.endsWith('/executive.md')) {
    if (text.includes('```')) errors.push(`Executive code block: ${file}`);
    for (const heading of ['Requirements summary', 'Technical summary']) {
      const section = text.split(`## ${heading}\n`)[1]?.split('\n## ')[0];
      if (section && section.trim().split(/\s+/).length > 250) errors.push(`Executive summary exceeds 250 words: ${file} ${heading}`);
    }
  }
  if (file.endsWith('.md')) {
    for (const [, raw] of text.matchAll(/\]\(([^)]+)\)/g)) {
      const target = raw.replace(/^<|>$/g, '').split('#')[0];
      if (!target || /^[a-z][a-z\d+.-]*:/i.test(target)) continue;
      if (!fs.existsSync(path.resolve(path.dirname(file), decodeURIComponent(target)))) errors.push(`Broken link: ${path.relative(base, file)} -> ${target}`);
    }
  }
  if (file.endsWith('.allium')) {
    if (!text.startsWith('-- allium: 3\n')) errors.push(`Missing Allium version: ${file}`);
    if (/^open question /m.test(text)) errors.push(`Unresolved Allium behavior: ${file}`);
    for (const [, target] of text.matchAll(/^use "([^"]+)"/gm)) {
      if (!fs.existsSync(path.resolve(path.dirname(file), target))) errors.push(`Missing model import: ${target}`);
    }
  }
}

// The CLI emits one JSON object per input model. Do not parse only the first
// model, and never treat a missing executable or malformed output as success.
function parseSequence(text) {
  const result = [];
  let depth = 0, quoted = false, escaped = false, start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quoted = false;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') {
      depth--;
      if (depth === 0 && start >= 0) { result.push(JSON.parse(text.slice(start, i + 1))); start = -1; }
    }
  }
  if (depth || quoted || !result.length) throw new Error('Missing or malformed Allium JSON output');
  return result;
}

const modelCount = files.filter(p => p.endsWith('.allium')).length;
const analyses = [];
for (const command of ['check', 'analyse']) {
  const run = spawnSync('allium', [command, path.join(base, 'specs')], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  if (run.error) { errors.push(`Allium ${command} unavailable: ${run.error.message}`); continue; }
  try {
    const reports = parseSequence(run.stdout);
    if (reports.length !== modelCount) errors.push(`Allium ${command} returned ${reports.length} reports for ${modelCount} models`);
    for (const report of reports) {
      report.spec_file = path.relative(base, path.resolve(report.spec_file));
      for (const diagnostic of report.diagnostics ?? []) {
        if (diagnostic.severity !== 'info') errors.push(`Allium ${command}: ${diagnostic.code}: ${diagnostic.message}`);
      }
      for (const finding of report.findings ?? []) errors.push(`Allium ${command} finding: ${JSON.stringify(finding)}`);
    }
    if (run.status !== 0) errors.push(`Allium ${command} exited ${run.status}: ${run.stderr.trim()}`);
    analyses.push({ command, exitCode: run.status, reports });
  } catch (error) { errors.push(`Allium ${command} output failure: ${error.message}`); }
}

const report = {
  generatedAt: new Date().toISOString(),
  scope: 'Specification structure and Allium analysis; application runtime evidence is maintained separately',
  featureCount: requirementFiles.length,
  requirementCount: definitions.size,
  activeRequirementCount: definitions.size - deprecatedRequirementCount,
  deprecatedRequirementCount,
  modelCount,
  adrCount: files.filter(p => /\/adrs\/\d{3}_.*\.md$/.test(p)).length,
  errors,
  allium: analyses,
  runtimeVerification: 'See verification/README.md for application tests, measurements and their limits',
};
const reportRoot=composition.extension??base;
fs.mkdirSync(path.join(reportRoot,'verification/specs'),{recursive:true});
fs.writeFileSync(path.join(reportRoot, 'verification/specs/validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ...report, allium: analyses.map(a=>({command:a.command,exitCode:a.exitCode,models:a.reports.length,diagnostics:a.reports.reduce((n,r)=>n+r.diagnostics.length,0),findings:a.reports.reduce((n,r)=>n+r.findings.length,0)})) }, null, 2));
process.exitCode = errors.length ? 1 : 0;
