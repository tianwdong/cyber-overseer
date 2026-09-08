import {drawFrontPeek} from './front-peek';
import type {DockEdge} from '../core/pet-placement';
import {SupplyTransition,windowLabel} from '../core/supply-visual';
import {drawFoodBowl} from './supply-equipment';
import {renderSupplyCard} from './supply-card';
import type {SupplyState} from '../core/supply';
import {felineStride} from '../core/feline-gait';
import {desiredHeading,turnFacing,type Facing} from '../core/facing';
import {characterPose} from '../core/companion-performance';
import {tr} from '../core/i18n';
import type {Language,RetryProgress} from '../core/settings';
import type {LiveState} from '../core/live-state';
import {getCharacter,type CharacterId,type CharacterAction} from '../core/characters';
import {durationOf,recoveryPerformance,restingPerformance,type Performance,type Pose} from '../core/performance';
import {drawCharacter} from './characters';
const canvas=document.getElementById('pet') as HTMLCanvasElement,ctx=canvas.getContext('2d')!,hit=document.getElementById('pet-hit') as HTMLButtonElement;
let dock:DockEdge|undefined,dockAt=0,peek=0;
let x=65,y=innerHeight-100,tx=x,ty=y,side='left',key='standby',character:CharacterId='foreman',sequence=-1,action:CharacterAction='watch',previewing=false,effectAt=-10000,last=performance.now(),active=false,frame=0;
let live:LiveState|undefined,language:Language='zh',retry:RetryProgress|undefined,observing=false,performanceOverride:Performance|undefined,attempt=1,duration=1600;
let facing:Facing={angle:0,heading:'right',scale:1,turning:false};
let held=false,dragging=false,suppressClick=false,pointerId=0,holdTimer:ReturnType<typeof setTimeout>|undefined;let press={x:0,y:0,offsetX:0,offsetY:0},dragTarget={x:0,y:0},lift=0,swing=0;
let mode:Performance='idle',modeAt=0,previousPose:Pose|undefined,gait=0,speed=0;
let affectionAt=-10000,strokeDirection=0,strokeTurns=0,strokeAt=0,strokeDistance=0;
let pointer:{x:number;y:number}|null=null,overPet=false;
const card=document.getElementById('supply-card')!,content=document.getElementById('supply-content')!,pin=document.getElementById('supply-pin')!;
const resultButton=document.getElementById('pet-result') as HTMLButtonElement;
let cardPress=false,pressedResult:string|undefined;
card.addEventListener('pointerdown',()=>{cardPress=true;});
const releaseCard=()=>{if(cardPress){cardPress=false;paintCard();}};
document.addEventListener('pointerup',()=>setTimeout(()=>{releaseCard();pressedResult=undefined;},0));document.addEventListener('pointercancel',releaseCard);window.addEventListener('blur',releaseCard);
resultButton.addEventListener('pointerdown',()=>{pressedResult=supply.companion?.result?.id;});resultButton.addEventListener('pointercancel',()=>{pressedResult=undefined;});
async function openCompanion(action:'task'|'result'|'open-codex',value:string){try{await window.overseer.petAction(action,value);}catch{showCard();let error=document.getElementById('companion-error');if(!error){error=document.createElement('p');error.id='companion-error';error.className='supply-warning';content.append(error);}error.textContent=language==='en'?'Unable to open. Please try again.':'暂时无法打开，请重试。';}}
resultButton.onclick=()=>{const id=pressedResult??supply.companion?.result?.id;pressedResult=undefined;if(id)void openCompanion('result',id);};
content.addEventListener('click',e=>{const button=(e.target as HTMLElement).closest<HTMLButtonElement>('button[data-pet-action]');if(button?.dataset.value)void openCompanion(button.dataset.petAction as 'task'|'result'|'open-codex',button.dataset.value);});
function positionResult(){const c=supply.companion;resultButton.hidden=dragging||lift>.05||!c?.result;if(resultButton.hidden)return;resultButton.textContent=language==='en'?`${c!.unread} new result${c!.unread===1?'':'s'}`:`${c!.unread} 条新结果`;resultButton.setAttribute('aria-label',(language==='en'?'Review result: ':'查看结果：')+c!.result!.title);resultButton.style.left=`${Math.max(8,Math.min(innerWidth-resultButton.offsetWidth-8,dock==='left'?8:dock==='right'?innerWidth-resultButton.offsetWidth-8:x-resultButton.offsetWidth/2))}px`;resultButton.style.top=`${Math.max(8,Math.min(innerHeight-resultButton.offsetHeight-8,y+(dock?88:84)))}px`;}
const supplyTransition=new SupplyTransition();let supplySway=0;let bowl:{x:number;y:number}|null=null;
let supply:SupplyState={account:null,task:null,title:null},pinned=false,hoverTimer:ReturnType<typeof setTimeout>|undefined;
let cardSignature='';
function paintCard(){if(cardPress)return;const signature=JSON.stringify([supply,character,language,Math.floor(Date.now()/60000)],(key,value)=>key==='updatedAt'||key==='revision'?undefined:value);if(signature!==cardSignature){const scroll=card.scrollTop,focused=content.contains(document.activeElement)?(document.activeElement as HTMLElement).dataset.value:undefined;renderSupplyCard(content,supply,character,language);if(focused)Array.from(content.querySelectorAll<HTMLButtonElement>('button')).find(b=>b.dataset.value===focused)?.focus({preventScroll:true});card.scrollTop=scroll;cardSignature=signature;}pin.textContent=pinned?(language==='en'?'Unpin':'取消固定'):(language==='en'?'Pin card':'固定卡片');document.getElementById('supply-settings')!.textContent=language==='en'?'All tasks':'全部任务';}
function positionCard(){const preferred=dock==='left'?72:dock==='right'?innerWidth-410:x-310;const left=Math.max(12,Math.min(innerWidth-354,preferred)),top=Math.max(12,Math.min(innerHeight-card.offsetHeight-12,y-card.offsetHeight-115));card.style.left=`${left}px`;card.style.top=`${top}px`;}
function showCard(){paintCard();card.hidden=false;positionCard();}
pin.addEventListener('click',()=>{pinned=!pinned;paintCard();});
document.getElementById('supply-settings')!.addEventListener('click',()=>void window.overseer.petAction('settings'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'){void finishDrag(true);pinned=false;card.hidden=true;}});
function updatePointer(){
 const overBody=dock&&!dragging?!!pointer&&pointer.x>=(dock==='left'?0:innerWidth-56)&&pointer.x<=(dock==='left'?56:innerWidth)&&(pointer.y>=y-55&&pointer.y<=y+85):!!pointer&&pointer.x>=x-(character==='mechanic'?90:56)&&pointer.x<=x+(character==='mechanic'?80:56)&&pointer.y>=y-100&&pointer.y<=y+60;
 const rect=card.getBoundingClientRect(),overCard=!card.hidden&&!!pointer&&pointer.x>=rect.left-16&&pointer.x<=rect.right+16&&pointer.y>=rect.top-16&&pointer.y<=rect.bottom+16;
 const resultRect=resultButton.getBoundingClientRect(),overResult=!resultButton.hidden&&!!pointer&&pointer.x>=resultRect.left-4&&pointer.x<=resultRect.right+4&&pointer.y>=resultRect.top-4&&pointer.y<=resultRect.bottom+4;
 const over=held||dragging||overBody||overCard||overResult;
 if(!held&&!dragging&&overBody&&card.hidden&&!hoverTimer)hoverTimer=setTimeout(()=>{hoverTimer=undefined;if(overPet)showCard();},300);
 if(!over){if(hoverTimer){clearTimeout(hoverTimer);hoverTimer=undefined;}if(!pinned)card.hidden=true;}
 if(over!==overPet){overPet=over;window.overseer.petPointer(over);}
}
document.addEventListener('mousemove',e=>{
 const dx=pointer?e.clientX-pointer.x:0,now=performance.now();
 const onBody=Math.abs(e.clientX-x)<55&&e.clientY>y-75&&e.clientY<y+25;
 if(onBody&&!held&&!dragging&&Math.abs(dx)>=6){
  if(now-strokeAt>900){strokeTurns=0;strokeDistance=0;strokeDirection=0;}
  const direction=Math.sign(dx);if(strokeDirection&&direction!==strokeDirection)strokeTurns++;
  strokeDirection=direction;strokeAt=now;strokeDistance+=Math.abs(dx);
  if(strokeTurns>=3&&strokeDistance>75&&now-affectionAt>1600){affectionAt=now;strokeTurns=0;strokeDistance=0;}
 }
 pointer={x:e.clientX,y:e.clientY};updatePointer();
});
document.addEventListener('mouseleave',()=>{pointer=null;updatePointer();});
hit.addEventListener('click',()=>{if(suppressClick){suppressClick=false;return;}void window.overseer.petAction('settings');});
function startDrag(){if(!held||dragging)return;if(dock){facing={angle:dock==='right'?Math.PI:0,heading:dock==='right'?'left':'right',scale:dock==='right'?-1:1,turning:false};}dock=undefined;dragging=true;suppressClick=true;card.hidden=true;pinned=false;if(hoverTimer){clearTimeout(hoverTimer);hoverTimer=undefined;}void window.overseer.petDrag('start',x,y).catch(()=>{held=false;dragging=false;});}
hit.addEventListener('pointerdown',e=>{if(e.button!==0)return;held=true;pointerId=e.pointerId;press={x:e.clientX,y:e.clientY,offsetX:e.clientX-x,offsetY:e.clientY-y};dragTarget={x,y};hit.setPointerCapture(e.pointerId);holdTimer=setTimeout(startDrag,220);});
document.addEventListener('pointermove',e=>{if(!held)return;dragTarget={x:e.clientX-press.offsetX,y:e.clientY-press.offsetY};if(Math.hypot(e.clientX-press.x,e.clientY-press.y)>5)startDrag();});
async function finishDrag(cancel=false){if(!held&&!dragging)return;held=false;if(holdTimer)clearTimeout(holdTimer);if(dragging){try{const p=await window.overseer.petDrag(cancel?'cancel':'end',x,y);if(!cancel){x=tx=p.x;y=ty=p.y;dock=p.dock;dockAt=performance.now();}}catch{tx=x;ty=y;}finally{dragging=false;if(cancel)suppressClick=false;}}if(hit.hasPointerCapture(pointerId))hit.releasePointerCapture(pointerId);updatePointer();}
document.addEventListener('pointerup',()=>void finishDrag());document.addEventListener('pointercancel',()=>void finishDrag(true));hit.addEventListener('lostpointercapture',()=>{if(held)void finishDrag(true);});
window.addEventListener('blur',()=>void finishDrag());
hit.addEventListener('contextmenu',e=>{e.preventDefault();if(!dragging)void window.overseer.petAction('menu');});
function resize(){const dpr=devicePixelRatio;canvas.width=innerWidth*dpr;canvas.height=innerHeight*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);}
resize();addEventListener('resize',resize);
window.overseer.onMove(move=>{
  if(!dragging){if(move.dock!==dock)dockAt=performance.now();dock=move.dock;}
  supply=move.supply??supply;supplyTransition.update(supply.account,performance.now());tx=move.x;ty=move.y;side=move.side;key=move.key;if(character!==move.character){previousPose=undefined;modeAt=performance.now();}character=move.character;live=move.live;language=move.language??'zh';retry=move.retry;observing=!!move.observing;if(!card.hidden){paintCard();if(!pinned)positionCard();}
  if(move.placementInstant&&!dragging){x=tx;y=ty;}
  hit.dataset.work=live?.work??'unknown';hit.dataset.activity=live?.activity??'none';
  if(move.sequence!==sequence){sequence=move.sequence;action=move.action;previewing=!!move.preview;performanceOverride=move.performance;attempt=move.attempt??1;duration=move.duration??1600;if(action!=='watch')effectAt=performance.now();else effectAt=-10000;}
  if(!active){active=true;last=performance.now();loop(last);}
});
function loop(now:number){
  const dt=Math.min((now-last)/1000,.05);last=now;
  // Clear the transparent surface before either pose: rotated limbs and edge transitions
  // can extend beyond the previous body bounds, especially during a fast drag.
  ctx.clearRect(0,0,innerWidth,innerHeight);
  if(dock&&!dragging){
    bowl=null;
    x=tx;y=ty;const right=dock==='right',progress=Math.min(1,(now-dockAt)/320),tuck=1-Math.pow(1-progress,3);
    const cycle=(now-dockAt)%11000,curious=cycle>7300&&cycle<9200?Math.sin((cycle-7300)/1900*Math.PI):0;
    peek+=((overPet?8:curious*5)-peek)*Math.min(1,dt*4);
    ctx.save();ctx.translate(right?innerWidth:0,y);
    const front=drawFrontPeek(ctx,character,now,now-dockAt,dock,tuck,peek/8);
    ctx.restore();hit.dataset.frontPeek=String(front);
    hit.style.width='56px';hit.style.height='140px';hit.style.transform=`translate(${right?innerWidth-56:0}px,${y-50}px)`;
    hit.dataset.docked=dock;hit.dataset.caption='';hit.dataset.dragging='false';hit.dataset.lift='0';
    hit.setAttribute('aria-label',language==='en'?'Drag out from screen edge':'从屏幕边缘拖出');
    positionResult();updatePointer();frame=requestAnimationFrame(loop);return;
  }
  hit.dataset.docked='';hit.style.height='142px';
  const dx=tx-x,dy=ty-y,distance=Math.hypot(dx,dy),moving=!dragging&&distance>1,c=getCharacter(character);
  if(!dragging)facing=turnFacing(facing.angle,desiredHeading(dx,distance,side,facing.heading),dt);
  hit.dataset.facing=facing.heading;hit.dataset.facingScale=String(facing.scale);hit.dataset.turning=String(facing.turning);
  lift+=((dragging?1:0)-lift)*Math.min(1,dt*(dragging?12:9));
  if(dragging){const vx=dragTarget.x-x;swing+=(Math.max(-.2,Math.min(.2,-vx*.006))-swing)*Math.min(1,dt*8);x+=(dragTarget.x-x)*Math.min(1,dt*22);y+=(dragTarget.y-y)*Math.min(1,dt*22);speed=0;}else swing+=(0-swing)*Math.min(1,dt*8);
  hit.dataset.dragging=String(dragging);hit.dataset.lift=String(lift);hit.style.cursor=dragging?'grabbing':'grab';
  if(dragging){}else if(facing.turning){speed=0;}else if(moving){const cat=character==='mechanic';speed+=(Math.min(cat?92:340,Math.sqrt(distance*(cat?150:750)))*c.speed-speed)*Math.min(1,dt*(cat?5:7));const step=Math.min(distance,speed*dt);x+=dx/distance*step;y+=dy/distance*step;gait+=character==='mechanic'?step/felineStride*Math.PI*2:step/13;}else{speed=0;}
  supplySway+=( (moving?Math.sin(now/170)*Math.min(1,speed/100):0)-supplySway)*Math.min(1,dt*5);
  const supplyVisual=supplyTransition.frame(now,Date.now(),supplySway);
  if(character==='mechanic'){
    if(!moving&&!dragging&&lift<.01)bowl={x:Math.max(36,Math.min(innerWidth-36,x-88)),y:y+40};
    if(bowl){ctx.save();ctx.translate(bowl.x,bowl.y);drawFoodBowl(ctx,supplyVisual);ctx.restore();}
  }else bowl=null;
  hit.dataset.supplyRemaining=String(supplyVisual.value??'unknown');hit.dataset.supplyStale=String(supplyVisual.stale);hit.dataset.supplyCue=supplyVisual.cue??'none';hit.dataset.bowlX=String(bowl?.x??'');hit.dataset.bowlY=String(bowl?.y??'');
  ctx.save();ctx.translate(x,y);
  const age=now-effectAt,inEffect=age>=0&&age<duration;
  const next=dragging?'idle':moving?(facing.turning?'idle':'walk'):inEffect?(performanceOverride??recoveryPerformance(action,attempt)):restingPerformance(live,retry,observing);
  if(next!==mode){previousPose=characterPose(character,mode,now-modeAt,now,gait);mode=next;modeAt=now;}
  // Blend body pose at state boundaries; effects retain their own event time.
  const modeAge=inEffect?age:(now-modeAt)%durationOf(mode);
  hit.dataset.performance=mode;
  const compacting=live?.connection==='live'&&live.activity==='compacting';
  if(lift>.01){ctx.save();ctx.globalAlpha=lift*.12;ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(0,47,26-lift*5,3,0,0,Math.PI*2);ctx.fill();ctx.restore();}
  const affection=now-affectionAt,responding=!dragging&&affection>=0&&affection<900;hit.dataset.petResponse=String(responding);
  ctx.save();ctx.translate(0,-lift*18-(responding?Math.sin(affection/900*Math.PI)*2:0));ctx.rotate(swing+(responding?Math.sin(affection/900*Math.PI*2)*.025:0));
  drawCharacter(ctx,character,now,moving,inEffect?action:compacting?'compact':'watch',inEffect?age:compacting?now%1600:age,side,live,{mode,age:modeAge,gait,facingScale:facing.scale,blendFrom:previousPose,blend:Math.min(1,(now-modeAt)/180),supply:supplyVisual,lift});ctx.restore();

  // Let motion speak. Only recovery progress or a request for attention needs a caption.
  const notices:Partial<Record<Performance,[string,string]>>={retrying:['正在重连…','Reconnecting…'],compact:['正在整理上下文…','Tidying up context…'],tap:['正在尝试继续…','Trying to continue…'],whip:['正在尝试继续…','Trying to continue…'],heavy:['再试一次…','Trying again…'],observe:['看看是否接上了…','Checking the connection…'],recovered:['接上了','Connected again'],waiting:['需要你看一下','Needs your input'],exhausted:['重试用完了，点我查看','No retries left · click to review']};
  const bubble=dragging||lift>.05||(previewing&&inEffect)?'':supply.watch?.healthIssues?.length?(language==='en'?'Watch connection needs attention':'看护连接异常，点我查看'):supply.watch?.attention?(language==='en'?`${supply.watch.attention} task(s) need you`:`${supply.watch.attention} 个任务需要你处理`):notices[mode]?.[language==='en'?1:0]??'';
  hit.dataset.caption=bubble;
  ctx.font='10px -apple-system, sans-serif';const width=ctx.measureText(bubble).width+22;
  const bubbleX=Math.max(-x+width/2+8,Math.min(innerWidth-x-width/2-8,0));
  ctx.textAlign='center';
  if(bubble){ctx.fillStyle='#20282ef2';ctx.beginPath();ctx.roundRect(bubbleX-width/2,-108,width,24,6);ctx.fill();ctx.strokeStyle=c.color;ctx.lineWidth=.7;ctx.stroke();ctx.fillStyle='#e9dfcc';ctx.fillText(bubble,bubbleX,-92);}
  const quotaText=supplyVisual.actual===null?(language==='en'?'Quota unavailable':'还没读到额度'):`${windowLabel(supplyVisual.window,language==='en')} · ${supplyVisual.actual===null?'—':Math.round(supplyVisual.actual)+'%'}${supplyVisual.stale?(language==='en'?' · last seen':' · 上次记录'):''}`;
  hit.dataset.supplyLabel=quotaText;ctx.font='10px -apple-system, sans-serif';const qw=ctx.measureText(quotaText).width+16,qx=Math.max(-x+qw/2+8,Math.min(innerWidth-x-qw/2-8,0));ctx.fillStyle='#162128ed';ctx.beginPath();ctx.roundRect(qx-qw/2,58,qw,20,5);ctx.fill();ctx.fillStyle=supplyVisual.stale?'#a2b1b9':supplyVisual.actual!==null&&supplyVisual.actual<20?'#dfba83':'#b8c9be';ctx.fillText(quotaText,qx,72);ctx.restore();
  positionResult();const halfWidth=character==='mechanic'?80:56;hit.style.width=`${halfWidth*2}px`;hit.style.transform=`translate(${x-halfWidth}px,${y-100}px)`;hit.setAttribute('aria-label',`${tr(c.name,language)}, ${tr(live?.label??'待命',language)}, ${tr('打开督工设置与任务',language)}`);updatePointer();
  active=true;frame=requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);active=false;pointer=null;updatePointer();}});
