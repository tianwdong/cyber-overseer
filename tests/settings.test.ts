import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadSettings,saveSettings,readCodexLanguage} from '../src/main/settings';
import {defaultSettings,parseSettings,languageFromLocale} from '../src/core/settings';
import {tr} from '../src/core/i18n';
test('settings default to three attempts and Codex language, persist privately, reject invalid values',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'overseer-settings-')),file=join(dir,'settings.json');
  try{assert.deepEqual(await loadSettings(file),defaultSettings);
    const settings={retryAfterFailure:false,maxAttempts:5,language:'en' as const};await saveSettings(settings,file);assert.deepEqual(await loadSettings(file),settings);assert.equal((await stat(file)).mode&0o777,0o600);
    for(const maxAttempts of [0,11,1.2,NaN])assert.throws(()=>parseSettings({...settings,maxAttempts}));assert.throws(()=>parseSettings({...settings,language:'unknown'}));
    await writeFile(file,'{"maxAttempts":100}');assert.deepEqual(await loadSettings(file),defaultSettings);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('Codex language follows desktop.localeOverride, then the OS, without changing Codex config',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'overseer-locale-')),file=join(dir,'config.toml');
  try{
    for(const [content,expected] of [['[desktop]\nlocaleOverride = "en-US"','en'],['desktop.localeOverride = "zh-Hant-TW"','zh'],['[desktop]\nlocaleOverride = ""','zh'],['[desktop]\n# localeOverride = "en"','zh'],['invalid toml {','zh']] as const){await writeFile(file,content);assert.equal(await readCodexLanguage('zh-Hans-CN',file),expected);}
    assert.equal(languageFromLocale('de-DE'),'en');
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('English translations interpolate retry limits and preserve user content',()=>{
  assert.equal(tr('自动恢复已达上限：3/3。等待手动继续或提高次数上限。','en'),'Recovery limit reached: 3/3. Continue manually or raise the limit.');
  assert.equal(tr('共监看 {0} 个任务','en',4),'Watching 4 tasks');assert.equal(tr('用户自己的任务标题','en'),'用户自己的任务标题');
});
