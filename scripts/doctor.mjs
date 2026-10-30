import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {assertRuntime,manifest,root,xcodegenPath} from './toolchain.mjs';

// REQ-FF-012: preflight performs reads only and never installs or starts a service.
let failures=0;
function check(name,work){try{console.log(`OK ${name}: ${work()}`);}catch(error){failures++;console.error(`FAIL ${name}: ${error.message}`);}}
check('Node',()=>{assertRuntime();return process.versions.node;});
check('npm',()=>{const version=execFileSync('npm',['--version'],{encoding:'utf8'}).trim();if(version!==manifest.engines.npm)throw new Error(`Use npm ${manifest.engines.npm}; found ${version}. Node ${manifest.engines.node} ships the expected npm.`);return version;});
check('macOS',()=>{if(process.platform!=='darwin')throw new Error('The native app requires macOS.');const version=execFileSync('/usr/bin/sw_vers',['-productVersion'],{encoding:'utf8'}).trim();if(Number(version.split('.')[0])<14)throw new Error('macOS 14 or newer is required.');return `${version} (${process.arch})`;});
check('Xcode',()=>{const selected=execFileSync('/usr/bin/xcode-select',['-p'],{encoding:'utf8'}).trim();if(!selected.includes('.app/Contents/Developer'))throw new Error('Select full Xcode, not Command Line Tools: open Xcode once, then use Xcode → Settings → Locations → Command Line Tools.');return execFileSync('/usr/bin/xcodebuild',['-version'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().replaceAll('\n','; ');});
check('XcodeGen',()=>xcodegenPath());
check('dependency lock',()=>{const lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json'),'utf8'));for(const kind of ['dependencies','devDependencies'])for(const [name,version]of Object.entries(manifest[kind]))if(lock.packages['node_modules/'+name]?.version!==version)throw new Error(`${name} differs from package-lock.json. Use npm ci with the committed lock.`);return 'direct versions match package-lock.json';});
console.log('Allium is optional: npm run check:specs is separate from app verification.');
if(failures)process.exitCode=1;
