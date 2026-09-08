import type {OverseerState} from '../core/model';
const get=(id:string)=>document.getElementById(id)!;
let latest:OverseerState|undefined,dismissed:string|undefined;
export function renderAppUpdates(s:OverseerState){
 latest=s;const en=s.language==='en',u=s.update,r=u?.release;
 get('auto-update-label').textContent=en?'Check for app updates automatically':'自动检查应用更新';
 get('app-updates-title').textContent=en?'App updates':'应用更新';
 get('app-version').textContent=u?`v${u.currentVersion}`:'';
 const header=document.querySelector<HTMLElement>('.version');if(header&&u)header.textContent=`v${u.currentVersion}`;
 let message=en?'No update check yet.':'尚未检查更新。';
 if(u?.status==='checking')message=en?'Checking for updates…':'正在检查更新…';
 else if(u?.status==='available'&&r)message=en?`Version ${r.version} is available${r.prerelease?' · Preview':''}.`:`发现新版本 ${r.version}${r.prerelease?' · 预览版':''}。`;
 else if(u?.status==='current')message=en?'You have the latest available version for this device.':'已是适用于此设备的最新版本。';
 else if(u?.status==='unsupported')message=en?'No installer is available for this device yet.':'尚无适用于此设备的安装包。';
 else if(u?.status==='error')message=u.error==='rate-limit'?(en?'Update service is busy. Please try later.':'更新服务暂时限流，请稍后再试。'):(en?'Unable to check. Please try again later.':'暂时无法检查，请稍后重试。');
 get('app-update-status').textContent=message;
 get('app-update-checked').textContent=u?.checkedAt?(en?'Last successful check: ':'上次成功检查：')+new Date(u.checkedAt).toLocaleString(en?'en-US':'zh-CN'):'';
 get('app-update-hint').textContent=en?'Checks GitHub about every 6 hours, including previews. Downloads and installation are manual. No task content is sent.':'约每 6 小时检查 GitHub，包含预览版。点击后自行下载和安装，不发送任务内容。';
 const check=get('check-app-update') as HTMLButtonElement;check.textContent=en?'Check now':'立即检查';check.disabled=u?.status==='checking';
 const download=get('download-app-update') as HTMLButtonElement;download.hidden=!r&&u?.status!=='unsupported';download.textContent=r?(en?'Release notes & download ↗':'更新说明与下载 ↗'):(en?'View releases ↗':'查看发布页面 ↗');
 if(r&&u?.status==='error')get('app-update-status').textContent+=en?` Last seen: ${r.version}.`:` 上次发现的版本为 ${r.version}。`;
 const banner=get('app-update-banner');banner.hidden=!r||dismissed===r.version;
 get('app-update-banner-text').textContent=r?(en?`Cyber Overseer ${r.version} is available`:`Cyber Overseer ${r.version} 可以更新了`):'';
 get('show-app-update').textContent=en?'View update':'查看更新';get('dismiss-app-update').textContent=en?'Later':'稍后';
}
get('check-app-update').onclick=async()=>{try{renderAppUpdates(await window.overseer.command('check-app-update'));}catch{get('app-update-status').textContent=latest?.language==='en'?'Unable to check. Please try later.':'暂时无法检查，请稍后再试。';(get('check-app-update') as HTMLButtonElement).disabled=false;}};
get('download-app-update').onclick=async()=>{try{await window.overseer.command('open-app-update',latest?.update?.release?.version??'');}catch{get('app-update-status').textContent=latest?.language==='en'?'Unable to open the download page. Please try again.':'暂时无法打开下载页面，请重试。';}};
get('show-app-update').onclick=()=>get('open-settings').click();
get('dismiss-app-update').onclick=()=>{dismissed=latest?.update?.release?.version;if(latest)renderAppUpdates(latest);};
