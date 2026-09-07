import {legPose} from '../src/core/feline-rig';
import test from 'node:test';
import assert from 'node:assert/strict';
import {pawStep,settlePaw,felineStride,stanceRatio} from '../src/core/feline-gait';
import {felineMotion} from '../src/core/feline-motion';
test('support paws stay fixed in world space while the body travels',()=>{
  for(let leg=0;leg<4;leg++)for(let distance=0;distance<80;distance+=.1){
    const phase=distance/felineStride*Math.PI*2,next=(distance+.01)/felineStride*Math.PI*2;
    if(!pawStep(phase,leg).grounded||!pawStep(next,leg).grounded)continue;
    const a=legPose(leg,felineMotion('walk',0,0,phase)).ankle,b=legPose(leg,felineMotion('walk',0,0,next)).ankle;
    assert(Math.abs(b[0]+distance+.01-a[0]-distance)<1e-6);assert.equal(a[1],b[1]);
  }
});
test('four beat walking maintains support and lifts each returning paw',()=>{
  for(let phase=0;phase<Math.PI*2;phase+=.01){const paws=[0,1,2,3].map(i=>pawStep(phase,i));assert(paws.filter(p=>p.grounded).length>=2);assert(paws.every(p=>p.y<=0));}
  for(let leg=0;leg<4;leg++)assert(Array.from({length:100},(_,i)=>pawStep(i/100*Math.PI*2,leg)).some(p=>p.y<-7));
});
test('paw position and velocity are continuous at lift-off, touchdown and cycle wrap',()=>{
  const epsilon=1e-5;
  for(const phase of [0,stanceRatio*Math.PI*2,Math.PI*2]){
    const a=pawStep(phase-epsilon,0),b=pawStep(phase,0),c=pawStep(phase+epsilon,0);
    for(const axis of ['x','y'] as const){assert(Math.abs(c[axis]-a[axis])<.001);assert(Math.abs((c[axis]-b[axis])/epsilon-(b[axis]-a[axis])/epsilon)<.01);}
  }
});

test('stopping paws lift before settling, with no final position jump',()=>{
  for(let leg=0;leg<4;leg++)for(const phase of [0,1,2,3,4]){
    const start=pawStep(phase,leg),first=settlePaw(phase,leg,0),last=settlePaw(phase,leg,600);assert.equal(first.x,start.x);assert.equal(first.y,start.y);assert.equal(last.x,0);assert.equal(last.y,0);assert(last.grounded);
    for(let age=0;age<600;age+=16){const a=settlePaw(phase,leg,age),b=settlePaw(phase,leg,age+16);assert(Math.hypot(b.x-a.x,b.y-a.y)<2);}
  }
});
