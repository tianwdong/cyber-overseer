import type {OverseerState} from './model';
export type HealthKind='discovery'|'connection'|'read'|'dispatch'|'storage'|'owner';
export interface HealthIssue {kind:HealthKind;threadId?:string;since:number}
export const healthGraceMs=30000;
export function watchHealth(s:OverseerState,now=Date.now()):HealthIssue[]{
 const issues:HealthIssue[]=[];
 if(s.autoAll!==false&&s.inventoryError&&(s.health?.discoveryFailedAt===undefined||now-s.health.discoveryFailedAt>=healthGraceMs))issues.push({kind:'discovery',since:s.health?.discoveryFailedAt??0});
 if(s.health?.journalError)issues.push({kind:'storage',since:0});
 for(const id of s.watchingIds){
  const live=s.liveStates?.[id];
  const since=s.health?.connectionSince?.[id];
  if(live?.connection!=='live'&&since!==undefined&&now-since>=healthGraceMs)issues.push({kind:'connection',threadId:id,since});
  for(const kind of ['read','dispatch','storage','owner'] as const){const at=s.health?.taskErrors?.[id]?.[kind];if(at!==undefined&&now-at>=healthGraceMs)issues.push({kind,threadId:id,since:at});}
 }
 return issues;
}
export function healthLabel(kind:HealthKind,en:boolean):string{
 const labels:Record<HealthKind,[string,string]>={owner:['无法确认任务恢复入口','Task recovery endpoint unavailable'],discovery:['暂时无法发现新任务','New-task discovery unavailable'],connection:['任务实时连接中断','Live task connection unavailable'],read:['无法读取任务状态','Task state cannot be read'],dispatch:['恢复发送通道异常','Recovery dispatch unavailable'],storage:['恢复记录保存异常','Recovery storage unavailable']};
 return labels[kind][en?1:0];
}
