import {test} from 'node:test';import assert from 'node:assert/strict';import {legPose} from '../src/core/feline-rig';import {felineMotion} from '../src/core/feline-motion';
test('lifted cat legs retain their joint lengths and hang below their roots',()=>{
 for(let i=0;i<4;i++)for(const lift of [0,.25,.5,.75,1]){const p=legPose(i,{...felineMotion('idle',0,0,0),lift});const d=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[1]-b[1]);assert.ok(Math.abs(d(p.root,p.joint)-p.upper)<1e-5);assert.ok(Math.abs(d(p.joint,p.ankle)-p.lower)<1e-5);assert.ok(p.ankle[1]>p.root[1]);}
});
