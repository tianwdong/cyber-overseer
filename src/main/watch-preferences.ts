import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
export interface WatchPreferences {autoAll:boolean;pausedIds:string[]}
export async function loadWatchPreferences(file:string):Promise<WatchPreferences>{
 try{const p=JSON.parse(await readFile(file,'utf8'));
  if(typeof p.autoAll!=='boolean'||!Array.isArray(p.pausedIds)||!p.pausedIds.every((id:unknown)=>typeof id==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)))throw Error('Invalid watch preferences');
  return {autoAll:p.autoAll,pausedIds:[...new Set<string>(p.pausedIds)]};
 }catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return {autoAll:true,pausedIds:[]};throw e;}
}
export async function saveWatchPreferences(file:string,p:WatchPreferences){
 await mkdir(dirname(file),{recursive:true,mode:0o700});const temp=file+'.tmp';
 await writeFile(temp,JSON.stringify(p),{mode:0o600});await rename(temp,file);
}
