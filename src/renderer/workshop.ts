import {drawMotionStudio,updateMotionStudio,stopMotionStudio} from './motion-studio';
import {tr} from '../core/i18n';
import type {Language} from '../core/settings';
import {characters,getCharacter,type CharacterId,type CharacterAction} from '../core/characters';
import {drawCharacter} from './characters';
const dialog=document.getElementById('character-workshop') as HTMLDialogElement;
const tools=document.getElementById('motion-tools') as HTMLDetailsElement;
const roster=document.getElementById('character-roster')!;
let language:Language='zh';
let selected:CharacterId='foreman',frame=0,drawAt=0,previewAt=-10000,preview:CharacterAction='watch';
const cards=characters.map(c=>{
  const b=document.createElement('button');b.className='character-card';b.dataset.character=c.id;b.setAttribute('aria-label',`选择${c.name}`);b.style.setProperty('--character-color',c.color);
  const number=document.createElement('span');number.className='character-number';number.textContent=`UNIT ${c.number}`;
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=264;canvas.setAttribute('aria-hidden','true');
  const name=document.createElement('strong');name.textContent=c.name;
  const tag=document.createElement('span');tag.className='character-tag';tag.textContent=c.tag;
  const badge=document.createElement('span');badge.className='character-badge';
  b.append(number,canvas,name,tag,badge);roster.append(b);
  b.onclick=async()=>{try{await window.overseer.command('character',c.id);preview='whip';previewAt=performance.now();}catch(e){document.getElementById('workshop-status')!.textContent=e instanceof Error?e.message:'角色切换失败';}};
  return{b,canvas,badge};
});
export function updateWorkshop(id:CharacterId,lang:Language='zh'){
  language=lang;updateMotionStudio(id,lang);
  selected=id;const c=getCharacter(id);
  for(let i=0;i<cards.length;i++){const on=characters[i].id===id;cards[i].b.setAttribute('aria-pressed',String(on));cards[i].badge.textContent=tr(on?'● 正在值班':'换它上岗',lang);cards[i].b.setAttribute('aria-label',tr('选择 {0}',lang,tr(characters[i].name,lang)));cards[i].b.querySelector('strong')!.textContent=tr(characters[i].name,lang);cards[i].b.querySelector('.character-tag')!.textContent=tr(characters[i].tag,lang);}
  document.getElementById('character-current')!.textContent=tr(c.name,lang);
  for(const [key,text] of [['idle',c.idle],['move',c.move],['recover',c.recover],['compact',c.compact]])document.getElementById(`behavior-${key}`)!.textContent=tr(text,lang);
  document.getElementById('workshop-status')!.textContent=tr('选择后自动保存 · 预览不影响任务',lang);
}
function loop(now:number){
  if(!dialog.open)return;
  if(now-drawAt>=30){
    drawAt=now;if(tools.open)drawMotionStudio(now);
    for(let i=0;i<cards.length;i++){
      const ctx=cards[i].canvas.getContext('2d')!;ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,160,132);ctx.save();ctx.translate(80,77);ctx.scale(.8,.8);
      drawCharacter(ctx,characters[i].id,now,false,characters[i].id===selected?preview:'watch',now-previewAt);ctx.restore();
    }
  }
  frame=requestAnimationFrame(loop);
}
document.getElementById('open-characters')!.onclick=()=>{if(!dialog.open){tools.open=false;dialog.showModal();frame=requestAnimationFrame(loop);}};
document.getElementById('close-characters')!.onclick=()=>dialog.close();
dialog.addEventListener('close',()=>{cancelAnimationFrame(frame);stopMotionStudio();});
for(const action of ['whip','compact','recovered'] as const){
  document.getElementById(`preview-${action}`)!.onclick=async()=>{preview=action;previewAt=performance.now();await window.overseer.command('preview-character',action);};
}

tools.addEventListener('toggle',()=>{if(!tools.open)stopMotionStudio();});
