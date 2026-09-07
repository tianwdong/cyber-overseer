import {test} from 'node:test';import assert from 'node:assert/strict';
import {usageMoney,usageShare,usageCalls} from '../src/renderer/usage-format';
test('usage formatting distinguishes zero, small positive amounts, missing prices and fractional shares',()=>{
 assert.equal(usageMoney(0,true),'$0.00');assert.equal(usageMoney(0.0001,true),'<$0.01');assert.equal(usageMoney(12345.6,false),'$12,345.60');assert.equal(usageMoney(null,false),'未完整计价');assert.equal(usageShare(0.009),'<0.1%');assert.equal(usageShare(99.999),'>99.9%');assert.equal(usageShare(100),'100.0%');assert.equal(usageCalls(1,true),'1 call');assert.equal(usageCalls(2,true),'2 calls');
});
