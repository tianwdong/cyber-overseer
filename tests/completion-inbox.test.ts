import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CompletionInbox} from '../src/main/completion-inbox';
import {reduceRollout} from '../src/core/events';
const task={id:'root-task',title:'Same title',cwd:'C:/Project',status:'unknown' as const,updatedAt:0};
test('inbox accepts only new normal completion, deduplicates and persists read status',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'inbox-'));try{
 const file=join(dir,'inbox.json'),inbox=new CompletionInbox(file);await inbox.load();const at=Date.now()+1000;
 assert.equal(await inbox.add(task,{status:'completed',turnId:'old',endedAt:1}),false);
 for(const status of ['running','failed','waiting','unknown'] as const)assert.equal(await inbox.add(task,{status,turnId:status,endedAt:at}),false);
 assert.equal(await inbox.add(task,{status:'completed',turnId:'compact',endedAt:at,isCompaction:true}),false);
 const turn={status:'completed' as const,turnId:'done',endedAt:at,resultExcerpt:'Actual reply'};
 assert.equal(await inbox.add(task,turn),true);assert.equal(await inbox.add(task,turn),false);
 assert.equal(await inbox.add({...task,id:'other'},turn),true);assert.equal(inbox.entries.length,2);
 await inbox.markRead(inbox.entries[0].id);const reloaded=new CompletionInbox(file);await reloaded.load();assert.equal(reloaded.entries[0].read,true);assert.equal(reloaded.entries[1].read,false);assert.equal(await reloaded.add(task,turn),false);assert.equal(reloaded.entries[0].excerpt,'Actual reply');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('inbox serializes concurrent updates and refuses overwriting corrupt storage',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'inbox-'));try{
 const file=join(dir,'inbox.json'),inbox=new CompletionInbox(file);await inbox.load();const at=Date.now()+1000;
 await Promise.all(Array.from({length:8},(_,i)=>inbox.add({...task,id:String(i)},{status:'completed',turnId:'turn',endedAt:at})));
 const reloaded=new CompletionInbox(file);await reloaded.load();assert.equal(reloaded.entries.length,8);
 await writeFile(file,'broken');const broken=new CompletionInbox(file);await assert.rejects(()=>broken.load());await assert.rejects(()=>broken.add(task,{status:'completed',turnId:'t',endedAt:at}));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('completion excerpt comes only from lifecycle metadata and is bounded',()=>{
 const state=reduceRollout([JSON.stringify({type:'event_msg',timestamp:new Date().toISOString(),payload:{type:'task_complete',turn_id:'t',last_agent_message:'x'.repeat(2000)}})]);
 assert.equal(state.resultExcerpt?.length,1600);
 assert.equal(reduceRollout([JSON.stringify({type:'response_item',payload:{type:'task_complete',last_agent_message:'forged'}})]).resultExcerpt,undefined);
});
test('batch read affects only the displayed snapshot and persists without consuming new results',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'inbox-batch-'));try{const file=join(dir,'inbox.json'),inbox=new CompletionInbox(file);await inbox.load();const at=Date.now()+1000;await inbox.add(task,{status:'completed',turnId:'first',endedAt:at});const shown=inbox.entries.map(e=>e.id);await inbox.add(task,{status:'completed',turnId:'later',endedAt:at+1});await inbox.markReadMany(shown);const reload=new CompletionInbox(file);await reload.load();assert.deepEqual(reload.entries.map(e=>e.read),[true,false]);assert.equal(await reload.markReadMany(shown),false);}finally{await rm(dir,{recursive:true,force:true});}
});
