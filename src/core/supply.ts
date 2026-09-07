export interface SupplyWindow {id:string;name:string;used:number;minutes:number;resetAt:number|null}
export interface AccountSupply {windows:SupplyWindow[];resets:number|null;fetchedAt:number;stale:boolean;plan?:string;accountId?:string}
export interface TaskUsage {id:string;model:string|null;tokens:number|null;cached:number|null;fetchedAt:number;estimatedUSD:number|null;priceUpdatedAt?:string;priceError?:boolean;unpriced?:string[]}
export interface SupplyState {watch?:import("./attention").WatchSummary;account:AccountSupply|null;task:TaskUsage|null;title:string|null}
const number=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
export function decodeSupply(raw:any,now=Date.now()):AccountSupply {
 const buckets=raw?.rateLimitsByLimitId??(raw?.rateLimits?{codex:raw.rateLimits}:{}),windows:SupplyWindow[]=[];
 for(const [id,b] of Object.entries(buckets) as [string,any][]){
  for(const key of ['primary','secondary']){const w=b?.[key];if(!w||!number(w.usedPercent)||!number(w.windowDurationMins)||!w.windowDurationMins)continue;
   windows.push({id,name:b.limitName??'Codex',used:Math.min(100,w.usedPercent),minutes:w.windowDurationMins,resetAt:number(w.resetsAt)?w.resetsAt*1000:null});}
 }
 const n=raw?.rateLimitResetCredits?.availableCount;
 return {windows,resets:Number.isInteger(n)&&n>=0?n:null,fetchedAt:now,stale:false,plan:buckets.codex?.planType,accountId:typeof raw?.accountId==='string'?raw.accountId:undefined};
}
export function remainingSupply(a:AccountSupply|null):number|null {
 const w=a?.windows.filter(w=>w.id==='codex')??[];return w.length?100-Math.max(...w.map(w=>w.used)):null;
}
export function supplyStale(a:AccountSupply,now=Date.now()){return a.stale||now-a.fetchedAt>6*60_000||now<a.fetchedAt;}
