"""Generate new Lesson Recall assets from pinned sources; never overwrite audio.
Requires local FFmpeg/ffprobe. Encoding and sample checks match the iPhone-tested
Lesson 1 prototype. Normal application/CI builds only verify checked-in assets.
"""
from pathlib import Path
import array,hashlib,json,math,shutil,subprocess,wave
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/"reports/phase6-concatenated-audio"
LESSON="etcl-01-talking-about-my-job"
RATE=24000
def digest(data): return hashlib.sha256(data).hexdigest()
def run(args): return subprocess.check_output(args,stderr=subprocess.PIPE)
def pcm(path):
    return run([shutil.which("ffmpeg"),"-v","error","-i",str(path),"-map","0:a:0","-ac","1","-ar",str(RATE),"-c:a","pcm_s16le","-f","s16le","pipe:1"])
def samples(data):
    a=array.array("h");a.frombytes(data);return a
def correlation(a,b):
    x=samples(a);y=samples(b)
    assert len(x)==len(y) and len(x)>0
    xx=sum(v*v for v in x);yy=sum(v*v for v in y)
    return sum(v*w for v,w in zip(x,y))/math.sqrt(xx*yy) if xx and yy else 1.0
def wav(path,data):
    with wave.open(str(path),"wb") as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(RATE);w.writeframes(data)
def pin(path):
    b=path.read_bytes()
    item={"path":str(path.relative_to(ROOT)).replace("\\","/")}
    # Catalog line endings follow Git checkout settings; audio pins stay raw.
    if item["path"]=="web/src/etcl-lessons-v2.json":
        b=b.replace(b"\r\n",b"\n")
        item["normalization"]="lf"
    return {**item,"size":len(b),"sha256":digest(b)}

lessons=json.loads((ROOT/"web/src/etcl-lessons-v2.json").read_text(encoding="utf-8"))
assert len(lessons)==12
if (ROOT/"web/src/concatenated-recall-manifest.json").exists():
    subprocess.run(["node","scripts/verify-assets.mjs"],cwd=ROOT,check=True)
    print("Assets already generated and verified. No files overwritten.")
    raise SystemExit(0)
subprocess.run(["node","--input-type=module","-e","import {verifyOriginalAssets} from './scripts/verify-assets.mjs'; console.log(verifyOriginalAssets());"],cwd=ROOT,check=True)
tracks=[];provenance=[]
for lesson in lessons:
    LESSON=lesson["id"]
    OUT=ROOT/"reports/phase6-concatenated-audio"/LESSON
    OUT.mkdir(parents=True,exist_ok=True)
    output_path=ROOT/"web/public/lessons"/LESSON/"recall-concatenated-v1.mp3"
    # Existing generated assets are revalidated below, never overwritten.
    metadata_path=ROOT/"web/public/lessons"/LESSON/"metadata.json"
    metadata=json.loads(metadata_path.read_text(encoding="utf-8"))["phrases"]
    source=metadata_path.with_name("lesson.mp3")
    paths=[source,metadata_path,ROOT/"web/src/etcl-lessons-v2.json"]+list((metadata_path.parent/"japanese-cues-v2").glob("*.mp3"))
    before=[pin(x) for x in paths]
    english=pcm(source);duration=len(english)/2/RATE
    parts=[];timeline=[];segments=[];offset=0
    for i,phrase in enumerate(lesson["phrases"]):
        start=metadata[i]["start"];nxt=metadata[i+1]["start"] if i+1<len(metadata) else duration
        end=metadata[i].get("end",start+(nxt-start-(5 if i+1<len(metadata) else 0)-5)/2)
        first=round(start*RATE);last=round(end*RATE)
        assert 0<=first<last<=len(english)//2
        cut=english[first*2:last*2]
        # Record the original compressed second copy for diagnostics.
        repeat_start=round((end+5)*RATE)
        second=english[repeat_start*2:(repeat_start+last-first)*2]
        original_corr=correlation(cut,second)
        # The source copies are lossy: correlation is diagnostic, not a cut boundary.
        tail=samples(english[last*2:(last+RATE//4)*2])
        tail_rms=math.sqrt(sum(x*x for x in tail)/len(tail))
        tail_db=20*math.log10(max(tail_rms,1e-9)/32768)
        assert tail_db < -45,(LESSON,i,"cut truncates audible tail",tail_db)
        if first >= RATE//4:
            head=samples(english[(first-RATE//4)*2:first*2])
            head_rms=math.sqrt(sum(x*x for x in head)/len(head))
            assert 20*math.log10(max(head_rms,1e-9)/32768) < -45,(LESSON,i,"cut starts during speech")
        wav(OUT/("english-phrase-%03d.wav"%(i+1)),cut)
        cuepath=metadata_path.parent/"japanese-cues-v2"/("phrase-%03d.mp3"%(i+1))
        cue=pcm(cuepath)
        segments.append({"phrase":i+1,"en":phrase["en"],"ja":phrase["ja"],"englishSourceStart":first/RATE,"englishSourceEnd":last/RATE,"originalRepeatCorrelation":original_corr})
        for kind,data,rep in [("japanese",cue,None),("recall",bytes(RATE*5*2),None),("english",cut,1),("english",cut,2)]:
            count=len(data)//2
            timeline.append({"phrase":i+1,"kind":kind,"repetition":rep,"startSample":offset,"endSample":offset+count,"start":offset/RATE,"end":(offset+count)/RATE,"pcmSha256":digest(data)})
            parts.append(data);offset+=count
    master=b"".join(parts)
    wav(OUT/"lesson1-recall-master.wav",master)
    if not output_path.exists():
        subprocess.run([shutil.which("ffmpeg"),"-v","error","-n","-i",str(OUT/"lesson1-recall-master.wav"),"-map_metadata","-1","-c:a","libmp3lame","-q:a","2","-write_xing","1",str(output_path)],check=True)
    decoded=pcm(output_path)
    assert len(decoded)==len(master),(len(decoded),len(master))
    checks=[]
    for item,part in zip(timeline,parts):
        a=item["startSample"]*2;b=item["endSample"]*2
        assert master[a:b]==part
        if item["kind"]=="recall":
            assert len(part)==RATE*5*2 and not any(part)
            interior=samples(decoded[a+RATE//10*2:b-RATE//10*2])
            rms=math.sqrt(sum(x*x for x in interior)/len(interior))
            db=20*math.log10(max(rms,1e-9)/32768)
            assert db < -70,db
            checks.append({"phrase":item["phrase"],"kind":"recall","seconds":5,"interiorRmsDbfs":db})
        else:
            corr=correlation(part,decoded[a:b])
            assert corr>0.97,(item,corr)
            checks.append({"phrase":item["phrase"],"kind":item["kind"],"repetition":item["repetition"],"roundTripCorrelation":corr})
    assert len(timeline)==len(lesson["phrases"])*4 and len([x for x in timeline if x["kind"]=="english"])==len(lesson["phrases"])*2
    for i in range(len(lesson["phrases"])):
        items=timeline[i*4:i*4+4]
        assert [x["kind"] for x in items]==["japanese","recall","english","english"]
        assert parts[i*4+2]==parts[i*4+3]
    assert [pin(x) for x in paths]==before
    probe=json.loads(run([shutil.which("ffprobe"),"-v","error","-show_entries","format=duration:stream=sample_rate,channels","-of","json",str(output_path)]))
    manifest={"lessonId":LESSON,"sampleRate":RATE,"channels":1,"phrases":segments,"timeline":timeline,"decodedDuration":offset/RATE,"mp3ContainerDuration":float(probe["format"]["duration"]),"totalSamples":offset,"sourcePins":before,"output":pin(output_path),"verification":{"status":"PASS","sourceUnchanged":True,"japaneseCues":len(lesson["phrases"]),"recallSeconds":5,"englishRepetitions":2,"englishSegments":len(lesson["phrases"])*2,"gapsOrOverlaps":False,"decodedSamplesExact":True,"checks":checks},"scope":"Concatenated Lesson Recall v1. Fixed order, English twice, stop at lesson end. No new storage."}
    (OUT/"timeline.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding="utf-8")

    provenance.append(manifest)
    tracks.append({"lessonId":LESSON,"path":str(output_path.relative_to(ROOT/"web/public")).replace("\\","/"),
        "size":manifest["output"]["size"],"sha256":manifest["output"]["sha256"],
        "sampleRate":RATE,"duration":manifest["decodedDuration"],"totalSamples":offset,
        "phraseCount":len(lesson["phrases"]),
        "timeline":[{k:v for k,v in entry.items() if k!="pcmSha256"} for entry in timeline]})
    print(json.dumps({"lessonId":LESSON,"phrases":len(lesson["phrases"]),"duration":offset/RATE,"bytes":output_path.stat().st_size}),flush=True)
assert sum(t["phraseCount"] for t in tracks)==68
prototype=ROOT/"reports/concat-prototype-lesson1-v1/lesson1-recall.mp3"
if prototype.exists():
    assert tracks[0]["sha256"]==digest(prototype.read_bytes()),"Lesson 1 differs from tested prototype"
result={"version":1,"recallSeconds":5,"englishRepetitions":2,"lessons":tracks}
(ROOT/"web/src/concatenated-recall-manifest.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
(ROOT/"assets/concatenated-recall-provenance.json").write_text(json.dumps({"version":1,"lessons":provenance},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
print("PASS: 12 lessons / 68 phrases; source pins, PCM sequence, MP3 roundtrip and tested Lesson1 match")
