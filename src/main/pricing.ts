import {readFile,writeFile,mkdir,stat,rename} from 'node:fs/promises';
import {dirname} from 'node:path';
import {parsePriceBook,type PriceBook} from '../core/pricing';
export class PricingCatalog {
 private book?:PriceBook;private bytes='';error=false;
 constructor(readonly path:string,private seed:string){}
 async load():Promise<{book:PriceBook;changed:boolean;error:boolean}>{
  if(!this.book){const raw=await readFile(this.seed,'utf8');this.book=parsePriceBook(JSON.parse(raw));try{this.book=parsePriceBook(JSON.parse(await readFile(this.path+'.last-good','utf8')));}catch{}await mkdir(dirname(this.path),{recursive:true});try{await writeFile(this.path,raw,{flag:'wx',mode:0o600});}catch(e){if((e as NodeJS.ErrnoException).code!=='EEXIST')throw e;}}
  try{
   if((await stat(this.path)).size>1_000_000)throw Error('Price table too large');
   const raw=await readFile(this.path,'utf8');if(raw===this.bytes){this.error=false;return {book:this.book,changed:false,error:false};}
   const next=parsePriceBook(JSON.parse(raw));await writeFile(this.path+'.last-good.tmp',raw,{mode:0o600});await rename(this.path+'.last-good.tmp',this.path+'.last-good');this.bytes=raw;this.book=next;this.error=false;return {book:next,changed:true,error:false};
  }catch{this.error=true;return {book:this.book,changed:false,error:true};}
 }
}
