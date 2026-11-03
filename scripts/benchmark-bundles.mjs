import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {buildWebFunction} from './build-web.mjs';
import {root,builtinFunctions} from './configure.mjs';

process.chdir(root);
execFileSync('npm',['run','build'],{stdio:'inherit'});
const directory=path.join(root,'.work/bundle-benchmark');
await fs.rm(directory,{recursive:true,force:true});await fs.mkdir(directory,{recursive:true});
const definition=builtinFunctions.find(f=>f.mnemonic==='SLOW');
const sizes={};
for(const [variant,minify]of [['unminified',false],['minified',true]]){
  const output=path.join(directory,variant);await buildWebFunction(definition,output,{minify});
  sizes[variant]={};for(const file of ['app.js','style.css','app.js.map','style.css.map'])sizes[variant][file]=(await fs.stat(path.join(output,file))).size;
}
const request=path.join(directory,'request.json');await fs.writeFile(request,JSON.stringify({requestedAt:new Date().toISOString()}));
try{execFileSync('xcodebuild',['-project','native/CommandCenter.xcodeproj','-scheme','CommandCenter','-derivedDataPath',path.join(root,'.work/native'),'test','-only-testing:CommandCenterTests/BenchmarkTests/testBundleMinificationComparison','CODE_SIGNING_ALLOWED=NO'],{stdio:'inherit'});}
finally{await fs.rm(request,{force:true});}
let result;try{result=await fs.readFile(path.join(directory,'result.json'),'utf8');}catch(error){if(error.code==='ENOENT')throw new Error('No benchmark results: the foreground comparison was skipped or interrupted. Run it with an unlocked desktop and keep its window visible.');throw error;}
const native=JSON.parse(result);
function percentile(values,p){const sorted=values.toSorted((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(p*sorted.length)-1)];}
const summary={};
for(const variant of ['unminified','minified']){
  const samples=native.samples.filter(s=>s.variant===variant),values=samples.map(s=>s.readyMs);
  summary[variant]={samples:samples.length,jsBytes:sizes[variant]['app.js'],cssBytes:sizes[variant]['style.css'],mapBytes:sizes[variant]['app.js.map']+sizes[variant]['style.css.map'],medianReadyMs:percentile(values,.5),p95ReadyMs:percentile(values,.95),meanReadyMs:values.reduce((a,b)=>a+b,0)/values.length,over500ms:values.filter(v=>v>500).length,frameCheckpoints:samples.filter(s=>s.renderOpportunity==='frame').length};
}
const visibility={visibleSamples:native.samples.filter(s=>s.documentVisibility==='visible').length,frameCheckpoints:native.samples.filter(s=>s.renderOpportunity==='frame').length,totalSamples:native.samples.length};
const report={checkedAt:new Date().toISOString(),function:'SLOW 0',method:'Paired alternating AB/BA; 2 warmups per variant; 30 measured fresh WebViews per variant; unique resource URLs; production React in both builds',endpoint:'Before WKWebView/configuration creation to native receipt of the real framework viewReady checkpoint',limits:'Warm app/filesystem; WebKit controls process reuse. Includes local loading, parsing, evaluation, React commit and responsiveness probe; does not isolate parsing, exact pixel presentation or full native command admission. Only continuously foreground, visible frame checkpoints are accepted; interrupted runs do not publish a comparison.',visibility,sizes,summary,profile:native.profile,warmups:native.warmups,samples:native.samples};
await fs.writeFile('verification/minification-benchmark.json',JSON.stringify(report,null,2)+'\n');
console.table(Object.entries(summary).map(([variant,s])=>({variant,jsKB:(s.jsBytes/1000).toFixed(1),medianMs:s.medianReadyMs.toFixed(1),p95Ms:s.p95ReadyMs.toFixed(1),samples:s.samples,frameCheckpoints:s.frameCheckpoints})));
console.log('Full measurements: verification/minification-benchmark.json');

