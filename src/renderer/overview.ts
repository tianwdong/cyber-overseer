import {renderRecoveryOverview} from './recovery-overview';
import {renderUsageOverview} from './usage-overview';
import type {OverseerState} from '../core/model';
import {watchSummary,taskExhausted} from '../core/attention';
import {supplyStale} from '../core/supply';
const get=(id:string)=>document.getElementById(id)!;
let last='';
let page:'overview'|'tasks'='overview';
export function showDashboardPage(next:typeof page){page=next;document.body.classList.toggle('overview-page',page==='overview');get('nav-overview').setAttribute('aria-pressed',String(page==='overview'));get('nav-tasks').setAttribute('aria-pressed',String(page==='tasks'));}
get('nav-overview').onclick=()=>showDashboardPage('overview');get('nav-tasks').onclick=()=>showDashboardPage('tasks');showDashboardPage(page);
function node(tag:string,text:string,cls?:string){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
export function renderOverview(s:OverseerState){
 const en=s.language==='en',root=get('overview'),summary=watchSummary(s),inbox=s.inbox??[],unread=inbox.filter(e=>!e.read).length;
 get('nav-overview').textContent=en?'Overview':'总览';get('nav-tasks').textContent=en?'Tasks':'任务';get('page-nav').setAttribute('aria-label',en?'Pages':'页面');
 const signature=JSON.stringify([s.tasks,s.watchingIds,s.recoveringIds,s.liveStates,s.retryProgress,s.inbox,s.duty,s.health?.journalError,s.accountSupply,s.usageOverview,s.usageError,s.language,Math.floor(Date.now()/60000)]);if(signature===last)return;last=signature;
 const focus=(document.activeElement as HTMLElement)?.dataset.overviewKey;
 const stats=node('div','','overview-stats');
 const working=s.tasks.filter(t=>s.watchingIds.includes(t.id)&&(s.liveStates?.[t.id]?.connection==='live'?s.liveStates[t.id].work==='running':t.status==='running')).length;
 for(const [label,count] of [[en?'Working':'工作中',working],[en?'Recovering':'恢复中',summary.recovering],[en?'Needs you':'待你处理',summary.attention],[en?'Unread results':'未读结果',unread]] as const){const isUnread=label===(en?'Unread results':'未读结果'),cell=node(isUnread?'button':'div','','overview-stat');if(isUnread){cell.dataset.overviewKey='unread-inbox';cell.setAttribute('aria-label',en?`Open inbox, ${unread} unread`:`打开收工信箱，${unread} 条未读`);cell.onclick=()=>root.dispatchEvent(new CustomEvent('overview-inbox'));}cell.append(node('span',label),node('strong',String(count)));stats.append(cell);}
 const grid=node('div','','overview-grid');
 function card(title:string){const c=node('section','','overview-card');c.append(node('h2',title));grid.append(c);return c;}
 function taskButton(title:string,id:string,key:string){const b=node('button',title,'overview-task');b.dataset.overviewKey=key;b.onclick=()=>root.dispatchEvent(new CustomEvent('overview-task',{detail:id}));return b;}
 const attention=card(en?'Needs your attention':'待你处理');attention.classList.add('overview-attention');
 const pending=s.tasks.filter(t=>summary.attentionIds?.includes(t.id));
 if(!pending.length)attention.remove();
 for(const t of pending){const b=taskButton(t.title,t.id,'attention:'+t.id);const p=s.retryProgress?.[t.id];b.append(node('small',p?.unconfirmed?(en?'Recovery unconfirmed':'恢复结果待确认'):taskExhausted(s,t.id)?(en?'Retry limit reached':'恢复次数已用尽'):s.liveStates?.[t.id]?.work==='waiting'||t.status==='waiting'?(en?'Waiting for your input':'等待你处理'):(en?'Task interrupted':'任务中断')));attention.append(b);}
 const quota=node('section','','overview-card overview-supply');quota.append(node('h2',en?'Available quota':'可用额度'));const account=s.accountSupply,windows=account?.windows.filter(w=>w.id==='codex')??[];
 if(!windows.length)quota.append(node('p',en?'Quota is not available yet.':'暂未读取到额度。','overview-muted'));
 for(const w of windows){const row=node('div','','overview-quota');const label=w.minutes>=10080?(en?'Weekly':'周额度'):w.minutes>=60?`${w.minutes/60}${en?'h window':' 小时额度'}`:`${w.minutes}${en?'m window':' 分钟额度'}`;row.append(node('span',label),node('strong',`${Math.round(100-w.used)}% ${en?'left':'剩余'}`));const bar=document.createElement('progress');bar.max=100;bar.value=100-w.used;bar.setAttribute('aria-label',label);row.append(bar);const left=w.resetAt?Math.max(0,w.resetAt-Date.now()):null;row.append(node('small',left===null?(en?'Reset time unavailable':'重置时间未知'):left===0?(en?'Reset time reached · awaiting refresh':'已到重置时间，等待刷新'):en?`Resets in ${Math.ceil(left/3600000)}h`:`约 ${Math.ceil(left/3600000)} 小时后重置`));quota.append(row);}
 if(account)quota.append(node('p',(supplyStale(account)?(en?'Last known quota · ':'上次读取的额度 · '):(en?'Updated · ':'更新于 · '))+new Date(account.fetchedAt).toLocaleTimeString(en?'en-US':'zh-CN'),'overview-muted'));
 const results=card(en?'Latest results':'最新收工');results.classList.add('overview-results');
 if(!inbox.length)results.append(node('p',en?'New finished turns will arrive here.':'新结束的轮次会出现在这里。','overview-muted'));
 for(const e of [...inbox].reverse().slice(0,3)){const b=node('button',(e.read?'':'● ')+(s.tasks.find(t=>t.id===e.threadId)?.title??e.title),'overview-task');b.dataset.overviewKey=e.id;b.append(node('small',(en?'Turn ended · ':'本轮结束 · ')+new Date(e.at).toLocaleTimeString(en?'en-US':'zh-CN')),node('p',e.excerpt||(en?'Open inbox to view this result.':'打开信箱查看结果。'),'overview-excerpt'));b.onclick=()=>root.dispatchEvent(new CustomEvent('overview-inbox',{detail:e.id}));results.append(b);}
 const more=node('button',en?'Open results inbox →':'查看收工信箱 →','quiet');more.dataset.overviewKey='inbox';more.onclick=()=>root.dispatchEvent(new CustomEvent('overview-inbox'));results.append(more);
 const usage=renderUsageOverview(s,quota);root.replaceChildren(stats,...(pending.length?[attention]:[]),usage,renderRecoveryOverview(s),results);if(focus)Array.from(root.querySelectorAll<HTMLElement>('[data-overview-key]')).find(e=>e.dataset.overviewKey===focus)?.focus({preventScroll:true});
}
