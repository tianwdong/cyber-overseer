import type {OverseerState} from '../core/model';
const get=(id:string)=>document.getElementById(id)!;
let signature='';
export function renderInbox(s:OverseerState){
 const en=s.language==='en',entries=s.inbox??[],unread=entries.filter(e=>!e.read).length;
 get('open-inbox').textContent=(en?'Results inbox':'收工信箱')+(unread?` · ${unread}`:'');
 get('open-inbox').classList.toggle('has-unread',unread>0);
 const all=get('inbox-read-all') as HTMLButtonElement;all.textContent=en?'Mark all as read':'全部标为已读';all.disabled=!unread;get('inbox-count').textContent=unread?(en?`${unread} unread`:`${unread} 条未读`):(en?'All caught up':'已全部读完');all.onclick=async()=>{all.disabled=true;try{await window.overseer.command('inbox-read-many',JSON.stringify(entries.filter(e=>!e.read).map(e=>e.id)));}catch{all.disabled=false;get('inbox-error').hidden=false;get('inbox-error').textContent=en?'Unable to save read status. Please retry.':'已读状态未保存，请重试。';}};
 get('inbox-title').textContent=en?'Results inbox':'收工信箱';get('close-inbox').textContent=en?'Close ×':'关闭 ×';
 get('inbox-hint').textContent=en?'Finished turns, not verified goals. Latest 100 results; excerpts are saved locally. Expand to mark read, or mark all above. Read status is local to this inbox.':'本轮结束不代表目标已验收。保留最近 100 条结果，回复摘录仅存本机；展开后标为已读，也可批量标记；已读状态独立于 Codex。';
 get('inbox-error').hidden=!s.inboxError;get('inbox-error').textContent=en?'Unable to save the inbox. Automatic recovery is still running.':'收工信箱暂时无法保存，自动恢复仍独立运行。';
 const titles=new Map(s.tasks.map(t=>[t.id,t.title]));
 const next=JSON.stringify([entries,[...titles],en]);if(signature===next)return;signature=next;
 const open=new Set(Array.from(get('inbox-list').querySelectorAll<HTMLDetailsElement>('details[open]'),d=>d.dataset.id));
 if(!entries.length){get('inbox-list').textContent=en?'No new results yet. Finished turns will appear here while watching is enabled.':'还没有新结果。看护期间结束的任务会送到这里。';return;}
 get('inbox-list').replaceChildren(...[...entries].reverse().map(entry=>{
  const card=document.createElement('details');card.dataset.id=entry.id;card.open=open.has(entry.id);card.className=entry.read?'':'unread';
  const heading=document.createElement('summary');heading.textContent=(entry.read?'':'● ')+(titles.get(entry.threadId)??entry.title);
  const meta=document.createElement('p');meta.className='hint';meta.textContent=(en?'Turn ended · ':'本轮结束 · ')+new Date(entry.at).toLocaleString(en?'en-US':'zh-CN')+' · '+entry.cwd;
  const excerpt=document.createElement('p');excerpt.className='result-excerpt';excerpt.textContent=entry.excerpt||(en?'No reply excerpt was available. Open the task to see the result.':'未读取到回复摘录，可打开任务查看结果。');
  const button=document.createElement('button');button.className='secondary';button.textContent=en?'View task details':'查看任务详情';button.disabled=!titles.has(entry.threadId);button.title=button.disabled?(en?'Task is no longer in the local inventory.':'任务已不在本机列表中。'):entry.threadId;button.onclick=()=>get('inbox-dialog').dispatchEvent(new CustomEvent('inbox-open-task',{detail:entry.threadId}));
  const original=document.createElement('button');original.className='secondary';original.textContent=en?'Open in Codex ↗':'在 Codex 中打开 ↗';original.onclick=()=>void window.overseer.command('open-codex',entry.threadId).catch(()=>{get('inbox-error').hidden=false;get('inbox-error').textContent=en?'Unable to open Codex. The saved result is still available.':'暂时无法打开 Codex，仍可查看已保存的结果。';});
  card.append(heading,meta,excerpt,button,original);card.addEventListener('toggle',()=>{if(card.open&&!entry.read)void window.overseer.command('inbox-read',entry.id).catch(()=>{get('inbox-error').hidden=false;get('inbox-error').textContent=en?'Unable to save read status.':'已读状态暂时无法保存。';});});return card;
 }));
}
