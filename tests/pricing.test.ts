import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parsePriceBook,priceUsage,type UsageSample} from '../src/core/pricing';
import {PricingCatalog} from '../src/main/pricing';
const book=()=>parsePriceBook({version:1,currency:'USD',unit:'per_million_tokens',updatedAt:'2026-09-07',models:{test:{input:10,cached:1,cacheWrite:12.5,output:50,source:'https://example.com',longContext:{above:272000,input:2,cached:2,cacheWrite:2,output:1.5}}}});
const sample:UsageSample={model:'test',input:100,cached:200,cacheWrite:0,output:10,contextTokens:300};
test('prices are data; token categories and long-context thresholds have distinct rates',()=>{
 assert.equal(priceUsage([sample],book()).usd,.0017);
 assert.equal(priceUsage([{...sample,contextTokens:272001}],book()).usd,.00315);
 assert.equal(priceUsage([{...sample,contextTokens:272000}],book()).usd,.0017);
 assert.equal(priceUsage([{...sample,input:0,cached:0,output:0,cacheWrite:100}],book()).usd,.00125);
 assert.equal(priceUsage([{...sample,model:'new-model'}],book()).usd,null);
 assert.equal(priceUsage([sample,{...sample,model:'new-model'}],book()).usd,null);
});
test('invalid price table cannot make usage free or negative',()=>{
 for(const x of [-1,null,'10',Infinity]){const b=book();b.models.test.input=x as number;assert.throws(()=>parsePriceBook(b));}
 const b=book();b.unit='per_token' as any;assert.throws(()=>parsePriceBook(b));
});
test('hot reload adds a model without rebuilding, preserves edits, retains last good table after failure',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'overseer-pricing-'));try{
  const seed=join(dir,'seed.json'),path=join(dir,'pricing.json');await writeFile(seed,JSON.stringify(book()));
  const catalog=new PricingCatalog(path,seed);let result=await catalog.load();assert.equal(result.changed,true);
  const b=book();b.models.new_model={...b.models.test,input:20};await writeFile(path,JSON.stringify(b));result=await catalog.load();assert.equal(result.changed,true);assert.equal(priceUsage([{...sample,model:'new_model'}],result.book).usd,.0027);
  await writeFile(path,'{"version":');result=await catalog.load();assert.equal(result.error,true);assert.equal(result.book.models.new_model.input,20);
  assert.equal(await readFile(path,'utf8'),'{"version":');
  const restarted=await new PricingCatalog(path,seed).load();assert.equal(restarted.error,true);assert.equal(restarted.book.models.new_model.input,20);
  await writeFile(path,JSON.stringify(b));assert.equal((await catalog.load()).error,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});
