# Cuco's real section timing -> script/timing.json, so each clip lines up with its section.
# A section starts `off` s before its narration audio (the style's intro/transition) and lasts `len` s;
# render.mjs holds the first frame for `off`, then plays, for len + PAD seconds.
#   python3 script/timing.py <PROJECT_ID> <ARRANGEMENT_ID>
# Needs a processed arrangement (`cuco arrangement process <PID> <AID> --no-render` is enough).
import json, os, sys
pid, aid = sys.argv[1], sys.argv[2]
sp = json.load(open(os.path.expanduser(f'~/Library/Application Support/CucoStudio/projects/{pid}/arrangements/{aid}/screenplay.json')))
D = json.load(open('script/durations.json'))
if len(sp['sections']) != len(D):
    sys.exit(f"screenplay has {len(sp['sections'])} sections, durations.json has {len(D)} beats")
acc, out = 0, {}
for s, (b, d) in zip(sp['sections'], D.items()):
    out[b] = {'off': round(acc - s['section_in'], 3), 'len': round(s['duration'], 3)}
    acc += d
json.dump(out, open('script/timing.json', 'w'), indent=0)
print({b: v['off'] for b, v in out.items()})
