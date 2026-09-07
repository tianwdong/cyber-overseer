import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadWatchPreferences,saveWatchPreferences} from '../src/main/watch-preferences';
test('global stop and per-task exclusions survive restart and global resume',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'watch-prefs-')),file=join(dir,'prefs.json');
 try{assert.deepEqual(await loadWatchPreferences(file),{autoAll:true,pausedIds:[]});
 const pausedIds=['00000000-0000-4000-8000-000000000001'];
 await saveWatchPreferences(file,{autoAll:false,pausedIds});
 const restored=await loadWatchPreferences(file);assert.equal(restored.autoAll,false);assert.deepEqual(restored.pausedIds,pausedIds);
 await saveWatchPreferences(file,{...restored,autoAll:true});assert.deepEqual((await loadWatchPreferences(file)).pausedIds,pausedIds);
 await writeFile(file,'{broken');await assert.rejects(loadWatchPreferences(file));
 }finally{await rm(dir,{recursive:true,force:true});}
});
