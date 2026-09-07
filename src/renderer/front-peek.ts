import type {CharacterId} from '../core/characters';
import type {DockEdge} from '../core/pet-placement';
import {edgePeek} from '../core/edge-peek';
import {drawPeekSkin} from './peek-skin';
import {drawCharacter} from './characters';
interface Sprite {image:HTMLImageElement;x:number;y:number;w:number;h:number}
const sprites=new Map<CharacterId,Sprite>();
const approaches=new WeakMap<CanvasRenderingContext2D,{near:boolean;at:number}>();
function load(file:string,ids:CharacterId[]){
 const image=new Image();image.src=`assets/characters/${file}`;
 image.onload=()=>{
  const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
  const context=canvas.getContext('2d')!;context.drawImage(image,0,0);const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
  if(pixels[3]!==0){console.error('Edge sprites require alpha');return;}
  for(const [column,id] of ids.entries()){
   const start=Math.floor(column*canvas.width/ids.length),end=Math.floor((column+1)*canvas.width/ids.length);let left=end,right=start,top=canvas.height,bottom=0;
   for(let y=0;y<canvas.height;y++)for(let x=start;x<end;x++)if(pixels[(y*canvas.width+x)*4+3]>64){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
   if(right>left&&bottom>top)sprites.set(id,{image,x:left,y:top,w:right-left+1,h:bottom-top+1});
  }
 };
}
load('cat-edge-bust.png',['mechanic']);load('device-edge-busts.png',['medic','ranger']);
// Each sprite is a connected body leaning out from behind the edge, with a frontal gaze.
export function drawFrontPeek(ctx:CanvasRenderingContext2D,id:CharacterId,time:number,age:number,edge:DockEdge,amount:number,near:number):boolean {
 const sprite=sprites.get(id);if(id!=='foreman'&&!sprite)return false;
 const sign=edge==='left'?1:-1,pose=edgePeek(id==='mechanic'?age*.78:age,near);
 const previous=approaches.get(ctx),close=near>.35;
 const approached=close&&!previous?.near?time:previous?.at??-10000;
 approaches.set(ctx,{near:close,at:approached});
 ctx.save();ctx.globalAlpha=amount;ctx.scale(sign,1);ctx.translate(-36*(1-amount),0);
 if(id==='foreman'){
  ctx.translate(-5+pose.bodyX,35+Math.sin(time/1000)*.45);ctx.rotate(.3+pose.tilt*.3);
  drawCharacter(ctx,id,time,false,'watch',10000,'left',undefined,{mode:'idle',age:time%4000,facingScale:1});
 }else if(id==='mechanic'){
  const sniffAge=time-approached,sniff=close&&sniffAge<700?Math.sin(sniffAge/700*Math.PI*4)*Math.sin(sniffAge/700*Math.PI):0;
  const catPose={...pose,headX:pose.headX*.78+sniff*.65,headY:pose.headY*.65-sniff*.25,tilt:pose.tilt*.65,bodyX:pose.bodyX*.5};
  const height=118,width=height*sprite!.w/sprite!.h;
  drawPeekSkin(ctx,sprite!.image,sprite!,-27,-50,width,height,catPose);
 }else if(id==='medic'){
  const height=103,width=height*sprite!.w/sprite!.h,x=-14,y=-49;
  // Rigid casing pivots around the braced lower hand; never bend the display like skin.
  const ax=x+width*.19,ay=y+height*.78;
  ctx.translate(ax,ay);ctx.rotate(pose.headX*.0025);
  ctx.drawImage(sprite!.image,sprite!.x,sprite!.y,sprite!.w,sprite!.h,x-ax,y-ay,width,height);
 }else{
  // The lower mount folds behind the edge around its real joint; the fuselage remains rigid.
  const r=sprite!,height=105,width=height*r.w/r.h,split=.66;
  const hover=Math.sin(time/1150)*.65+Math.sin(time/2200)*.3;
  ctx.translate(-15+pose.headX*.35,-47+hover);ctx.rotate(Math.sin(time/1800)*.014+near*.025);
  ctx.save();ctx.translate(width*.47,height*split);ctx.rotate(.85);
  ctx.drawImage(r.image,r.x,r.y+r.h*split,r.w,r.h*(1-split),-width*.47,0,width,height*(1-split));ctx.restore();
  ctx.drawImage(r.image,r.x,r.y,r.w,r.h*split,0,0,width,height*split+1);

 }
 ctx.restore();return true;
}
