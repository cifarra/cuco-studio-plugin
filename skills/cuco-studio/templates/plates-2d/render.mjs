// Render 2D plate beats to clips (or stills) with headless Chromium.
//   node render.mjs --beats=all|b01,b02 [--workers=3] [--pr=2]
//   node render.mjs --beats=all --stills=0.2,0.6,0.97      # review stills -> stills/<beat>_<t>.png
//   node render.mjs --seams                                # continuity check -> seams/ (see below)
// Durations come from script/durations.json ({"b01": 9.81, ...}, seconds of narration per beat).
// Each clip = duration + PAD seconds (the tail covers the style's section transition).
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const args = Object.fromEntries(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const THEME = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/theme.json'), 'utf8'));
// Clip canvas = the style's media-slot aspect (theme.json, from style_brief.py --apply).
// script/sizes.json {"b03": [1080, 1080]} overrides per beat when a style has several slot shapes.
const SIZES = fs.existsSync(path.join(ROOT, 'script/sizes.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'script/sizes.json'), 'utf8')) : {};
const FPS = +(args.fps || 24), PAD = 0.9, W = +(args.w || THEME.width || 1620), H = +(args.h || THEME.height || 1080);
const DUR = JSON.parse(fs.readFileSync(path.join(ROOT, 'script/durations.json'), 'utf8'));
// Cuco's real section timing (from screenplay.json): a section starts `off` s before its narration audio
// and lasts `len` s. Clips hold their first frame for `off`, then play; length = len + PAD.
const TIMING = fs.existsSync(path.join(ROOT, 'script/timing.json')) && !args.notiming ? JSON.parse(fs.readFileSync(path.join(ROOT, 'script/timing.json'), 'utf8')) : {};
const OUTDIR = args.out || 'clips';
const beats = (!args.beats || args.beats === 'all') ? Object.keys(DUR) : String(args.beats).split(',');
const workers = +(args.workers || 3), PR = +(args.pr || 2);
const stills = args.stills ? String(args.stills).split(',').map(Number) : null;
const seams = !!args.seams;
const PORT = 8700 + Math.floor(Math.random() * 200);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(data);
  });
}).listen(PORT);

// Metal ANGLE = real GPU in headless mode on macOS (~50 fps at 1620x1080 @2x).
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const d of [OUTDIR, 'stills', 'seams']) fs.mkdirSync(path.join(ROOT, d), { recursive: true });
let failed = false;

async function renderBeat(page, id) {
  const dur = DUR[id];
  const [w, h] = SIZES[id] || [W, H];
  await page.setViewportSize({ width: w, height: h });
  const off = TIMING[id]?.off || 0;
  await page.goto(`http://localhost:${PORT}/web/index.html?beat=${id}&dur=${dur}&pr=${PR}&w=${w}&h=${h}&off=${off}`);
  await page.waitForFunction(() => window.READY === true, null, { timeout: 120000 });
  if (seams) {   // first frame + last frame of the clip (the tail included), for the seam checker
    for (const [tag, t] of [['in', 0], ['out', dur + PAD - 1 / FPS]]) {
      const pose = await page.evaluate(t => window.__seam(t), t);
      fs.writeFileSync(path.join(ROOT, 'seams', `${id}_${tag}.json`), JSON.stringify(pose));
      const url = await page.evaluate(t => window.renderAt(t, 'image/png'), t);
      fs.writeFileSync(path.join(ROOT, 'seams', `${id}_${tag}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    return;
  }
  if (stills) {
    for (const f of stills) {
      const url = await page.evaluate(t => window.renderAt(t, 'image/png'), f * dur);
      fs.writeFileSync(path.join(ROOT, 'stills', `${id}_${String(f).replace('.', '')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    return;
  }
  const N = Math.ceil(((TIMING[id]?.len ?? dur) + PAD) * FPS);
  const ff = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '15', '-preset', 'medium', '-movflags', '+faststart',
    path.join(ROOT, OUTDIR, `${id}.mp4`)], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = 0; f < N; f++) {
    const url = await page.evaluate(t => window.renderAt(t, 'image/jpeg', 0.95), f / FPS);
    if (!ff.stdin.write(Buffer.from(url.split(',')[1], 'base64'))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise(r => ff.on('close', r));
  console.log(`${id}: ${N} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

const queue = [...beats];
await Promise.all(Array.from({ length: Math.min(workers, queue.length) }, async () => {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', e => { failed = true; console.log('PAGEERR', e.message); });
  page.on('console', m => { if (m.type() === 'error') console.log('PAGE', m.text()); });
  while (queue.length) { const id = queue.shift(); await renderBeat(page, id); }
  await page.close();
}));
await browser.close();
server.close();

// Seam report: every section boundary is a CUT. A jump cut = A's last frame and B's first frame show
// nearly the same picture (same subject, similar size/angle). Each seam must change shot size
// (framed width ratio >= 2), angle (>= 30°) or subject/scene. See references/generated-animation.md 2b.
if (seams) {
  const { execFileSync } = await import('node:child_process');
  const ids = Object.keys(DUR).filter(id => beats.includes(id));
  const rows = [];
  for (let i = 0; i < ids.length - 1; i++) {
    const a = path.join(ROOT, 'seams', `${ids[i]}_out.png`), b = path.join(ROOT, 'seams', `${ids[i + 1]}_in.png`);
    const A = JSON.parse(fs.readFileSync(a.replace('.png', '.json'))), B = JSON.parse(fs.readFileSync(b.replace('.png', '.json')));
    const sub3 = (u, v) => u.map((x, j) => x - v[j]), len = u => Math.hypot(...u);
    const dA = sub3(A.tgt, A.pos), dB = sub3(B.tgt, B.pos);
    const turn = Math.acos(Math.max(-1, Math.min(1, dA.reduce((s, x, j) => s + x * dB[j], 0) / (len(dA) * len(dB))))) * 180 / Math.PI;
    const width = (d, f) => 2 * len(d) * Math.tan(f * Math.PI / 360);        // framed height ~ shot size
    const wa = width(dA, A.fov), wb = width(dB, B.fov), ratio = Math.max(wa / wb, wb / wa);
    const shift = len(sub3(A.tgt, B.tgt)) / Math.min(wa, wb);                // subject moved by N frame-heights
    const inA = Object.keys(A.vis).filter(k => A.vis[k] > 0.05), inB = Object.keys(B.vis).filter(k => B.vis[k] > 0.05);
    const shared = inA.filter(k => inB.includes(k)).length;
    const sameScene = shared / Math.max(1, Math.min(inA.length, inB.length)) >= 0.4;
    const log = execFileSync('bash', ['-c', `ffmpeg -i "${a}" -i "${b}" -lavfi "[0]scale=480:-1,format=gray[x];[1]scale=480:-1,format=gray[y];[x][y]ssim" -f null - 2>&1 | grep -o 'All:[0-9.]*' | tail -1`]).toString();
    const ssim = parseFloat((log.split(':')[1] || '0'));
    const separated = !sameScene || turn >= 30 || ratio >= 2 || shift >= 1.0;
    const jump = !separated || ssim > 0.85;
    const why = !sameScene ? 'different subject/scene' : [turn >= 30 && `angle ${turn.toFixed(0)}°`, ratio >= 2 && `size ×${ratio.toFixed(1)}`, shift >= 1 && 'new subject in frame'].filter(Boolean).join(', ');
    const pair = path.join(ROOT, 'seams', `seam_${ids[i]}_${ids[i + 1]}.jpg`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', a, '-i', b, '-filter_complex', '[0]scale=640:-1[x];[1]scale=640:-1[y];[x][y]hstack', pair]);
    rows.push({ seam: `${ids[i]} -> ${ids[i + 1]}`, jump, ssim, detail: `turn ${turn.toFixed(0)}° size ×${ratio.toFixed(2)} shift ${shift.toFixed(2)} ssim ${ssim.toFixed(2)}`, why, pair });
  }
  rows.sort((x, y) => (y.jump - x.jump) || (y.ssim - x.ssim));
  const txt = rows.map(r => `${r.jump ? 'JUMP CUT' : 'ok      '}  ${r.seam.padEnd(11)} ${r.detail.padEnd(46)} ${r.jump ? '→ change size ≥2 steps, angle ≥30° or subject' : r.why}   ${path.basename(r.pair)}`).join('\n');
  fs.writeFileSync(path.join(ROOT, 'seams', 'report.txt'), txt + '\n');
  console.log(txt);
  console.log(`\n${rows.filter(r => r.jump).length} jump cut(s) in ${rows.length} seams`);
}

process.exit(failed ? 1 : 0);
