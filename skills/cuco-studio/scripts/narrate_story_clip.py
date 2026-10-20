#!/usr/bin/env python3
"""Narrate beats with ElevenLabs and install them as ONE CucoStudio story clip.

Why: text sections rely on CucoStudio's local TTS, which can silently produce blank WAVs
(synthetic timing, -91 dB). Supplying our own voice-over as a story clip is reliable, and the
per-beat durations we measure here drive the length of each generated animation clip.

  narrate_story_clip.py beats.json --project 126 [--voice ID] [--gap 0.55] [--workdir .]

beats.json = [{"id": "b01", "text": "...", "voice": "<optional per-beat voice id>"}, ...]   (one entry per section;
a beat's "voice" overrides --voice, e.g. a narrator plus a character; "say" overrides what is spoken
when it must differ from the caption text, e.g. spelled-out letters)
Writes: <workdir>/audio/<id>.mp3, audio/narration.wav, script/durations.json, script/clip_id.txt
Copies narration.wav into projects/<id>/story_clips/<uuid>.wav and prints the uuid (= clip_id).
Section durations = speech + trailing gap (first one also gets the lead-in), so they sum to the track.
"""
import argparse, json, os, shutil, subprocess, uuid

EL = os.path.expanduser('~/.claude/skills/elevenlabs/scripts/elevenlabs.py')
ap = argparse.ArgumentParser()
ap.add_argument('beats'); ap.add_argument('--project', type=int, required=True)
ap.add_argument('--voice', default='iP95p4xoKVk53GoZ742B')  # Chris - down-to-earth explainer
ap.add_argument('--model', default='eleven_multilingual_v2')
ap.add_argument('--gap', type=float, default=0.55); ap.add_argument('--lead', type=float, default=0.3)
ap.add_argument('--workdir', default='.')
a = ap.parse_args()
os.chdir(a.workdir); os.makedirs('audio', exist_ok=True); os.makedirs('script', exist_ok=True)
beats = json.load(open(a.beats))

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]))

def silence(path, sec):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', str(sec), path], check=True)

lst, durs = [], {}
for i, b in enumerate(beats):
    mp3, wav = f"audio/{b['id']}.mp3", f"audio/{b['id']}.wav"
    if not os.path.exists(mp3):  # cached: re-running only voices new/changed beats (delete the mp3 to redo)
        subprocess.run(['python3', EL, 'say', b.get('say', b['text']), '--voice', b.get('voice', a.voice), '--model', a.model,
                        '--stability', '0.5', '--style', '0.15', '--out', mp3], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', mp3, '-ar', '44100', '-ac', '1', wav], check=True)
    pre = a.lead if i == 0 else 0
    post = b.get('gap', a.gap if i < len(beats) - 1 else 1.0)  # per-beat "gap": hold a pause for a comic beat
    if pre: silence('audio/_lead.wav', pre); lst.append('_lead.wav')
    lst.append(os.path.basename(wav))
    silence(f'audio/_gap{i}.wav', post); lst.append(f'_gap{i}.wav')
    durs[b['id']] = round(pre + dur(wav) + post, 3)
open('audio/concat.txt', 'w').write(''.join(f"file '{f}'\n" for f in lst))
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', 'audio/concat.txt', '-c:a', 'pcm_s16le', 'audio/narration.wav'], check=True)
json.dump(durs, open('script/durations.json', 'w'), indent=1)
cid = str(uuid.uuid4())
dst = os.path.expanduser(f'~/Library/Application Support/CucoStudio/projects/{a.project}/story_clips')
os.makedirs(dst, exist_ok=True)
shutil.copy('audio/narration.wav', f'{dst}/{cid}.wav')
open('script/clip_id.txt', 'w').write(cid)
print(f'narration {dur("audio/narration.wav"):.1f}s, {len(beats)} sections, clip_id={cid}')
