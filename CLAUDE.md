# cuco-studio

Claude Code plugin with the CucoStudio agent skills. **This repo is the source of truth**
for them (it replaced `~/gits/cucostudio/skills`).

## Skills

| Skill | What it does |
|---|---|
| `cuco-studio` | Make videos with the cuco CLI: storyboard → project → arrangement → render; three.js explainer template |
| `create-style` | Create a style (video design system) from a URL / images / described aesthetic; routes to AE / WebGFX / Blender |
| `ae-context` | Inspect and verify the running After Effects project with the `aectx` CLI |
| `ae-shape-animation` | After Effects shape-layer animation craft via ExtendScript |
| `shot-edits` | Assemble micro social edits from filmed shots + enriched descriptions |
| `source-visuals` | Per-section asset sets for a script (lupa vault vs web search) |
| `splice-music` | Music beds for clips from Splice sample packs |

## Rules for editing skills

- Never hardcode `~/.claude/skills/<name>/…`. In `SKILL.md` use `${CLAUDE_SKILL_DIR}/…`
  (Claude Code substitutes it). In other markdown files, use a placeholder defined in `SKILL.md`
  (see `$CUCO_SKILL` in `cuco-studio`). Scripts locate themselves via `__file__` / `$0`.
- Bump `version` in `.claude-plugin/plugin.json` **and** `marketplace.json` when releasing.

## Local dev (author's machine)

`~/.claude/skills/<name>` are symlinks into `skills/<name>` here, so edits are live.
Don't also install the plugin on this machine, or every skill shows up twice.

**Arrangement = version.** Each arrangement is immutable. Different style = new arrangement.
