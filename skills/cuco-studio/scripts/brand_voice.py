#!/usr/bin/env python3
"""Brand voice from a CucoStudio style's voice_sample, via ElevenLabs.

  brand_voice.py clone <STYLE_ID>          -> clones <template>/voice_sample.* ; prints voice_id (reuses an existing clone)
  brand_voice.py check <audio.mp3> [TEXT]  -> speech-to-text (ElevenLabs scribe) to verify a line is intelligible

Ask the user before cloning (it's their brand voice and uses their ElevenLabs account).
Even a ~3 s sample produced a clear, intelligible voice on the MIG welding video; longer
samples (30 s+) give better likeness. Verify with `check`, because `cuco transcribe` has
returned empty text while alignment still worked.
"""
import json, os, subprocess, sys, uuid, urllib.parse, urllib.request, urllib.error

sys.path.insert(0, os.path.expanduser('~/.claude/skills/elevenlabs/scripts'))
from elevenlabs import get_api_key  # noqa: E402

API = 'https://api.elevenlabs.io'


def multipart(fields, files):
    b = '----cuco' + uuid.uuid4().hex
    out = []
    for k, v in fields.items():
        out.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, (name, data, ctype) in files.items():
        out.append(f'--{b}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\nContent-Type: {ctype}\r\n\r\n'.encode() + data + b'\r\n')
    out.append(f'--{b}--\r\n'.encode())
    return b''.join(out), f'multipart/form-data; boundary={b}'


def post(path, body, ctype):
    req = urllib.request.Request(API + path, data=body, method='POST', headers={'xi-api-key': get_api_key(), 'Content-Type': ctype})
    try:
        return json.loads(urllib.request.urlopen(req).read())
    except urllib.error.HTTPError as e:
        sys.exit(f'{e.code} {e.read()[:400]}')


def get(path):
    req = urllib.request.Request(API + path, headers={'xi-api-key': get_api_key()})
    return json.loads(urllib.request.urlopen(req).read())


cmd = sys.argv[1] if len(sys.argv) > 1 else ''
if cmd == 'clone':
    sid = sys.argv[2]
    style = json.loads(subprocess.check_output(['cuco', '--json', 'style', 'get', sid]))['data']
    dirs = [style.get('template_source_path') or '', os.path.expanduser(f'~/Library/Application Support/CucoStudio/styles/{sid}/template')]
    sample = next((os.path.join(d, f) for d in dirs if os.path.isdir(d) for f in os.listdir(d) if f.lower().startswith(('voice_sample', 'voice-sample'))), None)
    if not sample:
        sys.exit('style has no voice_sample')
    name = f"{style['name']} brand voice (style {sid})"
    existing = [v for v in get('/v2/voices?page_size=100&search=' + urllib.parse.quote(name)).get('voices', []) if v['name'] == name]
    if existing:
        print(existing[0]['voice_id'], '(existing clone)'); sys.exit()
    ext = os.path.splitext(sample)[1].lower()
    body, ctype = multipart({'name': name, 'description': f'Cloned from CucoStudio style {sid} {os.path.basename(sample)}'},
                            {'files': (os.path.basename(sample), open(sample, 'rb').read(), 'audio/mpeg' if ext == '.mp3' else 'audio/wav')})
    print(post('/v1/voices/add', body, ctype)['voice_id'])
elif cmd == 'check':
    path = sys.argv[2]
    body, ctype = multipart({'model_id': 'scribe_v1'}, {'file': (os.path.basename(path), open(path, 'rb').read(), 'audio/mpeg')})
    text = post('/v1/speech-to-text', body, ctype).get('text', '')
    print(text)
    if len(sys.argv) > 3:
        import re
        norm = lambda x: set(re.findall(r"[a-z0-9']+", x.lower()))
        want, got = norm(sys.argv[3]), norm(text)
        print(f'word overlap: {len(want & got) / max(1, len(want)):.0%}')
else:
    print(__doc__)
