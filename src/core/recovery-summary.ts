import type {DutyEntry} from '../main/duty-journal';
export function recoverySummary(entries:DutyEntry[]){
 const unique=[...new Map(entries.map(e=>[e.id,e])).values()].sort((a,b)=>a.at-b.at),groups=new Map<string,DutyEntry[]>();
 for(const e of unique){if(!e.context?.episodeId)continue;const key=JSON.stringify([e.threadId,e.context.episodeId]);const list=groups.get(key)??[];list.push(e);groups.set(key,list);}
 const incidents=[...groups.values()].filter(g=>g.some(e=>['failed','continue','compact','unconfirmed','exhausted','recovered'].includes(e.kind)));
 const taskCounts=new Map<string,number>();for(const g of incidents)taskCounts.set(g[0].threadId,(taskCounts.get(g[0].threadId)??0)+1);
 return {incidents:incidents.length,requests:unique.filter(e=>e.kind==='continue'||e.kind==='compact').length,recovered:incidents.filter(g=>g.some(e=>e.kind==='recovered')).length,unconfirmed:incidents.filter(g=>['continue','compact','checking','unconfirmed','exhausted','failed','waiting'].includes(g.at(-1)!.kind)).length,repeated:[...taskCounts].filter(([,count])=>count>1).sort((a,b)=>b[1]-a[1]),unattributed:unique.filter(e=>!e.context?.episodeId).length,oldest:unique[0]?.at};
}
