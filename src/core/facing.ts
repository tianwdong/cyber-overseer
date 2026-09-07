export type Heading='left'|'right';
export interface Facing{angle:number;heading:Heading;scale:number;turning:boolean}
// While travelling, direction comes from displacement. Dock side applies only on arrival.
export function desiredHeading(dx:number,distance:number,dockSide:string,previous:Heading):Heading{
  if(distance>1)return Math.abs(dx)>.5?(dx>0?'right':'left'):previous;
  return dockSide==='right'?'left':'right';
}
export function turnFacing(angle:number,heading:Heading,dt:number):Facing{
  const target=heading==='right'?0:Math.PI,step=Math.max(0,Math.min(dt,.05))*Math.PI/.18;
  const next=angle+Math.sign(target-angle)*Math.min(Math.abs(target-angle),step);
  return {angle:next,heading,scale:Math.cos(next),turning:Math.abs(target-next)>.0001};
}
