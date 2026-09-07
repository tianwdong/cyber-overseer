import {test} from 'node:test';
import assert from 'node:assert/strict';
import {felinePeek} from '../src/core/feline-peek';
import {deformFeline,felineMotion} from '../src/core/feline-motion';
test('peeking articulates the head without pulling the planted body or feet',()=>{
 const base=felineMotion('idle',0,1000,0),peek={...base,peek:felinePeek(2800,1)};
 for(const [u,v] of [[.5,.85],[.4,.4]]){const actual=deformFeline(u,v,peek),expected=deformFeline(u,v,base);assert(Math.hypot(actual[0]-expected[0],actual[1]-expected[1])<1e-10);}
 assert.notDeepEqual(deformFeline(.9,.2,peek),deformFeline(.9,.2,base));
});
test('curiosity animation remains bounded across idle and pointer approach',()=>{
 for(let age=0;age<24000;age+=25)for(const near of [0,.5,1]){
  const pose=felinePeek(age,near);assert(Math.abs(pose.headTilt)<.25);assert(pose.headReach>=0&&pose.headReach<10);assert(Math.abs(pose.earTwitch)<=1);
 }
});
