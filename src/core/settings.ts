export type Language='zh'|'en';
export interface Settings {checkForUpdates?:boolean;notifyOnAttention?:boolean;retryAfterFailure:boolean;maxAttempts:number;language:'codex'|Language}
export interface RetryProgress {used:number;limit:number;exhausted:boolean;unconfirmed?:{since:number;episodeId:string}}
export const defaultSettings:Settings={retryAfterFailure:true,maxAttempts:3,language:'codex'};
export function parseSettings(value:unknown):Settings {
  const s=value as Settings;
  if(!s||typeof s.retryAfterFailure!=='boolean'||!Number.isInteger(s.maxAttempts)||s.maxAttempts<1||s.maxAttempts>10||!['codex','zh','en'].includes(s.language))throw Error('Invalid settings');
  if(s.notifyOnAttention!==undefined&&typeof s.notifyOnAttention!=='boolean')throw Error('Invalid settings');
  if(s.checkForUpdates!==undefined&&typeof s.checkForUpdates!=='boolean')throw Error('Invalid settings');
  return {...(s.checkForUpdates===undefined?{}:{checkForUpdates:s.checkForUpdates}),...(s.notifyOnAttention===undefined?{}:{notifyOnAttention:s.notifyOnAttention}),retryAfterFailure:s.retryAfterFailure,maxAttempts:s.maxAttempts,language:s.language};
}
export const languageFromLocale=(locale:string):Language=>/^zh(?:[-_]|$)/i.test(locale)?'zh':'en';
