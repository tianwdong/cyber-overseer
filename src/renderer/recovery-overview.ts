import type {OverseerState} from '../core/model';
import {recoverySummary} from '../core/recovery-summary';
const el=(tag:string,text='',cls='')=>{const e=document.createElement(tag);e.textContent=text;e.className=cls;return e;};
export function renderRecoveryOverview(s:OverseerState){
 const en=s.language==='en',data=recoverySummary(s.duty??[]),root=el('section','','overview-card recovery-overview');root.append(el('h2',en?'Recovery record':'督工恢复记录'));
 if(s.health?.journalError)root.append(el('p',en?'Journal unavailable; counts may be incomplete.':'恢复记录读取或保存异常，统计可能不完整。','overview-muted'));
 const stats=el('div','','recovery-metrics');for(const [label,value] of [[en?'Incidents':'故障事件',data.incidents],[en?'Requests sent':'已发送恢复请求',data.requests],[en?'Confirmed resumed':'确认恢复执行',data.recovered],[en?'Outcome unresolved':'结果待确认',data.unconfirmed]]){const cell=el('div');cell.append(el('span',String(label)),el('strong',String(value)));stats.append(cell);}root.append(stats);if(!data.incidents&&!data.requests)root.append(el('p',en?'No attributable recovery activity in the retained record yet.':'当前保留的记录中，暂无可统计的恢复活动。','overview-muted'));
 for(const [id,count] of data.repeated.slice(0,5)){const task=s.tasks.find(t=>t.id===id),row=el(task?'button':'p',`${task?.title??id} · ${count} ${en?'incidents':'次故障'}`,'overview-task');if(task){row.dataset.overviewKey='recovery:'+id;row.onclick=()=>root.dispatchEvent(new CustomEvent('overview-task',{bubbles:true,detail:id}));}root.append(row);}
 root.append(el('p',(en?'Based on the latest 200 retained journal entries. A request is not a confirmed recovery.':'按最近保留的 200 条日志统计；发出请求不代表恢复成功。')+(data.unattributed?(en?` ${data.unattributed} legacy entries have no incident identity and are excluded from incident totals.`:` ${data.unattributed} 条旧记录缺少故障标识，未计入故障事件数。`):''),'usage-notes'));return root;
}
