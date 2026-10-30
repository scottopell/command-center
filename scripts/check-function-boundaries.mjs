import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {configure} from './configure.mjs';
// REQ-FF-006: conservative source guard, not a sandbox. Realms supply disposal isolation.
export function inspectFunction(source,file='function.tsx') {
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),errors=[];
  const fail=(node,message)=>{const {line}=ast.getLineAndCharacterOfPosition(node.getStart(ast));errors.push(`${file}:${line+1}: ${message}`);};
  function mutableInitializer(node) {
    return !node || ![ts.SyntaxKind.StringLiteral,ts.SyntaxKind.NumericLiteral,ts.SyntaxKind.TrueKeyword,ts.SyntaxKind.FalseKeyword,ts.SyntaxKind.NullKeyword].includes(node.kind);
  }
  function literal(node,depth=0) {
    if(depth>8)return false;
    if(!mutableInitializer(node))return true;
    if(ts.isArrayLiteralExpression(node))return node.elements.every(x=>literal(x,depth+1));
    if(ts.isObjectLiteralExpression(node))return node.properties.every(x=>ts.isPropertyAssignment(x)&&!ts.isComputedPropertyName(x.name)&&literal(x.initializer,depth+1));
    return false;
  }
  for(const statement of ast.statements) {
    if(ts.isVariableStatement(statement)) {
      const declarations=statement.declarationList;
      if(!(declarations.flags&ts.NodeFlags.Const))fail(statement,'Module state must not use let or var');
      for(const d of declarations.declarations) {
        const init=d.initializer;
        const definition=init&&ts.isCallExpression(init)&&ts.isIdentifier(init.expression)&&['defineFunction','defineScreen','defineScreens'].includes(init.expression.text);
        const frozen=init&&ts.isCallExpression(init)&&init.expression.getText(ast)==='Object.freeze'&&init.arguments.length===1&&literal(init.arguments[0]);
        if(!definition&&!frozen&&mutableInitializer(init))fail(d,'Keep invocation data inside resolve/View; module constants must be primitives or frozen literal metadata');
      }
    } else if(ts.isExpressionStatement(statement))fail(statement,'Top-level side effects are forbidden in function views');
  }
  function visit(node) {
    if(ts.isIdentifier(node)&&['globalThis','window','document','localStorage','sessionStorage'].includes(node.text))fail(node,'Use component refs and platform clients, not global invocation state');
    ts.forEachChild(node,visit);
  }
  visit(ast);return errors;
}
if(import.meta.url===pathToFileURL(process.argv[1]).href) {
  let errors=[];for(const directory of configure().functionRoots)for(const entry of await readdir(directory,{withFileTypes:true}))if(entry.isDirectory()){const file=path.join(directory,entry.name,'ui.tsx');try{errors.push(...inspectFunction(await readFile(file,'utf8'),file));}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Function lifetime guards passed');
}
