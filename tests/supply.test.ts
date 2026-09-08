import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeSupply,remainingSupply,supplyStale} from '../src/core/supply';
test('weekly can be primary; missing windows are not zero usage',()=>{
 const a=decodeSupply({rateLimitsByLimitId:{codex:{primary:{usedPercent:89,windowDurationMins:10080,resetsAt:123},secondary:null}}},100);
 assert.equal(remainingSupply(a),11);assert.equal(a.windows.length,1);assert.equal(a.windows[0].minutes,10080);assert.equal(a.windows[0].resetAt,123000);assert.equal(a.resets,null);
 assert.equal(remainingSupply(decodeSupply({})),null);
});
test('separate model quota does not become shared food',()=>{
 const a=decodeSupply({rateLimitsByLimitId:{spark:{primary:{usedPercent:100,windowDurationMins:300}}},rateLimitResetCredits:{availableCount:0}},100);
 assert.equal(remainingSupply(a),null);assert.equal(a.resets,0);assert.equal(supplyStale(a,100+360001),true);
});
test('malformed windows and unsupported models stay unknown',()=>{
 assert.equal(decodeSupply({rateLimits:{primary:{usedPercent:'89',windowDurationMins:10080}}}).windows.length,0);
});

import {readAccountSupply,readSupplyFromBinary,CodexLaunchError,SupplyReadError} from '../src/main/supply';
import {codexBinaryCandidates} from '../src/main/platform';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('denied Store executable falls back to user PATH and returns quota',async()=>{
 const store=String.raw`C:\Program Files\WindowsApps\Codex\app\resources\codex.exe`;
 const user=String.raw`C:\Users\测试 用户\bin\codex.exe`;
 const candidates=codexBinaryCandidates({platform:'win32',env:{PATH:String.raw`C:\Users\测试 用户\bin`},windowsRoots:async()=>[String.raw`C:\Program Files\WindowsApps\Codex`],exists:async p=>{if(p!==store&&p!==user)throw Error('missing');}});
 const visited:string[]=[],quota=decodeSupply({rateLimits:{primary:{usedPercent:25,windowDurationMins:10080}}});
 const result=await readAccountSupply({candidates,read:async binary=>{visited.push(binary);if(binary===store)throw new CodexLaunchError();return quota;}});
 assert.deepEqual(visited,[store,user]);assert.equal(result,quota);assert.equal(remainingSupply(result),75);
});
test('quota RPC errors and timeouts never switch service',async()=>{
 for(const code of ['unavailable','timeout'] as const){
  const visited:string[]=[];
  await assert.rejects(readAccountSupply({candidates:(async function*(){yield 'desktop';yield 'cli';})(),read:async binary=>{visited.push(binary);throw new SupplyReadError(code);}}),e=>e instanceof SupplyReadError&&e.code===code);
  assert.deepEqual(visited,['desktop']);
 }
});
test('exhausted launch failures differ from no executable and explicit override stays authoritative',async()=>{
 await assert.rejects(readAccountSupply({candidates:(async function*(){})()}),e=>e instanceof SupplyReadError&&e.code==='codex-missing');
 const visited:string[]=[];
 await assert.rejects(readAccountSupply({candidates:codexBinaryCandidates({env:{CYBER_OVERSEER_CODEX:'custom',PATH:'/other'},exists:async()=>{}}),read:async binary=>{visited.push(binary);throw new CodexLaunchError();}}),e=>e instanceof SupplyReadError&&e.code==='unavailable');
 assert.deepEqual(visited,['custom']);
});
test('real spawn failure is classified before writing initialize',async()=>{
 await assert.rejects(readSupplyFromBinary(join(tmpdir(),'cyber-overseer-missing-'+process.pid,'codex.exe')),CodexLaunchError);
});

test('versioned user services prefer modification time and fall back after failed launch',async()=>{
 const root=String.raw`D:\用户 空格\AppData\Local`,visited:string[]=[];
 const candidates=codexBinaryCandidates({platform:'win32',env:{LOCALAPPDATA:root},userVersions:async()=>[
  {name:'ffff-old',modified:1},{name:'0000-new',modified:10},{name:'../outside',modified:99}
 ],exists:async()=>{},windowsRoots:async()=>[]});
 const quota=decodeSupply({rateLimits:{primary:{usedPercent:12,windowDurationMins:10080}}});
 assert.equal(await readAccountSupply({candidates,read:async p=>{visited.push(p);if(p.includes('0000-new'))throw new CodexLaunchError();return quota;}}),quota);
 assert.deepEqual(visited,[root+String.raw`\OpenAI\Codex\bin\0000-new\codex.exe`,root+String.raw`\OpenAI\Codex\bin\ffff-old\codex.exe`]);
});
