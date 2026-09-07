import { readFile, mkdir, open, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { isCharacterId, type CharacterId } from '../core/characters';
export async function loadCharacter(file:string):Promise<CharacterId>{
  try{const data=JSON.parse(await readFile(file,'utf8'));return isCharacterId(data?.character)?data.character:'foreman';}
  catch(e){if(e instanceof SyntaxError||(e as NodeJS.ErrnoException).code==='ENOENT')return'foreman';throw e;}
}
export async function saveCharacter(file:string,character:CharacterId){
  await mkdir(dirname(file),{recursive:true,mode:0o700});
  const temporary=`${file}.${process.pid}.tmp`,f=await open(temporary,'w',0o600);
  try{await f.writeFile(JSON.stringify({character}));await f.sync();}finally{await f.close();}
  await rename(temporary,file);
}
