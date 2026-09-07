import test from 'node:test';
import assert from 'node:assert/strict';
import {felineMotion,deformFeline} from '../src/core/feline-motion';
import {felineMeshes,deformLeg,legPose,legs} from '../src/core/feline-rig';
import {performances} from '../src/core/performance';
test('every rendered torso and limb triangle retains its orientation without excluded strips',()=>{
  const meshes=felineMeshes(),area=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  for(const {id,duration} of performances)for(let age=0;age<=duration;age+=160){
    const p=felineMotion(id,age,age,age/150);
    for(const mesh of meshes){const pose=mesh.part<0?undefined:legPose(mesh.part,p),points:number[][]=[];
      for(let i=0;i<mesh.uv.length;i+=2)points.push(mesh.part<0?deformFeline(mesh.uv[i],mesh.uv[i+1],p):deformLeg(mesh.uv[i],mesh.uv[i+1],mesh.part,p,pose,mesh.segment));
      for(let i=0;i<mesh.indices.length;i+=3)assert(area(points[mesh.indices[i]],points[mesh.indices[i+1]],points[mesh.indices[i+2]])<0,`${id}: folded part ${mesh.part} triangle ${i/3} at ${age}`);
    }
  }
});
test('cat breathing and crouching keep resting ankles planted',()=>{
  for(const mode of ['idle','exhausted'] as const)for(let time=0;time<4000;time+=40)for(let leg=0;leg<4;leg++){const p=legPose(leg,felineMotion(mode,time%3000,time,0));assert.deepEqual(p.ankle,p.restAnkle);}
});
test('cat recovery reaches settle smoothly and changes remain bounded frame to frame',()=>{
  for(const mode of ['tap','whip','heavy'] as const){const duration=performances.find(p=>p.id===mode)!.duration;assert.equal(felineMotion(mode,0,0,0).paw,0);assert.equal(felineMotion(mode,duration,duration,0).paw,0);
    let previous=legPose(2,felineMotion(mode,0,0,0)).ankle;
    for(let age=16;age<=duration;age+=16){const next=legPose(2,felineMotion(mode,age,age,0)).ankle;assert(Math.hypot(next[0]-previous[0],next[1]-previous[1])<.6);previous=next;}
  }
});
test('all four limbs keep bone lengths and rigid paw shape throughout walking and crouching',()=>{
  const length=(a:number[],b:number[])=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  for(let phase=0;phase<Math.PI*2;phase+=.05)for(const mode of ['walk','heavy','exhausted'] as const)for(let i=0;i<4;i++){
    const m=felineMotion(mode,1300,1300,phase),p=legPose(i,m);
    assert(Math.abs(length(p.root,p.joint)-p.upper)<1e-6);assert(Math.abs(length(p.joint,p.ankle)-p.lower)<1e-6);
    const u=legs[i].ankle[0],a=deformLeg(u,.99,i,m,p),b=deformLeg(u+.025,.99,i,m,p),c=deformLeg(u,1,i,m,p);
    assert(Math.abs(length(a,b)-.025*136)<1e-6);assert(Math.abs(length(a,c)-.01*92)<1e-6);
  }
});
test('no render mesh connects one leg to any other leg',()=>{
  const meshes=felineMeshes();assert.deepEqual([...new Set(meshes.map(m=>m.part))],[1,3,0,2,-1]);
  for(const part of [0,1,2,3])assert.deepEqual(meshes.filter(m=>m.part===part).map(m=>m.segment),['upper','lower','paw']);
  for(const mesh of meshes){assert(mesh.indices.every(i=>i>=0&&i<mesh.uv.length/2));assert(new Set(mesh.indices).size===mesh.uv.length/2);}
});
