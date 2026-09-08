import {defaultSettings,type Settings,type RetryProgress} from './settings';
import { randomUUID } from 'node:crypto';
import { isModelAtCapacity, recoveryAction, type TurnState } from './events';
export interface RecoveryContext {episodeId:string;failedTurnId:string;reason:'network'|'compaction'|'capacity'|'unknown'}
// Initial handoff threshold; read-back continues without replaying an uncertain request.
export const confirmationWaitMs=120000;
export interface RecoveryRecord {
  context?:RecoveryContext;
  threadId:string; failedTurnId:string; action:'continue'|'compact'; messageId:string;
  attemptsUsed?:number; recoveryTurnId?:string;
  retryNotBefore?:number; compactionFallback?:boolean;
  phase:'pending'|'sent'|'unknown'|'recovering'|'done'; at:number;
}
export interface RecoveryStore { read(threadId:string):Promise<RecoveryRecord|null>; save(record:RecoveryRecord):Promise<void> }
export interface WatchdogDependencies {
  read(id:string):Promise<TurnState>;
  owner(id:string):Promise<string>;
  send(id:string,owner:string,messageId:string):Promise<void>;
  compact(id:string,owner:string):Promise<void>;
  store:RecoveryStore;
  now:()=>number;
  report:(message:string,action?:string,attempt?:number,context?:RecoveryContext)=>void;
  settings?:()=>Settings;
  progress?:(progress:RetryProgress)=>void;
  allowDispatch?:(state:TurnState)=>boolean;
  definitelyRejected?:(error:unknown)=>boolean;
}
export class Watchdog {
  private inFlight?:Promise<void>;
  private stopped=false;
  private attempts=0;
  private nextAttempt=0;
  private lastLimitNotice='';
  private context?:RecoveryContext;
  private report(message:string,action?:string,attempt?:number){this.d.report(message,action,attempt,this.context);}
  constructor(private id:string,private d:WatchdogDependencies){}
  tick():Promise<void>{
    if(this.inFlight||this.stopped)return Promise.resolve();
    this.inFlight=this.step().catch(e=>{
      this.nextAttempt=this.d.now()+Math.min(300000,5000*3**this.attempts++);
      this.report(`自动恢复等待重试：${e instanceof Error?e.message:'连接失败'}`);
    }).finally(()=>{this.inFlight=undefined;});
    return this.inFlight;
  }
  private limit(){const s=this.d.settings?.()??defaultSettings;return s.retryAfterFailure?s.maxAttempts:1;}
  async stop(){this.stopped=true;await this.inFlight;}
  private async step(){
    const current=await this.d.read(this.id),now=this.d.now();
    let record=await this.d.store.read(this.id);
    this.context=record?.context??(record?{episodeId:record.failedTurnId,failedTurnId:record.failedTurnId,reason:record.action==='compact'?'compaction':'network'}:undefined);
    const limit=this.limit();
    if(this.stopped)return;
    let used=record&&(record.phase!=='done'||current.turnId===record.recoveryTurnId||current.turnId===record.failedTurnId)?record.attemptsUsed??0:0;
    const unconfirmed=['failed','unknown'].includes(current.status)&&record&&record.phase!=='done'&&(!current.turnId||current.turnId===record.failedTurnId)&&now-record.at>=confirmationWaitMs?{since:record.at,episodeId:this.context!.episodeId}:undefined;
    this.d.progress?.({used,limit,exhausted:current.status==='failed'&&used>=limit,...(unconfirmed?{unconfirmed}:{})});
    if(record&&record.phase!=='done'){
      // We never replay an uncertain submission. A new turn is the read-back receipt.
      if(current.turnId&&current.turnId!==record.failedTurnId){
        // A continue may still be doing pre-turn compaction, not productive work.
        if(current.status==='running'&&current.isCompaction){this.report('压缩正在执行，等待结果。');return;}
        if(record.action==='compact'){
          if(current.status==='running'){this.report('压缩正在执行，等待结果。');return;}
          if(current.status==='completed'&&current.isCompaction){
            if(now<this.nextAttempt)return;
            // Finish compaction first, then send continue exactly once.
            const owner=await this.d.owner(this.id),fresh=await this.d.read(this.id);
            if(this.stopped||this.d.allowDispatch?.(fresh)===false||fresh.turnId!==current.turnId||fresh.status!=='completed'||!fresh.isCompaction)return;
            const next:RecoveryRecord={context:this.context,threadId:this.id,failedTurnId:current.turnId,action:'continue',messageId:randomUUID(),phase:'pending',at:now,attemptsUsed:used};
            await this.d.store.save(next);
            if(this.stopped){await this.d.store.save(record);return;}
            try{await this.d.send(this.id,owner,next.messageId);next.phase='sent';await this.d.store.save(next);}
            catch(e){
              if(this.d.definitelyRejected?.(e))await this.d.store.save(record);
              else await this.d.store.save({...next,phase:'unknown'});
              throw e;
            }
            this.report('压缩完成，已自动发送 continue。','continue',used);return;
          }
        }
        record={...record,phase:'done',recoveryTurnId:current.turnId};
        await this.d.store.save(record);
        if(current.status==='completed')this.report('新一轮任务已结束。','completed',used);
        else if(current.status==='waiting')this.report('原任务等待你处理。','waiting',used);
        if(current.status==='running'){this.attempts=0;this.report('已确认原任务恢复执行。','recovered',used);return;}
        // A failed recovery becomes the next failure, with capped backoff.
      }else{
        if(unconfirmed)this.report('恢复结果仍未确认，请查看原任务；督工继续核对，不会重复发送。','unconfirmed',used);
        else if(now-record.at>30000)this.report('提交结果尚未确认，继续读回；不会重复发送同一条指令。','checking',used);
        return;
      }
    }
    if(current.status==='completed'&&used>0){used=0;if(record){record={...record,attemptsUsed:0};await this.d.store.save(record);}this.d.progress?.({used:0,limit,exhausted:false});}
    let action=recoveryAction(current);
    if(!action||now<this.nextAttempt||!current.turnId)return;
    if(used>=limit){
      const notice=`${current.turnId}:${limit}`;
      if(this.lastLimitNotice!==notice){this.lastLimitNotice=notice;this.report(`自动恢复已达上限：${used}/${limit}。等待手动继续或提高次数上限。`,'exhausted');}
      return;
    }
    if(record&&used>0&&(record.action==='compact'||record.compactionFallback||this.context?.reason==='compaction')){
      // Once a confirmed compaction recovery fails, let a normal turn run its
      // own automatic compaction. Persist cooldown from failure, not dispatch.
      const retryNotBefore=record.retryNotBefore??((current.endedAt??now)+Math.min(300000,30000*2**(used-1)));
      if(record.retryNotBefore===undefined){
        record={...record,retryNotBefore,compactionFallback:true};
        await this.d.store.save(record);
      }
      if(now<retryNotBefore)return;
      action='continue';
    }
    // Ignore historical failures when a newer event exists; reducer already selects the latest turn.
    if(current.endedAt&&now-current.endedAt<5000)return;
    const owner=await this.d.owner(this.id),fresh=await this.d.read(this.id);
    if(this.stopped||used>=this.limit()||this.d.allowDispatch?.(fresh)===false||fresh.turnId!==current.turnId||fresh.status!=='failed')return;
    if(!record||used===0)this.context={episodeId:current.turnId,failedTurnId:current.turnId,reason:action==='compact'?'compaction':isModelAtCapacity(current.error??'')?'capacity':'network'};
    this.report('检测到可恢复的任务故障。','failed',used+1);
    const next:RecoveryRecord={context:this.context,threadId:this.id,failedTurnId:current.turnId,action,messageId:randomUUID(),phase:'pending',at:now,attemptsUsed:used+1,compactionFallback:used>0&&record?.compactionFallback};
    await this.d.store.save(next); // Durable before dispatch: crash cannot produce a blind duplicate.
    if(this.stopped||used>=this.limit()){await this.d.store.save({...next,phase:'done',attemptsUsed:used});return;}
    try{
      if(action==='compact')await this.d.compact(this.id,owner);else await this.d.send(this.id,owner,next.messageId);
      next.phase='sent';this.report(action==='compact'?'已自动请求原任务重新压缩。':'已向原任务自动发送 continue。',action,used+1);
    }catch(e){next.phase=this.d.definitelyRejected?.(e)?'done':'unknown';if(next.phase==='done')next.attemptsUsed=used;this.report(next.phase==='done'?'请求未被接收，将自动重试。':'提交未得到确定回执，正在核对原任务。',next.phase==='unknown'?'checking':undefined,used+1);throw e;}
    finally{await this.d.store.save(next);this.nextAttempt=now+Math.min(300000,5000*3**this.attempts++);}
  }
}
