import {drawEquipment} from './supply-equipment';
import type {SupplyVisual} from '../core/supply-visual';
import {foremanPose,type Performance,type Pose,clamp} from '../core/performance';
export interface ForemanMotion {peek?:import("../core/feline-peek").FelinePeek;lift?:number;supply?:SupplyVisual;mode:Performance;age:number;gait?:number;blendFrom?:Pose;blend?:number;scrubbing?:boolean;facingScale?:number}
// Authored vector parts are articulated in local coordinates. No recovery code lives here.
export function drawForeman(ctx:CanvasRenderingContext2D,time:number,side:string,motion:ForemanMotion){
  const {mode,age,gait=0}=motion,t=time/1000;
  const p=foremanPose(mode,age,time,gait);if(motion.supply?.cue&&mode!=='walk')p.head+=motion.supply.attention*.15;
  if(motion.blendFrom){const f=clamp(motion.blend??1);for(const k of Object.keys(p) as Array<keyof Pose>)p[k]=motion.blendFrom[k]+(p[k]-motion.blendFrom[k])*f;}
  const dark='#18232b',ink='#101b23',amber='#efb15e',mint='#b8f1d3';
  const gradient=(y:number,h:number,a:string,b:string)=>{const g=ctx.createLinearGradient(-20,y,24,y+h);g.addColorStop(0,a);g.addColorStop(1,b);return g;};
  const rr=(x:number,y:number,w:number,h:number,r:number,fill:string|CanvasGradient,stroke=ink,lw=1.3)=>{ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}};
  const line=(x:number,y:number,X:number,Y:number,w:number,color:string)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(X,Y);ctx.lineWidth=w;ctx.strokeStyle=color;ctx.lineCap='round';ctx.stroke();};
  const el=(x:number,y:number,rx:number,ry:number,fill:string|CanvasGradient)=>{ctx.beginPath();ctx.ellipse(x,y,rx,Math.max(.1,ry),0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();};
  const rivet=(x:number,y:number)=>{el(x,y,1.5,1.5,'#10202b');el(x-.25,y-.4,.6,.6,'#b7bcb1');};
  const glove=(x:number,y:number,angle=0)=>{ctx.save();ctx.translate(x,y);ctx.rotate(angle);rr(-7,-7,14,15,5,gradient(-7,15,'#687a7c','#35454c'));rr(-6,-8,12,4,1.5,'#c49656');for(let i=0;i<3;i++)line(-3+i*3,1,-3+i*3,5,.6,'#25373f');rr(-9,-3,5,9,2,'#5e7175');ctx.restore();};
  // Two-bone arm keeps an elbow between the shoulder and the glove.
  const arm=(sx:number,sy:number,hx:number,hy:number,bend:number)=>{const dx=hx-sx,dy=hy-sy,d=Math.hypot(dx,dy)||1,mx=(sx+hx)/2-dy/d*bend,my=(sy+hy)/2+dx/d*bend;
    line(sx,sy,mx,my,12,ink);line(sx,sy,mx,my,9,'#bd8542');line(sx-1,sy-1,mx-1,my-1,3,'#e5b679');el(mx,my,6,6,dark);el(mx,my,3.3,3.3,'#8b9995');
    line(mx,my,hx,hy,9,ink);line(mx,my,hx,hy,6,'#899b9c');line(mx-1,my-1,hx-1,hy-1,1.4,'#c6cfbf');glove(hx,hy,Math.atan2(dy,dx)-Math.PI/2);};
  ctx.save();
  ctx.save();ctx.globalAlpha=1-(motion.lift??0);el(1,47,34,4.7,'#00000027');el(1,47,22,2.7,'#00000028');ctx.restore();
  ctx.scale(motion.facingScale??(side==='right'?-1:1),1);
  // Feet stay grounded during the stride; the body and satchel lag behind.
  const held=motion.lift??0;
  const stride=mode==='walk'?Math.sin(gait):0;
  for(const s of [-1,1]){
    const footX=s*14+stride*s*8,footY=35-Math.max(0,stride*s)*8+held*5;
    line(s*12,21,footX,footY,13,ink);line(s*12,21,footX,footY,10,'#465560');rr(footX-6,footY-6,12,8,2,'#697878');
    rr(footX-10,footY,23,11,4,gradient(footY,11,'#6b7575','#27363f'));rr(footX-11,footY+8,25,4,1.5,'#1c2830');line(footX-7,footY+2,footX+1,footY+2,1,'#afb4a0');
    for(let j=0;j<3;j++)line(footX-6+j*6,footY+10,footX-6+j*6,footY+11.5,.8,'#607170');
  }
  ctx.translate(0,p.bob);ctx.rotate(p.lean);
  // Heavy cable reel, offset silhouette, brass hub, wound cable and loose strap.
  ctx.save();ctx.translate(-23,3);ctx.rotate(-p.lean*.45+Math.sin(t*2-.5)*.025);
  rr(-15,-24,25,42,7,gradient(-24,42,'#596967','#263c43'));el(-6,-3,15,17,ink);el(-6,-3,12.5,14,'#785f3d');
  for(let r=11;r>4;r-=2){ctx.beginPath();ctx.ellipse(-6,-3,r,r*1.1,0,0,Math.PI*2);ctx.strokeStyle=r%4===3?'#b79864':'#354047';ctx.lineWidth=1.5;ctx.stroke();}
  el(-6,-3,4.5,5,'#d6aa61');rivet(-6,-3);rr(-11,-27,10,5,2,'#bd9658');if(motion.supply){ctx.save();ctx.translate(-20,-6);drawEquipment(ctx,'foreman',motion.supply);ctx.restore();}ctx.restore();
  arm(-23,-3,p.leftX,p.leftY,8);
  rr(-24,-7,48,36,11,gradient(-7,36,'#dba862','#a26a32'));
  rr(-18,-4,36,29,7,gradient(-4,29,'#ecbf78','#c88d45'),'',0);
  // Bib, webbing and worn edges replace the flat rectangular torso.
  rr(-14,-3,28,23,4,gradient(-3,23,'#46585a','#293e47'));line(-13,-5,-16,18,5,'#59676a');line(13,-5,16,18,5,'#59676a');
  line(-13,-4,-15,14,1,'#a7aca0');line(13,-4,15,14,1,'#a7aca0');rivet(-13,1);rivet(13,1);
  rr(-9,5,18,12,2,'#536469');line(-7,7,7,7,.7,'#acb5a1');line(-7,9,-7,14,.6,'#82938d');
  rr(-25,20,50,7,2,'#27363e');rr(-5,20,10,7,1.5,'#dab773');rr(-2,22,4,3,.6,'#5f5f4b');
  rr(-22,16,8,12,2,'#90653a');rivet(-18,18);line(17,11,20,15,1.3,'#ffdb92');
  // Short neck and a tilted, expressive helmeted head.
  rr(-9,-17,18,12,4,'#21363e');line(-6,-14,6,-14,1,'#8b9e94');
  ctx.save();ctx.translate(0,-17);ctx.rotate(p.head);
  rr(-28,-36,56,38,12,gradient(-36,38,'#7e908b','#3d5157'));
  rr(-25,-32,50,29,9,gradient(-32,29,'#1c393d','#10262d'),'#99a696',1.3);
  ctx.save();ctx.beginPath();ctx.roundRect(-24,-31,48,27,8);ctx.clip();
  const glass=ctx.createLinearGradient(-25,-33,25,0);glass.addColorStop(0,'#b5dbc722');glass.addColorStop(.5,'#b5dbc700');glass.addColorStop(1,'#75d4d915');ctx.fillStyle=glass;ctx.fillRect(-25,-33,50,31);
  line(-23,-28,12,-33,2,'#a2d1bd28');
  const blink=(time%4700)>4510?Math.sin((time%4700-4510)/190*Math.PI):0,eyeH=3.8*(1-Math.max(blink,p.lid*.65));
  for(const s of [-1,1]){const ex=s*10+p.gaze;el(ex,-20,5.4,eyeH,mint);el(ex-1,-21,1,Math.max(.3,eyeH*.4),'#f4ffee');}
  // Small brows and asymmetry keep the supervisor stern rather than blank.
  line(-17,-27,-5,-24,2.1,'#819e8f');line(6,-24,17,-26,2.1,'#819e8f');
  if(mode==='recovered'){ctx.beginPath();ctx.arc(1,-12,5,0.2,Math.PI-.2);ctx.strokeStyle=mint;ctx.lineWidth=1.6;ctx.stroke();}
  else line(-4,-9,mode==='exhausted'?4:5,-9+(mode==='exhausted'?-2:0),1.6,'#90b7a4');ctx.restore();
  rr(-32,-23,7,14,3,'#b78c53');rr(25,-23,7,14,3,'#b78c53');rivet(-28,-16);rivet(28,-16);
  // Helmet dome, raised center rib, brim and restrained painted wear.
  ctx.beginPath();ctx.moveTo(-27,-35);ctx.quadraticCurveTo(-27,-58,0,-57);ctx.quadraticCurveTo(26,-59,28,-35);ctx.closePath();ctx.fillStyle=gradient(-58,25,'#ffda8c','#c98738');ctx.fill();ctx.strokeStyle=ink;ctx.lineWidth=1.6;ctx.stroke();
  rr(-5,-57,10,24,3,gradient(-57,24,'#ffedb3','#d8a353'),'#b08342',.8);line(-2,-54,-2,-38,1,'#fff4c7');
  rr(-33,-37,66,7,3,gradient(-37,7,'#f5c878','#ad7033'));line(-27,-36,-11,-36,.9,'#ffdf9f');
  line(15,-47,20,-45,.8,'#fff0b9');line(18,-43,21,-42,.8,'#976c39');rr(-23,-47,10,6,1.5,'#405b57');
  el(29,-33,2.4,2.4,mode==='alert'||mode==='exhausted'?'#ff8c65':mint);ctx.restore();
  arm(23,-3,p.rightX,p.rightY,-7);
  const tools=['idle','walk','alert','retrying','whip','heavy'].includes(mode);
  if(tools){
    ctx.save();ctx.translate(p.rightX,p.rightY);ctx.rotate(-.2+p.power*.65);
    rr(-3,-20,7,25,2,gradient(-20,25,'#c99c60','#614733'));for(let j=0;j<4;j++)line(-2,-6+j*3,3,-6+j*3,.8,'#ddb877');rr(-4,-22,9,5,2,'#80928b');
    if(mode==='heavy'){rr(-6,-17,13,16,3,'#2e474a');for(let i=0;i<3;i++)rr(-4,-14+i*4,9,2,1,p.power>.2?'#ffe2a0':'#a88956','',0);}
    // Travelling wave follows the grip; a narrow impact flash lands once per strike.
    const pts:Array<[number,number]>=[];
    for(let i=0;i<=36;i++){const u=i/36,reach=mode==='heavy'?97:82;
      pts.push([2+u*(9+p.power*reach)+Math.sin(u*Math.PI*2-time/380)*u*(1-p.power)*9,-22+u*(59-p.power*72)+Math.sin(u*Math.PI*2-age/120)*Math.sin(u*Math.PI)*p.power*21]);}
    ctx.beginPath();pts.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=ink;ctx.lineWidth=4;ctx.stroke();ctx.strokeStyle=mode==='heavy'&&p.power>.3?'#ffcc73':'#b58d53';ctx.lineWidth=mode==='heavy'?2.9:2.2;ctx.stroke();
    const tip=pts.at(-1)!;el(tip[0],tip[1],2,2,amber);
    if(p.impact>0){ctx.globalAlpha=p.impact;for(let j=0;j<5;j++){const a=j/5*Math.PI*2;line(tip[0]+Math.cos(a)*5,tip[1]+Math.sin(a)*5,tip[0]+Math.cos(a)*15,tip[1]+Math.sin(a)*15,1.5,'#ffe3a3');}ctx.globalAlpha=1;}
    ctx.restore();
  }
  if(mode==='tap'){
    const x=p.rightX+10;for(let i=0;i<2;i++){ctx.globalAlpha=p.impact*.7;ctx.beginPath();ctx.arc(x,-10,8+i*6,-.8,.8);ctx.lineWidth=1.2;ctx.strokeStyle=amber;ctx.stroke();}ctx.globalAlpha=1;
  }
  if(['working','waiting','exhausted'].includes(mode)){
    ctx.save();ctx.translate(mode==='working'?-9:3,mode==='working'?4:11);ctx.rotate(mode==='working'?-.15:.05);
    rr(-14,-10,28,30,3,gradient(-10,30,'#d7c7a2','#9a8b70'));rr(-6,-12,12,5,1.5,'#617371');
    if(mode==='exhausted'){line(0,-3,0,7,2.5,'#914e36');el(0,12,1.4,1.4,'#914e36');}
    else{for(let i=0;i<3;i++){rr(-9,-2+i*6,3,3,.3,'#50645f','',0);line(-3,i*6,9,i*6,.8,'#7e7e66');}}
    ctx.restore();
  }
  if(mode==='compact'){
    rr(-22,0,41,22,4,gradient(0,22,'#a9bab0','#526f70'));el(20,11,5,11,'#394f56');el(20,11,2,7,amber);
    ctx.save();ctx.beginPath();ctx.rect(-21,2,35,18);ctx.clip();for(let i=0;i<9;i++){const y=2+((i*5+t*13)%24);line(-15,y,10,y,1,'#d6dac0');}ctx.restore();line(20,11,p.rightX,p.rightY,3,'#cfaa65');
  }
  if(mode==='recovered'&&age<1650){
    ctx.save();ctx.translate(p.rightX,p.rightY);line(1,-4,1,-13,5,'#718a84');line(-2,2,7,2,7,'#718a84');ctx.restore();
  }
  ctx.restore();
}
