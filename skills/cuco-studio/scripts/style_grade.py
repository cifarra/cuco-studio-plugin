#!/usr/bin/env python3
"""Grade generated media into a style's palette, so every shot lives in the style's world.

  style_grade.py <STYLE_ID> in.mp4|png out.mp4|png [--mix 0.72] [--floor 0.36] [--shadow HEX --mid HEX --hi HEX]
  style_grade.py <STYLE_ID> --sample in.png out.png      # quick look on one frame

Why: text-to-video/image models (H3, Krea, LTX) largely ignore grading words like "periwinkle grade,
lifted blacks". Prompting gets composition and content; this gets color. It gradient-maps luminance
onto three stops taken from the style palette (shadow -> mid -> highlight), blends that over the source
(--mix; lower keeps more original color), adds a soft bloom and fine grain, and (--floor) darkens the
bottom quarter slightly with a deep palette tone so the style's captions stay readable on pale frames.

Stops default from the palette: highlight = lightest color, mid = the most saturated remaining color,
shadow = mid at ~62% lightness (same hue and saturation). Check the result against style_brief/poster_sheet.jpg by sampling pixels,
not by eye alone: tuned on Inefable (54), a gray->rgb lutrgb blend had to run in gbrp or the channels
swapped and everything went lilac.
"""
import argparse, colorsys, json, os, subprocess, sys, tempfile


def hex2rgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def stops(palette):
    cols = [hex2rgb(c) for c in palette]
    lum = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    hi = max(cols, key=lum)
    rest = [c for c in cols if c != hi] or [hi]
    mid = max(rest, key=lambda c: colorsys.rgb_to_hls(*[x / 255 for x in c])[2] * (1 - abs(lum(c) / 255 - 0.55)))
    h, l, sat = colorsys.rgb_to_hls(*[x / 255 for x in mid])
    shadow = tuple(int(x * 255) for x in colorsys.hls_to_rgb(h, l * 0.62, sat))  # darker, same hue + saturation
    return shadow, mid, hi


def lut(shadow, mid, hi, k=105):
    ch = []
    for i, n in enumerate('rgb'):
        s, m, h = shadow[i], mid[i], hi[i]
        ch.append(f"{n}='if(lt(val,{k}),{s}+({m}-{s})*val/{k},{m}+({h}-{m})*(val-{k})/{255 - k})'")
    return "format=gray,format=rgb24,lutrgb=" + ":".join(ch)


def floor_png(shadow, strength, path):
    from PIL import Image
    W, H = 1440, 1080
    col = Image.new('RGBA', (W, H)); px = col.load()
    for y in range(H):
        t = max(0.0, (y / H - 0.62) / 0.38); a = int(255 * strength * (t ** 1.4))
        for x in range(W): px[x, y] = (*shadow, a)
    col.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('style'); ap.add_argument('inp'); ap.add_argument('out')
    ap.add_argument('--mix', type=float, default=0.72); ap.add_argument('--floor', type=float, default=0.36)
    ap.add_argument('--shadow'); ap.add_argument('--mid'); ap.add_argument('--hi'); ap.add_argument('--sample', action='store_true')
    a = ap.parse_args()
    pal = json.loads(subprocess.check_output(['cuco', '--json', 'style', 'get', a.style]))['data'].get('color_palette') or []
    if len(set(pal)) < 2 and not (a.mid and a.hi):
        sys.exit('palette is a placeholder — pass --shadow/--mid/--hi sampled from the poster')
    sh, mid, hi = stops(pal) if pal else (None, None, None)
    sh = hex2rgb(a.shadow) if a.shadow else sh; mid = hex2rgb(a.mid) if a.mid else mid; hi = hex2rgb(a.hi) if a.hi else hi
    fl = os.path.join(tempfile.gettempdir(), f'style_floor_{a.style}_{a.floor}.png')
    if not os.path.exists(fl): floor_png(tuple(int(x * 0.5) for x in mid), a.floor, fl)
    fc = (f"[0:v]eq=contrast=0.85:brightness=0.05,format=gbrp,split=2[o][m];[m]{lut(sh, mid, hi)},format=gbrp[gm];"
          f"[gm][o]blend=all_mode=normal:all_opacity={a.mix},split=2[a][b];[b]gblur=sigma=18[g];"
          f"[a][g]blend=all_mode=screen:all_opacity=0.2[lit];[1:v][lit]scale2ref[fl][base];"
          f"[base][fl]overlay=format=auto,noise=alls=5:allf=t,format=yuv420p[out]")
    if a.out.endswith('.mp4'):
        cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', a.inp, '-loop', '1', '-i', fl, '-filter_complex', fc,
               '-map', '[out]', '-map', '0:a?', '-shortest', '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-c:a', 'copy', a.out]
    else:
        cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', a.inp, '-i', fl, '-filter_complex', fc, '-map', '[out]', '-frames:v', '1', a.out]
    subprocess.run(cmd, check=True)
    print(f'graded {a.out}  stops shadow={sh} mid={mid} hi={hi} mix={a.mix} floor={a.floor}')


if __name__ == '__main__':
    main()
