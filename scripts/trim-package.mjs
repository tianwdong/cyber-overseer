import {readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
// Operates only on the generated runtime copy, never the source/runtime cache.
export async function trimPython(root){
 const stdlib=join(root,'lib','python3.13');
 for(const relative of ['include','share/man','lib/python3.13/config-3.13-darwin',
  'lib/python3.13/test','lib/python3.13/idlelib','lib/python3.13/ensurepip',
  'lib/python3.13/pydoc_data','lib/python3.13/site-packages/pip']){
  await rm(join(root,relative),{recursive:true,force:true});
 }
 for(const entry of await readdir(join(root,'bin'))){
  if(!['python','python3','python3.13'].includes(entry))await rm(join(root,'bin',entry),{force:true});
 }
 for(const entry of await readdir(join(stdlib,'site-packages'))){
  if(/^pip-.*\.dist-info$/.test(entry))await rm(join(stdlib,'site-packages',entry),{recursive:true,force:true});
 }
 async function clean(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
   const path=join(dir,entry.name);
   if(entry.isSymbolicLink())continue;
   if(entry.name==='__pycache__'||entry.name.endsWith('.pyc')||entry.name.endsWith('.a'))await rm(path,{recursive:true,force:true});
   else if(entry.isDirectory())await clean(path);
  }
 }
 await clean(root);
}
