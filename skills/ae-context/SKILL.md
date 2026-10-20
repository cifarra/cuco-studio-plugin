---
name: ae-context
description: Inspect and verify the running After Effects project with the `aectx` CLI (formerly contexter_ae). Use for ANY After Effects inspection or debugging — what's in the project, layer trees, expression errors (and repairing them), a property's value at time t across layers, which shots use the trinity/palette controls, CucoStudio style-contract validation, director-built render projects (phrase timeline), PNG frames + contact sheets, and one-off ExtendScript snippets. Triggers — "ae-context", "contexter", "what's in this AE project", "inspect the aep", "expression errors", "why does this layer…", "value at frame", "validate the style", "check the style contract", "how did the director build it", "render frames to look at". Read BEFORE writing any probe .jsx, find() helper, or osascript/DoScript call — use `aectx q` instead.
---

# ae-context — `aectx`

One CLI for looking inside After Effects. It replaces hand-written probe scripts:
in the Steel style session the assistant wrote 21 throwaway `.jsx` probes (13 with the same
pasted `find()`), several of which failed on ExtendScript gotchas this tool now handles for you.

```
aectx = ${CLAUDE_SKILL_DIR}/bin/aectx      (optionally symlink it onto PATH, e.g. ~/.local/bin/aectx)
```

## Rule: never write a standalone probe
Ask the question with a command below. If none fits, use `aectx q '<ES3 snippet>'` (helpers
preloaded, ES3-linted, errors reported with line numbers). Only drop to `aectx run file.jsx` for
multi-step scripts. Don't call `osascript … DoScript` yourself.

## Question → command

| You want to know… | Command |
|---|---|
| Is AE running, what's open, unsaved changes, is CucoStudio rendering? | `aectx status` |
| Snapshot the project for the offline views (do this first, re-do after edits) | `aectx extract` (`--at T`, `--post`, `--comps RX`) |
| One-screen summary: kind, trinity, palette hex, shots, fonts, health | `aectx overview` |
| Layer structure of a comp (parents, mattes, fx, masks, expr/error counts) | `aectx tree --comp RX` (`--all` every comp, `--full` no "same as X" deltas) |
| Which expressions are broken / disabled? | `aectx exprs --errors` (live fix: `aectx repair-expressions --yes`) |
| What expression families exist, where are they used? | `aectx exprs` · one in full: `aectx exprs --show E1a2b3` |
| Who references `mainControl` / `FORM` / a layer name? | `aectx exprs --refs NAME` |
| Which shots actually use FORM/FLOW/PRESSURE, palette 1/2/3, enter/exit? | `aectx wiring` · which props: `aectx wiring --control PRESSURE --comp '^02$'` |
| How did the director lay out the phrases? (per section: timing, fitted size, each phrase as rendered) | `aectx phrases [--comp RX]` |
| Will CucoStudio accept this style? (GET_STYLE_DATA + director + learned rules) | `aectx validate` (exit 1 on BLOCK) |
| Value of a property at times t across layers (pre/post expression) | `aectx eval --comp C --layers RX --prop 'Transform/Position' --t 0,0.5,2 [--pre]` |
| Look at it | `aectx frames --comp C --t 0.4,1,2 --sheet` then Read the sheet.png |
| Anything else (one-off) | `aectx q 'var c = AECTX.comp("01"); return c.numLayers;'` |

Offline views (`overview tree exprs wiring validate phrases`) read the latest extraction, never AE. Each
prints `[dump: name, extracted Nm ago]` and warns when the .aep was saved after it — re-run
`aectx extract` then. Use `--file DUMP.json[.gz]` for another dump (fixtures in `tests/fixtures/`).

Property paths (`--prop`, `AECTX.prop`) use display names or matchNames joined by `/`:
`Transform/Position`, `Masks/Mask 1/Mask Path`, `Effects/lock glint/Center`,
`ADBE Effect Parade/ADBE Fill/ADBE Fill-0002`. A numeric segment first matches a property NAMED that
(`Effects/2/Color` is palette color "2"), else it is a 1-based index; `Name#2` picks the 2nd sibling
with that name/matchName (`Effects/ADBE Color Control#1/Color`).
Regexes: `--comps`/`--layers` on live commands are JavaScript regexes; `--comp` on offline views is Python `re`.

## Safety (built in — don't work around it)
- Targets the RUNNING AE process (detected with `ps`); never launches or activates AE. With several
  versions running, pass `--ae 'Adobe After Effects 2025'`.
- Never saves, never purges caches, suppresses dialogs. `repair-expressions --yes` changes the project in
  one undo step and leaves it unsaved — say so to the user.
- One job at a time (file lock), so parallel agents can't interleave DoScript calls.
- Refuses while CucoStudio is building a render (`ae-build.log` active) — exit 3; `--force` overrides.
- A job that times out leaves a pending marker; later calls wait for it instead of piling up. Heavy
  comps: raise `--timeout` (frames can take minutes; `frames` waits until each PNG is complete).
- Options travel in `$.global.__aectx` and are deleted afterwards; `run` scripts and `q` snippets are wrapped
  in a function so their `var`s don't persist. The `AECTX` namespace and an `aeWrite` shim (for old ae-run.sh
  probes) do stay in AE's engine — they're reinstalled on every job, so never rely on them outside aectx.
- Switching projects is NOT a built-in yet. If you must, guard it: refuse when `app.project.dirty`, wrap in
  try/finally, and reopen the original. Never `app.project.save()` an untitled project with dialogs
  suppressed — it silently writes `Untitled Project.aep` into the last folder (this broke a style folder once).
- Never open a CucoStudio arrangement while a render is running, and never save one.

## Output budget
Stdout is capped near 25k chars; longer output spills to `~/.cache/aectx/out/…txt` with a note. The raw
dump is 2–3 MB (~600k–900k tokens) — never Read it whole; use the views or `eval`/`q`.

## Writing snippets (`q` / `run`) — the AECTX helpers
`return x` in `q` prints `x` (objects as JSON). In `run`, call `AECTX.out(line)` / `AECTX.result(obj)`.
- Lookup: `AECTX.comp(name)`, `AECTX.comps(regex)`, `AECTX.layer(comp, nameOrIdx)`, `AECTX.layers(comp, regex)`,
  `AECTX.prop(layer, "Transform/Position")`, `AECTX.walkProps(group, fn(prop, namePath, mnPath))`.
- Values: `AECTX.value(prop, t, pre)` (JSON-safe, incl. TextDocument/Shape; PRE-expression unless you pass
  `pre === false`), `AECTX.exprState(prop, t)`
  → `{x, on, err}` (forces evaluation so `expressionError` is filled), `AECTX.fmt(v)`, `AECTX.hex([r,g,b])`,
  `AECTX.textDoc(td)`, `AECTX.enumName(BlendingMode, code)` (labels read from the live enums).
- I/O: `AECTX.args` (from `--args '{"k":1}'`), `AECTX.out`, `AECTX.result`, `AECTX.write(path, text)`, `AECTX.warn`.

ES3 only — the linter blocks `let/const`, arrows, template literals and unparenthesized nested ternaries
(ExtendScript mis-evaluates `a ? b : c ? d : e`), and warns on `forEach/map/filter`, `JSON.*`.
Other traps the helpers already absorb: concatenating host arrays into strings throws "invalid numeric
result" (use `AECTX.fmt`); big single `File.write` can land 0 bytes (`AECTX.write` slices); set file
encoding before `open`; AE's `seedRandom`/`random()` is salted per layer — shared geometry needs a hash;
Source Text read back is the expression-transformed text (raw is unrecoverable while the expression is on).

## Dump format
See `SCHEMA.md` (schema `aectx/2`): items, layers (ids, parent/matte refs by name, effects, masks,
markers) and one record per touched property — value at `meta.at`, keyframes WITH values, expression,
`xOn:false` when disabled, `xErr` when broken.

## Tests
`cd ${CLAUDE_SKILL_DIR} && python3 -m unittest discover -s tests -v` (offline, uses the fixtures).
