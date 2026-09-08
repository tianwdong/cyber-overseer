import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformPaths, runPython, findCodexBinary, windowsCodexRoots } from '../src/main/platform';

test('Windows uses roaming app data and the local named pipe, including Unicode paths', () => {
  const result = platformPaths('win32', { APPDATA: String.raw`C:\Users\测试 用户\AppData\Roaming`, CODEX_HOME: String.raw`D:\工作目录\codex` }, String.raw`C:\Users\测试 用户`);
  assert.equal(result.stateDir, String.raw`C:\Users\测试 用户\AppData\Roaming\Cyber Overseer`);
  assert.equal(result.codexHome, String.raw`D:\工作目录\codex`);
  assert.equal(result.ipcPath, String.raw`\\.\pipe\codex-ipc`);
});
test('macOS retains existing preferences and respects custom Codex home', () => {
  const result = platformPaths('darwin', { CODEX_HOME: '/Volumes/Work/codex' }, '/Users/person');
  assert.equal(result.stateDir, '/Users/person/Library/Application Support/Cyber Overseer');
  assert.equal(result.ipcPath, '/Volumes/Work/codex/ipc/ipc.sock');
});
test('missing platform variables have user-local defaults', () => {
  assert.equal(platformPaths('win32', {}, String.raw`C:\Users\person`).stateDir, String.raw`C:\Users\person\AppData\Roaming\Cyber Overseer`);
  assert.equal(platformPaths('linux', {}, '/home/person').stateDir, '/home/person/.config/Cyber Overseer');
});
test('selected Python runtime handles metadata arguments without shell interpretation', async () => {
  const value = '测试 空格 $(echo unsafe) `literal`';
  const { stdout } = await runPython(['-c', 'import sys,json,sqlite3; print(json.dumps(sys.argv[1]))', value], { timeout: 5000, maxBuffer: 10000 });
  assert.equal(JSON.parse(stdout), value);
});

test('Windows discovers Store desktop service without Codex on PATH',async()=>{
 const root=String.raw`C:\Program Files\WindowsApps\OpenAI.Codex_26.901_x64__test`;
 const binary=root+String.raw`\app\resources\codex.exe`;
 assert.equal(await findCodexBinary({platform:'win32',env:{PATH:'C:\\Windows\\System32'},windowsRoots:async()=>[root],exists:async p=>{if(p!==binary)throw Error('missing');}}),binary);
});
test('Windows discovers running standalone desktop service and never launches the GUI',async()=>{
 const root=String.raw`D:\应用 空格\Codex`,binary=root+String.raw`\resources\codex.exe`;
 const visited:string[]=[];
 assert.equal(await findCodexBinary({platform:'win32',env:{},windowsRoots:async()=>[root],exists:async p=>{visited.push(p);if(p!==binary)throw Error('missing');}}),binary);
 assert.ok(!visited.includes(root+String.raw`\Codex.exe`));
});
test('Windows falls back to PATH when desktop enumeration is unavailable',async()=>{
 const binary=String.raw`D:\CLI 目录\codex.exe`;
 assert.equal(await findCodexBinary({platform:'win32',env:{PATH:'"D:\\CLI 目录"'},windowsRoots:async()=>{throw Error('PowerShell unavailable');},exists:async p=>{if(p!==binary)throw Error('missing');}}),binary);
});
test('Explicit Codex executable is authoritative and a missing override fails',async()=>{
 const env={CYBER_OVERSEER_CODEX:'D:\\custom\\codex.exe'};
 assert.equal(await findCodexBinary({platform:'win32',env,exists:async()=>{},windowsRoots:async()=>{throw Error('must not enumerate');}}),env.CYBER_OVERSEER_CODEX);
 await assert.rejects(findCodexBinary({platform:'win32',env,exists:async()=>{throw Error('missing override');}}),/missing override/);
});

test('Windows desktop enumeration runs without a shell command wrapper',{skip:process.platform!=='win32'},async()=>{
 const roots=await windowsCodexRoots();assert.ok(Array.isArray(roots));assert.ok(roots.every(p=>typeof p==='string'));
});
