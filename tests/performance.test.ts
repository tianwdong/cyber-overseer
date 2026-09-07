import test from 'node:test';
import assert from 'node:assert/strict';
import {restingPerformance,recoveryPerformance,foremanPose,performances,durationOf} from '../src/core/performance';
import type {LiveState} from '../src/core/live-state';
const live=(work:LiveState['work'],activity:LiveState['activity']='none'):LiveState=>({threadId:'task',connection:'live',work,activity,label:'',updatedAt:0});
test('visual recovery tiers reflect actual attempt count without changing recovery policy',()=>{
  assert.equal(recoveryPerformance('whip',1),'tap');assert.equal(recoveryPerformance('whip',2),'whip');assert.equal(recoveryPerformance('whip',3),'heavy');assert.equal(recoveryPerformance('whip',10),'heavy');
  assert.equal(recoveryPerformance('compact',3),'compact');assert.equal(recoveryPerformance('recovered',3),'recovered');
});
test('approval and native retry keep distinct body language; stale exhaustion cannot override working',()=>{
  const exhausted={used:3,limit:3,exhausted:true};
  assert.equal(restingPerformance(live('waiting'),exhausted,true),'waiting');
  assert.equal(restingPerformance(live('retrying'),exhausted,true),'retrying');
  assert.equal(restingPerformance(live('running','thinking'),exhausted),'thinking');
  assert.equal(restingPerformance(live('failed'),exhausted),'exhausted');
  assert.equal(restingPerformance(live('failed'),undefined,true),'observe');
  assert.equal(restingPerformance({...live('failed'),connection:'disconnected'},exhausted),'idle');
  assert.equal(restingPerformance(live('review')),'idle');
});
test('all articulated poses stay finite across each clip; strikes have isolated contacts and settle',()=>{
  for(const {id,duration} of performances)for(let age=0;age<=duration;age+=10){
    const pose=foremanPose(id,age,age,age/100);
    assert(Object.values(pose).every(Number.isFinite),`${id} at ${age}`);
    assert(Math.abs(pose.lean)<.5);assert(pose.rightY>-60);
  }
  for(const mode of ['whip','heavy'] as const){
    const d=durationOf(mode);
    assert(foremanPose(mode,d*.45,0).impact>.99);
    assert.equal(foremanPose(mode,d*.25,0).impact,0);
    assert.equal(foremanPose(mode,d,0).power,0);
    assert.equal(Math.abs(foremanPose(mode,d,0).lean),0);
  }
});
