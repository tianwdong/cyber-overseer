import { startWatcher } from './watch-service';
const index=process.argv.indexOf('--thread'),id=index>=0?process.argv[index+1]:undefined;
if(!id){console.error('Usage: node dist/watch.cjs --thread <thread-id>');process.exit(1);}
startWatcher(id,(message,action)=>console.log(JSON.stringify({at:new Date().toISOString(),message,action}))).then(stop=>{
  for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>void stop().finally(()=>process.exit(0)));
}).catch(error=>{console.error(error.message);process.exit(1);});
