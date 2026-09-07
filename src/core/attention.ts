import {watchHealth} from './watch-health';
import type {OverseerState,Task} from './model';
export interface WatchSummary {watching:number;attention:number;recovering:number;targetId:string|null;title:string|null;exhausted:boolean;unconfirmed?:boolean;healthIssues?:import("./watch-health").HealthIssue[];attentionIds?:string[];autoAll?:boolean;discoveryError?:boolean}
export function taskExhausted(s:OverseerState,id:string):boolean {
 const live=s.liveStates?.[id];
 if(live?.connection==='live'&&['running','idle','review','retrying','waiting'].includes(live.work))return false;
 const task=s.tasks.find(t=>t.id===id);
 if(!live&&task?.status!=='failed')return false;
 return !!s.retryProgress?.[id]?.exhausted;
}
export function taskNeedsAttention(s:OverseerState,t:Task,recovering:ReadonlySet<string>):boolean {
 const live=s.liveStates?.[t.id];
 if(live?.connection==='live'&&['running','idle','review','retrying'].includes(live.work))return false;
 return !!s.retryProgress?.[t.id]?.unconfirmed||taskExhausted(s,t.id)||live?.work==='waiting'||(!recovering.has(t.id)&&(live?.work==='failed'||(!live&&['failed','waiting'].includes(t.status))));
}
export function watchSummary(s:OverseerState,recovering:ReadonlySet<string>=new Set(s.recoveringIds??[])):WatchSummary {
 const watched=new Set(s.watchingIds);
 const needs=s.tasks.filter(t=>watched.has(t.id)&&taskNeedsAttention(s,t,recovering))
  .sort((a,b)=>Number(taskExhausted(s,b.id))-Number(taskExhausted(s,a.id)));
 const recoveringIds=[...recovering].filter(id=>watched.has(id)&&!needs.some(t=>t.id===id));
 const target=needs[0]??s.tasks.find(t=>recoveringIds.includes(t.id));
 return {healthIssues:watchHealth(s),unconfirmed:!!(target&&s.retryProgress?.[target.id]?.unconfirmed),watching:watched.size,attention:needs.length,recovering:recoveringIds.length,targetId:target?.id??null,title:target?.title??null,exhausted:!!(target&&taskExhausted(s,target.id)),attentionIds:needs.map(t=>t.id),autoAll:s.autoAll,discoveryError:!!s.inventoryError};
}
