#!/usr/bin/env python3
"""Sample the FINAL Cuco render around every section boundary (just before | just after the cut).

  cut_frames.py <PROJECT_ID> <ARRANGEMENT_ID> [--out cuts.jpg] [--max 12]

Uses screenplay.json section_in times. Look at the sheet: each pair must be two clearly different
pictures (no jump cuts), and it shows how the style's transition reveals the next clip (wipes,
slides), i.e. which part of your opening frames is actually seen.
"""
import argparse, json, os, subprocess, tempfile
ap = argparse.ArgumentParser()
ap.add_argument('project'); ap.add_argument('arrangement')
ap.add_argument('--out', default='cuts.jpg'); ap.add_argument('--max', type=int, default=12)
a = ap.parse_args()
base = os.path.expanduser(f'~/Library/Application Support/CucoStudio/projects/{a.project}/arrangements/{a.arrangement}/')
sp = json.load(open(base + 'screenplay.json'))
times = [s['section_in'] for s in sp['sections'][1:]][:a.max]
tmp = tempfile.mkdtemp(); files = []
for i, t in enumerate(times):
    for tag, dt in (('a', -0.15), ('b', 0.35)):
        f = f'{tmp}/{i:02d}{tag}.png'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(max(0, t + dt)), '-i', base + 'video.mp4', '-frames:v', '1', '-vf', 'scale=480:-1', f], check=True)
        files.append(f)
args = sum((['-i', f] for f in files), [])
n = len(files)
layout = '|'.join(f'{(i % 4) * 480}_{(i // 4) * 270}' for i in range(n))
subprocess.run(['ffmpeg', '-v', 'error', '-y', *args, '-filter_complex', ''.join(f'[{i}]' for i in range(n)) + f'xstack=inputs={n}:layout={layout}', a.out], check=True)
print(f'{len(times)} cuts -> {a.out}  (pairs: before | after, 2 pairs per row)')
