import type {RecoveryContext} from '../core/watchdog';
import {randomUUID} from 'node:crypto';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
export type DutyKind='continue'|'compact'|'checking'|'recovered'|'exhausted'|'waiting'|'failed'|'unconfirmed'|'completed';
export interface DutyEntry {id:string;threadId:string;kind:DutyKind;at:number;attempt?:number;context?:RecoveryContext}
export class DutyJournal {
 entries:DutyEntry[]=[];private notified:string[]=[];private writes=Promise.resolve();private unavailable=false;
 constructor(private file:string){}
 async load(){try{const s=JSON.parse(await readFile(this.file,'utf8'));if(!Array.isArray(s.entries)||!Array.isArray(s.notified))throw Error('Invalid journal');this.entries=s.entries.filter((e: any)=>typeof e.id==='string'&&typeof e.threadId==='string'&&Number.isFinite(e.at)&&['continue','compact','checking','recovered','exhausted','waiting','failed','unconfirmed','completed'].includes(e.kind)).slice(-200);this.notified=s.notified.filter((v:unknown)=>typeof v==='string').slice(-400);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'){this.unavailable=true;throw e;}}}
 private save(){if(this.unavailable)return Promise.reject(Error('Journal unavailable'));const data=JSON.stringify({entries:this.entries,notified:this.notified});const run=this.writes.catch(()=>{}).then(async()=>{await mkdir(dirname(this.file),{recursive:true,mode:0o700});await writeFile(this.file+'.tmp',data,{mode:0o600});await rename(this.file+'.tmp',this.file);});this.writes=run;return run;}
 async add(threadId:string,kind:DutyKind,attempt?:number,context?:RecoveryContext){const last=[...this.entries].reverse().find(e=>e.threadId===threadId);if(last?.kind===kind&&last.attempt===attempt&&last.context?.episodeId===context?.episodeId)return;const at=Date.now();this.entries.push({id:randomUUID(),threadId,kind,at,attempt,...(context?{context}:{})});this.entries=this.entries.slice(-200);await this.save();}
 async claimNotification(key:string){if(this.notified.includes(key))return false;this.notified.push(key);this.notified=this.notified.slice(-400);await this.save();return true;}
 async clear(threadId?:string){this.entries=threadId?this.entries.filter(e=>e.threadId!==threadId):[];await this.save();}
}
