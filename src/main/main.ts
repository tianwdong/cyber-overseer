import {managedCli,launchManagedCli} from './managed-cli';
import {CliLiveTaskStream} from './cli-live-stream';
import {companionSummary,codexTaskUrl} from '../core/companion-summary';
import {UpdateChecker} from './updates';
import {UpdateDownloader} from './update-download';
import {RELEASES_URL} from '../core/updates';
import {scanUsage} from './usage-overview';
import {aggregateUsage} from '../core/usage-overview';
import {CompletionInbox} from './completion-inbox';
import {readTaskTitles} from './task-titles';
import {watchHealth,healthLabel} from '../core/watch-health';
import {petPlacement,type DockEdge} from '../core/pet-placement';
import {DutyJournal,type DutyKind} from './duty-journal';
import {loadWatchPreferences,saveWatchPreferences} from './watch-preferences';
import {watchSummary,taskExhausted} from '../core/attention';
import {PricingCatalog} from './pricing';
import {readAccountSupply,SupplyReadError,readUsage,repriceUsage} from './supply';
import type {SupplyState} from '../core/supply';
import {performanceLabel} from '../core/companion-performance';
import {durationOf,performances,recoveryPerformance,type Performance} from '../core/performance';
import {tr} from '../core/i18n';
import {defaultSettings,parseSettings} from '../core/settings';
import {loadSettings,saveSettings,readCodexLanguage} from './settings';
import {discoveryCandidates} from '../core/discovery';
import {CodexDesktop} from './codex-ipc';
import {LiveTaskStream} from './live-stream';
import { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell, Notification, dialog } from 'electron';
import { join,dirname } from 'node:path';
import { paths, runPython } from './platform';
import { characters, isCharacterId, type CharacterAction } from '../core/characters';
import { loadCharacter, saveCharacter } from './appearance';
import { mkdir, writeFile,readFile,rename,unlink } from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import { locateTask, edgeAnchor, type OverseerState, type DesktopSnapshot, type Task } from '../core/model';
import { readTasks, readTaskState } from './inventory';
import { observeDesktop } from './observer';
import { startWatcher } from './watch-service';

const demo = process.argv.includes('--demo') || process.argv.includes('--smoke');
const smoke = process.argv.includes('--smoke');
const artifactDir=app.isPackaged?join(app.getPath('temp'),'cyber-overseer-smoke'):join(app.getAppPath(),'artifacts');
if(smoke){const profile=join(artifactDir,'smoke-profile');mkdirSync(profile,{recursive:true,mode:0o700});app.setPath('userData',profile);app.setPath('sessionData',profile);}
const initialWatches=process.argv.flatMap((arg,i)=>arg==='--watch-thread'&&process.argv[i+1]?[process.argv[i+1]]:[]);
const ids = ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003'];
const sampleError = 'stream disconnected before completion: Transport error: network error: error decoding response body';
const demoTasks: Task[] = [
  { id: ids[0], title: '赛博督工 · 窗口定位', cwd: '/projects/cyber-overseer', updatedAt: Date.now(), status: 'failed', turnId: 'demo-turn-1', error: sampleError },
  { id: ids[1], title: '赛博督工 · 窗口定位', cwd: '/projects/cyber-overseer', updatedAt: Date.now(), status: 'running', turnId: 'demo-turn-2' },
  { id: ids[2], title: '文档整理', cwd: '/projects/notes', updatedAt: Date.now(), status: 'completed', turnId: 'demo-turn-3' },
];
let state: OverseerState = { character:'foreman',mode: demo ? 'demo' : 'live', tasks: demo ? demoTasks : [], selectedId: demo ? ids[0] : null,
  location: {kind:'unlocated', reason:'hidden'}, phase:'idle', message: demo ? '演练场：三个任务，两个同名。先找到正确的那一个。' : '读取本机任务，选择任务后启动自动督工。', snapshotAgeMs:null,watchingIds:[],autoAll:!demo,settings:{...defaultSettings},language:'zh',retryProgress:{} };
const updates=new UpdateChecker({currentVersion:app.getVersion(),platform:process.platform,arch:process.arch,cacheFile:join(smoke?app.getPath('userData'):paths.stateDir,'updates.json'),onChange:update=>{if(quitting)return;state.update={...update,download:downloads.state?.version===update.release?.version?downloads.state:undefined};publish();if(!demo&&automaticUpdatesEnabled()&&update.status==='available'&&update.release&&downloads.state?.version!==update.release.version)void downloads.download(update.release);void notifyUpdate();}});
const downloads=new UpdateDownloader({directory:join(app.getPath('userData'),'updates'),platform:process.platform,arch:process.arch,onChange:download=>{if(quitting)return;state.update={...updates.state,download};publish();}});
state.update=updates.state;
let updateTimer:ReturnType<typeof setInterval>,updateStartup:ReturnType<typeof setTimeout>,updateNotifying=false;
const automaticUpdatesEnabled=()=>state.settings?.checkForUpdates!==false;
function scheduleUpdates(){clearInterval(updateTimer);clearTimeout(updateStartup);if(demo||state.settings?.checkForUpdates===false)return;updateStartup=setTimeout(()=>void updates.check(),15000);updateTimer=setInterval(()=>void updates.check(),6*3600000);}
async function notifyUpdate(){
 if(demo||quitting||updateNotifying||state.settings?.checkForUpdates===false||updates.state.status!=='available'||!updates.state.release||!Notification.isSupported()||panel?.isVisible()&&!panel.isMinimized())return;
 updateNotifying=true;
 try{const release=updates.state.release;if(!await updates.claimNotification()||!automaticUpdatesEnabled())return;
  const n=new Notification({title:state.language==='en'?'Cyber Overseer update available':'赛博督工有新版本',body:state.language==='en'?`Version ${release.version} is ready. The installer downloads automatically; open the app to see progress.`:`版本 ${release.version} 已发布，安装包将自动下载，可在应用内查看进度。`,silent:true});
  n.on('click',()=>{showSettings();panel.webContents.send('open-settings');});n.show();
 }catch{/* An update reminder must never interrupt task watching. */}finally{updateNotifying=false;}
}
const pricing=new PricingCatalog(join(smoke?app.getPath('userData'):paths.stateDir,'pricing.json'),join(app.getAppPath(),'data','pricing.json'));
let supply:SupplyState={account:null,task:null,title:null};
let supplyBusy=false,lastAccountRead=0,lastTaskRead=0;
async function refreshSupply(){
 if(demo||supplyBusy)return;supplyBusy=true;
 const id=state.selectedId;
 try{
  if(Date.now()-lastAccountRead>(supply.accountError?30_000:300_000)){lastAccountRead=Date.now();try{supply.account=await readAccountSupply();delete supply.accountError;}catch(error){supply.accountError=error instanceof SupplyReadError?error.code:'unavailable';console.warn(JSON.stringify({event:'supply-unavailable',reason:supply.accountError}));if(supply.account)supply.account={...supply.account,stale:true};}}
  if(id&&(supply.task?.id!==id||Date.now()-lastTaskRead>30_000)){lastTaskRead=Date.now();try{const task=await readUsage(id);if(state.selectedId===id)supply.task=task;}catch{if(supply.task?.id!==id)supply.task=null;}}
  const prices=await pricing.load();if(supply.task)supply.task=repriceUsage(supply.task,prices.book,prices.error);if(prices.changed)console.log(JSON.stringify({event:'supply-ready',pricePath:pricing.path,priceModels:Object.keys(prices.book.models).length,quotaWindows:supply.account?.windows.length??0,taskPriced:supply.task?.estimatedUSD!=null,taskId:supply.task?.id}));
 }catch{console.warn('Supply refresh unavailable');}finally{supplyBusy=false;movePet();publish();}
}
function currentSupply():SupplyState {return {...supply,companion:companionSummary({...state,inbox:inbox.entries}),watch:watchSummary(state,recoveringTasks),task:supply.task?.id===state.selectedId?supply.task:null,title:state.tasks.find(t=>t.id===state.selectedId)?.title??null};}
let usageBusy=false,lastUsageRead=0;let usageContinueTimer:ReturnType<typeof setTimeout>;
async function refreshUsageOverview(){
 if(demo||quitting||usageBusy||Date.now()-lastUsageRead<(state.usageOverview?.pending?1000:120000))return;
 usageBusy=true;lastUsageRead=Date.now();
 try{const scan=await scanUsage(join(app.getAppPath(),'scripts','usage-scan.py'));const prices=await pricing.load();state.usageOverview=aggregateUsage(scan,prices.book,Date.now(),prices.error);state.usageError=false;}
 catch{state.usageError=true;}finally{usageBusy=false;publish();if(!quitting&&!state.usageError&&state.usageOverview?.pending)usageContinueTimer=setTimeout(()=>void refreshUsageOverview(),1100);}
}
let usageTimer:ReturnType<typeof setInterval>;
let supplyTimer:ReturnType<typeof setInterval>;
let panel: BrowserWindow;
let overlays = new Map<number, BrowserWindow>();
let tray: Tray;
let observing = false, polling = false, displayedId = ids[0], quitting = false, lastKey = '';
let pollTimer: ReturnType<typeof setInterval>;
let demoActionTimer: ReturnType<typeof setTimeout> | undefined;
const inbox=new CompletionInbox(join(smoke?app.getPath('userData'):paths.stateDir,'inbox.json'));
const journal=new DutyJournal(join(smoke?app.getPath('userData'):paths.stateDir,'duty.json'));
let notifying=false;const healthNotified=new Set<string>();
async function notifyAttention(){
 if(demo||notifying||state.settings?.notifyOnAttention===false||!Notification.isSupported())return;notifying=true;
 try{const issues=watchHealth(state);const active=new Set(issues.map(i=>`${i.kind}:${i.threadId??'all'}:${i.since}`));for(const key of healthNotified)if(!active.has(key))healthNotified.delete(key);
 for(const issue of issues){const key=`${issue.kind}:${issue.threadId??'all'}:${issue.since}`;if(healthNotified.has(key))continue;healthNotified.add(key);const n=new Notification({title:state.language==='en'?'Cyber Overseer · check connection':'赛博督工 · 看护连接异常',body:healthLabel(issue.kind,state.language==='en'),silent:true});n.on('click',()=>{if(issue.threadId)void command('select',issue.threadId).then(showSettings).catch(commandError);else showSettings();});n.show();}
 for(const id of watchSummary(state,recoveringTasks).attentionIds??[]){
 const task=state.tasks.find(t=>t.id===id)!;const live=state.liveStates?.[id];
 // Wait for an actual live state or an exhausted recovery, not a transient disk failure.
 const exhausted=taskExhausted(state,id),unconfirmed=state.retryProgress?.[id]?.unconfirmed;
 if(!exhausted&&!unconfirmed&&!(live?.connection==='live'&&live.work==='waiting'))continue;
 const turn=live?.turnId??task.turnId;if(!turn)continue;
 const kind=unconfirmed?'unconfirmed':exhausted?'exhausted':'waiting';
 if(!await journal.claimNotification(`${id}:${unconfirmed?.episodeId??turn}:${kind}`))continue;
 const n=new Notification({title:state.language==='en'?'Cyber Overseer · needs you':'赛博督工 · 需要你处理',body:task.title+(unconfirmed?(state.language==='en'?' · Recovery unconfirmed; no duplicate will be sent':' · 恢复结果未确认，请查看原任务'):''),silent:true});
 n.on('click',()=>{void command('select',id).then(()=>{showSettings();panel.webContents.send('open-task');}).catch(commandError);});n.show();
 }}catch{state.health??={};state.health.journalError=true;}finally{notifying=false;}
}
const recoveringTasks=new Set<string>();
const watchers=new Map<string,()=>Promise<void>>();
const pausedIds=new Set<string>();
const watchPreferencesFile=join(paths.stateDir,'watch-preferences.json');
let watchControl=Promise.resolve();
const discoverySeen=new Map<string,{updated:number;checked:number}>();
let discovering=false;
let discoveryTimer:ReturnType<typeof setInterval>;
const pendingStarts=new Map<string,Promise<void>>();
async function enableWatch(id:string){
  if(watchers.has(id))return;
  if(pendingStarts.has(id))return pendingStarts.get(id);
  const start=(async()=>{
      // Reading local history is not proof that we can control the original task.
      if(managedCli.get(id))await managedCli.get(id)!.read(id);
      else{
        const probe=new CodexDesktop();
        try{await probe.connect();await probe.owner(id);}
        catch{throw Error(state.language==='en'?'No control connection for this task. For CLI watching, use Launch CLI; existing standalone terminals cannot be taken over.':'未找到该任务的控制连接。CLI 看护请使用“启动 CLI”；已有的普通终端无法直接接管。');}
        finally{probe.close();}
      }
      const stop=await startWatcher(id,(message,action,attempt,context)=>{
        if(action==='continue'||action==='compact'||action==='checking')recoveringTasks.add(id);
        if(action==='recovered'||action==='exhausted'||action==='unconfirmed'||action==='completed'||action==='waiting')recoveringTasks.delete(id);
        if(action&&['failed','continue','compact','checking','recovered','exhausted','unconfirmed','completed','waiting'].includes(action)){
          if(action==='continue'||action==='compact'){state.health??={};state.health.dispatchAt=Date.now();}
          void journal.add(id,action as DutyKind,attempt,context).then(()=>{publish();}).catch(()=>{state.health??={};state.health.journalError=true;publish();});
        }
        console.log(JSON.stringify({at:new Date().toISOString(),threadId:id,message,action}));
        state.recoveryMessages??={};state.recoveryMessages[id]=message;
        movePet();publish();
        if(action==='continue'||action==='compact'||action==='recovered')playPet(action==='continue'?'whip':action,false,undefined,attempt??1,id);
        if(state.selectedId!==id)return;
        state.recoveryMessage=message;
        if(action==='checking'||action==='exhausted')movePet();
        void (managedCli.get(id)?.turn(id)??readTaskState(id)).then(status=>{state.tasks=state.tasks.map(t=>t.id===id?{...t,...status}:t);publish();}).catch(()=>{});
        if(action==='continue'||action==='compact'||action==='recovered'){
          state.phase='whipping';
          setTimeout(()=>{if(state.selectedId===id){state.phase='watching';movePet();publish();}},1300);
        }
        publish();
      },()=>streams.get(id)?.state,()=>state.settings!,progress=>{
        const before=state.retryProgress?.[id];
        state.retryProgress??={};state.retryProgress[id]=progress;
        if(JSON.stringify(before)!==JSON.stringify(progress)){movePet();publish();}
      },(kind,failed)=>{state.health??={};state.health.taskErrors??={};const errors=state.health.taskErrors[id]??={};if(failed){errors[kind]??=Date.now();}else delete errors[kind];publish();},turn=>{const task=state.tasks.find(t=>t.id===id);if(task)void inbox.add(task,turn).then(changed=>{state.inboxError=false;if(changed){publish();movePet();}}).catch(()=>{state.inboxError=true;publish();});});watchers.set(id,stop);
    state.health??={};state.health.connectionSince??={};state.health.connectionSince[id]=Date.now();
    console.log(JSON.stringify({event:'task-monitored',threadId:id,autoAll:state.autoAll}));
    if(!state.selectedId)state.selectedId=id;
    state.watchingIds=[...watchers.keys()];syncStreams();publish();
  })();
  pendingStarts.set(id,start);
  try{await start;}finally{pendingStarts.delete(id);}
}
async function refreshPausedTitles(){
  if(demo||quitting||state.autoAll)return;
  const titles=await readTaskTitles(paths.codexHome);let changed=false;
  state.tasks=state.tasks.map(task=>{const title=titles.get(task.id);if(!title||title===task.title)return task;changed=true;return {...task,title};});
  if(changed){publish();movePet();}
}
async function discoverTasks(){
  if(demo||quitting||!state.autoAll||discovering)return;
  discovering=true;
  const discovery=new CodexDesktop();
  try{
    await managedCli.scan();
    const diskRows=await readTasks().catch(error=>{if(managedCli.tasks.length)return [];throw error;});
    const rows=[...diskRows.filter(t=>!managedCli.get(t.id)),...managedCli.tasks];
    state.health??={};state.health.discoveredAt=Date.now();
    state.tasks=rows.map(t=>({...state.tasks.find(old=>old.id===t.id),...t}));state.inventoryError=undefined;delete state.health.discoveryFailedAt;
    const available=new Set(rows.map(t=>t.id));
    for(const [id,stop] of watchers)if(!available.has(id)){await stop();watchers.delete(id);}
    const candidates=discoveryCandidates(rows,new Set(watchers.keys()),pausedIds,discoverySeen,Date.now());
    let desktopConnected=false;
    if(candidates.some(t=>!managedCli.get(t.id)))try{await discovery.connect();desktopConnected=true;}catch{/* Managed CLI discovery remains available. */}
    for(let i=0;i<candidates.length;i+=4)await Promise.all(candidates.slice(i,i+4).map(async task=>{
      try{
        const cli=managedCli.get(task.id);
        if(!cli){if(!desktopConnected)return;await discovery.owner(task.id);}
        const current=cli?await cli.turn(task.id):await readTaskState(task.id);
        state.tasks=state.tasks.map(t=>t.id===task.id?{...t,...current}:t);
        // A live Desktop owner distinguishes open work from abandoned disk history.
        if(!state.autoAll||quitting||pausedIds.has(task.id))return;
        await enableWatch(task.id);
      }catch{/* No live owner: keep discovering without reviving stored history. */}
      finally{discoverySeen.set(task.id,{updated:task.updatedAt,checked:Date.now()});}
    }));
    state.watchingIds=[...watchers.keys()];syncStreams();movePet();publish();
  }catch{state.health??={};state.health.discoveryFailedAt??=Date.now();state.inventoryError='自动发现暂时失败，正在重试。已监看的任务继续运行。';publish();}
  finally{discovery.close();discovering=false;}
}
const streams=new Map<string,LiveTaskStream|CliLiveTaskStream>();
function syncStreams(){
  if(demo)return;
  const ids=new Set([...watchers.keys(),...(state.selectedId?[state.selectedId]:[])]);
  for(const [id,stream] of streams)if(!ids.has(id)||(!!managedCli.get(id)!==(stream instanceof CliLiveTaskStream))){stream.stop();streams.delete(id);delete state.liveStates?.[id];}
  for(const id of ids)if(!streams.has(id))streams.set(id,new (managedCli.get(id)?CliLiveTaskStream:LiveTaskStream)(id,live=>{
    state.liveStates??={};
    const previous=state.liveStates[id];
    const changed=!previous||previous.connection!==live.connection||previous.work!==live.work||previous.activity!==live.activity||previous.turnId!==live.turnId;
    state.liveStates[id]=live;
    state.health??={};state.health.connectionSince??={};
    if(live.connection==='live')delete state.health.connectionSince[id];else state.health.connectionSince[id]??=Date.now();
    if(changed&&watchers.has(id)&&live.connection==='live'&&(live.work==='failed'||live.work==='waiting'))void journal.add(id,live.work,undefined,live.turnId?{episodeId:live.turnId,failedTurnId:live.turnId,reason:live.activity==='compacting'?'compaction':'unknown'}:undefined).then(()=>publish()).catch(()=>{state.health??={};state.health.journalError=true;});
    if(live.connection==='live'&&(live.work==='waiting'||live.work==='review'||live.work==='idle'))recoveringTasks.delete(id);
    if(changed){console.log(JSON.stringify({event:'live-state',...live}));movePet();publish();}
  }));
}
const petInteractive=new Map<number,boolean>();
let petMenu:Menu|undefined;
const appearanceFile=join(paths.stateDir,'appearance.json');
let appearanceWrite=Promise.resolve();
let settingsWrite=Promise.resolve();
let languageTimer:ReturnType<typeof setInterval>;
async function refreshLanguage(){
  const choice=state.settings!.language;
  const next=choice==='codex'?await readCodexLanguage(app.getPreferredSystemLanguages()[0]??app.getLocale()):choice;
  if(choice!==state.settings!.language)return;
  if(next!==state.language){state.language=next;updateTray();movePet();publish();}
}
function updateTray(){
  if(!tray)return;
  tray.setContextMenu(Menu.buildFromTemplate([{label:tr('打开赛博督工',state.language),click:()=>panel.show()},{label:tr('设置',state.language),click:()=>{showSettings();panel.webContents.send('open-settings');}},{label:tr('退出',state.language),click:()=>{quitting=true;app.quit();}}]));
}

let animation={action:'watch' as CharacterAction,sequence:0,until:0,preview:false,performance:undefined as Performance|undefined,attempt:1,duration:1600};
let animationTaskId:string|null=null;
let excursion:{sequence:number;threadId:string|null;displayId:number;x:number;y:number;side:string;until:number}|undefined;
function playPet(action:CharacterAction,preview=false,performance?:Performance,attempt=2,threadId:string|null=state.selectedId??null){
  const duration=durationOf(performance??recoveryPerformance(action,attempt));
  animation={action,sequence:animation.sequence+1,until:Date.now()+duration,preview,performance,attempt,duration};animationTaskId=threadId;
  excursion=undefined;
  if(manualPet?.dock&&dragWindow===null){
    const d=screen.getAllDisplays().find(d=>d.id===manualPet!.displayId);
    if(d){
      let target={x:manualPet.dock==='left'?Math.min(d.bounds.width-100,manualPet.x+180):Math.max(100,manualPet.x-180),y:manualPet.y,side:manualPet.dock==='left'?'right':'left'};
      const l=state.location;
      if(l.kind==='located'&&l.threadId===threadId&&screen.getDisplayMatching(l.bounds).id===d.id){const a=edgeAnchor(l.bounds,d.workArea,l.row);target={x:a.x-d.bounds.x,y:a.y-d.bounds.y,side:a.side};}
      animation.until=Date.now()+60_000;
      excursion={sequence:animation.sequence,threadId,displayId:d.id,...target,until:animation.until};
    }
  }
  movePet();
}
function commandError(e:Error){state.recoveryMessage=e.message;showSettings();publish();}
function showSettings(){if(panel.isMinimized())panel.restore();panel.show();panel.focus();}
function resetPet(){void clearManualPet();observing=false;state.location={kind:'unlocated',reason:'hidden'};movePet();publish();}
function buildPetMenu(){
  return Menu.buildFromTemplate([
    {label:tr('设置与任务…',state.language),click:showSettings},
    {label:tr(state.autoAll?'暂停全局自动督工':'开启全局自动督工',state.language),enabled:!demo,click:()=>void command('global-auto').catch(commandError)},
    {label:tr('选择角色',state.language),submenu:characters.map(c=>({label:tr(c.name,state.language),type:'radio',checked:state.character===c.id,click:()=>void command('character',c.id).catch(commandError)}))},
    {label:tr('看一下催工动作',state.language),click:()=>playPet('preview')},
    {label:tr(state.selectedId&&watchers.has(state.selectedId)?'暂停此任务自动恢复':'启用此任务自动恢复',state.language),enabled:!demo&&!!state.selectedId,click:()=>void command('auto').catch(e=>{state.recoveryMessage=e.message;showSettings();publish();})},
    {type:'separator'},
    {label:state.language==='en'?'Resume automatic following':'恢复自动跟随',click:()=>{void clearManualPet();movePet();}},
    {label:tr('回到屏幕边缘',state.language),click:resetPet},
    {label:tr('退出赛博督工',state.language),click:()=>{quitting=true;app.quit();}},
  ]);
}

function secureWindow(win: BrowserWindow) {
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate', e => e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc,_p,callback) => callback(false));
}
function publish() {state.accountSupply=supply.account;state.inbox=inbox.entries;state.duty=journal.entries;void notifyAttention();state.pausedIds=[...pausedIds];state.recoveringIds=[...recoveringTasks];if (panel && !panel.isDestroyed()) panel.webContents.send('state', state); }
const placementFile=join(smoke?app.getPath('userData'):paths.stateDir,'pet-position.json');
let placementInstant=false;
async function clearManualPet(){manualPet=null;if(excursion){excursion=undefined;animation.until=0;animation.action='watch';animation.sequence++;}try{await unlink(placementFile);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')console.warn('Could not clear pet placement');}}
async function loadManualPet(){try{const p=JSON.parse(await readFile(placementFile,'utf8'));if(!Number.isFinite(p.x)||!Number.isFinite(p.y))return;const d=screen.getDisplayNearestPoint(p);manualPet={displayId:d.id,...petPlacement(p.x-d.bounds.x,p.y-d.bounds.y,d.bounds.width,d.bounds.height,p.dock==='left'||p.dock==='right'?p.dock:undefined),threadId:null};placementInstant=true;}catch{}}
let dragWindow:number|null=null;let manualPet:{displayId:number;x:number;y:number;dock?:DockEdge;threadId:string|null}|null=null;
function movePet() {
  if(quitting||dragWindow!==null)return;
  for(const [id,w] of overlays)if(w.isDestroyed())overlays.delete(id);
  if(!overlays.size)return;

  if(excursion&&Date.now()>=excursion.until){excursion=undefined;animation.until=0;}
  const location = animationTaskId&&Date.now()<animation.until&&state.location.kind==='located'&&state.location.threadId!==animationTaskId?{kind:'unlocated' as const,reason:'hidden' as const}:state.location;
  const petTaskId=Date.now()<animation.until?animationTaskId:state.selectedId;
  const animationProps={supply:currentSupply(),performance:animation.performance,attempt:animation.attempt,duration:animation.duration,retry:petTaskId?state.retryProgress?.[petTaskId]:undefined,observing:petTaskId?recoveringTasks.has(petTaskId):false,language:state.language,live:petTaskId?state.liveStates?.[petTaskId]:undefined,character:state.character,sequence:animation.sequence,preview:animation.preview,action:Date.now()<animation.until?animation.action:'watch'};
  if(excursion&&manualPet?.dock){
    const w=overlays.get(excursion.displayId);
    if(w){for(const [id,other] of overlays)if(id!==excursion.displayId)other.hide();w.showInactive();w.webContents.send('move-pet',{...animationProps,x:excursion.x,y:excursion.y,side:excursion.side,key:`excursion:${excursion.sequence}`,label:'',excursion:true});return;}
    excursion=undefined;
  }
  if(manualPet){
    const w=overlays.get(manualPet.displayId);
    if(w){for(const [id,other] of overlays)if(id!==manualPet.displayId)other.hide();w.showInactive();w.webContents.send('move-pet',{x:manualPet.x,y:manualPet.y,side:'right',key:'manual-placement',label:'',dock:manualPet.dock,placementInstant,...animationProps});placementInstant=false;return;}manualPet=null;
  }
  if (location.kind !== 'located') {
    const display=screen.getPrimaryDisplay();
    for(const [id,w] of overlays)if(id!==display.id)w.hide();
    const w=overlays.get(display.id);
    if(!w)return;
    state.phase='idle';lastKey='standby';
    w.showInactive();
    w.webContents.send('move-pet',{
      x:display.workArea.x+display.workArea.width-110-display.bounds.x,
      y:display.workArea.y+display.workArea.height-100-display.bounds.y,
      side:'right',key:'standby',...animationProps,
      label:state.watchingIds.length?'自动督工中 · 等待窗口':'待命 · 等待目标窗口',
    });
    return;
  }
  const display = screen.getDisplayMatching(location.bounds);
  const target = edgeAnchor(location.bounds, display.workArea, location.row);
  for (const [id,w] of overlays) if (id !== display.id) w.hide();
  const w = overlays.get(display.id);
  if (!w) return;
  const key = `${location.pid}:${location.windowId}:${location.threadId}:${target.x}:${target.y}`;
  if (key !== lastKey) { state.phase = 'walking'; lastKey = key; }
  w.showInactive();
  w.webContents.send('move-pet', { x:target.x-display.bounds.x, y:target.y-display.bounds.y, side:target.side,
    ...animationProps, label: demo ? '演练 · 已锁定任务' : '已锁定任务', key });
}
function demoSnapshot(): DesktopSnapshot {
  const bounds = panel.getBounds();
  return { observedAt: Date.now(), accessibility:true, windows:[{ id:1,pid:process.pid,bundleId:'com.openai.codex',bounds,
    visible:!panel.isMinimized() && panel.isVisible(),minimized:panel.isMinimized(),routes:[`codex://threads/${displayedId}`],selectedLinks:[] }] };
}
function explainLocation() {
  const l = state.location;
  if(l.kind==='located') {
    const task=state.tasks.find(t=>t.id===state.selectedId);
    state.message= task?.status==='failed' ? '已定位失败任务。启用自动督工后会自动恢复。' : '任务 ID 与可见窗口一致，督工已前往窗口边缘。';
    if(demo) state.message= '演练：任务 ID 已确认。点击“抽一鞭”查看恢复动画。';
    return;
  }
  state.message={permission:'辅助功能尚未授权，无法确认窗口中的任务。',stale:'位置证据已过期，督工回到待命状态。',hidden:'目标任务当前不可定位：可能隐藏，或窗口未暴露任务 ID。',ambiguous:'检测到多个目标或冲突的任务 ID，暂停定位。',unavailable:'窗口观察器不可用。先构建原生观察器，再启动观察。'}[l.reason];
}
async function tick() {
  if (polling || (!demo && !observing) || !state.selectedId) return;
  polling=true;
  const selected=state.selectedId;
  try {
    const snapshot=demo ? demoSnapshot() : await observeDesktop();
    if (selected!==state.selectedId || (!demo && !observing)) return;
    state.location=locateTask(selected,snapshot);
    state.snapshotAgeMs=Date.now()-snapshot.observedAt;
    if (!demo) {
      try {
        const status=await readTaskState(selected);
        if (selected!==state.selectedId || !observing) return;
        state.tasks=state.tasks.map(t=>t.id===selected?{...t,...status}:t);
      } catch { state.tasks=state.tasks.map(t=>t.id===selected?{...t,status:'unknown',error:undefined}:t); }
    }
    explainLocation();movePet();publish();
  } finally { polling=false; }
}
async function command(name: string, value?: string):Promise<OverseerState> {
  if(!demo&&(name==='auto'||name==='global-auto')){
    const id=state.selectedId;
    const run=watchControl.catch(()=>{}).then(async()=>{
      if(name==='global-auto'){
        const next=!state.autoAll;await saveWatchPreferences(watchPreferencesFile,{autoAll:next,pausedIds:[...pausedIds]});state.autoAll=next;
        if(!next){await Promise.all([...pendingStarts.values()]);for(const stop of watchers.values())await stop();watchers.clear();recoveringTasks.clear();}
        else {discoverySeen.clear();void discoverTasks();}
      }else if(id){
        if(watchers.has(id)){pausedIds.add(id);try{await saveWatchPreferences(watchPreferencesFile,{autoAll:!!state.autoAll,pausedIds:[...pausedIds]});}catch(e){pausedIds.delete(id);throw e;}
          await watchers.get(id)!();watchers.delete(id);recoveringTasks.delete(id);
        }else{
          const wasPaused=pausedIds.delete(id);try{await saveWatchPreferences(watchPreferencesFile,{autoAll:!!state.autoAll,pausedIds:[...pausedIds]});await enableWatch(id);}catch(e){if(wasPaused){pausedIds.add(id);await saveWatchPreferences(watchPreferencesFile,{autoAll:!!state.autoAll,pausedIds:[...pausedIds]});}throw e;}
        }
      }
      state.watchingIds=[...watchers.keys()];syncStreams();publish();movePet();
    });watchControl=run;await run;return state;
  }
  if(name==='launch-cli'){
    if(!demo){const result=await dialog.showOpenDialog(panel,{title:state.language==='en'?'Choose a CLI project':'选择 CLI 项目文件夹',properties:['openDirectory']});
      if(!result.canceled&&result.filePaths[0]){await launchManagedCli(result.filePaths[0],join(__dirname,'cli-launcher.py'));state.message=state.language==='en'?'Codex CLI is opening in a terminal. It follows your automatic watch setting.':'正在终端中打开 Codex CLI，将按当前自动看护设置运行。';publish();}}
  }else if(name==='check-app-update'){if(demo)state.update={currentVersion:app.getVersion(),status:'current',checkedAt:Date.now()};else{await updates.check(true);if(updates.state.release&&!downloads.readyPath(updates.state.release.version))void downloads.download(updates.state.release);}publish();
  }else if(name==='open-app-update'){const latest=demo?state.update:updates.state;if(value&&latest?.release?.version!==value)throw Error('Update information changed');if(!demo&&latest?.release){const installer=downloads.readyPath(latest.release.version);if(installer){const error=await shell.openPath(installer);if(error)throw Error(error);}else void downloads.download(latest.release);}
  }else if(name==='open-codex'){if(managedCli.get(value??''))throw Error(state.language==='en'?'This task is running in its CLI terminal. Switch to that terminal.':'该任务运行在 CLI 中，请返回启动它的终端。');const url=codexTaskUrl({...state,inbox:inbox.entries},value??'');if(!demo)await shell.openExternal(url);
  }else if(name==='inbox-read-many'){const ids:unknown=JSON.parse(value??'null');if(!Array.isArray(ids)||ids.length>100||!ids.every(id=>typeof id==='string'))throw Error('Invalid inbox selection');await inbox.markReadMany(ids);state.inboxError=false;publish();movePet();
  }else if(name==='inbox-read'){await inbox.markRead(value??'');state.inboxError=false;publish();movePet();
  }else if(name==='check-recovery'){
    if(!demo&&state.selectedId){const id=state.selectedId,status=await (managedCli.get(id)?.turn(id)??readTaskState(id));state.tasks=state.tasks.map(t=>t.id===id?{...t,...status}:t);state.message=state.language==='en'?'Task state refreshed. Receipts are still checked automatically.':'已重新读取任务状态，恢复回执仍在自动核对。';}
    publish();
  }else if(name==='clear-duty'){if(state.selectedId)await journal.clear(state.selectedId);publish();
  }else if(name==='pricing'){await pricing.load();shell.showItemInFolder(pricing.path);
  }else if(name==='settings'){
    const next=parseSettings(JSON.parse(value??'null'));
    settingsWrite=settingsWrite.catch(()=>{}).then(async()=>{if(!demo)await saveSettings(next);const changed=state.settings?.checkForUpdates!==next.checkForUpdates;state.settings=next;if(changed)scheduleUpdates();await refreshLanguage();updateTray();movePet();publish();});
    await settingsWrite;
  }else if(name==='character'){
    if(!isCharacterId(value))throw new Error('Unknown character');
    const id=value;
    appearanceWrite=appearanceWrite.catch(()=>{}).then(async()=>{if(!demo)await saveCharacter(appearanceFile,id);state.character=id;playPet('preview');publish();});
    await appearanceWrite;
  }else if(name==='preview-performance'){
    if(!performances.some(p=>p.id===value))throw new Error('Unknown performance');
    playPet('preview',true,value as Performance);
  }else if(name==='preview-character'){
    if(value&&!['whip','compact','recovered'].includes(value))throw new Error('Unknown animation');
    playPet((value??'preview') as CharacterAction,true);
  }else if (name==='select') {
    if (!state.tasks.some(t=>t.id===value)) throw new Error('Unknown task');
    if (demoActionTimer) clearTimeout(demoActionTimer);
    animation.until=0;animation.sequence++;state.selectedId=value!;state.recoveryMessage=undefined;state.phase='idle';state.location={kind:'unlocated',reason:'hidden'};
    syncStreams();movePet();publish();void refreshSupply();await tick();
  } else if(name==='read-tasks' && !demo) {
    try {state.tasks=await readTasks();state.inventoryError=undefined;state.message='选择任务即可查看实时状态；启用自动督工后持续恢复该任务。';}
    catch { state.inventoryError='无法读取 Codex 本地任务索引，可能版本不兼容或文件不可用。'; }
    publish();
  } else if(name==='observe' && !demo) {
    observing=!observing;
    if(!observing){ state.location={kind:'unlocated',reason:'hidden'};movePet();state.message='已停止观察。';publish(); }
    else await tick();
  } else if(name==='show-demo' && demo) {
    displayedId=state.selectedId!;await tick();
  } else if(name==='hide-demo' && demo) {
    displayedId=ids.find(id=>id!==state.selectedId)!;await tick();
  } else if(name==='whip-demo' && demo && state.location.kind==='located') {
    const id=state.selectedId;
    state.phase='whipping';state.message='演练：扬鞭 → continue → 检查复工。没有向 Codex 发送输入。';
    playPet('preview');publish();
    if(demoActionTimer)clearTimeout(demoActionTimer);
    demoActionTimer=setTimeout(()=>{
      if(state.selectedId!==id)return;
      state.tasks=state.tasks.map(t=>t.id===id?{...t,status:'running',error:undefined}:t);
      state.phase='watching';state.message='演练完成：目标任务复工，同名任务未受影响。';movePet();publish();
    },1300);
  } else if(name==='close') panel.hide();
  return state;
}
async function createOverlays() {
  dragWindow=null;
  overlays.forEach(w=>w.destroy());overlays.clear();petInteractive.clear();
  for(const d of screen.getAllDisplays()) {
    const w=new BrowserWindow({...d.bounds,transparent:true,frame:false,focusable:false,acceptFirstMouse:true,skipTaskbar:true,show:false,resizable:false,hasShadow:false,
      webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:smoke&&process.argv.includes('--interface-only'),backgroundThrottling:!(smoke&&process.argv.includes('--interface-only'))}});
    secureWindow(w);w.setAlwaysOnTop(true,'floating');w.setIgnoreMouseEvents(true,{forward:true});w.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true});
    await w.loadFile(join(__dirname,'overlay.html'));overlays.set(d.id,w);
  }
  lastKey='';movePet();
}
app.name='Cyber Overseer';
app.whenReady().then(async()=>{
  if(process.platform==='win32')app.setAppUserModelId('CyberOverseer.Desktop');
  if(!demo)try{await inbox.load();}catch{state.inboxError=true;}
  if(!demo)try{await journal.load();}catch{state.health={journalError:true};}

  if(!demo){const watchPrefs=await loadWatchPreferences(watchPreferencesFile);state.autoAll=watchPrefs.autoAll;watchPrefs.pausedIds.forEach(id=>pausedIds.add(id));state.pausedIds=[...pausedIds];state.settings=await loadSettings();state.language=state.settings.language==='codex'?await readCodexLanguage(app.getPreferredSystemLanguages()[0]??app.getLocale()):state.settings.language;try{state.character=await loadCharacter(appearanceFile);}catch{console.warn('外观设置无法读取，使用默认角色。');}}
  const area=screen.getPrimaryDisplay().workArea;
  panel=new BrowserWindow({width:Math.min(1120,area.width-100),height:Math.min(780,area.height-70),minWidth:840,minHeight:620,
    title:'Cyber Overseer · 赛博督工',backgroundColor:'#14181d',titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',
    webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  secureWindow(panel);
  ipcMain.handle('state',event=>{if(event.sender!==panel.webContents)throw new Error('Unknown sender');return state;});
  ipcMain.handle('command',(event,name,value)=>{if(event.sender!==panel.webContents || typeof name!=='string' || (value!==undefined&&typeof value!=='string'))throw new Error('Invalid command');return command(name,value);});
  ipcMain.on('pet-pointer',(event,over)=>{
    const w=[...overlays.values()].find(w=>w.webContents===event.sender);
    if(!w||typeof over!=='boolean')return;
    petInteractive.set(w.id,over);w.setIgnoreMouseEvents(dragWindow===w.id?false:!over,{forward:true});
  });
  ipcMain.handle('pet-drag',async(event,phase,x,y)=>{
    const entry=[...overlays.entries()].find(([,w])=>w.webContents===event.sender);if(!entry||!['start','end','cancel'].includes(phase)||!Number.isFinite(x)||!Number.isFinite(y))throw Error('Invalid drag');
    const [displayId,w]=entry,d=screen.getAllDisplays().find(d=>d.id===displayId)!;
    if(phase==='start'){excursion=undefined;animation.until=0;animation.action='watch';animation.sequence++;dragWindow=w.id;w.setIgnoreMouseEvents(false);return {x,y};}
    if(dragWindow!==w.id)throw Error('Drag not owned');dragWindow=null;
    if(phase==='end'){
      const world={x:x+d.bounds.x,y:y+d.bounds.y},target=screen.getDisplayNearestPoint(world);
      const placed=petPlacement(world.x-target.bounds.x,world.y-target.bounds.y,target.bounds.width,target.bounds.height);
      x=placed.x;y=placed.y;manualPet={displayId:target.id,...placed,threadId:null};placementInstant=true;
      {try{await mkdir(dirname(placementFile),{recursive:true});await writeFile(placementFile+'.tmp',JSON.stringify({x:x+target.bounds.x,y:y+target.bounds.y,dock:manualPet.dock}),{mode:0o600});await rename(placementFile+'.tmp',placementFile);}catch{console.warn('Could not persist pet placement');}}
    }
    movePet();return {x,y,dock:manualPet?.dock};
  });
  ipcMain.handle('pet-action',async(event,action,value)=>{
    const w=[...overlays.values()].find(w=>w.webContents===event.sender);
    if(!w)throw new Error('Unknown overlay');
    if(value!==undefined&&typeof value!=='string')throw new Error('Invalid pet target');
    if(action==='performance-done'){
      if(excursion&&String(excursion.sequence)===value&&overlays.get(excursion.displayId)?.webContents===event.sender){excursion=undefined;animation.until=0;animation.action='watch';animation.sequence++;movePet();}
    }else if(action==='open-codex'){
      await command('open-codex',value);
    }else if(action==='result'){
      if(!inbox.entries.some(e=>e.id===value))throw new Error('Unknown result');
      showSettings();publish();panel.webContents.send('open-inbox',value);
    }else if(action==='task'){
      await command('select',value);showSettings();panel.webContents.send('open-task');
    }else if(action==='settings'){
      const target=watchSummary(state,recoveringTasks).targetId;
      if(target)await command('select',target);
      showSettings();panel.webContents.send('open-task');
    }
    else if(action==='pricing'){await pricing.load();shell.showItemInFolder(pricing.path);}
    else if(action==='menu'){
      petMenu?.closePopup();petMenu=buildPetMenu();petMenu.popup({window:w});
    }else throw new Error('Unknown pet action');
  });
  await panel.loadFile(join(__dirname,'dashboard.html'));
  if(!smoke)await loadManualPet();
  await createOverlays();
  panel.on('close',e=>{if(!quitting&&!smoke){e.preventDefault();panel.hide();if(demo){state.location={kind:'unlocated',reason:'hidden'};}movePet();}});
  panel.on('move',()=>{if(demo)void tick();});panel.on('resize',()=>{if(demo)void tick();});panel.on('minimize',()=>{if(demo)void tick();});
  // nativeImage does not support SVG data URLs. Use packaged native formats.
  const iconPath=join(__dirname,'assets','icon',process.platform==='win32'?'icon.ico':'icon.png');
  const sourceIcon=nativeImage.createFromPath(iconPath);
  if(sourceIcon.isEmpty())throw Error('Packaged tray icon could not be decoded');
  const icon=sourceIcon.resize({width:18,height:18});
  if(smoke){await mkdir(artifactDir,{recursive:true});await writeFile(join(artifactDir,'tray-icon.png'),icon.toPNG());console.log('tray-icon-ok');}
  tray=new Tray(process.platform==='win32'?iconPath:icon);tray.setToolTip('Cyber Overseer');updateTray();
  tray.on('click',()=>panel.show());
  if(!smoke){screen.on('display-metrics-changed',()=>void createOverlays());screen.on('display-added',()=>void createOverlays());screen.on('display-removed',()=>void createOverlays());}
  pollTimer=setInterval(()=>void tick().catch(()=>{state.location={kind:'unlocated',reason:'unavailable'};movePet();publish();}),1000);
  await tick();publish();
  if(!demo){
    await command('read-tasks');
    await updates.load();publish();scheduleUpdates();
    void refreshUsageOverview();usageTimer=setInterval(()=>void refreshUsageOverview(),15000);
    void refreshSupply();supplyTimer=setInterval(()=>void refreshSupply(),5000);
    for(const id of new Set(initialWatches)){try{await command('select',id);await command('auto');}catch(error){state.message=error instanceof Error?error.message:'Unable to start task watching';publish();}}
    languageTimer=setInterval(()=>void refreshLanguage(),5000);
    discoveryTimer=setInterval(()=>{void discoverTasks();void refreshPausedTitles();},5000);void discoverTasks();
    console.log(JSON.stringify({event:'desktop-ready',petVisible:[...overlays.values()].some(w=>w.isVisible()),petMode:state.location.kind==='located'?'target':'standby',character:state.character,settings:state.settings,language:state.language}));
  }
  if(smoke && app.isPackaged){
    const {stdout}=await runPython(['-c','import sys,sqlite3,json; print(json.dumps({"executable":sys.executable,"sqlite":sqlite3.sqlite_version}))'],{timeout:5000,maxBuffer:4096});
    if(!JSON.parse(stdout).executable.startsWith(join(process.resourcesPath,'python')))throw Error('Packaged smoke must use bundled Python');
    console.log('packaged-runtime-ok');
  }
  if(smoke) await (process.argv.includes('--interface-only')?interfaceSmoke():smokeTest());
}).catch(e=>{console.error(e);app.exit(1);});
app.on('before-quit',()=>{quitting=true;clearInterval(updateTimer);clearTimeout(updateStartup);clearInterval(usageTimer);clearTimeout(usageContinueTimer);clearInterval(supplyTimer);clearInterval(pollTimer);clearInterval(discoveryTimer);clearInterval(languageTimer);if(demoActionTimer)clearTimeout(demoActionTimer);for(const stream of streams.values())stream.stop();for(const stop of watchers.values())void stop();});
app.on('window-all-closed',()=>{});

async function sampleUsageOverview(){
 const book=(await pricing.load()).book,now=Date.now(),model=Object.keys(book.models)[0];
 state.usageOverview=aggregateUsage({samples:Array.from({length:7},(_,i)=>({at:now-i*86400000,threadId:ids[i%3],project:i%2?'C:/Projects/ModelDial':'/projects/cyber-overseer',model,input:(i+1)*12000,cached:(i+1)*4000,cacheWrite:0,output:(i+1)*2000,contextTokens:16000})),files:3,scanned:3,pending:0,errors:0,excludedForks:1,fetchedAt:now},book,now);
}
async function excursionSmoke(){
 const savedState={...state},savedPlacement=manualPet,savedAnimation=animation,savedTask=animationTaskId;
 clearInterval(pollTimer);const display=screen.getPrimaryDisplay(),pet=overlays.get(display.id)!;
 const check=(ok:boolean,message:string)=>{if(!ok)throw Error(message);};
 const pause=()=>new Promise(r=>setTimeout(r,100));
 state.location={kind:'located',threadId:ids[0],windowId:1,pid:process.pid,bounds:{x:display.bounds.x+350,y:display.bounds.y+150,width:400,height:350},evidence:'route'};state.selectedId=ids[0];
 for(const [character,edge] of [['mechanic','left'],['mechanic','right'],['foreman','left'],['medic','right'],['ranger','left']] as const){
  state.character=character;manualPet={displayId:display.id,...petPlacement(edge==='left'?22:display.bounds.width-22,250,display.bounds.width,display.bounds.height,edge),threadId:null};
  const home=JSON.stringify(manualPet);placementInstant=true;animation.until=0;movePet();await pause();
  for(let wait=0;wait<30&&!await pet.webContents.executeJavaScript(`document.getElementById('pet-hit').dataset.docked===${JSON.stringify(edge)}`);wait++)await pause();
  check(await pet.webContents.executeJavaScript(`document.getElementById('pet-hit').dataset.docked===${JSON.stringify(edge)}`),'fixture must begin docked');
  playPet('whip',false,undefined,1,ids[1]);
  const outgoing=excursion!;check(!!outgoing&&outgoing.threadId===ids[1],'non-selected recovery must leave dock');
  check(Math.abs(outgoing.x-manualPet.x)===180,'non-selected recovery must not approach a different task window');
  await pet.webContents.executeJavaScript(`window.overseer.petAction('performance-done',${JSON.stringify(String(outgoing.sequence-1))})`);check(!!excursion,'old animation receipt ended current outing');
  let walked=false,acted=false,returned=false;const start=Date.now();
  while(Date.now()-start<16000){
   await pause();const pose=await pet.webContents.executeJavaScript('({dock:document.getElementById("pet-hit").dataset.docked,mode:document.getElementById("pet-hit").dataset.performance})');
   if(!pose.dock&&pose.mode==='walk')walked=true;
   if(!pose.dock&&pose.mode==='tap'&&!acted){acted=true;await writeFile(join(artifactDir,`excursion-${character}-${edge}.png`),(await pet.webContents.capturePage()).toPNG());}
   if(acted&&pose.dock===edge){returned=true;break;}
  }
  check(walked&&acted&&returned,`${character}/${edge} must walk out, act, and return`);
  check(JSON.stringify(manualPet)===home&&state.selectedId===ids[0],'outing changed saved placement or selected task');
 }
 playPet('whip',false,undefined,1,ids[0]);
 const anchor=edgeAnchor(state.location.bounds,display.workArea);
 check(excursion?.x===anchor.x-display.bounds.x&&excursion?.y===anchor.y-display.bounds.y,'verified task must use its own window anchor');
 await pet.webContents.executeJavaScript("window.overseer.petDrag('start',200,250)");
 check(!excursion,'drag must cancel the outing');
 await pet.webContents.executeJavaScript("window.overseer.petDrag('cancel',200,250)");
 state=savedState;manualPet=savedPlacement;animation=savedAnimation;animationTaskId=savedTask;excursion=undefined;placementInstant=true;movePet();
 console.log(JSON.stringify({ok:true,checks:['all four docked companions leave and return','cat works from both edges','action plays after arrival','non-selected recovery animates without selecting or sending','stale animation receipts ignored','manual placement preserved']}));
}
async function updateSmoke(){
 const saved={...state},pause=()=>new Promise(r=>setTimeout(r,150)),check=(ok:boolean,message:string)=>{if(!ok)throw Error(message);};
 for(const [language,width,version] of [['en',840,'9.9.9'],['zh',1120,'9.9.10']] as const){
  state.language=language;state.update={currentVersion:app.getVersion(),status:'available',checkedAt:Date.now(),release:{version,url:`${RELEASES_URL}/tag/v${version}`,prerelease:true}};panel.setSize(width,680);publish();await pause();
  check(await panel.webContents.executeJavaScript('!document.getElementById("app-update-banner").hidden'),'new release banner missing');
  await panel.webContents.executeJavaScript('document.getElementById("show-app-update").click();document.querySelector(".app-updates").scrollIntoView({block:"end"})');await pause();
  const visible=await panel.webContents.executeJavaScript(`(()=>{const d=document.getElementById('settings-dialog'),r=d.getBoundingClientRect();return {open:d.open,text:document.querySelector('.app-updates').textContent,inside:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,width:d.scrollWidth<=d.clientWidth};})()`);
  check(visible.open&&visible.inside&&visible.width&&visible.text.includes(version),'update settings overflow or version missing');
  if(language==='en')check(!/[\u4e00-\u9fff]/.test(visible.text),'update settings English incomplete');
  await writeFile(join(artifactDir,`app-update-${language}-${width}.png`),(await panel.webContents.capturePage()).toPNG());
  for(const status of ['downloading','verifying','error','ready'] as const){
   state.update={...state.update!,download:{version,status,received:50,total:100}};publish();await pause();
   const downloadUI=await panel.webContents.executeJavaScript(`({disabled:document.getElementById('download-app-update').disabled,text:document.getElementById('app-update-status').textContent,button:document.getElementById('download-app-update').textContent})`);
   check(downloadUI.disabled===(status==='downloading'||status==='verifying'),'download button enabled while transferring');
   if(status==='downloading')check(downloadUI.text.includes('50%'),'download progress missing');
   if(status==='ready')check(downloadUI.button===(language==='en'?'Open installer':'打开安装包'),'installer action missing');
   await writeFile(join(artifactDir,`app-update-${language}-${status}.png`),(await panel.webContents.capturePage()).toPNG());
  }
  const selected=state.selectedId;await panel.webContents.executeJavaScript('document.getElementById("download-app-update").click()');await pause();check(state.selectedId===selected,'update download changed the task');
  state.update={...state.update,status:'error',error:'network'};publish();await pause();
  check(await panel.webContents.executeJavaScript('!document.getElementById("download-app-update").hidden && !document.getElementById("app-update-status").textContent.includes("最新") && !document.getElementById("app-update-status").textContent.includes("latest")'),'failed check claims current or lost known release');
  await panel.webContents.executeJavaScript('document.getElementById("check-app-update").click()');await pause();check(state.update?.status==='current','manual update check did not finish');
  check(await panel.webContents.executeJavaScript('document.getElementById("app-update-banner").hidden && document.getElementById("download-app-update").hidden'),'no-update check left stale download banner');
  await panel.webContents.executeJavaScript('document.getElementById("auto-update-check").checked=false;document.getElementById("settings-form").requestSubmit()');await pause();check(state.settings?.checkForUpdates===false,'update preference not saved');
  await panel.webContents.executeJavaScript('document.getElementById("close-settings").click()');
 }
 state=saved;publish();console.log(JSON.stringify({ok:true,checks:['bilingual update notice at 840/1120','manual update check','offline preserves last release without claiming current','automatic check preference','download does not touch tasks']}));
}
async function companionSmoke(){
 const check=(ok:boolean,message:string)=>{if(!ok)throw Error(message);},pause=()=>new Promise(r=>setTimeout(r,140));
 clearInterval(pollTimer);const saved={...state},savedInbox=inbox.entries,savedSupply=supply,savedPlacement=manualPet;
 const display=screen.getPrimaryDisplay(),pet=overlays.get(display.id)!;
 state.mode='live';state.health={};state.retryProgress={};state.watchingIds=[ids[0],ids[1]];state.selectedId=ids[0];state.inventoryError=undefined;
 state.tasks=demoTasks.map((t,i)=>({...t,title:i<2?'窗口定位 · 同名任务':'文档整理',status:'running',error:undefined}));
 state.liveStates=Object.fromEntries(ids.slice(0,2).map((id,i)=>[id,{threadId:id,connection:'live' as const,work:'running' as const,activity:i?'command' as const:'files' as const,label:i?'执行命令':'修改文件',updatedAt:Date.now()}]));
 inbox.entries=[{id:'companion-result',threadId:ids[1],turnId:'companion-turn',title:'Saved title',cwd:'/projects/example',at:Date.now()-60000,excerpt:'界面已调整，验证记录已整理。\nThe interface is ready for review.',read:false}];
 supply={account:{windows:[{id:'codex',name:'Codex',used:25,minutes:10080,resetAt:Date.now()+86400000}],resets:null,fetchedAt:Date.now(),stale:false},task:null,title:null};
 manualPet={displayId:display.id,x:display.bounds.width-190,y:display.bounds.height-170,threadId:null};placementInstant=true;animation.until=0;
 for(const language of ['zh','en'] as const){
  state.language=language;movePet();publish();await pause();
  await pet.webContents.executeJavaScript(`document.dispatchEvent(new MouseEvent('mouseleave'));(()=>{const h=document.getElementById('pet-hit').getBoundingClientRect();document.dispatchEvent(new MouseEvent('mousemove',{clientX:h.x+h.width/2,clientY:h.y+70}));})()`);
  for(let wait=0;wait<30&&await pet.webContents.executeJavaScript('document.getElementById("supply-card").hidden');wait++)await pause();
  const card=await pet.webContents.executeJavaScript(`(()=>{const c=document.getElementById('supply-card'),r=c.getBoundingClientRect();return {hidden:c.hidden,text:c.textContent,tasks:Array.from(c.querySelectorAll('.companion-task')).map(t=>t.dataset.threadId),x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)};})()`);
  check(!card.hidden&&card.tasks[0]===ids[0]&&card.tasks[1]===ids[1],'companion hover lost exact task identities');
  check(card.text.includes(language==='zh'?'修改文件':'Editing files')||language==='en'&&card.text.includes('Changing files'),'live activity missing from hover: '+card.text);
  check(!inbox.entries[0].read,'hover marked a result read');
  check(card.x>=0&&card.y>=0&&card.x+card.width<=display.bounds.width&&card.y+card.height<=display.bounds.height,'companion card outside display');
  await writeFile(join(artifactDir,`companion-hover-${language}.png`),(await pet.webContents.capturePage({x:card.x,y:card.y,width:card.width,height:card.height})).toPNG());
 }
 await pet.webContents.executeJavaScript(`window.pressedTask=document.querySelector('.companion-task button');window.pressedTask.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));`);
 state.liveStates[ids[0]].activity='command';state.liveStates[ids[0]].label='执行命令';movePet();await pause();
 check(await pet.webContents.executeJavaScript('window.pressedTask.isConnected'),'live refresh removed a pressed task button');
 await pet.webContents.executeJavaScript(`document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));`);await pause();
 await pet.webContents.executeJavaScript(`document.getElementById('pet-result').click()`);await pause();
 check(inbox.entries[0].read,'result handoff did not mark displayed entry read');
 check(await pet.webContents.executeJavaScript('document.getElementById("supply-card").hidden'),'opening result must dismiss hover card');
 check(await panel.webContents.executeJavaScript('document.getElementById("inbox-dialog").open && document.querySelector("details[data-id=companion-result]").open'),'result handoff opened wrong entry');
 check(await pet.webContents.executeJavaScript('document.getElementById("pet-result").hidden'),'read result badge did not clear');
 await pet.webContents.executeJavaScript(`window.overseer.petAction('task',${JSON.stringify(ids[1])})`);check(state.selectedId===ids[1],'task card selected wrong duplicate title');
 let rejected=false;try{await pet.webContents.executeJavaScript(`window.overseer.petAction('open-codex','unknown')`);}catch{rejected=true;}check(rejected,'native navigation accepted unknown task');
 // Use a known model plus a missing internal rate; never contact a model in smoke.
 const book=(await pricing.load()).book,now=Date.now(),model=Object.keys(book.models)[0];
 state.usageOverview=aggregateUsage({samples:[model,'codex-auto-review'].map(model=>({at:now,threadId:ids[0],project:'/projects/example',model,input:1000000,cached:0,cacheWrite:0,output:1000,contextTokens:1000000})),files:1,scanned:1,pending:0,errors:0,excludedForks:0,fetchedAt:now},book,now);publish();
 panel.show();await panel.webContents.executeJavaScript('document.getElementById("nav-overview").click();document.querySelector("[data-period=today]").click();document.getElementById("overview").scrollTop=0');await pause();
 check(await panel.webContents.executeJavaScript('document.querySelector(".usage-total").textContent.includes("$") && document.querySelector(".usage-pricing-reason").textContent.includes("codex-auto-review")'),'missing rate hid known spend');
 await writeFile(join(artifactDir,'partial-pricing-en.png'),(await panel.webContents.capturePage()).toPNG());
 state.language='zh';publish();await pause();await writeFile(join(artifactDir,'partial-pricing-zh.png'),(await panel.webContents.capturePage()).toPNG());
 for(const trigger of ['pet-hit','supply-settings']){
  await pet.webContents.executeJavaScript(`document.dispatchEvent(new MouseEvent('mouseleave'));(()=>{const h=document.getElementById('pet-hit').getBoundingClientRect();document.dispatchEvent(new MouseEvent('mousemove',{clientX:h.x+h.width/2,clientY:h.y+70}));})()`);await new Promise(r=>setTimeout(r,380));
  check(await pet.webContents.executeJavaScript('!document.getElementById("supply-card").hidden'),'card must reopen on fresh hover');
  await pet.webContents.executeJavaScript(`document.getElementById('supply-pin').click();document.getElementById(${JSON.stringify(trigger)}).click();${trigger==='pet-hit'?"document.getElementById('pet-hit').click();":''}`);
  await new Promise(r=>setTimeout(r,450));movePet();await pause();
  check(panel.isVisible()&&await pet.webContents.executeJavaScript('document.getElementById("supply-card").hidden'),'opening panel must close pinned card without reopening on updates');
 }
 await writeFile(join(artifactDir,'panel-open-card-dismissed.png'),(await pet.webContents.capturePage()).toPNG());
 state=saved;inbox.entries=savedInbox;supply=savedSupply;manualPet=savedPlacement;publish();movePet();
 console.log(JSON.stringify({ok:true,checks:['daily activity hover in both languages','exact duplicate-title task selection','read only after opening exact result','unread badge clears immediately','pressed button survives stream update','known spend preserved with missing internal rate','native navigation validates identity without sending a turn']}));
}
async function smokeTest() {
  await panel.webContents.executeJavaScript('document.getElementById("nav-tasks").click()');
  const assert=(ok:boolean,message:string)=>{if(!ok)throw new Error(message);};
  assert(app.getPath('sessionData')===join(artifactDir,'smoke-profile'),'smoke must not share the live Chromium cache');
  await command('select',ids[1]);assert(state.location.kind==='unlocated','same title selected wrong task');
  await command('show-demo');assert(state.location.kind==='located','visible selected task not located');
  await command('hide-demo');assert(state.location.kind==='unlocated','hidden task not released');
  const standby=overlays.get(screen.getPrimaryDisplay().id)!;
  assert(standby.isVisible(),'unlocated task must retain a visible standby character');
  await new Promise(r=>setTimeout(r,1800));
  const pixels=await standby.webContents.executeJavaScript('(()=>{const c=document.getElementById("pet");const p=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<p.length;i+=4)if(p[i]>0)n++;return n;})()');
  assert(pixels>2000,'standby canvas did not draw the character');
  const dir=artifactDir;await mkdir(dir,{recursive:true});
  await writeFile(join(dir,'standby.png'),(await standby.webContents.capturePage()).toPNG());
  // Exercise the actual overlay in both directions, deliberately opposing the dock side.
  clearInterval(pollTimer);
  const travelFrames:Array<{x:number;scale:number;turning:boolean}>=[];
  if(process.argv.includes('--locomotion-video'))await standby.webContents.executeJavaScript(`(()=>{
    const pet=document.getElementById('pet'),r=document.getElementById('pet-hit').getBoundingClientRect(),origin={x:r.x+r.width/2,y:r.y+100},c=document.createElement('canvas');c.width=800;c.height=380;
    const ctx=c.getContext('2d'),stream=c.captureStream(60),rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3000000}),chunks=[];let running=true;
    function frame(){ctx.fillStyle='#20282d';ctx.fillRect(0,0,800,380);ctx.strokeStyle='#657572';ctx.beginPath();ctx.moveTo(0,334);ctx.lineTo(800,334);ctx.stroke();const ratio=pet.width/innerWidth;ctx.drawImage(pet,(origin.x-240)*ratio,(origin.y-120)*ratio,400*ratio,190*ratio,0,0,800,380);if(running)requestAnimationFrame(frame);}frame();
    const done=new Promise(resolve=>{rec.ondataavailable=e=>chunks.push(e.data);rec.onstop=()=>{running=false;stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};});rec.start();window.__finishTravel=()=>{rec.stop();return done;};
  })()`);

  for(const direction of [-1,1]){
    const start=await standby.webContents.executeJavaScript('(()=>{const r=document.getElementById("pet-hit").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+100};})()');
    standby.webContents.send('move-pet',{x:start.x+direction*80,y:start.y,side:direction===1?'right':'left',key:'smoke-facing',character:'mechanic',action:'watch',sequence:9000+direction,preview:true});
    const frames=await standby.webContents.executeJavaScript(`new Promise(resolve=>{const frames=[],at=performance.now();function sample(now){const el=document.getElementById('pet-hit'),r=el.getBoundingClientRect();frames.push({x:r.x+r.width/2,scale:Number(el.dataset.facingScale),turning:el.dataset.turning==='true'});if(now-at<2200)requestAnimationFrame(sample);else resolve(frames);}requestAnimationFrame(sample);})`);
    await writeFile(join(dir,`facing-travel-${direction}.json`),JSON.stringify(frames));
    let travelled=0;
    for(let i=1;i<frames.length;i++){const dx=frames[i].x-frames[i-1].x;if(Math.abs(dx)>.02){travelled+=Math.abs(dx);assert(Math.sign(dx)===direction&&frames[i].scale*direction>.99,'overlay walked backwards or moved before turning');}}
    assert(travelled>65,'direction test did not exercise actual travel');travelFrames.push(...frames);
  }
  await writeFile(join(dir,'facing-travel.json'),JSON.stringify(travelFrames));
  if(process.argv.includes('--locomotion-video')){const video=await standby.webContents.executeJavaScript('window.__finishTravel()');await writeFile(join(dir,'cat-locomotion.webm'),Buffer.from(video.split(',')[1],'base64'));}

  panel.hide();
  const grabAt=await standby.webContents.executeJavaScript('(()=>{const r=document.getElementById("pet-hit").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+65)};})()');
  standby.setIgnoreMouseEvents(false,{forward:true});
  standby.webContents.sendInputEvent({type:'mouseMove',...grabAt});await new Promise(r=>setTimeout(r,100));standby.webContents.sendInputEvent({type:'mouseDown',...grabAt,button:'left',clickCount:1});
  await new Promise(r=>setTimeout(r,400));
  assert(await standby.webContents.executeJavaScript('document.getElementById("pet-hit").dataset.dragging')==='true','hold did not pick up the pet');
  assert(await standby.webContents.executeJavaScript('document.getElementById("pet-hit").dataset.caption')==='','drag should have no explanatory caption');
  standby.webContents.sendInputEvent({type:'mouseMove',x:Math.max(180,grabAt.x-110),y:grabAt.y-55});await new Promise(r=>setTimeout(r,250));
  await writeFile(join(dir,'pet-picked-up.png'),(await standby.webContents.capturePage({x:Math.max(0,grabAt.x-240),y:Math.max(0,grabAt.y-150),width:300,height:240})).toPNG());
  standby.webContents.sendInputEvent({type:'mouseUp',x:Math.max(180,grabAt.x-110),y:grabAt.y-55,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,850));
  assert(dragWindow===null&&manualPet!==null&&!panel.isVisible(),'drop did not preserve placement or accidentally opened settings: '+JSON.stringify({dragWindow,manualPet,panelVisible:panel.isVisible()}));
  const placed=await standby.webContents.executeJavaScript('document.getElementById("pet-hit").getBoundingClientRect().x');movePet();await new Promise(r=>setTimeout(r,250));
  assert(Math.abs(await standby.webContents.executeJavaScript('document.getElementById("pet-hit").getBoundingClientRect().x')-placed)<1,'automatic positioning pulled the dropped pet back');
  assert(Number(await standby.webContents.executeJavaScript('document.getElementById("pet-hit").dataset.lift'))<.01,'pet did not settle after dropping');
  const selectedBeforeDragTest=state.selectedId;state.selectedId=ids[2];movePet();assert(manualPet!==null,'task switch discarded manual placement');state.selectedId=selectedBeforeDragTest;manualPet=null;await loadManualPet();assert(manualPet!==null,'saved desktop position could not be restored');manualPet=null;
  const sampleSupply:SupplyState={watch:{watching:3,attention:1,recovering:1,targetId:ids[1],title:'待处理任务 · Needs attention',exhausted:true},account:{windows:[{id:'codex',name:'Codex',used:89,minutes:10080,resetAt:Date.now()+72*3600_000}],resets:1,fetchedAt:Date.now(),stale:false},task:{id:ids[0],model:'gpt-5.4',tokens:124800,cached:90000,estimatedUSD:1.24,fetchedAt:Date.now()},title:'补给工作卡 · Supply preview'};
  const hoverAt=await standby.webContents.executeJavaScript('(()=>{const r=document.getElementById("pet-hit").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+100};})()');
  standby.webContents.send('move-pet',{...hoverAt,side:'right',supply:sampleSupply,key:'smoke-hover',character:'foreman',action:'watch',sequence:9003,preview:true});await new Promise(r=>setTimeout(r,250));

  const cardHover=await standby.webContents.executeJavaScript('(()=>{const r=document.getElementById("pet-hit").getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()');
  standby.webContents.sendInputEvent({type:'mouseMove',...cardHover});
  await new Promise(r=>setTimeout(r,200));
  assert(petInteractive.get(standby.id)===true,'character hover did not enable clicks');
  for(let hoverPoll=0;hoverPoll<20;hoverPoll++){
    if(await standby.webContents.executeJavaScript('!document.getElementById("supply-card").hidden && document.getElementById("supply-content").textContent.includes("11%")'))break;
    standby.webContents.sendInputEvent({type:'mouseMove',...cardHover});await new Promise(r=>setTimeout(r,100));
  }
  assert(await standby.webContents.executeJavaScript('!document.getElementById("supply-card").hidden && document.getElementById("supply-content").textContent.includes("11%")'),'real hover must show shared quota');
  assert(await standby.webContents.executeJavaScript('!document.getElementById("supply-pricing") && document.getElementById("supply-content").textContent.includes("1 个任务需要处理")'),'global attention missing or price maintenance leaked into hover');
  await standby.webContents.executeJavaScript('document.getElementById("supply-pin").click()');
  for(const c of characters){
    standby.webContents.send('move-pet',{...hoverAt,side:'right',key:'smoke-supply',character:c.id,action:'watch',sequence:9003,preview:true,supply:sampleSupply,language:'zh'});
    await new Promise(r=>setTimeout(r,100));
    assert(await standby.webContents.executeJavaScript('document.getElementById("supply-content").dataset.character')===c.id,'supply theme lagged behind character');
    const rect=await standby.webContents.executeJavaScript('(()=>{const r=document.getElementById("supply-card").getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)};})()');
    assert(rect.x>=0&&rect.y>=0&&rect.x+rect.width<=standby.getBounds().width,'supply card outside screen');
    await writeFile(join(dir,`supply-${c.id}.png`),(await standby.webContents.capturePage(rect)).toPNG());
  }
  standby.webContents.send('move-pet',{...hoverAt,side:'right',key:'smoke-supply',character:'mechanic',action:'watch',sequence:9003,preview:true,supply:{...sampleSupply,account:{...sampleSupply.account!,stale:true}},language:'en'});
  await new Promise(r=>setTimeout(r,100));
  assert(await standby.webContents.executeJavaScript('document.getElementById("supply-content").textContent.includes("Last recorded")'),'stale quota not labelled in English');
  await writeFile(join(dir,'supply-stale-en.png'),(await standby.webContents.capturePage()).toPNG());
  standby.webContents.send('move-pet',{...hoverAt,side:'right',key:'smoke-supply',character:'mechanic',action:'watch',sequence:9003,preview:true,supply:{account:null,task:null,title:null},language:'en'});
  await new Promise(r=>setTimeout(r,100));
  assert(await standby.webContents.executeJavaScript('document.getElementById("supply-content").textContent.includes("Supply unavailable") && !document.getElementById("supply-content").textContent.includes("0%")'),'missing quota became zero');
  for(const language of ['zh','en'] as const){
    standby.webContents.send('move-pet',{...hoverAt,side:'right',key:'smoke-supply',character:'mechanic',action:'watch',sequence:9003,preview:true,supply:{account:null,task:null,title:null,accountError:'codex-missing'},language});
    await new Promise(r=>setTimeout(r,100));
    assert(await standby.webContents.executeJavaScript(`document.getElementById('supply-content').textContent.includes(${JSON.stringify(language==='en'?'Codex service not found':'未找到 Codex 服务')})`),'quota discovery failure must be actionable');
    await writeFile(join(dir,`supply-service-missing-${language}.png`),(await standby.webContents.capturePage()).toPNG());
  }
  standby.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});
  await new Promise(r=>setTimeout(r,50));
  assert(await standby.webContents.executeJavaScript('!document.getElementById("supply-card").hidden'),'pinned supply card vanished');
  await standby.webContents.executeJavaScript('document.getElementById("supply-pin").click()');

  standby.webContents.sendInputEvent({type:'mouseMove',x:2,y:2});
  await new Promise(r=>setTimeout(r,50));
  assert(petInteractive.get(standby.id)===false,'transparent area did not restore click-through');
  panel.hide();
  await standby.webContents.executeJavaScript('document.getElementById("pet-hit").click()');
  await new Promise(r=>setTimeout(r,100));
  assert(panel.isVisible(),'clicking character did not open settings');
  await standby.webContents.executeJavaScript('document.getElementById("pet-hit").dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}))');
  await new Promise(r=>setTimeout(r,100));
  assert(!!petMenu&&petMenu.items.some(i=>i.label==='设置与任务…'),'character context menu did not open');
  petMenu?.closePopup();
  await standby.webContents.executeJavaScript('document.getElementById("supply-card").hidden=true;document.dispatchEvent(new MouseEvent("mousemove",{clientX:2,clientY:2}))');
  for(const c of characters){for(const remaining of [85,12,3]){
    standby.webContents.send('move-pet',{...hoverAt,side:'right',key:'supply-polish',character:c.id,action:'watch',sequence:9200,preview:true,supply:{...sampleSupply,account:{...sampleSupply.account!,windows:[{...sampleSupply.account!.windows[0],used:100-remaining}]}},language:'zh'});
    await new Promise(r=>setTimeout(r,1200));
    const data=await standby.webContents.executeJavaScript('(()=>{const h=document.getElementById("pet-hit"),r=h.getBoundingClientRect();return {remaining:Number(h.dataset.supplyRemaining),label:h.dataset.supplyLabel,x:r.x+r.width/2,y:r.y+100};})()');
    assert(Math.abs(data.remaining-remaining)<.01&&data.label.includes('周额度'),'supply meter or source label incorrect');
    const bounds=standby.getBounds(),rect={x:Math.max(0,Math.min(bounds.width-300,Math.floor(data.x-150))),y:Math.max(0,Math.min(bounds.height-230,Math.floor(data.y-140))),width:300,height:230};
    await writeFile(join(dir,`supply-body-${c.id}-${remaining}.png`),(await standby.webContents.capturePage(rect)).toPNG());
  }}
  standby.webContents.send('move-pet',{...hoverAt,side:'right',key:'supply-dock',character:'mechanic',action:'watch',sequence:9300,preview:true,supply:sampleSupply,language:'zh'});await new Promise(r=>setTimeout(r,1200));
  const bowlBefore=await standby.webContents.executeJavaScript('document.getElementById("pet-hit").dataset.bowlX');
  standby.webContents.send('move-pet',{x:hoverAt.x-90,y:hoverAt.y,side:'left',key:'supply-dock-travel',character:'mechanic',action:'watch',sequence:9300,preview:true,supply:sampleSupply,language:'zh'});await new Promise(r=>setTimeout(r,600));
  assert(await standby.webContents.executeJavaScript('document.getElementById("pet-hit").dataset.bowlX')===bowlBefore,'food bowl slid with the walking cat');
movePet();pollTimer=setInterval(()=>void tick(),1000);
  await command('select',ids[0]);await command('show-demo');
  await new Promise(r=>setTimeout(r,1200));
  const dom=await panel.webContents.executeJavaScript('({title:document.title,cards:document.querySelectorAll(".task").length,overflow:document.documentElement.scrollWidth>innerWidth})');
  assert(dom.cards===3 && !dom.overflow,'dashboard layout failed');
  await writeFile(join(dir,'dashboard.png'),(await panel.webContents.capturePage()).toPNG());
  const overlay=overlays.values().next().value!;
  await writeFile(join(dir,'overlay.png'),(await overlay.webContents.capturePage()).toPNG());
  await command('whip-demo');assert(state.phase==='whipping','animation not dispatched');
  const errors:string[]=[];
  overlay.webContents.on('console-message',details=>{if(details.level==='error')errors.push(details.message);});
  await panel.webContents.executeJavaScript('document.getElementById("open-characters").click()');
  await new Promise(r=>setTimeout(r,1400));
  assert(await panel.webContents.executeJavaScript('!document.getElementById("motion-tools").open'),'motion debugging must be collapsed by default');
  await writeFile(join(dir,'character-picker.png'),(await panel.webContents.capturePage()).toPNG());
  const taskBefore=JSON.stringify(state.tasks),watchedBefore=JSON.stringify(state.watchingIds);
  for(const c of characters){
    await panel.webContents.executeJavaScript(`document.querySelector('[data-character="${c.id}"]').click()`);
    await new Promise(r=>setTimeout(r,400));
    assert(state.character===c.id,'character selection did not reach main process');
    const label=await overlay.webContents.executeJavaScript('document.getElementById("pet-hit").getAttribute("aria-label")');
    assert(label.includes(c.name),'overlay did not change character');
    for(const action of ['whip','compact','recovered']){
      await panel.webContents.executeJavaScript(`document.getElementById('preview-${action}').click()`);
      await new Promise(r=>setTimeout(r,100));
      assert(animation.action===action&&animation.preview,'preview not routed as a visual action');
    }
  }
  assert(JSON.stringify(state.tasks)===taskBefore&&JSON.stringify(state.watchingIds)===watchedBefore,'character previews altered task recovery state');
  assert(errors.length===0,`character renderer error: ${errors.join(',')}`);
  await command('character','foreman');
  await panel.webContents.executeJavaScript('document.querySelector("#motion-tools>summary").click()');
  assert(await panel.webContents.executeJavaScript('document.getElementById("motion-tools").open'),'motion debugging did not expand');
  const motionFrames:string[]=[];
  for(const p of performances){
    await panel.webContents.executeJavaScript(`document.querySelector('button[data-performance="${p.id}"]').click()`);
    await new Promise(r=>setTimeout(r,80));
    assert(animation.performance===p.id&&animation.preview,'motion studio routed a non-preview action');
    await panel.webContents.executeJavaScript(`(()=>{const s=document.getElementById('motion-seek');s.value='450';s.dispatchEvent(new Event('input'));})()`);
    motionFrames.push(await panel.webContents.executeJavaScript('document.getElementById("motion-canvas").toDataURL()'));
  }
  assert(JSON.stringify(state.tasks)===taskBefore&&JSON.stringify(state.watchingIds)===watchedBefore,'motion studio changed watched tasks');
  await writeFile(join(dir,'foreman-refined.png'),Buffer.from(motionFrames[0].split(',')[1],'base64'));
  const contact=await panel.webContents.executeJavaScript(`(async()=>{
    const c=document.createElement('canvas');c.width=1560;c.height=1650;const x=c.getContext('2d');x.fillStyle='#11191e';x.fillRect(0,0,c.width,c.height);
    const frames=${JSON.stringify(motionFrames)},labels=${JSON.stringify(performances.map(p=>p.label))};
    for(let i=0;i<frames.length;i++){const image=new Image();image.src=frames[i];await image.decode();const px=(i%3)*520,py=Math.floor(i/3)*330;x.drawImage(image,px,py,520,300);x.font='15px sans-serif';x.fillStyle='#e8c88f';x.fillText(labels[i],px+20,py+320);}
    return c.toDataURL();})()`);
  await writeFile(join(dir,'foreman-motion-sheet.png'),Buffer.from(contact.split(',')[1],'base64'));
  await panel.webContents.executeJavaScript("document.getElementById('motion-studio').scrollIntoView({block:'center'})");
  await new Promise(r=>setTimeout(r,100));
  await writeFile(join(dir,'foreman-studio.png'),(await panel.webContents.capturePage()).toPNG());
  if(process.argv.includes('--motion-video')){
    const video=await panel.webContents.executeJavaScript(`(async()=>{
      const stream=document.getElementById('motion-canvas').captureStream(30),chunks=[];
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3000000});
      const result=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};});
      recorder.start();
      for(const [id,duration] of [['tap',2200],['whip',2600],['heavy',3000],['observe',2600],['recovered',2400]]){
        document.querySelector('button[data-performance="'+id+'"]').click();await new Promise(r=>setTimeout(r,duration));
      }
      recorder.stop();return result;
    })()`);
    await writeFile(join(dir,'foreman-motion.webm'),Buffer.from(video.split(',')[1],'base64'));
  }

  await command('character','mechanic');
  await panel.webContents.executeJavaScript(`document.querySelector('button[data-performance="walk"]').click()`);
  const pawFrames:string[]=[];
  for(let i=0;i<24;i++){
    await panel.webContents.executeJavaScript(`(()=>{const s=document.getElementById('motion-seek');s.value='${i/24*1000}';s.dispatchEvent(new Event('input'));})()`);
    pawFrames.push(await panel.webContents.executeJavaScript('document.getElementById("motion-canvas").toDataURL()'));
  }
  const paws=await panel.webContents.executeJavaScript(`(async()=>{const c=document.createElement('canvas');c.width=1872;c.height=1040;const ctx=c.getContext('2d'),frames=${JSON.stringify(pawFrames)};ctx.fillStyle='#20282d';ctx.fillRect(0,0,c.width,c.height);for(let i=0;i<frames.length;i++){const image=new Image();image.src=frames[i];await image.decode();ctx.drawImage(image,194,215,484,360,i%6*312,Math.floor(i/6)*260,312,232);ctx.fillStyle='#b5c6c2';ctx.font='14px monospace';ctx.fillText('STEP '+String(i+1).padStart(2,'0'),i%6*312+10,Math.floor(i/6)*260+250);}return c.toDataURL();})()`);
  await writeFile(join(dir,'cat-paw-study.png'),Buffer.from(paws.split(',')[1],'base64'));
  const companionCovers:string[]=[];
  for(const companion of ['medic','mechanic','ranger'] as const){
    await command('character',companion);await new Promise(r=>setTimeout(r,100));
    const frames:string[]=[];
    for(const p of performances){
      await panel.webContents.executeJavaScript(`document.querySelector('button[data-performance="${p.id}"]').click()`);
      await new Promise(r=>setTimeout(r,70));
      assert(animation.performance===p.id&&animation.preview,'companion performance not routed');
      await panel.webContents.executeJavaScript(`(()=>{const s=document.getElementById('motion-seek');s.value='470';s.dispatchEvent(new Event('input'));})()`);
      const data=await panel.webContents.executeJavaScript(`(()=>{const c=document.getElementById('motion-canvas');return {style:c.dataset.renderStyle,character:c.dataset.character,mode:c.dataset.performance,image:c.toDataURL()};})()`);
      assert(data.style==='realistic'&&data.character===companion&&data.mode===p.id,'studio kept the previous character or motion');frames.push(data.image);
    }
    companionCovers.push(frames[0]);
    const sheet=await panel.webContents.executeJavaScript(`(async()=>{
      const c=document.createElement('canvas');c.width=1560;c.height=1650;const x=c.getContext('2d');x.fillStyle='#11191e';x.fillRect(0,0,c.width,c.height);
      const frames=${JSON.stringify(frames)},labels=${JSON.stringify(performances.map(p=>performanceLabel(companion,p.id)))};
      for(let i=0;i<frames.length;i++){const image=new Image();image.src=frames[i];await image.decode();const px=i%3*520,py=Math.floor(i/3)*330;x.drawImage(image,px,py,520,300);x.font='15px sans-serif';x.fillStyle='#e8c88f';x.fillText(labels[i],px+20,py+320);}return c.toDataURL();})()`);
    await writeFile(join(dir,`${companion}-motion-sheet.png`),Buffer.from(sheet.split(',')[1],'base64'));
  }
  const crew=await panel.webContents.executeJavaScript(`(async()=>{const c=document.createElement('canvas');c.width=1560;c.height=300;const x=c.getContext('2d');const frames=${JSON.stringify(companionCovers)};for(let i=0;i<frames.length;i++){const image=new Image();image.src=frames[i];await image.decode();x.drawImage(image,i*520,0,520,300);}return c.toDataURL();})()`);
  await writeFile(join(dir,'character-crew.png'),Buffer.from(crew.split(',')[1],'base64'));
  if(process.argv.includes('--companion-video')){
    const video=await panel.webContents.executeJavaScript(`(async()=>{
      const stream=document.getElementById('motion-canvas').captureStream(30),chunks=[];
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3000000});
      const result=new Promise(resolve=>{recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));};});recorder.start();
      for(const id of ['medic','mechanic','ranger']){
        await window.overseer.command('character',id);await new Promise(r=>setTimeout(r,100));
        for(const [mode,duration] of [['idle',1000],['walk',2600],['tap',2200],['heavy',3000],['compact',2200],['exhausted',1600],['recovered',2400]]){document.querySelector('button[data-performance="'+mode+'"]').click();await new Promise(r=>setTimeout(r,duration));}
      }recorder.stop();return result;
    })()`);
    await writeFile(join(dir,'character-crew.webm'),Buffer.from(video.split(',')[1],'base64'));
  }
  assert(JSON.stringify(state.tasks)===taskBefore&&JSON.stringify(state.watchingIds)===watchedBefore,'companion previews altered recovery tasks');
  await command('character','mechanic');
  await new Promise(r=>setTimeout(r,400));
  const workshop=await panel.webContents.executeJavaScript('(()=>{const d=document.getElementById("character-workshop");return {open:d.open,overflow:d.scrollWidth>d.clientWidth,cards:d.querySelectorAll(".character-card").length};})()');
  assert(workshop.open&&workshop.cards===4&&!workshop.overflow,'character workshop layout failed');
  await writeFile(join(dir,'characters.png'),(await panel.webContents.capturePage()).toPNG());
  await panel.webContents.executeJavaScript('document.getElementById("close-characters").click()');

  for(const [work,activity,label] of [['running','files','修改文件'],['waiting','none','等待你处理'],['retrying','none','Codex 正在重试'],['review','none','完成，等你查看'],['failed','none','任务故障'],['running','compacting','压缩上下文']] as const){
    state.liveStates={[state.selectedId!]:{threadId:state.selectedId!,connection:'live',work,activity,label,updatedAt:Date.now()}};
    movePet();publish();await new Promise(r=>setTimeout(r,160));
    const actual=await overlay.webContents.executeJavaScript('({work:document.getElementById("pet-hit").dataset.work,activity:document.getElementById("pet-hit").dataset.activity})');
    assert(actual.work===work&&actual.activity===activity,'live activity not delivered to character');
  }
  await new Promise(r=>setTimeout(r,1700));
  await writeFile(join(dir,'live-state.png'),(await overlay.webContents.capturePage()).toPNG());

  const savedSelection=state.selectedId;const savedWatching=state.watchingIds;const savedProgress=state.retryProgress;const savedTasks=state.tasks;state.tasks=state.tasks.map(t=>t.id===ids[1]?{...t,status:'failed'}:t);
  state.watchingIds=[ids[1]];state.retryProgress={[ids[1]]:{used:3,limit:3,exhausted:true}};
  await panel.webContents.executeJavaScript('document.getElementById("open-settings").click()');
  await standby.webContents.executeJavaScript('window.overseer.petAction("settings")');
  await new Promise(r=>setTimeout(r,150));
  assert(state.selectedId===ids[1],'attention click opened the wrong task');
  assert(await panel.webContents.executeJavaScript('!document.querySelector("dialog[open]")'),'attention click left a dialog covering the task');
  state.tasks=savedTasks;state.watchingIds=savedWatching;state.retryProgress=savedProgress;await command('select',savedSelection!);
  await panel.webContents.executeJavaScript('document.getElementById("open-settings").click()');
  const settingsBefore=await panel.webContents.executeJavaScript('({open:document.getElementById("settings-dialog").open,limit:document.getElementById("retry-limit").value,language:document.getElementById("language-choice").value})');
  assert(settingsBefore.open&&settingsBefore.limit==='3'&&settingsBefore.language==='codex','default settings were not displayed');
  await writeFile(join(dir,'settings-zh.png'),(await panel.webContents.capturePage()).toPNG());
  await panel.webContents.executeJavaScript('(()=>{document.getElementById("retry-enabled").checked=false;document.getElementById("retry-limit").value="5";document.getElementById("language-choice").value="en";document.getElementById("settings-form").requestSubmit();})()');
  await new Promise(r=>setTimeout(r,300));
  assert(state.settings?.maxAttempts===5&&state.settings.retryAfterFailure===false&&state.language==='en','settings form did not apply the requested policy');
  const english=await panel.webContents.executeJavaScript('(()=>{const d=document.getElementById("settings-dialog"),clone=document.body.cloneNode(true);clone.querySelectorAll(".task-title,#target-title,option[value=zh],script").forEach(e=>e.remove());return {lang:document.documentElement.lang,overflow:d.scrollWidth>d.clientWidth,text:clone.textContent};})()');
  assert(english.lang==='en'&&!english.overflow,'English settings layout failed');
  assert(!/[\u4e00-\u9fff]/.test(english.text),'untranslated interface text: '+english.text.match(/[\u4e00-\u9fff]+/g)?.join(','));
  assert(buildPetMenu().items.some(i=>i.label==='Settings and tasks…'),'native menu did not switch to English');
  const petEnglish=await overlay.webContents.executeJavaScript('document.getElementById("pet-hit").getAttribute("aria-label")');
  assert(petEnglish.includes('Mechanic Cat')&&!/[\u4e00-\u9fff]/.test(petEnglish),'character label did not switch to English');
  await writeFile(join(dir,'settings-en.png'),(await panel.webContents.capturePage()).toPNG());
  await panel.webContents.executeJavaScript('document.getElementById("close-settings").click()');
  await writeFile(join(dir,'dashboard-en.png'),(await panel.webContents.capturePage()).toPNG());
  panel.setSize(840,700);await new Promise(r=>setTimeout(r,200));
  assert(await panel.webContents.executeJavaScript('document.documentElement.scrollWidth<=innerWidth'),'English dashboard overflows at minimum width');
  await command('settings',JSON.stringify({...defaultSettings,language:'zh'}));
  assert(state.language==='zh','Chinese language switch failed');

  const previousMode=state.mode,previousWatches=state.watchingIds,previousAuto=state.autoAll;
  state.mode='live';state.watchingIds=[];state.autoAll=false;publish();
  await new Promise(r=>setTimeout(r,100));
  assert(await panel.webContents.executeJavaScript('document.getElementById("watch-heading").textContent.includes("暂停")'),'paused empty state still claims active watching');
  await writeFile(join(dir,'dashboard-paused.png'),(await panel.webContents.capturePage()).toPNG());
  state.autoAll=true;state.watchingIds=[ids[0],ids[1]];publish();
  await new Promise(r=>setTimeout(r,100));
  await writeFile(join(dir,'dashboard-live.png'),(await panel.webContents.capturePage()).toPNG());
  state.mode=previousMode;state.watchingIds=previousWatches;state.autoAll=previousAuto;publish();
  const savedInbox=inbox.entries,savedInboxLanguage=state.language;
  inbox.entries=[{id:'smoke-result',threadId:ids[0],turnId:'smoke-turn',title:'任务结果',cwd:'C:/Projects/Example',at:Date.now(),excerpt:'本轮已结束。\nThis is a saved reply excerpt, not proof of goal completion.',read:false}];publish();await new Promise(r=>setTimeout(r,100));
  await panel.webContents.executeJavaScript('document.getElementById("open-inbox").click();document.querySelector("#inbox-list details").open=true');await new Promise(r=>setTimeout(r,150));
  assert(inbox.entries[0].read,'expanding inbox result did not mark read');
  assert(await panel.webContents.executeJavaScript('document.querySelector(".overview-stats .overview-stat:last-child strong").textContent==="0" && !document.getElementById("open-inbox").classList.contains("has-unread")'),'read result did not clear both unread indicators');
  inbox.entries.push({...inbox.entries[0],id:'smoke-result-next',turnId:'smoke-turn-next',read:false});publish();await new Promise(r=>setTimeout(r,100));
  await panel.webContents.executeJavaScript('document.getElementById("inbox-read-all").click()');await new Promise(r=>setTimeout(r,150));
  assert(inbox.entries.every(e=>e.read)&&await panel.webContents.executeJavaScript('document.querySelector(".overview-stats .overview-stat:last-child strong").textContent==="0" && document.getElementById("inbox-read-all").disabled'),'batch read failed to update unread count');

  await writeFile(join(dir,'inbox-zh.png'),(await panel.webContents.capturePage()).toPNG());
  state.language='en';publish();await new Promise(r=>setTimeout(r,100));
  await writeFile(join(dir,'inbox-en.png'),(await panel.webContents.capturePage()).toPNG());
  assert(await panel.webContents.executeJavaScript('document.getElementById("inbox-title").textContent==="Results inbox"'),'inbox English title missing');
  await panel.webContents.executeJavaScript('document.getElementById("close-inbox").click()');inbox.entries=savedInbox;state.language=savedInboxLanguage;publish();
  await sampleUsageOverview();
  const savedOverview={mode:state.mode,tasks:state.tasks,liveStates:state.liveStates,watchingIds:state.watchingIds,selectedId:state.selectedId,language:state.language};const savedAccount=supply.account;
  state.mode='live';state.liveStates={};state.watchingIds=[ids[0],ids[1]];state.tasks=state.tasks.map((t,i)=>({...t,status:i===0?'failed':'running'}));supply.account=sampleSupply.account;publish();
  await panel.webContents.executeJavaScript('document.getElementById("nav-overview").click()');
  for(const language of ['zh','en'] as const){state.language=language;publish();await new Promise(r=>setTimeout(r,100));await writeFile(join(dir,`overview-${language}.png`),(await panel.webContents.capturePage()).toPNG());}
  assert(await panel.webContents.executeJavaScript('document.body.classList.contains("overview-page") && document.querySelectorAll(".overview-stat").length===4 && document.querySelectorAll(".overview-quota").length>0'),'overview metrics or quota missing');
  await panel.webContents.executeJavaScript('document.querySelector("#overview .overview-task").click()');await new Promise(r=>setTimeout(r,300));
  assert(state.selectedId===ids[0]&&await panel.webContents.executeJavaScript('!document.body.classList.contains("overview-page")'),'overview task did not open matching detail');
  Object.assign(state,savedOverview);supply.account=savedAccount;publish();
  const savedList={tasks:state.tasks,watchingIds:state.watchingIds,liveStates:state.liveStates,retryProgress:state.retryProgress,mode:state.mode,selectedId:state.selectedId};
  state.mode='live';state.selectedId=ids[0];state.watchingIds=[ids[0],ids[1]];state.liveStates={};state.retryProgress={};
  state.tasks=state.tasks.map((t,i)=>({...t,title:i<2?'Same title · 同名任务':t.title,cwd:i===0?'C:/Projects/Alpha Project':'/projects/Beta',status:i===0?'failed':'running'}));publish();await new Promise(r=>setTimeout(r,100));
  const listSearch=async(value:string)=>{await panel.webContents.executeJavaScript(`(()=>{const e=document.getElementById('task-search');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
  const visibleList=()=>panel.webContents.executeJavaScript(`Array.from(document.querySelectorAll('#tasks [data-task-id]'),e=>e.dataset.taskId)`);
  await listSearch('alpha project');assert(JSON.stringify(await visibleList())===JSON.stringify([ids[0]]),'project search did not isolate task');
  await listSearch(ids[1]);assert(JSON.stringify(await visibleList())===JSON.stringify([ids[1]]),'full ID search confused duplicate titles');assert(state.selectedId===ids[0],'search changed task selection');
  assert(await panel.webContents.executeJavaScript('!document.getElementById("reveal-selected").hidden'),'hidden current task has no return path');
  await listSearch('does-not-exist');assert((await visibleList()).length===0,'unmatched search left tasks');assert(await panel.webContents.executeJavaScript('!document.getElementById("task-empty").hidden'),'search empty state missing');
  await panel.webContents.executeJavaScript('document.getElementById("reveal-selected").click()');assert((await visibleList()).length===3,'show current task did not reset filters');
  await panel.webContents.executeJavaScript('document.querySelector("[data-filter=attention]").click()');assert(JSON.stringify(await visibleList())===JSON.stringify([ids[0]]),'attention filter did not match global summary');
  state.tasks=state.tasks.map(t=>({...t,status:'running'}));publish();await new Promise(r=>setTimeout(r,100));assert((await visibleList()).length===0,'resolved task remained in attention filter');
  await writeFile(join(dir,'task-list-empty.png'),(await panel.webContents.capturePage()).toPNG());
  await panel.webContents.executeJavaScript('document.querySelector("[data-filter=watching]").click()');assert((await visibleList()).length===2,'watching filter ignored watch set');
  assert(state.watchingIds.length===2&&state.selectedId===ids[0],'list controls modified watch or selection');
  await panel.webContents.executeJavaScript('document.getElementById("task-search").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))');
  assert((await visibleList()).length===3,'Escape did not clear list filters');
  await panel.webContents.executeJavaScript(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',ctrlKey:true,bubbles:true,cancelable:true}))`);
  assert(await panel.webContents.executeJavaScript(`document.activeElement.id==='task-search'`),'search shortcut did not focus search');
  await panel.webContents.executeJavaScript(`document.getElementById('task-search').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}))`);
  assert(await panel.webContents.executeJavaScript(`!!document.activeElement.dataset.taskId`),'down arrow did not focus results');
  await panel.webContents.executeJavaScript(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true,cancelable:true}))`);
  assert(await panel.webContents.executeJavaScript(`document.activeElement===document.querySelector('#tasks button:last-child')`),'End did not reach last task');
  assert(state.selectedId===ids[0],'keyboard browsing changed selected task without activation');
  await panel.webContents.executeJavaScript(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);
  assert(await panel.webContents.executeJavaScript(`document.activeElement.id==='task-search'`),'Escape did not return to search');
  await listSearch('Alpha');
  await writeFile(join(dir,'task-search-polish.png'),(await panel.webContents.capturePage()).toPNG());
  await panel.webContents.executeJavaScript(`document.getElementById('clear-search').click()`);
  assert((await visibleList()).length===3,'clear search left stale results');
  assert(await panel.webContents.executeJavaScript(`document.getElementById('clear-search').hidden && document.activeElement.id==='task-search'`),'clear search lost focus or clear button remained');
  Object.assign(state,savedList);publish();
  // Verify the new handoff and adapter-health surfaces with isolated fixtures, never a real retry.
  const savedHandoff={health:state.health,retryProgress:state.retryProgress,liveStates:state.liveStates,watchingIds:state.watchingIds,recoveringIds:state.recoveringIds,mode:state.mode,language:state.language};
  const handoffId=state.selectedId!,context={episodeId:'smoke-unconfirmed',failedTurnId:'smoke-failed',reason:'network' as const};
  await journal.add(handoffId,'failed',1,context);await journal.add(handoffId,'continue',1,context);await journal.add(handoffId,'unconfirmed',1,context);
  state.mode='live';state.watchingIds=[handoffId];state.liveStates={};
  state.retryProgress={[handoffId]:{used:1,limit:3,exhausted:false,unconfirmed:{since:Date.now()-130000,episodeId:context.episodeId}}};
  state.health={taskErrors:{[handoffId]:{dispatch:Date.now()-60000}},connectionSince:{[handoffId]:Date.now()-60000}};
  for(const lang of ['zh','en'] as const){
    state.language=lang;publish();await new Promise(r=>setTimeout(r,180));
    const rendered=await panel.webContents.executeJavaScript(`(()=>{const h=document.getElementById('recovery-handoff'),a=document.getElementById('watch-health-alert'),d=document.querySelector('[data-episode="smoke-unconfirmed"]');return {handoff:!h.hidden,alert:!a.hidden,text:h.textContent,steps:d?.querySelectorAll('[data-kind]').length,overflow:document.body.scrollWidth>innerWidth||document.body.scrollHeight>innerHeight};})()`);
    assert(rendered.handoff&&rendered.alert&&rendered.steps===3&&!rendered.overflow,'handoff, grouped history or health layout failed');
    assert(lang==='en'?!/[\u4e00-\u9fff]/.test(rendered.text):rendered.text.includes('不会重复发送'),'handoff localization failed');
    await writeFile(join(dir,`recovery-handoff-${lang}.png`),(await panel.webContents.capturePage()).toPNG());
    await panel.webContents.executeJavaScript(`(()=>{document.getElementById('duty-panel').open=true;document.querySelector('[data-episode="smoke-unconfirmed"]').open=true;document.querySelector('[data-episode="smoke-unconfirmed"]').scrollIntoView({block:'center'});})()`);
    await writeFile(join(dir,`recovery-episode-${lang}.png`),(await panel.webContents.capturePage()).toPNG());
  }
  const beforeCheck=animation.sequence;await panel.webContents.executeJavaScript('document.getElementById("check-recovery").click()');await new Promise(r=>setTimeout(r,100));assert(animation.sequence===beforeCheck,'read-only check dispatched a recovery animation');assert(await panel.webContents.executeJavaScript('document.getElementById("check-feedback").textContent.includes("refreshed")'),'read-only check had no visible feedback');
  state.watchingIds=[];publish();await new Promise(r=>setTimeout(r,100));
  assert(await panel.webContents.executeJavaScript('document.getElementById("recovery-handoff").hidden && document.getElementById("watch-health-alert").hidden'),'paused tasks kept handoff or task-health alerts');
  const savedReadMessage=state.recoveryMessages;
  state.retryProgress={};state.watchingIds=[handoffId];
  state.liveStates={[handoffId]:{threadId:handoffId,connection:'live',work:'idle',activity:'none',label:'空闲待命',updatedAt:Date.now()}};
  state.health={taskErrors:{[handoffId]:{read:Date.now()-60000}}};
  state.recoveryMessages={[handoffId]:'Task log read failed: Unexpected rollout path'};
  publish();await new Promise(r=>setTimeout(r,180));
  await panel.webContents.executeJavaScript('document.getElementById("watch-health-alert").click()');
  await new Promise(r=>setTimeout(r,180));
  assert(await panel.webContents.executeJavaScript('!document.getElementById("task-health-detail").hidden && document.getElementById("task-health-detail").textContent.includes("Unexpected rollout path")'),'live idle hid task read error');
  await writeFile(join(dir,'task-read-error.png'),(await panel.webContents.capturePage()).toPNG());
  state.health={};publish();await new Promise(r=>setTimeout(r,100));
  assert(await panel.webContents.executeJavaScript('document.getElementById("task-health-detail").hidden'),'recovered read error stayed visible');
  state.recoveryMessages=savedReadMessage;
  Object.assign(state,savedHandoff);publish();
  console.log(JSON.stringify({ok:true,checks:['overview metrics quota and exact task navigation','completion inbox read state and bilingual dialog','search keyboard navigation and explicit clear','title/project/full-ID search','attention and watching filters','empty result and return to selected task','filters never change watch scope','unconfirmed handoff and read-only check','incident history groups by failure','adapter health warning and pause suppression','bilingual handoff at minimum width','isolated smoke profile','duplicate-title identity','hidden target release','standby window visible','standby character pixels','forward travel and turn before move','hold to lift and drag','drop settles without opening settings','manual placement survives polling','character hover','continuous equipment at 85/12/3 percent','stationary cat food dock','limiting window label','four supply themes and quota hover','pinned supply card','transparent click-through','click opens settings','context menu','visible target binding','dashboard render','whip animation dispatch','four character selections','12 character action previews','56 character performances','three anatomical companion rigs','scrubbable motion studio','preview isolation','character workshop render','six live state/activity transitions','retry settings defaults and edits','Chinese and English settings','English interface coverage','localized native menu and character'],screenshots:dir}));
  await companionSmoke();await excursionSmoke();await updateSmoke();quitting=true;app.quit();
}

async function interfaceSmoke(){
  await panel.webContents.executeJavaScript('document.getElementById("nav-tasks").click()');
 const dir=artifactDir;
 const check=(ok:boolean,message:string)=>{if(!ok)throw Error(message);};
 await sampleUsageOverview();
 state.mode='live';state.autoAll=true;state.message='';state.watchingIds=[ids[0],ids[1]];
 await journal.add(ids[0],'continue',1);await journal.add(ids[0],'checking',1);await journal.add(ids[0],'recovered',1);
 await panel.webContents.executeJavaScript('document.getElementById("duty-panel").open=true');
 const pet=[...overlays.values()][0];
 await new Promise(r=>setTimeout(r,1800));
 const sequenceBefore=animation.sequence;
 // Dispatch and observe in renderer frames: a main-process sleep can miss the
 // short response animation when CI stalls IPC or rendering.
 const stroked=await pet.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>{const r=document.getElementById('pet-hit').getBoundingClientRect(),x=r.x+r.width/2,y=r.y+70;for(const dx of [-20,20,-20,20,-20])document.dispatchEvent(new MouseEvent('mousemove',{clientX:x+dx,clientY:y}));requestAnimationFrame(()=>resolve(document.getElementById('pet-hit').dataset.petResponse==='true'));}))`);
 check(stroked,'stroking did not produce a local response');
 check(animation.sequence===sequenceBefore,'stroking changed recovery animation dispatch');

 await pet.webContents.executeJavaScript(`window.dragEvents=[];window.addEventListener('error',e=>window.dragEvents.push({error:e.message}));for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture','blur'])window.addEventListener(type,e=>{if(type==='pointermove'&&!e.buttons)return;window.dragEvents.push({type,target:e.target.id,x:e.clientX,y:e.clientY,buttons:e.buttons});},true);`);
 const originalCharacter=state.character;
 // Offscreen Chromium isolates the simulated gesture from native mouse input.
 // Real desktop drag acceptance remains separate from this CI exercise.
 const restoreMouseEvents=pet.setIgnoreMouseEvents.bind(pet);
 pet.setIgnoreMouseEvents=()=>restoreMouseEvents(false);
 pet.setIgnoreMouseEvents(false);
 pet.webContents.debugger.attach('1.3');
 const dragInput=(type:string,point:{x:number;y:number},buttons:number)=>pet.webContents.debugger.sendCommand('Input.dispatchMouseEvent',{type,...point,button:buttons||type==='mouseReleased'?'left':'none',buttons,clickCount:type==='mouseMoved'?0:1});
 for(const character of ['foreman','medic','mechanic','ranger'] as const){
  state.character=character;
  for(const edge of ['left','right'] as const){
   await pet.webContents.executeJavaScript(`window.overseer.petDrag('start',200,300)`);
   await pet.webContents.executeJavaScript(`window.overseer.petDrag('end',${edge==='left'?0:pet.getBounds().width},300)`);
   await new Promise(r=>setTimeout(r,350));
   check(await pet.webContents.executeJavaScript(`document.getElementById('pet-hit').dataset.docked===${JSON.stringify(edge)}`),'edge did not dock');
   check(await pet.webContents.executeJavaScript('document.getElementById("pet-hit").dataset.frontPeek==="true"'),'front portrait unavailable');
   check(await pet.webContents.executeJavaScript(`(()=>{const r=document.getElementById('pet-hit').getBoundingClientRect();return r.width===56&&r.left>=0&&r.right<=innerWidth;})()`),'head is not reachable');
   await writeFile(join(dir,`edge-${character}-${edge}.png`),Buffer.from((await pet.webContents.executeJavaScript('document.getElementById("pet").toDataURL()')).split(',')[1],'base64'));
   manualPet=null;await loadManualPet();check((manualPet as {dock?:DockEdge}|null)?.dock===edge,'docked placement did not survive reload');
   const head=await pet.webContents.executeJavaScript(`(()=>{const r=document.getElementById('pet-hit').getBoundingClientRect();return {x:Math.round(r.x+20),y:Math.round(r.y+30)};})()`);
   pet.setIgnoreMouseEvents(false,{forward:true});
   await dragInput('mouseMoved',head,0);await new Promise(r=>setTimeout(r,350));
   check(await pet.webContents.executeJavaScript('(()=>{const card=document.getElementById("supply-card"),a=card.getBoundingClientRect(),b=document.getElementById("pet-hit").getBoundingClientRect();return card.hidden||a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom;})()'),'quota card must not cover the docked drag handle');
   // Reproduce a card opened before the final docking frame, without relying on timing.
   await pet.webContents.executeJavaScript(`(()=>{const card=document.getElementById('supply-card'),r=document.getElementById('pet-hit').getBoundingClientRect();card.hidden=false;card.style.left=r.left+'px';card.style.top=r.top+'px';document.getElementById('supply-pin').click();})()`);
   await pet.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
   check(await pet.webContents.executeJavaScript('(()=>{const a=document.getElementById("supply-card").getBoundingClientRect(),b=document.getElementById("pet-hit").getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom;})()'),'pinned stale card must move clear of the docked handle');
   await dragInput('mousePressed',head,1);
   // CI rendering can lag the 220 ms hold timer; wait for the observable state.
   for(let attempt=0;attempt<30;attempt++){if(await pet.webContents.executeJavaScript('document.getElementById("pet-hit").dataset.dragging==="true"'))break;await new Promise(r=>setTimeout(r,100));}
   check(await pet.webContents.executeJavaScript('document.getElementById("pet-hit").dataset.dragging==="true"'),'edge hold did not pick up '+character+' '+edge+' '+await pet.webContents.executeJavaScript('JSON.stringify({events:window.dragEvents,dragging:document.getElementById("pet-hit").dataset.dragging,rect:document.getElementById("pet-hit").getBoundingClientRect(),card:document.getElementById("supply-card").getBoundingClientRect()})'));
   const destination={x:Math.round(pet.getBounds().width/2),y:450};
   await dragInput('mouseMoved',destination,1);await new Promise(r=>setTimeout(r,220));
   await writeFile(join(dir,`drag-out-${character}-${edge}.png`),Buffer.from((await pet.webContents.executeJavaScript('document.getElementById("pet").toDataURL()')).split(',')[1],'base64'));
   destination.x+=90;destination.y=260;
   await dragInput('mouseMoved',destination,1);await new Promise(r=>setTimeout(r,350));
   await dragInput('mouseReleased',destination,0);await new Promise(r=>setTimeout(r,450));
   check(!(manualPet as {dock?:DockEdge}|null)?.dock&&manualPet!==null,`${character} ${edge} could not be dragged back: ${JSON.stringify(manualPet)}; ${await pet.webContents.executeJavaScript('JSON.stringify({events:window.dragEvents,data:document.getElementById("pet-hit").dataset,rect:document.getElementById("pet-hit").getBoundingClientRect()})')}`);
   const trails=await pet.webContents.executeJavaScript(`(()=>{const c=document.getElementById('pet'),r=document.getElementById('pet-hit').getBoundingClientRect(),cx=r.x+r.width/2,cy=r.y+100,dpr=devicePixelRatio,p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let count=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){if(Math.abs(x/dpr-cx)>220||Math.abs(y/dpr-cy)>220)if(p[(y*c.width+x)*4+3])count++;}return count;})()`);
   check(trails===0,`${character} ${edge} left ${trails} stale canvas pixels after dragging out`);

  }
 }
 pet.webContents.debugger.detach();
 pet.setIgnoreMouseEvents=restoreMouseEvents;pet.setIgnoreMouseEvents(true,{forward:true});
 state.character=originalCharacter;await clearManualPet();movePet();
 panel.show();
 state.tasks=state.tasks.map((t,i)=>({...t,title:i===0?'跨任务恢复与长标题显示 · Cross-task recovery and long title layout':t.title}));
 supply.account={windows:[{id:'codex',name:'Codex',used:24,minutes:300,resetAt:Date.now()+3600000},{id:'codex',name:'Codex',used:89,minutes:10080,resetAt:Date.now()+86400000}],fetchedAt:Date.now(),stale:false,resets:null};
 inbox.entries=[{id:'overview-fixture',threadId:ids[0],turnId:'overview-turn',title:'界面更新',cwd:'/projects/cyber-overseer',at:Date.now(),excerpt:'界面已更新，详细结果与验证记录请查看原任务。\nThe interface update is ready to review in the original task.',read:false}];
 for(const language of ['zh','en'] as const){
  state.language=language;
  for(const width of [840,1120]){
   panel.setSize(width,680);publish();await panel.webContents.executeJavaScript('document.getElementById("nav-tasks").click()');await new Promise(r=>setTimeout(r,180));
   const layout=await panel.webContents.executeJavaScript(`(()=>{const q=id=>document.getElementById(id).getBoundingClientRect();return {overflow:document.body.scrollWidth>innerWidth||document.body.scrollHeight>innerHeight,button:q('auto').bottom,header:q('target-title').width,list:q('tasks').height,height:innerHeight};})()`);
   check(!layout.overflow&&layout.button<layout.height&&layout.header>150&&layout.list>100,'Daily workspace overflow at '+width+' '+language+' '+JSON.stringify(layout));
   await writeFile(join(dir,`interface-${language}-${width}.png`),(await panel.webContents.capturePage()).toPNG());
   check(await panel.webContents.executeJavaScript('document.getElementById("duty-list").children.length===3'),'duty history did not show the selected task events');
   await panel.webContents.executeJavaScript('document.getElementById("duty-panel").scrollIntoView({block:"end"})');
   await writeFile(join(dir,`duty-${language}-${width}.png`),(await panel.webContents.capturePage()).toPNG());
   await panel.webContents.executeJavaScript('document.querySelector(".target-area").scrollTop=0');
   await panel.webContents.executeJavaScript('document.getElementById("nav-overview").click()');await new Promise(r=>setTimeout(r,100));
   check(await panel.webContents.executeJavaScript('document.getElementById("overview").scrollWidth<=document.getElementById("overview").clientWidth'),'overview horizontal overflow');
   await writeFile(join(dir,`overview-${language}-${width}.png`),(await panel.webContents.capturePage()).toPNG());
   await panel.webContents.executeJavaScript('document.querySelector(".usage-section").scrollIntoView({block:"end"})');await new Promise(r=>setTimeout(r,80));
   check(await panel.webContents.executeJavaScript('document.querySelectorAll(".usage-day").length===30 && document.querySelectorAll(".usage-project").length>=1 && document.querySelectorAll(".usage-heat-cell").length===30'),'usage trend or project ranking missing');
   check(await panel.webContents.executeJavaScript('document.getElementById("overview").scrollWidth<=document.getElementById("overview").clientWidth'),'usage horizontal overflow');
   await writeFile(join(dir,`usage-${language}-${width}.png`),(await panel.webContents.capturePage()).toPNG());
   await panel.webContents.executeJavaScript('document.querySelector("[data-period=\\"7d\\"]").click()');
   check(await panel.webContents.executeJavaScript('document.querySelectorAll(".usage-day").length===7 && document.querySelectorAll(".usage-project").length===2'),'seven day period did not update chart and projects');
   await panel.webContents.executeJavaScript('document.querySelector("[data-period=\\"month\\"]").click()');
   check(await panel.webContents.executeJavaScript('document.querySelectorAll(".usage-day").length===new Date().getDate()'),'month period did not follow calendar');
   await panel.webContents.executeJavaScript('document.querySelector("[data-period=\\"today\\"]").click()');

   await panel.webContents.executeJavaScript('document.querySelector(".usage-day:last-child").click()');await new Promise(r=>setTimeout(r,100));
   check(await panel.webContents.executeJavaScript('!!document.querySelector(".usage-drill button.usage-drill-task") && document.querySelectorAll(".usage-models .usage-model-row").length>0 && document.querySelectorAll(".recovery-metrics strong").length===4'),'date details, model ranking or recovery record missing');
   check(await panel.webContents.executeJavaScript('document.getElementById("overview").scrollWidth<=document.getElementById("overview").clientWidth'),'day detail horizontal overflow');
   await writeFile(join(dir,`drilldown-${language}-${width}.png`),(await panel.webContents.capturePage()).toPNG());
   await panel.webContents.executeJavaScript('document.querySelector(".usage-drill button.usage-drill-task").click()');await new Promise(r=>setTimeout(r,100));
   check(state.selectedId===ids[0]&&await panel.webContents.executeJavaScript('!document.body.classList.contains("overview-page")'),'day detail opened wrong task');
   await panel.webContents.executeJavaScript('document.getElementById("nav-overview").click();document.querySelector(".usage-drill-head button").click();document.querySelector(".usage-heat-cell").click()');
   check(await panel.webContents.executeJavaScript('!!document.querySelector(".usage-drill") && document.querySelectorAll(".usage-drill-task").length===0'),'empty heatmap day did not show empty detail');
   await panel.webContents.executeJavaScript('document.querySelector(".usage-drill").dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}))');
   check(await panel.webContents.executeJavaScript('!document.querySelector(".usage-drill") && document.activeElement.classList.contains("usage-heat-cell")'),'Escape did not return focus to the originating heatmap day');
   await panel.webContents.executeJavaScript('document.activeElement.click()');
   await panel.webContents.executeJavaScript('document.querySelector(".usage-drill-head button").click();document.getElementById("overview").scrollTop=0');
   await panel.webContents.executeJavaScript('document.querySelector(".recovery-overview").scrollIntoView({block:"center"})');await new Promise(r=>setTimeout(r,100));
   await writeFile(join(dir,`recovery-record-${language}-${width}.png`),(await panel.webContents.capturePage()).toPNG());
   await panel.webContents.executeJavaScript('document.getElementById("overview").scrollTop=0');

   await panel.webContents.executeJavaScript('document.querySelector("#overview [data-overview-key=overview-fixture]").click()');await new Promise(r=>setTimeout(r,100));
   check(await panel.webContents.executeJavaScript('document.getElementById("inbox-dialog").open && document.querySelector("#inbox-list details").open'),'overview result did not expand exact inbox entry');
   await panel.webContents.executeJavaScript('document.getElementById("close-inbox").click();document.dispatchEvent(new KeyboardEvent("keydown",{key:"f",ctrlKey:true,bubbles:true,cancelable:true}))');
   check(await panel.webContents.executeJavaScript('!document.body.classList.contains("overview-page") && document.activeElement.id==="task-search"'),'overview find shortcut did not open task search');

  }
 }
 await companionSmoke();await excursionSmoke();await updateSmoke();
 console.log(JSON.stringify({ok:true,checks:['four characters dragged from both edges','zero stale pixels after diagonal drag and drop','docked placement persistence','840 and 1120 desktop widths','Chinese and English daily layout','long task titles','independent list scrolling','recovery action visible']}));quitting=true;clearInterval(pollTimer);app.exit(0);
}
