import {spawn} from 'node:child_process';
export async function run(command:string,args:string[],options:{cwd?:string;timeout?:number}={}){
  return new Promise<string>((resolve,reject)=>{
    const child=spawn(command,args,{cwd:options.cwd,stdio:['ignore','pipe','pipe']});let output='',error='';
    const timer=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Pack operation exceeded its deadline'));},options.timeout??60000);
    child.stdout.on('data',chunk=>{output=(output+chunk).slice(-1024*1024);});child.stderr.on('data',chunk=>{error=(error+chunk).slice(-65536);});
    child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',code=>{clearTimeout(timer);code===0?resolve(output):reject(new Error((error||output||`Pack command exited ${code}`).slice(-16384)));});
  });
}
