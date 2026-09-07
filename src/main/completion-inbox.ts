import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import type {Task} from '../core/model';
import type {TurnState} from '../core/events';
export interface CompletionEntry {id:string;threadId:string;turnId:string;title:string;cwd:string;at:number;excerpt:string;read:boolean}
export class CompletionInbox {
 entries:CompletionEntry[]=[];private since=Date.now();private seen:Record<string,number>={};private queue=Promise.resolve();private unavailable=false;
 constructor(private file:string){}
 async load(){try{const d=JSON.parse(await readFile(this.file,'utf8'));if(!Number.isFinite(d.since)||!Array.isArray(d.entries)||!d.seen||typeof d.seen!=='object')throw Error('Invalid inbox');this.since=d.since;this.seen=d.seen;this.entries=d.entries.filter((e:CompletionEntry)=>typeof e.id==='string'&&typeof e.threadId==='string'&&typeof e.turnId==='string'&&typeof e.title==='string'&&typeof e.cwd==='string'&&typeof e.excerpt==='string'&&typeof e.read==='boolean'&&Number.isFinite(e.at)).slice(-100);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT'){this.unavailable=true;throw e;}await this.save();}}
 private save(){const data=JSON.stringify({since:this.since,seen:this.seen,entries:this.entries});return mkdir(dirname(this.file),{recursive:true,mode:0o700}).then(()=>writeFile(this.file+'.tmp',data,{mode:0o600})).then(()=>rename(this.file+'.tmp',this.file));}
 private mutate(change:()=>boolean){const run=this.queue.catch(()=>{}).then(async()=>{if(this.unavailable)throw Error('Inbox unavailable');const before=JSON.stringify({entries:this.entries,seen:this.seen});if(!change())return false;try{await this.save();return true;}catch(e){Object.assign(this,JSON.parse(before));throw e;}});this.queue=run.then(()=>{},()=>{});return run;}
 add(task:Task,turn:TurnState){return this.mutate(()=>{if(turn.status!=='completed'||turn.isCompaction||!turn.turnId||!turn.endedAt||turn.endedAt<this.since||turn.endedAt<=(this.seen[task.id]??0))return false;this.seen[task.id]=turn.endedAt;this.entries.push({id:`${task.id}:${turn.turnId}`,threadId:task.id,turnId:turn.turnId,title:task.title,cwd:task.cwd,at:turn.endedAt,excerpt:(turn.resultExcerpt??'').slice(0,1600),read:false});this.entries=this.entries.slice(-100);return true;});}
 markReadMany(ids:string[]){const wanted=new Set(ids);return this.mutate(()=>{let changed=false;for(const e of this.entries)if(wanted.has(e.id)&&!e.read){e.read=true;changed=true;}return changed;});}
 markRead(id:string){return this.mutate(()=>{const e=this.entries.find(e=>e.id===id);if(!e||e.read)return false;e.read=true;return true;});}
}
