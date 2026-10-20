"""aectx.phrases — the phrase timeline the CucoStudio director wrote into each text comp.

For a director ARRANGEMENT: per section (shot instance in mainComp order) the textBlock's Source Text
keyframes (time | text | fitted size) and the progress markers ("0" = phrase start … "100").
For a style TEMPLATE: each shot's textBlock sample and size (what the caster reads as capacity).
Source Text values are the RENDERED text (AE returns expression-transformed text; see SCHEMA.md).
"""
import re


def _nm(s):
    return re.sub(r"[\x00-\x1f\x7f]", lambda m: {"\r": " / ", "\n": " / ", "\t": " "}.get(m.group(), "?"), str(s))


def _items(data):
    return [i for i in (data.get("items") or []) if isinstance(i, dict)]


def _folder_ids(items, name):
    return {i.get("id") for i in items if i.get("type") == "folder" and i.get("name") == name}


def _textblock(comp):
    for L in comp.get("layers") or []:
        if isinstance(L, dict) and L.get("name") == "textBlock":
            return L
    return None


def _source_text(L):
    for p in L.get("props") or []:
        if isinstance(p, dict) and str(p.get("mn", "")).endswith("ADBE Text Document"):
            return p
    return None


def _phrase_starts(markers):
    starts, prev = [], 1e9
    for k, m in enumerate(markers or []):
        c = str(m.get("comment", ""))
        try:
            v = float(c)
        except ValueError:
            v = 0.0
        if k == 0 or c == "0" or v < prev:
            starts.append(m.get("t"))
        prev = v
    return starts


def phrases(data, args):
    items = _items(data)
    comps = {i.get("name"): i for i in items if i.get("type") == "comp"}
    comp_rx = getattr(args, "comp", None)
    try:
        rx = re.compile(comp_rx) if comp_rx else None
    except re.error as e:
        return f"phrases: invalid --comp regex {comp_rx!r}: {e}", 2
    out = []
    shown = 0
    if _folder_ids(items, "PROJECT_SHOTS"):
        main = comps.get("mainComp")
        order = []
        if main:
            for L in sorted((l for l in main.get("layers") or [] if isinstance(l, dict)), key=lambda l: l.get("in") or 0):
                src = (L.get("source") or {}).get("name")
                if src in comps and re.match(r"^.+-\d+$", src or ""):
                    order.append((src, L.get("in"), L.get("out")))
        out.append(f"director arrangement: {len(order)} sections (mainComp order)")
        for shot, t_in, t_out in order:
            if rx and not rx.search(shot):
                continue
            shown += 1
            tc = comps.get(f"{shot}-text")
            if not tc:
                out.append(f"== {shot}  {t_in:.2f}-{t_out:.2f}s  (no {shot}-text comp)")
                continue
            tb = _textblock(tc)
            st = _source_text(tb) if tb else None
            keys = (st or {}).get("k") or []
            starts = _phrase_starts(tc.get("markers"))
            sizes = sorted({(k[1] or {}).get("size") for k in keys if isinstance(k[1], dict) and k[1].get("size")})
            size = f"{sizes[0]:g}pt" if len(sizes) == 1 else (f"{sizes[0]:g}-{sizes[-1]:g}pt" if sizes else "?pt")
            out.append(f"== {shot}  {t_in:.2f}-{t_out:.2f}s  {len(keys) or (1 if st else 0)} phrase(s) @ {size}  "
                       f"({len(tc.get('markers') or [])} markers, {len(starts)} phrase starts)")
            if keys:
                for k in keys:
                    v = k[1] if isinstance(k[1], dict) else {}
                    out.append(f"   {k[0]:7.3f}s  {_nm(v.get('text', ''))}")
            elif st and isinstance(st.get("v"), dict):
                out.append(f"   (static)  {_nm(st['v'].get('text', ''))}")
        if not order:
            out.append("(mainComp has no section layers)")
    else:
        shots_f = _folder_ids(items, "ORIGINAL_SHOTS")
        shots = sorted(i.get("name") for i in items if i.get("type") == "comp" and i.get("folder") in shots_f)
        out.append(f"style template: {len(shots)} shots — textBlock samples (caster capacity = sample length)")
        for s in shots:
            if rx and not rx.search(s):
                continue
            shown += 1
            tc = comps.get(f"{s}-text")
            tb = _textblock(tc) if tc else None
            st = _source_text(tb) if tb else None
            v = (st or {}).get("v") if st else None
            if not isinstance(v, dict):
                out.append(f"{s}: no textBlock")
                continue
            text = v.get("text", "")
            out.append(f"{s}: {len(text.replace(chr(13), ' '))} chars @ {v.get('size', '?')}pt  \"{_nm(text)}\"")
        out.append("note: in templates the director rewrites these per section; see an arrangement for real phrases")
    if rx and not shown:
        return f"phrases: no section/shot matches --comp {comp_rx!r}", 2
    return "\n".join(out), 0
