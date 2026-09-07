import {mkdir,readFile,writeFile,access,cp,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
if(process.platform!=='win32'||process.arch!=='x64')throw Error('Run Windows x64 packaging on Windows x64.');
const root=resolve('artifacts/windows-runtime');
const url='https://github.com/astral-sh/python-build-standalone/releases/download/20260901/cpython-3.13.15%2B20260901-x86_64-pc-windows-msvc-install_only.tar.gz';
const sha256='9bcc038a0bf180612ed56dec93d4977d035e80b8d9320ef51a38c287baf134b7';
await mkdir(root,{recursive:true});
const archive=join(root,'python.tar.gz');
try{await access(archive);}catch{execFileSync('curl.exe',['--fail','--location','--retry','2',url,'-o',archive],{stdio:'inherit'});}
if(createHash('sha256').update(await readFile(archive)).digest('hex')!==sha256)throw Error('Windows Python checksum mismatch.');
await rm(join(root,'python'),{recursive:true,force:true});
execFileSync('tar.exe',['-xzf',archive,'-C',root],{stdio:'inherit'});
execFileSync(join(root,'python','python.exe'),['-I','-B','-c','import sqlite3,sys; assert sys.version_info[:2]==(3,13); assert sqlite3.connect(":memory:").execute("select 42").fetchone()[0]==42; print(sys.version)'],{stdio:'inherit'});
// Keep dependency licenses and DLLs; remove only development tooling.
for(const name of ['include','libs','Scripts','Lib/test','Lib/idlelib','Lib/ensurepip'])await rm(join(root,'python',name),{recursive:true,force:true});
const licenses=join(root,'licenses');await mkdir(licenses,{recursive:true});
for(const [source,name] of [['LICENSE','SOURCE-LICENSE'],['assets/ASSET-LICENSE.md','ASSET-LICENSE.md'],['node_modules/electron/dist/LICENSE','Electron-LICENSE'],['node_modules/electron/dist/LICENSES.chromium.html','Chromium-LICENSES.html'],['assets/CODEBURN-NOTICE.txt','CODEBURN-NOTICE.txt'],['node_modules/smol-toml/LICENSE','smol-toml-LICENSE']])await cp(source,join(licenses,name));
await writeFile(join(licenses,'python-provenance.json'),JSON.stringify({project:'https://github.com/astral-sh/python-build-standalone',url,sha256},null,2)+'\n');
