import {permitsRecovery} from '../src/core/live-state';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Watchdog, type RecoveryRecord, type WatchdogDependencies } from '../src/core/watchdog';
import type { TurnState } from '../src/core/events';
function harness(initial:TurnState={status:'failed',turnId:'old',error:'stream disconnected before completion: network error',endedAt:1000}){
  let state=initial,record:RecoveryRecord|null=null,now=10000;
  const calls:string[]=[],messages:string[]=[];
  const d:WatchdogDependencies={read:async()=>state,owner:async()=>{calls.push('owner');return 'exact-owner';},send:async(id,o)=>{assert.equal(id,'task-A');assert.equal(o,'exact-owner');calls.push('continue');},compact:async()=>{calls.push('compact');},now:()=>now,report:m=>messages.push(m),store:{read:async()=>record,save:async r=>{record={...r};}}};
  return {d,calls,messages,setState:(v:TurnState)=>state=v,setTime:(v:number)=>now=v,record:()=>record,watch:()=>new Watchdog('task-A',d)};
}
test('terminal network failure automatically continues exactly the selected task',async()=>{const h=harness(),w=h.watch();await w.tick();await w.tick();assert.deepEqual(h.calls,['owner','continue']);assert.equal(h.record()?.phase,'sent');});
test('in-progress internal retry does not send; terminal cooldown is respected',async()=>{const h=harness({status:'running',turnId:'t'}),w=h.watch();await w.tick();assert.equal(h.calls.length,0);h.setState({status:'failed',turnId:'t',error:'network error',endedAt:9000});await w.tick();assert.equal(h.calls.length,0);h.setTime(16000);await w.tick();assert.ok(h.calls.includes('continue'));});
test('fresh-state recheck cancels a plan if user resumed meanwhile',async()=>{const h=harness();let reads=0;const orig=h.d.read;h.d.read=async()=>++reads===1?orig('task-A'):{status:'running',turnId:'manual-new'};await h.watch().tick();assert.deepEqual(h.calls,['owner']);});
test('durable pending receipt prevents duplicate after restart',async()=>{const h=harness();await h.watch().tick();await h.watch().tick();assert.equal(h.calls.filter(x=>x==='continue').length,1);});
test('uncertain send is reconciled rather than blindly repeated',async()=>{const h=harness();h.d.send=async()=>{h.calls.push('continue');throw new Error('connection lost after write');};const w=h.watch();await w.tick();h.setTime(100000);await w.tick();assert.equal(h.calls.filter(x=>x==='continue').length,1);assert.equal(h.record()?.phase,'unknown');h.setState({status:'running',turnId:'new'});await w.tick();assert.equal(h.record()?.phase,'done');});
test('compaction automatically precedes continue, after verified compaction completion',async()=>{const h=harness({status:'failed',turnId:'old',error:'context window exceeded',endedAt:1000}),w=h.watch();await w.tick();assert.deepEqual(h.calls,['owner','compact']);h.setState({status:'running',turnId:'compact-turn',isCompaction:true});await w.tick();assert.equal(h.calls.length,2);h.setState({status:'completed',turnId:'compact-turn',isCompaction:true});h.setTime(16000);await w.tick();assert.deepEqual(h.calls,['owner','compact','owner','continue']);});
test('manual task completion is never mistaken for successful compaction',async()=>{const h=harness({status:'failed',turnId:'old',error:'context window exceeded'}),w=h.watch();await w.tick();h.setState({status:'completed',turnId:'manual-turn'});await w.tick();assert.deepEqual(h.calls,['owner','compact']);});
test('stop during an async owner lookup prevents subsequent sending',async()=>{const h=harness(),w=h.watch();h.d.owner=async()=>{w.stop();return'exact-owner';};await w.tick();assert.ok(!h.calls.includes('continue'));});
test('parallel timer ticks cannot send duplicates',async()=>{const h=harness(),w=h.watch();await Promise.all([w.tick(),w.tick(),w.tick()]);assert.equal(h.calls.filter(x=>x==='continue').length,1);});
test('failed recovery turns are retried with backoff',async()=>{const h=harness(),w=h.watch();await w.tick();h.setState({status:'failed',turnId:'next',error:'network error',endedAt:10000});await w.tick();assert.equal(h.calls.filter(x=>x==='continue').length,1);h.setTime(30000);await w.tick();assert.equal(h.calls.filter(x=>x==='continue').length,2);});

test('definite rejection is automatically retried after backoff',async()=>{const h=harness();let fail=true;h.d.definitelyRejected=e=>e==='rejected';h.d.send=async()=>{h.calls.push('continue');if(fail)throw'rejected';};const w=h.watch();await w.tick();assert.equal(h.record()?.phase,'done');fail=false;h.setTime(100000);await w.tick();assert.equal(h.calls.filter(x=>x==='continue').length,2);assert.equal(h.record()?.phase,'sent');});
test('rejected continue after compaction is also retried automatically',async()=>{const h=harness({status:'failed',turnId:'old',error:'context window exceeded'});h.d.definitelyRejected=e=>e==='rejected';const w=h.watch();await w.tick();h.setState({status:'completed',turnId:'compacted',isCompaction:true});h.setTime(20000);let fail=true;h.d.send=async()=>{h.calls.push('continue');if(fail)throw'rejected';};await w.tick();assert.equal(h.record()?.action,'compact');fail=false;h.setTime(100000);await w.tick();assert.equal(h.calls.filter(x=>x==='continue').length,2);assert.equal(h.record()?.phase,'sent');});
test('stop while durable receipt is being saved cancels dispatch',async()=>{const h=harness(),w=h.watch(),save=h.d.store.save;h.d.store.save=async r=>{await save(r);if(r.phase==='pending')void w.stop();};await w.tick();assert.ok(!h.calls.includes('continue'));assert.equal(h.record()?.phase,'done');});
test('live state veto prevents dispatch without creating a recovery receipt',async()=>{const h=harness();h.d.allowDispatch=()=>false;await h.watch().tick();assert.deepEqual(h.calls,['owner']);assert.equal(h.record(),null);});
test('three attempts survive running acknowledgements and watchdog restarts',async()=>{
  const h=harness();let w=h.watch();
  for(let attempt=1;attempt<=3;attempt++){
    h.setTime(attempt*100000);await w.tick();assert.equal(h.record()?.attemptsUsed,attempt);
    h.setState({status:'running',turnId:`recovery-${attempt}`});await w.tick();
    w=h.watch();h.setState({status:'failed',turnId:`recovery-${attempt}`,error:'network error',endedAt:1000});
  }
  h.setTime(1000000);await w.tick();await h.watch().tick();
  assert.equal(h.calls.filter(x=>x==='continue').length,3);assert.ok(h.messages.some(m=>m.includes('3/3')));
});
test('retry disabled permits the first recovery only; raising the limit takes effect',async()=>{
  const h=harness();let enabled=false;h.d.settings=()=>({retryAfterFailure:enabled,maxAttempts:3,language:'codex'});const w=h.watch();
  await w.tick();h.setState({status:'failed',turnId:'recovery-1',error:'network error'});h.setTime(100000);await w.tick();assert.equal(h.calls.filter(x=>x==='continue').length,1);
  enabled=true;await w.tick();assert.equal(h.calls.filter(x=>x==='continue').length,2);
});
test('successful completion and a later manual turn start fresh failure chains',async()=>{
  const h=harness();h.d.settings=()=>({retryAfterFailure:true,maxAttempts:1,language:'codex'});const w=h.watch();await w.tick();
  h.setState({status:'running',turnId:'auto-1'});await w.tick();h.setState({status:'completed',turnId:'auto-1'});await w.tick();assert.equal(h.record()?.attemptsUsed,0);
  h.setState({status:'failed',turnId:'manual-2',error:'network error'});h.setTime(100000);await w.tick();assert.equal(h.record()?.attemptsUsed,1);
  h.setState({status:'running',turnId:'auto-2'});await w.tick();h.setState({status:'failed',turnId:'manual-3',error:'network error'});h.setTime(200000);await w.tick();assert.equal(h.record()?.attemptsUsed,1);assert.equal(h.calls.filter(x=>x==='continue').length,3);
});
test('compaction and its follow-up continue consume one recovery attempt',async()=>{
  const h=harness({status:'failed',turnId:'old',error:'context window exceeded'});h.d.settings=()=>({retryAfterFailure:true,maxAttempts:1,language:'codex'});const w=h.watch();await w.tick();
  h.setState({status:'completed',turnId:'compact-1',isCompaction:true});h.setTime(100000);await w.tick();assert.equal(h.record()?.attemptsUsed,1);
  h.setState({status:'failed',turnId:'auto-1',error:'network error'});h.setTime(200000);await w.tick();assert.deepEqual(h.calls,['owner','compact','owner','continue']);
});
test('definite rejection does not consume an attempt; uncertain acceptance does',async()=>{
  const h=harness();h.d.definitelyRejected=e=>e==='rejected';h.d.send=async()=>{throw'rejected';};await h.watch().tick();assert.equal(h.record()?.attemptsUsed,0);
  h.d.send=async()=>{throw Error('uncertain');};h.setTime(100000);await h.watch().tick();assert.equal(h.record()?.attemptsUsed,1);assert.equal(h.record()?.phase,'unknown');
});
test('a lower retry limit saved during owner lookup prevents an extra dispatch',async()=>{
  const h=harness();let enabled=true;h.d.settings=()=>({retryAfterFailure:enabled,maxAttempts:3,language:'codex'});const w=h.watch();await w.tick();
  h.setState({status:'failed',turnId:'auto-1',error:'network error'});h.setTime(100000);h.d.owner=async()=>{enabled=false;return'exact-owner';};await w.tick();assert.equal(h.calls.filter(x=>x==='continue').length,1);
});

test('recovery animation receives accepted attempt numbers, with compaction follow-up in the same tier',async()=>{
  const h=harness(),events:Array<[string|undefined,number|undefined]>=[];
  h.d.report=(_message,action,attempt)=>{if(action)events.push([action,attempt]);};
  const w=h.watch();
  for(let i=1;i<=3;i++){
    h.setTime(i*100000);await w.tick();
    h.setState({status:'failed',turnId:`retry-${i}`,error:'network error'});
  }
  assert.deepEqual(events,[['failed',1],['continue',1],['failed',2],['continue',2],['failed',3],['continue',3]]);
  const compact=harness({status:'failed',turnId:'original',error:'context window exceeded'}),reports:Array<[string|undefined,number|undefined]>=[];
  compact.d.report=(_m,a,n)=>{if(a)reports.push([a,n]);};
  const cw=compact.watch();await cw.tick();compact.setState({status:'completed',turnId:'compaction',isCompaction:true});compact.setTime(20000);await cw.tick();
  assert.deepEqual(reports,[['failed',1],['compact',1],['continue',1]]);
});


test('unconfirmed handoff survives restart, never resends, and clears on a new turn',async()=>{
 const h=harness();const progress:any[]=[];h.d.progress=p=>progress.push(p);
 h.d.send=async()=>{h.calls.push('continue');throw Error('no receipt');};
 await h.watch().tick();h.setTime(129999);await h.watch().tick();assert.equal(progress.at(-1).unconfirmed,undefined);
 h.setTime(130000);await h.watch().tick();assert.deepEqual(progress.at(-1).unconfirmed,{since:10000,episodeId:'old'});
 h.setTime(999999);await h.watch().tick();assert.equal(h.calls.filter(c=>c==='continue').length,1);
 h.setState({status:'running',turnId:'new'});await h.watch().tick();assert.equal(progress.at(-1).unconfirmed,undefined);
});
test('normal running, user stop and completed tasks never get an unconfirmed handoff',async()=>{
 for(const status of ['running','waiting','completed'] as const){const h=harness();const progress:any[]=[];h.d.progress=p=>progress.push(p);await h.watch().tick();h.setTime(999999);h.setState({status,turnId:'old'});await h.watch().tick();assert.equal(progress.at(-1).unconfirmed,undefined);assert.equal(h.calls.filter(c=>c==='continue').length,1);}
});
test('compaction and subsequent continue retain the same incident across restart',async()=>{
 const h=harness({status:'failed',turnId:'origin',error:'context window exceeded'});await h.watch().tick();
 const context=h.record()!.context;h.setState({status:'completed',turnId:'compacted',isCompaction:true});h.setTime(20000);await h.watch().tick();assert.deepEqual(h.record()?.context,context);
 h.setState({status:'failed',turnId:'follow-up',error:'network error'});h.setTime(100000);await h.watch().tick();assert.deepEqual(h.record()?.context,context);
});

test('model capacity failures continue the exact task with cooldown, backoff and three-attempt limit',async()=>{
 const error='Selected model is at capacity. Please try a different model.';
 const h=harness({status:'failed',turnId:'capacity-0',error,endedAt:9000}),w=h.watch();
 await w.tick();assert.equal(h.calls.length,0);
 h.setTime(15000);await w.tick();assert.equal(h.calls.filter(c=>c==='continue').length,1);assert.equal(h.record()?.context?.reason,'capacity');
 h.setState({status:'failed',turnId:'capacity-1',error});h.setTime(19000);await w.tick();assert.equal(h.calls.filter(c=>c==='continue').length,1);
 h.setTime(20000);await w.tick();assert.equal(h.calls.filter(c=>c==='continue').length,2);
 h.setState({status:'failed',turnId:'capacity-2',error});h.setTime(34000);await w.tick();assert.equal(h.calls.filter(c=>c==='continue').length,2);
 h.setTime(35000);await w.tick();assert.equal(h.calls.filter(c=>c==='continue').length,3);
 h.setState({status:'failed',turnId:'capacity-3',error});h.setTime(100000);await h.watch().tick();assert.equal(h.calls.filter(c=>c==='continue').length,3);assert.equal(h.record()?.attemptsUsed,3);
});

test('capacity failure on disk does not interrupt Codex retries or approval waits',async()=>{
 for(const work of ['running','retrying','waiting'] as const){const h=harness({status:'failed',turnId:'capacity',error:'Selected model is at capacity. Please try a different model.'});h.d.allowDispatch=current=>permitsRecovery({threadId:'task-A',turnId:'capacity',connection:'live',work,activity:'none',label:'',updatedAt:0},current);await h.watch().tick();assert.equal(h.calls.filter(c=>c==='continue').length,0);assert.equal(h.record(),null);}
});
