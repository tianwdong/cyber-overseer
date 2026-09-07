import {drawRealistic} from './realistic';
import {drawForeman,type ForemanMotion} from './foreman';
import {durationOf,restingPerformance,recoveryPerformance} from '../core/performance';
import type {LiveState} from '../core/live-state';
import type {CharacterId,CharacterAction} from '../core/characters';
export function drawCharacter(ctx:CanvasRenderingContext2D,id:CharacterId,time:number,moving=false,action:CharacterAction='watch',age=10000,side='left',live?:LiveState,motion?:ForemanMotion){
  const event=recoveryPerformance(action,2);
  const resolved=motion??{mode:moving?'walk':age>=0&&age<durationOf(event)&&action!=='watch'?event:restingPerformance(live),age,gait:time/100};
  if(id==='foreman'){drawForeman(ctx,time,side,resolved);return;}
  if(drawRealistic(ctx,id,time,side,resolved))return;
  ctx.save();ctx.strokeStyle='#80969b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,8,time/500,time/500+4);ctx.stroke();ctx.restore();
}
