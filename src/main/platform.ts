import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { access, readdir, stat } from 'node:fs/promises';
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
// Only executable paths from the running desktop or registered current-user packages.
// Never execute PowerShell output as code, or search other users' installations.
export async function windowsCodexRoots(): Promise<string[]> {
  const script = `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $ErrorActionPreference='SilentlyContinue'; $roots=@(); Get-CimInstance Win32_Process -Filter "Name = 'Codex.exe' OR Name = 'ChatGPT.exe'" | ForEach-Object { if ($_.ExecutablePath) { $roots += [System.IO.Path]::GetDirectoryName($_.ExecutablePath) } }; Get-AppxPackage '*Codex*' | ForEach-Object { if ($_.InstallLocation) { $roots += $_.InstallLocation } }; ConvertTo-Json -Compress -InputObject @($roots | Select-Object -Unique)`;
  const {stdout}=await exec('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{timeout:10000,maxBuffer:256*1024,windowsHide:true,encoding:'utf8'});
  const roots=JSON.parse(stdout.replace(/^\uFEFF/,''));
  return Array.isArray(roots)?roots.filter((v:unknown):v is string=>typeof v==='string'&&win32.isAbsolute(v)&&!v.includes('\0')):[];
}
// Desktop updates use opaque version directory names, not sortable version numbers.
async function codexUserVersions(root:string):Promise<{name:string;modified:number}[]>{
  const entries=await readdir(root,{withFileTypes:true});
  return Promise.all(entries.filter(entry=>entry.isDirectory()).map(async entry=>({
    name:entry.name,modified:await stat(win32.join(root,entry.name,'codex.exe')).then(s=>s.mtimeMs).catch(()=>0)
  })));
}
type CodexBinaryOptions={userVersions?:(root:string)=>Promise<{name:string;modified:number}[]>;platform?:NodeJS.Platform;env?:NodeJS.ProcessEnv;exists?:(path:string)=>Promise<unknown>;windowsRoots?:()=>Promise<string[]>};
// Keep discovery lazy: a working desktop service does not require enumerating every installation.
export async function* codexBinaryCandidates(options:CodexBinaryOptions={}):AsyncGenerator<string> {
  const platform=options.platform??process.platform,env=options.env??process.env,exists=options.exists??access;
  if(env.CYBER_OVERSEER_CODEX){await exists(env.CYBER_OVERSEER_CODEX);yield env.CYBER_OVERSEER_CODEX;return;}
  const path=platform==='win32'?win32:posix;
  const roots=platform==='win32'&&env.LOCALAPPDATA?[path.join(env.LOCALAPPDATA,'Programs','Codex'),path.join(env.LOCALAPPDATA,'Programs','ChatGPT')]:[];
  const resources=(folders:string[])=>folders.flatMap(root=>[path.join(root,'resources','codex.exe'),path.join(root,'app','resources','codex.exe')]);
  const bundled=platform==='darwin'?['/Applications/ChatGPT.app/Contents/Resources/codex','/Applications/Codex.app/Contents/Resources/codex']:resources(roots);
  const executable=platform==='win32'?'codex.exe':'codex',seen=new Set<string>();
  async function* existing(candidates:string[]){
    for(const candidate of candidates){
      const key=platform==='win32'?candidate.toLowerCase():candidate;
      if(seen.has(key))continue;seen.add(key);
      try{await exists(candidate);}catch{continue;}
      yield candidate;
    }
  }
  if(platform==='win32'&&env.LOCALAPPDATA){
    const root=win32.join(env.LOCALAPPDATA,'OpenAI','Codex','bin');
    let versions:{name:string;modified:number}[]=[];
    try{versions=await (options.userVersions??codexUserVersions)(root);}catch{/* Older installations may only have the bundled service. */}
    versions=versions.filter(v=>v.name!=='.'&&v.name!=='..'&&!/[\\/\0]/.test(v.name));
    versions.sort((a,b)=>b.modified-a.modified||a.name.localeCompare(b.name));
    yield* existing(versions.map(v=>win32.join(root,v.name,'codex.exe')));
    yield* existing([win32.join(root,'codex.exe')]);
  }
  yield* existing(bundled);
  if(platform==='win32'){
    let registered:string[]=[];
    try{registered=await (options.windowsRoots??windowsCodexRoots)();}catch{/* PATH may still provide the native CLI. */}
    yield* existing(resources(registered));
  }
  yield* existing((env.PATH||'').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir.replace(/^"|"$/g,''),executable)));
}
export async function findCodexBinary(options:CodexBinaryOptions={}):Promise<string>{
  for await(const binary of codexBinaryCandidates(options))return binary;
  throw Error('Codex executable unavailable / 未找到 Codex 可执行文件；可设置 CYBER_OVERSEER_CODEX。');
}
