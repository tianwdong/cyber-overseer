import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,open,rename,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {compareVersions,RELEASES_URL,type UpdateState,type UpdateDownload} from '../core/updates';

// Follow only GitHub's HTTPS release-asset redirects, never API-provided URLs.
export async function fetchUpdateAsset(url:string,signal:AbortSignal):Promise<Response>{
 for(let n=0;n<6;n++){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password||u.port||!['github.com','release-assets.githubusercontent.com','objects.githubusercontent.com'].includes(u.hostname))throw Error('Unsafe update redirect');
  const response=await fetch(u,{redirect:'manual',signal});
  if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw Error('Missing redirect');url=new URL(location,u).href;continue;}
  if(!response.ok){await response.body?.cancel();throw Error('Download unavailable');}return response;
 }
 throw Error('Too many redirects');
}
export class UpdateDownloader{
 state?:UpdateDownload;
 private pending?:Promise<void>;
 private path?:string;
 constructor(private options:{directory:string;platform:string;arch:string;onChange:(state:UpdateDownload)=>void;fetchAsset?:typeof fetchUpdateAsset}){}
 private publish(state:UpdateDownload){this.state=state;this.options.onChange({...state});}
 readyPath(version:string){return this.state?.version===version&&this.state.status==='ready'?this.path:undefined;}
 download(release:NonNullable<UpdateState['release']>):Promise<void>{
  if(this.pending)return this.state?.version===release.version?this.pending:this.pending.then(()=>this.download(release));
  this.pending=this.run(release).finally(()=>{this.pending=undefined;});return this.pending;
 }
 private async run(release:NonNullable<UpdateState['release']>){
  const {version}=release;let temporary:string|undefined;this.path=undefined;
  this.publish({version,status:'downloading',received:0});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15*60_000);
  try{
   const {platform,arch,directory}=this.options;
   if(compareVersions(version,version)!==0||!['darwin','win32'].includes(platform)||!['arm64','x64'].includes(arch))throw Error('Unsupported installer');
   const tag=decodeURIComponent(release.url.slice(`${RELEASES_URL}/tag/`.length));
   if(!release.url.startsWith(`${RELEASES_URL}/tag/`)||![version,`v${version}`].includes(tag))throw Error('Invalid release');
   const name=platform==='darwin'?`Cyber-Overseer-${version}-mac-${arch}.dmg`:`Cyber-Overseer-${version}-windows-${arch}-setup.exe`;
   const url=`${RELEASES_URL}/download/${encodeURIComponent(tag)}/${encodeURIComponent(name)}`;
   const request=this.options.fetchAsset??fetchUpdateAsset;
   const checksumResponse=await request(`${url}.sha256`,controller.signal);let checksum='';
   if(!checksumResponse.body)throw Error('Missing checksum');
   for await(const chunk of checksumResponse.body){checksum+=Buffer.from(chunk).toString('utf8');if(checksum.length>4096){controller.abort();throw Error('Invalid checksum');}}
   const match=/^([a-fA-F0-9]{64})\s+\*?(.+?)\s*$/.exec(checksum);
   if(!match||match[2]!==name)throw Error('Invalid checksum');const expected=match[1].toLowerCase();
   await mkdir(directory,{recursive:true,mode:0o700});const target=join(directory,name);
   try{const hash=createHash('sha256');for await(const chunk of createReadStream(target))hash.update(chunk);if(hash.digest('hex')===expected){this.path=target;this.publish({version,status:'ready',received:0});return;}}catch{}
   temporary=join(directory,`${name}.${process.pid}.partial`);await rm(temporary,{force:true});
   const response=await request(url,controller.signal);if(!response.body)throw Error('Empty installer');
   const total=Number(response.headers.get('content-length'))||undefined;
   if(total&&(!Number.isSafeInteger(total)||total<0||total>1024**3))throw Error('Invalid installer size');
   const file=await open(temporary,'wx',0o600),hash=createHash('sha256');let received=0,last=0;
   try{for await(const chunk of response.body){received+=chunk.length;if(received>1024**3)throw Error('Installer too large');hash.update(chunk);await file.writeFile(chunk);if(Date.now()-last>200){last=Date.now();this.publish({version,status:'downloading',received,total});}}await file.sync();}finally{await file.close();}
   this.publish({version,status:'verifying',received,total});
   if(!received||(total&&received!==total)||hash.digest('hex')!==expected)throw Error('Installer verification failed');
   await rm(target,{force:true});await rename(temporary,target);temporary=undefined;this.path=target;this.publish({version,status:'ready',received,total});
  }catch{controller.abort();this.publish({version,status:'error',received:0});}
  finally{clearTimeout(timer);if(temporary)await rm(temporary,{force:true}).catch(()=>{});}
 }
}
