import {renderOverview,showDashboardPage} from './overview';
import {renderAppUpdates} from './app-updates';
import {renderInbox} from './inbox-view';
import {renderDuty} from './duty-view';
import {watchHealth,healthLabel} from '../core/watch-health';
import {watchSummary,taskExhausted} from '../core/attention';
import {translateStatic} from './localization';
import {updateSettings} from './settings';
import {tr} from '../core/i18n';
import { updateWorkshop } from './workshop';
import type { OverseerState, Task } from '../core/model';
const el = (id:string) => document.getElementById(id)!;
const names:Record<Task['status'],string>={unknown:'状态未读取',running:'工作中',retrying:'正在重连',failed:'响应中断',completed:'已结束',waiting:'等待用户'};
let selected:string|null=null,lastRows='',query='',filter='all';
let latestState:OverseerState|undefined;
function render(s:OverseerState) {
  renderInbox(s);renderOverview(s);latestState=s;selected=s.selectedId;const lang=s.language??'zh';translateStatic(lang);updateSettings(s);renderAppUpdates(s);updateWorkshop(s.character,lang);
  document.body.classList.toggle('live-dashboard',s.mode==='live');
  const summary=watchSummary(s),issues=watchHealth(s);
  el('watch-health-alert').hidden=!issues.length||s.mode==='demo';
  el('watch-health-alert').textContent=[...new Set(issues.map(i=>healthLabel(i.kind,lang==='en')))].join(' · ');
  el('watch-health-alert').title=issues.map(i=>healthLabel(i.kind,lang==='en')+(i.threadId?' · '+(s.tasks.find(t=>t.id===i.threadId)?.title??i.threadId):'')).join('\n');
  const isDemo=s.mode==='demo',located=s.location.kind==='located';
  if(!isDemo){el('page-title').textContent=lang==='en'?'Task watch':'任务看护';el('page-description').textContent=lang==='en'?'Keep work moving. Step in when needed.':'让任务继续，需要时再接手。';el('roster-heading').textContent=lang==='en'?'Tasks':'任务列表';el('detail-heading').textContent=lang==='en'?'Task details':'任务详情';}
  el('watch-heading').textContent=lang==='en'?(s.watchingIds.length?'Keeping watch':s.autoAll===false?'Automatic watching paused':'Waiting for open tasks'):(s.watchingIds.length?'督工已到岗':s.autoAll===false?'自动看护已暂停':'等待打开的任务');
  document.querySelector<HTMLElement>('.shift .dot')!.style.background=summary.attention||issues.length?'#dfaa7c':s.watchingIds.length?'#8db6a0':'#859097';
  if(!isDemo&&issues.length)el('watch-heading').textContent=lang==='en'?'Watch connection needs attention':'看护连接需要检查';
  el('mode').textContent=isDemo?'演练场 / DEMO':'本机督工 / LOCAL';
  el('count').textContent=String(s.tasks.length).padStart(2,'0');
  const focusedId=(document.activeElement as HTMLElement)?.dataset.taskId;
  const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const visible=s.tasks.filter(t=>terms.every(term=>`${t.title} ${t.cwd} ${t.id}`.toLocaleLowerCase().includes(term))&&(filter==='all'||filter==='attention'&&summary.attentionIds?.includes(t.id)||filter==='watching'&&s.watchingIds.includes(t.id)));
  const search=el('task-search') as HTMLInputElement;search.placeholder=lang==='en'?'Search tasks or projects':'搜索任务或项目';search.setAttribute('aria-label',lang==='en'?'Search by task, project or full task ID':'按任务、项目或完整任务 ID 搜索');
  el('task-filters').setAttribute('aria-label',lang==='en'?'Filter tasks':'筛选任务');
  for(const button of el('task-filters').querySelectorAll<HTMLButtonElement>('button')){button.setAttribute('aria-pressed',String(button.dataset.filter===filter));button.textContent=button.dataset.filter==='all'?(lang==='en'?'All':'全部'):button.dataset.filter==='attention'?(lang==='en'?'Needs you':'待处理'):(lang==='en'?'Watching':'看护中');}
  el('clear-search').hidden=!query;el('clear-search').setAttribute('aria-label',lang==='en'?'Clear search':'清除搜索');search.title=lang==='en'?'Find tasks: ⌘F / Ctrl+F · ↓ to browse':'查找任务：⌘F / Ctrl+F · ↓ 浏览结果';
  el('count').textContent=visible.length===s.tasks.length?String(visible.length):`${visible.length}/${s.tasks.length}`;
  el('task-empty').hidden=visible.length>0;el('task-empty').textContent=query.trim()?(lang==='en'?'No matching tasks. Try a title, project or task ID.':'没有匹配的任务，试试标题、项目或任务 ID。'):filter==='attention'?(lang==='en'?'Nothing needs your attention.':'目前没有需要你处理的任务。'):filter==='watching'?(lang==='en'?'No tasks are being watched.':'目前没有正在看护的任务。'):(lang==='en'?'Open a task in Codex to get started.':'在 Codex 打开一个任务，即可开始看护。');
  el('reveal-selected').hidden=!s.selectedId||visible.some(t=>t.id===s.selectedId);el('reveal-selected').textContent=lang==='en'?'Selected task is hidden · show it':'当前任务不在结果中 · 显示它';
  const rows=[...visible].sort((a,b)=>Number(summary.attentionIds?.includes(b.id))-Number(summary.attentionIds?.includes(a.id))||Number(s.watchingIds.includes(b.id))-Number(s.watchingIds.includes(a.id)));
  const rowSignature=JSON.stringify([rows,s.watchingIds,s.pausedIds,s.retryProgress,s.liveStates,s.selectedId,lang,query,filter]);
  if(rowSignature!==lastRows){lastRows=rowSignature;const scroll=el('tasks').scrollTop;el('tasks').replaceChildren(...rows.map(t=>{
    const b=document.createElement('button');b.dataset.taskId=t.id;b.className=`task${t.id===s.selectedId?' selected':''}`;b.setAttribute('aria-pressed',String(t.id===s.selectedId));b.title=`${t.title}\n${t.id}\n${t.cwd}`;
    const title=document.createElement('span');title.className='task-title';title.textContent=t.title;
    const meta=document.createElement('span');meta.className='task-meta';
    const id=document.createElement('span');id.className='task-project';id.textContent=t.cwd.replace(/[\\/]+$/,'').split(/[\\/]/).at(-1)||t.cwd;id.title=`${t.cwd}\n${t.id}`;
    const status=document.createElement('span');b.dataset.attention=String(summary.attentionIds?.includes(t.id)??false);status.className=`task-status ${t.status}`;status.textContent=`${s.watchingIds.includes(t.id)?tr('● 督工中 · ',lang):''}${tr(s.pausedIds?.includes(t.id)?'自动恢复已暂停':s.retryProgress?.[t.id]?.unconfirmed&&summary.attentionIds?.includes(t.id)?(lang==='en'?'Recovery unconfirmed':'恢复结果未确认'):taskExhausted(s,t.id)?'重试次数已用尽':s.liveStates?.[t.id]?.label??names[t.status],lang)}`;meta.append(id,status);b.append(title,meta);
    b.onclick=()=>{document.querySelector('.target-area')!.scrollTop=0;void run('select',t.id);};return b;
  }));
  el('tasks').scrollTop=scroll;
  if(focusedId)Array.from(el('tasks').querySelectorAll<HTMLElement>('[data-task-id]')).find(b=>b.dataset.taskId===focusedId)?.focus({preventScroll:true});}
  const live=s.selectedId?s.liveStates?.[s.selectedId]:undefined;
  const task=s.tasks.find(t=>t.id===s.selectedId);
  renderDuty(el('duty-list'),(s.duty??[]).filter(e=>e.threadId===s.selectedId),lang);
  const connected=s.watchingIds.filter(id=>s.liveStates?.[id]?.connection==='live').length;
  el('duty-health').textContent=(lang==='en'?`State connections: ${connected}/${s.watchingIds.length}. `:`状态连接：${connected}/${s.watchingIds.length}。`)+(s.inventoryError?(lang==='en'?'Discovery unavailable. ':'任务发现异常。'):s.health?.discoveredAt?(lang==='en'?'Task inventory read. ':'任务索引已读取。'):(lang==='en'?'Discovery not yet verified. ':'任务发现尚未确认。'))+(s.health?.dispatchAt?(lang==='en'?'A dispatch was accepted this run.':'本次运行已有请求被接收。'):(lang==='en'?'Dispatch not yet verified this run.':'本次运行尚未验证指令发送。'))+(s.health?.journalError?(lang==='en'?' History storage unavailable.':'记录存储异常。'):'');

  el('target-project').textContent=task?.cwd??'';el('target-project').title=task?.cwd??'';
  el('target-watch-status').textContent=isDemo?'':s.selectedId&&s.watchingIds.includes(s.selectedId)?(lang==='en'?'Automatic recovery is on for this task.':'此任务已开启自动恢复。'):(lang==='en'?'Automatic recovery is off for this task.':'此任务未开启自动恢复。');
  el('selected-id').textContent=s.selectedId ?? '尚未选择';
  el('task-short').textContent=s.selectedId?.slice(-8)??'—';
  el('target-title').textContent=task?.title??'选择一个任务';
  el('task-status').parentElement!.dataset.state=live?.work??task?.status??'unknown';
  el('task-status').textContent=live?`${live.connection==='live'?tr('实时 · ',lang):''}${tr(live.label,lang)}`:task?names[task.status]:'等待任务状态';
  el('error-text').textContent=task?.error??'';
  el('error-box').classList.toggle('hidden',!task?.error||(live?.connection==='live'&&live.work!=='failed'));
  el('location-pill').textContent=located?'● 已确认位置':'○ 尚未确认';el('location-pill').classList.toggle('located',located);
  el('shift-state').textContent=`${tr(s.selectedId&&s.watchingIds.includes(s.selectedId)?'此任务自动督工中':'此任务未启用自动恢复',lang)} · ${tr('共监看 {0} 个任务',lang,s.watchingIds.length)}`;
  const progress=s.selectedId?s.retryProgress?.[s.selectedId]:undefined;
  const handoff=progress?.unconfirmed&&s.selectedId&&summary.attentionIds?.includes(s.selectedId);
  el('recovery-handoff').hidden=!handoff;
  el('handoff-message').textContent=handoff?(lang==='en'?`Recovery has been unconfirmed since ${new Date(progress!.unconfirmed!.since).toLocaleTimeString('en-US')}. Check the original Codex task. We keep checking receipts without sending again; pause this task below if you take over.`:`自 ${new Date(progress!.unconfirmed!.since).toLocaleTimeString('zh-CN')} 起仍未确认恢复。请查看原 Codex 任务；督工继续核对回执，不会重复发送。接手后可在下方暂停此任务看护。`):'';
  el('check-recovery').textContent=lang==='en'?'Check again':'重新检查';
  if(handoff){el('task-status').textContent=lang==='en'?'Recovery unconfirmed':'恢复结果未确认';el('task-status').parentElement!.dataset.state='waiting';}
  el('message').textContent=handoff?(lang==='en'?'Recovery unconfirmed. Check the original task; no duplicate request will be sent.':'恢复结果未确认，请查看原任务；督工不会重复发送请求。'):s.selectedId&&taskExhausted(s,s.selectedId)?(lang==='en'?`Automatic recovery exhausted (${progress!.used}/${progress!.limit}). Continue in Codex, or adjust the retry limit in Settings.`:`自动恢复已用尽（${progress!.used}/${progress!.limit} 次）。请在 Codex 中继续，或在设置中调整恢复上限。`):live?.connection==='live'&&['running','idle','review','waiting','retrying'].includes(live.work)?tr(live.label,lang):s.selectedId?s.recoveryMessages?.[s.selectedId]??s.recoveryMessage??s.message:s.message;
  if(!isDemo)el('shift-state').textContent=lang==='en'?`Watching ${s.watchingIds.length} ${s.watchingIds.length===1?'task':'tasks'} · ${summary.attention} ${summary.attention===1?'needs':'need'} you`:`看护 ${s.watchingIds.length} 个任务 · ${summary.attention} 个需要处理`;
  el('inventory-error').textContent=s.inventoryError??'';
  el('stage-label').textContent=isDemo?'模拟 Codex 窗口':'所选任务 · 信息卡';
  el('stage-caption').textContent=isDemo?'演练窗口 · 不控制真实 Codex':'会话信息，非截图 · 督工在屏幕边缘待命';
  el('list-hint').textContent=isDemo?'同名也没关系，任务 ID 说了算。':'自动发现本机打开的任务，新任务自动加入；历史记录不会自行唤醒。';
  el('step-1').classList.toggle('done',!!task);el('step-2').classList.toggle('done',located);el('step-3').classList.toggle('done',located);
  for(const id of ['whip','show-demo','hide-demo'])el(id).classList.toggle('hidden',!isDemo);
  for(const id of ['read-tasks','observe','auto','global-auto'])el(id).classList.toggle('hidden',isDemo);
  (el('whip') as HTMLButtonElement).disabled=!located;
  (el('observe') as HTMLButtonElement).disabled=!task;
  (el('auto') as HTMLButtonElement).disabled=!task;
  el('global-auto').textContent=s.autoAll?'全局自动督工中 · 暂停全部':'开启全局自动督工';
  el('auto').textContent=s.selectedId&&s.watchingIds.includes(s.selectedId)?(lang==='en'?'Pause task recovery':'暂停此任务恢复'):(lang==='en'?'Enable task recovery':'开启此任务恢复');
  el('auto').title=lang==='en'?'Only controls automatic recovery. The Codex task keeps running.':'仅控制自动恢复，不会停止 Codex 正在执行的任务。';
  for(const id of ['mode','selected-id','task-status','location-pill','message','inventory-error','stage-label','stage-caption','list-hint','global-auto','auto'])el(id).textContent=tr(el(id).textContent??'',lang);
}
async function run(name:string,value?:string){try{render(await window.overseer.command(name,value));}catch(e){el('message').textContent=e instanceof Error?e.message:'操作未完成，请重新读取状态。';}}
for(const [id,name] of [['global-auto','global-auto'],['whip','whip-demo'],['show-demo','show-demo'],['hide-demo','hide-demo'],['read-tasks','read-tasks'],['observe','observe'],['auto','auto']])el(id).onclick=()=>void run(name);
window.overseer.onState(render);void window.overseer.state().then(render);

window.overseer.onTask(()=>{showDashboardPage('tasks');resetTaskFilters();document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());document.getElementById('target-title')?.scrollIntoView({block:'center'});});

document.getElementById('clear-duty')!.onclick=()=>void run('clear-duty');

document.getElementById('check-recovery')!.onclick=async()=>{const button=el('check-recovery') as HTMLButtonElement,feedback=el('check-feedback'),en=document.documentElement.lang==='en';button.disabled=true;feedback.textContent=en?'Checking…':'正在检查…';try{render(await window.overseer.command('check-recovery'));feedback.textContent=en?'State refreshed. Receipt checks continue.':'状态已刷新，回执继续自动核对。';}catch{feedback.textContent=en?'Unable to read the task. Automatic checks will continue.':'暂时无法读取任务，稍后会继续自动检查。';}finally{button.disabled=false;}};

function resetTaskFilters(){query='';filter='all';(el('task-search') as HTMLInputElement).value='';if(latestState)render(latestState);}
const taskSearch=el('task-search') as HTMLInputElement;
function searchTasks(){query=taskSearch.value;el('tasks').scrollTop=0;if(latestState)render(latestState);}
taskSearch.addEventListener('input',e=>{if(!(e as InputEvent).isComposing)searchTasks();});taskSearch.addEventListener('compositionend',searchTasks);
taskSearch.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing){e.stopPropagation();resetTaskFilters();}});
for(const button of el('task-filters').querySelectorAll<HTMLButtonElement>('button'))button.onclick=()=>{filter=button.dataset.filter!;el('tasks').scrollTop=0;if(latestState)render(latestState);};
el('reveal-selected').onclick=()=>{resetTaskFilters();el('tasks').querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest'});};

el('clear-search').onclick=()=>{query='';taskSearch.value='';searchTasks();taskSearch.focus();};
document.addEventListener('keydown',e=>{
  if(e.isComposing||document.querySelector('dialog[open]'))return;
  if((e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='f'){
    e.preventDefault();showDashboardPage('tasks');taskSearch.focus();taskSearch.select();return;
  }
  const buttons=Array.from(el('tasks').querySelectorAll<HTMLButtonElement>('[data-task-id]'));
  const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
  if(document.activeElement===taskSearch&&e.key==='ArrowDown'&&buttons.length){e.preventDefault();buttons[0].focus();}
  else if(current>=0&&['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
    e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,current+(e.key==='ArrowDown'?1:-1)));buttons[next].focus();
  }else if(current>=0&&e.key==='Escape'){e.preventDefault();taskSearch.focus();}
});

el('open-inbox').onclick=()=>{(el('inbox-dialog') as HTMLDialogElement).showModal();};
el('close-inbox').onclick=()=>{(el('inbox-dialog') as HTMLDialogElement).close();};
el('inbox-dialog').addEventListener('inbox-open-task',async event=>{
 const id=(event as CustomEvent<string>).detail;
 try{const next=await window.overseer.command('select',id);resetTaskFilters();render(next);showDashboardPage('tasks');(el('inbox-dialog') as HTMLDialogElement).close();document.querySelector('.target-area')!.scrollTop=0;}
 catch{el('inbox-error').hidden=false;el('inbox-error').textContent=document.documentElement.lang==='en'?'Unable to open this task. The saved result is still available.':'暂时无法打开任务，仍可查看已保存的结果。';}
});

el('overview').addEventListener('overview-task',async event=>{try{const next=await window.overseer.command('select',(event as CustomEvent<string>).detail);resetTaskFilters();render(next);showDashboardPage('tasks');document.querySelector('.target-area')!.scrollTop=0;}catch{el('message').textContent=document.documentElement.lang==='en'?'Unable to open this task.':'暂时无法打开此任务。';}});
function openInbox(id?:string){document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());(el('inbox-dialog') as HTMLDialogElement).showModal();if(id){const card=Array.from(el('inbox-list').querySelectorAll<HTMLDetailsElement>('details')).find(d=>d.dataset.id===id);if(card){card.open=true;card.scrollIntoView({block:'nearest'});}}}
window.overseer.onInbox(openInbox);
el('overview').addEventListener('overview-inbox',event=>openInbox((event as CustomEvent<string>).detail));
