#!/usr/bin/env python3
"""Read a CucoStudio style as a design brief BEFORE designing any media for it.

A style is the brand's style guide: palette, typefaces, canvas, where media sits (and at what
size), how much text a shot holds, the look (poster), sometimes a brand voice. Generated media
must be derived from it, not invented.

  style_brief.py <STYLE_ID> [--out DIR] [--apply TEMPLATE_DIR]

Writes to DIR (default ./style_brief):
  brief.json         everything below, machine-readable
  poster_sheet.jpg   frames sampled across the style's poster — LOOK at it (Read the image)
Prints a summary. With --apply, writes TEMPLATE_DIR/web/theme.json (colors, fonts, clip size) and
copies the brand font files into TEMPLATE_DIR/web/fonts/, so the three.js explainer engine renders
in the brand's palette and exact typefaces at the media slot's aspect ratio.
"""
import argparse, glob, json, os, re, shutil, subprocess

ap = argparse.ArgumentParser()
ap.add_argument('style', type=int)
ap.add_argument('--out', default='style_brief')
ap.add_argument('--apply')
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
APP = os.path.expanduser('~/Library/Application Support/CucoStudio')


def cuco(*args):
    return json.loads(subprocess.check_output(['cuco', '--json', *args]))['data']


style = cuco('style', 'get', str(a.style))
src = style.get('template_source_path') or ''
installed = os.path.join(APP, 'styles', str(a.style), 'template')
roots = [d for d in (src, installed) if d and os.path.isdir(d)]
manifest = {}
for d in roots:
    m = os.path.join(d, 'manifest.json')
    if os.path.exists(m):
        manifest = json.load(open(m)); break
files = sorted({f for d in roots for f in os.listdir(d) if not f.startswith('.') and not f.endswith('.aep')})

# ---- shots: media slots vs text shots
shots = manifest.get('shot_list', [])
slots = [{'shot': s.get('shotName'), 'w': s['frame'][0], 'h': s['frame'][1], 'aspect': round(s['frame'][0] / s['frame'][1], 3)}
         for s in shots if s.get('frame')]
text_shots = [{'shot': s.get('shotName'), 'chars': s.get('chars'), 'font': s.get('font'), 'sample': s.get('text')}
              for s in shots if not s.get('frame')]
res = manifest.get('resolution') or style.get('resolution')
# The canvas-sized slot is usually the full-bleed shot; a smaller slot is a card/window.
for s in slots:
    s['full_bleed'] = res and s['w'] >= res[0] * 0.95 and s['h'] >= res[1] * 0.95

# ---- fonts: resolve PostScript names to local files
def find_font(ps):
    try:
        out = subprocess.check_output(['fc-list', f':postscriptname={ps}', 'file'], text=True).strip()
        if out: return out.splitlines()[0].split(':')[0].strip()
    except Exception:
        pass
    fam = re.split(r'[-_]', ps)[0].lower()
    for d in ('~/Library/Fonts', '/Library/Fonts', '/System/Library/Fonts'):
        hits = [f for f in glob.glob(os.path.expanduser(d) + '/*') if os.path.basename(f).lower().startswith(fam)]
        if hits: return sorted(hits, key=len)[0]
    return None

font_names = manifest.get('fonts') or style.get('font') or []
fonts = [{'postscript': f, 'file': find_font(f)} for f in font_names]

# ---- look: poster frames
poster = next((os.path.join(d, f) for d in roots for f in os.listdir(d)
               if re.match(r'(poster|cover|video)\.(gif|mp4|webm|mov)$', f, re.I)), None)
if not poster:
    poster = next((os.path.join(d, f) for d in roots for f in os.listdir(d) if f.lower().endswith('.gif')), None)
sheet = None
if poster:
    sheet = os.path.join(a.out, 'poster_sheet.jpg')
    try:
        pdur = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', poster]))
    except Exception:
        pdur = 10.0
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', poster, '-vf',
                    f"fps={12 / max(pdur, 0.5):.4f},scale=480:-1,tile=4x3", '-frames:v', '1', sheet])
    if not os.path.exists(sheet): sheet = None

voice_samples = [os.path.join(d, f) for d in roots for f in os.listdir(d) if re.match(r'voice[-_]sample', f, re.I)]

brief = {
    'id': a.style, 'name': style.get('name'), 'resolution': res, 'fps': manifest.get('fps') or style.get('fps'),
    'aspect': style.get('aspect_ratio'), 'palette': manifest.get('color_palette') or style.get('color_palette'),
    'fonts': fonts, 'media_slots': slots, 'text_shots': text_shots, 'poster': poster, 'poster_sheet': sheet,
    'voice_samples': voice_samples, 'other_assets': files, 'template_dirs': roots,
}
json.dump(brief, open(os.path.join(a.out, 'brief.json'), 'w'), indent=1)

print(f"STYLE {a.style} · {brief['name']} · {res} @ {brief['fps']} fps")
print(f"palette: {brief['palette']}   (placeholder palettes like all-#ff0000 mean: derive colors from the poster)")
for f in fonts: print(f"font: {f['postscript']} -> {f['file'] or 'NOT INSTALLED'}")
for s in slots: print(f"media slot: shot {s['shot']} {s['w']}x{s['h']} (aspect {s['aspect']}){' full-bleed' if s['full_bleed'] else ' card/window'}")
if not slots: print('media slots: none declared — probe with scripts/probe_style.sh')
for t in text_shots: print(f"text shot: {t['shot']} ~{t['chars']} chars, {t['font']}")
print(f"poster sheet: {sheet}  <- look at it before designing")
if voice_samples: print(f"brand voice sample(s): {voice_samples}")
print(f"assets: {files}")

# ---- apply to the explainer template
if a.apply:
    web = os.path.join(a.apply, 'web'); os.makedirs(os.path.join(web, 'fonts'), exist_ok=True)
    pal = [c for c in (brief['palette'] or [])]
    placeholder = len(set(c.lower() for c in pal)) <= 1
    slot = max(slots, key=lambda s: s['w'] * s['h'] * (0.5 if s['full_bleed'] else 1)) if slots else None
    # clip canvas: slot aspect at ~1080 px on the short side (renderer supersamples 2x anyway)
    asp = slot['aspect'] if slot else (res[0] / res[1] if res else 1.5)
    W, H = (round(1080 * asp / 2) * 2, 1080) if asp >= 1 else (1080, round(1080 / asp / 2) * 2)
    faces = []
    for f in fonts:
        if f['file']:
            dst = os.path.join(web, 'fonts', os.path.basename(f['file']))
            shutil.copy(f['file'], dst)
            faces.append({'family': f['postscript'], 'url': 'fonts/' + os.path.basename(f['file'])})
    theme_path = os.path.join(web, 'theme.json')
    theme = json.load(open(theme_path)) if os.path.exists(theme_path) else {}
    theme.update({'style_id': a.style, 'style_name': brief['name'], 'width': W, 'height': H, 'fonts': faces,
                  'palette': pal, 'palette_is_placeholder': placeholder,
                  'display_font': faces[0]['family'] if faces else theme.get('display_font')})
    json.dump(theme, open(theme_path, 'w'), indent=1)
    print(f"\napplied -> {theme_path}: canvas {W}x{H}, fonts {[x['family'] for x in faces]}")
    print('NOW set theme roles by hand (bg / ink / accent / accent2 / wood...) after looking at the poster sheet:')
    print('which palette color is the background, which is the accent, what the style already draws (frame, captions).')
