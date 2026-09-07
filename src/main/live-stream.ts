import {CodexDesktop,type Broadcast} from './codex-ipc';
import {ConversationFeed,type LiveState} from '../core/live-state';
export class LiveTaskStream {
  private ipc:CodexDesktop;
  private feed:ConversationFeed;
  private owner?:string;
  private connected=false;
  private stopped=false;
  private busy=false;
  private nextCheck=0;
  private attempts=0;
  private timer:ReturnType<typeof setInterval>;
  state:LiveState;
  constructor(readonly id:string,private publish:(state:LiveState)=>void,path?:string){
    this.ipc=new CodexDesktop(path);this.feed=new ConversationFeed(id);
    this.state={threadId:id,connection:'connecting',work:'unknown',activity:'none',label:'连接任务状态',updatedAt:Date.now()};
    this.ipc.onBroadcast=m=>this.receive(m);
    this.ipc.onDisconnect=()=>{if(this.stopped)return;this.connected=false;this.owner=undefined;this.nextCheck=Date.now()+Math.min(60000,2000*2**Math.min(this.attempts++,5));this.invalidate('disconnected');};
    this.timer=setInterval(()=>void this.check(),1000);void this.check();
  }
  private invalidate(connection:LiveState['connection']){
    this.feed.reset();this.state={threadId:this.id,connection,work:'unknown',activity:'none',label:connection==='disconnected'?'状态连接中断，自动重连':'正在同步任务状态',updatedAt:Date.now()};this.publish(this.state);
  }
  private receive(m:Broadcast){
    if(this.stopped)return;
    const p=m.params;
    if(m.method==='ipc-connection-reset'||(m.method==='client-status-changed'&&p?.clientId===this.owner&&p.status==='disconnected')){
      this.connected=false;this.owner=undefined;this.invalidate('disconnected');this.ipc.close();this.nextCheck=Date.now()+1000;return;
    }
    if(p?.conversationId!==this.id||p?.hostId!=='local'||m.sourceClientId!==this.owner)return;
    if(m.method==='thread-stream-following-status-requested'){this.ipc.follow(this.id,this.owner);return;}
    if(m.method!=='thread-stream-state-changed')return;
    try{
      if(m.version!==11)throw Error('Unsupported stream version');
      const state=this.feed.accept(p.change);if(state){this.state=state;this.attempts=0;this.nextCheck=Date.now()+15000;this.publish(state);}
    }catch{this.invalidate('connecting');this.nextCheck=Date.now()+3000;}
  }
  private async check(){
    if(this.stopped||this.busy||Date.now()<this.nextCheck)return;
    this.busy=true;
    try{
      if(!this.connected){await this.ipc.connect();if(this.stopped)return;this.connected=true;}
      const owner=await this.ipc.owner(this.id);if(this.stopped)return;
      if(this.owner!==owner||this.feed.revision===undefined){this.owner=owner;this.invalidate('connecting');this.ipc.follow(this.id,owner);this.nextCheck=Date.now()+5000;}
      else this.nextCheck=Date.now()+15000;
    }catch{if(!this.stopped){this.ipc.close();this.nextCheck=Date.now()+Math.min(60000,2000*2**Math.min(this.attempts++,5));}}
    finally{this.busy=false;if(this.stopped)this.ipc.close();}
  }
  stop(){if(this.stopped)return;this.stopped=true;clearInterval(this.timer);if(this.owner){try{this.ipc.follow(this.id,this.owner,false);}catch{}}this.ipc.close();this.feed.reset();}
}
