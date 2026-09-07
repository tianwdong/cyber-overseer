import {readFile,mkdir,open,rename} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import { paths } from './platform';
import {parse} from 'smol-toml';
import {defaultSettings,parseSettings,languageFromLocale,type Settings} from '../core/settings';
export const settingsFile=join(paths.stateDir,'settings.json');
export async function loadSettings(file=settingsFile):Promise<Settings>{
  try{return parseSettings(JSON.parse(await readFile(file,'utf8')));}
  catch(e){if(e instanceof SyntaxError||(e as NodeJS.ErrnoException).code==='ENOENT'||(e as Error).message==='Invalid settings')return {...defaultSettings};throw e;}
}
export async function saveSettings(settings:Settings,file=settingsFile){
  const data=parseSettings(settings);await mkdir(dirname(file),{recursive:true,mode:0o700});
  const temp=`${file}.${process.pid}.tmp`,f=await open(temp,'w',0o600);
  try{await f.writeFile(JSON.stringify(data));await f.sync();}finally{await f.close();}await rename(temp,file);
}
// Desktop 26.901.41123 settingsStore persists the exact key desktop.localeOverride.
export async function readCodexLanguage(fallback:string,file=join(paths.codexHome,'config.toml')){
  try{const data=parse(await readFile(file,'utf8')),desktop=data.desktop as Record<string,unknown>|undefined;
    const value=desktop?.localeOverride;if(typeof value==='string'&&value.trim())return languageFromLocale(value);
  }catch{/* Missing or temporarily incomplete config uses the same OS-language fallback. */}
  return languageFromLocale(fallback);
}
