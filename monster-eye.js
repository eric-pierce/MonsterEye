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

  // ---------- animation library ----------
  // Each animation gets `a` every frame:
  //   a.t (seconds into this act), a.p (0..1 progress), a.dt, a.tgt (target
  //   eye parameters to modify), a.ctl (behaviour switches), a.st (per-act
  //   scratch state), a.blink(dur), a.flash(alpha, 'r,g,b', decay), a.fx, a.base
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
      spiral: 0, multi: 0, glow: 0.25, dim: 0
    };
    const SPEEDS = {
      lookX: 14, lookY: 14, pupil: 4, slit: 3, hue: 2.5, sat: 3,
      lid: 8, lidTop: 8, lidBot: 8, blood: 2.5, shake: 6, scale: 6,
      spiral: 2.5, multi: 3, glow: 3, dim: 3
    };
    const cur = Object.assign({}, BASE);
    let rot = 0, clock = 0, lastDraw = 0;
    const fx = { flashA: 0, flashColor: '255,255,255', flashDecay: 4, glitch: 0, drips: [], dripAlpha: 0 };
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

    function getTex(name) {
      if (!tex[name]) tex[name] = name === 'human' ? makeHumanIris() : name === 'cracks' ? makeCracks() : makeFibers();
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
      sg.addColorStop(0, T.corpse ? 'rgba(45,25,55,.62)' : 'rgba(70,30,25,.3)'); sg.addColorStop(1, 'rgba(45,25,40,0)');
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
      const goat = T.fur === 'goat';
      radialBg(g, [[0, `hsl(${sk},${S}%,${L * 0.85}%)`], [0.5, `hsl(${sk},${S}%,${L * 0.55}%)`], [1, `hsl(${sk},${S * 0.8}%,${L * 0.1}%)`]]);
      noiseOverlay(g, 0.5, Rw / 110);
      const B = 12, paths = Array.from({ length: B }, () => new Path2D());
      const count = Math.round(W * H / (goat ? 22 : 18));
      const hair = Rw * (goat ? 0.035 : 0.05);
      for (let i = 0; i < count; i++) {
        const x = Math.random() * W, y = Math.random() * H;
        const dx = (x - cx) / Rw, dy = (y - cy) / (H0 * 1.8), d = Math.hypot(dx, dy);
        if (d < 0.6) continue;
        // fur flows away from the eye and back toward the ear (right)
        const rx = (x - cx) / (d * Rw + 1), ry = (y - cy) / (d * Rw + 1);
        const ang = Math.atan2(ry * 0.6 - 0.25, rx * 0.6 + 0.85) + (fbm(x / W * 2.5, y / H * 2.5, 64, 64, 3, 41) - 0.5) * 1.1;
        const len = hair * (0.7 + 0.3 * Math.min(2, d)) * rand(0.7, 1.3);
        let b = 0.55 + (fbm(x / W * 5 + 3, y / H * 5, 64, 64, 3, 13) - 0.5) * 0.8 + rand(-0.12, 0.12);
        if (!goat) {
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
      g.lineCap = 'round'; g.lineWidth = Math.max(0.8, Rw * 0.003); g.globalAlpha = 0.45;
      paths.forEach((p, k) => { g.strokeStyle = `hsl(${sk},${S}%,${Math.min(92, L * (0.3 + 1.05 * (k + 0.5) / B))}%)`; g.stroke(p); });
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

    function getSkin() {
      const sk = colors().sk, key = `${T.id}|${sk}|${W}x${H}|${Rw.toFixed(1)}`;
      if (skinCache[key]) return skinCache[key];
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      ({ warty: skinWarty, human: skinHuman, scales: skinScales, charred: skinCharred, rotten: skinRotten, metal: skinMetal, fur: skinFur, octo: skinOcto })[T.skin](g, sk, T.skinS, T.skinL);
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
      cx = W / 2; cy = H / 2;
      skinCache = {};
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
        rotSpeed: 0.04, speeds: {}, glitch: 0, bleeding: false
      };
      act.anim.fn({
        t: act.time, p: clamp(act.time / act.dur, 0, 1), dt, dur: act.dur,
        tgt, ctl, st: act.st, fx, base: { hue: c.hue, slit: T.slit, pupil: T.pupil },
        blink: doBlink, flash
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
        animal: ['#8f7253', '#6b4f36', '#3a291b', '#110a05']
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
        const rx = Math.min(r * 1.6, Ri * 0.92), ry = Math.max(Ri * 0.012, r * 0.36 * (1 - 0.75 * sl)), cr = ry * 0.95;
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
      ctx.beginPath();
      lidCurve(Rw * 1.08, creaseY, creasePk / 0.75, k * 1.05, true);
      ctx.lineTo(cx + Rw, cy);
      ctx.bezierCurveTo(cx + k, cy - topPk / 0.75, cx - k, cy - topPk / 0.75, cx - Rw, cy);
      ctx.closePath();
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

      // ---- screen-space overlays ----
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (cur.dim > 0.01) { ctx.fillStyle = `rgba(0,0,8,${clamp(cur.dim, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
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
