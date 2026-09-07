import {drawEquipment} from './supply-equipment';
import {drawFeline,felineReady} from './feline';
import type {CharacterId} from '../core/characters';
import {characterPose} from '../core/companion-performance';
import {clamp} from '../core/performance';
import type {ForemanMotion} from './foreman';
type Companion=Exclude<CharacterId,'foreman'>;
type Device=Exclude<Companion,'mechanic'>;
interface DevicePose{arm:number;case:number;scan:number;power:number;land:number;pitch:number;bob:number}
const deviceHistory=new WeakMap<CanvasRenderingContext2D,{id:Device;time:number;pose:DevicePose}>();
interface Rect{x:number;y:number;w:number;h:number}
interface Atlas{image:HTMLImageElement;parts:Rect[];transparent:boolean}
const atlases=new Map<Device,Atlas>();
// Source regions follow the artwork, which does not have evenly sized cells.
const sources:Record<Device,{file:string;regions:number[][]}>={
  medic:{file:'medical-unit',regions:[[0,0,.46,.49],[.46,0,.54,.49],[0,.49,.45,.51],[.47,.49,.53,.51]]},
  ranger:{file:'patrol-drone',regions:[[0,0,.54,.5],[.55,0,.45,.5],[0,.5,.53,.5],[.54,.5,.46,.5]]},
};
for(const id of ['medic','ranger'] as const){
  const image=new Image();image.src=`assets/characters/${sources[id].file}.png`;
  image.onload=()=>{
    const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d')!;x.drawImage(image,0,0);
    const data=x.getImageData(0,0,c.width,c.height).data,parts:Rect[]=[];
    for(const [left,top,width,height] of sources[id].regions){
      const x0=Math.floor(left*c.width),x1=Math.min(c.width,Math.floor((left+width)*c.width)),y0=Math.floor(top*c.height),y1=Math.min(c.height,Math.floor((top+height)*c.height));
      let minX=x1,maxX=x0,minY=y1,maxY=y0;
      for(let y=y0;y<y1;y++)for(let px=x0;px<x1;px++)if(data[(y*c.width+px)*4+3]>40){minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
      parts.push({x:minX,y:minY,w:Math.max(1,maxX-minX+1),h:Math.max(1,maxY-minY+1)});
    }
    const transparent=data[3]===0&&parts.every(p=>p.w>1&&p.h>1);if(!transparent)console.error(`Invalid character atlas: ${id}`);
    atlases.set(id,{image,parts,transparent});
  };
  image.onerror=()=>console.error(`Unable to load character atlas: ${id}`);
}
export const realisticReady=(id:CharacterId)=>id==='foreman'||(id==='mechanic'?felineReady():!!atlases.get(id)?.transparent);
export function drawRealistic(ctx:CanvasRenderingContext2D,id:Companion,time:number,side:string,m:ForemanMotion):boolean{
  if(id==='mechanic')return drawFeline(ctx,time,side,m);
  const atlas=atlases.get(id);if(!atlas?.transparent)return false;
  const p=characterPose(id,m.mode,m.age,time,m.gait),mode=m.mode,t=time/1000;
  if(m.blendFrom){const f=clamp(m.blend??1);for(const k of Object.keys(p) as Array<keyof typeof p>)p[k]=m.blendFrom[k]+(p[k]-m.blendFrom[k])*f;}
  const part=(index:number,x:number,y:number,w:number,h:number)=>{const r=atlas.parts[index];ctx.drawImage(atlas.image,r.x,r.y,r.w,r.h,x,y,w,h);};
  const line=(x:number,y:number,X:number,Y:number,w:number,color:string)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(X,Y);ctx.lineWidth=w;ctx.strokeStyle=color;ctx.lineCap='round';ctx.stroke();};
  const glow='#77daea';
  const scanning=['tap','working','observe','thinking'].includes(mode),active=['whip','heavy'].includes(mode);
  const target:DevicePose={arm:scanning?-.5+Math.sin(t*1.8)*.06:active?-.35-p.power*.8:mode==='compact'?.25:.08,case:['compact','waiting','exhausted'].includes(mode)?1:0,scan:scanning||active?1:0,power:active?p.power:0,land:mode==='exhausted'?1:0,pitch:p.lean,bob:p.bob};
  const previous=deviceHistory.get(ctx),d={...target};
  if(previous?.id===id&&!m.scrubbing&&time>=previous.time&&time-previous.time<500){const blend=1-Math.exp(-(time-previous.time)/170);for(const key of Object.keys(d) as Array<keyof DevicePose>)d[key]=previous.pose[key]+(target[key]-previous.pose[key])*blend;}
  deviceHistory.set(ctx,{id,time,pose:d});
  const lamp=(x:number,y:number,r=1.1)=>{ctx.save();ctx.shadowColor=glow;ctx.shadowBlur=4;ctx.fillStyle=glow;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();};
  ctx.save();ctx.globalAlpha=1-(m.lift??0);ctx.fillStyle='#00000038';ctx.beginPath();ctx.ellipse(0,47,30,3,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;ctx.scale(m.facingScale??(side==='right'?-1:1),1);
  if(id==='medic'){
    const roll=mode==='walk'?Math.sin(m.gait??0)*.4:0;
    part(1,-30,24,61,23);
    ctx.save();ctx.translate(0,roll+d.bob*.15);ctx.rotate(d.pitch*.18);
    part(0,-24,-44,48,75);lamp(7,-32,.7);if(m.supply){ctx.save();ctx.translate(-18,-7);drawEquipment(ctx,'medic',m.supply);ctx.restore();}
    ctx.save();ctx.translate(24,-18);ctx.rotate(d.arm);part(2,-6,-3,20,51);ctx.restore();

    if(d.scan>.01){ctx.save();ctx.globalAlpha=d.scan*(.45+d.power*.4);line(-13,-14,-8,-14,.8,glow);line(-8,-14,-5,-20,.8,glow);line(-5,-20,-1,-8,.8,glow);line(-1,-8,3,-14,.8,glow);line(3,-14,11,-14,.8,glow);ctx.restore();}
    if(d.case>.01){ctx.save();ctx.globalAlpha=d.case;part(3,-14,12-d.case*5,32,22);ctx.restore();}
    if(d.power>.01){ctx.save();ctx.globalAlpha=d.power*.55;ctx.strokeStyle=glow;ctx.lineWidth=1;ctx.beginPath();ctx.arc(43,2,3+d.power*7,0,Math.PI*2);ctx.stroke();ctx.restore();}
    ctx.restore();
  }else{
    const hover=d.land*22+(1-d.land)*(Math.sin(t*2)*1.4-d.power*7);
    ctx.save();ctx.translate(0,hover);ctx.rotate(d.pitch*.7);
    // Fan pods bank around a low fuselage, with an underslung inspection scanner.
    ctx.save();ctx.translate(-29,3);ctx.rotate(-d.pitch*.65);part(1,-16,-15,32,32);ctx.restore();
    ctx.save();ctx.translate(13,14-d.land*4);ctx.rotate(d.scan*Math.sin(t*1.5)*.15+d.power*.2);part(3,-9,-1,18,26-d.land*14);ctx.restore();
    part(0,-31,-25,62,49);
    ctx.save();ctx.translate(31,8);ctx.rotate(-d.pitch*.65);part(2,-15,-15,31,32);ctx.restore();
    if(d.land<.99)for(const x of [-29,31]){ctx.save();ctx.globalAlpha=(1-d.land)*(.22+d.power*.25);line(x,22,x,28+d.power*9,2,glow);ctx.restore();}
    if(d.scan>.01){ctx.save();ctx.globalAlpha=(1-d.land)*d.scan*(.12+d.power*.18);ctx.fillStyle=glow;ctx.beginPath();ctx.moveTo(17,33);ctx.lineTo(34+d.power*14,47);ctx.lineTo(5,47);ctx.closePath();ctx.fill();ctx.restore();}
    lamp(17,5,.8);if(m.supply)drawEquipment(ctx,'ranger',m.supply);ctx.restore();
  }
  ctx.restore();return true;
}
