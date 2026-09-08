import https from 'node:https';
import {readFile,mkdir,open,rename,rm,stat} from 'node:fs/promises';
import {dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {compareVersions,parseUpdateReleases,selectUpdate,type UpdateRelease,type UpdateState} from '../core/updates';
const API_URL='https://api.github.com/repos/tianwdong/cyber-overseer/releases?per_page=100';
const MAX_BYTES=2*1024*1024,AUTO_INTERVAL=6*60*60*1000,MANUAL_INTERVAL=60*1000;
type UpdateError=NonNullable<UpdateState['error']>;
export class UpdateFetchError extends Error {constructor(readonly code:UpdateError){super(code);}}
export function fetchGitHubReleases():Promise<unknown> {
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=(error?:UpdateFetchError,value?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);};
  // node:https does not follow redirects, so all requests stay on this fixed anonymous endpoint.
  const request=https.get(API_URL,{headers:{Accept:'application/vnd.github+json','User-Agent':'Cyber-Overseer','X-GitHub-Api-Version':'2026-03-10'}},response=>{
   if(response.statusCode!==200){finish(new UpdateFetchError(response.statusCode===403||response.statusCode===429?'rate-limit':'network'));response.destroy();return;}
   if(Number(response.headers['content-length'])>MAX_BYTES){finish(new UpdateFetchError('invalid-response'));response.destroy();return;}
   const chunks:Buffer[]=[];let size=0;
   response.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>MAX_BYTES){finish(new UpdateFetchError('invalid-response'));response.destroy();}else chunks.push(chunk);});
   response.on('error',()=>finish(new UpdateFetchError('network')));
   response.on('aborted',()=>finish(new UpdateFetchError('network')));
   response.on('end',()=>{try{finish(undefined,JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{finish(new UpdateFetchError('invalid-response'));}});
  });
  const timer=setTimeout(()=>{request.destroy();finish(new UpdateFetchError('network'));},10_000);
  request.on('error',()=>finish(new UpdateFetchError('network')));
 });
}
interface SuccessfulCheck {checkedAt:number;releases:UpdateRelease[];result:Pick<UpdateState,'status'|'release'>}
interface CheckerOptions {
 currentVersion:string;platform:string;arch:string;cacheFile:string;
 onChange:(state:UpdateState)=>void;
 fetchReleases?:()=>Promise<unknown>;now?:()=>number;
}
export class UpdateChecker {
 private value:UpdateState;private lastAttemptAt?:number;private lastSuccess?:SuccessfulCheck;private lastNotified?:string;private lastError?:UpdateError;
 private pending?:Promise<UpdateState>;private writes:Promise<void>=Promise.resolve();
 private fetch:()=>Promise<unknown>;private now:()=>number;
 constructor(private options:CheckerOptions){this.value={currentVersion:options.currentVersion,status:'idle'};this.fetch=options.fetchReleases??fetchGitHubReleases;this.now=options.now??Date.now;}
 get state():UpdateState{return {...this.value,...(this.value.release?{release:{...this.value.release}}:{})};}
 private publish(state:UpdateState){this.value=state;try{this.options.onChange(this.state);}catch{/* A UI listener must not break monitoring or cache writes. */}}
 async load():Promise<void> {
  try{
   if((await stat(this.options.cacheFile)).size>MAX_BYTES)return;
   const data=JSON.parse(await readFile(this.options.cacheFile,'utf8')),now=this.now();
   if(!data||data.schema!==1||data.currentVersion!==this.options.currentVersion||data.platform!==this.options.platform||data.arch!==this.options.arch)return;
   const validTime=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=now;
   if(data.lastAttemptAt!==undefined&&!validTime(data.lastAttemptAt))return;
   if(data.lastNotified!==undefined&&(typeof data.lastNotified!=='string'||compareVersions(data.lastNotified,data.lastNotified)!==0))return;
   if(data.lastError!==undefined&&(!['network','rate-limit','invalid-response'].includes(data.lastError)||data.lastAttemptAt===undefined))return;
   let success:SuccessfulCheck|undefined;
   if(data.lastSuccess!==undefined){
    const cached=data.lastSuccess;if(!cached||!validTime(cached.checkedAt))return;
    const releases=parseUpdateReleases(cached.releases);if(!releases)return;
    const result=selectUpdate(releases,this.options.currentVersion,this.options.platform,this.options.arch);
    if(result.status==='error'||!this.sameResult(cached.result,result))return;
    success={checkedAt:cached.checkedAt,releases,result};
   }
   this.lastAttemptAt=data.lastAttemptAt;this.lastNotified=data.lastNotified;this.lastSuccess=success;this.lastError=data.lastError;
   if(this.lastError)this.publish({currentVersion:this.options.currentVersion,status:'error',error:this.lastError,...(success?{checkedAt:success.checkedAt,...(success.result.release?{release:success.result.release}:{})}:{})});
   else if(success)this.publish({currentVersion:this.options.currentVersion,...success.result,checkedAt:success.checkedAt});
  }catch{/* Missing, invalid, or unreadable update cache must never affect the watchdog. */}
 }
 private sameResult(cached:unknown,result:SuccessfulCheck['result']):boolean {
  if(!cached||typeof cached!=='object')return false;
  const value=cached as UpdateState;
  if(value.status!==result.status)return false;
  if(!result.release)return value.release===undefined;
  return value.release?.version===result.release.version&&value.release.url===result.release.url&&value.release.prerelease===result.release.prerelease;
 }
 check(manual=false):Promise<UpdateState> {
  if(this.pending)return this.pending;
  const now=this.now(),interval=manual?MANUAL_INTERVAL:AUTO_INTERVAL;
  if(this.lastAttemptAt!==undefined&&now>=this.lastAttemptAt&&now-this.lastAttemptAt<interval)return Promise.resolve(this.state);
  this.lastAttemptAt=now;
  this.pending=this.performCheck().finally(()=>{this.pending=undefined;});return this.pending;
 }
 private async performCheck():Promise<UpdateState> {
  this.publish({currentVersion:this.options.currentVersion,status:'checking',...(this.value.release?{release:this.value.release}:{}),...(this.value.checkedAt===undefined?{}:{checkedAt:this.value.checkedAt})});
  await this.persist().catch(()=>{});
  try{
   const releases=parseUpdateReleases(await this.fetch());if(!releases)throw new UpdateFetchError('invalid-response');
   const result=selectUpdate(releases,this.options.currentVersion,this.options.platform,this.options.arch);
   if(result.status==='error')throw new UpdateFetchError('invalid-response');
   const checkedAt=this.now();this.lastSuccess={checkedAt,releases,result};this.lastError=undefined;
   this.publish({currentVersion:this.options.currentVersion,...result,checkedAt});
  }catch(error){
   this.lastError=error instanceof UpdateFetchError?error.code:'network';
   this.publish({currentVersion:this.options.currentVersion,status:'error',error:this.lastError,...(this.value.release?{release:this.value.release}:{}),...(this.value.checkedAt===undefined?{}:{checkedAt:this.value.checkedAt})});
  }
  await this.persist().catch(()=>{});return this.state;
 }
 claimNotification():Promise<boolean> {
  return this.enqueue(async()=>{
   const release=this.value.status==='available'?this.value.release:undefined;
   if(!release||(this.lastNotified!==undefined&&compareVersions(release.version,this.lastNotified)!<=0))return false;
   try{await this.writeCache(release.version);this.lastNotified=release.version;return true;}catch{return false;}
  });
 }
 private enqueue<T>(operation:()=>Promise<T>):Promise<T>{const result=this.writes.then(operation);this.writes=result.then(()=>{},()=>{});return result;}
 private persist():Promise<void>{return this.enqueue(()=>this.writeCache());}
 private async writeCache(lastNotified=this.lastNotified):Promise<void> {
  const file=this.options.cacheFile,temp=`${file}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  const data={schema:1,currentVersion:this.options.currentVersion,platform:this.options.platform,arch:this.options.arch,lastAttemptAt:this.lastAttemptAt,lastSuccess:this.lastSuccess,lastNotified,lastError:this.lastError};
  try{const handle=await open(temp,'wx',0o600);try{await handle.writeFile(JSON.stringify(data));await handle.sync();}finally{await handle.close();}await rename(temp,file);}
  finally{await rm(temp,{force:true}).catch(()=>{});}
 }
}
