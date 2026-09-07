import {realisticReady} from './realistic';
import {tr} from '../core/i18n';
import type {Language} from '../core/settings';
import {performances,durationOf,type Performance} from '../core/performance';
import {drawCharacter} from './characters';
import {getCharacter,type CharacterId} from '../core/characters';
import {performanceLabel} from '../core/companion-performance';
const studio=document.getElementById('motion-studio')!;
const canvas=document.getElementById('motion-canvas') as HTMLCanvasElement,ctx=canvas.getContext('2d')!;
const picker=document.getElementById('motion-picker')!;
const caption=document.getElementById('motion-caption')!;
const seek=document.getElementById('motion-seek') as HTMLInputElement;
const play=document.getElementById('motion-play') as HTMLButtonElement;
const story:Performance[]=['idle','walk','retrying','alert','tap','observe','alert','whip','observe','alert','heavy','observe','recovered'];
let character:CharacterId='foreman';
let language:Language='zh',mode:Performance='idle',at=performance.now(),paused=false,held=0,storyIndex=-1;
const buttons=performances.map(p=>{
  const b=document.createElement('button');b.className='motion-choice';b.dataset.performance=p.id;
  b.onclick=()=>{storyIndex=-1;select(p.id);};picker.append(b);return b;
});
function select(id:Performance){mode=id;at=performance.now();paused=false;held=0;void window.overseer.command('preview-performance',id);refreshLabels();}
function refreshLabels(){
  buttons.forEach((b,i)=>{b.textContent=tr(performanceLabel(character,performances[i].id),language);b.setAttribute('aria-pressed',String(performances[i].id===mode));});
  caption.textContent=tr(performanceLabel(character,mode),language);
  play.textContent=tr(storyIndex>=0?'停止演练':'连续演练',language);
  seek.setAttribute('aria-label',tr('拖动查看动作',language));
}
play.onclick=()=>{if(storyIndex>=0){storyIndex=-1;paused=true;held=performance.now()-at;refreshLabels();}else{storyIndex=0;select(story[0]);}};
seek.oninput=()=>{held=Number(seek.value)/1000*durationOf(mode);paused=true;storyIndex=-1;refreshLabels();drawMotionStudio(performance.now());};
export function updateMotionStudio(id:CharacterId,lang:Language){
  language=lang;if(id!==character){character=id;storyIndex=-1;mode='idle';at=performance.now();paused=false;held=0;}
  studio.hidden=false;refreshLabels();
  canvas.setAttribute('aria-label',tr(getCharacter(id).name,language)+' · '+tr('角色动作预览',language));
}
export function stopMotionStudio(){storyIndex=-1;paused=true;held=Math.min(performance.now()-at,durationOf(mode));refreshLabels();}
export function drawMotionStudio(now:number){
  if(studio.hidden||!(document.getElementById('motion-tools') as HTMLDetailsElement).open)return;
  let age=paused?held:now-at;
  if(storyIndex>=0&&age>durationOf(mode)){storyIndex++;if(storyIndex>=story.length){storyIndex=-1;mode='idle';at=now;refreshLabels();}else select(story[storyIndex]);age=0;}
  const loop=['idle','walk','thinking','working','observe','waiting','exhausted','compact'].includes(mode);
  age=loop?age%durationOf(mode):Math.min(age,durationOf(mode));
  if(!paused)seek.value=String(age/durationOf(mode)*1000);
  ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,520,300);
  const bg=ctx.createRadialGradient(240,160,5,240,160,320);bg.addColorStop(0,character==='mechanic'?'#494352':character==='medic'?'#34524f':character==='ranger'?'#35495f':'#354641');bg.addColorStop(1,'#151e24');ctx.fillStyle=bg;ctx.fillRect(0,0,520,300);
  ctx.strokeStyle='#96baa010';ctx.lineWidth=.7;for(let x=0;x<520;x+=26){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,300);ctx.stroke();}for(let y=14;y<300;y+=26){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(520,y);ctx.stroke();}
  ctx.fillStyle='#b6c2ac';ctx.font='9px monospace';ctx.fillText(`UNIT ${getCharacter(character).number} / MOTION STUDY`,20,25);ctx.fillStyle='#7e9288';ctx.fillText('CYBER OVERSEER',394,25);
  ctx.strokeStyle='#afc2a533';ctx.beginPath();ctx.moveTo(32,284);ctx.lineTo(488,284);ctx.stroke();
  ctx.save();ctx.translate(218,205);ctx.scale(1.55,1.55);
  drawCharacter(ctx,character,paused?held:now,false,'watch',age,'left',undefined,{mode,age,gait:(paused?held:now)/1000*2*Math.PI*1.8,scrubbing:paused});ctx.restore();
  ctx.fillStyle='#bcb598';ctx.font='9px monospace';ctx.fillText(`${String(Math.floor(age)).padStart(4,'0')} ms`,438,274);
  canvas.dataset.renderStyle=realisticReady(character)?'realistic':'loading';canvas.dataset.character=character;canvas.dataset.performance=mode;canvas.dataset.age=String(age);
}
