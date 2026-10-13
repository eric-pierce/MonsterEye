/*
 * Monster Eye — animated Halloween window eye.
 * Rendering engine + animation library. Shared by index.html (the eye)
 * and config.html (the settings page with a live preview).
 */
(function (global) {
  'use strict';

  // ---------- helpers ----------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (e0, e1, x) => { x = clamp((x - e0) / (e1 - e0), 0, 1); return x * x * (3 - 2 * x); };
  function hueLerp(a, b, t) {
    const d = (((b - a) % 360) + 540) % 360 - 180;
    return (((a + d * t) % 360) + 360) % 360;
  }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }

  // ---------- procedural noise (for the realistic textures) ----------
  function hash2(x, y, sd) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(sd, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  // tileable value noise: period px/py in lattice cells
  function vnoise(x, y, px, py, sd) {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const X0 = ((x0 % px) + px) % px, X1 = (X0 + 1) % px, Y0 = ((y0 % py) + py) % py, Y1 = (Y0 + 1) % py;
    const a = hash2(X0, Y0, sd), b = hash2(X1, Y0, sd), c = hash2(X0, Y1, sd), d = hash2(X1, Y1, sd);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, px, py, oct, sd) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += amp * vnoise(x, y, px, py, sd + o * 17); norm += amp;
      x *= 2; y *= 2; px *= 2; py *= 2; amp *= 0.5;
    }
    return sum / norm;
  }
  const shared = {};   // textures shared by every engine instance
  function noiseCanvas() {          // 256px tileable grey fbm, used as an overlay pattern
    if (shared.noise) return shared.noise;
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = fbm(x / S * 8, y / S * 8, 8, 8, 5, 3), i = (y * S + x) * 4;
      const gv = clamp(128 + (v - 0.5) * 2.4 * 127, 0, 255);
      d[i] = d[i + 1] = d[i + 2] = gv; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return (shared.noise = c);
  }
  function photoIrisCanvas() {      // grey stroma detail in polar space; colored by an overlay blend
    if (shared.photoIris) return shared.photoIris;
    const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x + 0.5 - S / 2) / (S / 2), dy = (y + 0.5 - S / 2) / (S / 2), r = Math.hypot(dx, dy), i = (y * S + x) * 4;
      if (r > 1) { d[i + 3] = 0; continue; }
      const th = Math.atan2(dy, dx) / TAU + 0.5;
      const fib = fbm(th * 96, r * 5, 96, 4096, 4, 11);
      const fib2 = fbm(th * 240, r * 15, 240, 4096, 3, 29);
      const blot = fbm(th * 14, r * 4, 14, 4096, 3, 5);
      const cr = 0.36 + 0.06 * (fbm(th * 20, 0.5, 20, 4096, 2, 7) - 0.5) * 2;
      let v = 0.5 + (fib - 0.5) * 0.8 + (fib2 - 0.5) * 0.5 + (fbm(x / S * 12, y / S * 12, 4096, 4096, 3, 51) - 0.5) * 0.35;
      v += 0.22 * Math.exp(-(((r - cr) / 0.03) ** 2));                          // collarette ridge
      const zone = smooth(0.38, 0.48, r) * (1 - smooth(0.74, 0.86, r));
      if (blot > 0.6) v -= (blot - 0.6) * 2.4 * zone;                          // crypts
      v -= 0.1 * Math.max(0, Math.sin(r * 58 + blot * 7)) * smooth(0.66, 0.8, r); // contraction furrows
      v -= 0.18 * (1 - smooth(0.12, 0.26, r));                                 // pupillary ruff
      const gv = clamp(v, 0, 1) * 255;
      d[i] = d[i + 1] = d[i + 2] = gv;
      d[i + 3] = r > 0.97 ? 255 * (1 - r) / 0.03 : 255;
    }
    g.putImageData(img, 0, 0);
    return (shared.photoIris = c);
  }
  function highlightCanvas() {      // soft window reflection for the cornea
    if (shared.hl) return shared.hl;
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    g.filter = 'blur(16px)'; g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(48, 56, 160, 140);
    g.filter = 'blur(3px)'; g.fillStyle = 'rgba(255,255,255,.92)';
    const pane = (x, y, w, h) => { g.beginPath(); g.moveTo(x + 6, y); g.lineTo(x + w - 6, y); g.quadraticCurveTo(x + w, y, x + w, y + 6); g.lineTo(x + w, y + h - 6); g.quadraticCurveTo(x + w, y + h, x + w - 6, y + h); g.lineTo(x + 6, y + h); g.quadraticCurveTo(x, y + h, x, y + h - 6); g.lineTo(x, y + 6); g.quadraticCurveTo(x, y, x + 6, y); g.fill(); };
    pane(70, 74, 54, 48); pane(132, 70, 54, 48); pane(72, 130, 54, 50); pane(134, 126, 54, 50);
    g.filter = 'none';
    return (shared.hl = c);
  }

  // Outline of "The Lake" crest (Nonantum, Newton MA): a shield one unit wide, as evenly spaced points
  // running clockwise from the top centre, so it can be morphed point-for-point out of a round pupil.
  const CREST = (function () {
    const raw = [[0, -0.58], [0.5, -0.58], [0.5, 0.12]];
    for (let i = 1; i <= 14; i++) {      // rounded shoulder down to the point
      const t = i / 14, mt = 1 - t;
      raw.push([mt * mt * 0.5 + 2 * mt * t * 0.5, mt * mt * 0.12 + 2 * mt * t * 0.56 + t * t * 0.66]);
    }
    for (let i = raw.length - 2; i >= 0; i--) raw.push([-raw[i][0], raw[i][1]]);
    const seg = [], N = 80, out = [];
    let total = 0;
    for (let i = 1; i < raw.length; i++) { seg.push(Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1])); total += seg[i - 1]; }
    for (let k = 0, i = 0, acc = 0; k < N; k++) {
      const d = k / N * total;
      while (acc + seg[i] < d) acc += seg[i++];
      const f = (d - acc) / seg[i];
      out.push([lerp(raw[i][0], raw[i + 1][0], f), lerp(raw[i][1], raw[i + 1][1], f)]);
    }
    return out;
  })();
  const CREST_LETTERS = { T: 0.78, H: 0.82, E: 0.62, L: 0.62, A: 0.92, K: 0.84 };   // widths, in letter heights

  // ---------- animation library ----------
  // Each animation gets `a` every frame:
  //   a.t (seconds into this act), a.p (0..1 progress), a.dt, a.tgt (target
  //   eye parameters to modify), a.ctl (behaviour switches), a.st (per-act
  //   scratch state), a.blink(dur), a.flash(alpha, 'r,g,b', decay), a.fx, a.base,
  //   a.crack(x, y, size) (cracks the "glass"; a.crack() spreads it), a.view (half screen size, in eye widths)
  //   Props are positioned in eye widths from the centre: ctl.critter = { kind, x, y }.
  const ANIMS = [
    {
      id: 'lurk', name: 'Lurking Gaze', dur: 12,
      desc: 'Calm, creepy glances around the street with natural blinks.',
      fn(a) { a.tgt.pupil = 0.38 + 0.05 * Math.sin(a.t * 0.7); }
    },
    {
      id: 'watch', name: 'Watching You', dur: 14,
      desc: 'Squints suspiciously and slowly tracks someone walking past, then snaps back.',
      fn(a) {
        const { tgt, ctl } = a;
        ctl.saccade = false;
        const cyc = 7, q = (a.t % cyc) / cyc;
        tgt.lookX = q < 0.72 ? lerp(-0.95, 0.95, smooth(0, 0.72, q)) : lerp(0.95, -0.95, smooth(0.84, 0.94, q));
        tgt.lookY = 0.12 + 0.04 * Math.sin(a.t * 1.7);
        ctl.speeds.look = (q > 0.82 && q < 0.97) ? 22 : 5;
        tgt.lid = 0.6; tgt.lidBot = 1.2; tgt.pupil = 0.3;
      }
    },
    {
      id: 'frenzy', name: 'Blink Frenzy', dur: 7,
      desc: 'Manic rapid-fire blinking while darting in every direction.',
      fn(a) {
        const { ctl, st, tgt } = a;
        ctl.blink = false;
        if (!(a.t < st.nb)) { a.blink(rand(0.08, 0.13)); st.nb = a.t + rand(0.14, 0.45); }
        ctl.sMin = 0.08; ctl.sMax = 0.35; ctl.range = 1;
        tgt.lid = 1.12; tgt.pupil = 0.3;
      }
    },
    {
      id: 'pulse', name: 'Pupil Pulse', dur: 10,
      desc: 'The pupil swells until the iris nearly vanishes, then shrinks to a pin-prick.',
      fn(a) {
        const s = Math.sin(a.t * 1.6);
        a.tgt.pupil = s > 0 ? 0.4 + 0.5 * s : 0.4 + 0.32 * s;
        a.ctl.speeds.pupil = 6; a.ctl.range = 0.35;
        a.tgt.lid = 1.05; a.tgt.glow = 0.4 + 0.3 * Math.max(0, -s);
      }
    },
    {
      id: 'spin', name: 'Crazy Spin', dur: 8,
      desc: 'The eye whirls around in faster and faster circles, then winds down.',
      fn(a) {
        const { ctl, tgt, st } = a;
        ctl.saccade = false; ctl.blink = false;
        if (!st.dir) st.dir = Math.random() < 0.5 ? -1 : 1;
        const w = lerp(1.2, 15, Math.sin(Math.PI * clamp(a.p / 0.9, 0, 1)));
        st.ang = (st.ang || 0) + w * a.dt * st.dir;
        if (a.p < 0.9) { tgt.lookX = Math.cos(st.ang) * 0.85; tgt.lookY = Math.sin(st.ang) * 1.0; }
        ctl.speeds.look = 45; ctl.rotSpeed = w * 0.7 * st.dir;
        tgt.pupil = 0.3; tgt.lid = 1.18; tgt.glow = 0.5;
      }
    },
    {
      id: 'serpent', name: 'Serpent Shift', dur: 12,
      desc: 'The pupil narrows into a reptile slit and the iris turns venom yellow.',
      fn(a) {
        const { tgt, ctl } = a;
        const on = a.p < 0.88;
        tgt.slit = on ? 1 : a.base.slit; tgt.hue = on ? 62 : a.base.hue; tgt.sat = 100;
        tgt.pupil = on ? 0.72 : a.base.pupil; tgt.lid = 0.78; tgt.glow = 0.55;
        ctl.sMin = 1.2; ctl.sMax = 3.5; ctl.range = 0.6;
        ctl.bDur = 0.4; ctl.bMin = 3; ctl.bMax = 6;
      }
    },
    {
      id: 'rage', name: 'Bloodshot Rage', dur: 8,
      desc: 'Veins bulge, the eye floods red, the pupil shrinks and it shakes with fury.',
      fn(a) {
        const { tgt, ctl } = a;
        const e = smooth(0, 0.12, a.p) * (1 - smooth(0.85, 1, a.p));
        tgt.blood = e; tgt.hue = hueLerp(a.base.hue, 2, e); tgt.sat = 100;
        tgt.pupil = lerp(0.38, 0.1, e); tgt.lid = 1 + 0.22 * e;
        tgt.shake = e * (0.3 + 0.4 * Math.max(0, Math.sin(a.t * 8)));
        tgt.glow = 0.3 + 0.6 * e;
        ctl.blink = false; ctl.sMin = 0.15; ctl.sMax = 0.6; ctl.range = 0.45;
      }
    },
    {
      id: 'hypno', name: 'Hypnotic Spiral', dur: 10,
      desc: 'A spinning spiral takes over the iris. You are getting very sleepy...',
      fn(a) {
        const { tgt, ctl } = a;
        ctl.saccade = false; ctl.blink = false;
        tgt.lookX = 0; tgt.lookY = 0;
        const e = a.p < 0.9 ? 1 : 0;
        tgt.spiral = e; ctl.rotSpeed = -3.2;
        tgt.pupil = 0.16 + 0.05 * Math.sin(a.t * 3);
        tgt.glow = 0.6 * e; tgt.lid = 1.05;
        tgt.hue = a.base.hue + 30 * Math.sin(a.t * 0.6);
      }
    },
    {
      id: 'rainbow', name: 'Color Chaos', dur: 9,
      desc: 'The iris cycles through every color of the rainbow with an eerie glow.',
      fn(a) {
        a.tgt.hue = (a.base.hue + a.t * 110) % 360; a.ctl.speeds.hue = 25;
        a.tgt.sat = 100; a.tgt.glow = 0.8; a.tgt.pupil = 0.34 + 0.06 * Math.sin(a.t * 2);
      }
    },
    {
      id: 'nervous', name: 'Nervous Twitch', dur: 9,
      desc: 'Jittery and paranoid: trembling, darting glances and double-blinks.',
      fn(a) {
        const { tgt, ctl, st } = a;
        tgt.shake = 0.16; ctl.sMin = 0.06; ctl.sMax = 0.4; ctl.range = 0.95; ctl.blink = false;
        if (!(a.t < st.np)) { st.pup = rand(0.18, 0.5); st.np = a.t + rand(0.2, 0.6); }
        tgt.pupil = st.pup; ctl.speeds.pupil = 10;
        if (!(a.t < st.nb)) { a.blink(0.11); st.db = a.t + 0.2; st.nb = a.t + rand(1.2, 3); }
        if (st.db && a.t > st.db) { a.blink(0.11); st.db = 0; }
        tgt.lid = 1.12;
      }
    },
    {
      id: 'boo', name: 'Sleepy... BOO!', dur: 12,
      desc: 'Grows drowsy and drifts off... then SNAPS wide open with a red flash. The jump scare.',
      fn(a) {
        const { tgt, ctl, st } = a;
        ctl.blink = false; ctl.saccade = false;
        if (a.p < 0.7) {
          const q = a.p / 0.7;
          tgt.lid = lerp(1, 0.1, smooth(0, 1, q)) + 0.07 * Math.sin(a.t * 2.6) * (1 - q);
          ctl.speeds.lid = 3; tgt.pupil = 0.52;
          tgt.lookY = lerp(0, 0.7, q); tgt.lookX = 0.25 * Math.sin(a.t * 0.5); ctl.speeds.look = 2;
        } else if (a.p < 0.8) {
          tgt.lid = 0; ctl.speeds.lid = 5; tgt.lookX = 0; tgt.lookY = 0; ctl.speeds.look = 3;
        } else {
          if (!st.boo) { st.boo = a.t; a.flash(0.9, '200,0,0', 2.5); }
          const k = a.t - st.boo;
          tgt.lid = 1.38; ctl.speeds.lid = 70;
          tgt.pupil = 0.08; ctl.speeds.pupil = 40;
          tgt.blood = 1; ctl.speeds.blood = 25;
          tgt.shake = Math.max(0, 1 - k * 0.6); ctl.speeds.shake = 40;
          tgt.scale = 1 + 0.1 * Math.max(0, 1 - k * 0.8); ctl.speeds.scale = 40;
          tgt.glow = 1; tgt.lookX = 0; tgt.lookY = 0; ctl.speeds.look = 40;
        }
      }
    },
    {
      id: 'glitch', name: 'Glitch Possession', dur: 8,
      desc: 'Something digital is inside: the eye tears, jumps and flickers in corrupted bursts.',
      fn(a) {
        const { tgt, ctl, st } = a;
        ctl.saccade = false; ctl.blink = false;
        if (!(a.t < st.next)) {
          st.until = a.t + rand(0.08, 0.45); st.next = a.t + rand(0.4, 1.6);
          st.x = rand(-1, 1); st.y = rand(-0.8, 0.8); st.h = rand(0, 360); st.pup = rand(0.1, 0.7);
          st.slit = Math.random() < 0.3 ? 1 : 0;
        }
        const on = a.t < st.until;
        ctl.glitch = on ? rand(0.4, 1) : (Math.random() < 0.03 ? 0.3 : 0);
        tgt.lookX = st.x; tgt.lookY = st.y; ctl.speeds.look = on ? 90 : 20;
        tgt.hue = on ? st.h : a.base.hue; ctl.speeds.hue = on ? 90 : 4;
        tgt.pupil = on ? st.pup : a.base.pupil; ctl.speeds.pupil = on ? 60 : 5;
        tgt.slit = on ? st.slit : a.base.slit; ctl.speeds.slit = on ? 60 : 4;
      }
    },
    {
      id: 'swarm', name: 'Pupil Swarm', dur: 10,
      desc: 'The pupil splits into several smaller pupils that orbit each other, then merge back.',
      fn(a) {
        const { tgt, ctl } = a;
        tgt.multi = (a.p > 0.05 && a.p < 0.82) ? 1 : 0; ctl.speeds.multi = 2.2;
        ctl.rotSpeed = 1.4; ctl.range = 0.3;
        tgt.pupil = 0.42; tgt.glow = 0.5; tgt.lid = 1.08;
      }
    },
    {
      id: 'heartbeat', name: 'Heartbeat', dur: 9,
      desc: 'The whole eye throbs to a slow, heavy heartbeat.',
      fn(a) {
        const { tgt, ctl } = a;
        const q = (a.t % 0.9) / 0.9;
        const b = Math.exp(-(((q - 0.06) / 0.045) ** 2)) + 0.65 * Math.exp(-(((q - 0.24) / 0.055) ** 2));
        tgt.scale = 1 + 0.065 * b; ctl.speeds.scale = 35;
        tgt.blood = 0.3 + 0.35 * b; ctl.speeds.blood = 20;
        tgt.pupil = 0.4 - 0.12 * b; ctl.speeds.pupil = 25;
        tgt.glow = 0.3 + 0.6 * b; ctl.speeds.glow = 25;
        ctl.range = 0.25;
      }
    },
    {
      id: 'rollback', name: 'Possessed Roll-Back', dur: 10,
      desc: 'Rolls back into the head showing only white while the lids flutter, then rolls back down.',
      fn(a) {
        const { tgt, ctl } = a;
        ctl.saccade = false; ctl.blink = false;
        const q = (a.t % 5) / 5;
        if (q < 0.6 && a.p < 0.9) {
          tgt.lookY = -2.9; tgt.lookX = 0.12 * Math.sin(a.t * 11);
          tgt.lid = 0.7 + 0.1 * Math.sin(a.t * 23); ctl.speeds.lid = 20;
          tgt.shake = 0.12; ctl.speeds.look = 4; tgt.blood = 0.35;
        } else {
          tgt.lookX = 0; tgt.lookY = 0.1; ctl.speeds.look = 8; tgt.lid = 1.05;
        }
      }
    },
    {
      id: 'storm', name: 'Lightning Storm', dur: 12,
      desc: 'The eye sits in darkness until lightning flashes; the pupil snaps shut in the glare.',
      fn(a) {
        const { tgt, ctl, st } = a;
        tgt.dim = 0.55;
        if (!(a.t < st.next) && a.p < 0.9) {
          a.flash(rand(0.7, 1), '215,225,255', 7);
          st.second = a.t + rand(0.09, 0.18); st.next = a.t + rand(1.6, 4);
          if (Math.random() < 0.6) a.blink(0.12);
        }
        if (st.second && a.t > st.second) { a.flash(rand(0.5, 0.9), '215,225,255', 5); st.second = 0; }
        const bright = a.fx.flashA > 0.25;
        tgt.pupil = bright ? 0.09 : 0.46; ctl.speeds.pupil = bright ? 35 : 1.2;
        ctl.sMin = 1; ctl.sMax = 3;
      }
    },
    {
      id: 'bleed', name: 'Blood Tears', dur: 12,
      desc: 'The eye turns bloodshot and begins to weep dripping blood.',
      fn(a) {
        const { tgt, ctl, st } = a;
        tgt.blood = 0.75; ctl.biasY = 0.35; ctl.range = 0.3; ctl.sMin = 1.5; ctl.sMax = 4;
        tgt.lid = 0.82; tgt.lidTop = 0.95; tgt.pupil = 0.46;
        ctl.bleeding = true;
        if (!(a.t < st.next) && a.p < 0.8) {
          a.fx.drips.push({ u: rand(0.22, 0.78), len: 0, v: rand(0.03, 0.08), w: rand(0.008, 0.017) });
          st.next = a.t + rand(0.5, 1.5);
        }
      }
    },
    {
      id: 'fly', name: 'Fly Chase', dur: 12,
      desc: 'A fat fly buzzes around the window. The eye chases it, goes cross when it lands, then blinks it away.',
      fn(a) {
        const { tgt, ctl, st } = a;
        const mx = Math.min(1.25, a.view.hw * 0.85), my = Math.min(0.62, a.view.hh * 0.8);
        if (st.x == null) {
          st.side = Math.random() < 0.5 ? -1 : 1;
          st.x = st.side * (a.view.hw + 0.3); st.y = rand(-my, my * 0.3);
          st.vx = st.vy = st.ang = st.nw = 0; st.lx = rand(-0.22, 0.22); st.ly = rand(-0.1, 0.1);
        }
        const land = a.p > 0.56 && a.p < 0.76, gone = a.p >= 0.76;
        if (gone) { st.wx = -st.side * (a.view.hw + 1.5); st.wy = -a.view.hh; }
        else if (land) { st.wx = st.lx; st.wy = st.ly; }
        else if (!(a.t < st.nw)) { st.wx = rand(-mx, mx); st.wy = rand(-my, my); st.nw = a.t + rand(0.35, 1.1); }
        const dx = st.wx - st.x, dy = st.wy - st.y;
        const sitting = land && Math.hypot(dx, dy) < 0.03 && Math.hypot(st.vx, st.vy) < 0.4;
        if (!sitting) {      // loose spring toward the waypoint, so it loops and overshoots like a fly
          const damp = land ? 11 : 6;
          st.vx += (dx * 30 - st.vx * damp) * a.dt; st.vy += (dy * 30 - st.vy * damp) * a.dt;
          st.x += st.vx * a.dt; st.y += st.vy * a.dt;
          if (Math.hypot(st.vx, st.vy) > 0.15) st.ang = Math.atan2(st.vy, st.vx);
        }
        const buzz = sitting ? 0 : 0.025;
        ctl.critter = { kind: 'fly', x: st.x + buzz * Math.sin(a.t * 31), y: st.y + buzz * Math.cos(a.t * 27), ang: st.ang, flap: !sitting };
        ctl.blink = false;
        if (!gone) {
          ctl.saccade = false;
          tgt.lookX = clamp(st.x / 0.8, -1, 1); tgt.lookY = clamp(st.y / 0.45, -1, 1); ctl.speeds.look = 11;
          tgt.lid = land ? 0.7 : 1.12; tgt.lidBot = land ? 1.2 : 1; tgt.pupil = land ? 0.13 : 0.3;
          tgt.shake = sitting ? 0.06 : 0;
        } else {             // blinks it away, then looks around for it
          if (!st.off) { st.off = a.t; a.blink(0.3); }
          const k = a.t - st.off;
          if (k > 0.45 && !st.b2) { st.b2 = 1; a.blink(0.22); }
          tgt.shake = Math.max(0, 0.5 - k); ctl.speeds.shake = 30;
          ctl.sMin = 0.15; ctl.sMax = 0.55; ctl.range = 0.9; tgt.lid = 1.1;
        }
      }
    },
    {
      id: 'spider', name: 'Spider Drop', dur: 13,
      desc: 'A spider lowers itself on a thread right in front of the eye, which watches it, wide and trembling.',
      fn(a) {
        const { tgt, ctl, st } = a;
        if (st.x == null) st.x = rand(-0.3, 0.3);
        const top = -a.view.hh - 0.45;
        const down = smooth(0.05, 0.42, a.p), up = smooth(0.74, 0.9, a.p), hang = down >= 1 && up <= 0;
        const sway = 0.035 * Math.sin(a.t * 2.1) * down * (1 - up);
        const y = lerp(lerp(top, 0.03, down), top, up * up) + 0.02 * Math.sin(a.t * 6) * down * (1 - down) * 4;
        ctl.critter = { kind: 'spider', x: st.x + sway, y, tx: st.x, walk: !hang };
        if (a.p > 0.09 && a.p < 0.92) {
          ctl.saccade = false; ctl.blink = false;
          tgt.lookX = clamp((st.x + sway) / 0.55, -1, 1); tgt.lookY = clamp(y / 0.28, -1, 1); ctl.speeds.look = 9;
          const near = down * (1 - up);
          tgt.pupil = lerp(0.36, 0.13, near); tgt.lid = 1 + 0.25 * near; tgt.shake = hang ? 0.07 : 0;
          if (hang && !st.b1 && a.p > 0.56) { st.b1 = a.t; a.blink(0.13); }
          if (st.b1 && !st.b2 && a.t > st.b1 + 0.26) { st.b2 = 1; a.blink(0.13); }
        }
      }
    },
    {
      id: 'glass', name: 'Let Me Out', dur: 11,
      desc: 'The eye presses up close and slams against the window until the glass cracks.',
      fn(a) {
        const { tgt, ctl, st } = a;
        ctl.saccade = false; ctl.cracked = a.p < 0.93;
        const lean = smooth(0, 0.3, a.p) * (1 - smooth(0.8, 0.95, a.p));
        tgt.scale = 1 + 0.2 * lean; ctl.speeds.scale = 2.5;
        tgt.lookX = 0.3 * Math.sin(a.t * 0.9) * lean; tgt.lookY = 0.05; ctl.speeds.look = 4;
        tgt.lid = lerp(1, 0.74, lean); tgt.lidBot = 1.15; tgt.pupil = 0.2;
        const hits = [0.36, 0.5, 0.6];
        st.n = st.n || 0;
        if (st.n < hits.length && a.p > hits[st.n] - 0.04) { tgt.scale = 1.07; ctl.speeds.scale = 14; }   // winds up
        if (st.n < hits.length && a.p >= hits[st.n]) {
          if (st.n) a.crack(); else a.crack(rand(-0.35, 0.35), rand(-0.2, 0.2), 1.7);   // each slam spreads it further
          a.flash(0.3, '255,255,255', 9); st.hit = a.t; st.n++;
        }
        const k = st.hit == null ? 9 : a.t - st.hit;
        if (k < 0.5) {
          tgt.scale = 1 + 0.2 * lean + 0.16 * Math.exp(-k * 7); ctl.speeds.scale = 60;
          tgt.shake = Math.exp(-k * 6); ctl.speeds.shake = 60; tgt.lid = 1.25; ctl.speeds.lid = 40;
        }
        tgt.blood = 0.25 * st.n; tgt.glow = 0.3 + 0.2 * st.n;
      }
    },
    {
      id: 'pumpkin', name: "Jack-o'-Lantern", dur: 9,
      desc: 'The iris burns pumpkin orange and a flickering carved face lights up inside the pupil.',
      fn(a) {
        const { tgt, ctl } = a;
        const on = a.p > 0.08 && a.p < 0.86;
        ctl.glyph = 'pumpkin'; tgt.glyph = on ? 1 : 0;
        tgt.pupil = on ? 0.8 : a.base.pupil; tgt.slit = on ? 0 : a.base.slit; ctl.speeds.slit = 6;
        tgt.hue = on ? 28 : a.base.hue; tgt.sat = 100; tgt.glow = on ? 0.85 : 0.3;
        ctl.range = 0.3; tgt.lid = 1.1; tgt.dim = on ? 0.25 : 0;
      }
    },
    {
      id: 'skull', name: "Death's Reflection", dur: 10,
      desc: 'The eye freezes and the pupil yawns open. A skull drifts closer in its reflection.',
      fn(a) {
        const { tgt, ctl, st } = a;
        ctl.saccade = false; ctl.blink = false; tgt.lookX = 0; tgt.lookY = 0; ctl.speeds.look = 3;
        const on = a.p > 0.12 && a.p < 0.86;
        ctl.glyph = 'skull'; ctl.glyphScale = lerp(0.35, 1, smooth(0.12, 0.8, a.p));
        tgt.glyph = on ? 1 : 0; ctl.speeds.glyph = on ? 1.2 : 14;
        tgt.pupil = a.p < 0.9 ? 0.86 : a.base.pupil; ctl.speeds.pupil = 2.5;
        tgt.slit = a.p < 0.9 ? 0 : a.base.slit; ctl.speeds.slit = 6;
        tgt.sat = 35; tgt.dim = on ? 0.3 : 0; tgt.lid = 1.15; tgt.shake = on ? 0.03 : 0;
        if (a.p >= 0.86 && !st.b) { st.b = 1; a.blink(0.3); }
      }
    },
    {
      id: 'lizard', name: 'Third Eyelid', dur: 10,
      desc: 'No blinking. Instead a milky membrane slides sideways across the eye, like a reptile.',
      fn(a) {
        const { tgt, ctl, st } = a;
        ctl.blink = false; ctl.sMin = 1.6; ctl.sMax = 3.6; ctl.range = 0.75;
        if (st.next == null) { st.next = rand(0.7, 1.3); st.at = -9; }
        if (a.t >= st.next) { st.at = a.t; st.next = a.t + rand(1.6, 3.2); }
        const k = a.t - st.at;
        tgt.nict = k < 0.28 ? 1 : 0; ctl.speeds.nict = k < 0.28 ? 16 : 9;
        tgt.lid = 0.92;
      }
    },
    {
      id: 'target', name: 'Target Lock', dur: 10,
      desc: 'A targeting reticle sweeps the street with the eye, then snaps onto someone and locks on.',
      fn(a) {
        const { tgt, ctl, st } = a;
        ctl.saccade = false; ctl.blink = false;
        const on = a.p < 0.92, lock = on && a.p > 0.46;
        tgt.hud = on ? 1 : 0; ctl.hudLock = lock ? 1 : 0;
        if (lock) {
          if (!st.lk) { st.lk = 1; a.flash(0.35, '255,0,0', 5); }
          tgt.lookX = 0; tgt.lookY = 0; ctl.speeds.look = 26;
          tgt.pupil = 0.1; ctl.speeds.pupil = 22; tgt.lid = 1.15; tgt.scale = 1.05;
          tgt.hue = 0; tgt.sat = 100; ctl.speeds.hue = 12; tgt.glow = 1;
        } else {
          tgt.lookX = on ? 0.85 * Math.sin(a.t * 1.3) : 0; tgt.lookY = on ? 0.25 * Math.sin(a.t * 2.9) : 0; ctl.speeds.look = 5;
          tgt.lid = 0.85; tgt.pupil = 0.34;
        }
      }
    },
    {
      id: 'disco', name: 'Monster Mash', dur: 10,
      desc: 'Party time: the eye bops to a beat, changing color under flashing disco lights.',
      fn(a) {
        const { tgt, ctl, st } = a;
        ctl.saccade = false; ctl.blink = false;
        const beat = 0.5, n = Math.floor(a.t / beat), hit = Math.exp(-((a.t % beat) / beat) * 5);
        if (n !== st.n) {
          st.n = n;
          a.flash(0.2, ['255,0,170', '0,220,255', '255,220,0', '120,255,0'][n % 4], 6);
          if (n % 8 === 7) a.blink(0.2);
        }
        const m = [[-0.8, 0.25], [0.8, 0.25], [-0.8, -0.3], [0.8, -0.3], [0, 0.55], [0, -0.55], [-0.6, 0], [0.6, 0]][n % 8];
        tgt.lookX = m[0]; tgt.lookY = m[1] + 0.12 * hit; ctl.speeds.look = 16;
        tgt.hue = (a.base.hue + n * 67) % 360; ctl.speeds.hue = 18; tgt.sat = 100;
        tgt.scale = 1 + 0.045 * hit; ctl.speeds.scale = 30;
        tgt.lid = 0.92 + 0.26 * hit; ctl.speeds.lid = 22;
        tgt.pupil = 0.3 + 0.14 * hit; ctl.speeds.pupil = 20;
        tgt.glow = 0.5 + 0.5 * hit; ctl.speeds.glow = 25; ctl.rotSpeed = 1.2; tgt.dim = 0.3;
      }
    },
    {
      id: 'eclipse', name: 'Blood Moon Eclipse', dur: 11,
      desc: 'Darkness falls as the pupil swallows the iris, leaving only a burning red corona.',
      fn(a) {
        const { tgt, ctl, st } = a;
        ctl.saccade = false; ctl.blink = false; tgt.lookX = 0; tgt.lookY = 0; ctl.speeds.look = 3;
        const e = smooth(0.05, 0.4, a.p) * (1 - smooth(0.74, 0.86, a.p));
        tgt.pupil = lerp(a.base.pupil, 0.93, e); ctl.speeds.pupil = 9;
        tgt.slit = lerp(a.base.slit, 0, e); ctl.speeds.slit = 9;
        tgt.hue = hueLerp(a.base.hue, 14, e); tgt.sat = 100; ctl.speeds.hue = 6;
        tgt.dim = 0.45 * e; tgt.glow = 0.25 + 0.75 * e; tgt.blood = 0.35 * e;
        tgt.lid = 1 + 0.12 * e; tgt.shake = e > 0.98 ? 0.05 : 0;
        if (a.p > 0.74 && !st.ring) { st.ring = 1; a.flash(0.55, '255,225,190', 2.5); }
      }
    },
    {
      id: 'rem', name: 'Bad Dream', dur: 12,
      desc: 'Fast asleep, but the eyeball darts around under the closed lid. Then it jolts awake in a panic.',
      fn(a) {
        const { tgt, ctl, st } = a;
        ctl.blink = false;
        if (a.p < 0.62) {
          const deep = smooth(0.03, 0.13, a.p);
          tgt.lid = (1 - deep) + (deep >= 1 && Math.sin(a.t * 3.1) > 0.93 ? 0.07 : 0); ctl.speeds.lid = 5;
          tgt.rem = deep; tgt.shake = 0.04 * deep;
          ctl.sMin = 0.12; ctl.sMax = 0.7; ctl.range = 1; ctl.speeds.look = 20;
        } else if (a.p < 0.86) {
          if (!st.up) st.up = a.t;
          tgt.lid = 1.36; ctl.speeds.lid = 60; tgt.pupil = 0.62; ctl.speeds.pupil = 30;
          tgt.shake = Math.max(0, 0.5 - (a.t - st.up) * 0.5); ctl.speeds.shake = 40;
          ctl.sMin = 0.12; ctl.sMax = 0.4; ctl.range = 0.95;
        } else { tgt.lid = 0.9; ctl.sMin = 0.8; ctl.sMax = 2; }
      }
    },
    {
      id: 'eyeroll', name: 'Unimpressed', dur: 8,
      desc: 'A flat, half-lidded stare, a huge sarcastic eye-roll and one very slow blink.',
      fn(a) {
        const { tgt, ctl, st } = a;
        ctl.saccade = false; ctl.blink = false;
        const cyc = 4, n = Math.floor(a.t / cyc), q = (a.t % cyc) / cyc;
        tgt.lid = 0.6; tgt.lidBot = 1.1; tgt.pupil = 0.3;
        if (q > 0.3 && q < 0.68) {
          const th = Math.PI * (1 + smooth(0.3, 0.68, q));   // over the top, corner to corner
          tgt.lookX = Math.cos(th) * 0.8 * (n % 2 ? -1 : 1); tgt.lookY = Math.sin(th) * 1.25; ctl.speeds.look = 9; tgt.lid = 0.8;
        } else {
          tgt.lookX = 0; tgt.lookY = 0.05; ctl.speeds.look = q < 0.3 ? 6 : 10;
          if (q >= 0.72 && st.b !== n) { st.b = n; a.blink(0.5); }
        }
      }
    },
    {
      id: 'peek', name: 'Peekaboo', dur: 10,
      desc: 'Hides behind its lid, sneaks a peek left and right through a crack, then pops wide open.',
      fn(a) {
        const { tgt, ctl, st } = a, p = a.p;
        ctl.saccade = false; ctl.blink = false; tgt.lookX = 0; tgt.lookY = 0;
        if (p < 0.12) { tgt.lid = 0; ctl.speeds.lid = 7; tgt.lookY = 0.55; }
        else if (p < 0.5) {
          tgt.lid = (p > 0.27 && p < 0.31) ? 0 : 0.24; ctl.speeds.lid = 9;
          tgt.lookX = p > 0.29 ? 0.92 : -0.92; tgt.lookY = 0.55; ctl.speeds.look = 7; tgt.pupil = 0.44;
        } else if (p < 0.6) { tgt.lid = 0; ctl.speeds.lid = 9; tgt.lookY = 0.3; }
        else if (p < 0.9) {
          if (!st.pop) st.pop = a.t;
          const k = a.t - st.pop;
          tgt.lid = 1.32; ctl.speeds.lid = 55;
          tgt.scale = 1 + 0.08 * Math.exp(-k * 3); ctl.speeds.scale = 40;
          tgt.pupil = 0.22 + 0.2 * smooth(0, 0.8, k); ctl.speeds.pupil = 12;
          tgt.lookX = 0.35 * Math.sin(k * 10) * Math.exp(-k * 1.2); ctl.speeds.look = 25; tgt.glow = 0.7;
        }
      }
    },
    {
      id: 'lake', name: 'Lake Pride', dur: 18,
      desc: 'For the neighborhood: the pupil reshapes into a shield, green, white and red pour in, and it becomes the crest of The Lake, which then swells to fill the whole window.',
      fn(a) {
        const { tgt, ctl, st } = a, p = a.p;
        if (p < 0.047 || p > 0.93) return;                     // a glance around before and after
        ctl.saccade = false; ctl.blink = false;
        const on = p < 0.86, done = p > 0.467;
        tgt.lookX = 0.1 * Math.sin(a.t * 0.8); tgt.lookY = 0.02; ctl.speeds.look = 4;
        ctl.glyph = 'lake'; tgt.glyph = on ? 1 : 0; ctl.speeds.glyph = on ? 2.2 : 12;
        ctl.glyphT = smooth(0.156, 0.356, p) + smooth(0.372, 0.467, p);   // 0-1 the colors pour in, 1-2 the name
        tgt.grow = smooth(0.605, 0.655, p) * (1 - smooth(0.775, 0.825, p)); ctl.speeds.grow = 14;   // lifts out of the eye, fills the window, sinks back
        tgt.pupil = on ? 0.42 : a.base.pupil; tgt.slit = on ? 0 : a.base.slit; ctl.speeds.slit = 6;
        tgt.scale = on ? 1 + 0.14 * smooth(0.062, 0.233, p) : 1; ctl.speeds.scale = 3;
        tgt.lid = 1.12; tgt.lidBot = on && done ? 0.88 : 1;         // a proud little smile once it's finished
        if (on && done) {                                          // the iris glows through the flag colors
          const k = Math.floor(a.t - 0.467 * a.dur) % 3;
          tgt.hue = [135, a.base.hue, 356][k]; tgt.sat = k === 1 ? 0 : 100; ctl.speeds.hue = 8; ctl.speeds.sat = 8; tgt.glow = 0.9;
        }
        if (!on && !st.b) { st.b = 1; a.blink(0.45); }
      }
    }
  ];

  // ---------- eye types ----------
  // The look of the eye. Animations work with every type.
  //   size/open: overall scale and lid opening height; irisSize: iris radius (x eye half-width)
  //   pupil/slit/glow: resting values; skin/sclera/iris/lashes: drawing styles
  const EYE_TYPES = [
    {
      id: 'classic', name: 'Classic Monster',
      desc: 'Toxic green iris, veiny eyeball, warty purple hide and spiky lashes.',
      irisHue: 95, irisSat: 90, skinHue: 320, skinS: 30, skinL: 24,
      size: 1, open: 1, irisSize: 0.36, lookScale: 1, pupil: 0.38, slit: 0, glow: 0.25,
      group: 'stylized', skin: 'warty', sclera: 'normal', iris: 'fibers', lashes: 'spiky', veinMul: 1, crease: 0.5, lidAlpha: 0.82,
      rim: sk => `hsl(${sk},40%,36%)`
    },
    {
      id: 'human', name: 'Realistic Human',
      desc: 'A lifelike human eye with brow, fine lashes and a detailed natural iris. Unnerving at giant size.',
      irisHue: 205, irisSat: 45, skinHue: 22, skinS: 36, skinL: 56,
      size: 0.8, open: 0.72, irisSize: 0.37, lookScale: 0.85, pupil: 0.32, slit: 0, glow: 0,
      group: 'realistic', photoHL: true, skin: 'human', sclera: 'human', iris: 'photo', lashes: 'fine', veinMul: 0.45, crease: 0.2, lidAlpha: 0.14, shadow: 0.7, rimW: 0.011,
      caruncle: true, rim: () => 'hsl(355,42%,60%)'
    },
    {
      id: 'dragon', name: 'Dragon',
      desc: 'A huge golden reptile eye with a knife-slit pupil, set in armored green scales.',
      irisHue: 42, irisSat: 95, skinHue: 140, skinS: 35, skinL: 20,
      size: 1, open: 0.85, irisSize: 0.64, lookScale: 0.55, pupil: 0.8, slit: 1, glow: 0.45,
      group: 'stylized', skin: 'scales', sclera: 'iris', iris: 'reptile', lashes: 'none', veinMul: 0, crease: 0.6, lidAlpha: 0.45,
      rim: sk => `hsl(${sk},30%,8%)`
    },
    {
      id: 'demon', name: 'Demon',
      desc: 'Black sclera, a burning ember iris and charred skin split by glowing lava cracks.',
      irisHue: 10, irisSat: 100, skinHue: 5, skinS: 40, skinL: 11,
      size: 1, open: 0.9, irisSize: 0.34, lookScale: 1, pupil: 0.3, slit: 0.55, glow: 0.9,
      group: 'stylized', skin: 'charred', sclera: 'black', iris: 'fire', lashes: 'none', veinMul: 1.6, crease: 0.5, lidAlpha: 0.82,
      rim: () => 'hsl(18,100%,38%)'
    },
    {
      id: 'zombie', name: 'Zombie',
      desc: 'A milky, clouded dead eye in rotting grey-green flesh held together with stitches.',
      irisHue: 190, irisSat: 14, skinHue: 95, skinS: 16, skinL: 32,
      size: 1, open: 0.95, irisSize: 0.34, lookScale: 1, pupil: 0.22, slit: 0, glow: 0,
      group: 'stylized', skin: 'rotten', sclera: 'yellow', iris: 'cloudy', lashes: 'sparse', veinMul: 1.8, crease: 0.45, lidAlpha: 0.6,
      rim: () => 'hsl(345,28%,32%)'
    },
    {
      id: 'cyborg', name: 'Cyborg',
      desc: 'A mechanical eye with a spinning camera aperture and glowing LED ring in a riveted steel face.',
      irisHue: 0, irisSat: 100, skinHue: 210, skinS: 8, skinL: 30,
      size: 1, open: 1, irisSize: 0.4, lookScale: 0.9, pupil: 0.35, slit: 0, glow: 0.7,
      group: 'stylized', skin: 'metal', sclera: 'metal', iris: 'aperture', lashes: 'none', veinMul: 0, crease: 0.6, lidAlpha: 0.82,
      rim: () => '#a9b2bc'
    },
    {
      id: 'corpse', name: 'Hollow Corpse',
      desc: 'A realistic dead human eye: grey waxy skin, a sunken bruised socket, bloodshot white and a faded iris.',
      irisHue: 200, irisSat: 16, skinHue: 205, skinS: 9, skinL: 60,
      size: 0.8, open: 0.8, irisSize: 0.37, lookScale: 0.85, pupil: 0.46, slit: 0, glow: 0,
      group: 'realistic', photoHL: true, skin: 'human', corpse: true, sclera: 'human', iris: 'photo', lashes: 'sparse',
      veinMul: 1.7, crease: 0.2, lidAlpha: 0.08, shadow: 1.25, rimW: 0.011, caruncle: true,
      rim: () => 'hsl(340,16%,46%)'
    },
    {
      id: 'wolf', name: 'Wolf',
      desc: 'A realistic amber wolf eye with a black lid margin, peering out of thick grey fur.',
      irisHue: 36, irisSat: 85, skinHue: 30, skinS: 12, skinL: 40,
      size: 0.9, open: 0.78, irisSize: 0.6, lookScale: 0.5, pupil: 0.36, slit: 0, glow: 0,
      group: 'realistic', photoHL: true, skin: 'fur', fur: 'wolf', sclera: 'animal', iris: 'photo', lashes: 'none',
      veinMul: 0.15, crease: 0.1, lidAlpha: 0.06, shadow: 1.15, rimW: 0.032, rimSoft: true, innerShift: 12,
      rim: () => '#070504'
    },
    {
      id: 'goat', name: 'Goat',
      desc: 'A realistic goat eye: pale gold iris and a horizontal bar pupil. Deeply unsettling up close.',
      irisHue: 44, irisSat: 68, skinHue: 34, skinS: 20, skinL: 62,
      size: 0.9, open: 0.8, irisSize: 0.7, lookScale: 0.35, pupil: 0.3, slit: 0, glow: 0, pupilShape: 'hbar',
      group: 'realistic', photoHL: true, skin: 'fur', fur: 'goat', sclera: 'animal', iris: 'photo', lashes: 'fine',
      lashColor: '#4a3624', veinMul: 0.15, crease: 0.12, lidAlpha: 0.06, shadow: 1.1, rimW: 0.02, rimSoft: true, innerShift: -8,
      rim: () => '#1c130c'
    },
    {
      id: 'octopus', name: 'Octopus',
      desc: 'A realistic cephalopod eye with a bar-shaped pupil, set in wet, mottled, speckled skin.',
      irisHue: 38, irisSat: 50, skinHue: 12, skinS: 45, skinL: 32,
      size: 0.95, open: 0.85, irisSize: 0.6, lookScale: 0.45, pupil: 0.3, slit: 0, glow: 0, pupilShape: 'hbar',
      group: 'realistic', photoHL: true, skin: 'octo', sclera: 'iris', iris: 'photo', lashes: 'none',
      veinMul: 0, crease: 0.1, lidAlpha: 0.08, shadow: 1.1, rimW: 0.02, rimSoft: true, innerShift: 6,
      rim: sk => `hsl(${sk},40%,16%)`
    },
    {
      id: 'cat', name: 'Black Cat',
      desc: 'A realistic cat eye: luminous green-gold iris and a vertical slit pupil in sleek black fur.',
      irisHue: 66, irisSat: 82, skinHue: 240, skinS: 8, skinL: 13,
      size: 0.9, open: 0.95, irisSize: 0.66, lookScale: 0.42, pupil: 0.62, slit: 0.92, glow: 0.12,
      group: 'realistic', photoHL: true, skin: 'fur', fur: 'cat', sclera: 'iris', iris: 'photo', lashes: 'none',
      veinMul: 0, crease: 0.1, lidAlpha: 0.06, shadow: 1.15, rimW: 0.03, rimSoft: true, innerShift: 28,
      rim: () => '#040404'
    },
    {
      id: 'vampire', name: 'Vampire',
      desc: 'A realistic undead eye: porcelain skin, a shadowed socket, dark lashes and a glowing blood-red iris.',
      irisHue: 356, irisSat: 88, skinHue: 250, skinS: 8, skinL: 70,
      size: 0.8, open: 0.7, irisSize: 0.37, lookScale: 0.85, pupil: 0.26, slit: 0, glow: 0.3,
      group: 'realistic', photoHL: true, skin: 'human', socket: 'rgba(55,15,60,.6)', sclera: 'human', iris: 'photo', lashes: 'fine',
      veinMul: 0.8, crease: 0.25, lidAlpha: 0.1, shadow: 1.1, rimW: 0.011, caruncle: true, innerShift: 20,
      rim: () => 'hsl(350,40%,45%)'
    },
    {
      id: 'clown', name: 'Creepy Clown',
      desc: 'Cracked white greasepaint, a blue diamond painted through the eye and a sickly yellow iris.',
      irisHue: 52, irisSat: 90, skinHue: 40, skinS: 8, skinL: 86,
      size: 0.8, open: 0.78, irisSize: 0.37, lookScale: 0.85, pupil: 0.24, slit: 0, glow: 0.2,
      group: 'realistic', photoHL: true, skin: 'clown', sclera: 'human', iris: 'photo', lashes: 'fine',
      veinMul: 1.1, crease: 0.25, lidAlpha: 0.05, shadow: 1, rimW: 0.012, caruncle: true, innerShift: -16,
      rim: () => 'hsl(355,45%,42%)'
    },
    {
      id: 'mummy', name: 'Mummy',
      desc: 'A dry amber eye glaring out of a gap in dusty, fraying linen wrappings.',
      irisHue: 38, irisSat: 85, skinHue: 28, skinS: 28, skinL: 22,
      size: 0.9, open: 0.8, irisSize: 0.36, lookScale: 0.9, pupil: 0.26, slit: 0, glow: 0.35,
      group: 'stylized', skin: 'bandage', sclera: 'yellow', iris: 'fibers', lashes: 'none', veinMul: 1.3, crease: 0.5, lidAlpha: 0.85,
      rim: () => 'hsl(20,35%,12%)'
    },
    {
      id: 'pumpkin', name: "Jack-o'-Lantern",
      desc: 'An eye carved into a pumpkin: thick orange rind, flickering candlelight inside and a flame for an iris.',
      irisHue: 16, irisSat: 100, skinHue: 26, skinS: 85, skinL: 33,
      size: 1, open: 1, irisSize: 0.34, lookScale: 1, pupil: 0.34, slit: 0, glow: 0.7,
      group: 'stylized', skin: 'pumpkin', sclera: 'candle', iris: 'fire', lashes: 'none', veinMul: 0, crease: 0, lidAlpha: 0.3, rimW: 0.05,
      rim: () => 'hsl(40,88%,60%)'
    },
    {
      id: 'spider', name: 'Giant Spider',
      desc: 'A cluster of glossy black eyes in bristling dark hair. The big one in the middle is looking at you.',
      irisHue: 352, irisSat: 90, skinHue: 22, skinS: 20, skinL: 15,
      size: 0.78, open: 1.25, irisSize: 0.6, lookScale: 0.4, pupil: 0.46, slit: 0, glow: 0.35,
      group: 'stylized', skin: 'spider', fur: 'spider', sclera: 'black', iris: 'orb', lashes: 'none', veinMul: 0, crease: 0.2, lidAlpha: 0.85, rimW: 0.03,
      rim: () => '#020202'
    },
    {
      id: 'alien', name: 'Alien',
      desc: 'A huge dark eye in smooth grey skin, with a slowly turning galaxy where the iris should be.',
      irisHue: 265, irisSat: 85, skinHue: 150, skinS: 10, skinL: 40,
      size: 1, open: 0.95, irisSize: 0.62, lookScale: 0.5, pupil: 0.22, slit: 0, glow: 0.5,
      group: 'stylized', skin: 'alien', sclera: 'void', iris: 'galaxy', lashes: 'none', veinMul: 0, crease: 0.35, lidAlpha: 0.82,
      rim: sk => `hsl(${sk},15%,10%)`
    }
  ];

  // ---------- config ----------
  const DEFAULT_CONFIG = {
    enabled: {},          // id -> false to exclude (missing = included)
    durations: {},        // id -> seconds (missing = animation default)
    order: 'shuffle',     // 'shuffle' | 'sequence'
    blinkTransition: true,
    irisHue: 95,          // toxic green
    irisSat: 90,
    skinHue: 320,
    eyeSize: 1.0,
    lashes: true,
    veins: 0.35,
    renderScale: 1,       // lower = faster on older Pis
    fpsCap: 60,
    showHints: true,
    eyeType: 'classic',   // an EYE_TYPES id, or 'rotate' / 'rotate-realistic' / 'rotate-stylized'
    rotateEvery: 3,       // animations per eye type in rotate mode
    previewId: null,
    previewNonce: 0
  };

  function mergeConfig(c) {
    const out = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    if (c && typeof c === 'object') {
      for (const k in c) if (k in out && k !== 'enabled' && k !== 'durations') out[k] = c[k];
      out.enabled = Object.assign({}, c.enabled || {});
      out.durations = Object.assign({}, c.durations || {});
    }
    return out;
  }

  const STORAGE_KEY = 'monsterEyeConfig.v1';
  const Store = {
    hasServer: /^https?:/.test(location.protocol),
    local() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (e) { return null; } },
    saveLocal(c) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch (e) { /* ignore */ } },
    async fetchServer() {
      if (!this.hasServer) return null;
      try {
        const r = await fetch('api/config', { cache: 'no-store' });
        if (!r.ok) return null;
        const j = await r.json();
        return j && typeof j === 'object' && Object.keys(j).length ? j : null;
      } catch (e) { return null; }
    },
    async saveServer(c) {
      if (!this.hasServer) return false;
      try {
        const r = await fetch('api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(c) });
        return r.ok;
      } catch (e) { return false; }
    },
    async shutdown() {   // stops the server; start.sh then closes the eye's browser too
      if (!this.hasServer) return false;
      try {
        const r = await fetch('api/shutdown', { method: 'POST', headers: { 'X-Monster-Eye': 'shutdown' } });
        return r.ok;
      } catch (e) { return false; }
    },
    async load() {
      const s = await this.fetchServer();
      if (s) return { cfg: mergeConfig(s), source: 'server' };
      return { cfg: mergeConfig(this.local()), source: 'local' };
    }
  };

  // ---------- engine ----------
  function start(canvas) {
    const ctx = canvas.getContext('2d', { alpha: false });
    let cfg = mergeConfig(null);
    let T = EYE_TYPES[0];

    let W = 1, H = 1, cx = 0, cy = 0, Rw = 1, H0 = 1;
    let veinCv = null, skinCv = null;
    const tex = {};           // lazily built iris textures
    let skinCache = {};
    let lashList = [];

    const BASE = {
      lookX: 0, lookY: 0, pupil: 0.38, slit: 0, hue: 95, sat: 90,
      lid: 1, lidTop: 1, lidBot: 1, blood: 0, shake: 0, scale: 1,
      spiral: 0, multi: 0, glow: 0.25, dim: 0,
      nict: 0, glyph: 0, rem: 0, hud: 0, grow: 0
    };
    const SPEEDS = {
      lookX: 14, lookY: 14, pupil: 4, slit: 3, hue: 2.5, sat: 3,
      lid: 8, lidTop: 8, lidBot: 8, blood: 2.5, shake: 6, scale: 6,
      spiral: 2.5, multi: 3, glow: 3, dim: 3,
      nict: 14, glyph: 3, rem: 4, hud: 6, grow: 5
    };
    const cur = Object.assign({}, BASE);
    let rot = 0, clock = 0, lastDraw = 0;
    const fx = {
      flashA: 0, flashColor: '255,255,255', flashDecay: 4, glitch: 0, drips: [], dripAlpha: 0,
      cracks: [], crackAlpha: 0, critter: null, glyph: 'pumpkin', glyphScale: 1, glyphT: 0, hudLock: 0, hudAng: 0
    };
    let irisX = 0, irisY = 0;   // where the iris was last drawn, for overlays
    const sac = { next: 0, x: 0, y: 0 };
    const blk = { start: -10, dur: 0.16, next: 2 };
    const swap = { start: -10, dur: 0.6 };
    let pendingType = null, typeBag = [], actsSinceType = 0;
    let act = null, bag = [], paused = false;
    const listeners = [];

    // colors come from the settings sliders, unless we're rotating types
    // (or showing a type other than the chosen one), then from the type itself
    function colors() {
      const own = cfg.eyeType !== T.id;
      return {
        hue: own ? T.irisHue : +cfg.irisHue,
        sat: own ? T.irisSat : +cfg.irisSat,
        sk: own ? T.skinHue : +cfg.skinHue
      };
    }

    // ----- iris textures -----
    function newTex(S) { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); g.translate(S / 2, S / 2); return [c, g, S / 2]; }

    function makeFibers() {
      const [c, g, R] = newTex(512);
      for (let i = 0; i < 900; i++) {
        const a = Math.random() * TAU, r0 = R * rand(0.12, 0.35), r1 = R * rand(0.6, 0.98), wob = rand(-0.08, 0.08);
        g.strokeStyle = Math.random() < 0.5 ? `rgba(255,250,220,${rand(0.05, 0.22)})` : `rgba(0,0,0,${rand(0.08, 0.3)})`;
        g.lineWidth = rand(0.8, 3.2);
        g.beginPath();
        g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        g.quadraticCurveTo(Math.cos(a + wob) * (r0 + r1) / 2, Math.sin(a + wob) * (r0 + r1) / 2,
          Math.cos(a + wob * 0.3) * r1, Math.sin(a + wob * 0.3) * r1);
        g.stroke();
      }
      g.beginPath();
      for (let i = 0; i <= 120; i++) {
        const a = i / 120 * TAU, r = R * (0.42 + 0.05 * Math.sin(a * 9) + rand(-0.02, 0.02));
        i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath(); g.strokeStyle = 'rgba(255,240,200,.3)'; g.lineWidth = 5; g.stroke();
      for (let i = 0; i < 45; i++) {
        const a = Math.random() * TAU, r = R * rand(0.45, 0.85);
        g.fillStyle = `rgba(0,0,0,${rand(0.15, 0.35)})`;
        g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r, R * rand(0.015, 0.04), R * rand(0.04, 0.09), a, 0, TAU); g.fill();
      }
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * TAU, r = R * rand(0.4, 0.9);
        g.fillStyle = `rgba(90,35,0,${rand(0.2, 0.4)})`;
        g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, R * rand(0.01, 0.03), 0, TAU); g.fill();
      }
      return c;
    }

    function makeHumanIris() {
      const [c, g, R] = newTex(768);
      g.lineCap = 'round';
      // thousands of fine wavy stroma fibers
      for (let i = 0; i < 3200; i++) {
        const a = Math.random() * TAU, r0 = R * rand(0.14, 0.3), r1 = R * rand(0.55, 0.97);
        const light = Math.random() < 0.55;
        g.strokeStyle = light ? `rgba(255,252,240,${rand(0.03, 0.12)})` : `rgba(0,0,0,${rand(0.04, 0.16)})`;
        g.lineWidth = rand(0.5, 1.8);
        g.beginPath();
        let x = Math.cos(a) * r0, y = Math.sin(a) * r0; g.moveTo(x, y);
        const n = 6, ph = rand(0, TAU);
        for (let k = 1; k <= n; k++) {
          const r = lerp(r0, r1, k / n), aa = a + 0.025 * Math.sin(ph + k * 1.7);
          g.lineTo(Math.cos(aa) * r, Math.sin(aa) * r);
        }
        g.stroke();
      }
      // collarette: bright zig-zag ring around the pupil zone
      g.beginPath();
      for (let i = 0; i <= 180; i++) {
        const a = i / 180 * TAU, r = R * (0.36 + 0.035 * Math.sin(a * 23) + rand(-0.012, 0.012));
        i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath(); g.strokeStyle = 'rgba(255,245,220,.22)'; g.lineWidth = 4; g.stroke();
      // crypts (dark pits) just outside the collarette
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * TAU, r = R * rand(0.4, 0.62);
        g.fillStyle = `rgba(0,0,0,${rand(0.08, 0.22)})`;
        g.beginPath(); g.ellipse(Math.cos(a) * r, Math.sin(a) * r, R * rand(0.008, 0.02), R * rand(0.025, 0.06), a, 0, TAU); g.fill();
      }
      // contraction furrows
      for (const f of [0.72, 0.8, 0.87]) {
        g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2;
        const s = rand(0, TAU);
        g.beginPath(); g.arc(0, 0, R * f, s, s + rand(2, 5)); g.stroke();
      }
      return c;
    }

    function makeCracks() {
      const [c, g, R] = newTex(640);
      g.lineCap = 'round';
      function br(x, y, a, len, w, d) {
        const step = R * 0.02, n = Math.floor(len / step);
        for (let i = 0; i < n; i++) {
          a += rand(-0.3, 0.3);
          const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
          g.lineWidth = Math.max(0.6, w); g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
          x = nx; y = ny; w *= 0.96;
          if (d < 2 && Math.random() < 0.1) br(x, y, a + rand(-0.8, 0.8), len * 0.4, w * 0.7, d + 1);
        }
      }
      g.strokeStyle = 'rgba(40,10,0,.55)';
      for (let i = 0; i < 70; i++) {
        const a = Math.random() * TAU;
        br(Math.cos(a) * R * 0.1, Math.sin(a) * R * 0.1, a + rand(-0.2, 0.2), R * rand(0.4, 0.9), rand(1.5, 4), 0);
      }
      for (let i = 0; i < 400; i++) {
        const a = Math.random() * TAU, r = R * Math.sqrt(Math.random()) * 0.95;
        g.fillStyle = Math.random() < 0.6 ? `rgba(30,5,0,${rand(0.2, 0.5)})` : `rgba(255,240,160,${rand(0.15, 0.4)})`;
        g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, rand(1, 4), 0, TAU); g.fill();
      }
      return c;
    }

    function makeGalaxy() {
      const [c, g, R] = newTex(512);
      for (let i = 0; i < 60; i++) {           // nebula clouds along two spiral arms
        const u = Math.random(), a = (i % 2) * Math.PI + u * 5 + rand(-0.3, 0.3), r = R * (0.15 + 0.75 * u), s = R * rand(0.1, 0.24);
        const x = Math.cos(a) * r, y = Math.sin(a) * r, ng = g.createRadialGradient(x, y, 0, x, y, s);
        const col = Math.random() < 0.5 ? '190,150,255' : '120,200,255';
        ng.addColorStop(0, `rgba(${col},.14)`); ng.addColorStop(1, `rgba(${col},0)`);
        g.fillStyle = ng; g.fillRect(x - s, y - s, s * 2, s * 2);
      }
      for (let i = 0; i < 1500; i++) {         // stars, denser along the arms
        const u = Math.random(), arm = Math.random() < 0.75;
        const a = arm ? (i % 2) * Math.PI + u * 5 + rand(-0.35, 0.35) * (1.2 - u) : Math.random() * TAU;
        const r = R * (arm ? 0.15 + 0.8 * u : Math.sqrt(Math.random()) * 0.97);
        g.fillStyle = `rgba(255,${Math.round(rand(220, 255))},${Math.round(rand(200, 255))},${rand(0.15, 0.9)})`;
        g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, Math.random() < 0.04 ? rand(1.6, 2.6) : rand(0.5, 1.3), 0, TAU); g.fill();
      }
      return c;
    }

    function getTex(name) {
      if (!tex[name]) tex[name] = ({ human: makeHumanIris, cracks: makeCracks, galaxy: makeGalaxy }[name] || makeFibers)();
      return tex[name];
    }

    function makeVeins() {
      const w = Math.ceil(Rw * 2.3), h = Math.ceil(Rw * 1.7), c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      g.translate(w / 2, h / 2);
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(165,15,25,.75)';
      g.shadowColor = 'rgba(210,0,0,.5)'; g.shadowBlur = 3;
      const step = Rw * 0.018;
      function branch(x, y, ang, len, wd, depth) {
        const n = Math.max(2, Math.floor(len / step));
        for (let i = 0; i < n; i++) {
          ang += rand(-0.35, 0.35);
          const nx = x + Math.cos(ang) * step, ny = y + Math.sin(ang) * step;
          g.lineWidth = Math.max(0.6, wd);
          g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
          x = nx; y = ny; wd *= 0.965;
          if (depth < 3 && Math.random() < 0.11) branch(x, y, ang + rand(-0.9, 0.9), len * rand(0.3, 0.6) * (1 - i / n), wd * 0.65, depth + 1);
        }
      }
      const thin = T.sclera === 'human' ? 0.6 : 1;
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * TAU, x = Math.cos(a) * Rw * 1.02, y = Math.sin(a) * H0 * 1.35;
        branch(x, y, Math.atan2(-y, -x) + rand(-0.45, 0.45), Rw * rand(0.25, 0.6), Rw * rand(0.006, 0.013) * thin, 0);
      }
      return c;
    }

    // ----- skins (pre-rendered once per type/size) -----
    function radialBg(g, stops) {
      const bg = g.createRadialGradient(cx, cy, Rw * 0.3, cx, cy, Math.max(W, H) * 0.78);
      stops.forEach(([o, c]) => bg.addColorStop(o, c));
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
    }
    function outsideEye(x, y, m) {
      const dx = (x - cx) / (Rw * 1.15 * m), dy = (y - cy) / (H0 * 2.1 * m);
      return dx * dx + dy * dy >= 1;
    }
    function crackPath(g, x, y, a, len, w, d, glow) {
      const step = Rw * 0.02, n = Math.floor(len / step);
      for (let i = 0; i < n; i++) {
        a += rand(-0.45, 0.45);
        const nx = x + Math.cos(a) * step, ny = y + Math.sin(a) * step;
        g.lineWidth = Math.max(0.7, w);
        g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
        x = nx; y = ny; w *= 0.97;
        if (d < 2 && Math.random() < 0.08) crackPath(g, x, y, a + rand(-1, 1), len * 0.45, w * 0.7, d + 1, glow);
      }
    }

    function skinWarty(g, sk, S, L) {
      radialBg(g, [[0, `hsl(${sk},${S + 2}%,${L + 2}%)`], [0.35, `hsl(${sk},${S}%,${L * 0.67}%)`], [0.75, `hsl(${sk},${S - 2}%,${L * 0.3}%)`], [1, '#020001']]);
      for (let i = 0; i < 2200; i++) {
        g.fillStyle = `rgba(0,0,0,${rand(0.1, 0.3)})`;
        g.fillRect(Math.random() * W, Math.random() * H, rand(1, 2.5), rand(1, 2.5));
      }
      g.lineCap = 'round';
      for (let k = 1; k <= 7; k++) {
        const rx = Rw * (1.08 + k * 0.11), ry = H0 * (1.9 + k * 0.3);
        for (let j = 0; j < 3; j++) {
          const s = rand(0, TAU), e = s + rand(0.3, 1.1);
          g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = Rw * rand(0.008, 0.016);
          g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, s, e); g.stroke();
          g.strokeStyle = `hsla(${sk},40%,60%,.07)`; g.lineWidth = Rw * 0.006;
          g.beginPath(); g.ellipse(cx, cy + Rw * 0.01, rx, ry, 0, s, e); g.stroke();
        }
      }
      for (let i = 0; i < 70; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        if (!outsideEye(x, y, 1)) continue;
        const r = Rw * rand(0.01, 0.05);
        const wg = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
        wg.addColorStop(0, `hsla(${sk},${S}%,${L * 1.6}%,.9)`);
        wg.addColorStop(0.7, `hsla(${sk},${S}%,${L * 0.58}%,.8)`);
        wg.addColorStop(1, `hsla(${sk},${S}%,${L * 0.33}%,0)`);
        g.fillStyle = wg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
    }

    function skinHuman(g, sk, S, L) {
      radialBg(g, [[0, `hsl(${sk},${S}%,${L * 0.95}%)`], [0.3, `hsl(${sk},${S}%,${L * 0.82}%)`], [0.65, `hsl(${sk},${S * 0.9}%,${L * 0.45}%)`], [1, `hsl(${sk},${S * 0.8}%,${L * 0.1}%)`]]);
      // soft mottling
      for (let i = 0; i < 260; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = Rw * rand(0.05, 0.25);
        const mg = g.createRadialGradient(x, y, 0, x, y, r);
        const c = Math.random() < 0.5 ? `hsla(${sk - 8},${S + 10}%,${L * 0.85}%,` : `hsla(${sk + 6},${S}%,${L * 1.08}%,`;
        mg.addColorStop(0, c + '.08)'); mg.addColorStop(1, c + '0)');
        g.fillStyle = mg; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      noiseOverlay(g, T.corpse ? 0.45 : 0.3, Rw / 90);
      // eye-socket shadow (a deep bruised hollow on the corpse)
      g.save(); g.translate(cx, cy); g.scale(1, 0.62);
      let sg = g.createRadialGradient(0, 0, Rw * 0.8, 0, 0, Rw * (T.corpse ? 1.9 : 1.7));
      sg.addColorStop(0, T.socket || (T.corpse ? 'rgba(45,25,55,.62)' : 'rgba(70,30,25,.3)')); sg.addColorStop(1, 'rgba(45,25,40,0)');
      g.fillStyle = sg; g.fillRect(-Rw * 2, -Rw * 2, Rw * 4, Rw * 4);
      g.restore();
      // pores
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = `rgba(90,45,35,${rand(0.04, 0.12)})`;
        g.fillRect(Math.random() * W, Math.random() * H, rand(1, 2), rand(1, 2));
      }
      // crow's feet at the outer (right) corner and fine lines under the eye
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(95,45,35,.18)'; g.lineWidth = Rw * 0.005;
      for (let i = 0; i < 7; i++) {
        const a = rand(-0.7, 0.7), x0 = cx + Rw * rand(1.08, 1.15), y0 = cy + Rw * a * 0.2;
        g.beginPath(); g.moveTo(x0, y0);
        g.quadraticCurveTo(x0 + Rw * 0.12, y0 + Rw * a * 0.15, x0 + Rw * rand(0.2, 0.3), y0 + Rw * a * 0.35); g.stroke();
      }
      for (let i = 0; i < 3; i++) {
        const y0 = cy + H0 * (1.05 + i * 0.22);
        g.beginPath(); g.ellipse(cx + Rw * 0.1, y0 - H0 * 0.6, Rw * (0.7 - i * 0.08), H0 * 0.6, 0, 0.35, Math.PI - 0.5); g.stroke();
      }
      if (T.corpse) {   // visible veins under waxy skin
        g.strokeStyle = 'rgba(70,60,120,.22)';
        for (let i = 0; i < 16; i++) {
          const a = rand(-1, 1) + (i % 2 ? Math.PI : 0);
          crackPath(g, cx + Math.cos(a) * Rw * 1.2, cy + Math.sin(a) * H0 * 2.4, a + rand(-0.5, 0.5), Rw * rand(0.3, 0.7), Rw * 0.006, 0);
        }
      }
      noiseOverlay(g, 0.25, Rw / 600);
      // eyebrow: inner end (left) thicker, hairs sweep up-and-out
      for (let i = 0; i < (T.corpse ? 500 : 1100); i++) {
        const u = Math.random();
        const x = cx + Rw * (-1.02 + 2.15 * u);
        const th = Rw * (0.1 * (1 - u) + 0.035);
        const y = cy - Rw * (0.66 + 0.16 * Math.sin(Math.PI * Math.pow(u, 1.35))) + rand(-0.5, 0.5) * th;
        const a = lerp(-1.15, -0.12, u) + rand(-0.15, 0.15), len = Rw * rand(0.035, 0.07);
        g.strokeStyle = T.corpse ? `hsla(30,6%,${rand(25, 45)}%,${rand(0.3, 0.6)})` : `hsla(25,35%,${rand(9, 20)}%,${rand(0.35, 0.8)})`;
        g.lineWidth = Math.max(0.8, Rw * rand(0.003, 0.005));
        g.beginPath(); g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a) * len * 0.6, y + Math.sin(a) * len * 0.6 - len * 0.1, x + Math.cos(a) * len, y + Math.sin(a) * len + len * 0.15);
        g.stroke();
      }
    }

    function skinScales(g, sk, S, L) {
      radialBg(g, [[0, `hsl(${sk},${S}%,${L * 1.2}%)`], [0.6, `hsl(${sk},${S}%,${L * 0.5}%)`], [1, '#010201']]);
      const s = Rw * 0.08, rows = Math.ceil(H / (s * 0.62)) + 2;
      for (let row = rows; row >= -1; row--) {
        const y = row * s * 0.62;
        for (let x = -s; x < W + s; x += s) {
          const xx = x + (row % 2 ? s / 2 : 0);
          const d = Math.min(1, Math.hypot((xx - cx) / (W * 0.6), (y - cy) / (H * 0.6)));
          const sg = g.createRadialGradient(xx - s * 0.1, y - s * 0.05, s * 0.05, xx, y, s * 0.6);
          const l = L * (1.7 - d * 1.1) * rand(0.85, 1.15);
          sg.addColorStop(0, `hsl(${sk + rand(-12, 12)},${S}%,${l}%)`);
          sg.addColorStop(1, `hsl(${sk},${S}%,${l * 0.35}%)`);
          g.fillStyle = sg;
          g.beginPath(); g.arc(xx, y, s * 0.56, 0, Math.PI); g.closePath(); g.fill();
          g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = s * 0.06; g.stroke();
        }
      }
      // bony brow ridge
      g.beginPath();
      g.moveTo(cx - Rw * 1.25, cy - H0 * 0.9);
      g.quadraticCurveTo(cx, cy - H0 * 3.1, cx + Rw * 1.3, cy - H0 * 1.3);
      g.quadraticCurveTo(cx + Rw * 0.2, cy - H0 * 2.2, cx - Rw * 1.25, cy - H0 * 0.9);
      const rg = g.createLinearGradient(0, cy - H0 * 2.2, 0, cy - H0 * 1.2);
      rg.addColorStop(0, `hsl(${sk},${S * 0.6}%,${L * 1.6}%)`); rg.addColorStop(1, `hsl(${sk},${S * 0.6}%,${L * 0.4}%)`);
      g.fillStyle = rg; g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = Rw * 0.01; g.stroke();
      for (let i = 0; i < 4; i++) {        // spikes along the ridge
        const u = 0.2 + i * 0.2, x = lerp(cx - Rw * 1.0, cx + Rw * 1.1, u);
        const y = cy - H0 * (1.7 + 0.5 * Math.sin(Math.PI * u));
        const h = Rw * (0.1 + 0.05 * Math.sin(Math.PI * u));
        const sp = g.createLinearGradient(x, y, x, y - h);
        sp.addColorStop(0, `hsl(40,20%,${L * 1.2}%)`); sp.addColorStop(1, 'hsl(45,30%,75%)');
        g.fillStyle = sp;
        g.beginPath(); g.moveTo(x - Rw * 0.04, y); g.quadraticCurveTo(x + Rw * 0.02, y - h * 0.6, x + Rw * 0.05, y - h); g.lineTo(x + Rw * 0.04, y + Rw * 0.01); g.closePath(); g.fill();
      }
    }

    function skinCharred(g, sk, S, L) {
      radialBg(g, [[0, `hsl(${sk},${S}%,${L * 1.4}%)`], [0.45, `hsl(${sk},${S}%,${L * 0.6}%)`], [1, '#000']]);
      for (let i = 0; i < 900; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = Rw * rand(0.01, 0.06);
        g.fillStyle = `rgba(0,0,0,${rand(0.1, 0.3)})`;
        g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      g.lineCap = 'round';
      g.strokeStyle = 'hsl(22,100%,48%)'; g.shadowColor = 'rgba(255,80,0,.9)'; g.shadowBlur = Rw * 0.03;
      for (let i = 0; i < 24; i++) {   // glowing lava cracks radiating from the socket
        const a = Math.random() * TAU;
        crackPath(g, cx + Math.cos(a) * Rw * rand(1.1, 1.3), cy + Math.sin(a) * H0 * rand(1.9, 2.3), a + rand(-0.5, 0.5), Rw * rand(0.4, 1.3), Rw * 0.01, 0);
      }
      g.shadowBlur = 0;
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        if (!outsideEye(x, y, 1)) continue;
        const r = Rw * rand(0.003, 0.01);
        const eg = g.createRadialGradient(x, y, 0, x, y, r * 4);
        eg.addColorStop(0, 'rgba(255,190,80,.9)'); eg.addColorStop(0.3, 'rgba(255,90,0,.5)'); eg.addColorStop(1, 'rgba(255,40,0,0)');
        g.fillStyle = eg; g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
      }
    }

    function skinRotten(g, sk, S, L) {
      radialBg(g, [[0, `hsl(${sk},${S}%,${L}%)`], [0.4, `hsl(${sk},${S}%,${L * 0.6}%)`], [0.8, `hsl(${sk - 25},${S}%,${L * 0.18}%)`], [1, '#000']]);
      const bruise = ['hsla(285,30%,28%,', 'hsla(55,45%,45%,', 'hsla(20,40%,18%,', 'hsla(350,35%,25%,'];
      for (let i = 0; i < 55; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = Rw * rand(0.08, 0.35);
        const bg = g.createRadialGradient(x, y, 0, x, y, r), c = bruise[i % bruise.length];
        bg.addColorStop(0, c + rand(0.15, 0.35) + ')'); bg.addColorStop(1, c + '0)');
        g.fillStyle = bg; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      g.lineCap = 'round'; g.strokeStyle = 'rgba(55,20,65,.35)';
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * TAU;
        crackPath(g, cx + Math.cos(a) * Rw * 1.15, cy + Math.sin(a) * H0 * 2, a + rand(-0.6, 0.6), Rw * rand(0.3, 0.8), Rw * 0.007, 0);
      }
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = `rgba(20,15,5,${rand(0.08, 0.25)})`;
        g.fillRect(Math.random() * W, Math.random() * H, rand(1, 3), rand(1, 3));
      }
      // stitched gashes
      const gash = (x0, y0, x1, y1, bend) => {
        const mx = (x0 + x1) / 2 + bend * (y1 - y0), my = (y0 + y1) / 2 - bend * (x1 - x0);
        g.strokeStyle = 'rgb(55,6,12)'; g.lineWidth = Rw * 0.022;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
        g.strokeStyle = 'rgba(150,40,50,.5)'; g.lineWidth = Rw * 0.008; g.stroke();
        const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / (Rw * 0.07));
        for (let i = 1; i < n; i++) {
          const t = i / n, it = 1 - t;
          const x = it * it * x0 + 2 * it * t * mx + t * t * x1, y = it * it * y0 + 2 * it * t * my + t * t * y1;
          const dx = 2 * it * (mx - x0) + 2 * t * (x1 - mx), dy = 2 * it * (my - y0) + 2 * t * (y1 - my), l = Math.hypot(dx, dy);
          const nx = -dy / l, ny = dx / l, s = Rw * 0.045, sk2 = rand(-0.3, 0.3);
          g.strokeStyle = '#17120c'; g.lineWidth = Rw * 0.008;
          g.beginPath(); g.moveTo(x - nx * s + dx / l * s * sk2, y - ny * s + dy / l * s * sk2); g.lineTo(x + nx * s - dx / l * s * sk2, y + ny * s - dy / l * s * sk2); g.stroke();
        }
      };
      gash(cx + Rw * 0.5, cy - H0 * 2.6, cx + Rw * 1.55, cy + H0 * 0.6, -0.25);
      gash(cx - Rw * 1.6, cy + H0 * 1.4, cx - Rw * 0.7, cy + H0 * 2.6, 0.2);
    }

    function skinMetal(g, sk, S, L) {
      const lg = g.createLinearGradient(0, 0, 0, H);
      lg.addColorStop(0, `hsl(${sk},${S}%,${L * 1.5}%)`); lg.addColorStop(0.5, `hsl(${sk},${S}%,${L * 0.9}%)`); lg.addColorStop(1, `hsl(${sk},${S}%,${L * 0.45}%)`);
      g.fillStyle = lg; g.fillRect(0, 0, W, H);
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)';
        g.fillRect(Math.random() * W, Math.random() * H, rand(30, 200), 1);
      }
      const seam = (x0, y0, x1, y1) => {
        g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = Math.max(2, Rw * 0.008);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x0 + 2, y0 + 2); g.lineTo(x1 + 2, y1 + 2); g.stroke();
        const n = Math.floor(Math.hypot(x1 - x0, y1 - y0) / (Rw * 0.14));
        for (let i = 0; i <= n; i++) {
          const t = i / Math.max(1, n), x = lerp(x0, x1, t) + (x0 === x1 ? Rw * 0.04 : 0), y = lerp(y0, y1, t) + (y0 === y1 ? Rw * 0.04 : 0);
          const r = Rw * 0.013, rg = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
          rg.addColorStop(0, '#dfe5ea'); rg.addColorStop(0.6, '#6a737c'); rg.addColorStop(1, '#1d2125');
          g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
      };
      seam(cx - Rw * 1.45, 0, cx - Rw * 1.45, H); seam(cx + Rw * 1.5, 0, cx + Rw * 1.5, H);
      seam(0, cy - H0 * 2.3, W, cy - H0 * 2.3); seam(0, cy + H0 * 2.1, W, cy + H0 * 2.1);
      // socket ring with bolts
      g.strokeStyle = '#0d0f11'; g.lineWidth = Rw * 0.06;
      g.beginPath(); g.ellipse(cx, cy, Rw * 1.12, H0 * 1.55, 0, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = Rw * 0.012;
      g.beginPath(); g.ellipse(cx, cy, Rw * 1.17, H0 * 1.62, 0, 0, TAU); g.stroke();
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU + 0.3, x = cx + Math.cos(a) * Rw * 1.2, y = cy + Math.sin(a) * H0 * 1.68, r = Rw * 0.022;
        g.fillStyle = '#3b4148'; g.beginPath();
        for (let k = 0; k < 6; k++) { const b = k / 6 * TAU; k ? g.lineTo(x + Math.cos(b) * r, y + Math.sin(b) * r) : g.moveTo(x + Math.cos(b) * r, y + Math.sin(b) * r); }
        g.closePath(); g.fill(); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 1; g.stroke();
      }
      for (let i = 0; i < 3; i++) {   // status lights
        const x = cx + Rw * 1.3, y = cy + H0 * 1.25 + i * Rw * 0.06, r = Rw * 0.012;
        const lg2 = g.createRadialGradient(x, y, 0, x, y, r * 4);
        lg2.addColorStop(0, i === 2 ? 'rgba(80,255,120,1)' : 'rgba(255,60,40,1)'); lg2.addColorStop(0.3, i === 2 ? 'rgba(40,200,80,.5)' : 'rgba(255,0,0,.5)'); lg2.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = lg2; g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
      }
      radialVignette(g);
    }
    function radialVignette(g) {
      const v = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.4, cx, cy, Math.max(W, H) * 0.8);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.85)');
      g.fillStyle = v; g.fillRect(0, 0, W, H);
    }

    function noiseOverlay(g, strength, scale) {
      const pat = g.createPattern(noiseCanvas(), 'repeat');
      if (pat.setTransform && window.DOMMatrix) pat.setTransform(new DOMMatrix().rotate(27).scale(scale));
      g.save(); g.globalCompositeOperation = 'soft-light'; g.globalAlpha = strength;
      g.fillStyle = pat; g.fillRect(0, 0, W, H); g.restore();
    }

    function skinFur(g, sk, S, L) {
      const kind = T.fur, goat = kind === 'goat', dark = kind === 'cat' || kind === 'spider';
      radialBg(g, [[0, `hsl(${sk},${S}%,${L * 0.85}%)`], [0.5, `hsl(${sk},${S}%,${L * 0.55}%)`], [1, `hsl(${sk},${S * 0.8}%,${L * 0.1}%)`]]);
      noiseOverlay(g, 0.5, Rw / 110);
      const B = 12, paths = Array.from({ length: B }, () => new Path2D());
      const count = Math.round(W * H / ({ goat: 22, cat: 20, spider: 26 }[kind] || 18));
      const hair = Rw * ({ goat: 0.035, cat: 0.04, spider: 0.085 }[kind] || 0.05);
      for (let i = 0; i < count; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        const dx = (x - cx) / Rw, dy = (y - cy) / (H0 * 1.8), d = Math.hypot(dx, dy);
        if (d < 0.6) continue;
        // fur flows away from the eye and back toward the ear (right); spider bristles stick straight out
        const rx = (x - cx) / (d * Rw + 1), ry = (y - cy) / (d * Rw + 1);
        const ang = (kind === 'spider' ? Math.atan2(ry, rx) : Math.atan2(ry * 0.6 - 0.25, rx * 0.6 + 0.85)) + (fbm(x / W * 2.5, y / H * 2.5, 64, 64, 3, 41) - 0.5) * 1.1;
        const len = hair * (0.7 + 0.3 * Math.min(2, d)) * rand(0.7, 1.3);
        let b = 0.55 + (fbm(x / W * 5 + 3, y / H * 5, 64, 64, 3, 13) - 0.5) * 0.8 + rand(-0.12, 0.12);
        if (dark) b *= 0.65 + 0.45 * smooth(0.8, 1.9, d);
        else if (!goat) {
          b *= 0.4 + 0.8 * smooth(1.05, 2.0, d);                                   // dark mask around the eye
          const sx = (x - (cx + Rw)) / Rw, sy = (y - cy - (x - cx - Rw) * 0.35) / Rw;
          if (sx > 0 && sx < 1.3 && Math.abs(sy) < 0.05 + sx * 0.05) b *= 0.5;      // dark streak from the outer corner
          if (dy > 1.0 && dy < 2.3 && Math.abs(dx) < 0.9) b *= 1.3;                 // pale cheek
          if (dy < -1.3 && dy > -2.4 && dx > -0.9 && dx < 0.4) b *= 1.2;            // pale brow patch
        } else b *= 0.8 + 0.25 * smooth(0.9, 1.6, d);
        const k = clamp(Math.floor(b * B), 0, B - 1), p = paths[k];
        p.moveTo(x, y);
        p.quadraticCurveTo(x + Math.cos(ang + 0.25) * len * 0.5, y + Math.sin(ang + 0.25) * len * 0.5, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      }
      g.lineCap = 'round'; g.lineWidth = Math.max(0.8, Rw * (kind === 'spider' ? 0.0045 : 0.003)); g.globalAlpha = 0.45;
      paths.forEach((p, k) => { g.strokeStyle = `hsl(${sk},${S}%,${Math.min(92, L * (0.3 + (dark ? 1.9 : 1.05) * (k + 0.5) / B))}%)`; g.stroke(p); });
      g.globalAlpha = 1;
      radialVignette(g);
    }

    function skinOcto(g, sk, S, L) {
      radialBg(g, [[0, `hsl(${sk},${S}%,${L * 1.1}%)`], [0.55, `hsl(${sk},${S}%,${L * 0.6}%)`], [1, `hsl(${sk},${S}%,${L * 0.12}%)`]]);
      noiseOverlay(g, 0.9, Rw / 70);
      noiseOverlay(g, 0.5, Rw / 260);
      // chromatophores: thousands of tiny pigment dots
      const cols = [`hsl(${sk - 5},60%,12%)`, `hsl(${sk},60%,18%)`, `hsl(${sk + 4},55%,25%)`, `hsl(${sk + 10},55%,33%)`, `hsl(${sk + 22},50%,42%)`];
      const paths = cols.map(() => new Path2D()), n = Math.round(W * H / 180);
      for (let i = 0; i < n; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = Rw * rand(0.002, 0.008);
        const k = clamp(Math.floor(fbm(x / W * 6, y / H * 6, 64, 64, 2, 9) * cols.length * 1.3 - 0.4 + rand(-0.8, 0.8)), 0, cols.length - 1);
        paths[k].moveTo(x + r, y); paths[k].arc(x, y, r, 0, TAU);
      }
      g.globalAlpha = 0.55; cols.forEach((c, k) => { g.fillStyle = c; g.fill(paths[k]); }); g.globalAlpha = 1;
      // papillae bumps
      for (let i = 0; i < 160; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        if (!outsideEye(x, y, 0.9)) continue;
        const r = Rw * rand(0.02, 0.07);
        const pg = g.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.05, x, y, r);
        pg.addColorStop(0, 'rgba(255,225,200,.12)'); pg.addColorStop(0.55, 'rgba(0,0,0,0)'); pg.addColorStop(1, 'rgba(0,0,0,.14)');
        g.fillStyle = pg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      }
      // wet sheen
      for (let i = 0; i < 14; i++) {
        const x = Math.random() * W, y = Math.random() * H, r = Rw * rand(0.08, 0.2);
        const sg = g.createRadialGradient(x, y, 0, x, y, r);
        sg.addColorStop(0, 'rgba(255,255,255,.12)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = sg; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      radialVignette(g);
    }

    function skinSpider(g, sk, S, L) {
      skinFur(g, sk, S, L);
      // the smaller eyes of the cluster: glossy domes that never move or blink
      for (const [ux, uy, ur] of [[-1.3, -0.72, 0.26], [1.3, -0.72, 0.26], [-1.62, 0.08, 0.19], [1.62, 0.08, 0.19], [-1.15, 0.82, 0.17], [1.15, 0.82, 0.17]]) {
        const x = cx + ux * Rw, y = cy + uy * Rw, r = ur * Rw;
        let eg = g.createRadialGradient(x, y, r * 0.9, x, y, r * 1.35);
        eg.addColorStop(0, 'rgba(0,0,0,.85)'); eg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = eg; g.beginPath(); g.arc(x, y, r * 1.35, 0, TAU); g.fill();
        eg = g.createRadialGradient(x + r * 0.25, y + r * 0.3, r * 0.05, x, y, r);
        eg.addColorStop(0, 'hsl(352,85%,24%)'); eg.addColorStop(0.5, 'hsl(352,70%,7%)'); eg.addColorStop(1, '#000');
        g.fillStyle = eg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,.8)';
        g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.4, r * 0.2, r * 0.13, -0.5, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.beginPath(); g.ellipse(x + r * 0.34, y + r * 0.42, r * 0.07, r * 0.05, -0.5, 0, TAU); g.fill();
      }
    }

    function skinClown(g, sk, S, L) {
      radialBg(g, [[0, `hsl(${sk},${S}%,${L}%)`], [0.35, `hsl(${sk},${S}%,${L * 0.88}%)`], [0.7, `hsl(${sk},${S * 1.4}%,${L * 0.5}%)`], [1, `hsl(${sk},${S}%,${L * 0.08}%)`]]);
      noiseOverlay(g, 0.3, Rw / 90);
      // smudged dark greasepaint around the socket
      g.save(); g.translate(cx, cy); g.scale(1, 0.62);
      const sg = g.createRadialGradient(0, 0, Rw * 0.8, 0, 0, Rw * 1.6);
      sg.addColorStop(0, 'rgba(25,20,45,.55)'); sg.addColorStop(1, 'rgba(25,20,45,0)');
      g.fillStyle = sg; g.fillRect(-Rw * 2, -Rw * 2, Rw * 4, Rw * 4);
      g.restore();
      // thin painted-on brow, arched high
      g.lineCap = 'round'; g.strokeStyle = 'rgba(18,14,22,.85)';
      for (let i = 0; i < 24; i++) {
        const t0 = i / 24, t1 = (i + 1.2) / 24, pt = t => [cx + Rw * lerp(-0.98, 1.02, t), cy - Rw * (0.5 + 0.34 * Math.sin(Math.PI * Math.pow(t, 0.8)))];
        g.lineWidth = Rw * (0.012 + 0.03 * Math.sin(Math.PI * t0));
        g.beginPath(); g.moveTo(...pt(t0)); g.lineTo(...pt(t1)); g.stroke();
      }
      // blue diamond painted straight through the eye
      const tip = Math.min(H0 * 3.2, H * 0.47), hw = Rw * 0.5;
      const dg = g.createLinearGradient(0, cy - tip, 0, cy + tip);
      dg.addColorStop(0, 'hsla(218,80%,22%,.9)'); dg.addColorStop(0.5, 'hsla(212,85%,38%,.92)'); dg.addColorStop(1, 'hsla(218,80%,22%,.9)');
      g.fillStyle = dg; g.beginPath(); g.moveTo(cx - hw, cy);
      for (const sy of [-1, 1]) {   // over the top tip to the right side, then under the bottom tip and back
        g.quadraticCurveTo(cx + sy * hw * 0.25, cy + sy * tip * 0.45, cx, cy + sy * tip);
        g.quadraticCurveTo(cx - sy * hw * 0.25, cy + sy * tip * 0.45, cx - sy * hw, cy);
      }
      g.fill();
      // the paint is old: cracks, and flakes where skin shows through
      g.lineJoin = 'miter'; g.strokeStyle = 'rgba(60,50,48,.38)'; g.lineWidth = Math.max(0.8, Rw * 0.0035);
      g.beginPath();
      for (let i = 0; i < 70; i++) {       // craquelure: short straight runs with sharp turns and forks
        let x = Math.random() * W, y = Math.random() * H, a = rand(0, TAU);
        g.moveTo(x, y);
        for (let k = 0, n = Math.round(rand(3, 8)); k < n; k++) {
          a += rand(0.5, 1.3) * (Math.random() < 0.5 ? -1 : 1);
          x += Math.cos(a) * Rw * rand(0.03, 0.09); y += Math.sin(a) * Rw * rand(0.03, 0.09);
          g.lineTo(x, y);
          if (Math.random() < 0.35) { const b = a + rand(0.7, 1.6), l = Rw * rand(0.02, 0.06); g.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l); g.moveTo(x, y); }
        }
      }
      g.stroke();
      for (let i = 0; i < 80; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        if (!outsideEye(x, y, 0.8)) continue;
        g.fillStyle = `hsla(${rand(14, 26)},40%,${rand(48, 62)}%,${rand(0.3, 0.6)})`;
        g.beginPath(); g.ellipse(x, y, Rw * rand(0.008, 0.03), Rw * rand(0.005, 0.016), rand(0, TAU), 0, TAU); g.fill();
      }
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = `rgba(40,30,30,${rand(0.03, 0.1)})`;
        g.fillRect(Math.random() * W, Math.random() * H, rand(1, 2), rand(1, 2));
      }
      noiseOverlay(g, 0.25, Rw / 600);
      radialVignette(g);
    }

    function skinBandage(g, sk, S, L) {
      radialBg(g, [[0, `hsl(${sk},${S}%,${L * 1.15}%)`], [0.4, `hsl(${sk},${S}%,${L * 0.6}%)`], [1, '#000']]);
      g.lineCap = 'round'; g.strokeStyle = 'rgba(0,0,0,.4)';
      for (let i = 0; i < 40; i++) {     // dry, cracked skin in the gap
        const a = Math.random() * TAU;
        crackPath(g, cx + Math.cos(a) * Rw * rand(1.05, 1.3), cy + Math.sin(a) * H0 * rand(1.3, 2), a + rand(-0.6, 0.6), Rw * rand(0.15, 0.5), Rw * 0.006, 0);
      }
      // one linen strip: a band following a curve from the left edge, through (cx, yC), to the right edge
      const m = W * 0.05;
      const strip = (yL, yC, yR, h, lum) => {
        const edge = o => { g.moveTo(-m, yL + o); g.quadraticCurveTo(cx, yC + o, W + m, yR + o); };
        const band = () => {
          g.beginPath(); edge(-h / 2);
          g.lineTo(W + m, yR + h / 2); g.quadraticCurveTo(cx, yC + h / 2, -m, yL + h / 2); g.closePath();
        };
        g.save(); g.translate(0, h * 0.1); band(); g.fillStyle = 'rgba(0,0,0,.5)'; g.fill(); g.restore();   // cast shadow
        band(); g.fillStyle = `hsl(${rand(36, 44)},${rand(18, 28)}%,${lum}%)`; g.fill();
        g.save(); g.clip();
        g.lineWidth = 1;
        for (let j = 1; j < 16; j++) {          // weave: long threads...
          g.strokeStyle = `rgba(60,40,20,${rand(0.05, 0.16)})`;
          g.beginPath(); edge(lerp(-h / 2, h / 2, j / 16) + rand(-1, 1)); g.stroke();
        }
        g.strokeStyle = 'rgba(60,40,20,.07)'; g.beginPath();
        for (let x = -m; x < W + m; x += Math.max(3, Rw * 0.012)) {   // ...and cross threads
          const t = (x + m) / (W + 2 * m), y = (1 - t) * (1 - t) * yL + 2 * t * (1 - t) * yC + t * t * yR;
          g.moveTo(x, y - h / 2); g.lineTo(x, y + h / 2);
        }
        g.stroke();
        for (let j = 0; j < 5; j++) {           // old stains
          const x = Math.random() * W, t = (x + m) / (W + 2 * m), y = (1 - t) * (1 - t) * yL + 2 * t * (1 - t) * yC + t * t * yR, r = h * rand(0.5, 1.4);
          const bg = g.createRadialGradient(x, y, 0, x, y, r);
          bg.addColorStop(0, `hsla(${rand(22, 40)},45%,22%,${rand(0.12, 0.3)})`); bg.addColorStop(1, 'hsla(30,45%,22%,0)');
          g.fillStyle = bg; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        g.strokeStyle = 'rgba(255,245,220,.22)'; g.lineWidth = h * 0.16; g.beginPath(); edge(-h / 2); g.stroke();
        g.strokeStyle = 'rgba(30,18,8,.5)'; g.lineWidth = h * 0.3; g.beginPath(); edge(h / 2); g.stroke();
        g.restore();
        g.strokeStyle = `hsla(40,24%,${lum + 6}%,.7)`; g.lineWidth = Math.max(0.8, Rw * 0.003); g.beginPath();
        for (let j = 0; j < 46; j++) {          // frayed threads along both edges
          const x = Math.random() * W, t = (x + m) / (W + 2 * m), sd = j % 2 ? 1 : -1, l = h * rand(0.06, 0.22);
          const y = (1 - t) * (1 - t) * yL + 2 * t * (1 - t) * yC + t * t * yR + sd * h / 2;
          g.moveTo(x, y); g.quadraticCurveTo(x + rand(-1, 1) * l, y + sd * l * 0.6, x + rand(-1.5, 1.5) * l, y + sd * l);
        }
        g.stroke();
      };
      // layers of wrapping above and below; the ones framing the eye go on last
      const hS = H0 * 0.78, n = Math.ceil((H / 2 / H0 - 0.4) / 0.6) + 1;
      for (let k = n; k >= 1; k--) for (const s of [-1, 1]) {
        if (k === 1) {   // a loose diagonal wrap tucked under the framing strip
          const d = rand(0.9, 1.3) * (Math.random() < 0.5 ? -1 : 1);
          strip(cy + s * H0 * (2.05 + d), cy + s * H0 * 2.25, cy + s * H0 * (2.05 - d), hS * 0.9, rand(40, 52));
        }
        const j = k > 1 ? 1 : 0.25, tilt = rand(-0.55, 0.55) * H0 * j;
        const end = 0.78 + (k - 1) * 0.6, mid = 2.9 + (k - 1) * 0.6 + rand(-0.15, 0.15) * j;
        strip(cy + s * H0 * end + tilt, cy + s * H0 * mid, cy + s * H0 * end - tilt, hS * rand(0.9, 1.1), rand(44, 60) - k * 2);
      }
      noiseOverlay(g, 0.35, Rw / 80);
      radialVignette(g);
    }

    function skinPumpkin(g, sk, S, L) {
      g.fillStyle = `hsl(${sk},${S}%,${L * 0.4}%)`; g.fillRect(0, 0, W, H);
      // ribs, bulging at eye height
      const rw = Rw * 0.48, n = Math.ceil(W / rw / 2) + 2;
      for (let i = -n; i <= n; i++) {
        const e0 = (i - 0.5) * rw, e1 = (i + 0.5) * rw, lum = L * rand(0.93, 1.07);
        const lg = g.createLinearGradient(cx + e0 * 1.075, 0, cx + e1 * 1.075, 0);
        lg.addColorStop(0, `hsl(${sk - 10},${S}%,${lum * 0.22}%)`); lg.addColorStop(0.16, `hsl(${sk - 4},${S}%,${lum * 0.72}%)`);
        lg.addColorStop(0.42, `hsl(${sk + 5},${S}%,${lum * 1.2}%)`); lg.addColorStop(0.8, `hsl(${sk},${S}%,${lum * 0.75}%)`);
        lg.addColorStop(1, `hsl(${sk - 10},${S}%,${lum * 0.22}%)`);
        g.fillStyle = lg; g.beginPath();
        g.moveTo(cx + e0 * 0.85, 0); g.quadraticCurveTo(cx + e0 * 1.3, cy, cx + e0 * 0.85, H);
        g.lineTo(cx + e1 * 0.85, H); g.quadraticCurveTo(cx + e1 * 1.3, cy, cx + e1 * 0.85, 0);
        g.closePath(); g.fill();
      }
      noiseOverlay(g, 0.4, Rw / 120);
      for (let i = 0; i < 1800; i++) {
        g.fillStyle = `rgba(70,25,0,${rand(0.08, 0.25)})`;
        g.fillRect(Math.random() * W, Math.random() * H, rand(1, 3), rand(1, 3));
      }
      g.lineCap = 'round'; g.strokeStyle = 'hsla(40,60%,70%,.2)';   // pale scars
      for (let i = 0; i < 14; i++) crackPath(g, Math.random() * W, Math.random() * H, rand(1.2, 1.9), Rw * rand(0.08, 0.3), Rw * 0.006, 2);
      // candlelight spilling out of the hole
      g.save(); g.globalCompositeOperation = 'lighter'; g.translate(cx, cy); g.scale(1, 0.7);
      const cg = g.createRadialGradient(0, 0, Rw * 0.8, 0, 0, Rw * 1.7);
      cg.addColorStop(0, 'rgba(255,140,30,.24)'); cg.addColorStop(1, 'rgba(255,140,30,0)');
      g.fillStyle = cg; g.fillRect(-Rw * 2, -Rw * 2, Rw * 4, Rw * 4);
      g.restore();
      radialVignette(g);
    }

    function skinAlien(g, sk, S, L) {
      radialBg(g, [[0, `hsl(${sk},${S}%,${L * 1.15}%)`], [0.4, `hsl(${sk},${S}%,${L * 0.78}%)`], [0.8, `hsl(${sk + 15},${S + 6}%,${L * 0.28}%)`], [1, '#000']]);
      noiseOverlay(g, 0.4, Rw / 150);
      noiseOverlay(g, 0.2, Rw / 500);
      g.save(); g.translate(cx, cy); g.scale(1, 0.62);          // deep socket
      const sg = g.createRadialGradient(0, 0, Rw * 0.8, 0, 0, Rw * 1.7);
      sg.addColorStop(0, 'rgba(0,12,14,.55)'); sg.addColorStop(1, 'rgba(0,12,14,0)');
      g.fillStyle = sg; g.fillRect(-Rw * 2, -Rw * 2, Rw * 4, Rw * 4);
      g.restore();
      g.lineCap = 'round';
      for (let k = 1; k <= 6; k++) {                            // smooth folds wrapping the socket
        const rx = Rw * (1.1 + k * 0.13), ry = H0 * (1.75 + k * 0.33), s = rand(0, TAU), e = s + rand(0.8, 2.2);
        g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = Rw * 0.012;
        g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, s, e); g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = Rw * 0.008;
        g.beginPath(); g.ellipse(cx, cy + Rw * 0.012, rx, ry, 0, s, e); g.stroke();
      }
      g.strokeStyle = `hsla(${sk + 40},35%,18%,.22)`;           // faint veins under the skin
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * TAU;
        crackPath(g, cx + Math.cos(a) * Rw * 1.25, cy + Math.sin(a) * H0 * 2.3, a + rand(-0.5, 0.5), Rw * rand(0.3, 0.8), Rw * 0.006, 0);
      }
      for (const [ux, uy, ur, al] of [[-0.9, -0.75, 0.9, 0.16], [0.8, 0.7, 0.6, 0.08]]) {   // wet sheen
        const x = cx + ux * Rw, y = cy + uy * Rw, r = ur * Rw, hg = g.createRadialGradient(x, y, 0, x, y, r);
        hg.addColorStop(0, `rgba(255,255,255,${al})`); hg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = hg; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      radialVignette(g);
    }

    const SKINS = {
      warty: skinWarty, human: skinHuman, scales: skinScales, charred: skinCharred, rotten: skinRotten, metal: skinMetal, fur: skinFur, octo: skinOcto,
      spider: skinSpider, clown: skinClown, bandage: skinBandage, pumpkin: skinPumpkin, alien: skinAlien
    };
    const SKIN_CACHE_MAX = 10;   // each cached skin is a full-screen canvas
    function getSkin() {
      const sk = colors().sk, key = `${T.id}|${sk}|${W}x${H}|${Rw.toFixed(1)}`;
      let c = skinCache[key];
      if (c) { delete skinCache[key]; skinCache[key] = c; return c; }   // move to the back: most recently used
      c = document.createElement('canvas');
      c.width = W; c.height = H;
      SKINS[T.skin](c.getContext('2d'), sk, T.skinS, T.skinL);
      const keys = Object.keys(skinCache);
      if (keys.length >= SKIN_CACHE_MAX) delete skinCache[keys[0]];
      skinCache[key] = c;
      return c;
    }

    function buildLashes() {
      lashList = [];
      if (T.lashes === 'spiky') {
        for (let i = 0; i < 19; i++) { const t = 0.08 + 0.84 * i / 18; lashList.push({ up: true, t, len: 0.07 + 0.09 * Math.sin(Math.PI * t) }); }
        for (let i = 0; i < 13; i++) { const t = 0.08 + 0.84 * i / 12; lashList.push({ up: false, t, len: 0.03 + 0.035 * Math.sin(Math.PI * t) }); }
      } else if (T.lashes === 'fine' || T.lashes === 'sparse') {
        const sparse = T.lashes === 'sparse', nU = sparse ? 14 : 70, nL = sparse ? 6 : 36;
        for (let i = 0; i < nU; i++) {
          const t = 0.07 + 0.9 * Math.sqrt(Math.random());   // denser toward the outer corner
          lashList.push({ up: true, t, len: (0.05 + 0.055 * Math.sin(Math.PI * clamp(t * 1.1 - 0.08, 0, 1))) * rand(0.75, 1.15) * (sparse ? rand(0.5, 1.3) : 1), w: rand(0.0032, 0.0055), bend: rand(0.2, 0.5) });
        }
        for (let i = 0; i < nL; i++) {
          const t = 0.15 + 0.8 * Math.random();
          lashList.push({ up: false, t, len: rand(0.018, 0.038), w: rand(0.0025, 0.004), bend: rand(0.1, 0.3) });
        }
      }
    }

    function geometry() {
      Rw = Math.min(W * 0.44, H * 0.62) * clamp(+cfg.eyeSize || 1, 0.4, 1.6) * T.size;
      H0 = Rw * 0.55 * T.open;
    }
    function rebuild() { geometry(); veinCv = makeVeins(); skinCv = getSkin(); }
    function resize() {
      const s = clamp(+cfg.renderScale || 1, 0.3, 1);
      const rect = canvas.getBoundingClientRect();
      const cw = rect.width || window.innerWidth, ch = rect.height || window.innerHeight;
      W = Math.max(2, Math.round(cw * s)); H = Math.max(2, Math.round(ch * s));
      canvas.width = W; canvas.height = H;
      cx = W / 2; cy = H / 2; irisX = cx; irisY = cy;
      skinCache = {}; fx.cracks.length = 0;
      rebuild();
    }

    function applyType(id) {
      T = EYE_TYPES.find(t => t.id === id) || EYE_TYPES[0];
      buildLashes();
      rebuild();
      const c = colors();
      cur.hue = c.hue; cur.sat = c.sat; cur.slit = T.slit; cur.pupil = T.pupil; cur.glow = T.glow;
      if (act) listeners.forEach(f => f(act.anim, T));
    }
    function requestType(id) {
      if (id === T.id && !pendingType) return;
      pendingType = id;
      swap.start = clock;
    }
    function nextRotateType() {
      const grp = String(cfg.eyeType).split('-')[1];   // realistic | stylized | undefined (all)
      const pool = EYE_TYPES.filter(t => !grp || t.group === grp).map(t => t.id);
      typeBag = typeBag.filter(id => id !== T.id && pool.includes(id));
      if (!typeBag.length) typeBag = shuffle(pool.filter(id => id !== T.id));
      return typeBag.shift() || pool[0];
    }

    // ----- playlist -----
    function enabledList() {
      const l = ANIMS.filter(a => cfg.enabled[a.id] !== false);
      return l.length ? l : [ANIMS[0]];
    }
    function startAct(id) {
      const anim = ANIMS.find(a => a.id === id) || ANIMS[0];
      const dur = clamp(+cfg.durations[anim.id] || anim.dur, 2, 600);
      act = { anim, time: 0, dur, st: {} };
      if (cfg.blinkTransition) doBlink(0.22);
      listeners.forEach(f => f(anim, T));
    }
    function nextAct() {
      const l = enabledList();
      let pick;
      if (cfg.order === 'sequence') {
        const idx = act ? l.findIndex(x => x.id === act.anim.id) : -1;
        pick = l[(idx + 1) % l.length];
      } else {
        bag = bag.filter(id => l.some(x => x.id === id));
        if (!bag.length) {
          bag = shuffle(l.map(x => x.id));
          if (bag.length > 1 && act && bag[0] === act.anim.id) bag.push(bag.shift());
        }
        const nextId = bag.shift();
        pick = l.find(x => x.id === nextId) || l[0];
      }
      const hadAct = !!act;
      startAct(pick.id);
      if (hadAct && String(cfg.eyeType).startsWith('rotate') && ++actsSinceType >= clamp(+cfg.rotateEvery || 3, 1, 50)) {
        actsSinceType = 0;
        requestType(nextRotateType());
      }
    }

    // ----- behaviour -----
    function doBlink(d) {
      if (clock - blk.start < blk.dur) return;
      blk.start = clock; blk.dur = d || 0.16;
    }
    function lidCurveMul(q) {
      if (q >= 1 || q < 0) return 1;
      const q2 = q < 0.4 ? (q / 0.4) * 0.5 : 0.5 + ((q - 0.4) / 0.6) * 0.5; // close fast, open slower
      return Math.abs(Math.cos(Math.PI * q2));
    }
    const blinkMul = () => Math.min(lidCurveMul((clock - blk.start) / blk.dur), lidCurveMul((clock - swap.start) / swap.dur));
    function flash(a, col, decay) {
      fx.flashA = Math.max(fx.flashA, a);
      fx.flashColor = col || '255,255,255';
      fx.flashDecay = decay || 4;
    }
    // A spiderweb fracture in the "window", centred x,y eye-widths from the middle. It is built in three
    // rings; the first shows straight away and calling crack() again with no arguments spreads it outward.
    function addCrack(ux, uy, size) {
      if (ux == null) { const c = fx.cracks[fx.cracks.length - 1]; if (c) c.shown = Math.min(3, c.shown + 1); return; }
      const x0 = cx + ux * Rw, y0 = cy + uy * Rw, R = Rw * size, stages = [new Path2D(), new Path2D(), new Path2D()];
      const n = Math.round(rand(9, 13)), steps = 9, rays = [];
      for (let i = 0; i < n; i++) {
        let a = (i + rand(-0.3, 0.3)) / n * TAU, x = x0, y = y0;
        const len = R * rand(0.5, 1), pts = [];
        for (let k = 0; k < steps; k++) {
          const p = stages[Math.floor(k / 3)];
          p.moveTo(x, y);
          a += rand(-0.14, 0.14);
          x += Math.cos(a) * len / steps; y += Math.sin(a) * len / steps;
          p.lineTo(x, y); pts.push([x, y]);
          if (k > 1 && Math.random() < 0.12) {   // side splinter
            const b = a + rand(0.4, 0.9) * (Math.random() < 0.5 ? -1 : 1), l = len * rand(0.06, 0.16);
            p.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l);
          }
        }
        rays.push(pts);
      }
      for (const k of [1, 4, 7]) for (let i = 0; i < n; i++) {   // rings joining neighbouring rays
        if (Math.random() < 0.45) continue;
        const a = rays[i][k], b = rays[(i + 1) % n][k], p = stages[Math.floor(k / 3)];
        p.moveTo(a[0], a[1]); p.lineTo(b[0], b[1]);
      }
      if (fx.cracks.length >= 3) fx.cracks.shift();
      fx.cracks.push({ stages, shown: 1, x: x0, y: y0, r: R });
    }

    function update(dt) {
      clock += dt;
      if (!act) nextAct();
      act.time += dt;
      if (act.time >= act.dur) {
        if (paused) { act.time -= act.dur; act.st = {}; } else nextAct();
      }
      // swap eye type while the lids are shut
      if (pendingType && (clock - swap.start) / swap.dur >= 0.4) { const id = pendingType; pendingType = null; applyType(id); }

      const c = colors();
      const tgt = Object.assign({}, BASE, { hue: c.hue, sat: c.sat, pupil: T.pupil, slit: T.slit, glow: T.glow });
      const ctl = {
        saccade: true, range: 0.7, sMin: 0.5, sMax: 2.8, biasX: 0, biasY: 0,
        blink: true, bMin: 2, bMax: 6.5, bDur: 0.16,
        rotSpeed: 0.04, speeds: {}, glitch: 0, bleeding: false,
        critter: null, cracked: false, glyph: null, glyphScale: 1, glyphT: 0, hudLock: 0
      };
      act.anim.fn({
        t: act.time, p: clamp(act.time / act.dur, 0, 1), dt, dur: act.dur,
        tgt, ctl, st: act.st, fx, base: { hue: c.hue, slit: T.slit, pupil: T.pupil },
        blink: doBlink, flash, crack: addCrack, view: { hw: W / 2 / Rw, hh: H / 2 / Rw }
      });

      if (ctl.saccade) {
        if (clock >= sac.next) {
          let x = rand(-1, 1), y = rand(-0.8, 0.8);
          if (Math.random() < 0.3) { x *= 0.25; y *= 0.25; }
          sac.x = x * ctl.range; sac.y = y * ctl.range;
          sac.next = clock + rand(ctl.sMin, ctl.sMax);
        }
        if (sac.next - clock > ctl.sMax) sac.next = clock + rand(ctl.sMin, ctl.sMax);
        tgt.lookX = sac.x + ctl.biasX; tgt.lookY = sac.y + ctl.biasY;
      }
      if (ctl.blink) {
        if (clock >= blk.next) { doBlink(ctl.bDur); blk.next = clock + rand(ctl.bMin, ctl.bMax); }
      } else {
        blk.next = Math.max(blk.next, clock + 1.2);
      }

      const sp = ctl.speeds;
      if (sp.look) { sp.lookX = sp.look; sp.lookY = sp.look; }
      if (sp.lid) { sp.lidTop = sp.lidTop || sp.lid; sp.lidBot = sp.lidBot || sp.lid; }
      for (const k in cur) {
        const f = 1 - Math.exp(-(sp[k] || SPEEDS[k]) * dt);
        cur[k] = k === 'hue' ? hueLerp(cur[k], tgt[k], f) : lerp(cur[k], tgt[k], f);
      }
      rot += ctl.rotSpeed * dt;

      fx.flashA *= Math.exp(-fx.flashDecay * dt);
      if (fx.flashA < 0.01) fx.flashA = 0;
      fx.glitch = ctl.glitch;

      for (const d of fx.drips) d.len = Math.min(1.8, d.len + (d.v + d.len * 0.5) * dt);
      if (ctl.bleeding) fx.dripAlpha = Math.min(1, fx.dripAlpha + dt * 2);
      else if (fx.drips.length) {
        fx.dripAlpha -= dt * 0.7;
        if (fx.dripAlpha <= 0) { fx.drips.length = 0; fx.dripAlpha = 0; }
      }
      if (ctl.cracked) fx.crackAlpha = 1;
      else if (fx.cracks.length) {
        fx.crackAlpha -= dt * 0.8;
        if (fx.crackAlpha <= 0) { fx.cracks.length = 0; fx.crackAlpha = 0; }
      }
      fx.critter = ctl.critter;
      if (ctl.glyph) { fx.glyph = ctl.glyph; fx.glyphScale = ctl.glyphScale; fx.glyphT = ctl.glyphT; }   // keeps the last one while it fades out
      fx.hudLock = lerp(fx.hudLock, ctl.hudLock, 1 - Math.exp(-10 * dt));
      fx.hudAng += dt * 1.6 * (1 - fx.hudLock);
    }

    // ----- drawing -----
    const K = 0.58; // inner bezier control x (fraction of Rw)
    function openingPath(top, bot) {
      const k = K * Rw;
      ctx.beginPath();
      ctx.moveTo(cx - Rw, cy);
      ctx.bezierCurveTo(cx - k, cy - top / 0.75, cx + k, cy - top / 0.75, cx + Rw, cy);
      ctx.bezierCurveTo(cx + k, cy + bot / 0.75, cx - k, cy + bot / 0.75, cx - Rw, cy);
      ctx.closePath();
    }
    function bez(t, hw, y0, c, k) {
      const x0 = cx - hw, x1 = cx - k, x2 = cx + k, x3 = cx + hw;
      const y1 = y0 + c, y2 = y0 + c, mt = 1 - t;
      const x = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
      const y = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y0;
      const dx = 3 * mt * mt * (x1 - x0) + 6 * mt * t * (x2 - x1) + 3 * t * t * (x3 - x2);
      const dy = 3 * mt * mt * (y1 - y0) + 6 * mt * t * (y2 - y1) + 3 * t * t * (y0 - y2);
      const l = Math.hypot(dx, dy) || 1;
      return { x, y, tx: dx / l, ty: dy / l };
    }
    function lidCurve(hw, y0, c, k, up) {
      ctx.moveTo(cx - hw, y0);
      ctx.bezierCurveTo(cx - k, y0 + (up ? -c : c), cx + k, y0 + (up ? -c : c), cx + hw, y0);
    }

    function pupilPath(x, y, rx, ry, slit) {
      const kt = 0.5523 * (1 - slit), ks = 0.5523;
      ctx.beginPath();
      ctx.moveTo(x, y - ry);
      ctx.bezierCurveTo(x + rx * kt, y - ry, x + rx, y - ry * ks, x + rx, y);
      ctx.bezierCurveTo(x + rx, y + ry * ks, x + rx * kt, y + ry, x, y + ry);
      ctx.bezierCurveTo(x - rx * kt, y + ry, x - rx, y + ry * ks, x - rx, y);
      ctx.bezierCurveTo(x - rx, y - ry * ks, x - rx * kt, y - ry, x, y - ry);
      ctx.closePath();
    }

    function drawSclera(ex, ey) {
      const box = [cx - Rw * 1.3, cy - Rw * 1.3, Rw * 2.6, Rw * 2.6];
      const g = ctx.createRadialGradient(ex - Rw * 0.2, ey - H0 * 0.3, Rw * 0.05, ex, ey, Rw * 1.1);
      const { hue: h, sat: s } = colors();
      const stops = {
        normal: ['#fffaf0', '#f1e6d2', '#d8b8a2', '#8d5a52'],
        human: ['#fdfbf8', '#f3eee8', '#e2cfc8', '#a87c76'],
        black: ['#2a0b0b', '#120303', '#050000', '#2b0000'],
        yellow: ['#e9e2b6', '#d4c78f', '#a39258', '#4f4024'],
        iris: [`hsl(${h},${s * 0.7}%,20%)`, `hsl(${h},${s * 0.7}%,13%)`, `hsl(${h},${s * 0.6}%,7%)`, '#000'],
        metal: ['#b9c0c7', '#6b727a', '#2c3136', '#0c0e10'],
        animal: ['#8f7253', '#6b4f36', '#3a291b', '#110a05'],
        candle: ['#fffbd0', '#ffe066', '#ff9a1a', '#7a2c00'],
        void: ['#161c2e', '#0a0d18', '#04050a', '#000']
      }[T.sclera];
      [0, 0.45, 0.78, 1].forEach((o, i) => g.addColorStop(o, stops[i]));
      ctx.fillStyle = g; ctx.fillRect(...box);
      if (T.sclera === 'human' || T.sclera === 'animal') {   // pinker corners, subtle blotchiness
        ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.25;
        const np = ctx.createPattern(noiseCanvas(), 'repeat'); if (np.setTransform && window.DOMMatrix) np.setTransform(new DOMMatrix().scale(Rw / 160));
        ctx.fillStyle = np; ctx.fillRect(...box); ctx.restore();
      }
      if (T.sclera === 'human') {
        for (const side of [-1, 1]) {
          const pg = ctx.createRadialGradient(cx + side * Rw, cy, 0, cx + side * Rw, cy, Rw * 0.45);
          pg.addColorStop(0, 'rgba(215,120,115,.45)'); pg.addColorStop(1, 'rgba(215,120,115,0)');
          ctx.fillStyle = pg; ctx.fillRect(...box);
        }
      }
      if (T.sclera === 'candle') {   // the flame inside gutters
        ctx.fillStyle = `rgba(90,25,0,${Math.max(0, 0.14 + 0.1 * Math.sin(clock * 9.1) + 0.06 * Math.sin(clock * 23.7))})`;
        ctx.fillRect(...box);
      }
      if (T.sclera === 'metal') {
        ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = Rw * 0.006;
        for (let r = 0.5; r < 1.3; r += 0.12) { ctx.beginPath(); ctx.ellipse(ex, ey, Rw * r, Rw * r * 0.8, 0, 0, TAU); ctx.stroke(); }
      }
      if (cur.blood > 0.01) {
        const bg = ctx.createRadialGradient(ex, ey, Rw * 0.15, ex, ey, Rw * 1.05);
        bg.addColorStop(0, 'rgba(210,40,40,.15)'); bg.addColorStop(1, 'rgba(160,0,10,.9)');
        ctx.globalAlpha = clamp(cur.blood, 0, 1);
        ctx.fillStyle = bg; ctx.fillRect(...box);
      }
      ctx.globalAlpha = clamp((+cfg.veins + cur.blood * 0.75) * T.veinMul, 0, 1);
      if (ctx.globalAlpha > 0.01) ctx.drawImage(veinCv, ex - veinCv.width / 2, ey - veinCv.height / 2);
      ctx.globalAlpha = 1;
      if (T.caruncle) {   // pink tear-duct tissue at the inner corner
        const x = cx - Rw * 0.93, cg = ctx.createRadialGradient(x, cy, 0, x, cy, Rw * 0.09);
        cg.addColorStop(0, 'hsl(355,55%,68%)'); cg.addColorStop(0.7, 'hsl(352,50%,55%)'); cg.addColorStop(1, 'hsla(352,50%,55%,0)');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.ellipse(x, cy, Rw * 0.09, H0 * 0.35, 0, 0, TAU); ctx.fill();
      }
    }

    function irisGradient(Ri, stops) {
      const g = ctx.createRadialGradient(0, 0, Ri * 0.05, 0, 0, Ri);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Ri, 0, TAU); ctx.fill();
    }

    function drawIrisBody(Ri, h, s) {
      const style = T.iris;
      if (style === 'fibers') {
        irisGradient(Ri, [[0, `hsl(${h},${s}%,72%)`], [0.3, `hsl(${h},${s}%,52%)`], [0.7, `hsl(${h + 8},${s * 0.9}%,30%)`], [0.9, `hsl(${h},${s * 0.8}%,14%)`], [1, `hsl(${h},${s * 0.6}%,4%)`]]);
      } else if (style === 'human' || style === 'cloudy') {
        irisGradient(Ri, [[0, `hsl(${h + 30},${s * 0.8}%,36%)`], [0.2, `hsl(${h + 26},${s * 0.9}%,45%)`], [0.34, `hsl(${h},${s}%,54%)`], [0.7, `hsl(${h},${s * 0.95}%,45%)`], [0.9, `hsl(${h - 5},${s * 0.8}%,29%)`], [1, `hsl(${h},${s * 0.5}%,12%)`]]);
      } else if (style === 'reptile') {
        irisGradient(Ri, [[0, `hsl(${h + 12},100%,72%)`], [0.35, `hsl(${h + 5},${s}%,58%)`], [0.75, `hsl(${h - 8},${s}%,40%)`], [0.95, `hsl(${h - 15},${s}%,20%)`], [1, `hsl(${h - 15},${s}%,8%)`]]);
      } else if (style === 'fire') {
        irisGradient(Ri, [[0, `hsl(${h + 50},100%,75%)`], [0.3, `hsl(${h + 30},100%,58%)`], [0.65, `hsl(${h},100%,42%)`], [0.9, `hsl(${h - 5},100%,18%)`], [1, '#100000']]);
      } else if (style === 'photo') {
        const hi = h + (T.innerShift == null ? 18 : T.innerShift);
        irisGradient(Ri, [[0, `hsl(${hi},${s * 0.9}%,30%)`], [0.2, `hsl(${hi},${s}%,40%)`], [0.4, `hsl(${h},${s}%,47%)`], [0.75, `hsl(${h - 4},${s * 0.95}%,39%)`], [0.92, `hsl(${h - 8},${s * 0.85}%,22%)`], [1, `hsl(${h},${s * 0.6}%,7%)`]]);
      } else if (style === 'aperture') {
        irisGradient(Ri, [[0, '#1a1c1f'], [0.5, '#4d535a'], [0.7, '#2b2f34'], [0.86, '#5c636b'], [1, '#0b0c0e']]);
      } else if (style === 'orb') {
        irisGradient(Ri, [[0, `hsl(${h},${s}%,28%)`], [0.45, `hsl(${h},${s}%,14%)`], [0.85, `hsl(${h},${s * 0.8}%,5%)`], [1, '#000']]);
      } else if (style === 'galaxy') {
        irisGradient(Ri, [[0, `hsl(${h + 50},${s}%,78%)`], [0.2, `hsl(${h + 25},${s}%,48%)`], [0.55, `hsl(${h},${s}%,22%)`], [0.88, `hsl(${h - 25},${s}%,9%)`], [1, '#000']]);
      }

      ctx.save();
      ctx.beginPath(); ctx.arc(0, 0, Ri, 0, TAU); ctx.clip();
      ctx.save(); ctx.rotate(rot);
      if (style === 'fibers') ctx.drawImage(getTex('fibers'), -Ri, -Ri, Ri * 2, Ri * 2);
      else if (style === 'human') ctx.drawImage(getTex('human'), -Ri, -Ri, Ri * 2, Ri * 2);
      else if (style === 'photo') {
        const pt = photoIrisCanvas();
        ctx.globalCompositeOperation = 'overlay'; ctx.drawImage(pt, -Ri, -Ri, Ri * 2, Ri * 2);
        ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.35; ctx.drawImage(pt, -Ri, -Ri, Ri * 2, Ri * 2);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      }
      else if (style === 'cloudy') { ctx.globalAlpha = 0.6; ctx.drawImage(getTex('human'), -Ri, -Ri, Ri * 2, Ri * 2); ctx.globalAlpha = 1; }
      else if (style === 'reptile') {
        ctx.globalAlpha = 0.45; ctx.drawImage(getTex('fibers'), -Ri, -Ri, Ri * 2, Ri * 2); ctx.globalAlpha = 1;
        ctx.drawImage(getTex('cracks'), -Ri, -Ri, Ri * 2, Ri * 2);
      } else if (style === 'fire') {
        ctx.drawImage(getTex('fibers'), -Ri, -Ri, Ri * 2, Ri * 2);
        ctx.restore(); ctx.save();
        ctx.rotate(-rot * 1.7 + clock * 0.35);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 + 0.15 * Math.sin(clock * 7) + 0.1 * Math.sin(clock * 13.3);
        ctx.drawImage(getTex('fibers'), -Ri * 1.05, -Ri * 1.05, Ri * 2.1, Ri * 2.1);
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      } else if (style === 'galaxy') {
        ctx.rotate(clock * 0.06);
        ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(getTex('galaxy'), -Ri, -Ri, Ri * 2, Ri * 2);
        ctx.globalCompositeOperation = 'source-over';
      } else if (style === 'aperture') {
        ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = Ri * 0.012;
        for (const r of [0.52, 0.74, 0.8, 0.93]) { ctx.beginPath(); ctx.arc(0, 0, Ri * r, 0, TAU); ctx.stroke(); }
        ctx.strokeStyle = 'rgba(255,255,255,.3)';
        for (let i = 0; i < 60; i++) {
          const a = i / 60 * TAU, r2 = i % 5 ? 0.9 : 0.86;
          ctx.beginPath(); ctx.moveTo(Math.cos(a) * Ri * r2, Math.sin(a) * Ri * r2); ctx.lineTo(Math.cos(a) * Ri * 0.96, Math.sin(a) * Ri * 0.96); ctx.stroke();
        }
      }
      ctx.restore();
      if (style === 'aperture') {   // spinning LED ring
        ctx.setLineDash([Ri * 0.12, Ri * 0.05]); ctx.lineDashOffset = -rot * Ri * 3;
        ctx.strokeStyle = `hsla(${h},100%,60%,${0.2 + 0.3 * clamp(cur.glow, 0, 1)})`; ctx.lineWidth = Ri * 0.12;
        ctx.beginPath(); ctx.arc(0, 0, Ri * 0.64, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `hsl(${h},100%,62%)`; ctx.lineWidth = Ri * 0.035; ctx.stroke();
        ctx.setLineDash([]);
      }
      if (cur.spiral > 0.01) {
        ctx.rotate(rot);
        ctx.globalAlpha = clamp(cur.spiral, 0, 1);
        const arms = 6;
        for (let pass = 0; pass < 2; pass++) {
          ctx.lineWidth = pass ? Ri * 0.05 : Ri * 0.1;
          ctx.strokeStyle = pass ? `hsl(${h + 180},100%,65%)` : 'rgba(0,0,0,.8)';
          for (let k = 0; k < arms; k++) {
            const base = (k + pass * 0.5) * TAU / arms;
            ctx.beginPath();
            for (let r = 0; r <= Ri * 1.05; r += Ri * 0.04) {
              const th = base + (r / Ri) * 5.5;
              r ? ctx.lineTo(Math.cos(th) * r, Math.sin(th) * r) : ctx.moveTo(0, 0);
            }
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // limbal ring
      if (style === 'human' || style === 'cloudy' || style === 'photo') {
        const lg = ctx.createRadialGradient(0, 0, Ri * 0.78, 0, 0, Ri);
        lg.addColorStop(0, 'rgba(10,15,20,0)'); lg.addColorStop(1, 'rgba(10,15,20,.7)');
        ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(0, 0, Ri, 0, TAU); ctx.fill();
      } else if (style !== 'aperture') {
        ctx.lineWidth = Ri * (style === 'reptile' ? 0.03 : 0.06); ctx.strokeStyle = 'rgba(0,0,0,.65)';
        ctx.beginPath(); ctx.arc(0, 0, Ri * 0.97, 0, TAU); ctx.stroke();
      }
    }

    function drawOnePupil(x, y, r, sl, Ri, h) {
      if (T.iris === 'aperture') {
        const n = 7, sx = 1 - 0.8 * sl, a0 = rot * 2;
        const pts = [];
        for (let i = 0; i < n; i++) { const a = a0 + i / n * TAU; pts.push([x + Math.cos(a) * r * sx, y + Math.sin(a) * r]); }
        ctx.fillStyle = '#1f2226'; ctx.beginPath(); ctx.arc(x, y, Math.min(Ri * 0.5, r * 1.45 + Ri * 0.04), 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(170,180,190,.35)'; ctx.lineWidth = Ri * 0.01;
        for (let i = 0; i < n; i++) {
          const [px, py] = pts[i], [qx, qy] = pts[(i + 1) % n];
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (qx - px) * 2.4, py + (qy - py) * 2.4); ctx.stroke();
        }
        ctx.beginPath(); pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.closePath();
        ctx.fillStyle = '#030303'; ctx.fill();
        const gg = ctx.createRadialGradient(x, y, 0, x, y, r * 0.5);
        gg.addColorStop(0, `hsla(${h},100%,70%,.95)`); gg.addColorStop(0.35, `hsla(${h},100%,50%,.6)`); gg.addColorStop(1, `hsla(${h},100%,40%,0)`);
        ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.fill();
        return;
      }
      if (T.pupilShape === 'hbar') {   // goat / octopus: rounded horizontal bar
        const gl = clamp(cur.glyph, 0, 1);   // rounds off to make room for a glyph
        const rx = lerp(Math.min(r * 1.6, Ri * 0.92), r, gl), ry = lerp(Math.max(Ri * 0.012, r * 0.36 * (1 - 0.75 * sl)), r, gl), cr = ry * 0.95;
        ctx.beginPath();
        ctx.moveTo(x - rx + cr, y - ry); ctx.lineTo(x + rx - cr, y - ry);
        ctx.quadraticCurveTo(x + rx, y - ry, x + rx, y); ctx.quadraticCurveTo(x + rx, y + ry, x + rx - cr, y + ry);
        ctx.lineTo(x - rx + cr, y + ry);
        ctx.quadraticCurveTo(x - rx, y + ry, x - rx, y); ctx.quadraticCurveTo(x - rx, y - ry, x - rx + cr, y - ry);
        ctx.closePath();
      } else {
        const rx = r * (1 - 0.82 * sl), ry = Math.min(r * (1 + 0.4 * sl), Ri * 0.98);
        pupilPath(x, y, rx, ry, sl);
      }
      if (T.iris === 'photo') {   // soft dark edge instead of an outline
        ctx.fillStyle = '#020101'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = Ri * 0.04; ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = Ri * 0.08; ctx.stroke();
        return;
      }
      ctx.fillStyle = T.iris === 'cloudy' ? '#1b1d1d' : '#050003'; ctx.fill();
      if (T.iris === 'fire') { ctx.lineWidth = Ri * 0.03; ctx.strokeStyle = 'hsla(40,100%,70%,.55)'; ctx.stroke(); }
      else if (T.iris !== 'human' && T.iris !== 'cloudy') { ctx.lineWidth = Ri * 0.02; ctx.strokeStyle = `hsla(${h},100%,65%,.3)`; ctx.stroke(); }
    }

    function drawIris() {
      const Ri = Rw * T.irisSize;
      const ix = cx + cur.lookX * Rw * 0.55 * T.lookScale, iy = cy + cur.lookY * Rw * 0.28 * T.lookScale;
      const mag = Math.min(1, Math.hypot(cur.lookX, cur.lookY * 1.4));
      const squash = 1 - 0.2 * mag * (T.sclera === 'iris' ? 0.4 : 1), ang = Math.atan2(cur.lookY, cur.lookX);
      const h = cur.hue, s = clamp(cur.sat, 0, 100);
      irisX = ix; irisY = iy;

      ctx.save();
      ctx.translate(ix, iy); ctx.rotate(ang); ctx.scale(squash, 1); ctx.rotate(-ang);

      if (T.sclera !== 'iris' && T.sclera !== 'black') {
        const g = ctx.createRadialGradient(0, 0, Ri * 0.95, 0, 0, Ri * 1.3);
        g.addColorStop(0, 'rgba(70,20,20,.35)'); g.addColorStop(1, 'rgba(70,20,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Ri * 1.3, 0, TAU); ctx.fill();
      }
      if (cur.glow > 0.02) {
        const g = ctx.createRadialGradient(0, 0, Ri * 0.8, 0, 0, Ri * 1.8);
        g.addColorStop(0, `hsla(${h},100%,55%,${0.5 * clamp(cur.glow, 0, 1)})`);
        g.addColorStop(1, `hsla(${h},100%,50%,0)`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, Ri * 1.8, 0, TAU); ctx.fill();
      }

      drawIrisBody(Ri, h, s);

      const pr = clamp(cur.pupil, 0.04, 0.95) * Ri, sl = clamp(cur.slit, 0, 1), m = clamp(cur.multi, 0, 1);
      const mainScale = 1 - m * 0.95;
      if (mainScale > 0.03) drawOnePupil(0, 0, pr * mainScale, sl, Ri, h);
      if (m > 0.02) {
        for (let i = 0; i < 4; i++) {
          const a = rot * 2.2 + i * TAU / 4, orb = Ri * 0.5 * m;
          drawOnePupil(Math.cos(a) * orb, Math.sin(a) * orb, pr * 0.42 * m, sl, Ri, h);
        }
      }
      if (cur.glyph > 0.02) drawGlyph(fx.glyph, pr, clamp(cur.glyph, 0, 1), Ri);
      if (T.iris === 'cloudy') {   // milky cataract haze
        const hz = ctx.createRadialGradient(0, 0, 0, 0, 0, Ri);
        hz.addColorStop(0, 'rgba(235,240,232,.55)'); hz.addColorStop(0.6, 'rgba(225,232,222,.42)'); hz.addColorStop(1, 'rgba(200,210,198,.18)');
        ctx.fillStyle = hz; ctx.beginPath(); ctx.arc(0, 0, Ri, 0, TAU); ctx.fill();
      }
      ctx.restore();

      // cornea reflections
      if (T.photoHL) {
        const hl = highlightCanvas(), sz = Ri * 0.5 * Math.min(1, 0.37 / T.irisSize + 0.35);
        ctx.globalAlpha = 0.6;
        ctx.drawImage(hl, ix - Ri * 0.42 - sz / 2, iy - Ri * 0.42 - sz / 2, sz, sz);
        ctx.globalAlpha = 1;
        const sg = ctx.createRadialGradient(ix - Ri * 0.2, iy - Ri * 0.3, 0, ix - Ri * 0.2, iy - Ri * 0.3, Ri * 1.1);
        sg.addColorStop(0, 'rgba(255,255,255,.1)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(ix, iy, Ri * 1.1, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.4)';
        ctx.beginPath(); ctx.ellipse(ix + Ri * 0.34, iy + Ri * 0.3, Ri * 0.035, Ri * 0.025, 0, 0, TAU); ctx.fill();
      } else if (T.iris === 'human' || T.iris === 'cloudy') {
        // soft window-shaped reflection
        ctx.save(); ctx.translate(ix - Ri * 0.36, iy - Ri * 0.36); ctx.rotate(-0.12);
        const w = Ri * 0.26, hh = Ri * 0.2;
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillRect(-w / 2, -hh / 2, w * 0.47, hh * 0.46); ctx.fillRect(w * 0.03, -hh / 2, w * 0.47, hh * 0.46);
        ctx.fillRect(-w / 2, hh * 0.04, w * 0.47, hh * 0.46); ctx.fillRect(w * 0.03, hh * 0.04, w * 0.47, hh * 0.46);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath(); ctx.ellipse(ix + Ri * 0.34, iy + Ri * 0.3, Ri * 0.04, Ri * 0.03, 0, 0, TAU); ctx.fill();
      } else {
        const sc = T.irisSize / 0.36;
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.ellipse(ix - Ri * 0.38, iy - Ri * 0.4, Ri * 0.15 / sc, Ri * 0.1 / sc, -0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.5)';
        ctx.beginPath(); ctx.ellipse(ix + Ri * 0.32, iy + Ri * 0.28, Ri * 0.05 / sc, Ri * 0.035 / sc, -0.5, 0, TAU); ctx.fill();
      }
    }

    // heavy Art Deco capitals for the crest: one fat stroke per letter, the rest hairlines
    function crestWord(word, xc, y, h, width) {
      const gap = 0.1;
      let total = -gap;
      for (const ch of word) total += CREST_LETTERS[ch] + gap;
      const u = width / total;
      let x = xc - width / 2;
      ctx.fillStyle = '#0a0a0a';
      for (const ch of word) {
        const w = CREST_LETTERS[ch] * u, tk = Math.min(h * 0.32, w * 0.42), th = h * 0.1;
        const R = (a, b, c, d) => ctx.fillRect(x + a, y + b, c, d);
        const P = pts => { ctx.beginPath(); pts.forEach(([a, b], i) => (i ? ctx.lineTo(x + a, y + b) : ctx.moveTo(x + a, y + b))); ctx.closePath(); ctx.fill(); };
        if (ch === 'T') { R(0, 0, w, th); R((w - tk) / 2, 0, tk, h); }
        else if (ch === 'H') { R(0, 0, tk, h); R(w - th * 1.3, 0, th * 1.3, h); R(tk, h * 0.45, w - tk, th); }
        else if (ch === 'E') { R(0, 0, tk, h); R(tk, 0, w - tk, th); R(tk, h * 0.45, (w - tk) * 0.7, th); R(tk, h - th, w - tk, th); }
        else if (ch === 'L') { R(0, 0, tk, h); R(tk, h - th, w - tk, th); }
        else if (ch === 'A') {
          const ax = w * 0.4;
          P([[ax - th * 0.3, 0], [ax + tk * 0.5, 0], [w, h], [w - tk * 1.1, h]]);
          P([[ax - th * 0.3, 0], [ax + th, 0], [th * 1.3, h], [0, h]]);
          R(w * 0.2, h * 0.62, w * 0.5, th);
        } else if (ch === 'K') {
          R(0, 0, tk, h);
          P([[tk, h * 0.56], [w - th * 1.4, 0], [w, 0], [tk, h * 0.72]]);
          P([[tk + (w - tk) * 0.18, h * 0.5], [tk + (w - tk) * 0.5, h * 0.3], [w, h], [w - tk * 1.05, h]]);
        }
        x += w + gap * u;
      }
    }

    const crestSize = () => Math.min(Rw * T.irisSize * 1.22, H0 * 1.1);   // as big as the iris and lids allow

    // "The Lake" crest growing out of the pupil, drawn S wide around the origin.
    // m: 0 = round pupil, 1 = shield; fx.glyphT paints it in; halo adds a pale keyline for dark backgrounds.
    function drawCrest(pr, m, S, halo) {
      const e = m * m * (3 - 2 * m), t = fx.glyphT, N = CREST.length;
      const outline = () => {
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const a = -Math.PI / 2 + i / N * TAU;
          const x = lerp(Math.cos(a) * pr, CREST[i][0] * S, e), y = lerp(Math.sin(a) * pr, CREST[i][1] * S, e);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.closePath();
      };
      outline(); ctx.fillStyle = '#050003'; ctx.fill();
      ctx.save(); ctx.clip();
      const top = -0.58 * S, hh = 1.24 * S;
      ['#12994a', '#ffffff', '#e03a24'].forEach((col, j) => {      // each band pours down from the top in turn
        const f = smooth(0, 1, clamp(t * 2.2 - j * 0.6, 0, 1));
        if (f <= 0) return;
        const x = (-0.5 + j / 3) * S;
        ctx.fillStyle = col; ctx.fillRect(x - 0.5, top, S / 3 + 1, f * hh);
        if (f < 1) { ctx.beginPath(); ctx.ellipse(x + S / 6, top + f * hh, S / 6, S * 0.045, 0, 0, Math.PI); ctx.fill(); }   // wet edge
      });
      const u = clamp(t - 1, 0, 1);
      if (u > 0) {                                                 // the white name band wipes across, then the letters
        const y1 = -0.357 * S, y2 = 0.152 * S, rv = smooth(0.4, 1, u);
        ctx.fillStyle = '#fff'; ctx.fillRect(-0.5 * S, y1, smooth(0, 0.45, u) * S, y2 - y1);
        if (rv > 0) {
          ctx.save(); ctx.beginPath(); ctx.rect(-0.5 * S, y1, S * rv, y2 - y1); ctx.clip();
          crestWord('THE', 0, -0.33 * S, 0.215 * S, 0.66 * S);
          crestWord('LAKE', 0, -0.088 * S, 0.215 * S, 0.9 * S);
          ctx.restore();
        }
        if (u >= 1) {                                              // a glint slides across now and then
          const gx = ((clock * 0.45) % 1.8 - 0.4) * S * 2 - S, gg = ctx.createLinearGradient(gx, 0, gx + S * 0.3, S * 0.12);
          gg.addColorStop(0, 'rgba(255,255,255,0)'); gg.addColorStop(0.5, 'rgba(255,255,255,.4)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = gg; ctx.fillRect(-0.5 * S, top, S, hh);
        }
      }
      ctx.restore();
      if (e > 0.02) {
        outline(); ctx.lineJoin = 'round';
        if (halo > 0.02) { ctx.strokeStyle = `rgba(255,255,255,${0.6 * halo})`; ctx.lineWidth = S * 0.06; ctx.stroke(); }
        ctx.strokeStyle = '#0a0a0a'; ctx.lineWidth = S * 0.04 * e; ctx.stroke();
      }
    }

    // a little picture inside the pupil (drawn in iris space, centred on the pupil)
    function drawGlyph(kind, pr, al, Ri) {
      if (kind === 'lake') return drawCrest(pr, al, crestSize(), 0);
      const R = pr * 0.92 * fx.glyphScale;
      ctx.globalAlpha = al;
      if (kind === 'pumpkin') {
        const fl = 0.85 + 0.1 * Math.sin(clock * 11) + 0.05 * Math.sin(clock * 27.3);   // candle flicker
        const gl = ctx.createRadialGradient(0, R * 0.1, 0, 0, 0, R * 1.08);
        gl.addColorStop(0, `rgba(255,160,30,${0.5 * fl})`); gl.addColorStop(1, 'rgba(255,90,0,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, R * 1.08, 0, TAU); ctx.fill();
        const fg = ctx.createLinearGradient(0, -R * 0.6, 0, R * 0.7);
        fg.addColorStop(0, `hsl(50,100%,${64 * fl}%)`); fg.addColorStop(1, `hsl(28,100%,${50 * fl}%)`);
        ctx.fillStyle = fg; ctx.beginPath();
        for (const sd of [-1, 1]) {
          ctx.moveTo(sd * R * 0.16, -R * 0.14); ctx.lineTo(sd * R * 0.62, -R * 0.5); ctx.lineTo(sd * R * 0.6, -R * 0.1); ctx.closePath();
        }
        ctx.moveTo(0, -R * 0.08); ctx.lineTo(R * 0.11, R * 0.12); ctx.lineTo(-R * 0.11, R * 0.12); ctx.closePath();
        [[-0.68, 0.2], [-0.42, 0.34], [-0.3, 0.22], [-0.14, 0.4], [0, 0.28], [0.14, 0.4], [0.3, 0.22], [0.42, 0.34], [0.68, 0.2],
          [0.5, 0.56], [0.3, 0.66], [0.2, 0.54], [0.06, 0.72], [-0.06, 0.72], [-0.2, 0.54], [-0.3, 0.66], [-0.5, 0.56]]
          .forEach(([x, y], i) => (i ? ctx.lineTo(x * R, y * R) : ctx.moveTo(x * R, y * R)));
        ctx.closePath(); ctx.fill();
      } else {   // skull
        const bg = ctx.createRadialGradient(-R * 0.2, -R * 0.35, 0, 0, 0, R * 0.9);
        bg.addColorStop(0, '#f1eedb'); bg.addColorStop(1, '#8f8a74');
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(0, -R * 0.14, R * 0.58, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-R * 0.37, R * 0.15); ctx.lineTo(R * 0.37, R * 0.15); ctx.lineTo(R * 0.29, R * 0.7); ctx.lineTo(-R * 0.29, R * 0.7); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#050003';
        for (const sd of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sd * R * 0.25, -R * 0.12, R * 0.17, R * 0.2, sd * 0.25, 0, TAU); ctx.fill(); }
        ctx.beginPath(); ctx.moveTo(0, R * 0.08); ctx.lineTo(R * 0.08, R * 0.29); ctx.lineTo(-R * 0.08, R * 0.29); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#050003'; ctx.lineWidth = R * 0.035; ctx.beginPath();
        ctx.moveTo(-R * 0.3, R * 0.51); ctx.lineTo(R * 0.3, R * 0.51);
        for (let i = -2; i <= 2; i++) { ctx.moveTo(i * R * 0.11, R * 0.4); ctx.lineTo(i * R * 0.11, R * 0.63); }
        ctx.stroke();
        ctx.fillStyle = `hsla(0,100%,55%,${0.6 + 0.3 * Math.sin(clock * 5)})`;   // embers in the sockets
        for (const sd of [-1, 1]) { ctx.beginPath(); ctx.arc(sd * R * 0.25, -R * 0.1, R * 0.045, 0, TAU); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }

    // props in front of the eye
    function drawCritter(c) {
      const x = cx + c.x * Rw, y = cy + c.y * Rw;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      if (c.kind === 'spider') {
        const r = Rw * 0.06;
        ctx.strokeStyle = 'rgba(235,235,225,.55)'; ctx.lineWidth = Math.max(1, Rw * 0.003);
        ctx.beginPath(); ctx.moveTo(cx + c.tx * Rw, cy - H); ctx.lineTo(x, y - r); ctx.stroke();   // silk
        ctx.translate(x, y);
        for (let pass = 0; pass < 2; pass++) {       // legs: a pale outline first so they show on dark skins
          ctx.strokeStyle = pass ? '#0b0806' : 'rgba(235,225,205,.4)'; ctx.lineWidth = r * (pass ? 0.17 : 0.3);
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const sd = i < 4 ? -1 : 1, th = [-1.15, -0.5, 0.15, 0.8][i % 4] + 0.12 * Math.sin(clock * (c.walk ? 16 : 3) + i * 1.9);
            ctx.moveTo(sd * r * 0.3, -r * 0.5);
            ctx.lineTo(sd * Math.cos(th - 0.35) * r * 1.5, Math.sin(th - 0.35) * r * 1.5 - r * 0.5);
            ctx.lineTo(sd * Math.cos(th + 0.25) * r * 2.7, Math.sin(th + 0.25) * r * 2.7 - r * 0.5);
          }
          ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(235,225,205,.35)'; ctx.lineWidth = r * 0.08;
        const ag = ctx.createRadialGradient(-r * 0.3, r * 0.05, r * 0.05, 0, r * 0.4, r * 0.95);
        ag.addColorStop(0, '#5a4c40'); ag.addColorStop(0.5, '#15100c'); ag.addColorStop(1, '#000');
        ctx.fillStyle = ag; ctx.beginPath(); ctx.ellipse(0, r * 0.4, r * 0.8, r * 0.95, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#120d0a'; ctx.beginPath(); ctx.arc(0, -r * 0.62, r * 0.45, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'hsl(355,90%,45%)';          // hourglass
        ctx.beginPath(); ctx.moveTo(-r * 0.2, r * 0.15); ctx.lineTo(r * 0.2, r * 0.15); ctx.lineTo(-r * 0.2, r * 0.75); ctx.lineTo(r * 0.2, r * 0.75); ctx.closePath(); ctx.fill();
      } else {   // fly, heading along +x
        const r = Rw * 0.035;
        ctx.translate(x, y); ctx.rotate(c.ang || 0);
        ctx.fillStyle = 'rgba(225,238,255,.5)'; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = r * 0.06;
        for (const sd of [-1, 1]) {
          ctx.save(); ctx.rotate(sd * (c.flap ? 1.7 + 0.6 * Math.sin(clock * 75) : 2.65));
          ctx.beginPath(); ctx.ellipse(r * 1.15, 0, r * 1.15, r * 0.45, 0, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
        ctx.strokeStyle = 'rgba(235,235,225,.35)'; ctx.lineWidth = r * 0.1;
        const bg = ctx.createRadialGradient(-r * 0.7, -r * 0.2, 0, -r * 0.5, 0, r * 0.9);
        bg.addColorStop(0, '#3d5a4c'); bg.addColorStop(0.6, '#10140f'); bg.addColorStop(1, '#000');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(-r * 0.55, 0, r * 0.85, r * 0.55, 0, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#0c0d0a'; ctx.beginPath(); ctx.arc(r * 0.2, 0, r * 0.5, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#6a1210'; ctx.beginPath(); ctx.arc(r * 0.8, 0, r * 0.36, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // targeting overlay around the iris
    function drawHud() {
      const lk = clamp(fx.hudLock, 0, 1), al = clamp(cur.hud, 0, 1);
      const r = Rw * T.irisSize * lerp(1.9, 1.22, lk), col = lk > 0.5 ? '255,45,30' : '90,255,120';
      ctx.save();
      ctx.fillStyle = `rgba(${col},${al * 0.3})`;                  // crosshair lines across the whole view
      ctx.fillRect(irisX - Rw * 0.003, cy - H, Rw * 0.006, H * 2); ctx.fillRect(cx - W, irisY - Rw * 0.003, W * 2, Rw * 0.006);
      ctx.strokeStyle = ctx.fillStyle = `rgba(${col},${al * 0.9})`; ctx.lineWidth = Math.max(1.5, Rw * 0.009); ctx.lineCap = 'butt';
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const a0 = fx.hudAng + i * TAU / 4 + 0.3, a1 = i * TAU / 4;
        ctx.moveTo(irisX + Math.cos(a0) * r, irisY + Math.sin(a0) * r); ctx.arc(irisX, irisY, r, a0, a0 + TAU / 4 - 0.6);
        ctx.moveTo(irisX + Math.cos(a1) * r * 1.08, irisY + Math.sin(a1) * r * 1.08); ctx.lineTo(irisX + Math.cos(a1) * r * 1.35, irisY + Math.sin(a1) * r * 1.35);
      }
      ctx.stroke();
      if (lk < 0.5 || Math.sin(clock * 12) > -0.3) {
        ctx.font = `700 ${Math.round(Rw * 0.075)}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(lk > 0.5 ? 'TARGET ACQUIRED' : 'SCANNING', cx, Math.min(cy + H0 * 1.75, H * 0.93));
      }
      ctx.restore();
    }

    function drawLashes(topPk, botPk, k) {
      if (!lashList.length) return;
      const spiky = T.lashes === 'spiky';
      ctx.fillStyle = '#0a0205';
      ctx.strokeStyle = T.lashColor || (T.lashes === 'sparse' ? '#1b1510' : '#140c0a');
      ctx.lineCap = 'round';
      for (const L of lashList) {
        const c = L.up ? -topPk / 0.75 : botPk / 0.75;
        const b = bez(L.t, Rw, cy, c, k);
        const nx = L.up ? b.ty : -b.ty, ny = L.up ? -b.tx : b.tx;
        const len = Rw * L.len;
        if (spiky) {
          const tipX = b.x + nx * len + b.tx * (L.t - 0.5) * len * 1.3;
          const tipY = b.y + ny * len + b.ty * (L.t - 0.5) * len * 1.3;
          const cpx = b.x + nx * len * 0.65, cpy = b.y + ny * len * 0.65, w = Rw * 0.009;
          ctx.beginPath();
          ctx.moveTo(b.x - b.tx * w, b.y - b.ty * w);
          ctx.quadraticCurveTo(cpx, cpy, tipX, tipY);
          ctx.quadraticCurveTo(cpx, cpy, b.x + b.tx * w, b.y + b.ty * w);
          ctx.fill();
        } else {
          const th = (L.up ? 0.15 + 0.75 * L.t : 0.3 + 0.5 * L.t) + L.bend * 0.4;
          const dxl = nx * Math.cos(th) + b.tx * Math.sin(th), dyl = ny * Math.cos(th) + b.ty * Math.sin(th);
          const tipX = b.x + dxl * len, tipY = b.y + dyl * len;
          const cpx = b.x + nx * len * 0.6, cpy = b.y + ny * len * 0.6;
          ctx.lineWidth = Math.max(0.8, Rw * L.w);
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.quadraticCurveTo(cpx, cpy, tipX, tipY); ctx.stroke();
        }
      }
    }

    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);

      const sh = cur.shake * Rw * 0.035;
      const ox = rand(-1, 1) * sh, oy = rand(-1, 1) * sh, sc = cur.scale;
      ctx.setTransform(sc, 0, 0, sc, cx + ox - cx * sc, cy + oy - cy * sc);
      ctx.drawImage(skinCv, 0, 0);

      const sk = colors().sk, S = T.skinS, L = T.skinL;
      const open = cur.lid * blinkMul();
      const botPk = H0 * 0.8 * (0.3 + 0.7 * clamp(open, 0, 2)) * cur.lidBot;
      const topPk = lerp(-botPk, H0 * cur.lidTop, open);
      const k = K * Rw;

      // upper lid skin (between crease and opening) — semi-transparent so the skin texture shows
      const creasePk = Math.max(H0 * 1.25 + (topPk - H0) * 0.3, topPk + H0 * 0.12);
      const creaseY = cy - H0 * 0.08;
      ctx.globalAlpha = T.lidAlpha;
      let g = ctx.createLinearGradient(0, cy - creasePk, 0, cy - Math.max(topPk, 0));
      g.addColorStop(0, `hsl(${sk},${S}%,${L * 0.45}%)`); g.addColorStop(1, `hsl(${sk},${S}%,${L * 1.05}%)`);
      const upperLid = () => {
        ctx.beginPath();
        lidCurve(Rw * 1.08, creaseY, creasePk / 0.75, k * 1.05, true);
        ctx.lineTo(cx + Rw, cy);
        ctx.bezierCurveTo(cx + k, cy - topPk / 0.75, cx - k, cy - topPk / 0.75, cx - Rw, cy);
        ctx.closePath();
      };
      upperLid();
      ctx.fillStyle = g; ctx.fill();
      // lower lid
      const bagPk = botPk + H0 * 0.35, bagY = cy + H0 * 0.05;
      g = ctx.createLinearGradient(0, cy + botPk, 0, cy + bagPk);
      g.addColorStop(0, `hsl(${sk},${S}%,${L}%)`); g.addColorStop(1, `hsl(${sk},${S}%,${L * 0.5}%)`);
      ctx.beginPath();
      lidCurve(Rw * 1.05, bagY, bagPk / 0.75, k, false);
      ctx.lineTo(cx + Rw, cy);
      ctx.bezierCurveTo(cx + k, cy + botPk / 0.75, cx - k, cy + botPk / 0.75, cx - Rw, cy);
      ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.globalAlpha = 1;

      // ---- eyeball, clipped to the lid opening ----
      if (topPk + botPk > 1.5) {
        ctx.save();
        openingPath(topPk, botPk); ctx.clip();
        const ex = cx + cur.lookX * Rw * 0.12, ey = cy + cur.lookY * Rw * 0.06;
        drawSclera(ex, ey);
        drawIris();

        g = ctx.createRadialGradient(cx - Rw * 0.35, cy - H0 * 0.5, 0, cx - Rw * 0.35, cy - H0 * 0.5, Rw * 0.6);
        g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - Rw, cy - Rw, Rw * 2, Rw * 2);

        if (cur.nict > 0.01) {   // third eyelid: a milky membrane sliding in from the inner corner
          const xl = cx - Rw * 1.05 + Rw * 2.25 * clamp(cur.nict, 0, 1);
          g = ctx.createLinearGradient(xl - Rw * 0.7, 0, xl, 0);
          g.addColorStop(0, 'rgba(196,208,186,.62)'); g.addColorStop(0.85, 'rgba(226,232,210,.74)'); g.addColorStop(1, 'rgba(150,120,100,.8)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(xl - Rw * 2.4, cy, Rw * 2.4, Rw * 1.5, 0, 0, TAU); ctx.fill();
        }

        // inner lid shadow
        openingPath(topPk, botPk);
        const shd = T.shadow || 1;
        ctx.strokeStyle = `rgba(35,0,10,${0.045 * shd})`;
        for (let wdt = 0.22; wdt > 0.02; wdt -= 0.02) { ctx.lineWidth = Rw * wdt; ctx.stroke(); }
        ctx.strokeStyle = `rgba(20,0,0,${0.45 * shd})`; ctx.lineWidth = Rw * 0.016; ctx.stroke();
        if (T.sclera === 'human') {   // wet tear line along the lower lid
          const c2 = (botPk / 0.75) * 0.9 - Rw * 0.01;
          ctx.beginPath(); ctx.moveTo(cx - Rw * 0.9, cy);
          ctx.bezierCurveTo(cx - k, cy + c2, cx + k, cy + c2, cx + Rw * 0.95, cy);
          ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.lineWidth = Rw * 0.006; ctx.stroke();
        }
        ctx.restore();
      }

      // lid rim + creases
      ctx.lineCap = 'round';
      openingPath(topPk, botPk);
      if (T.rimSoft) { ctx.globalAlpha = 0.22; ctx.strokeStyle = T.rim(sk); ctx.lineWidth = Rw * (T.rimW || 0.022) * 1.8; ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.strokeStyle = T.rim(sk); ctx.lineWidth = Rw * (T.rimW || 0.022); ctx.stroke();
      const fade = a => { const fg = ctx.createLinearGradient(cx - Rw * 1.08, 0, cx + Rw * 1.08, 0); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.28, `rgba(0,0,0,${a})`); fg.addColorStop(0.72, `rgba(0,0,0,${a})`); fg.addColorStop(1, 'rgba(0,0,0,0)'); return fg; };
      ctx.strokeStyle = fade(T.crease); ctx.lineWidth = Rw * 0.014;
      ctx.beginPath(); lidCurve(Rw * 1.08, creaseY, creasePk / 0.75, k * 1.05, true); ctx.stroke();
      ctx.strokeStyle = fade(T.crease * 0.7); ctx.lineWidth = Rw * 0.01;
      ctx.beginPath(); lidCurve(Rw * 1.05, bagY, bagPk / 0.75, k, false); ctx.stroke();

      if (cur.rem > 0.02) {   // the eyeball bulging under a closed lid
        const r = Rw * T.irisSize * 1.05, bx = cx + cur.lookX * Rw * 0.4 * T.lookScale, by = cy - H0 * 0.38 + cur.lookY * H0 * 0.3;
        const al = clamp(cur.rem, 0, 1);
        ctx.save(); upperLid(); ctx.clip();
        g = ctx.createRadialGradient(bx - r * 0.2, by - r * 0.25, 0, bx, by, r);
        g.addColorStop(0, `rgba(255,255,255,${0.22 * al})`); g.addColorStop(0.55, 'rgba(255,255,255,0)');
        g.addColorStop(0.8, `rgba(0,0,0,${0.24 * al})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(bx - r, by - r, r * 2, r * 2);
        ctx.restore();
      }

      drawLashes(topPk, botPk, k);

      // blood drips from the lower lid
      if (fx.drips.length && fx.dripAlpha > 0) {
        ctx.globalAlpha = clamp(fx.dripAlpha, 0, 1);
        for (const d of fx.drips) {
          const b = bez(d.u, Rw, cy, botPk / 0.75, k);
          const w = Rw * d.w, Ld = Rw * d.len * 0.9, x = b.x, y = b.y;
          const dg = ctx.createLinearGradient(x - w, 0, x + w, 0);
          dg.addColorStop(0, '#4a0006'); dg.addColorStop(0.4, '#a3000f'); dg.addColorStop(1, '#3a0004');
          ctx.fillStyle = dg;
          ctx.beginPath();
          ctx.moveTo(x - w * 1.3, y);
          ctx.quadraticCurveTo(x - w * 0.5, y + Ld * 0.5, x - w * 0.7, y + Ld);
          ctx.arc(x, y + Ld, w * 1.3, Math.PI, 0, true);
          ctx.quadraticCurveTo(x + w * 0.5, y + Ld * 0.5, x + w * 1.3, y);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,180,180,.45)';
          ctx.beginPath(); ctx.arc(x - w * 0.45, y + Ld - w * 0.3, w * 0.35, 0, TAU); ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      if (fx.critter) drawCritter(fx.critter);
      if (cur.hud > 0.02) drawHud();

      // ---- screen-space overlays ----
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (cur.dim > 0.01) { ctx.fillStyle = `rgba(0,0,8,${clamp(cur.dim, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
      if (cur.grow > 0.01 && cur.glyph > 0.02 && fx.glyph === 'lake') {   // the crest lifts out of the eye and fills the window
        const gr = clamp(cur.grow, 0, 1), S0 = crestSize() * sc;
        const S1 = Math.min(W * 0.9, H * 0.92 / 1.24) * (1 + 0.012 * Math.sin(clock * 3));
        ctx.fillStyle = `rgba(0,0,8,${0.6 * gr})`; ctx.fillRect(0, 0, W, H);
        ctx.setTransform(1, 0, 0, 1, lerp(cx + ox + (irisX - cx) * sc, cx, gr), lerp(cy + oy + (irisY - cy) * sc, cy - 0.04 * S1, gr));
        drawCrest(clamp(cur.pupil, 0.04, 0.95) * Rw * T.irisSize * sc, clamp(cur.glyph, 0, 1), lerp(S0, S1, gr), gr);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      if (fx.cracks.length && fx.crackAlpha > 0) {   // the glass doesn't move with the eye
        ctx.globalAlpha = clamp(fx.crackAlpha, 0, 1);
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const lw = Math.max(1, Rw * 0.004);
        for (const c of fx.cracks) {
          const fr = c.r * 0.1 * c.shown, fg = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, fr);
          fg.addColorStop(0, 'rgba(255,255,255,.35)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = fg; ctx.fillRect(c.x - fr, c.y - fr, fr * 2, fr * 2);
          for (let i = 0; i < c.shown; i++) {
            ctx.setTransform(1, 0, 0, 1, lw, lw);
            ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = lw * 2.5; ctx.stroke(c.stages[i]);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.strokeStyle = 'rgba(240,248,255,.85)'; ctx.lineWidth = lw * (1.5 - i * 0.3); ctx.stroke(c.stages[i]);
          }
        }
        ctx.globalAlpha = 1;
      }
      if (fx.flashA > 0) { ctx.fillStyle = `rgba(${fx.flashColor},${fx.flashA * 0.85})`; ctx.fillRect(0, 0, W, H); }
      if (fx.glitch > 0) {
        const n = Math.floor(3 + fx.glitch * 10);
        for (let i = 0; i < n; i++) {
          const y = Math.random() * H, h = H * rand(0.01, 0.09), dx = rand(-1, 1) * W * 0.08 * fx.glitch;
          ctx.drawImage(canvas, 0, y, W, h, dx, y, W, h);
        }
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.35 * fx.glitch;
        ctx.drawImage(canvas, rand(-1, 1) * W * 0.02, 0);
        ctx.globalAlpha = 1;
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,255,210,.18)' : 'rgba(255,0,160,.18)';
          ctx.fillRect(0, Math.random() * H, W, H * rand(0.005, 0.03));
        }
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    function frame(ts) {
      requestAnimationFrame(frame);
      const cap = clamp(+cfg.fpsCap || 60, 10, 60);
      if (cap < 59 && ts - lastDraw < 1000 / cap - 2) return;
      const dt = lastDraw ? Math.min(0.05, (ts - lastDraw) / 1000) : 0.016;
      lastDraw = ts;
      update(dt);
      draw();
    }

    // ----- public API -----
    function setConfig(nc, initial) {
      const prev = cfg;
      cfg = mergeConfig(nc);
      const wantType = EYE_TYPES.some(t => t.id === cfg.eyeType) ? cfg.eyeType : null;
      if (initial) {
        T = EYE_TYPES.find(t => t.id === wantType) || EYE_TYPES[Math.floor(Math.random() * EYE_TYPES.length)];
        buildLashes();
        resize();
        const c0 = colors();
        cur.hue = c0.hue; cur.sat = c0.sat; cur.slit = T.slit; cur.pupil = T.pupil; cur.glow = T.glow;
      } else {
        if (prev.renderScale !== cfg.renderScale || prev.eyeSize !== cfg.eyeSize) resize();
        else if (prev.skinHue !== cfg.skinHue || prev.eyeType !== cfg.eyeType) rebuild();
        if (wantType && wantType !== T.id) requestType(wantType);
        else if (!wantType && prev.eyeType !== cfg.eyeType) { actsSinceType = 0; typeBag = []; requestType(nextRotateType()); }
      }
      bag = [];
      if (!initial && cfg.previewId && cfg.previewNonce !== prev.previewNonce) startAct(cfg.previewId);
      else if (act && cfg.enabled[act.anim.id] === false && !paused) nextAct();
      else if (act) act.dur = clamp(+cfg.durations[act.anim.id] || act.anim.dur, 2, 600);
    }

    let resizeTimer = 0;
    const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 150); };
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(canvas);

    buildLashes();
    resize();
    requestAnimationFrame(frame);

    return {
      setConfig,
      play: id => startAct(id),
      next: () => nextAct(),
      nextType: () => { const i = EYE_TYPES.findIndex(t => t.id === (pendingType || T.id)); requestType(EYE_TYPES[(i + 1) % EYE_TYPES.length].id); return EYE_TYPES[(i + 1) % EYE_TYPES.length]; },
      togglePause: () => (paused = !paused),
      isPaused: () => paused,
      current: () => (act ? act.anim : null),
      currentType: () => T,
      onChange: f => listeners.push(f)
    };
  }

  global.MonsterEye = { ANIMS, EYE_TYPES, DEFAULT_CONFIG, mergeConfig, Store, start };
})(window);
