# Word timings per beat (forced alignment of the spoken text in each beat's wav) -> script/words.json
# Run after narrate_story_clip.py (needs audio/<id>.wav). Beats then time entrances with c.at("word").
import json, subprocess, sys
beats = json.load(open('script/beats.json'))
out = {}
for b in beats:
    say = b.get('say', b['text'])
    r = subprocess.run(['cuco', '--json', 'transcribe', 'align', f'--audio=audio/{b["id"]}.wav', f'--text={say}', '--language=en'], capture_output=True, text=True)
    d = json.loads(r.stdout)['data']
    words = [{'w': w['word'].strip(), 's': round(w['start'], 3), 'e': round(w['end'], 3)} for seg in d['segments'] for w in seg.get('words', [])]
    out[b['id']] = words
    print(b['id'], len(words), words[:3], words[-1:] if words else None, flush=True)
json.dump(out, open('script/words.json', 'w'), indent=0)
