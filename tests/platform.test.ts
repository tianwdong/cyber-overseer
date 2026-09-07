import { test } from 'node:test';
import assert from 'node:assert/strict';
import { platformPaths, runPython } from '../src/main/platform';

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
