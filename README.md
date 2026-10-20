# cuco-studio-plugin

Claude Code plugin with the CucoStudio agent skills: making videos with the cuco CLI,
creating styles, After Effects craft and inspection, shot edits, visual sourcing and music beds.

## Install

```bash
claude plugin marketplace add cifarra/cuco-studio-plugin
claude plugin install cuco-studio@cuco-studio
```

Skills are namespaced, e.g. `/cuco-studio:create-style`, `/cuco-studio:ae-context`.

## Skills

| Skill | What it does |
|---|---|
| `cuco-studio` | Storyboard → project → arrangement → render; three.js explainer template |
| `create-style` | Turn a URL / images / aesthetic into a CucoStudio style (AE / WebGFX / Blender) |
| `ae-context` | `aectx` CLI: inspect layers, expressions, values at time, validate style contracts, render frames |
| `ae-shape-animation` | Shape-layer animation in a running After Effects via ExtendScript |
| `shot-edits` | Pair filmed shots into 2–5 shot micro edits and render them |
| `source-visuals` | Route each script section to the image vault or the web; emits `manifest.json` |
| `splice-music` | Loop Splice packs into music beds aligned to edit cuts |

## Requirements

- macOS with the CucoStudio app and `cuco` CLI
- Adobe After Effects for the `ae-*` skills and AE styles
- Python 3, ffmpeg, Node (three.js explainer template)
- Some features call other skills installed separately: `elevenlabs` (narration and brand
  voice in `cuco-studio`) and `lupa` (`source-visuals`)

## Key Concept

**Arrangement = version.** Immutable. Different style = new arrangement.

## Quick Start

```bash
cuco project create --name "My Video"
# Copy media to ~/Library/Application Support/CucoStudio/projects/{id}/attached_media/
cuco storyboard update {id} --file storyboard.json
cuco arrangement create {id} --patch-json '{"style_id": 7}'
cuco arrangement process {id} {arr_id} --render --style-id=7 --wait
```

Output: `~/Library/Application Support/CucoStudio/projects/{id}/arrangements/{arr_id}/video.mp4`
