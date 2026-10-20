#!/usr/bin/env python3
"""splice-music engine — generate per-clip music beds from clip JSON sidecars
and a Splice sample pack, using only what the pack's filenames + folder
structure encode (BPM, key, instrument role, construction-kit grouping).

Usage:
  make_music.py --pack "<pack dir>" [--clips DIR] [--out DIR] [SUBSET ...]
  make_music.py --pack "<pack dir>" --scan-only          # list discovered kits
  ALT_KIT=<name> ALT_SUFFIX=" — take2" make_music.py --pack ... <clip>

SUBSET: case-insensitive substrings; only matching clip JSONs are (re)built.
Per-project taste lives in <clips>/_music_overrides.json (see SKILL.md).
"""
import json, glob, os, re, subprocess, sys, argparse

# ---------------------------------------------------------------- pack scanning
KEY_RE = re.compile(r'([A-G][#b]?)(maj|min)\b', re.I)
BPM_RE = re.compile(r'(?<!\d)(\d{2,3})(?!\d)')

def first_bpm(name):
    for m in BPM_RE.finditer(name):
        v = int(m.group(1))
        if 40 <= v <= 300:
            return v
    return None

def role_of(fn):
    f = fn.lower()
    if 'bass' in f:                                   return 'bass'
    if 'piano' in f or 'rhodes' in f:                 return 'piano'
    if 'sax' in f:                                    return 'sax'
    if 'drum' in f or 'hats' in f or 'perc' in f:     return 'drums'
    if 'songstarter' in f:                            return 'starter'
    if 'music_loop' in f or 'fullmix' in f:           return 'full'
    if any(k in f for k in ('lead','keys','synth','guitar','organ','flute','trumpet','horn','pad')):
        return 'lead'
    return None

def _pick(paths):                          # prefer the non-_alt take
    return sorted(paths, key=lambda p: ('_alt' in os.path.basename(p), p))[0] if paths else None

def scan_pack(pack):
    """Return a list of construction kits discovered purely from filenames.
    A kit = one Melodic_Loops subfolder (stems that play together) + its drum loop."""
    mel_dirs  = [d for d,_,_ in os.walk(pack) if os.path.basename(d) == 'Melodic_Loops']
    drum_dirs = [d for d,_,_ in os.walk(pack) if os.path.basename(d) in ('Drum_Loops','Drums')]
    # fallback: if no Melodic_Loops, treat any folder containing a *bass* loop as a kit
    if not mel_dirs:
        mel_dirs = sorted({os.path.dirname(p) for p in glob.glob(os.path.join(pack,'**','*bass*.wav'), recursive=True)})
        kit_dirs = mel_dirs
    else:
        kit_dirs = [k for md in mel_dirs for k in sorted(glob.glob(os.path.join(md,'*'))) if os.path.isdir(k)]

    kits = []
    for kdir in kit_dirs:
        name = os.path.basename(kdir)
        bpm  = first_bpm(name) or first_bpm(" ".join(os.listdir(kdir)))
        km   = KEY_RE.search(name) or KEY_RE.search(" ".join(os.listdir(kdir)))
        key  = (km.group(1)[0].upper()+km.group(1)[1:]+km.group(2).lower()) if km else '?'
        cand = {}
        for w in glob.glob(os.path.join(kdir,'*.wav')):
            r = role_of(os.path.basename(w))
            if r: cand.setdefault(r, []).append(w)
        roles = {r: _pick(v) for r, v in cand.items()}
        if not bpm or 'bass' not in roles:
            continue
        # song token: strip bpm prefix and key suffix from the folder name
        token = re.sub(rf'.*?{bpm}_', '', name)
        token = KEY_RE.sub('', token).strip('_ ').replace('_alt','') or name
        head  = token.split('_')[0].lower()
        # drum loop: same bpm + shared song token, from any Drum_Loops dir
        drums = None
        for dd in drum_dirs:
            c = [p for p in glob.glob(os.path.join(dd,'*.wav'))
                 if str(bpm) in os.path.basename(p) and head in os.path.basename(p).lower()]
            if c: drums = _pick(c); break
        kits.append({'name': token, 'bpm': bpm, 'key': key, 'bar': 4*60.0/bpm,
                     'bass':  roles.get('bass'),  'piano': roles.get('piano'),
                     'sax':   roles.get('sax') or roles.get('lead'),
                     'drums': drums or roles.get('drums')})
    return kits

def band_of_bpm(bpm):
    return 'slow' if bpm < 100 else ('mid' if bpm <= 145 else 'fast')

# ---------------------------------------------------------------- clip analysis
STUDIO = re.compile(r"studio|backdrop|seamless|photography studio|makeup station", re.I)
STREET = re.compile(r"street|sidewalk|city|urban|road|asphalt|outdoor|rooftop|graffiti", re.I)

def analyze(j):
    total = float(j["duration"])
    shots = [s for s in j["shots"] if s.get("source_comp") != "soundtrack"]
    outro = total
    body  = []
    for s in shots:
        if re.search(r"logo", " ".join(s.get("clips") or []), re.I):
            outro = min(outro, float(s["start"]))
        else:
            body.append(s)
    if outro >= total: outro = total
    cuts = sorted({round(float(s["start"]),3) for s in body if float(s["start"]) > 0.05})
    def loc(s):
        t = " ".join((c or {}).get("scene","") for c in (s.get("clip_descriptions") or []) if c)
        return "studio" if len(STUDIO.findall(t)) > len(STREET.findall(t)) else "street"
    locs = [loc(s) for s in body]
    where = max(set(locs), key=locs.count) if locs else "street"
    trans = None
    for i in range(1, len(body)):
        if locs[i] != locs[i-1] and float(body[i]["start"]) > 0.05:
            trans = round(float(body[i]["start"]),3); break
    durs = [float(s["duration"]) for s in body] or [total]
    return total, outro, cuts, where, sum(durs)/len(durs), trans

def band_for(name, avg, cuts, trans):
    if "tight" in name.lower() or avg < 1.6:   return "fast"
    if trans is not None:                       return "mid"   # studio<->street wants a drop
    if avg > 3.0 or len(cuts) <= 1:             return "slow"
    return "mid"

def has(band):                       # nearest non-empty band if the ideal one has no kits
    order = {"slow":["slow","mid","fast"], "mid":["mid","slow","fast"], "fast":["fast","mid","slow"]}
    for b in order[band]:
        if KITS.get(b): return b
    raise SystemExit("no usable kits found in pack")

# ---------------------------------------------------------------- arrangement
def vol(gain, fin=None, fout=None):
    f = [f"volume={gain:.2f}"]
    if fin:  f.append(f"afade=t=in:st={fin[0]:.3f}:d={fin[1]:.3f}")
    if fout: f.append(f"afade=t=out:st={fout[0]:.3f}:d={fout[1]:.3f}")
    return ",".join(f)

def build(jpath, rotor):
    base = os.path.splitext(os.path.basename(jpath))[0]
    j = json.load(open(jpath))
    total, outro, cuts, where, avg, trans = analyze(j)
    band = band_for(base, avg, cuts, trans)
    ov = OVERRIDES.get(base, {})
    if ov.get("band"): band = ov["band"]
    band = has(band)
    if ov.get("kit") and ov["kit"] in FLATKIT: k = FLATKIT[ov["kit"]]
    else: k = KITS[band][rotor[band] % len(KITS[band])]; rotor[band] += 1
    if os.environ.get("ALT_KIT"): k = FLATKIT[os.environ["ALT_KIT"]]

    bar    = k["bar"]
    anchor = trans if trans is not None else (cuts[0] if cuts else round(total*0.3,3))
    S      = (-anchor) % bar                      # phase so a downbeat lands on the cut
    E      = S + total
    of_s   = max(outro - 0.05, total*0.6)
    outro_fade = (of_s, max(total - of_s, 0.6))

    inputs, filt, mix, nin = [], [], [], [0]
    def add(stem, gain, fin=None, fout=None, lbl=""):
        if not stem: return
        i = nin[0]; nin[0] += 1
        inputs.extend(["-stream_loop","-1","-i",stem])
        filt.append(f"[{i}:a]atrim={S:.4f}:{E:.4f},asetpts=PTS-STARTPTS,{vol(gain,fin,fout)}[{lbl}]")
        mix.append(f"[{lbl}]")

    if band == "slow":                                   # sparse, ambient-sax forward
        add(k["bass"], 1.00, fout=outro_fade, lbl="bass")
        if ov.get("piano", True):
            add(k["piano"], ov.get("piano_gain",0.85), fout=outro_fade, lbl="pno")
        if ov.get("sax", True):
            add(k["sax"], 0.72, fin=(bar*0.5,1.2), fout=(max(outro-0.3,0),1.0), lbl="sax")
    elif band == "mid":                                  # bass/piano -> drums on cut -> sax build
        t0 = (bar - (S % bar)) % bar                     # first downbeat in clip time
        dg = ov.get("drums_gain", 0.85)
        drums_in = t0 if ov.get("drums_mode") == "early" else anchor
        sax_opt  = ov.get("sax", True)
        sax_in   = (t0+bar) if sax_opt == "early" else (anchor+bar*2 if sax_opt else None)
        add(k["bass"],  1.00, fout=outro_fade, lbl="bass")
        if ov.get("piano", True): add(k["piano"], ov.get("piano_gain",0.90), fout=outro_fade, lbl="pno")
        if ov.get("drums", True): add(k["drums"], dg, fin=(drums_in,0.15), fout=outro_fade, lbl="drm")
        if sax_in is not None and sax_in < total-0.8:
            add(k["sax"], 0.72, fin=(sax_in,0.6), fout=(max(outro-0.2,0),1.3), lbl="sax")
    else:                                                # fast, energetic
        add(k["bass"],  1.00, fout=outro_fade, lbl="bass")
        add(k["piano"], 0.85, fout=outro_fade, lbl="pno")
        if ov.get("drums", True): add(k["drums"], ov.get("drums_gain",0.92), fin=(min(anchor,bar),0.1), fout=outro_fade, lbl="drm")
        if ov.get("sax", True):   add(k["sax"], 0.80, fin=(anchor+bar,0.4), fout=(max(outro-0.2,0),1.0), lbl="sax")

    if not mix: return None
    final = max(total-0.6, 0)
    filt.append("".join(mix) +
        f"amix=inputs={len(mix)}:normalize=0,loudnorm=I=-14:TP=-1.0:LRA=11,"
        f"afade=t=out:st={final:.3f}:d={total-final:.3f},apad[mix]")

    out_base = base + os.environ.get("ALT_SUFFIX","")
    wav = os.path.join(OUT, f"{out_base} — MUSIC.wav")
    subprocess.run(["ffmpeg","-y","-v","error"] + inputs +
        ["-filter_complex",";".join(filt),"-map","[mix]","-t",f"{total}", wav], check=True)

    vids = glob.glob(os.path.join(CLIPS, f"{base}.mp4")) + glob.glob(os.path.join(CLIPS, f"{base}.aep.mp4"))
    prev = ""
    if vids:                                             # video stream-COPY (no quality loss); audio 48k
        prev = os.path.join(OUT, f"{out_base} — PREVIEW.mp4")
        subprocess.run(["ffmpeg","-y","-v","error","-i",vids[0],"-i",wav,"-map","0:v","-map","1:a",
            "-c:v","copy","-c:a","aac","-b:a","256k","-ar","48000","-movflags","+faststart",
            "-shortest", prev], check=True)
    return {"clip": out_base, "dur": total, "band": band, "kit": k["name"],
            "bpm": k["bpm"], "key": k["key"], "loc": where, "cuts": cuts,
            "anchor": anchor, "sax": bool(k["sax"]), "preview": bool(prev)}

# ---------------------------------------------------------------- driver
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pack", required=True, help="Splice pack directory")
    ap.add_argument("--clips", default=os.getcwd(), help="folder of clip JSON sidecars (default cwd)")
    ap.add_argument("--out", default=None, help="output dir (default <clips>/_previews)")
    ap.add_argument("--glob", default="*.json", help="clip JSON glob (default *.json)")
    ap.add_argument("--scan-only", action="store_true", help="print discovered kits and exit")
    ap.add_argument("subset", nargs="*", help="case-insensitive substrings; only these are (re)built")
    a = ap.parse_args()

    global KITS, FLATKIT, OVERRIDES, CLIPS, OUT
    CLIPS = a.clips
    OUT   = a.out or os.path.join(CLIPS, "_previews")
    os.makedirs(OUT, exist_ok=True)

    found = scan_pack(a.pack)
    KITS = {"slow":[], "mid":[], "fast":[]}
    for k in found: KITS[band_of_bpm(k["bpm"])].append(k)
    FLATKIT = {}
    for k in found:                                  # name (first wins) + unambiguous name@bpm
        FLATKIT.setdefault(k["name"], k)
        FLATKIT[f"{k['name']}@{k['bpm']}"] = k
    if a.scan_only or not found:
        print(f"{len(found)} kits in {os.path.basename(a.pack)}:")
        for b in ("slow","mid","fast"):
            for k in KITS[b]:
                miss = [r for r in ("bass","piano","sax","drums") if not k[r]]
                print(f"  [{b:4}] {k['name'][:22]:22} {k['bpm']:>3} {k['key']:7}"
                      f"  stems:{'+'.join(r for r in ('bass','piano','sax','drums') if k[r])}"
                      f"{'  missing:'+','.join(miss) if miss else ''}")
        if not found: sys.exit("no kits discovered — check pack path/structure")
        return

    ovp = os.path.join(CLIPS, "_music_overrides.json")
    OVERRIDES = json.load(open(ovp)) if os.path.exists(ovp) else {}

    jsons = sorted(p for p in glob.glob(os.path.join(CLIPS, a.glob))
                   if not os.path.basename(p).startswith("._"))
    if a.subset:
        pats = [s.lower() for s in a.subset]
        jsons = [p for p in jsons if any(s in os.path.basename(p).lower() for s in pats)]

    rotor, log = {"slow":0,"mid":0,"fast":0}, []
    for jp in jsons:
        try:
            r = build(jp, rotor)
            if r: log.append(r)
        except subprocess.CalledProcessError as e:
            print(f"FAIL {os.path.basename(jp)}: {e}", file=sys.stderr)

    mpath = os.path.join(OUT, "_manifest.json")
    prev = {r["clip"]: r for r in json.load(open(mpath))} if os.path.exists(mpath) else {}
    for r in log: prev[r["clip"]] = r
    prev = {c: r for c, r in prev.items() if os.path.exists(os.path.join(OUT, f"{c} — MUSIC.wav"))}
    json.dump([prev[c] for c in sorted(prev)], open(mpath,"w"), indent=2)

    print(f"{'CLIP':40} {'BAND':5} {'KIT':18} {'BPM/KEY':11} CUTS")
    for r in log:
        print(f"{r['clip'][:40]:40} {r['band']:5} {r['kit'][:18]:18} "
              f"{str(r['bpm'])+' '+r['key']:11} {len(r['cuts'])}")

if __name__ == "__main__":
    main()
