/* 演練世界：配色混合、視差背景、地面、物件排序與整體渲染。 */
(function () {
  const DH = (window.DH = window.DH || {});
  const { SECTIONS, FINISH_X } = DH.core;
  const A = DH.art;
  const TAU = Math.PI * 2;
  const PATH_H = 118;
  const PATH_MARGIN = 16;

  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  const STORM = [88, 100, 122];
  /* 風險越高，這個色層越往暗沉的灰藍偏 */
  const STORM_MIX = { sky1: 0.72, sky2: 0.64, far: 0.55, mid: 0.48, near: 0.4, cloud: 0.4, bank: 0.26, bank2: 0.26, path: 0.18, pathEdge: 0.18, front: 0.28, front2: 0.28 };
  const COLOR_KEYS = Object.keys(STORM_MIX);

  const parsed = new WeakMap();
  function rgbPal(p) {
    if (!parsed.has(p)) {
      const out = {};
      COLOR_KEYS.forEach((k) => { out[k] = hex(p[k]); });
      parsed.set(p, out);
    }
    return parsed.get(p);
  }

  function blendAt(x) {
    const w = [0, 0, 0];
    const FADE = 240;
    let idx = SECTIONS.findIndex((s) => x < s.to);
    if (idx < 0) idx = SECTIONS.length - 1;
    const sec = SECTIONS[idx];
    if (idx < SECTIONS.length - 1 && x > sec.to - FADE) {
      const t = smooth(sec.to - FADE, sec.to + FADE, x);
      w[idx] = 1 - t;
      w[idx + 1] = t;
    } else if (idx > 0 && x < sec.from + FADE) {
      const t = smooth(sec.from - FADE, sec.from + FADE, x);
      w[idx - 1] = 1 - t;
      w[idx] = t;
    } else {
      w[idx] = 1;
    }
    return w;
  }

  function paletteFor(def, w, risk, mood) {
    const rf = smooth(25, 100, risk);
    const out = {};
    const pals = def.palettes.map(rgbPal);
    const mp = def.moodPal && mood ? rgbPal(mood > 0 ? def.moodPal.hot : def.moodPal.cold) : null;
    const moodK = mp ? Math.abs(mood) * 0.95 : 0;
    COLOR_KEYS.forEach((k) => {
      const c = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        if (w[i]) for (let j = 0; j < 3; j++) c[j] += pals[i][k][j] * w[i];
      }
      if (mp) for (let j = 0; j < 3; j++) c[j] += (mp[k][j] - c[j]) * moodK;
      const m = rf * STORM_MIX[k];
      for (let j = 0; j < 3; j++) c[j] += (STORM[j] - c[j]) * m;
      out[k] = c;
    });
    return out;
  }

  /* 地形 ------------------------------------------------------- */
  const wave = (x) => 10 * Math.sin(x * 0.0041) + 6 * Math.sin(x * 0.0113 + 1);
  const hillRise = (x) => 88 + 22 * Math.sin(x * 0.0029 + 2) + 10 * Math.sin(x * 0.009);

  /* opts 讓首頁可指定自己的鏡頭：z 縮放、basePx 路面上緣的螢幕高度 */
  function makeLayout(w, h, opts) {
    const o = opts || {};
    const z = o.z || clamp(Math.min(h / 620, w / 500), 0.6, 1.5);
    const vw = w / z;
    const vh = h / z;
    const base = o.basePx !== undefined ? o.basePx / z : vh * (vh > vw ? (h <= 700 ? 0.52 : 0.56) : 0.62);
    return { w, h, z, vw, vh, base, pathH: PATH_H, camX: o.camX };
  }
  const pathTop = (L, x) => L.base + wave(x);
  const playerY = (L, x, d) => pathTop(L, x) + PATH_MARGIN + d * (PATH_H - PATH_MARGIN * 2);

  function softSprite(rgb) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, `rgba(${rgb},1)`);
    g.addColorStop(0.55, `rgba(${rgb},.5)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    return cv;
  }
  let sprites = null;

  const CLEARABLE = new Set(['tree', 'palm', 'bush', 'fern', 'flower', 'rock', 'lamp', 'pole', 'bench', 'bin', 'bucket', 'cone', 'debrispile', 'branch', 'mud', 'crack', 'puddle', 'drain', 'broom', 'sandbags', 'tap', 'fan', 'maskstand', 'helmetbox', 'gauge', 'warnflag']);
  const MARKER_CLEARANCE = 62;

  /* 事件位置每局不同，開局時才把標記周圍的小物件藏起來 */
  function clearAroundEvents(decor, npcs, events) {
    const crowded = (x, range) => events.some((ev) => Math.abs(ev.x - x) < range);
    decor.forEach((it) => {
      it.hide = CLEARABLE.has(it.type) && it.oy < PATH_H + 40 && crowded(it.x, MARKER_CLEARANCE);
    });
    npcs.forEach((n) => {
      if (n.homeX === undefined) n.homeX = n.x;
      n.x = n.homeX;
      for (let step = 1; step < 12 && crowded(n.x, MARKER_CLEARANCE + 34); step++) n.x = n.homeX + step * 50;
    });
  }

  /* 背景層 --------------------------------------------------------- */
  function ridgeHeight(x, seed) {
    return 0.5 * (Math.sin(x * 0.0037 + seed) + 1) / 2 + 0.34 * (Math.sin(x * 0.0091 + seed) + 1) / 2 + 0.16 * (Math.sin(x * 0.019 + seed * 4) + 1) / 2;
  }
  function mountains(c, L, camX, par, seed, baseY, amp, col, hazeCol) {
    const off = camX * par;
    c.beginPath();
    c.moveTo(-20, L.vh + 300);
    for (let sx = -20; sx <= L.vw + 22; sx += 14) c.lineTo(sx, baseY - amp * ridgeHeight(sx + off, seed));
    c.lineTo(L.vw + 22, L.vh + 300);
    c.closePath();
    const g = c.createLinearGradient(0, baseY - amp, 0, baseY + 30);
    g.addColorStop(0, css(col));
    g.addColorStop(1, css(hazeCol));
    c.fillStyle = g;
    c.fill();
  }

  /* 城市輪廓：圓角方塊，比山脊更像社區 */
  function skyline(c, L, camX, par, seed, baseY, maxH, col) {
    const step = 74;
    const off = camX * par;
    const start = Math.floor(off / step) - 2;
    c.fillStyle = css(col);
    for (let i = start; i < start + L.vw / step + 4; i++) {
      const w = 48 + hash(i + seed) * 34;
      const h = maxH * (0.42 + hash(i + seed + 7) * 0.58);
      A.rr(c, i * step - off, baseY - h, w, h + 90, 11);
      c.fill();
    }
  }

  function cloud(c, x, y, s, col, alpha) {
    c.globalAlpha = alpha;
    A.ell(c, x, y, 58 * s, 19 * s, col);
    A.ell(c, x - 34 * s, y + 3 * s, 30 * s, 13 * s, col);
    A.ell(c, x + 37 * s, y + 3 * s, 34 * s, 14 * s, col);
    A.ell(c, x + 3 * s, y - 13 * s, 30 * s, 19 * s, col);
    c.globalAlpha = 1;
  }
  function clouds(c, L, g, pal, horizon) {
    const col = css(pal.cloud);
    const wrap = L.vw + 400;
    for (let i = 0; i < 7; i++) {
      const speed = 3 + hash(i) * 5;
      const raw = hash(i + 10) * 4000 + g.t * speed - g.cam.x * (0.1 + hash(i + 20) * 0.08);
      const x = ((raw % wrap) + wrap) % wrap - 200;
      const y = horizon * (0.16 + hash(i + 30) * 0.5);
      cloud(c, x, y, 0.6 + hash(i + 40) * 0.75, col, 0.8);
    }
  }
  function sun(c, L, def, w, horizon, risk, mood) {
    /* 低溫是陰冷的天，太陽收起來 */
    const cold = Math.max(0, -(mood || 0));
    const vis = (def.sun[0] * w[0] + def.sun[1] * w[1] + def.sun[2] * w[2]) * (1 - smooth(30, 90, risk) * 0.82) * (1 - cold);
    if (vis < 0.02) return;
    const x = L.vw * 0.78;
    const y = horizon * 0.28;
    c.globalAlpha = 0.62 * vis;
    c.drawImage(sprites.glow, x - 110, y - 110, 220, 220);
    c.globalAlpha = vis;
    A.ell(c, x, y, 36, 36, '#ffe9a8');
    c.globalAlpha = 1;
  }

  /* 海岸：海面、沙灘；seaRetreat 的主題在當下這段海水往外退、浪線出現在遠方 */
  function sea(c, L, g, def, w, horizon) {
    const retreat = (def.seaRetreat || 0) * w[1];
    const shore = L.base + 40 - retreat * (L.base + 40 - horizon - 24);
    const grad = c.createLinearGradient(0, horizon, 0, shore);
    grad.addColorStop(0, def.sea[0]);
    grad.addColorStop(1, def.sea[1]);
    c.fillStyle = grad;
    c.fillRect(-20, horizon, L.vw + 40, shore - horizon + 2);
    c.fillStyle = '#e6d6ac';
    c.fillRect(-20, shore, L.vw + 40, L.vh + 300);
    /* 水面反光 */
    c.strokeStyle = 'rgba(255,255,255,.5)';
    c.lineWidth = 2;
    c.lineCap = 'round';
    c.beginPath();
    const off = g.cam.x * 0.22;
    for (let i = 0; i < 16; i++) {
      const sx = (((hash(i) * 1600 - off + g.t * 5) % (L.vw + 80)) + L.vw + 80) % (L.vw + 80) - 40;
      const y = horizon + 8 + hash(i + 4) * Math.max(4, shore - horizon - 12);
      c.moveTo(sx - 14, y);
      c.quadraticCurveTo(sx, y - 3, sx + 14, y);
    }
    c.stroke();
    /* 岸邊的白浪線 */
    c.strokeStyle = 'rgba(255,255,255,.86)';
    c.lineWidth = 4;
    c.beginPath();
    for (let sx = -20; sx <= L.vw + 20; sx += 16) {
      const y = shore + Math.sin((sx + off) * 0.03 + g.t) * 3;
      if (sx === -20) c.moveTo(sx, y);
      else c.lineTo(sx, y);
    }
    c.stroke();
    if (retreat > 0.05) {
      /* 遠方鼓起的浪線 */
      c.globalAlpha = retreat;
      c.strokeStyle = '#fff';
      c.lineWidth = 5;
      c.beginPath();
      for (let sx = -20; sx <= L.vw + 20; sx += 14) {
        const y = horizon + 3 + Math.sin((sx + off) * 0.018 + g.t * 0.6) * 3;
        if (sx === -20) c.moveTo(sx, y);
        else c.lineTo(sx, y);
      }
      c.stroke();
      c.globalAlpha = 1;
      /* 退潮後的濕沙 */
      c.fillStyle = `rgba(160,140,105,${0.3 * retreat})`;
      c.fillRect(-20, shore + 3, L.vw + 40, 24);
    }
    /* 主題自己的海面細節（海嘯：遠方大浪、擱淺小船、災後泥水） */
    if (def.seaFx) def.seaFx(c, L, g, w, horizon, shore, retreat);
  }

  function backdrop(c, L, g, def, pal, w, horizon) {
    const camX = g.cam.x;
    const tall = Math.max(1, L.vh / 640);
    if (def.backdrop === 'coast') {
      mountains(c, L, camX, 0.06, 1.3, horizon + 8, 70 * tall, pal.far, pal.sky2);
      sea(c, L, g, def, w, horizon);
      if (def.plant) {
        /* 遠方的發電廠：畫在海面之後，坐落在對岸的低矮岬角上 */
        const span = def.plantSpan || 900;
        const phase = def.plantPhase || 340;
        const off = camX * 0.14;
        const first = Math.floor((off - phase - 300) / span);
        for (let i = first; i < first + L.vw / span + 3; i++) {
          c.save();
          c.translate(i * span - off + phase, horizon + 2);
          A.decor.plant(c, def.plantScale || 0.85, g.t, {});
          c.restore();
        }
      }
      return;
    }
    if (def.backdrop === 'mountain') {
      mountains(c, L, camX, 0.08, 1.3, horizon, 240 * tall, pal.far, pal.sky2);
      mountains(c, L, camX, 0.18, 3.1, horizon + 18, 170 * tall, pal.mid, pal.far);
      mountains(c, L, camX, 0.4, 5.7, horizon + 44, 92, pal.near, pal.mid);
      return;
    }
    mountains(c, L, camX, 0.08, 1.3, horizon, 150 * tall, pal.far, pal.sky2);
    skyline(c, L, camX, 0.22, 3, horizon + 10, 118 * tall, pal.mid);
    skyline(c, L, camX, 0.42, 17, horizon + 30, 88 * tall, pal.near);
  }

  /* 地面 ----------------------------------------------------------- */
  function ground(c, L, g, def, pal) {
    const camX = g.cam.x;
    const left = camX - L.vw / 2;
    const step = 14;
    const bottom = L.vh + 300;
    const hill = def.hill === undefined ? 1 : def.hill;

    c.beginPath();
    c.moveTo(-20, bottom);
    for (let sx = -20; sx <= L.vw + 22; sx += step) {
      const x = left + sx;
      c.lineTo(sx, pathTop(L, x) - hillRise(x) * hill);
    }
    c.lineTo(L.vw + 22, bottom);
    c.closePath();
    const gb = c.createLinearGradient(0, L.base - 120 * hill, 0, L.base + 10);
    gb.addColorStop(0, css(pal.bank));
    gb.addColorStop(1, css(pal.bank2));
    c.fillStyle = gb;
    c.fill();

    c.beginPath();
    c.moveTo(-20, bottom);
    for (let sx = -20; sx <= L.vw + 22; sx += step) c.lineTo(sx, pathTop(L, left + sx) + PATH_H);
    c.lineTo(L.vw + 22, bottom);
    c.closePath();
    const gf = c.createLinearGradient(0, L.base + PATH_H, 0, L.vh + 40);
    gf.addColorStop(0, css(pal.front));
    gf.addColorStop(1, css(pal.front2));
    c.fillStyle = gf;
    c.fill();

    /* 溪溝：土石流場景，濁水從坡上穿過路面 */
    (def.stream || []).forEach((wx) => {
      const sx = wx - left;
      if (sx > -200 && sx < L.vw + 200) gully(c, L, sx, g.t);
    });

    c.beginPath();
    for (let sx = -20; sx <= L.vw + 22; sx += step) {
      const y = pathTop(L, left + sx);
      if (sx === -20) c.moveTo(sx, y);
      else c.lineTo(sx, y);
    }
    for (let sx = L.vw + 22; sx >= -20; sx -= step) c.lineTo(sx, pathTop(L, left + sx) + PATH_H);
    c.closePath();
    c.fillStyle = css(pal.path);
    c.fill();

    (def.stream || []).forEach((wx) => {
      const sx = wx - left;
      if (sx > -200 && sx < L.vw + 200) bridge(c, L, sx, wx);
    });

    [0, PATH_H].forEach((dy) => {
      c.beginPath();
      for (let sx = -20; sx <= L.vw + 22; sx += step) {
        const y = pathTop(L, left + sx) + dy;
        if (sx === -20) c.moveTo(sx, y);
        else c.lineTo(sx, y);
      }
      c.strokeStyle = css(pal.pathEdge);
      c.lineWidth = 4;
      c.stroke();
    });

    /* 路面標線與小石頭（鎖在世界座標） */
    const dash = 96;
    const firstDash = Math.floor(left / dash) - 1;
    c.fillStyle = css(pal.pathEdge);
    c.globalAlpha = 0.42;
    for (let i = firstDash; i < firstDash + L.vw / dash + 3; i++) {
      const x = i * dash;
      A.rr(c, x - left, pathTop(L, x) + PATH_H / 2 - 2.5, 44, 5, 2.5);
      c.fill();
    }
    const pStep = 44;
    const first = Math.floor(left / pStep) - 1;
    for (let i = first; i < first + L.vw / pStep + 3; i++) {
      const x = i * pStep + hash(i) * 26;
      const y = pathTop(L, x) + 12 + hash(i + 3) * (PATH_H - 24);
      const r = 1.6 + hash(i + 5) * 2.4;
      c.beginPath();
      c.ellipse(x - left, y, r * 1.5, r, 0, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  }

  function gully(c, L, x, t) {
    const top = L.base - 130;
    const bottom = L.vh + 300;
    c.beginPath();
    c.moveTo(x - 30, top);
    for (let y = top; y <= bottom; y += 26) c.lineTo(x - 42 + Math.sin(y * 0.03) * 14 + (y - top) * 0.03, y);
    for (let y = bottom; y >= top; y -= 26) c.lineTo(x + 44 + Math.sin(y * 0.03) * 14 + (y - top) * 0.06, y);
    c.closePath();
    c.fillStyle = '#a98a68';
    c.fill();
    c.strokeStyle = 'rgba(235,220,195,.7)';
    c.lineWidth = 2.5;
    c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const y = top + ((i * 56 + t * 60) % 500);
      const ox = Math.sin(i * 2.3) * 20;
      c.beginPath();
      c.moveTo(x + ox - 9, y);
      c.quadraticCurveTo(x + ox, y + 4, x + ox + 9, y);
      c.stroke();
    }
  }
  function bridge(c, L, sx, wx) {
    const yT = pathTop(L, wx) - 2;
    A.box(c, sx - 66, yT, 132, PATH_H + 4, 4, '#b98a60');
    for (let i = 0; i < 8; i++) A.box(c, sx - 63 + i * 16.2, yT + 3, 14, PATH_H - 2, 3, i % 2 ? '#c99a6e' : '#d2a579');
  }

  function grassEdge(c, L, g, pal) {
    const left = g.cam.x - L.vw / 2;
    const step = 24;
    const first = Math.floor(left / step) - 1;
    c.strokeStyle = css(pal.front2);
    c.lineWidth = 2.6;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = first; i < first + L.vw / step + 3; i++) {
      const wx = i * step + hash(i) * 10;
      /* 一段有草、一段留白，邊緣才不會像梳子 */
      if (Math.sin(i * 0.53) + hash(i + 11) * 0.7 < 0.1) continue;
      const sx = wx - left;
      const y = pathTop(L, wx) + PATH_H + 2;
      const h = 7 + hash(i + 2) * 8;
      c.moveTo(sx, y);
      c.lineTo(sx - 3, y - h);
      c.moveTo(sx, y);
      c.lineTo(sx + 3, y - h * 0.85);
    }
    c.stroke();
  }

  /* 純裝飾前景葉片：視差 1.08–1.15，只長在左右下角 */
  function leaf(c, len, wid, col) {
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(-wid, -len * 0.55, 0, -len);
    c.quadraticCurveTo(wid, -len * 0.55, 0, 0);
    c.closePath();
    c.fillStyle = col;
    c.fill();
  }
  function foreground(c, L, g, pal) {
    const y = L.vh - (g.bottomSafe || 0) + 8;
    const reach = Math.min(L.vw * 0.2, 190);
    [[1.08, 118, 0], [1.15, 156, 40]].forEach(([par, step, seed]) => {
      const off = g.cam.x * par;
      const first = Math.floor(off / step) - 1;
      const col = css(par > 1.1 ? pal.front2 : pal.front);
      for (let i = first; i < first + L.vw / step + 3; i++) {
        const x = i * step - off + hash(i + seed) * step * 0.6;
        const edge = Math.min(x, L.vw - x);
        const size = 1 - smooth(reach * 0.25, reach, edge);
        if (size < 0.04) continue;
        const n = 3 + Math.floor(hash(i + seed + 4) * 2.5);
        const tall = (par > 1.1 ? 74 : 56) * (0.8 + hash(i + seed + 8) * 0.4) * size;
        for (let k = 0; k < n; k++) {
          c.save();
          c.translate(x + (k - (n - 1) / 2) * 6, y);
          c.rotate((k - (n - 1) / 2) * 0.36 + Math.sin(g.t * 0.9 + i) * 0.025);
          leaf(c, tall, Math.max(5, tall * 0.2), col);
          c.restore();
        }
      }
    });
  }

  function butterflies(c, L, g, def, w) {
    const k = (def.bugs[0] * w[0] + def.bugs[1] * w[1] + def.bugs[2] * w[2]) * (1 - Math.max(0, -(g.mood || 0)));
    if (k < 0.05) return;
    const left = g.cam.x - L.vw / 2;
    const colors = ['#ffb1c4', '#ffd965', '#c9b6f2', '#fff', '#8fd3f4'];
    c.globalAlpha = Math.min(1, k);
    for (let i = 0; i < 18; i++) {
      const wx = 300 + i * 310 + Math.sin(g.t * 0.33 + i * 2) * 95;
      const sx = wx - left;
      if (sx < -30 || sx > L.vw + 30) continue;
      const y = L.base - 54 + Math.sin(g.t * 1.1 + i) * 24 + hash(i) * 110;
      A.drawButterfly(c, sx, y, 1.1, g.t + i, colors[i % colors.length]);
    }
    c.globalAlpha = 1;
  }

  /* 風險累積的氛圍：起霧與四周變暗，各災害共用 */
  function riskFog(c, L, g, risk) {
    const fog = smooth(40, 100, risk);
    if (fog < 0.01) return;
    for (let i = 0; i < 7; i++) {
      const span = L.vw + 700;
      const raw = i * 380 + g.t * (8 + i * 2.2) - g.cam.x * 0.45;
      const x = ((raw % span) + span) % span - 350;
      const y = L.base - 170 + (i % 4) * 92 + Math.sin(g.t * 0.3 + i) * 14;
      const size = 430 + (i % 3) * 130;
      c.globalAlpha = 0.25 * fog;
      c.drawImage(sprites.fog, x - size / 2, y - size * 0.3, size, size * 0.6);
    }
    c.globalAlpha = 1;
  }
  function vignette(c, L, risk) {
    const v = smooth(35, 100, risk);
    if (v < 0.01) return;
    const r = Math.max(L.vw, L.vh) * 0.82;
    const g = c.createRadialGradient(L.vw / 2, L.vh * 0.55, r * 0.34, L.vw / 2, L.vh * 0.55, r);
    g.addColorStop(0, 'rgba(32,36,58,0)');
    g.addColorStop(1, `rgba(32,36,58,${0.4 * v})`);
    c.fillStyle = g;
    c.fillRect(-20, -20, L.vw + 40, L.vh + 40);
  }

  /* 事件點 --------------------------------------------------------- */
  function eventMarker(c, ev, x, y, t, isNext, near) {
    if (ev.done) {
      if (ev.correct) A.drawFlower(c, x, y - 6, 8, '#ffb1c4', ev.x);
      else A.ell(c, x, y - 2, 7, 4.5, 'rgba(120,110,100,.5)');
      return;
    }
    A.ell(c, x, y + 1, 22, 6, 'rgba(60,50,40,.17)');
    A.box(c, x - 3.5, y - 44, 7, 44, 3, '#a4714c');
    /* 只有下一個事件上下浮動；之後的事件安靜地待著 */
    const bob = isNext ? Math.sin(t * 2.2 + ev.x) * 3 : 0;
    const frame = isNext ? '#ee8549' : '#d9cbb2';
    const by = y - 83 + bob;
    if (near) {
      c.globalAlpha = 0.6;
      c.drawImage(sprites.glow, x - 58, y - 26, 116, 52);
      c.globalAlpha = 1;
      c.beginPath();
      c.ellipse(x, y + 1, 31, 10, 0, 0, TAU);
      c.strokeStyle = '#ffd27a';
      c.lineWidth = 3.5;
      c.stroke();
    }
    c.save();
    c.translate(x, by);
    A.poly(c, [-8, 18, 8, 18, 0, 29], frame);
    A.ell(c, 0, 0, 24, 24, frame);
    A.ell(c, 0, 0, 19.5, 19.5, '#fffdf6');
    if (!isNext) c.globalAlpha = 0.62;
    A.icons[A.markerIcon(ev.scenario.category, ev.scenario.stage)](c);
    c.globalAlpha = 1;
    c.restore();
    if (near) {
      A.box(c, x - 26, by - 53, 52, 23, 11.5, '#bd542b');
      A.text(c, '查看', x, by - 41, 14, '#fff', 700);
    }
  }

  function drawNpc(c, n, sx, y, t) {
    if (n.kind === 'neighbor') {
      const gear = n.gearCold && (A.mood || 0) < -0.1 ? n.gearCold : n.gear;
      A.drawHero(c, sx, y, { t, scale: n.s, dir: n.dir, colors: n.colors, gear: Object.assign({}, gear, n.helmet ? { helmet: true } : null), blinkSeed: n.x * 0.37, noPack: true });
    } else {
      A.drawPet(c, n.kind, sx, y, n.s, t + n.x, n.dir, n.color);
    }
  }

  /* 景深霧化：把物件先畫到暫存畫布，只在物件本身的形狀上蓋一層霾色（上濃下淡），
     遠的建物窗格、樓板線與屋頂邊緣一起被壓低對比，不會像整條薄紗把近景也洗淡 */
  let hazeBuf = null;
  function drawHazed(c, e, t, k, rgb) {
    const cv = c.canvas;
    if (!hazeBuf) hazeBuf = document.createElement('canvas');
    if (hazeBuf.width !== cv.width || hazeBuf.height !== cv.height) {
      hazeBuf.width = cv.width;
      hazeBuf.height = cv.height;
    }
    const o = hazeBuf.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.clearRect(0, 0, cv.width, cv.height);
    o.setTransform(c.getTransform());
    o.save();
    o.translate(e.sx, e.y);
    A.decor[e.it.type](o, e.it.s, t, e.it);
    o.restore();
    o.save();
    o.translate(e.sx, e.y);
    o.globalCompositeOperation = 'source-atop';
    const top = -300 * e.it.s;
    const g = o.createLinearGradient(0, top, 0, 0);
    g.addColorStop(0, `rgba(${rgb},${Math.min(0.95, k * 1.18)})`);
    g.addColorStop(0.5, `rgba(${rgb},${k})`);
    g.addColorStop(1, `rgba(${rgb},${k * 0.72})`);
    o.fillStyle = g;
    o.fillRect(-260, top - 40, 520, -top + 60);
    o.restore();
    o.globalCompositeOperation = 'source-over';
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(hazeBuf, 0, 0);
    c.restore();
  }

  /* 主要繪製 --------------------------------------------------------- */
  function render(c, L, g) {
    if (!sprites) {
      sprites = { fog: softSprite('226,232,240'), glow: softSprite('255,232,170'), smog: softSprite('196,180,140') };
    }
    A.viewZ = L.z;
    /* 物件依目前氣溫換畫法（寒流時住宅關窗、鄰居穿厚衣） */
    A.mood = g.mood || 0;
    const def = g.theme;
    const w = blendAt(g.cam.x);
    const pal = paletteFor(def, w, g.riskView, g.mood);
    const t = g.t;
    const camX = g.cam.x;
    const left = camX - L.vw / 2;
    const env = { left, pathTop: (x) => pathTop(L, x) };
    const shakeAmp = def.shake && !A.reducedMotion() ? def.shake(g, w, t) : 0;
    const quakeX = shakeAmp ? Math.sin(t * 31) * shakeAmp : 0;
    const quakeY = shakeAmp ? Math.cos(t * 27) * shakeAmp * 0.6 : 0;

    c.save();
    c.translate(g.shake.x + quakeX, g.shake.y + quakeY - g.lift);

    /* 天空要蓋住上抬與搖晃露出的邊 */
    const sky = c.createLinearGradient(0, 0, 0, L.base);
    sky.addColorStop(0, css(pal.sky1));
    sky.addColorStop(1, css(pal.sky2));
    c.fillStyle = sky;
    c.fillRect(-40, -40, L.vw + 80, L.vh + 400);

    const horizon = L.base - 34 - (def.horizonLift || 0);
    if (def.sky) def.sky(c, L, g, w);
    sun(c, L, def, w, horizon, g.riskView, g.mood);
    clouds(c, L, g, pal, horizon);
    backdrop(c, L, g, def, pal, w, horizon);

    ground(c, L, g, def, pal);
    grassEdge(c, L, g, pal);

    /* 地上的平面物件先畫，角色踩在上面 */
    for (const it of g.decor) {
      if (it.hide || !A.flatDecor.has(it.type)) continue;
      const sx = it.x - left;
      if (sx < -120 || sx > L.vw + 120) continue;
      c.save();
      c.translate(sx, pathTop(L, it.x) + it.oy);
      A.decor[it.type](c, it.s, t, it);
      c.restore();
    }
    if (def.ground) def.ground(c, L, g, env, w);

    /* 物件依前後排序，角色才會正確地被遮或遮別人 */
    const margin = 320;
    const list = [];
    /* 高低溫：遮蔭點與保暖站依目前氣溫二選一 */
    const moodOff = (it) => (it.mood === 'hot' && (g.mood || 0) < -0.1) || (it.mood === 'cold' && (g.mood || 0) >= -0.1);
    for (const it of g.decor) {
      const sx = it.x - left;
      if (it.hide || moodOff(it) || A.flatDecor.has(it.type) || sx < -margin || sx > L.vw + margin) continue;
      list.push({ y: pathTop(L, it.x) + it.oy, it, sx });
    }
    for (const n of g.npcs) {
      const sx = n.x - left;
      if (sx < -80 || sx > L.vw + 80) continue;
      list.push({ y: pathTop(L, n.x) + n.oy, npc: n, sx });
    }
    g.events.forEach((ev, i) => {
      const sx = ev.x - left;
      if (sx < -80 || sx > L.vw + 80) return;
      list.push({ y: playerY(L, ev.x, ev.d), ev, sx, isNext: i === g.eventIndex });
    });
    const p = g.player;
    const heroSx = p.x - left;
    const heroY = playerY(L, p.x, p.d);
    list.push({ y: heroY, player: true, sx: heroSx });
    list.sort((a, b) => a.y - b.y);

    if (g.walkTarget) {
      const sx = g.walkTarget.x - left;
      const y = playerY(L, g.walkTarget.x, g.walkTarget.d);
      const pulse = (t * 2) % 1;
      c.strokeStyle = `rgba(255,253,246,${0.9 * (1 - pulse)})`;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(sx, y, 7 + pulse * 22, 3 + pulse * 9, 0, 0, TAU);
      c.stroke();
    }

    const hazeK = def.depthHaze ? def.depthHaze(w) : 0;
    for (const e of list) {
      if (e.it && e.it.haze && hazeK * e.it.haze > 0.02) {
        drawHazed(c, e, t, hazeK * e.it.haze, def.depthHazeRgb || '170,172,186');
      } else if (e.it) {
        c.save();
        c.translate(e.sx, e.y);
        A.decor[e.it.type](c, e.it.s, t, e.it);
        c.restore();
      } else if (e.npc) {
        drawNpc(c, e.npc, e.sx, e.y, t);
      } else if (e.ev) {
        eventMarker(c, e.ev, e.sx, e.y, t, e.isNext, e.isNext && g.nearEvent);
      } else {
        A.drawHero(c, e.sx, e.y, {
          t, scale: (0.92 + p.d * 0.12) * (g.heroScale || 1), dir: p.dir, risk: g.riskView, phase: p.phase, moving: p.moving, pose: p.pose, jump: p.jump, gear: g.gear,
        });
      }
    }

    butterflies(c, L, g, def, w);
    if (def.fx) def.fx(c, L, Object.assign({}, g, { sprites, hero: { sx: heroSx, y: heroY, dir: p.dir } }), w);
    riskFog(c, L, g, g.riskView);

    if (g.npcSpeech) {
      const n = g.npcSpeech;
      const headH = n.kind === 'neighbor' ? 112 : 66;
      A.speech(c, clamp(n.x - left, 120, L.vw - 120), pathTop(L, n.x) + n.oy - headH * n.s, n.say);
    }
    if (p.say) A.speech(c, clamp(heroSx, 100, L.vw - 100), heroY - 122 - p.jump, p.say);

    for (const q of g.particles) {
      const sx = q.x - left;
      c.globalAlpha = Math.min(1, q.life / 0.4);
      if (q.kind === 'flower') A.drawFlower(c, sx, q.y, q.r, q.color, q.rot);
      else if (q.kind === 'text') {
        c.save();
        c.font = `700 ${q.size}px ${A.FONT}`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineJoin = 'round';
        c.lineWidth = 5;
        c.strokeStyle = 'rgba(255,253,246,.95)';
        const ty = Math.max(q.y, g.lift + (g.topSafe || 0));
        const tx = clamp(sx, 90, L.vw - 90);
        c.strokeText(q.text, tx, ty);
        c.fillStyle = q.color;
        c.fillText(q.text, tx, ty);
        c.restore();
      }
      c.globalAlpha = 1;
    }
    c.restore();

    /* 前景貼著螢幕下緣，不跟著鏡頭上抬 */
    foreground(c, L, g, pal);
    vignette(c, L, g.riskView);
  }

  DH.world = { PATH_H, makeLayout, pathTop, playerY, clearAroundEvents, render, blendAt, FINISH_X };
})();
