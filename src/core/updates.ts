export const RELEASES_URL='https://github.com/tianwdong/cyber-overseer/releases';
export interface UpdateDownload {version:string;status:'downloading'|'verifying'|'ready'|'error';received:number;total?:number}
export interface UpdateState {
 download?:UpdateDownload;
 currentVersion:string;
 status:'idle'|'checking'|'available'|'current'|'unsupported'|'error';
 release?:{version:string;url:string;prerelease:boolean};
 checkedAt?:number;
 error?:'network'|'rate-limit'|'invalid-response';
}
interface Version {numbers:bigint[];pre:string[]}
export interface UpdateRelease {
 tag_name:string;draft:false;prerelease:boolean;
 assets:{name:string;state:'uploaded';size:number}[];
}
function version(value:unknown):Version|undefined {
 if(typeof value!=='string'||value.length>200)return;
 const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
 if(!match)return;
 const pre=match[4]?.split('.')??[];
 if(pre.some(id=>/^\d+$/.test(id)&&id.length>1&&id[0]==='0'))return;
 return {numbers:match.slice(1,4).map(BigInt),pre};
}
export function compareVersions(a:string,b:string):number|undefined {
 const left=version(a),right=version(b);if(!left||!right)return;
 for(let i=0;i<3;i++)if(left.numbers[i]!==right.numbers[i])return left.numbers[i]>right.numbers[i]?1:-1;
 if(!left.pre.length||!right.pre.length)return left.pre.length===right.pre.length?0:left.pre.length?-1:1;
 for(let i=0;i<Math.max(left.pre.length,right.pre.length);i++){
  const x=left.pre[i],y=right.pre[i];if(x===undefined)return -1;if(y===undefined)return 1;if(x===y)continue;
  const xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);
  if(xn&&yn)return BigInt(x)>BigInt(y)?1:-1;
  if(xn!==yn)return xn?-1:1;
  return x>y?1:-1;
 }
 return 0;
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
// Keep only release metadata needed for selection; API URLs and descriptions are never trusted.
export function parseUpdateReleases(raw:unknown):UpdateRelease[]|undefined {
 if(!Array.isArray(raw)||raw.length>100)return;
 const releases:UpdateRelease[]=[];
 for(const item of raw){
  if(!record(item)||item.draft!==false||typeof item.prerelease!=='boolean'||typeof item.tag_name!=='string')continue;
  const tag=item.tag_name,number=tag.startsWith('v')?tag.slice(1):tag;
  if(!version(number)||!Array.isArray(item.assets))continue;
  const assets:UpdateRelease['assets']=[];
  for(const asset of item.assets){
   if(record(asset)&&typeof asset.name==='string'&&asset.name.length<=300&&asset.state==='uploaded'&&typeof asset.size==='number'&&Number.isSafeInteger(asset.size)&&asset.size>0)assets.push({name:asset.name,state:'uploaded',size:asset.size});
  }
  releases.push({tag_name:tag,draft:false,prerelease:item.prerelease,assets});
 }
 return releases;
}
export function selectUpdate(raw:unknown,currentVersion:string,platform:string,arch:string):Pick<UpdateState,'status'|'release'> {
 const releases=parseUpdateReleases(raw);
 if(!version(currentVersion)||!releases)return {status:'error'};
 if(!['arm64','x64'].includes(arch)||!['darwin','win32'].includes(platform))return {status:'unsupported'};
 let newest:UpdateRelease|undefined;
 for(const release of releases){
  const number=release.tag_name.replace(/^v/,''),name=platform==='darwin'?`Cyber-Overseer-${number}-mac-${arch}.dmg`:`Cyber-Overseer-${number}-windows-${arch}-setup.exe`;
  if(!release.assets.some(asset=>asset.name===name))continue;
  if(!newest||compareVersions(number,newest.tag_name.replace(/^v/,''))!>0)newest=release;
 }
 if(!newest)return {status:'unsupported'};
 const number=newest.tag_name.replace(/^v/,'');
 if(compareVersions(number,currentVersion)!<=0)return {status:'current'};
 return {status:'available',release:{version:number,url:`${RELEASES_URL}/tag/${encodeURIComponent(newest.tag_name)}`,prerelease:newest.prerelease}};
}
