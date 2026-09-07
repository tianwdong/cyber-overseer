import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {saveCharacter,loadCharacter} from '../src/main/appearance';
test('character selection survives saving and reload with private local permissions',async()=>{
  const root=await mkdtemp(join(tmpdir(),'overseer-appearance-')),file=join(root,'settings','appearance.json');
  try{assert.equal(await loadCharacter(file),'foreman');await saveCharacter(file,'mechanic');assert.equal(await loadCharacter(file),'mechanic');assert.equal((await stat(file)).mode&0o777,0o600);await saveCharacter(file,'ranger');assert.equal(await loadCharacter(file),'ranger');}finally{await rm(root,{recursive:true,force:true});}
});
test('unknown and damaged appearance settings fall back to a drawable character',async()=>{
  const root=await mkdtemp(join(tmpdir(),'overseer-appearance-')),file=join(root,'appearance.json');
  try{await writeFile(file,'{"character":"missing"}');assert.equal(await loadCharacter(file),'foreman');await writeFile(file,'null');assert.equal(await loadCharacter(file),'foreman');await writeFile(file,'invalid');assert.equal(await loadCharacter(file),'foreman');}finally{await rm(root,{recursive:true,force:true});}
});
