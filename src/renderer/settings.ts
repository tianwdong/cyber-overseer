import {taskExhausted} from '../core/attention';
import type {OverseerState} from '../core/model';
import {defaultSettings,type Language,type Settings} from '../core/settings';
import {tr} from '../core/i18n';
const dialog=document.getElementById('settings-dialog') as HTMLDialogElement;
const enabled=document.getElementById('retry-enabled') as HTMLInputElement,limit=document.getElementById('retry-limit') as HTMLInputElement,language=document.getElementById('language-choice') as HTMLSelectElement;
let current:Settings={...defaultSettings},uiLanguage:Language='zh';
function populate(){(document.getElementById('notify-attention') as HTMLInputElement).checked=current.notifyOnAttention!==false;enabled.checked=current.retryAfterFailure;limit.value=String(current.maxAttempts);limit.disabled=!enabled.checked;language.value=current.language;}
export function updateSettings(state:OverseerState){
  current=state.settings??defaultSettings;uiLanguage=state.language??'zh';if(!dialog.open)populate();
  const progress=state.selectedId?state.retryProgress?.[state.selectedId]:undefined;
  document.getElementById('retry-progress')!.textContent=progress?`${tr('本次连续故障',uiLanguage)} · ${tr('已用 {0} / {1} 次',uiLanguage,progress.used,progress.limit)}${(state.selectedId&&taskExhausted(state,state.selectedId))?' · '+tr('重试次数已用尽',uiLanguage):''}`:'';
}
function show(){if(!dialog.open){populate();document.getElementById('settings-status')!.textContent='';dialog.showModal();}}
document.getElementById('open-settings')!.onclick=show;window.overseer.onSettings(show);
document.getElementById('close-settings')!.onclick=()=>dialog.close();enabled.onchange=()=>{limit.disabled=!enabled.checked;};
document.getElementById('settings-form')!.onsubmit=async event=>{
  event.preventDefault();const button=dialog.querySelector('button[type="submit"]') as HTMLButtonElement;button.disabled=true;
  try{const state=await window.overseer.command('settings',JSON.stringify({notifyOnAttention:(document.getElementById('notify-attention') as HTMLInputElement).checked,retryAfterFailure:enabled.checked,maxAttempts:Number(limit.value),language:language.value}));updateSettings(state);populate();document.getElementById('settings-status')!.textContent=tr('设置已保存',uiLanguage);}
  catch{document.getElementById('settings-status')!.textContent=tr('设置保存失败',uiLanguage);}finally{button.disabled=false;}
};

document.getElementById('edit-pricing')!.onclick=()=>void window.overseer.command('pricing').catch(()=>{document.getElementById('settings-status')!.textContent=uiLanguage==='en'?'Could not open price table':'无法打开价格表';});
