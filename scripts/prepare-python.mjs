import {mkdir,readFile,writeFile,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const url='https://github.com/astral-sh/python-build-standalone/releases/download/20260901/cpython-3.13.15%2B20260901-aarch64-apple-darwin-install_only.tar.gz';
const sha256='b9054a9d3d54f4cb5573d44907fddb29874b08909bde73f29f2868cf872223ee';
if(process.platform!=='darwin'||process.arch!=='arm64')throw Error('This pinned runtime currently targets macOS arm64 only.');
await mkdir('artifacts/runtime',{recursive:true});
const archive='artifacts/runtime/python.tar.gz';
try{await access(archive);}catch{execFileSync('curl',['--fail','--location','--retry','2',url,'-o',archive],{stdio:'inherit'});}
if(createHash('sha256').update(await readFile(archive)).digest('hex')!==sha256)throw Error('Python archive checksum mismatch. Remove artifacts/runtime/python.tar.gz and retry.');
execFileSync('tar',['-xzf',archive,'-C','artifacts/runtime'],{stdio:'inherit'});
execFileSync('artifacts/runtime/python/bin/python3',['-I','-B','-c','import sqlite3,sys; assert sys.version_info[:2] == (3,13); print(sys.version)'],{stdio:'inherit'});
await writeFile('artifacts/runtime/provenance.json',JSON.stringify({project:'https://github.com/astral-sh/python-build-standalone',url,sha256},null,2)+'\n');
