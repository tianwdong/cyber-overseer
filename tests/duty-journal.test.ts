import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DutyJournal} from '../src/main/duty-journal';
test('history keeps uncertainty distinct, bounds duplicates and survives restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'duty-'));try{const file=join(dir,'duty.json'),j=new DutyJournal(file);await j.load();await j.add('a','continue',1);await j.add('a','checking',1);await j.add('a','checking',1);await j.add('a','recovered',1);
 assert.deepEqual(j.entries.map(e=>e.kind),['continue','checking','recovered']);assert.equal(await j.claimNotification('a:turn:exhausted'),true);
 const restored=new DutyJournal(file);await restored.load();assert.equal(restored.entries.length,3);assert.equal(await restored.claimNotification('a:turn:exhausted'),false);assert.equal(await restored.claimNotification('a:new-turn:exhausted'),true);await restored.clear();assert.equal(restored.entries.length,0);assert.equal(await restored.claimNotification('a:turn:exhausted'),false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('same event in different incidents is retained and metadata survives restart',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'duty-'));try{const file=join(dir,'duty.json'),j=new DutyJournal(file);await j.load();
 for(const episodeId of ['one','two'])await j.add('a','unconfirmed',1,{episodeId,failedTurnId:episodeId,reason:'network'});
 await j.add('a','unconfirmed',1,{episodeId:'two',failedTurnId:'two',reason:'network'});
 const restored=new DutyJournal(file);await restored.load();assert.deepEqual(restored.entries.map(e=>e.context?.episodeId),['one','two']);
 await restored.clear('a');assert.equal(restored.entries.length,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});
