import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { paths } from './platform';

interface Reply { type:string; requestId:string; resultType?:string; result?:any; error?:string; handledByClientId?:string }
export interface Broadcast {type:'broadcast';method:string;version:number;sourceClientId:string;params:any}
export class OutcomeUnknown extends Error {}
export class DispatchRejected extends Error {}

// Experimental Desktop IPC. No UI scraping, keyboard injection, or new server.
// Wire format and method versions were inspected in Desktop's installed bundle.
export class CodexDesktop {
  onBroadcast?: (message:Broadcast)=>void;
  onDisconnect?: ()=>void;
  private socket?:net.Socket;
  private buffer=Buffer.alloc(0);
  private frame?:Buffer;
  private frameOffset=0;
  private clientId='cyber-overseer';
  private pending=new Map<string,{resolve:(v:Reply)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
  constructor(private path=paths.ipcPath) {}
  async connect() {
    this.close();this.clientId='cyber-overseer';
    if(process.platform==='win32') {
      if(!this.path.startsWith('\\\\.\\pipe\\') || this.path.length<=9 || /[\\/]/.test(this.path.slice(9))) throw new Error('Expected a local Codex named pipe');
    } else {
    const [socket,dir]=await Promise.all([lstat(this.path),lstat(dirname(this.path))]);
    if(!socket.isSocket()||socket.uid!==process.getuid?.()||!dir.isDirectory()||dir.uid!==process.getuid?.()||(dir.mode&0o022)!==0) throw new Error('Untrusted Codex IPC socket');
    }
    const connection=net.createConnection(this.path);this.socket=connection;
    this.buffer=Buffer.alloc(0);this.frame=undefined;this.frameOffset=0;
    connection.on('data',b=>{if(this.socket===connection)this.receive(typeof b==='string'?Buffer.from(b):b);});
    connection.on('error',()=>{if(this.socket===connection)this.fail();});connection.on('close',()=>{if(this.socket===connection)this.fail();});
    await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{this.socket?.destroy();reject(new Error('IPC connection timed out'));},5000);this.socket!.once('connect',()=>{clearTimeout(timer);resolve();});this.socket!.once('error',e=>{clearTimeout(timer);reject(e);});});
    const r=await this.request('initialize',{clientType:'cyber-overseer'},0);
    if(typeof r.result?.clientId!=='string')throw new Error('Incompatible IPC initialize reply');
    this.clientId=r.result.clientId;
  }
  private receive(chunk:Buffer) {
    let offset=0;
    while(offset<chunk.length){
      if(!this.frame){
        const take=Math.min(4-this.buffer.length,chunk.length-offset);
        this.buffer=Buffer.concat([this.buffer,chunk.subarray(offset,offset+take)]);offset+=take;
        if(this.buffer.length<4)return;
        const size=this.buffer.readUInt32LE(0);this.buffer=Buffer.alloc(0);
        // Desktop v11 permits 256 MiB snapshots; long tasks exceed 16 MiB.
        if(size===0||size>256*1024*1024){this.socket?.destroy();return;}
        this.frame=Buffer.allocUnsafe(size);this.frameOffset=0;
      }
      const take=Math.min(this.frame.length-this.frameOffset,chunk.length-offset);
      chunk.copy(this.frame,this.frameOffset,offset,offset+take);this.frameOffset+=take;offset+=take;
      if(this.frameOffset<this.frame.length)return;
      let m:any;try{m=JSON.parse(this.frame.toString());}catch{this.socket?.destroy();return;}
      this.frame=undefined;this.frameOffset=0;
      if(!m||typeof m!=='object'){this.socket?.destroy();return;}
      if(m.type==='broadcast'){this.onBroadcast?.(m);continue;}
      if(m.type==='client-discovery-request'){this.send({type:'client-discovery-response',requestId:m.requestId,response:{canHandle:false}});continue;}
      if(m.type!=='response')continue;
      const pending=this.pending.get(m.requestId);if(!pending)continue;
      clearTimeout(pending.timer);this.pending.delete(m.requestId);
      if(m.resultType==='success')pending.resolve(m);
      else if(m.error==='request-timeout'||m.error==='client-disconnected'||m.error==='server-closed')pending.reject(new OutcomeUnknown(m.error));
      else pending.reject(new DispatchRejected(m.error??'IPC request failed'));
    }
  }
  private send(message:unknown){
    if(!this.socket?.writable)throw new DispatchRejected('Codex IPC not connected');
    const body=Buffer.from(JSON.stringify(message));const frame=Buffer.alloc(body.length+4);frame.writeUInt32LE(body.length);body.copy(frame,4);this.socket.write(frame);
  }
  private request(method:string,params:unknown,version:number,targetClientId?:string):Promise<Reply>{
    const requestId=randomUUID();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(requestId);reject(new OutcomeUnknown('IPC response timed out'));},12000);
      this.pending.set(requestId,{resolve,reject,timer});
      try{this.send({type:'request',requestId,sourceClientId:this.clientId,version,method,params,targetClientId,timeoutMs:10000});}
      catch(e){clearTimeout(timer);this.pending.delete(requestId);reject(e);}
    });
  }
  async owner(threadId:string):Promise<string>{
    const r=await this.request('thread-owner-discovery',{hostId:'local',conversationId:threadId},1);
    if(!r.handledByClientId)throw new Error('Task owner not found');return r.handledByClientId;
  }
  async resume(threadId:string,owner:string,messageId:string){
    await this.request('thread-follower-start-turn',{conversationId:threadId,turnStart:{
      request:{threadId,input:[{type:'text',text:'continue',text_elements:[]}],clientUserMessageId:messageId},context:{inheritThreadSettings:true}
    }},2,owner);
  }
  async compact(threadId:string,owner:string){await this.request('thread-follower-compact-thread',{conversationId:threadId},1,owner);}
  follow(threadId:string,owner:string,following=true){
    this.send({type:'broadcast',method:'thread-stream-following-changed',version:1,sourceClientId:this.clientId,targetClientIds:[owner],params:{hostId:'local',conversationId:threadId,following}});
  }
  private fail(){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(new OutcomeUnknown('IPC disconnected'));}this.pending.clear();this.onDisconnect?.();}
  close(){const old=this.socket;this.socket=undefined;this.frame=undefined;this.buffer=Buffer.alloc(0);old?.destroy();if(old||this.pending.size)this.fail();}
}
