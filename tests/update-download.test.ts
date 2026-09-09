import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,rm,readdir,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UpdateDownloader,fetchUpdateAsset} from '../src/main/update-download';
import {RELEASES_URL} from '../src/core/updates';
for(const platform of ['darwin','win32'])test(`installer ${platform}: checksum, coalescing, retry and cached reuse`,async()=>{
 const directory=await mkdtemp(join(tmpdir(),'co-download-'));
 try{
 const name=platform==='darwin'?'Cyber-Overseer-1.0.0-mac-x64.dmg':'Cyber-Overseer-1.0.0-windows-x64-setup.exe';
 const bytes=Buffer.from('verified installer'),hash=createHash('sha256').update(bytes).digest('hex');let corrupt=true,calls=0;
 const options={directory,platform,arch:'x64',onChange:()=>{},fetchAsset:async(url:string)=>{if(url.endsWith('.sha256'))return new Response(`${hash}  ${name}\n`);calls++;return new Response(corrupt?'bad':bytes,{headers:{'content-length':String(corrupt?3:bytes.length)}});}};
 const release={version:'1.0.0',url:`${RELEASES_URL}/tag/v1.0.0`,prerelease:false},d=new UpdateDownloader(options);
 const a=d.download(release);assert.equal(a,d.download(release));await a;
 assert.equal(d.state?.status,'error');assert.equal(d.readyPath(release.version),undefined);assert.deepEqual(await readdir(directory),[]);
 corrupt=false;await d.download(release);assert.equal(d.state?.status,'ready');assert.deepEqual(await readFile(d.readyPath(release.version)!),bytes);
 const restarted=new UpdateDownloader(options);await restarted.download(release);assert.equal(restarted.state?.status,'ready');assert.equal(calls,2);
 await restarted.download({...release,url:'https://evil.example/tag/v1.0.0'});assert.equal(restarted.state?.status,'error');assert.equal(calls,2);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('download transport rejects external and non-HTTPS destinations before fetching',async()=>{
 for(const url of ['http://github.com/a','https://example.com/a','https://github.com:444/a','https://user:pass@github.com/a'])await assert.rejects(fetchUpdateAsset(url,new AbortController().signal));
});
