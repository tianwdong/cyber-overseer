import {supplyStale,type AccountSupply,type SupplyWindow} from './supply';
export function limitingWindow(a:AccountSupply|null):SupplyWindow|null {
 return (a?.windows.filter(w=>w.id==='codex')??[]).sort((a,b)=>b.used-a.used||b.minutes-a.minutes)[0]??null;
}
export const supplyLevel=(r:number)=>r<5?'critical':r<20?'low':'normal';
export interface SupplyVisual {value:number|null;actual:number|null;window:SupplyWindow|null;stale:boolean;cue:'low'|'critical'|'refill'|null;attention:number;sway:number}
export class SupplyTransition {
 private from:number|null=null;private target:number|null=null;private since=0;private cueAt=-10000;private cue:SupplyVisual['cue']=null;private window:SupplyWindow|null=null;private account:AccountSupply|null=null;
 update(a:AccountSupply|null,now:number,wall=Date.now()){
  const w=limitingWindow(a),r=w?100-w.used:null;const previous=this.account;
  if(r!==null&&r!==this.target&&!supplyStale(a!,wall)){
   const old=this.target;this.from=this.value(now)??r;this.target=r;this.since=now;
   // Initial load and stale reconnect are not depletion/refill events.
   if(old!==null&&previous&&previous.accountId===a?.accountId&&!supplyStale(previous,wall)){
    const level=supplyLevel(r);
    if(r<old&&level!==supplyLevel(old)&&level!=='normal'){this.cue=level;this.cueAt=now;}
    else if(r>old&&w&&this.window&&w.minutes===this.window.minutes){this.cue='refill';this.cueAt=now;}
   }
  }
  this.account=a;if(w)this.window=w;
 }
 private value(now:number){if(this.target===null||this.from===null)return null;const t=Math.min(1,Math.max(0,(now-this.since)/1000)),u=t*t*(3-2*t);return this.from+(this.target-this.from)*u;}
 frame(now:number,wall=Date.now(),sway=0):SupplyVisual {
  const age=now-this.cueAt,attention=age>=0&&age<1800?Math.sin(age/1800*Math.PI)**2:0;
  return {value:this.value(now),actual:this.target,window:this.window,stale:!this.account||supplyStale(this.account,wall)||!limitingWindow(this.account),cue:attention?this.cue:null,attention,sway};
 }
}
export function windowLabel(w:SupplyWindow|null,en=false){return !w?(en?'Quota unavailable':'额度未知'):w.minutes===10080?(en?'Weekly':'周额度'):w.minutes===300?(en?'5-hour':'五小时额度'):`${w.minutes/60}h`;}
