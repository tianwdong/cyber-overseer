import test from 'node:test';
import assert from 'node:assert/strict';
import {characterPose,performanceLabel} from '../src/core/companion-performance';
import {performances} from '../src/core/performance';
import {tr} from '../src/core/i18n';
test('all companions expose distinct translated recovery and waiting performances',()=>{
  for(const id of ['medic','mechanic','ranger'] as const){
    for(const {id:mode} of performances){const source=performanceLabel(id,mode);assert(source.length>0);assert(!/[\u4e00-\u9fff]/.test(tr(source,'en')));}
    assert.notEqual(performanceLabel(id,'observe'),performanceLabel(id,'recovered'));
    assert.notEqual(performanceLabel(id,'waiting'),performanceLabel(id,'exhausted'));
  }
  assert.equal(new Set(['medic','mechanic','ranger'].map(id=>performanceLabel(id as 'medic','heavy'))).size,3);
});
test('companion rigs retain bounded finite poses throughout every clip and both gait directions',()=>{
  for(const id of ['medic','mechanic','ranger'] as const)for(const {id:mode,duration} of performances)for(let age=0;age<=duration;age+=16){
    for(const direction of [-1,1]){const p=characterPose(id,mode,age,age,direction*age/100);assert(Object.values(p).every(Number.isFinite),`${id}/${mode}/${age}`);assert(Math.abs(p.lean)<.4);assert(Math.abs(p.rightX)<65);assert(p.rightY>-60);assert(p.bob>-30);}
  }
});
