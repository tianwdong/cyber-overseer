import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {join} from 'node:path';
import {WebSocketServer} from 'ws';
import {CliDaemon} from '../src/main/cli-daemon';
import {DispatchRejected,OutcomeUnknown} from '../src/main/codex-ipc';
const id='01a076ce-dcdf-7783-ba7d-8b1fa1b48c7d',messageId='01a076ce-dcdf-7783-ba7d-8b1fa1b48c7e';
async function fixture(status='idle',receipt='valid',direct=false,turnStatus='failed'){
 const server=new WebSocketServer({host:'127.0.0.1',port:0});await once(server,'listening');
 const requests:any[]=[];
 let authorization:string|undefined;
 server.on('connection',(ws,request)=>{authorization=request.headers.authorization;ws.on('message',bytes=>{
  const m=JSON.parse(bytes.toString());requests.push(m);if(m.id===undefined)return;
  let result:any={};
  if(m.method==='thread/loaded/list')result={data:[id],nextCursor:null};
  if(m.method==='thread/read')result={thread:{id,status:{type:status},parentThreadId:null}};
  if(m.method==='thread/turns/list')result={data:[{id:'turn-1',status:turnStatus,error:{message:'network error'},completedAt:1}]};
  if(m.method==='thread/queue/add'){
   if(receipt==='disconnect'){ws.close();return;}
   result={queuedSubmission:{id:'queue-1',clientUserMessageId:receipt==='valid'?m.params.clientUserMessageId:'other'}};
  }
  ws.send(JSON.stringify({id:m.id,result}));
 });});
 const port=(server.address() as {port:number}).port;
 const client=new CliDaemon(direct?{endpoint:{url:`ws://127.0.0.1:${port}`,token:'test-token'}}:{candidates:async function*(){yield 'fixture';},spawnProxy:()=>spawn(process.execPath,[join(process.cwd(),'tests/fixtures/cli-proxy.cjs'),String(port)],{stdio:'pipe'})});
 const close=async()=>{client.close();for(const c of server.clients)c.terminate();await new Promise<void>(r=>server.close(()=>r()));};
 return {client,requests,close,authorization:()=>authorization};
}
test('CLI proxy lists loaded tasks then queues exact ID with durable message ID and no settings overrides',async()=>{
 const f=await fixture();try{
  assert.deepEqual([...await f.client.loaded()],[id]);await f.client.queue(id,messageId);
  const request=f.requests.find(r=>r.method==='thread/queue/add');
  assert.deepEqual(request.params,{threadId:id,input:[{type:'text',text:'continue',text_elements:[]}],clientUserMessageId:messageId});
  assert.ok(!f.requests.some(r=>['thread/start','thread/resume','turn/start'].includes(r.method)));
 }finally{await f.close();}
});
test('CLI active, unloaded and invalid identities never receive continue',async()=>{
 for(const status of ['active','notLoaded']){const f=await fixture(status);try{
  await assert.rejects(f.client.queue(id,messageId),DispatchRejected);
  await assert.rejects(f.client.queue('title instead of ID',messageId),DispatchRejected);
  assert.ok(!f.requests.some(r=>r.method==='thread/queue/add'));
 }finally{await f.close();}}
});
test('lost or mismatched queue receipts remain uncertain and are not resent',async()=>{
 for(const receipt of ['disconnect','mismatch']){const f=await fixture('idle',receipt);try{
  await assert.rejects(f.client.queue(id,messageId),OutcomeUnknown);
  assert.equal(f.requests.filter(r=>r.method==='thread/queue/add').length,1);
 }finally{await f.close();}}
});

test('authenticated managed endpoint reads native failure and respects interruption',async()=>{
 for(const status of ['failed','interrupted','completed']){
  const f=await fixture('idle','valid',true,status);try{
   const turn=await f.client.turn(id);
   assert.equal(f.authorization(),'Bearer test-token');
   assert.equal(turn.status,status==='interrupted'?'waiting':status);
   assert.equal(turn.turnId,'turn-1');assert.equal(turn.endedAt,1000);
   assert.ok(!f.requests.some(r=>r.method==='thread/queue/add'));
  }finally{await f.close();}
 }
});
