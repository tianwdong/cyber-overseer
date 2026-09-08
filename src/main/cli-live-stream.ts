import {managedCli} from './managed-cli';
import type {LiveState} from '../core/live-state';
export class CliLiveTaskStream {
 state:LiveState;private stopped=false;private busy=false;private timer:ReturnType<typeof setInterval>;
 constructor(readonly id:string,private publish:(s:LiveState)=>void){
  this.state={threadId:id,connection:'connecting',work:'unknown',activity:'none',label:'连接任务状态',updatedAt:Date.now()};
  this.timer=setInterval(()=>void this.check(),3000);void this.check();
 }
 private async check(){
  if(this.stopped||this.busy)return;this.busy=true;
  try{
   const client=managedCli.get(this.id);if(!client)throw Error('CLI terminal not connected');
   const thread=await client.read(this.id),turn=await client.turn(this.id);
   const flags=thread.status.activeFlags??[];
   const work:LiveState['work']=thread.status.type==='active'?(flags.length?'waiting':'running'):turn.status==='failed'?'failed':turn.status==='waiting'?'waiting':'idle';
   const labels={waiting:'等待用户处理',running:'正在工作',failed:'响应中断',idle:'空闲待命'};
   this.state={threadId:this.id,connection:'live',work,activity:turn.isCompaction&&work==='running'?'compacting':'none',label:labels[work],turnId:turn.turnId,updatedAt:Date.now()};
  }catch{this.state={threadId:this.id,connection:'disconnected',work:'unknown',activity:'none',label:'CLI 状态连接中断，自动重连',updatedAt:Date.now()};}
  finally{this.busy=false;if(!this.stopped)this.publish(this.state);}
 }
 stop(){this.stopped=true;clearInterval(this.timer);}
}
