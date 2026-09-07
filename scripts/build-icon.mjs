import {mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
if(process.platform!=='darwin')throw Error('Icon generation requires macOS AppKit. Committed PNG/ICNS assets can be used elsewhere.');
const run=(bin,args)=>execFileSync(bin,args,{stdio:'inherit'});
run('swift',['scripts/build-icon.swift','assets/icon']);
await mkdir('artifacts/app.iconset',{recursive:true});
for(const size of [16,32,128,256,512])for(const scale of [1,2]){
 const pixels=size*scale;
 run('sips',['-z',String(pixels),String(pixels),'assets/icon/icon.png','--out',`artifacts/app.iconset/icon_${size}x${size}${scale===2?'@2x':''}.png`]);
}
run('iconutil',['-c','icns','artifacts/app.iconset','-o','assets/icon/icon.icns']);
