import type {OverseerState} from './model';
import type {LiveState} from './live-state';
import {watchSummary} from './attention';

export interface CompanionTask {id:string;title:string;project:string;live?:LiveState;selected:boolean}
export interface CompanionSummary {
 running:number;waiting:number;unread:number;tasks:CompanionTask[];
 result?:{id:string;threadId:string;title:string;excerpt:string;at:number};
}
// Only owned, open tasks (plus the user's selection) belong on the desktop card.
// Disk history cannot establish that a task is currently working.
export function companionSummary(s:OverseerState):CompanionSummary {
 const watched=new Set(s.watchingIds),attention=new Set(watchSummary(s).attentionIds);
 const open=s.tasks.filter(t=>watched.has(t.id));
 const running=open.filter(t=>s.liveStates?.[t.id]?.connection==='live'&&s.liveStates[t.id].work==='running').length;
 const waiting=open.filter(t=>s.liveStates?.[t.id]?.connection==='live'&&s.liveStates[t.id].work==='waiting').length;
 const unread=(s.inbox??[]).filter(e=>!e.read),entry=[...unread].sort((a,b)=>b.at-a.at)[0];
 const rank=(id:string)=>attention.has(id)?0:s.liveStates?.[id]?.connection==='live'&&s.liveStates[id].work==='running'?(id===s.selectedId?1:2):id===s.selectedId?3:4;
 const tasks=s.tasks.filter(t=>watched.has(t.id)||t.id===s.selectedId).sort((a,b)=>rank(a.id)-rank(b.id)||b.updatedAt-a.updatedAt).slice(0,3)
  .map(t=>({id:t.id,title:t.title,project:t.cwd.split(/[\\/]/).filter(Boolean).at(-1)??'',live:s.liveStates?.[t.id],selected:t.id===s.selectedId}));
 return {running,waiting,unread:unread.length,tasks,result:entry?{id:entry.id,threadId:entry.threadId,title:s.tasks.find(t=>t.id===entry.threadId)?.title??entry.title,excerpt:entry.excerpt.slice(0,180),at:entry.at}:undefined};
}
export function codexTaskUrl(s:Pick<OverseerState,'tasks'|'inbox'>,id:string):string {
 if(!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)||!s.tasks.some(t=>t.id===id)&&!s.inbox?.some(e=>e.threadId===id))throw Error('Unknown Codex task');
 return `codex://threads/${id}`;
}
