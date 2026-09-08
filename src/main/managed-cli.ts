import {randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {codexBinaryCandidates,findPython,paths} from './platform';
import type {Task} from '../core/model';
import {CliDaemon} from './cli-daemon';
const exec=promisify(execFile);
const root=join(paths.stateDir,'cli-sessions');
export const shellQuote=(value:string)=>"'"+value.replace(/'/g,"'\\''")+"'";
export const powershellQuote=(value:string)=>"'"+value.replace(/'/g,"''")+"'";
export async function launchManagedCli(cwd:string,launcher:string){
 let binary:string|undefined;
 for await(const candidate of codexBinaryCandidates()){
  try{const {stdout}=await exec(candidate,['app-server','--help'],{timeout:8000,windowsHide:true});
   const help=await exec(candidate,['--help'],{timeout:8000,windowsHide:true});
   if(stdout.includes('--ws-token-file')&&help.stdout.includes('--remote-auth-token-env')){binary=candidate;break;}
  }catch{/* Try the next runnable installed CLI. */}
 }
 if(!binary)throw Error('Codex CLI with authenticated --remote support is required / 需要支持 --remote 的新版 Codex CLI。');
 const runtime=await findPython(),dir=join(root,randomUUID());await mkdir(dir,{recursive:true,mode:0o700});
 if(process.platform==='win32'){
  // Remove inherited broad ACLs; retain the current account's full access.
  const script=`$ErrorActionPreference='Stop'; $p=${powershellQuote(dir)}; $a=Get-Acl -LiteralPath $p; $a.SetAccessRuleProtection($true,$false); $r=[System.Security.AccessControl.FileSystemAccessRule]::new([System.Security.Principal.WindowsIdentity]::GetCurrent().User,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $a.AddAccessRule($r); Set-Acl -LiteralPath $p -AclObject $a`;
  await exec('powershell.exe',['-NoProfile','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeout:10000,windowsHide:true});
 }
 const config=join(dir,'launch.json');await writeFile(config,JSON.stringify({binary,cwd,codexHome:paths.codexHome}),{mode:0o600});
 const localLauncher=join(dir,'launcher.py');await writeFile(localLauncher,await readFile(launcher),{mode:0o600});
 const args=[...runtime.args,'-I','-B',localLauncher,config];
 if(process.platform==='win32'){
  const script=join(dir,'start.ps1');await writeFile(script,'\ufeff& '+[runtime.binary,...args].map(powershellQuote).join(' ')+'\n',{mode:0o600});
  const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',script],{detached:true,stdio:'ignore',windowsHide:false});
  await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
 }else if(process.platform==='darwin'){
  const script=join(dir,'start.command');await writeFile(script,'#!/bin/sh\nexec '+[runtime.binary,...args].map(shellQuote).join(' ')+'\n',{mode:0o700});
  await exec('/usr/bin/open',['-a','Terminal',script],{timeout:10000});
 }else throw Error('Managed CLI launch currently supports macOS and Windows');
}
class ManagedCliRegistry{
 private clients=new Map<string,{url:string;client:CliDaemon}>();
 private owners=new Map<string,CliDaemon>();
 tasks:Task[]=[];
 get(id:string){return this.owners.get(id);}
 async scan(){
  let dirs:string[];try{dirs=await readdir(root);}catch{return;}
  const tasks:Task[]=[];
  const owners=new Map<string,CliDaemon>(),duplicates=new Set<string>(),present=new Set<string>();
  await Promise.all(dirs.filter(id=>/^[0-9a-f-]{36}$/.test(id)).map(async id=>{
   try{
    const dir=join(root,id),endpoint=JSON.parse(await readFile(join(dir,'endpoint.json'),'utf8'));
    if(!/^ws:\/\/127\.0\.0\.1:[0-9]+$/.test(endpoint.url))return;
    present.add(id);let entry=this.clients.get(id);
    if(entry?.url!==endpoint.url){entry?.client.close();entry={url:endpoint.url,client:new CliDaemon({endpoint:{url:endpoint.url,token:(await readFile(join(dir,'token'),'utf8')).trim()}})};this.clients.set(id,entry);}
    if(!entry)return;
    for(const taskId of await entry.client.loaded()){
     try{const thread=await entry.client.read(taskId);if(owners.has(taskId))duplicates.add(taskId);else{owners.set(taskId,entry.client);tasks.push({id:taskId,title:thread.name||thread.preview||'Codex CLI',cwd:thread.cwd||'',updatedAt:(thread.updatedAt??0)*1000,status:'unknown'});}}catch{}
    }
   }catch{/* A terminal may be starting, closing, or temporarily unavailable. */}
  }));
  for(const id of duplicates)owners.delete(id);
  for(const [id,entry] of this.clients)if(!present.has(id)){entry.client.close();this.clients.delete(id);}
  this.owners=owners;this.tasks=tasks.filter(t=>!duplicates.has(t.id));
 }
 close(){for(const entry of this.clients.values())entry.client.close();this.clients.clear();this.owners.clear();}
}
export const managedCli=new ManagedCliRegistry();
