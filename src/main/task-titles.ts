import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
export function parseTaskTitles(text:string):Map<string,string>{
 const latest=new Map<string,{title:string;at:number}>();
 for(const line of text.split('\n')){
  try{const r=JSON.parse(line),at=Date.parse(r.updated_at);
   if(typeof r.id!=='string'||typeof r.thread_name!=='string'||!r.thread_name.trim()||!Number.isFinite(at))continue;
   if(at>=(latest.get(r.id)?.at??-Infinity))latest.set(r.id,{title:r.thread_name,at});
  }catch{/* An append in progress or malformed entry must not hide other task names. */}
 }
 return new Map([...latest].map(([id,r])=>[id,r.title]));
}
export async function readTaskTitles(codexHome:string):Promise<Map<string,string>>{
 try{return parseTaskTitles(await readFile(join(codexHome,'session_index.jsonl'),'utf8'));}
 catch{return new Map();} // Optional title index; retain SQLite titles when it is unavailable.
}
