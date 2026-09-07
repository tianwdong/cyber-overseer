import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locateTask, threadIdFromRoute, edgeAnchor, normalizeError, type DesktopSnapshot } from '../src/core/model';
import { reduceRollout, recoveryAction } from '../src/core/events';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const snapshot=():DesktopSnapshot=>({observedAt:10000,accessibility:true,windows:[{id:21,pid:123,bundleId:'com.openai.codex',visible:true,minimized:false,bounds:{x:200,y:100,width:800,height:600},routes:[`codex://threads/${a}`],selectedLinks:[]}]});
test('full identity: same-name task cannot match another ID',()=>{assert.equal(locateTask(a,snapshot(),10000).kind,'located');assert.equal(locateTask(b,snapshot(),10000).kind,'unlocated');});
test('reject pasted, unrelated, partial and remote URLs',()=>{for(const s of [`see codex://threads/${a}`,`https://evil.test/threads/${a}`,`file:///threads/${a}`,`codex://threads/${a}/extra`,`codex://threads/${a.slice(0,8)}`])assert.equal(threadIdFromRoute(s),null);});
test('reject stale observations, permission denial and wrong bundle',()=>{assert.equal(locateTask(a,snapshot(),13000).kind,'unlocated');const s=snapshot();s.accessibility=false;assert.equal(locateTask(a,s,10000).kind,'unlocated');s.accessibility=true;s.windows[0].bundleId='com.example.other';assert.equal(locateTask(a,s,10000).kind,'unlocated');});
test('hidden and minimized targets release binding',()=>{const s=snapshot();s.windows[0].visible=false;assert.equal(locateTask(a,s,10000).kind,'unlocated');s.windows[0].visible=true;s.windows[0].minimized=true;assert.equal(locateTask(a,s,10000).kind,'unlocated');});
test('ambiguous windows and conflicting selection fail closed',()=>{const s=snapshot();s.windows.push({...s.windows[0],id:22});assert.deepEqual(locateTask(a,s,10000),{kind:'unlocated',reason:'ambiguous'});s.windows.pop();s.windows[0].selectedLinks=[{url:`codex://threads/${b}`,bounds:s.windows[0].bounds}];assert.deepEqual(locateTask(a,s,10000),{kind:'unlocated',reason:'ambiguous'});});
test('anchors account for negative multi-display coordinates and fullscreen bounds',()=>{const area={x:-1920,y:0,width:1920,height:1080};const p=edgeAnchor({x:-1700,y:100,width:1000,height:700},area);assert.equal(p.side,'left');assert.ok(p.x<0&&p.x>=area.x);const full=edgeAnchor(area,area);assert.ok(full.x<=-44&&full.y>=80);});
test('internal retry events are never external recovery triggers',()=>{assert.equal(normalizeError({method:'error',params:{willRetry:true,error:{codexErrorInfo:'other'}}}),'wait');assert.equal(normalizeError({method:'error',params:{error:{codexErrorInfo:'other'}}}),'manual');});
const event=(type:string,rest:object={})=>JSON.stringify({timestamp:'2026-09-06T13:52:02.304Z',type:'event_msg',payload:{type,turn_id:'failed-turn',...rest}});
const actualError='stream disconnected before completion: Transport error: network error: error decoding response body';
test('regression: actual September 6 error is an automatic continue candidate',()=>{const state=reduceRollout([event('task_started'),event('task_complete',{error:{message:actualError,codex_error_info:'other'}})]);assert.equal(state.status,'failed');assert.equal(recoveryAction(state),'continue');assert.ok(state.endedAt);});
test('manual continue cancels the old failure; tool output cannot forge failure',()=>{const state=reduceRollout([event('task_complete',{error:{message:actualError}}),JSON.stringify({type:'response_item',payload:{type:'task_complete',error:{message:actualError}}}),event('task_started',{turn_id:'new-turn'})]);assert.equal(state.status,'running');assert.equal(recoveryAction(state),null);});
test('normal completion, interruption, and stale old completion do not retry',()=>{assert.equal(recoveryAction(reduceRollout([event('task_complete')])),null);assert.equal(recoveryAction(reduceRollout([event('turn_aborted')])),null);assert.equal(reduceRollout([event('task_started',{turn_id:'new'}),event('task_complete',{error:{message:actualError}})]).status,'running');});
test('context errors request compaction; auth and quota do not get nudged',()=>{assert.equal(recoveryAction({status:'failed',turnId:a,error:'context window exceeded'}),'compact');assert.equal(recoveryAction({status:'failed',turnId:a,error:'error compacting conversation: network error'}),'compact');for(const error of ['authentication failed','billing error','usage limit exceeded'])assert.equal(recoveryAction({status:'failed',turnId:a,error}),null);});
test('compaction evidence survives completion, ordinary new turns do not inherit it',()=>{const state=reduceRollout([event('task_started'),event('item_started',{item:{type:'contextCompaction'}}),event('task_complete')]);assert.equal(state.isCompaction,true);assert.equal(reduceRollout([event('task_started'),event('item_started',{item:{type:'contextCompaction'}}),event('task_started',{turn_id:'new'})]).isCompaction,undefined);});

test('native rollout ContextCompaction completed event is recognized',()=>{const state=reduceRollout([event('task_started'),event('item_completed',{item:{type:'ContextCompaction'}}),event('task_complete')]);assert.equal(state.isCompaction,true);assert.equal(state.status,'completed');});
test('native completed item establishes current turn when tail omitted start',()=>{const state=reduceRollout([event('item_completed',{item:{type:'AgentMessage'}})]);assert.equal(state.status,'running');assert.equal(state.turnId,'failed-turn');});
test('compaction authentication errors are not misclassified as recoverable',()=>{assert.equal(recoveryAction({status:'failed',turnId:a,error:'Error running remote compact task: authentication failed',isCompaction:true}),null);});

test('model capacity is recoverable only after a terminal failure, without treating quota as capacity',()=>{
 const error='Selected model is at capacity. Please try a different model.';
 assert.equal(recoveryAction({status:'failed',turnId:a,error}),'continue');
 for(const status of ['running','retrying','waiting','completed','unknown'] as const)assert.equal(recoveryAction({status,turnId:a,error}),null);
 assert.equal(recoveryAction({status:'failed',error}),null);
 for(const prefix of ['quota exceeded: ','rate limit: ','authentication failed: '])assert.equal(recoveryAction({status:'failed',turnId:a,error:prefix+error}),null);
});
