#!/usr/bin/env python3
"""Attach one generated clip per section and (optionally) bind all sections to a story clip.

  attach_clips.py beats.json --project 126 --clips clips [--clip-id UUID] [--dry-run]

- Fetches the CURRENT storyboard first (never overwrite user edits from a stale copy).
- If the project already has one section per beat (texts must match), updates those sections in
  place; if it is a fresh project (only empty sections), builds the sections from beats.json.
- Copies <clips>/<id>.mp4 into attached_media/<sha256>.mp4 by hand — `cuco files copy-local`
  refuses sources outside its allowed directories (e.g. /tmp scratch dirs).
- With --clip-id: sets origin=audio, story_source=upload, clip_id=UUID, mute=false on every section
  (the uuid from narrate_story_clip.py). Cuco force-aligns each section's text inside that track.
"""
import argparse, hashlib, json, os, shutil, subprocess

ap = argparse.ArgumentParser()
ap.add_argument('beats'); ap.add_argument('--project', type=int, required=True)
ap.add_argument('--clips', default='clips'); ap.add_argument('--clip-id'); ap.add_argument('--dry-run', action='store_true')
a = ap.parse_args()
base = os.path.expanduser('~/Library/Application Support/CucoStudio/')
beats = json.load(open(a.beats))
cur = json.loads(subprocess.check_output(['cuco', '--json', 'storyboard', 'get', str(a.project)]))['data']
secs = cur.get('sections', [])
if len(secs) == len(beats):
    for s, b in zip(secs, beats):
        if s['text'].strip() != b['text'].strip():
            raise SystemExit(f"section text differs from beat {b['id']} — the user may have edited it; reconcile by hand:\n  app:   {s['text'][:80]}\n  beats: {b['text'][:80]}")
elif all(not s.get('text') and not s.get('media') for s in secs):
    secs = [{'text': b['text'], 'media': [], 'clip_id': None, 'origin': 'text', 'story_source': 'text',
             'language': 'en', 'prompt': '', 'mute': False} for b in beats]
else:
    raise SystemExit(f'project has {len(secs)} non-empty sections but {len(beats)} beats — reconcile by hand')
md = f'{base}projects/{a.project}/attached_media'; os.makedirs(md, exist_ok=True)
for s, b in zip(secs, beats):
    src = f"{a.clips}/{b['id']}.mp4"
    h = hashlib.sha256(open(src, 'rb').read()).hexdigest()
    if not a.dry_run: shutil.copy(src, f'{md}/{h}.mp4')
    s['media'] = [{'filePath': f'projects/{a.project}/attached_media/{h}.mp4', 'fileHash': h,
                   'originalName': f"{b['id']}.mp4", 'fileSize': os.path.getsize(src), 'mimeType': 'video/mp4'}]
    if a.clip_id: s.update(clip_id=a.clip_id, origin='audio', story_source='upload', mute=False)
cur['sections'] = secs
out = f'storyboard_{a.project}.json'
json.dump(cur, open(out, 'w'), indent=1)
if a.dry_run: print('dry run, wrote', out)
else: subprocess.run(['cuco', 'storyboard', 'update', str(a.project), '--file', out], check=True)
