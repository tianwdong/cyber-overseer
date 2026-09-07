import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,appendFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseTaskTitles} from '../src/main/task-titles';
import {readTasks} from '../src/main/inventory';
import {runPython} from '../src/main/platform';
const entry=(id:string,title:string,date='2026-09-07T06:36:40.813754Z')=>JSON.stringify({id,thread_name:title,updated_at:date});
test('current names are selected by full ID and timestamp, tolerating incomplete appends',()=>{
 const titles=parseTaskTitles([entry('a','Older','2026-09-06T00:00:00Z'),entry('a','赛博督工｜界面字号与信息密度'),entry('b','Same title'),entry('a','stale append','2026-09-05T00:00:00Z'),entry('a',' ','2026-09-08T00:00:00Z'),entry('a','invalid date','bad'),'partial {'].join('\n'));
 assert.equal(titles.get('a'),'赛博督工｜界面字号与信息密度');assert.equal(titles.get('b'),'Same title');assert.equal(titles.size,2);
});
test('inventory uses Codex rename index without adding historical tasks or changing task identity',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'overseer titles '));try{
  await runPython(['-c',"import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('create table threads (id text,title text,cwd text,updated_at integer,archived integer,source text)'); c.executemany('insert into threads values (?,?,?,?,?,?)',[('a','Original prompt','/project',1,0,'app'),('b','Fallback','/other',2,0,'cli')]); c.commit(); c.close()",join(dir,'state_5.sqlite')],{timeout:5000,maxBuffer:1024});
  assert.equal((await readTasks(dir)).find(t=>t.id==='a')?.title,'Original prompt');
  await writeFile(join(dir,'session_index.jsonl'),entry('a','Renamed')+'\n'+entry('history-only','Never add this task')+'\n');
  let tasks=await readTasks(dir);assert.equal(tasks.length,2);assert.equal(tasks.find(t=>t.id==='a')?.title,'Renamed');assert.equal(tasks.find(t=>t.id==='a')?.cwd,'/project');assert.equal(tasks.find(t=>t.id==='b')?.title,'Fallback');
  await appendFile(join(dir,'session_index.jsonl'),entry('a','Renamed again','2026-09-08T00:00:00Z')+'\n');tasks=await readTasks(dir);assert.equal(tasks.find(t=>t.id==='a')?.title,'Renamed again');
 }finally{await rm(dir,{recursive:true,force:true});}
});
