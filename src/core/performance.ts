import type {LiveState} from './live-state';
import type {RetryProgress} from './settings';
import type {CharacterAction} from './characters';
export type Performance='idle'|'walk'|'thinking'|'working'|'retrying'|'alert'|'tap'|'whip'|'heavy'|'compact'|'observe'|'recovered'|'waiting'|'exhausted';
export const performances:ReadonlyArray<{id:Performance;label:string;duration:number}>=[
  {id:'idle',label:'巡场待命',duration:3200},{id:'walk',label:'赶到现场',duration:2600},
  {id:'thinking',label:'托腮思考',duration:3000},{id:'working',label:'核对工单',duration:2800},
  {id:'retrying',label:'等它重连',duration:2600},{id:'alert',label:'发现断连',duration:1800},
  {id:'tap',label:'首次 · 敲两下',duration:2200},{id:'whip',label:'二次 · 正式挥鞭',duration:2600},
  {id:'heavy',label:'三次 · 加力处理',duration:3000},{id:'compact',label:'收卷上下文',duration:3200},
  {id:'observe',label:'观察复工',duration:2600},{id:'recovered',label:'确认后收工',duration:2400},
  {id:'waiting',label:'递交工单',duration:3000},{id:'exhausted',label:'需要你接手',duration:3000},
];
export const durationOf=(id:Performance)=>performances.find(p=>p.id===id)!.duration;
export function recoveryPerformance(action:CharacterAction,attempt=1):Performance{
  return action==='compact'?'compact':action==='recovered'?'recovered':attempt<=1?'tap':attempt===2?'whip':'heavy';
}
export function restingPerformance(live?:LiveState,progress?:RetryProgress,observing=false):Performance{
  if(live?.connection!=='live')return observing?'observe':'idle';
  if(live.work==='waiting')return 'waiting';
  if(live.work==='retrying')return 'retrying';
  if(live.work==='failed')return observing?'observe':progress?.exhausted?'exhausted':'alert';
  if(live.work==='running')return live.activity==='compacting'?'compact':live.activity==='thinking'?'thinking':'working';
  if(observing)return 'observe';
  return 'idle';
}
export const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{v=clamp(v);return v*v*(3-2*v);};
// A short, soft work gesture between long calm intervals; the work state stays active.
export function ambientGesture(time:number,offset=0):number{const phase=((time+offset)%22000+22000)%22000;return keys(phase,[[0,0],[15000,0],[16500,1],[18200,1],[20500,0],[22000,0]]);}
// Nonuniform key times keep anticipation slow, the strike short, and settling long.
export function keys(t:number,points:ReadonlyArray<readonly [number,number]>):number{
  for(let i=1;i<points.length;i++)if(t<=points[i][0]){const [a,x]=points[i-1],[b,y]=points[i];return x+(y-x)*ease((t-a)/(b-a));}
  return points[points.length-1][1];
}
export interface Pose {lean:number;bob:number;head:number;leftX:number;leftY:number;rightX:number;rightY:number;gaze:number;lid:number;power:number;impact:number}
export function foremanPose(mode:Performance,age:number,time:number,gait=0):Pose{
  const t=time/1000,u=clamp(age/durationOf(mode));
  const p:Pose={lean:0,bob:Math.sin(t*2)*.65,head:Math.sin(t*.8)*.025,leftX:-28,leftY:17,rightX:33,rightY:16,gaze:0,lid:0,power:0,impact:0};
  if(mode==='walk'){p.lean=.09;p.bob=-Math.abs(Math.sin(gait))*2;p.leftX=-30-Math.sin(gait)*5;p.rightX=32+Math.sin(gait)*5;p.head=-.04;}
  if(mode==='thinking'){p.head=-.11;p.rightX=10;p.rightY=-12;p.gaze=-2;p.leftX=-24;p.leftY=10;}
  if(mode==='working'){const gesture=ambientGesture(time);p.head=.07+gesture*.04;p.leftX=-12;p.leftY=4;p.rightX=14+Math.sin(t*2)*2*gesture;p.rightY=2+Math.sin(t*2)*3*gesture;p.gaze=3;}
  if(mode==='retrying'){const lift=keys(u,[[0,0],[.22,1],[.5,1],[.75,0],[1,0]]);p.rightY=16-lift*34;p.head=-.09;p.gaze=3;p.lid=.3;}
  if(mode==='alert'){p.head=keys(u,[[0,.12],[.1,-.13],[.6,-.13],[1,0]]);p.bob-=keys(u,[[0,0],[.1,2],[.3,0],[1,0]]);p.gaze=4;}
  if(mode==='tap'){
    const hit=keys(u,[[0,0],[.2,.65],[.28,.65],[.32,1],[.4,.65],[.48,1],[.58,.65],[.82,0],[1,0]]);
    p.rightX=33+hit*21;p.rightY=16-hit*25;p.lean=hit*.055;p.gaze=3;
    p.impact=Math.max(0,1-Math.abs(u-.32)/.035,1-Math.abs(u-.48)/.035);
  }
  if(mode==='whip'||mode==='heavy'){
    const heavy=mode==='heavy',wind=keys(u,[[0,0],[.25,1],[.34,1],[.43,-.45],[.51,-.45],[.7,.16],[1,0]]);
    p.lean=-wind*(heavy?.25:.15);p.bob+=Math.max(0,wind)*(heavy?4:2);p.head=wind*.1;
    p.rightX=33-wind*30;p.rightY=16-keys(u,[[0,0],[.3,1],[.42,.6],[.55,.5],[.85,0],[1,0]])*59;
    p.leftX=-28-wind*7;p.leftY=17+wind*9;p.gaze=4;p.lid=.25;
    p.power=keys(u,[[0,0],[.28,.1],[.37,.35],[.43,1],[.49,.92],[.7,.2],[1,0]]);
    p.impact=Math.max(0,1-Math.abs(u-.45)/.022);
  }
  if(mode==='compact'){p.leftX=-16;p.leftY=4;p.rightX=26+Math.cos(t*5)*7;p.rightY=9+Math.sin(t*5)*7;p.head=.09;p.gaze=2;}
  if(mode==='observe'){p.lean=.14;p.head=.1;p.rightX=28;p.rightY=-20;p.gaze=4;p.lid=.2;}
  if(mode==='recovered'){const nod=keys(u,[[0,0],[.2,.16],[.38,-.05],[.55,.08],[.7,0],[1,0]]);p.head=nod;p.rightX=29;p.rightY=16-keys(u,[[0,0],[.25,1],[.58,1],[.85,0],[1,0]])*22;p.lid=.3;}
  if(mode==='waiting'||mode==='exhausted'){p.leftX=-12;p.leftY=7;p.rightX=22;p.rightY=8;p.head=mode==='exhausted'?.16:-.05;p.lid=mode==='exhausted'?.55:.1;p.bob+=mode==='exhausted'?2:0;}
  return p;
}
