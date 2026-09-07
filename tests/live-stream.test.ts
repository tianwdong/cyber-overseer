import { testIpcPath } from './ipc-fixture';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LiveTaskStream} from '../src/main/live-stream';
const waitFor=async(fn:()=>boolean)=>{const end=Date.now()+7000;while(!fn()){if(Date.now()>end)throw Error('Timed out');await new Promise(r=>setTimeout(r,20));}};
test('large live snapshot filters owner/task, resyncs gaps, reconnects and releases its subscription',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'overseer-stream-')),path=testIpcPath(dir),messages:any[]=[],sockets:net.Socket[]=[];
  const send=(s:net.Socket,m:any)=>{const body=Buffer.from(JSON.stringify(m)),frame=Buffer.alloc(body.length+4);frame.writeUInt32LE(body.length);body.copy(frame,4);s.write(frame);};
  const broadcast=(s:net.Socket,owner:string,id:string,change:any)=>send(s,{type:'broadcast',method:'thread-stream-state-changed',version:11,sourceClientId:owner,params:{hostId:'local',conversationId:id,change}});
  let follows=0;
  const server=net.createServer(s=>{sockets.push(s);let buf=Buffer.alloc(0);s.on('data',b=>{buf=Buffer.concat([buf,Buffer.from(b)]);while(buf.length>=4&&buf.length>=buf.readUInt32LE(0)+4){const len=buf.readUInt32LE(0),m=JSON.parse(buf.subarray(4,len+4).toString());buf=buf.subarray(len+4);messages.push(m);
    if(m.type==='request')send(s,{type:'response',requestId:m.requestId,resultType:'success',handledByClientId:'owner-A',result:m.method==='initialize'?{clientId:'watcher'}:{}});
    if(m.method==='thread-stream-following-changed'&&m.params.following){
      follows++;const snapshot={type:'snapshot',revision:follows===1?1:4,conversationState:{padding:follows===1?'x'.repeat(17*1024*1024):'',id:'task-A',resumeState:'resumed',requests:[],turns:[{turnId:'turn-A',status:'inProgress',items:[{type:'fileChange',status:'inProgress'}]}]}};
      broadcast(s,'wrong-owner','task-A',{...snapshot,revision:99});broadcast(s,'owner-A','wrong-task',snapshot);broadcast(s,'owner-A','task-A',snapshot);
    }
  }});});
  await new Promise<void>(r=>server.listen(path,r));const states:any[]=[];const stream=new LiveTaskStream('task-A',s=>states.push(s),path);
  try{
    await waitFor(()=>stream.state.connection==='live');assert.equal(stream.state.revision,1);assert.equal(stream.state.activity,'files');
    broadcast(sockets[0],'owner-A','task-A',{type:'patches',baseRevision:0,revision:3,patches:[]});
    await waitFor(()=>stream.state.connection==='connecting');await waitFor(()=>stream.state.revision===4);
    sockets[0].destroy();await waitFor(()=>stream.state.connection==='disconnected');
    await waitFor(()=>sockets.length===2&&stream.state.connection==='live');
    assert.equal(stream.state.revision,4);
    stream.stop();await waitFor(()=>messages.some(m=>m.params?.following===false));
    assert.ok(messages.filter(m=>m.type==='broadcast').every(m=>m.method==='thread-stream-following-changed'&&m.targetClientIds[0]==='owner-A'));
    assert.ok(!messages.some(m=>m.method==='thread-follower-start-turn'));
  }finally{stream.stop();sockets.forEach(s=>s.destroy());await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
