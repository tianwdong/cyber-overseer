export interface ModelPrice {input:number;cached:number;output:number;cacheWrite?:number;source:string;longContext?:{above:number;input:number;cached:number;output:number;cacheWrite?:number}}
export interface PriceBook {version:1;currency:'USD';unit:'per_million_tokens';updatedAt:string;models:Record<string,ModelPrice>}
export interface UsageSample {model:string;input:number;cached:number;cacheWrite:number;output:number;contextTokens:number}
const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
export function parsePriceBook(raw:unknown):PriceBook{
 const b=raw as PriceBook;
 if(!b||b.version!==1||b.currency!=='USD'||b.unit!=='per_million_tokens'||typeof b.updatedAt!=='string'||!Number.isFinite(Date.parse(b.updatedAt))||!b.models||typeof b.models!=='object'||Array.isArray(b.models)||!Object.keys(b.models).length)throw Error('Invalid price table');
 for(const [id,p] of Object.entries(b.models)){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,199}$/.test(id)||!p||![p.input,p.cached,p.output].every(finite)||p.cacheWrite!==undefined&&!finite(p.cacheWrite)||typeof p.source!=='string'||!/^https:\/\//.test(p.source))throw Error('Invalid model price');
  const l=p.longContext;if(l&&(!finite(l.above)||l.above===0||![l.input,l.cached,l.output].every(finite)||l.cacheWrite!==undefined&&!finite(l.cacheWrite)))throw Error('Invalid context rate');
 }
 return b;
}
export function priceUsage(samples:UsageSample[],book:PriceBook):{usd:number|null;unpriced:string[]}{
 let usd=0;const unpriced=new Set<string>();
 for(const s of samples){
  if(![s.input,s.cached,s.cacheWrite,s.output,s.contextTokens].every(finite)){unpriced.add(s.model);continue;}
  const p=Object.hasOwn(book.models,s.model)?book.models[s.model]:undefined;
  if(!p||s.cacheWrite>0&&p.cacheWrite===undefined){unpriced.add(s.model);continue;}
  const l=p.longContext&&s.contextTokens>p.longContext.above?p.longContext:undefined;
  if(l&&s.cacheWrite>0&&l.cacheWrite===undefined){unpriced.add(s.model);continue;}
  usd+=(s.input*p.input*(l?.input??1)+s.cached*p.cached*(l?.cached??1)+s.output*p.output*(l?.output??1)+s.cacheWrite*(p.cacheWrite??0)*(l?.cacheWrite??1))/1_000_000;
 }
 return {usd:samples.length&&!unpriced.size&&Number.isFinite(usd)?usd:null,unpriced:[...unpriced]};
}
