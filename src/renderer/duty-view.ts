import type {DutyEntry} from '../main/duty-journal';
import type {Language} from '../core/settings';
const labels:Record<DutyEntry['kind'],[string,string]>={failed:['检测到任务中断','Task interruption detected'],continue:['已发送继续请求','Continue request sent'],compact:['已请求重新压缩','Compaction requested'],checking:['提交结果待确认','Submission unconfirmed'],unconfirmed:['恢复未确认，需要你查看','Recovery unconfirmed · needs you'],recovered:['已确认恢复执行','Execution resumed'],completed:['新一轮任务已结束','New turn ended'],exhausted:['自动重试已用尽','Retry limit reached'],waiting:['等待你处理','Waiting for your input']};
export function renderDuty(root:HTMLElement,entries:DutyEntry[],language:Language){
 const en=language==='en',open=new Set([...root.querySelectorAll<HTMLDetailsElement>('details[open]')].map(d=>d.dataset.episode));
 const groups=new Map<string,DutyEntry[]>();
 for(const entry of entries){const key=entry.context?.episodeId??entry.id;const group=groups.get(key)??[];group.push(entry);groups.set(key,group);}
 root.replaceChildren();
 for(const [id,group] of [...groups].slice(-20).reverse()){
  const first=group[0],last=group.at(-1)!,li=document.createElement('li'),details=document.createElement('details'),summary=document.createElement('summary');
  details.dataset.episode=id;details.open=open.has(id);summary.textContent=labels[last.kind][en?1:0];
  const reason=group.find(e=>e.context?.reason&&e.context.reason!=='unknown')?.context?.reason??first.context?.reason;
  const meta=document.createElement('p');meta.className='duty-meta';
  meta.textContent=(reason==='compaction'?(en?'Context compaction':'上下文压缩'):reason==='capacity'?(en?'Model at capacity':'模型容量不足'):reason==='network'?(en?'Network interruption':'网络中断'):(en?'Task event':'任务事件'))+' · '+new Date(first.at).toLocaleString(en?'en-US':'zh-CN',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const list=document.createElement('ol');
  for(const entry of group){const row=document.createElement('li');row.dataset.kind=entry.kind;row.textContent=new Date(entry.at).toLocaleTimeString(en?'en-US':'zh-CN',{hour:'2-digit',minute:'2-digit',second:'2-digit'})+' · '+labels[entry.kind][en?1:0]+(entry.attempt?(en?' · attempt ':' · 第 ')+entry.attempt+(en?'':' 次'):'');list.append(row);}
  details.append(summary,meta,list);li.append(details);root.append(li);
 }
 if(!entries.length){const li=document.createElement('li');li.textContent=en?'No recovery events for this task.':'此任务暂无恢复记录。';root.append(li);}
}
