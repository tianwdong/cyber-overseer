import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { access } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export function platformPaths(platform = process.platform, env = process.env, home = homedir()) {
  const path = platform === 'win32' ? win32 : posix;
  const codexHome = path.resolve(env.CODEX_HOME || path.join(home, '.codex'));
  const stateDir = platform === 'win32'
    ? path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Cyber Overseer')
    : platform === 'darwin' ? path.join(home, 'Library', 'Application Support', 'Cyber Overseer')
    : path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'Cyber Overseer');
  return { codexHome, stateDir, ipcPath: platform === 'win32' ? String.raw`\\.\pipe\codex-ipc` : path.join(codexHome, 'ipc', 'ipc.sock') };
}
export const paths = platformPaths();
type Python = { binary: string; args: string[] };
let python: Promise<Python> | undefined;
async function findPython(): Promise<Python> {
  const resources = (process as NodeJS.Process & {resourcesPath?:string}).resourcesPath;
  const bundled: Python[] = !resources ? [] : process.platform === 'win32'
    ? [{binary:win32.join(resources,'python','python.exe'),args:[]}]
    : process.platform === 'darwin' ? [{binary:posix.join(resources,'python','bin','python3'),args:[]}] : [];
  const candidates: Python[] = process.env.CYBER_OVERSEER_PYTHON
    ? [{ binary: process.env.CYBER_OVERSEER_PYTHON, args: [] }]
    : process.platform === 'win32'
      ? [...bundled, { binary: 'py', args: ['-3'] }, { binary: 'python', args: [] }, { binary: 'python3', args: [] }]
      : [...bundled, { binary: '/usr/bin/python3', args: [] }, { binary: 'python3', args: [] }];
  for (const candidate of candidates) {
    try {
      await exec(candidate.binary, [...candidate.args, '-I', '-B', '-c', 'import sys,sqlite3; assert sys.version_info >= (3,9)'], { timeout: 4000, windowsHide: true });
      return candidate;
    } catch { /* Try the next installed runtime, never install one implicitly. */ }
  }
  throw Error('Python 3.9+ with sqlite3 is required / 需要 Python 3.9+（含 sqlite3）；可设置 CYBER_OVERSEER_PYTHON。');
}
export async function runPython(args: string[], options: { timeout: number; maxBuffer: number }) {
  const runtime = await (python ??= findPython().catch(error => { python = undefined; throw error; }));
  return exec(runtime.binary, [...runtime.args, '-I', '-B', ...args], { ...options, encoding: 'utf8', windowsHide: true });
}
export async function findCodexBinary(): Promise<string> {
  if (process.env.CYBER_OVERSEER_CODEX) {
    await access(process.env.CYBER_OVERSEER_CODEX);
    return process.env.CYBER_OVERSEER_CODEX;
  }
  const path = process.platform === 'win32' ? win32 : posix;
  const bundled = process.platform === 'darwin' ? ['/Applications/ChatGPT.app/Contents/Resources/codex', '/Applications/Codex.app/Contents/Resources/codex'] : [];
  const executable = process.platform === 'win32' ? 'codex.exe' : 'codex';
  const candidates = [...bundled, ...(process.env.PATH || '').split(path.delimiter).filter(Boolean).map(dir => path.join(dir, executable))];
  for (const candidate of candidates) { try { await access(candidate); return candidate; } catch {} }
  throw Error('Codex executable unavailable / 未找到 Codex 可执行文件；可设置 CYBER_OVERSEER_CODEX。');
}
