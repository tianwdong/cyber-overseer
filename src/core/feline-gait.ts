export const felineStride=40;
export const stanceRatio=.66;
export interface PawStep{x:number;y:number;grounded:boolean}
// A planted paw travels backwards relative to the body at exactly body speed.
// Four-beat lateral sequence: near hind, near fore, far hind, far fore.
export function pawStep(phase:number,leg:number):PawStep{
  const offsets=[0,.5,.25,.75],cycle=((phase/(Math.PI*2)+offsets[leg])%1+1)%1;
  const reach=felineStride*stanceRatio/2;
  if(cycle<stanceRatio)return {x:reach-cycle*felineStride,y:0,grounded:true};
  const t=(cycle-stanceRatio)/(1-stanceRatio),a=t*t*t,b=t*t,tangent=-felineStride*(1-stanceRatio);
  const x=(2*a-3*b+1)*-reach+(a-2*b+t)*tangent+(-2*a+3*b)*reach+(a-b)*tangent;
  return {x,y:-(Math.sin(Math.PI*t)**2)*8,grounded:false};
}
// On stopping, place each displaced paw back with a short arc rather than sliding it.
export function settlePaw(phase:number,leg:number,age:number):PawStep{
  const start=pawStep(phase,leg),delays=[0,140,70,210];
  const t=Math.max(0,Math.min(1,(age-delays[leg])/280)),ease=t*t*(3-2*t);
  if(t===1)return {x:0,y:0,grounded:true};
  return {x:start.x*(1-ease),y:start.y*(1-ease)-(Math.sin(Math.PI*t)**2)*5*Math.min(1,Math.abs(start.x)/6),grounded:t===1||(t===0&&start.grounded)};
}
