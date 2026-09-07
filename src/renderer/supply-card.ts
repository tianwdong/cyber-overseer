import {healthLabel} from '../core/watch-health';
import {remainingSupply,supplyStale,type SupplyState} from '../core/supply';
import type {CharacterId} from '../core/characters';
import type {Language} from '../core/settings';
const themes={mechanic:['猫粮储备','Food reserve','FOOD'],foreman:['动力电池','Power reserve','POWER'],medic:['能量液储罐','Energy reservoir','ENERGY'],ranger:['巡航能源','Flight reserve','FLIGHT']} as const;
export function renderSupplyCard(root:HTMLElement,s:SupplyState,c:CharacterId,language:Language){
 const en=language==='en',t=(zh:string,enText:string)=>en?enText:zh,a=s.account,r=remainingSupply(a),stale=a?supplyStale(a):false;
 root.replaceChildren();root.dataset.character=c;
 const add=(tag:string,text:string,cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;root.append(e);return e;};
 const w=s.watch;
 if(w){add('h2',w.attention?t(`${w.attention} 个任务需要处理`,`${w.attention} task(s) need you`):w.recovering?t('正在恢复任务','Recovering tasks'):w.watching?t('正在看护','Keeping watch'):w.autoAll===false?t('自动看护已暂停','Automatic watching paused'):t('等待打开的任务','Waiting for open tasks'));
 add('div',t(`看护 ${w.watching} 个任务 · 恢复中 ${w.recovering} 个`,`Watching ${w.watching} tasks · recovering ${w.recovering}`),'supply-muted');
 if(w.unconfirmed)add('div',t('恢复结果未确认，请查看原任务','Recovery unconfirmed · check the original task'),'supply-warning');
 for(const kind of new Set(w.healthIssues?.map(i=>i.kind)))add('div',healthLabel(kind,en),'supply-warning');
 if(w.discoveryError&&!w.healthIssues?.length)add('div',t('任务发现暂时不可用，已有看护继续','Discovery unavailable · existing watchers continue'),'supply-warning');
 if(w.title)add('div',w.title,'supply-title');
 if(w.exhausted)add('div',t('自动重试已用尽，点击查看','No retries left · click to review'),'supply-warning');}
 add('h2',themes[c][en?1:0],'supply-section-title');
 add('div',r===null?'—':`${Math.round(r)}%`,'supply-number');
 add('div',t('所有任务共用这份额度','Shared across your tasks'),'supply-muted');
 const meter=add('div','','supply-meter');meter.dataset.kind=c;const fill=document.createElement('i');fill.style.width=`${r??0}%`;meter.append(fill);meter.classList.toggle('unknown',r===null);meter.classList.toggle('low',r!==null&&r<20);
 if(r===0&&!stale)add('div',t('额度已用尽。补给后需在 Codex 中继续任务。','Quota exhausted. Continue in Codex after it resets.'),'supply-warning');
 if(r!==null&&r>0&&r<20&&!stale)add('div',t(c==='mechanic'?'猫粮不多了':'补给不多了','Running low'),'supply-warning');
 if(stale)add('div',t('暂时没更新，先显示上次记录','Last recorded · waiting for an update'),'supply-warning');
 if(r===null)add('div',t('还没读到额度','Supply unavailable · checking Codex'),'supply-muted');
 for(const w of a?.windows??[]){
  const label=w.minutes===10080?t('周额度','Weekly'):w.minutes===300?t('五小时额度','5-hour'):`${w.minutes/60}h`;
  const row=add('div',`${w.name} · ${label}`,'supply-row');const b=document.createElement('b');b.textContent=`${Math.round(100-w.used)}%`;row.append(b);
  if(w.resetAt){const delta=w.resetAt-Date.now(),minutes=Math.max(0,Math.ceil(delta/60000)),countdown=en?(minutes>=1440?`${Math.floor(minutes/1440)}d ${Math.floor(minutes%1440/60)}h`:`${Math.floor(minutes/60)}h ${minutes%60}m`):minutes>=1440?`${Math.floor(minutes/1440)} 天 ${Math.floor(minutes%1440/60)} 小时`:minutes>=60?`${Math.floor(minutes/60)} 小时 ${minutes%60} 分钟`:`${minutes} 分钟`;add('div',delta<=0?t('已到重置时间，等待额度更新','Reset time reached · awaiting updated quota'):(en?'Next refill '+countdown:countdown+'后补给')+' · '+new Date(w.resetAt).toLocaleString(en?'en-US':'zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}),'supply-muted');}
 }

 add('div',t('所选任务','Selected task'),'supply-eyebrow supply-task');add('div',s.title??t('还没选任务','No task selected'),'supply-title');
 if(s.task)add('div',s.task.estimatedUSD===null?t('API 费用估算暂不可用','API estimate unavailable'):`${t('累计 API 估价','Cumulative API estimate')} ≈ $${s.task.estimatedUSD.toFixed(2)}`,'supply-muted');
 if(s.task)add('div',t('按当前标准价折算，非订阅账单','At current standard rates · not your subscription bill'),'supply-muted');
}
