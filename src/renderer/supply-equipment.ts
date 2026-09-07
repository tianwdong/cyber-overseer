import type {SupplyVisual} from '../core/supply-visual';
import type {CharacterId} from '../core/characters';
function color(v:SupplyVisual){return v.stale||v.actual===null?'#83969f':v.actual<5?'#efad66':v.actual<20?'#d6b47b':'#a2ccb8';}
function fault(ctx:CanvasRenderingContext2D,v:SupplyVisual,x:number,y:number){if(!v.stale)return;ctx.strokeStyle='#bbcad0';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x-3,y-3);ctx.lineTo(x+3,y+3);ctx.moveTo(x-3,y+3);ctx.lineTo(x+3,y-3);ctx.stroke();}
export function drawEquipment(ctx:CanvasRenderingContext2D,c:CharacterId,v:SupplyVisual){
 const r=(v.value??0)/100;ctx.save();ctx.fillStyle=color(v);ctx.strokeStyle='#82939b';
 if(c==='mechanic'){
  ctx.fillStyle='#24343c';ctx.beginPath();ctx.roundRect(-5,-3,10,6,2);ctx.fill();ctx.fillStyle=color(v);ctx.shadowColor=color(v);ctx.shadowBlur=2+v.attention*5;ctx.beginPath();ctx.arc(0,0,1.8,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;fault(ctx,v,7,-1);
 }else if(c==='foreman'){
  ctx.fillStyle='#1a2932';ctx.beginPath();ctx.roundRect(-6,-20,12,39,3);ctx.fill();ctx.stroke();ctx.save();ctx.beginPath();ctx.roundRect(-3,-16,6,31,1);ctx.clip();ctx.fillStyle='#38494e';ctx.fillRect(-3,-16,6,31);ctx.fillStyle=color(v);if(v.value!==null)ctx.fillRect(-3,15-31*r,6,31*r);ctx.restore();ctx.strokeStyle='#a4b2b880';for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(3,15-i*6.2);ctx.lineTo(5,15-i*6.2);ctx.stroke();}fault(ctx,v,0,-25);
 }else if(c==='medic'){
  ctx.fillStyle='#1e323c';ctx.beginPath();ctx.roundRect(-7,-19,14,37,4);ctx.fill();ctx.stroke();ctx.save();ctx.beginPath();ctx.roundRect(-4,-16,8,31,2);ctx.clip();ctx.fillStyle='#3b575e';ctx.fillRect(-4,-16,8,31);const y=15-31*r,tilt=v.sway*1.5;const g=ctx.createLinearGradient(0,-16,0,15);g.addColorStop(0,'#a6dfce');g.addColorStop(1,'#477d7a');ctx.fillStyle=g;if(v.value!==null){ctx.beginPath();ctx.moveTo(-4,y-tilt);ctx.quadraticCurveTo(0,y+tilt,4,y+tilt);ctx.lineTo(4,16);ctx.lineTo(-4,16);ctx.closePath();ctx.fill();}ctx.restore();ctx.strokeStyle='#c4e0db70';ctx.beginPath();ctx.moveTo(-3,-13);ctx.lineTo(-3,10);ctx.stroke();fault(ctx,v,0,-24);
 }else{
  ctx.lineWidth=2.6;ctx.strokeStyle='#172d3c';ctx.beginPath();ctx.ellipse(0,0,27,12,0,0,Math.PI*2);ctx.stroke();if(v.value!==null&&r>0){ctx.strokeStyle=color(v);ctx.beginPath();ctx.ellipse(0,0,27,12,0,-Math.PI/2,-Math.PI/2+Math.PI*2*r);ctx.stroke();}fault(ctx,v,0,-17);
 }
 if(v.cue==='refill'){ctx.globalAlpha=v.attention*.7;ctx.strokeStyle=color(v);ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,c==='ranger'?31:10,c==='mechanic'?6:23,0,0,Math.PI*2);ctx.stroke();}
 ctx.restore();
}
export function drawFoodBowl(ctx:CanvasRenderingContext2D,v:SupplyVisual){
 const r=(v.value??0)/100;ctx.save();ctx.fillStyle='#00000038';ctx.beginPath();ctx.ellipse(0,11,32,6,0,0,Math.PI*2);ctx.fill();
 const metal=ctx.createLinearGradient(-30,0,30,10);metal.addColorStop(0,'#293943');metal.addColorStop(.3,'#99a8ac');metal.addColorStop(.65,'#56666e');metal.addColorStop(1,'#25333c');
 ctx.fillStyle=metal;ctx.beginPath();ctx.moveTo(-30,0);ctx.lineTo(-24,13);ctx.quadraticCurveTo(0,20,24,13);ctx.lineTo(30,0);ctx.closePath();ctx.fill();
 ctx.fillStyle='#25313a';ctx.beginPath();ctx.ellipse(0,0,29,8,0,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#a7b1ae';ctx.lineWidth=1.2;ctx.stroke();
 ctx.save();ctx.beginPath();ctx.ellipse(0,-4*r,27,7+9*r,0,0,Math.PI*2);ctx.clip();
 // Stable grain positions build a mound; its height and footprint reveal the basin continuously.
 if(v.value!==null&&r>0){const h=3+17*r,w=9+18*Math.sqrt(r),g=ctx.createLinearGradient(0,-h,0,5);g.addColorStop(0,'#c8a274');g.addColorStop(1,'#74563b');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,3-h*.35,w,h*.65,0,0,Math.PI*2);ctx.fill();
  for(let i=0;i<105;i++){const px=Math.sin(i*19.31)*w,py=3-h*(.5+.5*Math.sin(i*7.73));if(px*px/(w*w)+(py-(3-h*.35))**2/(h*.65)**2>1)continue;ctx.fillStyle=i%3?'#b18a5e':'#dfb884';ctx.beginPath();ctx.ellipse(px,py,1.8,1.1,i*.8,0,Math.PI*2);ctx.fill();}
 }
 ctx.restore();ctx.strokeStyle='#bcc2b780';ctx.beginPath();ctx.ellipse(0,1,29,7,0,0,Math.PI);ctx.stroke();fault(ctx,v,0,11);
 if(v.cue==='refill'){ctx.fillStyle='#c7a170';ctx.globalAlpha=v.attention;for(let i=0;i<4;i++){ctx.beginPath();ctx.ellipse(-10+i*6,-18+v.attention*10,1.6,1,0,0,Math.PI*2);ctx.fill();}}
 if(v.actual===null){ctx.fillStyle='#b3c2c9';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('?',0,2);}
 ctx.restore();
}
