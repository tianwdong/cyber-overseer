import {spawn,type ChildProcessWithoutNullStreams} from 'node:child_process';
import {Duplex} from 'node:stream';
import WebSocket from 'ws';
import {codexBinaryCandidates} from './platform';
import {DispatchRejected,OutcomeUnknown} from './codex-ipc';
const uuid=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export interface CliThread {id:string;name?:string|null;preview?:string;cwd?:string;updatedAt?:number;parentThreadId?:string|null;status:{type:string;activeFlags?:string[]}}
// The official proxy connects to an existing daemon; it never starts or resumes a thread.
export class CliDaemon {
 constructor(private options:{endpoint?:{url:string;token:string};candidates?:()=>AsyncIterable<string>;spawnProxy?:(binary:string)=>ChildProcessWithoutNullStreams}={}){}
 private ws?:WebSocket;private child?:ChildProcessWithoutNullStreams;private connecting?:Promise<void>;private nextConnect=0;private serial=0;
 private pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
 private fail(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new OutcomeUnknown('CLI connection lost'));}this.pending.clear();}
 close(){const ws=this.ws;this.ws=undefined;ws?.terminate();this.child?.kill();this.child=undefined;this.fail();}
 async connect(){
  if(this.connecting)return this.connecting;
  if(this.ws?.readyState===WebSocket.OPEN)return;
  if(Date.now()<this.nextConnect)throw new Error('CLI daemon unavailable; retrying');
  this.connecting=(async()=>{
   for await(const binary of (this.options.endpoint?async function*(){yield '';}:this.options.candidates??codexBinaryCandidates)()){
    try{
     let ws:WebSocket;
     if(this.options.endpoint){
      const {url,token}=this.options.endpoint;
      if(!/^ws:\/\/127\.0\.0\.1:[0-9]+\/?$/.test(url)||!token)throw Error('Invalid managed CLI endpoint');
      ws=new WebSocket(url,{headers:{Authorization:`Bearer ${token}`},handshakeTimeout:8000,maxPayload:8*1024*1024});
     }else{
      const child=this.options.spawnProxy?.(binary)??spawn(binary,['app-server','proxy'],{stdio:'pipe',windowsHide:true});this.child=child;
      child.stderr.resume();child.stdin.on('error',()=>{});
      const socket=new Duplex({read(){child.stdout.resume();},write(chunk,encoding,callback){child.stdin.write(chunk,encoding,callback);},final(callback){child.stdin.end(callback);}});
      child.stdout.on('data',chunk=>{if(!socket.push(chunk))child.stdout.pause();});child.stdout.on('end',()=>socket.push(null));child.stdout.on('error',error=>socket.destroy(error));
      ws=new WebSocket('ws://localhost/',{createConnection:()=>socket as any,handshakeTimeout:8000,maxPayload:8*1024*1024});
      child.on('error',()=>ws.terminate());child.on('exit',()=>ws.terminate());
     }
     this.ws=ws;
     ws.on('error',()=>{});ws.on('close',()=>{if(this.ws===ws){this.close();this.nextConnect=Date.now()+15000;}});
     ws.on('message',data=>{let m:any;try{m=JSON.parse(data.toString());}catch{ws.terminate();return;}
      if(m.method)return;
      const p=this.pending.get(m.id);if(!p)return;clearTimeout(p.timer);this.pending.delete(m.id);
      m.error?p.reject(new DispatchRejected(`CLI RPC ${m.error.code}: ${String(m.error.message).slice(0,300)}`)):p.resolve(m.result);
     });
     await new Promise<void>((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);ws.once('close',()=>reject(new Error('CLI proxy closed')));});
     await this.request('initialize',{clientInfo:{name:'cyber-overseer',version:'0.1.11'},capabilities:{experimentalApi:true}});
     ws.send(JSON.stringify({method:'initialized'}));this.nextConnect=0;return;
    }catch{this.close();}
   }
   this.nextConnect=Date.now()+30000;throw new Error('No compatible running CLI daemon');
  })().finally(()=>{this.connecting=undefined;});
  return this.connecting;
 }
 private request(method:string,params:unknown):Promise<any>{
  if(this.ws?.readyState!==WebSocket.OPEN)return Promise.reject(new DispatchRejected('CLI not connected'));
  const id=++this.serial;return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(new OutcomeUnknown('CLI response timed out'));},12000);
   this.pending.set(id,{resolve,reject,timer});
   try{this.ws!.send(JSON.stringify({id,method,params}));}catch{clearTimeout(timer);this.pending.delete(id);reject(new OutcomeUnknown('CLI send outcome unknown'));}
  });
 }
 async loaded():Promise<Set<string>>{
  await this.connect();const ids=new Set<string>();let cursor:string|null=null;const seen=new Set<string>();
  do{const result=await this.request('thread/loaded/list',{cursor,limit:100});
   if(!Array.isArray(result?.data))throw Error('Invalid CLI thread list');
   for(const id of result.data)if(typeof id==='string'&&uuid.test(id))ids.add(id);
   cursor=result.nextCursor??null;if(seen.size>=100)throw Error('CLI list pagination exceeded');if(cursor&&seen.has(cursor))throw Error('Repeated CLI cursor');if(cursor)seen.add(cursor);
  }while(cursor);return ids;
 }
 async read(id:string):Promise<CliThread>{
  if(!uuid.test(id))throw new DispatchRejected('Invalid CLI task ID');await this.connect();
  const {thread}=await this.request('thread/read',{threadId:id,includeTurns:false});
  if(thread?.id!==id||thread.parentThreadId||!['idle','active','systemError'].includes(thread.status?.type))throw new DispatchRejected('CLI task is not a loaded root task');
  return thread;
 }
 async turn(id:string):Promise<import('../core/events').TurnState>{
  const thread=await this.read(id);
  const result=await this.request('thread/turns/list',{threadId:id,limit:1,sortDirection:'desc',itemsView:'summary'});
  if(!Array.isArray(result?.data))throw Error('Invalid CLI turns');
  const turn=result.data[0];
  if(!turn)return {status:thread.status.type==='active'?'running':'unknown'};
  const status:import('../core/model').Task['status']=thread.status.type==='active'?(thread.status.activeFlags?.length?'waiting':'running'):turn.status==='failed'?'failed':turn.status==='completed'?'completed':turn.status==='interrupted'?'waiting':'unknown';
  const items=Array.isArray(turn.items)?turn.items:[],last=[...items].reverse().find((item:any)=>item.type==='agentMessage');
  return {status,turnId:turn.id,isCompaction:items.some((item:any)=>item.type==='contextCompaction'),resultExcerpt:typeof last?.text==='string'?last.text.slice(0,1600):undefined,error:turn.error?.message,errorCode:typeof turn.error?.codexErrorInfo==='string'?turn.error.codexErrorInfo:undefined,endedAt:turn.completedAt?turn.completedAt*1000:undefined};
 }
 async queue(id:string,messageId:string){
  const thread=await this.read(id);
  if(!['idle','systemError'].includes(thread.status.type))throw new DispatchRejected('CLI task is busy or awaiting input');
  const r=await this.request('thread/queue/add',{threadId:id,input:[{type:'text',text:'continue',text_elements:[]}],clientUserMessageId:messageId});
  if(r?.queuedSubmission?.clientUserMessageId!==messageId||typeof r.queuedSubmission.id!=='string')throw new OutcomeUnknown('CLI queue receipt mismatch');
 }
}
export const cliDaemon=new CliDaemon();
