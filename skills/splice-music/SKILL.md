---
name: splice-music
description: Use when you have a folder of clip JSON sidecars (from the shot-edits / After Effects export) plus a Splice sample pack, and want to create per-clip music beds — decoding the pack's filenames for BPM/key/instrument, grouping construction kits, aligning the drum drop to a real edit cut, and rendering looped jazz/score arrangements with ffmpeg. Triggers: "score these clips", "make music from this splice pack", "create soundtracks for the edits", "add music beds to the micro-clips", "another take on the music", "this one's too fast/aggressive/sparse".
---

# Splice-Pack → Per-Clip Music Beds

Score a folder of short edits using **only what a Splice pack's filenames + folder
structure encode**. No DAW. The pack is self-describing; the engine reads it and
arranges. This is the downstream partner of `shot-edits` (which produces the clips
and their JSON sidecars).

## Why this works (the core insight)

Splice "Signature" packs name every file `SIG_<X>_<BPM>_<role>_<song>_<key>[_alt]`
and group melodic stems by construction kit in folders. That encodes everything
needed to make coherent music:

- **BPM** = the number → bar length = `4*60/bpm`. Every loop is a clean integer
  number of 4/4 bars, so you can loop/cut **bar-accurately** with no drift.
- **Key** = `C#maj`, `Ebmin` … → harmonic compatibility.
- **Role** = `upright_bass`, `upright_piano`, `sax_lead_ambient`, `drum_kit`, plus
  pre-mixed `music_loop` / `songstarter` beds.
- **Song name** (`lilfelony`, `midnightinbrooklyn` …) = the construction-kit id.
  Files sharing it are stems recorded to play together (same BPM + key).

So a "kit" = bass + piano + sax + a matching drum loop, all phase- and key-locked.

## Inputs

1. **A Splice pack dir**, e.g. `/Users/ale/Splice/sounds/packs/<Pack>`. One pack per
   brand keeps a series coherent.
2. **A folder of clip JSON sidecars** (one per edit), as produced by `shot-edits` /
   the AE export. Expected shape:
   ```
   { "duration": 13.833, "fps": 24,
     "shots": [ { "start": 0, "end": 3.208, "duration": 3.208,
                  "clips": ["...","ProKeds_logo.png"],
                  "clip_descriptions": [ null, {"scene":"...studio...","events":[...]} ] },
                ... ] }
   ```
   The engine reads: total `duration`; each shot's `start` (= hard-cut timestamps);
   `scene` text per shot (studio vs street → energy + later ambience); a shot whose
   `clips` mention `logo` = the outro (music resolves there). Rendered `<clip>.mp4`
   (or `<clip>.aep.mp4`) next to the JSON is optional — used only to mux a preview.

## How it arranges

1. **Discover kits** — `scan_pack()` walks the pack, parses BPM/key/role/song from
   filenames, groups stems per Melodic_Loops folder, attaches the matching drum loop.
2. **Read each clip** — duration, cut timestamps, per-shot location, logo outro.
3. **Pick energy band** from the `·tight` tag + cut density + avg shot length:
   `slow` (<100 bpm feel, sparse), `mid` (drop-driven), `fast` (energetic). A
   studio↔street location change forces `mid` with the drop on that transition.
4. **Pick a kit** in that band (rotated for variety; or pinned via overrides).
5. **Phase-align**: seek `S = (-cut) % bar` into the loop so a **downbeat lands on
   the first cut** — the drop hits the picture. (`-stream_loop -1` + `atrim` window;
   no time-stretch, so pitch is untouched.)
6. **Arc per band** (volume-automated stems):
   - `slow`  → bass + piano + ambient sax, **no drums**. (Drop piano via override for
     a noir bass+sax bed.)
   - `mid`   → bass+piano open → drums in on the cut → sax builds → resolve on logo.
   - `fast`  → drums early, sax accents, hits on cuts.
7. **Master + render** — `amix` (normalize=0) → `loudnorm I=-14` → end fade. Output
   `<clip> — MUSIC.wav`. If a video exists, mux `<clip> — PREVIEW.mp4` with the
   **video stream-COPIED** (zero quality loss) and audio AAC 256k @ 48 kHz +faststart.

## Run it

```bash
PACK="/Users/ale/Splice/sounds/packs/Journeys - Bebop Jazz"

# inspect what the pack offers (always do this first on a new pack):
python3 ${CLAUDE_SKILL_DIR}/make_music.py --pack "$PACK" --scan-only

# score every clip in the current folder -> ./_previews/
python3 ${CLAUDE_SKILL_DIR}/make_music.py --pack "$PACK" --clips "$PWD"

# re-score only some clips (case-insensitive substrings):
python3 ${CLAUDE_SKILL_DIR}/make_music.py --pack "$PACK" "skate" "a kiss"
```

Outputs land in `<clips>/_previews/` with a `_manifest.json` of every decision
(band/kit/bpm/key/cuts). Subset runs merge into the manifest, leaving others intact.

## Iterating on taste (this is most of the real work)

The auto-pick is a starting point. Per-clip taste lives in
**`<clips>/_music_overrides.json`** — a map of `clip base name → override`. Re-run
the subset to apply. Override keys:

| key | meaning |
|-----|---------|
| `band` | force `slow`/`mid`/`fast` (changes the arc) |
| `kit`  | pin a kit by `name` or `name@bpm` (e.g. `fruitcake@94`) |
| `drums_gain` | 0–1; drop to ~0.4 for a soft brushed pulse, raise to ~0.9 for drive |
| `drums_mode` | `cut` (drop on the cut) or `early` (groove from the first downbeat — better for short clips) |
| `drums` | `false` to remove drums entirely |
| `piano` / `piano_gain` | `false` drops the comping (kills any "carnival" bounce); or set a low gain |
| `sax` | `true` / `false` / `"early"` |

Quick **A/B takes** without overwriting a keeper — env vars add an alt kit + suffix:
```bash
ALT_KIT="bridgetobounce" ALT_SUFFIX=" — take2 (Gmin)" \
  python3 ${CLAUDE_SKILL_DIR}/make_music.py --pack "$PACK" "through the lens"
```
Delete the rejected take's files; the manifest self-prunes on the next run.

### Reading the user's feedback → which knob
- "too fast" → pin a lower-BPM kit (`kit`), or move drums to `early`/off.
- "too aggressive / busy" → lower `drums_gain`, or `drums:false`.
- "sounds like a carnival / too jaunty" → `piano:false` (the comping is the culprit).
- "too empty / sparse" → bump band to `mid`, or add piano/drums back low.
- "moodier" → a **minor-key** kit (check `--scan-only` for `min` keys); sax forward.
- "more like <clip X>" → copy clip X's kit + band from `_manifest.json`.

## Gotchas / lessons baked in
- **Video is never re-encoded** — previews are `-c:v copy`, bit-identical to the AE
  render (verify with `ffmpeg -i in -map 0:v -c copy -f md5 -`).
- `loudnorm` resamples to 192 kHz and shaves ≤2 frames of tail; harmless (lands in the
  end fade). The preview mux conforms audio to **48 kHz** to match camera originals.
- Clips with **no rendered mp4** still get a MUSIC.wav (no preview) — re-export the
  video and re-run that one to mux.
- Ignore macOS `._`-prefixed sidecar files (resource forks) — the engine already skips
  them; don't deliver them.

## Downstream: the final mix (not this engine's job)
This skill makes the **music** layer only. The deliverable usually also wants the
clip's **camera scratch** kept low under the music, plus **location ambience**
(city / studio) crossfaded at the scene changes (the engine already detects those
transition timestamps — see `_manifest.json` `loc`/`anchor`). Do that final mux as a
separate ffmpeg pass (still `-c:v copy`), layering: ambience bed + ducked scratch +
the MUSIC.wav. Keep music-only previews for approval; build the final mix once the
ambience files are in hand.
