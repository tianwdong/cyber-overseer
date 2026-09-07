import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discoveryCandidates} from '../src/core/discovery';
const rows=Array.from({length:125},(_,i)=>({id:`task-${i}`,title:'same title',cwd:'/work',updatedAt:1000,status:'unknown' as const}));
test('global discovery covers beyond the old 100-task limit without starving older tasks',()=>{
  const seen=new Map(),found=new Set<string>();
  for(let pass=0;pass<7;pass++)for(const task of discoveryCandidates(rows,new Set(),new Set(),seen,100000)){seen.set(task.id,{updated:1000,checked:100000});found.add(task.id);}
  assert.equal(found.size,125);
});
test('new and changed tasks join automatically; per-task pause survives subsequent discovery scans',()=>{
  const seen=new Map(rows.map(t=>[t.id,{updated:t.updatedAt,checked:100000}]));
  const changed=rows.map(t=>t.id==='task-5'?{...t,updatedAt:100001}:t);
  const candidates=discoveryCandidates([...changed,{...rows[0],id:'new'}],new Set(['new']),new Set(['task-5']),seen,100001);
  assert.equal(candidates.length,0);
  assert.equal(discoveryCandidates(changed,new Set(),new Set(),seen,100001)[0].id,'task-5');
});
