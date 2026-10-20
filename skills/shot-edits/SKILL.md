---
name: shot-edits
description: Use when you have a folder of filmed shots/clips plus per-shot text descriptions (flat timeline + enriched VLM scene/events JSON) and want to assemble short micro social edits from them with CucoStudio — surveying the archive, pairing shots into 2–5 shot sequences by narrative/eyeline/juxtaposition logic, optionally shaving clips with ffmpeg, and rendering in a chosen style. Triggers: "edit micro clips from these shots", "cut socials from the footage", "pair these shots", "make edits from the enriched descriptions".
---

# Shot-Archive → Micro Edits

Turn a big archive of described shots into short, punchy social edits rendered by CucoStudio.

## The shape of the work

You are given:
- **Original shots** — a folder of camera files (`.mov`/`.mp4`, often large ProRes).
- **Proxies + descriptions** — usually a sibling `mp4/` folder with a small proxy per shot and TWO text files each:
  - `<name>.txt` — flat VLM result: `{"scene": "...", "events": [{start,end,description}], ...}`
  - `<name>_enriched.txt` — same, enriched (named subjects, richer wording). **Plan from the enriched files.**
- **CucoStudio** — the render engine, driven by the `cuco` CLI (see the `cuco-studio` skill for primitives).

You produce: one CucoStudio project per edit, each a sequence of shots, rendered in a chosen style.

## Workflow

1. **Survey the archive.** Run `scripts/index_shots.py <enriched_dir>` to get a compact catalog: each shot's code, duration (last event `end`), and a one-line scene. Read it and name the **recurring threads** — subjects, locations, motifs, prop/brand cues. Use `--events <CODE...>` to pull full beat lists for shortlisted shots.

2. **Plan the edits — this is the real skill.** Pair/sequence shots by *meaning*, not visual similarity:
   - **Cause & effect / eyeline**: someone acts → the result; a shooter raises a camera → cut to their subject (often a reverse angle / POV).
   - **Juxtaposition**: young↔old, studio↔street, stillness↔motion, one↔crowd, prep↔performance, detail↔wide.
   - **Escalation**: a count or energy that grows across shots (5→10→12 people; pose→motion; surface→surface).
   - 2 shots to start; go 3–5 for richer cuts. Vary rhythm — mix short beats with a longer hold.
   - Confirm direction with the user before mass-rendering; show the plan as a table (edit name · shot codes · the logic).

3. **Pick windows (when shaving).** For each shot choose the single punchiest ~1–2.5s beat from its `events`. Motion shots can go snappier (~1.2s); portraits/dance can breathe. Skip this step to use whole clips.

4. **Assemble + render.** Write an edits spec (see `reference/example_spec.json`) and run `scripts/assemble.py spec.json`. It resolves the style by name, optionally trims, copies media into each project, builds the storyboard, creates the arrangement, renders, and (by default) opens each result.

5. **Review & iterate.** Open results, get feedback, nudge individual in-points (just a number per shot) or swap shots. Keep prior arrangements for A/B — never overwrite to compare versions.

## CucoStudio recipe (per edit)

- **One shot per section.** Section `text` is **empty**, `origin` is **`"video"`**.
- Many brand styles place a **logo on an empty trailing section** — so leave a final empty section (`origin:"empty"`) for the logo to pop. (This is how the `Pk-clean` style works.)
- Pipeline per project: `project create` → put media in `attached_media/` → write `storyboard.json` → `storyboard update` → `arrangement create --patch-json '{"style_id":N}'` → `arrangement process --render --style-id=N --wait`. Output: `projects/<pid>/arrangements/<aid>/video.mp4`. `assemble.py` does all of this.

## Trimming (until the app has native in/out)

The storyboard has **no per-section in/out points yet**. To tighten, pre-trim the source with ffmpeg:
- **ProRes (and other all-intra codecs) → `ffmpeg -ss <in> -i src -t <dur> -c copy` is frame-accurate AND lossless** (no re-encode). Verify the source is intra (`ffprobe ... codec_name` = prores/dnxhd/etc.); for long-GOP codecs (h264/h265) `-c copy` only cuts on keyframes, so re-encode that segment instead.
- Choose the window from the shot's enriched `events`.
- When the app gains in/out points, drop trimming and set them natively — the plan (which shots, which windows) carries over unchanged.

### Where shaved clips live — `<source_dir>/subclips/`

Subclips are a **first-class, organized store beside the originals**, NOT scattered in project folders. `assemble.py` writes each trim once to `<source_dir>/subclips/` (override via spec `subclips_dir`) and **reuses** it on later runs (same `in`/`dur` → same filename `<name>_t<in>_<dur>.mov` → no re-trim). It then copies that subclip into the project's `attached_media/` purely as the app's render-time working copy (disposable; the canonical copy is the one in `subclips/`). This keeps everything findable in one place and makes runs idempotent.

## Gotchas (learned the hard way)

- The installed `cuco` binary can be **stale** and fail to parse the app config (`missing required key 'fastapi'`). `assemble.py` auto-falls back to the `cuco-cli` poetry venv; or set `CUCO_BIN`. The app must be running (FastAPI health on :8000).
- `cuco files copy-local` **refuses sources outside allowed dirs** (e.g. external volumes) — so the scripts `cp` directly into `projects/<id>/attached_media/` and hash with `shasum`.
- Section `origin` must be one of `audio|video|text|empty` — **not** `"media"` (422 otherwise).
- Media entry: `{filePath:"projects/<id>/attached_media/<file>", fileHash, originalName, fileSize, mimeType}`.

## Scripts

- `scripts/index_shots.py <enriched_dir> [--events CODE ...] [--full] [--sort dur]` — catalog the archive.
- `scripts/assemble.py <spec.json> [--no-open] [--dry-run]` — trim/build/render every edit in the spec.
