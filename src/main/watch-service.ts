import {managedCli} from './managed-cli';
import {loadSettings} from './settings';
import type {Settings,RetryProgress} from '../core/settings';
import {LiveTaskStream} from './live-stream';
import {permitsRecovery,type LiveState} from '../core/live-state';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { paths } from './platform';
import { Watchdog, type RecoveryRecord, type RecoveryStore, type RecoveryContext } from '../core/watchdog';
import { readTaskState } from './inventory';
import { CodexDesktop, DispatchRejected } from './codex-ipc';

const stateDir=paths.stateDir;
export class DiskStore implements RecoveryStore {
  async read(id:string):Promise<RecoveryRecord|null>{try{return JSON.parse(await readFile(join(stateDir,`${id}.json`),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}}
  async save(record:RecoveryRecord){await mkdir(stateDir,{recursive:true,mode:0o700});const file=join(stateDir,`${record.threadId}.json`),temp=`${file}.${process.pid}.tmp`;await writeFile(temp,JSON.stringify(record),{mode:0o600});await rename(temp,file);}
}
export async function startWatcher(id:string,report:(m:string,action?:string,attempt?:number,context?:RecoveryContext)=>void,getLive?:()=>LiveState|undefined,getSettings?:()=>Settings,progress?:(progress:RetryProgress)=>void,health?:(kind:'read'|'dispatch'|'storage'|'owner',failed:boolean)=>void,onRead?:(turn:import('../core/events').TurnState)=>void){
  if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id))throw new Error('Invalid thread ID');
  let standaloneSettings=await loadSettings();
  await mkdir(stateDir,{recursive:true,mode:0o700});
  const lock=join(stateDir,`${id}.lock`);
  async function claim(){const f=await open(lock,'wx',0o600);await f.writeFile(String(process.pid));await f.close();}
  try{await claim();}catch(e){
    if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;
    const pid=Number(await readFile(lock,'utf8'));let alive=true;
    try{process.kill(pid,0);}catch(err){if((err as NodeJS.ErrnoException).code==='ESRCH')alive=false;}
    if(alive||!Number.isInteger(pid)||pid<1)throw new Error('该任务已有一个督工在自动恢复');
    await unlink(lock);await claim();
  }
  const cli=!!managedCli.get(id);
  const client=()=>{const c=managedCli.get(id);if(!c)throw new DispatchRejected('Managed CLI is disconnected');return c;};
  const currentSettings=getSettings??(()=>standaloneSettings);
  const stream=getLive?undefined:new LiveTaskStream(id,()=>{});
  const live=getLive??(()=>stream?.state);
  const ipc=new CodexDesktop();let connected=false,stopped=false;
  const connect=async()=>{if(connected)return;await ipc.connect();connected=true;};
  async function checked<T>(kind:'read'|'dispatch'|'storage'|'owner',run:()=>Promise<T>):Promise<T>{try{const result=await run();health?.(kind,false);return result;}catch(error){health?.(kind,true);throw error;}}
  const store=new DiskStore();
  const watcher=new Watchdog(id,{preferContinue:cli,read:async id=>{const turn=await checked('read',()=>cli?client().turn(id):readTaskState(id));try{onRead?.(turn);}catch{/* Inbox observers must never block recovery. */}return turn;},store:{read:id=>checked('storage',()=>store.read(id)),save:r=>checked('storage',()=>store.save(r))},now:Date.now,report,settings:currentSettings,progress,
    allowDispatch:current=>permitsRecovery(live(),current),
    definitelyRejected:e=>e instanceof DispatchRejected,
    owner:id=>checked('owner',async()=>{try{if(cli){await client().read(id);return id;}await connect();return await ipc.owner(id);}catch(e){connected=false;ipc.close();throw e;}}),
    send:(id,owner,messageId)=>checked('dispatch',()=>cli?client().queue(id,messageId):ipc.resume(id,owner,messageId)),compact:(id,owner)=>checked('dispatch',()=>{if(cli)throw new DispatchRejected('CLI uses continue recovery');return ipc.compact(id,owner);})});
  const interval=setInterval(()=>{if(!stopped){if(!getSettings)void loadSettings().then(s=>{standaloneSettings=s;}).catch(()=>{});void watcher.tick();}},2000);
  report('自动恢复已启动：监看此任务的网络及压缩故障。');
  void watcher.tick();
  return async()=>{if(stopped)return;stopped=true;clearInterval(interval);await watcher.stop();stream?.stop();ipc.close();try{await unlink(lock);}catch{};};
}
