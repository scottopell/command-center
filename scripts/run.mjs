import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {configure,root} from './configure.mjs';
const config=configure();process.chdir(root);
const node=(args)=>execFileSync(process.execPath,args,{stdio:'inherit'});
switch(process.argv[2]){
  case 'typecheck':node(['node_modules/typescript/bin/tsc','--project','.generated/tsconfig.json']);break;
  case 'web':node(['scripts/build-web.mjs']);break;
  case 'lint':node(['scripts/check-function-boundaries.mjs']);break;
  case 'test':execFileSync('npm',['run','build:toolchain'],{stdio:'inherit'});node(['--test',...config.testRoots.flatMap(dir=>fs.readdirSync(dir).filter(name=>name.endsWith('.test.ts')).map(name=>path.join(dir,name)))]);break;
  default:throw new Error('Unknown project task');
}
