import { testIpcPath } from './ipc-fixture';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexDesktop } from '../src/main/codex-ipc';
test('Desktop wire protocol discovers exact owner, continues and compacts through it',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'overseer-ipc-')),path=testIpcPath(dir);
  const requests:any[]=[];const sockets:net.Socket[]=[];
  const server=net.createServer(s=>{sockets.push(s);let buffer=Buffer.alloc(0);s.on('data',b=>{buffer=Buffer.concat([buffer,typeof b==='string'?Buffer.from(b):b]);while(buffer.length>=4&&buffer.length>=buffer.readUInt32LE(0)+4){const size=buffer.readUInt32LE(0),m=JSON.parse(buffer.subarray(4,size+4).toString());buffer=buffer.subarray(size+4);requests.push(m);const result=m.method==='initialize'?{clientId:'overseer-client'}:m.method==='thread-owner-discovery'?{supportsUntrustedAppInput:true}:{result:{ok:true}};const body=Buffer.from(JSON.stringify({type:'response',requestId:m.requestId,resultType:'success',handledByClientId:'owner-A',result}));const frame=Buffer.alloc(body.length+4);frame.writeUInt32LE(body.length);body.copy(frame,4);s.write(frame.subarray(0,3));s.write(frame.subarray(3));}});});
  await new Promise<void>(r=>server.listen(path,r));const client=new CodexDesktop(path);
  try{await client.connect();const owner=await client.owner('task-A');await client.resume('task-A',owner,'receipt-1');await client.compact('task-A',owner);
    assert.deepEqual(requests.map(r=>[r.method,r.version]),[['initialize',0],['thread-owner-discovery',1],['thread-follower-start-turn',2],['thread-follower-compact-thread',1]]);
    const send=requests[2];assert.equal(send.targetClientId,'owner-A');assert.equal(send.params.conversationId,'task-A');assert.equal(send.params.turnStart.request.threadId,'task-A');assert.equal(send.params.turnStart.request.input[0].text,'continue');assert.equal(send.params.turnStart.context.inheritThreadSettings,true);assert.equal(send.params.turnStart.request.model,undefined);assert.equal(send.params.turnStart.request.approvalPolicy,undefined);
  }finally{client.close();sockets.forEach(s=>s.destroy());await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
