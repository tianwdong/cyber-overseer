import {test} from 'node:test';
import assert from 'node:assert/strict';
import {shellQuote,powershellQuote} from '../src/main/managed-cli';
import {runPython} from '../src/main/platform';
import {resolve} from 'node:path';
test('terminal-owned launcher cleans credentials and kills an unresponsive server only after the terminal exits',async()=>{
 const {stdout}=await runPython([resolve('tests/fixtures/cli-launcher-check.py'),resolve('src/main/cli/launcher.py')],{timeout:15000,maxBuffer:1024*1024});
 assert.match(stdout,/launcher lifecycle passed/);
});
test('terminal command quoting preserves paths as literal arguments',()=>{
 assert.equal(shellQuote("/a'b/$(danger)"),"'/a'\\''b/$(danger)'");
 assert.equal(powershellQuote("C:\\a'b\\`danger"),"'C:\\a''b\\`danger'");
});
