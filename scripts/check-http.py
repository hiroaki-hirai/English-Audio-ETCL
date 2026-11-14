import concurrent.futures,hashlib,json,urllib.request
from pathlib import Path
root=Path(__file__).resolve().parents[1]
manifest=json.loads((root/'dist/offline-assets.json').read_text(encoding='utf-8'))
base='http://localhost:5190/English-Audio-ETCL/'
def check(a):
 with urllib.request.urlopen(base+a['path'],timeout=20) as r: b=r.read();status=r.status
 assert status==200 and len(b)==a['size'] and hashlib.sha256(b).hexdigest()==a['sha256'],a['path']
 return {'path':a['path'],'status':status,'size':len(b),'sha256':hashlib.sha256(b).hexdigest()}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: rows=list(pool.map(check,manifest['assets']))
audio=next(a for a in manifest['assets'] if a['path'].endswith('.mp3'))
with urllib.request.urlopen(urllib.request.Request(base+audio['path'],headers={'Range':'bytes=0-31'})) as r:
 assert r.status==206 and len(r.read())==32
(root/'reports/http-verification.json').write_text(json.dumps({'status':'PASS','assets':rows,'audioRange206':True},indent=2),encoding='utf-8')
print(json.dumps({'httpAssets':len(rows),'allHashMatch':True,'range206':True}))
