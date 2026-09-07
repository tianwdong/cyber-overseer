import {join} from 'node:path';
import {runPython,paths} from './platform';
import {usageStart,type MeterScan} from '../core/usage-overview';
export async function scanUsage(script:string):Promise<MeterScan>{const {stdout}=await runPython([script,paths.codexHome,join(paths.stateDir,'usage-cache-31d.json'),String(usageStart(Date.now(),31))],{timeout:60000,maxBuffer:32*1024*1024});return JSON.parse(stdout);}
