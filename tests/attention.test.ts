import {test} from 'node:test';
import assert from 'node:assert/strict';
import {watchSummary} from '../src/core/attention';
import type {OverseerState} from '../src/core/model';
const state=():OverseerState=>({character:'mechanic',mode:'live',tasks:['a','b','c'].map(id=>({id,title:'same title',cwd:'/',status:'failed',updatedAt:0})),selectedId:'a',location:{kind:'unlocated',reason:'hidden'},phase:'idle',message:'',snapshotAgeMs:null,watchingIds:['a','b'],retryProgress:{b:{used:3,limit:3,exhausted:true}}});
test('an exhausted unselected task takes priority, by exact ID',()=>{const s=watchSummary(state(),new Set(['a']));assert.equal(s.targetId,'b');assert.equal(s.attention,1);assert.equal(s.recovering,1);});
test('paused tasks do not become global attention targets',()=>{const s=state();s.watchingIds=['a'];assert.equal(watchSummary(s,new Set(['a','b'])).attention,0);assert.equal(watchSummary(s,new Set(['a','b'])).recovering,1);});
test('resolved tasks clear attention on new state',()=>{const s=state();s.retryProgress={};s.tasks.forEach(t=>t.status='running');assert.equal(watchSummary(s).targetId,null);});
test('fresh running state vetoes an old exhausted retry record',()=>{const s=state();s.liveStates={b:{threadId:'b',connection:'live',work:'running',activity:'command',label:'Working',updatedAt:Date.now()}};assert.notEqual(watchSummary(s).targetId,'b');});
test('dashboard and hover share recovery state and exclude already-recovering failures',()=>{const s=state();s.retryProgress={};s.recoveringIds=['a','b'];assert.equal(watchSummary(s).attention,0);assert.equal(watchSummary(s).recovering,2);});
test('live approval wait outranks stale exhausted recovery record',()=>{const s=state();s.liveStates={b:{threadId:'b',connection:'live',work:'waiting',activity:'none',label:'Approval',updatedAt:Date.now()}};const summary=watchSummary(s,new Set(['a']));assert.equal(summary.targetId,'b');assert.equal(summary.exhausted,false);});
test('completion without live stream clears obsolete exhausted state',()=>{const s=state();s.tasks.forEach(t=>t.status='completed');assert.equal(watchSummary(s).attention,0);});

test('unconfirmed receipt requires attention even while recovering, but active work and pauses win',()=>{
 const s=state();s.retryProgress={a:{used:1,limit:3,exhausted:false,unconfirmed:{since:1,episodeId:'turn-a'}}};s.watchingIds=['a'];s.recoveringIds=['a'];
 assert.equal(watchSummary(s).unconfirmed,true);assert.equal(watchSummary(s).recovering,0);
 s.liveStates={a:{threadId:'a',connection:'live',work:'running',activity:'command',label:'Working',updatedAt:1}};assert.equal(watchSummary(s).attention,0);
 s.liveStates={};s.watchingIds=[];assert.equal(watchSummary(s).attention,0);
});
