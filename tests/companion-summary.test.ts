import test from 'node:test';
import assert from 'node:assert/strict';
import {companionSummary,codexTaskUrl} from '../src/core/companion-summary';
import {ambientGesture,foremanPose} from '../src/core/performance';
import {felineMotion} from '../src/core/feline-motion';
import type {OverseerState} from '../src/core/model';
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',c='00000000-0000-4000-8000-000000000003';
function state():OverseerState{return {character:'mechanic',mode:'live',tasks:[a,b,c].map(id=>({id,title:'Same title',cwd:'C:\\Projects\\Example',status:'running',updatedAt:0})),selectedId:a,location:{kind:'unlocated',reason:'hidden'},phase:'idle',message:'',snapshotAgeMs:null,watchingIds:[a,b],liveStates:{[a]:{threadId:a,connection:'live',work:'running',activity:'files',label:'修改文件',updatedAt:1},[b]:{threadId:b,connection:'live',work:'waiting',activity:'none',label:'等待你处理',updatedAt:1}}};}
test('companion counts live open work, prioritizes attention, and keeps exact identities',()=>{
 const s=state(),summary=companionSummary(s);assert.equal(summary.running,1);assert.equal(summary.waiting,1);assert.deepEqual(summary.tasks.map(t=>t.id),[b,a]);assert.equal(summary.tasks[0].project,'Example');assert.equal(summary.tasks[1].live?.activity,'files');
 s.liveStates![a].connection='disconnected';assert.equal(companionSummary(s).running,0);s.watchingIds=[a];assert.equal(companionSummary(s).waiting,0);assert.equal(companionSummary(s).tasks.length,1);
});
test('result handoff uses entry ID, latest title, and read state without implying recent completion',()=>{
 const s=state();s.tasks[0].title='Renamed';s.inbox=[{id:'result-a',threadId:a,turnId:'turn-a',title:'Old title',cwd:'/',at:1,excerpt:'Saved result',read:false},{id:'result-b',threadId:b,turnId:'turn-b',title:'Other',cwd:'/',at:2,excerpt:'Other result',read:true}];
 const summary=companionSummary(s);assert.equal(summary.unread,1);assert.equal(summary.result?.title,'Renamed');assert.equal(summary.result?.id,'result-a');assert.equal(s.inbox[0].read,false);s.inbox[0].read=true;assert.equal(companionSummary(s).result,undefined);
});
test('native navigation admits known exact task IDs, never titles or supplied routes',()=>{
 const s=state();assert.equal(codexTaskUrl(s,b),`codex://threads/${b}`);assert.throws(()=>codexTaskUrl(s,'Same title'));assert.throws(()=>codexTaskUrl(s,`codex://threads/${a}`));assert.throws(()=>codexTaskUrl(s,'00000000-0000-4000-8000-000000000004'));
 s.tasks=[];s.inbox=[{id:'saved',threadId:a,turnId:'turn',title:'Saved',cwd:'/',at:1,excerpt:'',read:false}];assert.equal(codexTaskUrl(s,a),`codex://threads/${a}`);assert.equal(s.inbox[0].read,false);
});
test('normal work stays calm between short gestures; cat plants its paws',()=>{
 let quiet=0;for(let t=0;t<22000;t+=100){const p=ambientGesture(t);assert(p>=0&&p<=1);if(p===0)quiet++;}
 assert(quiet>140);assert.equal(felineMotion('working',0,0,0).paw,0);assert.equal(felineMotion('working',0,1000,0).paw,0);assert(felineMotion('working',0,11000,0).paw>0);
 assert.equal(foremanPose('working',0,0).rightX,foremanPose('working',0,1000).rightX);
});
