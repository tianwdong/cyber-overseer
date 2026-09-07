import type {Task} from './model';
export interface DiscoveryCheck {updated:number;checked:number}
export function discoveryCandidates(rows:Task[],watching:ReadonlySet<string>,paused:ReadonlySet<string>,seen:ReadonlyMap<string,DiscoveryCheck>,now:number):Task[]{
  return rows.filter(t=>!watching.has(t.id)&&!paused.has(t.id)&&(!seen.has(t.id)||seen.get(t.id)!.updated!==t.updatedAt||now-seen.get(t.id)!.checked>60000))
    .sort((a,b)=>(seen.get(a.id)?.checked??0)-(seen.get(b.id)?.checked??0)).slice(0,20);
}
