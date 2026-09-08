import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join,toNamespacedPath} from 'node:path';
import {tmpdir} from 'node:os';
import {readTaskState} from '../src/main/inventory';
import {runPython} from '../src/main/platform';
const id='01a076ce-dcdf-7783-ba7d-8b1fa1b48c7d';
async function fixture(mode:'normal'|'extended'|'outside'|'wrong-id'){
 const dir=await mkdtemp(join(tmpdir(),'overseer 日志 '));
 await mkdir(join(dir,'sessions'));
 const rollout=join(dir,mode==='outside'?'outside.jsonl':'sessions/task.jsonl');
 await writeFile(rollout,JSON.stringify({type:'session_meta',payload:{id:mode==='wrong-id'?'other':id}})+'\n'+JSON.stringify({type:'event_msg',payload:{type:'task_started',turn_id:'turn-1'}})+'\n');
 await runPython(['-c',"import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('create table threads (id text,rollout_path text,archived integer)'); c.execute('insert into threads values (?,?,0)',(sys.argv[2],sys.argv[3])); c.commit(); c.close()",join(dir,'state_5.sqlite'),id,mode==='extended'?toNamespacedPath(rollout):rollout],{timeout:5000,maxBuffer:1024});
 return dir;
}
for(const mode of ['normal','extended','outside','wrong-id'] as const)test(`task log ${mode} keeps filesystem boundary and task identity`,{skip:mode==='extended'&&process.platform!=='win32'},async()=>{
 const dir=await fixture(mode);try{
  if(mode==='outside'||mode==='wrong-id')await assert.rejects(readTaskState(id,dir),e=>e instanceof Error&&e.message.includes(mode==='outside'?'Unexpected rollout path':'Task identity mismatch')&&!e.message.includes('import sqlite3'));
  else assert.equal((await readTaskState(id,dir)).status,'running');
 }finally{await rm(dir,{recursive:true,force:true});}
});
