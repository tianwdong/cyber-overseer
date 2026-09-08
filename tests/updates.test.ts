import {test} from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {compareVersions,RELEASES_URL,selectUpdate,type UpdateState} from '../src/core/updates';
import {fetchGitHubReleases,UpdateChecker,UpdateFetchError} from '../src/main/updates';
function release(number:string,platform='mac',arch='arm64',extra:Record<string,unknown>={}){
 return {tag_name:`v${number}`,draft:false,prerelease:true,html_url:'https://untrusted.example/releases',assets:[{name:platform==='mac'?`Cyber-Overseer-${number}-mac-${arch}.dmg`:`Cyber-Overseer-${number}-windows-${arch}-setup.exe`,state:'uploaded',size:123}],...extra};
}
async function fixture(run:(file:string)=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'overseer-updates-'));try{await run(join(dir,'updates.json'));}finally{await rm(dir,{recursive:true,force:true});}}
function checker(file:string,fetchReleases:()=>Promise<unknown>,now:()=>number=()=>1_000_000,extra:Partial<ConstructorParameters<typeof UpdateChecker>[0]>={}){
 return new UpdateChecker({currentVersion:'0.1.0',platform:'darwin',arch:'arm64',cacheFile:file,onChange:()=>{},fetchReleases,now,...extra});
}
test('update selection compares semantic versions and constructs a repository-only release link',()=>{
 assert.deepEqual(selectUpdate([release('0.1.9'),release('0.1.10')],'0.1.9','darwin','arm64'),{status:'available',release:{version:'0.1.10',url:`${RELEASES_URL}/tag/v0.1.10`,prerelease:true}});
 assert.deepEqual(selectUpdate([release('0.1.10')],'0.2.0','darwin','arm64'),{status:'current'});
 assert.deepEqual(selectUpdate([release('0.1.10')],'0.1.10','darwin','arm64'),{status:'current'});
 assert.equal(compareVersions('99999999999999999999.0.0','99999999999999999998.0.0'),1);
});
test('preview releases are eligible and stable versions sort above the same prerelease',()=>{
 assert.equal(selectUpdate([release('0.2.0-beta.9'),release('0.2.0-beta.10')],'0.2.0-beta.2','darwin','arm64').release?.version,'0.2.0-beta.10');
 assert.equal(selectUpdate([release('0.2.0-beta.10'),release('0.2.0','mac','arm64',{prerelease:false})],'0.2.0-beta.10','darwin','arm64').release?.version,'0.2.0');
 const ordered=['1.0.0-alpha','1.0.0-alpha.1','1.0.0-alpha.beta','1.0.0-beta','1.0.0-beta.2','1.0.0-beta.11','1.0.0-rc.1','1.0.0'];
 for(let i=1;i<ordered.length;i++)assert.equal(compareVersions(ordered[i],ordered[i-1]),1);
 assert.equal(compareVersions('1.0.0+one','1.0.0+two'),0);
 for(const invalid of ['01.0.0','1.0','1.0.0-01','1.0.0/../../other','1.0.0\n','1.0.0-','1.0.0+'])assert.equal(compareVersions(invalid,'1.0.0'),undefined);
});
test('drafts, sources, incomplete uploads, wrong architectures and wrong package versions are ignored',()=>{
 const raw=[release('0.3.0','mac','arm64',{draft:true}),release('0.3.1','mac','arm64',{assets:[]}),release('0.3.2','windows','x64'),release('0.3.3','mac','x64'),release('0.3.4','mac','arm64',{assets:[{name:'Cyber-Overseer-0.3.4-mac-arm64.dmg',state:'new',size:100}]}),release('0.3.5','mac','arm64',{assets:[{name:'Cyber-Overseer-0.3.5-mac-arm64.dmg',state:'uploaded',size:0}]}),release('0.3.6','mac','arm64',{assets:release('0.2.0').assets}),release('0.1.0')];
 assert.deepEqual(selectUpdate(raw,'0.1.0','darwin','arm64'),{status:'current'});
 assert.equal(selectUpdate(raw,'0.1.0','win32','x64').release?.version,'0.3.2');
 assert.deepEqual(selectUpdate(raw.slice(0,-1),'0.1.0','darwin','arm64'),{status:'unsupported'});
 assert.deepEqual(selectUpdate(raw,'0.1.0','linux','x64'),{status:'unsupported'});
 assert.deepEqual(selectUpdate(raw,'0.1.0','darwin','ia32'),{status:'unsupported'});
 assert.deepEqual(selectUpdate([], '0.1.0','darwin','arm64'),{status:'unsupported'});
 assert.deepEqual(selectUpdate({message:'API error'},'0.1.0','darwin','arm64'),{status:'error'});
 assert.deepEqual(selectUpdate([release('../other')],'0.1.0','darwin','arm64'),{status:'unsupported'});
});
test('the published Windows preview does not advertise an update to macOS',()=>{
 const raw=[release('0.1.1','windows','x64'),release('0.1.0')];
 assert.deepEqual(selectUpdate(raw,'0.1.0','darwin','arm64'),{status:'current'});
 assert.equal(selectUpdate(raw,'0.1.0','win32','x64').release?.version,'0.1.1');
});
test('concurrent checks share a request and successful cache survives restart without another request',async()=>fixture(async file=>{
 let calls=0,resolve!:(value:unknown)=>void,started!:()=>void;
 const start=new Promise<void>(done=>{started=done;}),response=new Promise<unknown>(done=>{resolve=done;}),states:UpdateState[]=[];
 const first=checker(file,()=>{calls++;started();return response;},undefined,{onChange:state=>states.push(state)});
 const a=first.check(),b=first.check(true);assert.equal(a,b);await start;assert.equal(calls,1);resolve([release('0.2.0')]);
 assert.equal((await a).status,'available');assert.deepEqual(states.map(state=>state.status),['checking','available']);
 const second=checker(file,async()=>{calls++;return [];});await second.load();assert.deepEqual(second.state,first.state);
 assert.equal((await second.check()).release?.version,'0.2.0');assert.equal(calls,1);
 const exposed=second.state;exposed.release!.url='https://untrusted.example';assert.notEqual(second.state.release?.url,exposed.release!.url);
}));
test('automatic and manual checks throttle failed attempts, including after restart',async()=>fixture(async file=>{
 let now=1_000_000,calls=0;const fetch=async()=>{calls++;throw Error('offline');};
 let instance=checker(file,fetch,()=>now);assert.equal((await instance.check()).status,'error');assert.equal(instance.state.error,'network');assert.equal(instance.state.checkedAt,undefined);
 now+=59_999;await instance.check(true);assert.equal(calls,1);
 instance=checker(file,fetch,()=>now);await instance.load();assert.equal(instance.state.status,'error');assert.equal(instance.state.error,'network');await instance.check(true);assert.equal(calls,1);
 now++;await instance.check(true);assert.equal(calls,2);
 now+=6*60*60*1000-1;await instance.check();assert.equal(calls,2);
 now++;await instance.check();assert.equal(calls,3);
}));
test('network, rate-limit and invalid responses never claim current, and retain a last verified release',async()=>fixture(async file=>{
 let now=1_000_000,value:unknown=[release('0.2.0')],failure:Error|undefined;
 const instance=checker(file,async()=>{if(failure)throw failure;return value;},()=>now);
 await instance.check();const verified=instance.state;
 for(const [error,expected] of [[Error('offline'),'network'],[new UpdateFetchError('rate-limit'),'rate-limit']] as const){
  now+=60_000;failure=error;const result=await instance.check(true);assert.equal(result.status,'error');assert.equal(result.error,expected);assert.deepEqual(result.release,verified.release);assert.equal(result.checkedAt,verified.checkedAt);assert.equal(await instance.claimNotification(),false);
 }
 now+=60_000;failure=undefined;value={message:'not a release list'};assert.equal((await instance.check(true)).error,'invalid-response');
 now+=60_000;value=[release('0.2.1')];assert.equal((await instance.check(true)).release?.version,'0.2.1');assert.equal(instance.state.error,undefined);
}));
test('a cached latest result or update stays failed after restart until a successful retry',async()=>fixture(async file=>{
 let now=1_000_000;
 for(const number of ['0.1.0','0.2.0']){
  let failure=false;
  const instance=checker(file,async()=>{if(failure)throw new UpdateFetchError('rate-limit');return [release(number)];},()=>now);
  await instance.check();const verified=instance.state;now+=60_000;failure=true;await instance.check(true);
  const restarted=checker(file,async()=>[release(number)],()=>now);await restarted.load();
  assert.equal(restarted.state.status,'error');assert.equal(restarted.state.error,'rate-limit');assert.deepEqual(restarted.state.release,verified.release);assert.equal(restarted.state.checkedAt,verified.checkedAt);
  assert.equal(await restarted.claimNotification(),false);assert.equal((await restarted.check(true)).status,'error');
  now+=60_000;assert.equal((await restarted.check(true)).status,verified.status);assert.equal(restarted.state.error,undefined);
 }
}));
test('notification claims persist before success and do not duplicate concurrently or after restart',async()=>fixture(async file=>{
 let now=1_000_000;const first=checker(file,async()=>[release('0.2.0')],()=>now);await first.check();
 assert.deepEqual(await Promise.all([first.claimNotification(),first.claimNotification()]),[true,false]);
 const second=checker(file,async()=>[release('0.2.1')],()=>now);await second.load();assert.equal(await second.claimNotification(),false);
 now+=60_000;await second.check(true);assert.equal(await second.claimNotification(),true);assert.equal(await second.claimNotification(),false);
 const cached=JSON.parse(await readFile(file,'utf8'));assert.equal(cached.lastNotified,'0.2.1');
}));
test('cache write failures preserve check results and cannot claim a saved notification',async()=>fixture(async file=>{
 await mkdir(file);const instance=checker(file,async()=>[release('0.2.0')]);await instance.load();
 assert.equal((await instance.check()).status,'available');assert.equal(await instance.claimNotification(),false);
 await rm(file,{recursive:true});assert.equal(await instance.claimNotification(),true);
}));
test('malformed cache, altered links and other platform or application versions are ignored',async()=>fixture(async file=>{
 const original=checker(file,async()=>[release('0.2.0')]);await original.check();const valid=JSON.parse(await readFile(file,'utf8'));
 const badLink=structuredClone(valid);badLink.lastSuccess.result.release.url='https://untrusted.example';
 const badAsset=structuredClone(valid);badAsset.lastSuccess.releases[0].assets=release('0.2.0','windows','x64').assets;
 const future=structuredClone(valid);future.lastAttemptAt=2_000_000;
 const badVersion=structuredClone(valid);badVersion.lastSuccess.releases[0].tag_name='v0.2.0/other';
 const wrongNotification=structuredClone(valid);wrongNotification.lastNotified='../other';
 for(const data of ['{',JSON.stringify(badLink),JSON.stringify(badAsset),JSON.stringify(future),JSON.stringify(badVersion),JSON.stringify(wrongNotification),JSON.stringify({...valid,platform:'win32'}),JSON.stringify({...valid,arch:'x64'}),JSON.stringify({...valid,currentVersion:'0.0.9'})]){
  await writeFile(file,data);const instance=checker(file,async()=>[release('0.2.0')]);await instance.load();assert.deepEqual(instance.state,{status:'idle',currentVersion:'0.1.0'});assert.equal(await instance.claimNotification(),false);
 }
 await writeFile(file,JSON.stringify(valid));const instance=checker(file,async()=>[]);await instance.load();assert.equal(instance.state.status,'available');
}));
test('the transport sends only the fixed anonymous request and rejects redirects, rate limits and oversized bodies',async t=>{
 let status=200,headers:Record<string,string>={},body:Buffer=Buffer.from('[]'),requests=0;
 t.mock.method(https,'get',((url:unknown,options:{headers:Record<string,string>},callback:(response:unknown)=>void)=>{
  requests++;assert.equal(url,'https://api.github.com/repos/tianwdong/cyber-overseer/releases?per_page=100');
  assert.deepEqual(Object.keys(options.headers).sort(),['Accept','User-Agent','X-GitHub-Api-Version']);
  assert.equal(options.headers['X-GitHub-Api-Version'],'2026-03-10');
  const request=new EventEmitter() as EventEmitter&{destroy:()=>void};request.destroy=()=>{};
  queueMicrotask(()=>{const response=Object.assign(new PassThrough(),{statusCode:status,headers});callback(response);if(!response.destroyed)response.end(body);});return request;
 }) as typeof https.get);
 assert.deepEqual(await fetchGitHubReleases(),[]);
 status=302;headers={location:'https://untrusted.example'};await assert.rejects(fetchGitHubReleases(),{code:'network'});assert.equal(requests,2);
 for(const code of [403,429]){status=code;await assert.rejects(fetchGitHubReleases(),{code:'rate-limit'});}
 status=200;headers={'content-length':String(2*1024*1024+1)};await assert.rejects(fetchGitHubReleases(),{code:'invalid-response'});
 headers={};body=Buffer.alloc(2*1024*1024+1);await assert.rejects(fetchGitHubReleases(),{code:'invalid-response'});
 body=Buffer.from('{');await assert.rejects(fetchGitHubReleases(),{code:'invalid-response'});
});
test('the transport uses a ten-second deadline even when the request never responds',async t=>{
 let destroyed=false;
 t.mock.timers.enable({apis:['setTimeout']});
 t.mock.method(https,'get',(()=>{const request=new EventEmitter() as EventEmitter&{destroy:()=>void};request.destroy=()=>{destroyed=true;};return request;}) as unknown as typeof https.get);
 const pending=fetchGitHubReleases(),rejected=assert.rejects(pending,{code:'network'});
 t.mock.timers.tick(9_999);assert.equal(destroyed,false);t.mock.timers.tick(1);await rejected;assert.equal(destroyed,true);
});
