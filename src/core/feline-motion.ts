import {clamp,durationOf,keys,type Performance} from './performance';
export interface FelineMotion{peek?:import("./feline-peek").FelinePeek;lift?:number;stride:number;paw:number;crouch:number;head:number;tail:number;breathe:number;phase:number;settleAge?:number}
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
export function felineMotion(mode:Performance,age:number,time:number,gait:number):FelineMotion{
  const t=time/1000,u=clamp(age/durationOf(mode));
  const reach=keys(u,[[0,0],[.22,.15],[.43,1],[.61,.85],[.86,.12],[1,0]]);
  return {stride:mode==='walk'?1:0,paw:mode==='tap'?reach*.65:mode==='whip'||mode==='heavy'?reach:mode==='working'?.12+.08*Math.sin(t*2.1):0,
    crouch:mode==='heavy'?reach*.7:mode==='exhausted'?1:mode==='compact'?.2:0,
    head:mode==='thinking'?-.35:mode==='observe'?.25:mode==='waiting'?-.22:mode==='recovered'?Math.sin(u*Math.PI*2)*.2*Math.sin(u*Math.PI):mode==='tap'||mode==='heavy'?reach*.3:0,
    tail:Math.sin(t*1.65)*.65+Math.sin(t*.63)*.2,breathe:Math.sin(t*1.9),phase:gait};
}
// Continuous torso deformation; limbs have separate joint-controlled topology.
export function deformFeline(u:number,v:number,m:FelineMotion):[number,number]{
  const foot=smooth(.57,.97,v),trunk=1-foot,tail=1-smooth(.08,.34,u),head=smooth(.7,.9,u)*(1-smooth(.18,.5,v));
  let x=(u-.5)*136,y=v*92-45;
  y+=m.breathe*.48*trunk*(1-tail)+m.crouch*10*trunk;
  y+=m.stride*trunk*(1-tail)*(Math.cos(m.phase*2)*.55+Math.sin(m.phase)*(u-.6)*2.2);
  x+=m.stride*trunk*(1-tail)*Math.sin(m.phase)*.6;
  y+=tail*tail*(m.tail*5+m.crouch*3);x+=tail*tail*m.tail*1.4;
  y+=head*m.head*7;x+=head*m.head*2;
  // Shoulder follows the reaching paw, and the back shares the load.
  const shoulder=Math.exp(-Math.pow((u-.77)/.14,2))*trunk;
  x+=shoulder*m.paw*1.5;y+=shoulder*m.paw*.9;
  if(m.peek){
    const neck=smooth(.69,.84,u)*(1-smooth(.29,.55,v)),angle=m.peek.headTilt*neck,px=x-40,py=y+17;
    x=40+px*Math.cos(angle)-py*Math.sin(angle)+m.peek.headReach*neck;
    y=-17+px*Math.sin(angle)+py*Math.cos(angle);
    const ear=smooth(.72,.84,u)*(1-smooth(.09,.2,v));
    x+=m.peek.earTwitch*ear*1.2;y+=m.peek.earTwitch*ear*.8;
  }
  return [x,y];
}
