import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeSupply,remainingSupply,supplyStale} from '../src/core/supply';
test('weekly can be primary; missing windows are not zero usage',()=>{
 const a=decodeSupply({rateLimitsByLimitId:{codex:{primary:{usedPercent:89,windowDurationMins:10080,resetsAt:123},secondary:null}}},100);
 assert.equal(remainingSupply(a),11);assert.equal(a.windows.length,1);assert.equal(a.windows[0].minutes,10080);assert.equal(a.windows[0].resetAt,123000);assert.equal(a.resets,null);
 assert.equal(remainingSupply(decodeSupply({})),null);
});
test('separate model quota does not become shared food',()=>{
 const a=decodeSupply({rateLimitsByLimitId:{spark:{primary:{usedPercent:100,windowDurationMins:300}}},rateLimitResetCredits:{availableCount:0}},100);
 assert.equal(remainingSupply(a),null);assert.equal(a.resets,0);assert.equal(supplyStale(a,100+360001),true);
});
test('malformed windows and unsupported models stay unknown',()=>{
 assert.equal(decodeSupply({rateLimits:{primary:{usedPercent:'89',windowDurationMins:10080}}}).windows.length,0);
});
