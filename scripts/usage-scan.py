"""Read-only Codex usage metadata; bounded incremental scan, no conversation text retained."""
import sys, json, sqlite3, pathlib, os, time
root=pathlib.Path(sys.argv[1]).resolve(); cache_path=pathlib.Path(sys.argv[2]); cutoff=float(sys.argv[3]); now=time.time()*1000
try:
 cache=json.loads(cache_path.read_text()); assert cache.get('version')==1 and isinstance(cache.get('files'),dict)
except (OSError,ValueError,AssertionError): cache={'version':1,'files':{}}
c=sqlite3.connect((root/'state_5.sqlite').as_uri()+'?mode=ro',uri=True,timeout=2);c.execute('pragma query_only=on')
rows=c.execute('select id,rollout_path,cwd from threads where updated_at>=? order by updated_at desc',(int(cutoff/1000),)).fetchall();c.close()
active=set(); errors=0; forks=0; pending=0; samples=[]; scanned=0; budget=48*1024*1024
valid_num=lambda x:isinstance(x,(int,float)) and not isinstance(x,bool) and x>=0 and x<float('inf')
fields=['input_tokens','cached_input_tokens','cache_write_input_tokens','output_tokens']
def usage(q):
 if not isinstance(q,dict): return None
 if not all(valid_num(q.get(k,0)) for k in fields): return None
 return {k:q.get(k,0) for k in fields}
def stamp(raw):
 from datetime import datetime
 try:return datetime.fromisoformat(raw.replace('Z','+00:00')).timestamp()*1000
 except (ValueError,TypeError,AttributeError):return None
for id,raw_path,cwd in rows:
 active.add(id)
 try:
  p=pathlib.Path(raw_path).resolve()
  if not any(p.is_relative_to((root/d).resolve()) for d in ['sessions','archived_sessions']):raise ValueError('path')
  st=p.stat();fp=[st.st_dev,st.st_ino,st.st_mtime_ns,st.st_size];old=cache['files'].get(id);fresh=not old or old.get('fp')!=fp
  append=old and old.get('fp',[None,None])[:2]==fp[:2] and old.get('offset',0)<=st.st_size and st.st_size>=old['fp'][3] and (st.st_size>old['fp'][3] or old.get('pending'))
  entry=old if old and (not fresh or append) else {'offset':0,'model':'unknown','prev':None,'events':[],'bad':False,'fork':False,'lastKey':None,'seenUsage':False}
  if (fresh or entry.get('pending')) and budget>0:
   with p.open('rb') as f:
    # Verify exact task identity before trusting a cached offset.
    head=f.readline(2*1024*1024)
    meta=json.loads(head)
    if meta.get('type')!='session_meta' or (meta.get('payload') or {}).get('id',(meta.get('payload') or {}).get('session_id'))!=id:raise ValueError('identity')
    entry['fork']=bool((meta.get('payload') or {}).get('forked_from_id'))
    if entry['fork']:entry['events']=[];entry['offset']=st.st_size
    else:
     f.seek(entry['offset']);limit=min(budget,12*1024*1024);used=0
     while used<limit:
      start=f.tell();line=f.readline(2*1024*1024);used+=len(line)
      if not line:break
      if not line.endswith(b'\n'):
       if len(line)==2*1024*1024:
        # Skip huge content lines without decoding or persisting their content.
        while line and not line.endswith(b'\n'):line=f.readline(2*1024*1024);used+=len(line)
        if line.endswith(b'\n'):entry['offset']=f.tell();continue
       f.seek(start);break
      entry['offset']=f.tell()
      try:e=json.loads(line)
      except ValueError:entry['bad']=True;continue
      q=e.get('payload') or {}
      if not isinstance(q,dict):continue
      if e.get('type')=='turn_context':entry['model']=q.get('model') or 'unknown'
      if e.get('type')!='event_msg' or q.get('type')!='token_count':continue
      info=q.get('info') or {};total=usage(info.get('total_token_usage'));last=usage(info.get('last_token_usage'));at=stamp(e.get('timestamp'))
      key=[e.get('timestamp'),total,last]
      if key==entry['lastKey']:continue
      entry['lastKey']=key
      if total is not None:
       if total==entry['prev']:continue
       if entry['prev'] is not None:
        delta={k:total[k]-entry['prev'][k] for k in fields}
        if any(v<0 for v in delta.values()):delta=last;entry['bad']=entry['bad'] or last is None
       else:
        delta=last if entry['seenUsage'] else total
        if delta is None:entry['bad']=True
       entry['prev']=total
      else:
       delta=last;entry['prev']=None
       if delta is None:entry['bad']=True
      entry['seenUsage']=True
      if delta is None:continue
      if at is None or at>now+60000:entry['bad']=True;continue
      if delta['input_tokens']<delta['cached_input_tokens']+delta['cache_write_input_tokens']:entry['bad']=True;continue
      if at<cutoff:continue
      if not any(delta.values()):continue
      entry['events'].append({'at':at,'model':entry['model'],'input':delta['input_tokens']-delta['cached_input_tokens']-delta['cache_write_input_tokens'],'cached':delta['cached_input_tokens'],'cacheWrite':delta['cache_write_input_tokens'],'output':delta['output_tokens'],'contextTokens':(last or delta)['input_tokens']})
     budget-=used
   scanned+=1;entry['fp']=fp;entry['pending']=entry['offset']<st.st_size;cache['files'][id]=entry
  if (fresh and budget<=0 and entry.get('fp')!=fp) or entry.get('pending'):pending+=1
  if entry.get('fork'):forks+=1
  if entry.get('bad'):errors+=1
  entry['events']=[e for e in entry['events'] if e['at']>=cutoff]
  for e in entry['events']:samples.append({**e,'threadId':id,'project':cwd})
 except (OSError,ValueError,TypeError,KeyError):errors+=1
cache['files']={k:v for k,v in cache['files'].items() if k in active}
cache_path.parent.mkdir(parents=True,exist_ok=True)
tmp=cache_path.with_suffix('.tmp');tmp.write_text(json.dumps(cache,separators=(',',':')));os.chmod(tmp,0o600);tmp.replace(cache_path)
print(json.dumps({'samples':samples,'files':len(rows),'scanned':scanned,'pending':pending,'errors':errors,'excludedForks':forks,'fetchedAt':now},separators=(',',':')))
