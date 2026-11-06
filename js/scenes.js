/* 十種災害的場景主題：配色、物件擺放、天氣與氛圍。走的路都一樣，三段分別是災前、當下、災後。 */
(function () {
  const DH = window.DH;
  const { FINISH_X, makeRng } = DH.core;
  const A = DH.art;
  const TAU = Math.PI * 2;
  const hash = (n) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const smooth = (a, b, v) => {
    const t = clamp((v - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const PATH_H = 118;
  /* 入口場景的中心；村口地標（土地公廟）離中心的距離依可視寬度取，手機才不會躲到圖章後面 */
  const ENTRY_C = 700;
  const shrineDx = (L) => (L.vw < 640 ? 122 : 146);
  /* 海嘯災後殘留帶離路面下緣的距離（世界座標），裝飾與地面泥沙共用，兩邊才對得齊 */
  /* 不是等寬的邊：在緩和的起伏上，疊幾道寬窄、長短不一的泥沙舌（往右下拖長），最長的一道對著海堤缺口 */
  const WRACK_GAP = 4115;
  const wrackAt = (x) => {
    let y = 3 + 3 * Math.sin(x * 0.011) + 2.5 * Math.sin(x * 0.037 + 1.3);
    const cell = 260;
    const i0 = Math.floor(x / cell);
    for (let i = i0 - 2; i <= i0 + 1; i++) {
      if (hash(i * 1.7 + 0.3) < 0.3) continue;
      const cx = i * cell + hash(i + 0.51) * cell;
      const len = 12 + hash(i + 0.77) * 50;
      const w = 34 + hash(i + 0.93) * 90;
      const d = (x - cx) / (x > cx ? w * 1.6 : w);
      y += len * Math.exp(-d * d);
    }
    const g = (x - WRACK_GAP) / (x > WRACK_GAP ? 170 : 90);
    return y + 62 * Math.exp(-g * g);
  };
  const FLOWERS = ['#ffb1c4', '#ffd965', '#fff', '#c9b6f2', '#ffc78f'];
  const B = [0, 1800];
  const D = [1800, 3700];
  const F = [3700, FINISH_X + 500];
  /* 事件節點的中心（core.buildEvents 的格位）。關鍵線索固定擺在節點旁，角色停下來時一定看得到 */
  const NODES = { before: [790, 1270], during: [2237, 2770, 3303], after: [4150, 4760] };

  const pal = (sky1, sky2, far, mid, near, bank, bank2, path, pathEdge, front, front2, cloud) => ({
    sky1, sky2, far, mid, near, bank, bank2, path, pathEdge, front, front2, cloud,
  });
  /* 暖色街道的預設配色 */
  const SUNNY = pal('#a9ddf5', '#fff3dc', '#c9e0ea', '#b5d8c9', '#a2d4ac', '#b3e09a', '#9ad48b', '#efe2c6', '#d1bb94', '#9bd68c', '#79c278', '#ffffff');

  /* 擺放工具 ------------------------------------------------------- */
  function kit(r) {
    const items = [];
    const add = (type, x, oy, s, extra) => items.push(Object.assign({ type, x, oy, s: s || 1, h: r.next() }, extra));
    const back = (lo, hi) => -r.range(lo, hi);
    const front = (lo, hi) => PATH_H + r.range(lo, hi);
    return {
      items,
      add,
      back,
      front,
      /* 沿路蓋房子，房子之間穿插樹與路燈 */
      street([from, to], kinds, extra, between) {
        let x = from + r.range(40, 120);
        while (x < to) {
          const type = r.pick(kinds);
          add(type, x, -r.range(8, 16), r.range(0.82, 1), typeof extra === 'function' ? extra(x) : extra);
          x += type === 'apartment' ? 112 : 92;
          const b = r.pick(between || ['tree', 'tree', 'lamp', 'bush']);
          add(b, x, -r.range(4, 10), r.range(0.78, 1), typeof extra === 'function' ? extra(x) : extra);
          x += r.range(84, 150);
        }
      },
      /* 近景花草 */
      flowers([from, to], gapLo, gapHi, opts) {
        const o = opts || {};
        for (let x = from; x < to; x += r.range(gapLo, gapHi)) {
          const near = r.next() < 0.2;
          add(r.pick(o.kinds || ['flower', 'flower', 'fern', 'bush']), x, front(8, near ? 200 : 66), r.range(0.8, near ? 1.7 : 1.2), { color: r.pick(o.colors || FLOWERS), dark: o.dark, light: o.light });
        }
      },
      /* 每個事件節點固定配一組線索：主要的放節點後方、輔助的放節點前方 */
      cues(nodes, fn) {
        nodes.forEach((n, i) => fn(n, i));
      },
      signs(labels) {
        add('stagesign', 300, -1, 0.96, { label: '災前準備', sub: labels[0] });
        add('stagesign', D[0] + 40, -1, 0.96, { label: '災害當下', sub: labels[1] });
        add('stagesign', F[0] + 40, -1, 0.96, { label: '災後', sub: labels[2] });
        add('gate', FINISH_X + 60, -6, 1, { label: '演練完成' });
      },
    };
  }

  /* 天氣工具 ------------------------------------------------------- */
  function rain(c, L, t, amount, slant) {
    if (amount < 0.02) return;
    c.strokeStyle = `rgba(226,238,250,${0.62 * Math.min(1, amount)})`;
    c.lineWidth = 1.6;
    c.lineCap = 'round';
    c.beginPath();
    const n = Math.round(90 * amount);
    const sl = slant || 4;
    for (let i = 0; i < n; i++) {
      const sx = (hash(i) * L.vw * 1.2 + t * sl * 22) % (L.vw * 1.2) - L.vw * 0.1;
      const sy = (hash(i + 90) * L.vh + t * (560 + hash(i + 40) * 240)) % L.vh;
      c.moveTo(sx, sy);
      c.lineTo(sx - sl, sy + 15);
    }
    c.stroke();
  }
  function windLines(c, L, t, amount, color) {
    if (amount < 0.02) return;
    c.strokeStyle = color || `rgba(255,255,255,${0.62 * amount})`;
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i < 14; i++) {
      const span = L.vw + 300;
      const sx = (hash(i + 7) * span + t * (260 + hash(i) * 150)) % span - 150;
      const sy = hash(i + 31) * L.base * 1.05 + Math.sin(t * 2 + i) * 6;
      const len = 44 + hash(i + 3) * 64;
      c.moveTo(sx, sy);
      c.quadraticCurveTo(sx + len * 0.5, sy - 6, sx + len, sy);
      c.quadraticCurveTo(sx + len + 9, sy + 1, sx + len + 7, sy - 6);
    }
    c.stroke();
  }
  function haze(c, L, rgb, alpha) {
    if (alpha < 0.01) return;
    c.fillStyle = `rgba(${rgb},${alpha})`;
    c.fillRect(-40, -40, L.vw + 80, L.vh + 400);
  }
  /* 上濃下淡的環境色：天空與遠景維持氣氛，前景保留角色的臉與衣物色差 */
  /* nearClear：近景（路面以下）完全不覆色，前後才拉得出明度差 */
  function skyHaze(c, L, rgb, alpha, nearClear) {
    if (alpha < 0.01) return;
    const g = c.createLinearGradient(0, 0, 0, nearClear ? L.base + PATH_H : L.base);
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(0.55, `rgba(${rgb},${alpha * 0.75})`);
    g.addColorStop(nearClear ? 0.82 : 1, `rgba(${rgb},${alpha * 0.2})`);
    if (nearClear) g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g;
    c.fillRect(-40, -40, L.vw + 80, L.vh + 400);
  }
  /* 飄動的雜物：紙張與葉子 */
  function flyers(c, L, t, amount) {
    if (amount < 0.05) return;
    c.globalAlpha = Math.min(1, amount);
    for (let i = 0; i < 9; i++) {
      const span = L.vw + 200;
      const sx = (hash(i + 2) * span + t * (210 + hash(i + 5) * 170)) % span - 100;
      const sy = L.base * (0.2 + hash(i + 9) * 0.9) + Math.sin(t * 3 + i) * 22;
      c.save();
      c.translate(sx, sy);
      c.rotate(t * (2 + hash(i) * 2) + i);
      if (i % 3 === 0) A.box(c, -7, -5, 14, 10, 2.5, '#fff9ea');
      else A.ell(c, 0, 0, 7.5, 3.6, i % 3 === 1 ? '#8dc47f' : '#d9b56a');
      c.restore();
    }
    c.globalAlpha = 1;
  }
  function seagulls(c, L, t, g) {
    c.strokeStyle = 'rgba(70,80,100,.5)';
    c.lineWidth = 2;
    c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const x = (((t * 24 + i * 300 - g.cam.x * 0.15) % (L.vw + 80)) + L.vw + 80) % (L.vw + 80) - 40;
      const y = L.base * (0.2 + hash(i) * 0.22);
      const f = Math.sin(t * 7 + i) * 4;
      c.beginPath();
      c.moveTo(x - 8, y - f);
      c.quadraticCurveTo(x - 4, y - 3, x, y);
      c.quadraticCurveTo(x + 4, y - 3, x + 8, y - f);
      c.stroke();
    }
  }
  function stars(c, L, alpha) {
    if (alpha < 0.03) return;
    for (let i = 0; i < 44; i++) {
      c.globalAlpha = alpha * (0.45 + hash(i + 3) * 0.55);
      A.ell(c, hash(i) * L.vw, hash(i + 50) * L.base * 0.8, 1.6, 1.6, '#fff7d6');
    }
    c.globalAlpha = 1;
  }
  /* 路面的乾裂紋：鎖在世界座標，strength 決定出現多少 */
  function cracksOnGround(c, L, env, strength, color) {
    if (strength < 0.03) return;
    const step = 70;
    const first = Math.floor(env.left / step) - 1;
    c.strokeStyle = color;
    c.lineWidth = 2.4;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    for (let i = first; i < first + L.vw / step + 3; i++) {
      if (hash(i + 21) > strength) continue;
      const wx = i * step + hash(i) * 30;
      const sx = wx - env.left;
      [[env.pathTop(wx) + 14 + hash(i + 5) * 86, 1], [env.pathTop(wx) + PATH_H + 24 + hash(i + 8) * 90, 1.3]].forEach(([y, k]) => {
        c.moveTo(sx - 20 * k, y);
        c.lineTo(sx - 7 * k, y + 6 * k);
        c.lineTo(sx + 3 * k, y - 4 * k);
        c.lineTo(sx + 19 * k, y + 3 * k);
        c.moveTo(sx + 3 * k, y - 4 * k);
        c.lineTo(sx + 6 * k, y - 13 * k);
      });
    }
    c.stroke();
  }


  /* 手機場景式入口：圖章不再分成「天上一排、地上一排」，改成同一片山坡上的一條環形小徑。
     tr＝DH.entry.trail()（螢幕座標），這裡換成畫布座標後畫：後方山坡 → 小徑（遠窄近寬）→ 每個轉折的小地標 */
  function entryTrail(c, L, tr, t) {
    const z = L.z;
    const P = tr.spots.map((s) => ({ x: s.x / z, y: s.y / z, S: s.S / z, top: s.top / z, layer: s.layer }));
    const heroFeet = tr.hero.feet / z;
    const yTop = Math.min(...P.map((p) => p.y));
    const yBot = Math.max(...P.map((p) => p.y));
    const depth = (y) => clamp((y - yTop) / Math.max(1, L.vh - yTop), 0, 1);
    /* 1. 後方山坡：從標題列下方一路鋪到村口，遠處淡、近處綠；稜線起伏，上面有遠樹與田埂 */
    const ridge = (x) => Math.min(...P.filter((p) => p.layer === 'far').map((p) => p.top)) - 16 + 9 * Math.sin(x * 0.021 + 0.6) + 6 * Math.sin(x * 0.047 + 2);
    /* 山坡一路鋪到畫面底：直式不再有橫越畫面的大路，整片是同一塊地面 */
    const hill = (fy, col, amp, ph) => {
      c.beginPath();
      c.moveTo(-20, L.vh + 40);
      for (let x = -20; x <= L.vw + 20; x += 8) c.lineTo(x, fy(x) + amp * Math.sin(x * 0.013 + ph));
      c.lineTo(L.vw + 20, L.vh + 40);
      c.closePath();
      c.fillStyle = col;
      c.fill();
    };
    const g1 = c.createLinearGradient(0, ridge(0) - 10, 0, L.vh);
    g1.addColorStop(0, '#d5ecc4');
    g1.addColorStop(0.5, '#c0e2a9');
    g1.addColorStop(1, '#a9d892');
    hill(ridge, g1, 0, 0);
    /* 中景緩坡：遠與近之間多一道稜，前後才分得出來 */
    const midY = (yTop + heroFeet) / 2;
    const g2 = c.createLinearGradient(0, midY - 30, 0, L.vh);
    g2.addColorStop(0, '#c6e5ae');
    g2.addColorStop(0.45, '#b7de9e');
    g2.addColorStop(1, '#a4d58d');
    hill((x) => midY - 18 + 14 * Math.sin(x * 0.012 + 1.7), g2, 6, 0.4);
    /* 遠樹：沿稜線的小圓點，越遠越淡 */
    for (let x = 10; x < L.vw; x += 34 + hash(x) * 30) {
      const y = ridge(x) + 4 + hash(x) * 6;
      A.ell(c, x, y, 5 + hash(x + 3) * 3, 4 + hash(x + 5) * 2, 'rgba(150,198,136,.7)');
    }
    /* 田埂：幾道淡淡的橫向弧線，讓山坡有地面的透視 */
    c.strokeStyle = 'rgba(150,196,128,.45)';
    c.lineWidth = 1.4;
    [0.22, 0.42, 0.62].forEach((u, i) => {
      const y = yTop + (heroFeet - yTop) * u;
      c.beginPath();
      c.moveTo(-10, y + 8);
      c.quadraticCurveTo(L.vw * (0.3 + i * 0.2), y - 10, L.vw + 10, y + 4);
      c.stroke();
    });
    /* 2. 環形小徑：依順時針穿過每枚圖章的落腳點，遠處窄、近處寬；最上方接一段往山後的小路、最下方往畫面外延伸 */
    const n = P.length;
    const pts = [];
    const per = 10;
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
      for (let k = 0; k < per; k++) {
        const u = k / per, uu = u * u, uuu = uu * u;
        const f = (a, b2, c2, d) => 0.5 * (2 * b2 + (-a + c2) * u + (2 * a - 5 * b2 + 4 * c2 - d) * uu + (-a + 3 * b2 - 3 * c2 + d) * uuu);
        pts.push([f(p0.x, p1.x, p2.x, p3.x), f(p0.y, p1.y, p2.y, p3.y)]);
      }
    }
    const top = P.reduce((m, p) => (p.y < m.y ? p : m), P[0]);
    const bot = P.reduce((m, p) => (p.y > m.y ? p : m), P[0]);
    const spurs = [
      [[top.x, top.y], [top.x + 10, (top.y + ridge(top.x)) / 2], [top.x + 4, ridge(top.x) + 4]],
      [[bot.x, bot.y], [bot.x - 16, (bot.y + L.vh) / 2], [bot.x - 36, L.vh + 20]],
    ];
    const width = (y) => 7 + 24 * depth(y);
    const strokeRun = (run, extra, col) => {
      c.strokeStyle = col;
      c.lineCap = 'round';
      for (let i = 1; i < run.length; i++) {
        const [x0, y0] = run[i - 1];
        const [x1, y1] = run[i];
        c.lineWidth = width((y0 + y1) / 2) + extra;
        c.beginPath();
        c.moveTo(x0, y0);
        c.lineTo(x1, y1);
        c.stroke();
      }
    };
    const loop = [...pts, pts[0]];
    const spurRuns = spurs.map((sp) => {
      const out = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12, a = 1 - u;
        out.push([a * a * sp[0][0] + 2 * a * u * sp[1][0] + u * u * sp[2][0], a * a * sp[0][1] + 2 * a * u * sp[1][1] + u * u * sp[2][1]]);
      }
      return out;
    });
    [loop, ...spurRuns].forEach((run) => strokeRun(run, 4, 'rgba(196,170,126,.55)'));
    [loop, ...spurRuns].forEach((run) => strokeRun(run, 0, '#f1e5c8'));
    /* 路面上的小石子：順著小徑、遠小近大 */
    for (let i = 3; i < pts.length; i += 7) {
      const [x, y] = pts[i];
      const k = 0.4 + depth(y);
      A.ell(c, x + (i % 2 ? 3 : -3) * k, y, 3.6 * k, 1.4 * k, 'rgba(206,188,150,.65)');
    }
    /* 3. 轉折旁的小地標：遠處是小樹叢，近處是花草與木樁，大小跟著遠近走 */
    P.forEach((p, i) => {
      const k = 0.45 + 0.75 * depth(p.y);
      const dir = p.x < L.vw / 2 ? 1 : -1;
      const bx = p.x + dir * (p.S * 0.62 + 6 * k);
      if (p.layer === 'far' || p.layer === 'sky') {
        A.ell(c, bx, p.y - 7 * k, 11 * k, 9 * k, '#8fcb84');
        A.ell(c, bx - 3 * k, p.y - 10 * k, 6 * k, 5 * k, '#a8d896');
      } else if (p.layer === 'ground') {
        c.fillStyle = '#b58a62';
        c.fillRect(bx - 2 * k, p.y - 16 * k, 4 * k, 16 * k);
        A.ell(c, bx, p.y - 16 * k, 2.4 * k, 1.3 * k, '#d8b48c');
        A.ell(c, bx + dir * 9 * k, p.y - 2 * k, 10 * k, 4.5 * k, '#8fcb84');
      }
    });
  }

  /* 主題 ---------------------------------------------------------- */
  const THEMES = {
    /* 首頁與選災害畫面的社區小景 */
    home: {
      palettes: [SUNNY, SUNNY, SUNNY],
      backdrop: 'city',
      sun: [1, 1, 1],
      bugs: [1, 1, 1],
      gear: [{}, {}, {}],
      ambience: [0, 0, 0],
      birds: [1, 1, 1],
      decor(k, r) {
        k.add('house', 150, -14, 1);
        k.add('tree', 268, -6, 0.9);
        k.add('shop', 385, -12, 0.98, { label: '早餐店' });
        k.add('lamp', 480, -5, 0.95);
        k.add('apartment', 575, -16, 0.9);
        k.add('tree', 690, -8, 0.85);
        k.add('house', 830, -14, 0.95);
        k.add('notice', 940, -8, 0.92, { label: '社區防災' });
        k.add('rallyflag', 1040, -5, 0.95);
        k.add('tree', 1150, -8, 0.95);
        k.add('house', 1270, -14, 0.95);
        for (let x = -300; x < 100; x += 110) k.add(r.pick(['tree', 'bush']), x, -6, 0.9);
        for (let x = 40; x < 1500; x += r.range(30, 60)) k.add('flower', x, k.front(8, 70), r.range(0.8, 1.2), { color: r.pick(FLOWERS) });
        for (let x = 40; x < 1500; x += r.range(34, 72)) k.add(r.pick(['flower', 'flower', 'bush']), x, k.front(72, 240), r.range(1.2, 1.8), { color: r.pick(FLOWERS) });
      },
      npcs: [
        { kind: 'dog', x: 520, oy: 34, s: 0.8, dir: 1, say: '汪！' },
      ],
    },

    /* 入口：環形廣場。主角正後方留白，建物退到兩側，讓角色成為焦點 */
    entry: {
      palettes: [
        pal('#9bd7f2', '#fff0d0', '#c6dfe6', '#b4d6c6', '#a2d2aa', '#b4e09a', '#9cd48b', '#f3e7cc', '#d6c198', '#9bd68c', '#79c278', '#ffffff'),
        pal('#9bd7f2', '#fff0d0', '#c6dfe6', '#b4d6c6', '#a2d2aa', '#b4e09a', '#9cd48b', '#f3e7cc', '#d6c198', '#9bd68c', '#79c278', '#ffffff'),
        pal('#9bd7f2', '#fff0d0', '#c6dfe6', '#b4d6c6', '#a2d2aa', '#b4e09a', '#9cd48b', '#f3e7cc', '#d6c198', '#9bd68c', '#79c278', '#ffffff'),
      ],
      backdrop: 'city',
      hill: 0.7,
      sun: [1, 1, 1],
      bugs: [0.5, 0.5, 0.5],
      gear: [{}, {}, {}],
      ambience: [0, 0, 0],
      birds: [1, 1, 1],
      decor(k, r) {
        const C = ENTRY_C;
        [[-210, 'tree', 0.95], [-330, 'house', 1], [-470, 'apartment', 0.95], [-600, 'tree', 1], [-720, 'shop', 1], [-860, 'apartment', 1],
          [250, 'tree', 0.9], [340, 'shop', 1], [470, 'house', 1], [600, 'tree', 1], [730, 'apartment', 1], [870, 'house', 1]].forEach(([dx, type, sc]) => {
          k.add(type, C + dx, -14, sc, type === 'shop' ? { label: dx < 0 ? '早餐店' : '雜貨店' } : null);
        });
        /* 前後遮擋：靠前的樹壓住後面房子的一角 */
        k.add('tree', C - 405, 6, 1.18, { dark: '#74b876', light: '#98cf8a' });
        k.add('tree', C + 410, 6, 1.12, { dark: '#74b876', light: '#98cf8a' });
        k.add('bush', C - 150, -6, 0.9);
        k.add('bush', C + 250, -2, 0.85);
        for (let x = C - 900; x < C + 900; x += r.range(30, 60)) {
          if (Math.abs(x - C) > 90) k.add('flower', x, k.front(8, 70), r.range(0.8, 1.2), { color: r.pick(FLOWERS) });
        }
        for (let x = C - 900; x < C + 900; x += r.range(40, 84)) k.add(r.pick(['flower', 'flower', 'bush']), x, k.front(72, 420), r.range(1.1, 1.7), { color: r.pick(FLOWERS) });
      },
      npcs: [],
      /* 主角腳下：小小的石板站位；身後一條低對比小徑通往村口的土地公廟 */
      ground(c, L, g, env) {
        const sx = g.player.x - env.left;
        const y = env.pathTop(g.player.x) + 16 + g.player.d * 86;
        const k = g.heroScale || 1;
        const tr = DH.entry && DH.entry.trail ? DH.entry.trail() : null;
        const portrait = !!(tr && !tr.side);
        if (portrait) entryTrail(c, L, tr, g.t);
        /* 身後的暖光先畫，地標與小徑才不會被洗白 */
        const glow = c.createRadialGradient(sx, y - 60 * k, 10, sx, y - 60 * k, 260 * k);
        glow.addColorStop(0, 'rgba(255,246,206,.85)');
        glow.addColorStop(0.5, 'rgba(255,240,190,.36)');
        glow.addColorStop(1, 'rgba(255,236,180,0)');
        c.fillStyle = glow;
        c.fillRect(sx - 280 * k, y - 340 * k, 560 * k, 560 * k);
        /* 小徑：從站位旁的路面斜斜爬上坡，通往大樹下的土地公廟，越遠越窄、越淡 */
        const wx = ENTRY_C + shrineDx(L);
        const tx = wx - env.left;
        const top = env.pathTop(wx) - 50;
        const foot = env.pathTop(g.player.x) + 4;
        const fx = Math.min(sx + 40 * k, tx - 20);
        c.beginPath();
        c.moveTo(fx - 34, foot);
        c.bezierCurveTo(fx - 10, foot - 22, tx - 30, top + 22, tx - 12, top);
        c.lineTo(tx + 12, top);
        c.bezierCurveTo(tx - 6, top + 22, fx + 40, foot - 20, fx + 44, foot);
        c.closePath();
        const tg = c.createLinearGradient(0, top, 0, foot);
        tg.addColorStop(0, 'rgba(236,224,194,.6)');
        tg.addColorStop(1, 'rgba(243,231,204,.95)');
        c.fillStyle = tg;
        c.fill();
        c.strokeStyle = 'rgba(200,180,140,.35)';
        c.lineWidth = 1.5;
        c.stroke();
        [0.25, 0.5, 0.75].forEach((u) => {
          const px = fx + 4 + (tx - fx - 4) * u + Math.sin(u * 5) * 6;
          const py = foot + (top - foot) * u;
          A.ell(c, px, py + 3, 7 * (1 - u * 0.5), 2.4 * (1 - u * 0.5), 'rgba(205,188,150,.45)');
        });
        [['tree', wx + 34, -56, 1.15, { dark: '#86bf88', light: '#a7d4a0', h: 0.3 }], ['shrine', wx, -50, 0.72, {}]].forEach(([type, x, oy, sc, it]) => {
          c.save();
          c.globalAlpha = 0.86;
          c.translate(x - env.left, env.pathTop(x) + oy);
          A.decor[type](c, sc, g.t, it);
          c.restore();
        });
        /* 很高的直式畫面：腳下多出來的高度是一條往畫面前方彎下來的小徑，前景圖章就成了路旁的東西 */
        if (!portrait && L.vh > L.vw * 1.95) {
          const y0 = env.pathTop(g.player.x) + PATH_H - 6;
          const y1 = L.vh + 12;
          const x0 = sx - 26 * k;
          const x1 = L.vw * 0.34;
          const P = (u) => {
            const a = 1 - u;
            return [
              a * a * a * x0 + 3 * a * a * u * (sx + 40 * k) + 3 * a * u * u * (L.vw * 0.16) + u * u * u * x1,
              a * a * a * y0 + 3 * a * a * u * (y0 + (y1 - y0) * 0.38) + 3 * a * u * u * (y1 - (y1 - y0) * 0.3) + u * u * u * y1,
            ];
          };
          const N = 24;
          const half = (u) => 16 + 30 * u;
          c.beginPath();
          for (let i = 0; i <= N; i++) {
            const [px, py] = P(i / N);
            if (i) c.lineTo(px - half(i / N), py);
            else c.moveTo(px - half(0), py);
          }
          for (let i = N; i >= 0; i--) {
            const [px, py] = P(i / N);
            c.lineTo(px + half(i / N), py);
          }
          c.closePath();
          c.fillStyle = 'rgba(240,228,198,.92)';
          c.fill();
          c.strokeStyle = 'rgba(196,172,128,.4)';
          c.lineWidth = 1.5;
          c.stroke();
          [0.18, 0.36, 0.55, 0.74, 0.9].forEach((u, i) => {
            const [px, py] = P(u);
            A.ell(c, px + (i % 2 ? 6 : -6) * (0.5 + u), py, 6 + 9 * u, 2.4 + 3.4 * u, 'rgba(206,188,150,.5)');
          });
          /* 路旁：右側一排低矮的木樁，左側一叢草 */
          [0.3, 0.46, 0.62].forEach((u) => {
            const [px, py] = P(u);
            const hx = px + half(u) + 10 + 6 * u;
            c.fillStyle = '#b58a62';
            c.fillRect(hx - 2 - u * 1.5, py - 14 - u * 10, 4 + u * 3, 14 + u * 10);
            A.ell(c, hx, py - 14 - u * 10, 2 + u * 1.5, 1.2 + u, '#d8b48c');
          });
          const [qx, qy] = P(0.52);
          A.ell(c, qx - half(0.52) - 20, qy, 22, 9, '#8fcb84');
          A.ell(c, qx - half(0.52) - 26, qy - 4, 12, 6, '#a8d896');
        }
        /* 站位：不規則的石板小廣場，比角色寬一點而已 */
        /* 直式畫面角色占比大：石板縮成腳邊一小塊，不再像展示台 */
        const tallView = L.vh > L.vw * 1.2;
        const rx = (tallView ? 28 : 44) * k;
        const ry = (tallView ? 8 : 12) * k;
        c.beginPath();
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * TAU;
          const wob = 1 + 0.06 * Math.sin(a * 3 + 0.7) + 0.04 * Math.sin(a * 5);
          const px = sx + Math.cos(a) * rx * wob;
          const py = y + 3 + Math.sin(a) * ry * wob;
          if (i === 0) c.moveTo(px, py);
          else c.lineTo(px, py);
        }
        c.closePath();
        c.fillStyle = 'rgba(246,236,212,.82)';
        c.fill();
        c.strokeStyle = 'rgba(196,170,128,.45)';
        c.lineWidth = 1.5;
        c.stroke();
        [[-0.62, -0.25], [-0.3, 0.45], [0.05, -0.5], [0.4, 0.4], [0.68, -0.15], [-0.05, 0.1]].forEach(([u, v], i) => {
          A.ell(c, sx + u * rx, y + 3 + v * ry, (7 + (i % 3) * 2) * k * 0.6, 2.6 * k * 0.6, 'rgba(214,196,160,.42)');
        });
      },
      /* 四周微暗，視線回到中央 */
      fx(c, L, g) {
        const r = Math.max(L.vw, L.vh) * 0.74;
        const v = c.createRadialGradient(g.hero.sx, g.hero.y - 50, r * 0.42, g.hero.sx, g.hero.y - 50, r);
        v.addColorStop(0, 'rgba(90,60,40,0)');
        v.addColorStop(1, 'rgba(90,60,40,.3)');
        c.fillStyle = v;
        c.fillRect(-40, -40, L.vw + 80, L.vh + 400);
      },
    },

    earthquake: {
      interactLines: {
        before: ["把家具固定好，搖晃時多一分安心。", "一起檢查避難包，手電筒也要能用喔。"],
        during: ["地震搖晃時，記得趴下、掩護、穩住。", "先護住頭頸，等搖晃停止再確認周圍安全。"],
        after: ["留意餘震，遠離受損的建物。", "先確認自己安全，再關心身邊的人。"],
      },
      palettes: [
        SUNNY,
        pal('#b9c9dd', '#f4e4cf', '#c9ccd6', '#bcc4bf', '#adbfae', '#bcd2a2', '#a8c692', '#e6d8c0', '#c5ae8c', '#a7cd92', '#88b57e', '#f4f2ea'),
        pal('#b7e0f2', '#fff0d8', '#cfe0e4', '#bbd6c8', '#a8d0ad', '#b7dc9e', '#a1d08f', '#eadcc2', '#ccb690', '#a0d38f', '#7fbe7b', '#ffffff'),
      ],
      backdrop: 'city',
      sun: [1, 0.35, 0.9],
      bugs: [1, 0, 0.4],
      gear: [{}, { helmet: true }, { helmet: true }],
      ambience: [0, 0.2, 0],
      birds: [1, 0, 1],
      decor(k, r) {
        k.signs(['社區日常', '先穩住自己', '集合與檢查']);
        k.street(B, ['house', 'apartment', 'shop', 'apartment']);
        k.street(D, ['apartment', 'apartment', 'house'], { crack: true }, ['lamp', 'bush', 'tree']);
        k.street(F, ['house', 'apartment', 'shop'], null);
        k.add('helmetbox', 620, k.front(14, 24), 1);
        for (let x = D[0] + 200; x < D[1]; x += r.range(170, 300)) k.add('crack', x, r.range(24, 98), r.range(0.8, 1.2));
        for (let x = D[0] + 120; x < D[1]; x += r.range(240, 420)) k.add('debrispile', x, k.front(8, 34), r.range(0.7, 1));
        k.add('rallyflag', F[0] + 330, k.front(6, 14), 1.1);
        k.add('helmetbox', F[0] + 520, k.front(10, 20), 1);
        k.add('rallyflag', F[0] + 980, k.front(6, 14), 1, { color: '#e8905c' });
        k.cues(NODES.before, (n) => {
          k.add('helmetbox', n - 140, -2, 1.05);
          k.add('notice', n + 120, -5, 0.95, { label: '固定家具' });
        });
        k.cues(NODES.during, (n) => {
          k.add('debrispile', n - 150, -2, 1);
          k.add('notice', n + 120, -5, 0.95, { label: '趴下掩護' });
        });
        k.cues(NODES.after, (n) => {
          k.add('cone', n - 140, -2, 1.1);
          k.add('rallyflag', n + 120, -3, 1, { label: '集合點' });
        });
        k.add('cone', F[0] + 720, -4, 1);
        k.add('cone', F[0] + 760, -4, 1);
        k.flowers(B, 34, 66);
        k.flowers(F, 44, 90);
      },
      npcs: [
        { kind: 'cat', x: 760, oy: -6, s: 0.8, dir: 1, say: '喵～書櫃固定了嗎？' },
        { kind: 'neighbor', x: 1450, oy: 6, s: 0.9, dir: -1, colors: 'b', say: '早安！今天也要小心喔' },
        { kind: 'neighbor', x: 4200, oy: 8, s: 0.9, dir: -1, colors: 'c', helmet: true, say: '大家都平安嗎？' },
        { kind: 'dog', x: 4780, oy: 6, s: 0.8, dir: 1, say: '汪！找到主人了！' },
      ],
      shake(g, w, t) {
        const burst = Math.max(0, Math.sin(t * 0.8)) ** 3;
        return w[1] * burst * 2.6;
      },
      fx(c, L, g, w) {
        if (w[1] < 0.05) return;
        c.globalAlpha = w[1];
        for (let i = 0; i < 7; i++) {
          const p = (g.t * (0.5 + hash(i) * 0.3) + hash(i + 3)) % 1;
          const x = hash(i + 11) * L.vw + Math.sin(p * 6 + i) * 8;
          const y = L.base - 200 + p * 230;
          c.save();
          c.translate(x, y);
          c.rotate(p * 5 + i);
          if (i % 3 === 0) A.box(c, -6, -8, 12, 16, 2, '#e88a6b');
          else if (i % 3 === 1) A.box(c, -5, -5, 10, 10, 3, '#d9c5a3');
          else A.ell(c, 0, 0, 5, 4, '#c8c3b5');
          c.restore();
        }
        c.globalAlpha = 1;
      },
    },

    tsunami: {
      interactLines: {
        before: ["先認識往高處的避難路線吧。", "海邊活動前，和家人約好安全集合點。"],
        during: ["收到海嘯警報，遠離海岸往高處避難。", "別到海邊看浪，聽從官方疏散指示。"],
        after: ["解除警報前，留在安全高處等候。", "海水退去也別急著回海岸，先確認官方訊息。"],
      },
      palettes: [
        pal('#9fdcf4', '#fff5de', '#c7e4ea', '#b4dcd2', '#a4d6bd', '#ecdcae', '#e2cf9d', '#f1e6cc', '#d3bf98', '#b7dd9a', '#93ca82', '#ffffff'),
        pal('#9cc3dc', '#f3e6cf', '#c3d4dc', '#b4cec8', '#a7c8b4', '#e0cfa2', '#d3c092', '#e7dcc4', '#c8b48e', '#abd093', '#8bbc7e', '#f8f6ee'),
        pal('#b5def0', '#fff1da', '#cce0e4', '#b9d8cc', '#a9d2b4', '#d8c59c', '#c9b48a', '#ddd0b2', '#b9a37f', '#a4cb90', '#85b57c', '#ffffff'),
      ],
      backdrop: 'coast',
      sea: ['#7cc9e4', '#5fb5d6'],
      /* 當下：海水往外退，露出濕沙；遠方海平線鼓起大浪 */
      seaRetreat: 0.62,
      horizonLift: 132,
      hill: 0.2,
      sun: [1, 0.55, 0.9],
      bugs: [0, 0, 0],
      gear: [{}, {}, { helmet: true }],
      ambience: [0.2, 0.5, 0.15],
      birds: [0, 0, 0],
      decor(k, r) {
        k.signs(['海岸小鎮', '立刻往高處', '還不要回去']);
        k.add('lighthouse', 180, -24, 0.9);
        for (let x = 100; x < F[1]; x += 240) {
          if (x < D[0] - 120) k.add('seawall', x, -4, 1, { w: 240 });
          /* 災後：每段堤都有水痕，靠近第一個節點的那段缺了一角 */
          else if (x > D[1] + 120) k.add('seawall', x, -4, 1, { w: 240, wet: true, broken: Math.abs(x - (NODES.after[0] - 40)) < 120 });
        }
        k.add('boat', 640, -60, 0.8);
        k.add('palm', 500, -8, 1);
        k.add('palm', 1500, -8, 1);
        k.add('house', 1190, k.front(66, 74), 0.9);
        k.add('shop', 600, k.front(70, 78), 0.9, { label: '海產店' });
        /* 災前：警戒區標誌、平時安靜的警報塔、避難路線指向高地 */
        /* 第一個節點的鏡頭內就看得到目的地：路面箭頭一路往右，接到高地的之字步道口 */
        k.cues(NODES.before, (n, i) => {
          if (i === 0) {
            k.add('tsunamisign', n - 160, -5, 1, { label: '海嘯警戒區' });
            k.add('sirentower', n + 60, -16, 0.86);
            /* 高地放在海堤前，步道口直接接到路邊 */
            k.add('highground', n + 282, -2, 0.8);
            k.add('evacarrow', n + 62, 58, 0.9);
            /* 接著一組箭頭轉向坡上，踩在通往步道口的短泥土小徑上 */
            k.add('trailspur', n + 142, 2, 1);
            k.add('evacarrow', n + 140, 26, 0.62, { rot: -0.62 });
          } else {
            k.add('evacsign', n + 150, -4, 1, { label: '避難路線' });
            k.add('evacarrow', n + 70, 58, 0.9);
          }
        });
        /* 當下：警報塔響、路面箭頭與高處避難所 */
        k.add('sirentower', D[0] + 330, -18, 1, { on: true });
        k.cues(NODES.during, (n, i) => {
          /* 海嘯標誌放在第一個節點右前方，初始鏡頭內就完整可見；第二個節點不再放牌，避免和它擠在一起 */
          if (i !== 1) k.add('evacsign', n - 150, -3, 1.05);
          if (i === 0) k.add('tsunamisign', n + 270, 8, 1, { label: '往高處避難' });
          k.add('highground', n + 140, -8, 0.86);
          k.add('evacarrow', n - 40, 58, 1);
          k.add('evacarrow', n + 230, 58, 1);
        });
        /* 災後：淺水、泥沙與漂流物，公告解除前不回低處 */
        k.cues(NODES.after, (n) => {
          k.add('notice', n - 150, -3, 0.95, { label: '等解除再回家' });
          k.add('highground', n + 160, -2, 0.7, { muddy: true });
        });
        k.add('rallyflag', F[0] + 300, k.front(8, 14), 1.05, { label: '高處' });
        k.add('roadblock', F[0] + 900, -5, 1);
        k.add('palm', F[0] + 1250, -8, 0.95);
        /* 浪退後的殘留物：跟著泥沙舌成群，舌尖最密、舌與舌之間幾乎空著；大小、長短、倒向、半埋都不一樣 */
        for (let x = F[0] - 60; x < F[1]; x += r.range(14, 58)) {
          const reach = wrackAt(x);
          if (r.next() > clamp((reach - 10) / 44, 0.04, 0.85)) continue;
          const y = PATH_H + 6 + reach * r.range(0.35, 1.02);
          const roll = r.next();
          if (roll < 0.5) k.add('seaweed', x, y, r.range(0.55, 1.2), { dir: r.next() < 0.8 ? 1 : -1, len: r.range(0.6, 1.3), buried: r.next() < 0.4 });
          else if (roll < 0.8) k.add('driftwood', x, y + 2, r.range(0.5, 1.05), { rot: r.range(-0.15, 0.62), len: r.range(18, 64), buried: r.next() < 0.35 });
          else k.add('rubble', x, y + 2, r.range(0.6, 1.1), { n: 2 + Math.floor(r.next() * 3) });
        }
        k.add('driftwood', F[0] + 520, 64, 1.2, { rot: 0.3, len: 70 });
        k.add('seaweed', F[0] + 980, 36, 0.8, { dir: 1, len: 0.7 });
        k.add('driftwood', F[0] + 1380, 80, 0.8, { rot: -0.1, len: 30 });
        k.flowers(B, 44, 90);
        k.flowers(D, 80, 150, { kinds: ['bush', 'fern'] });
        /* 災後：殘留帶以外的近景才有草叢，靠路的一側被泥沙蓋住 */
        for (let x = F[0] + 40; x < F[1]; x += r.range(110, 190)) k.add(r.pick(['fern', 'bush']), x, PATH_H + 30 + wrackAt(x) + r.range(10, 120), r.range(0.8, 1.3));
      },
      npcs: [
        { kind: 'neighbor', x: 720, oy: 6, s: 0.9, dir: -1, colors: 'b', say: '記得避難路線喔！' },
        { kind: 'dog', x: 1600, oy: 10, s: 0.8, dir: 1, say: '汪！' },
        { kind: 'neighbor', x: 4400, oy: 6, s: 0.9, dir: -1, colors: 'c', helmet: true, say: '等公告再回家喔' },
      ],
      /* 海面：災前平靜；當下退潮露出濕沙與擱淺小船，海平線鼓起大浪；災後海水混濁、岸邊淺水泥沙 */
      seaFx(c, L, g, w, horizon, shore, retreat) {
        const t = g.t;
        const still = A.reducedMotion();
        const camX = g.cam.x;
        const k = w[1];
        if (k > 0.03) {
          /* 退潮線：沙上留下的幾道水痕與貝殼、海草 */
          const wetTop = shore + 2;
          const g1 = c.createLinearGradient(0, wetTop, 0, wetTop + 70);
          g1.addColorStop(0, `rgba(150,128,92,${0.5 * k})`);
          g1.addColorStop(1, `rgba(190,170,130,${0.15 * k})`);
          c.fillStyle = g1;
          c.fillRect(-20, wetTop, L.vw + 40, 90);
          c.strokeStyle = `rgba(255,255,255,${0.55 * k})`;
          c.lineWidth = 2.4;
          c.setLineDash([10, 9]);
          [16, 34].forEach((dy, j) => {
            c.beginPath();
            for (let sx = -20; sx <= L.vw + 20; sx += 18) {
              const y = wetTop + dy + Math.sin((sx + camX * 0.3) * 0.022 + j * 2) * 3;
              if (sx === -20) c.moveTo(sx, y);
              else c.lineTo(sx, y);
            }
            c.stroke();
          });
          c.setLineDash([]);
          c.globalAlpha = k;
          const span = 260;
          const off = camX * 0.3;
          const first = Math.floor(off / span) - 1;
          for (let i = first; i < first + L.vw / span + 3; i++) {
            const sx = i * span - off + hash(i) * 120;
            const y = wetTop + 22 + hash(i + 9) * 36;
            if (hash(i + 4) > 0.5) A.ell(c, sx, y, 5, 3.4, '#f6d3c6');
            else A.ell(c, sx, y, 9, 2.6, '#6f9a6a', -0.3);
            A.ell(c, sx + 40, y + 8, 22, 4, 'rgba(110,170,200,.45)');
          }
          /* 擱淺的小船（傾斜躺在濕沙上） */
          const bspan = 820;
          const boff = camX * 0.3;
          const bf = Math.floor((boff - 200) / bspan);
          for (let i = bf; i < bf + L.vw / bspan + 2; i++) {
            const bx = i * bspan - boff + 300;
            c.save();
            c.translate(bx, wetTop + 34);
            c.rotate(-0.16);
            c.scale(0.62, 0.62);
            c.beginPath();
            c.moveTo(-40, -16);
            c.quadraticCurveTo(-30, 4, 0, 4);
            c.quadraticCurveTo(30, 4, 44, -18);
            c.closePath();
            c.fillStyle = '#5fa8c9';
            c.fill();
            A.box(c, -30, -20, 66, 6, 3, '#fffdf6');
            A.line(c, -6, -20, -6, -50, '#94694a', 3);
            A.poly(c, [-4, -48, 18, -30, -4, -28], '#fff3d6');
            c.restore();
          }
          /* 遠方鼓起的大浪：圓潤的長浪帶＋白色浪花，停在海平線，不往角色衝 */
          const rise = (still ? 1 : 0.94 + Math.sin(t * 0.8) * 0.06) * 58 * k;
          const top = (sx) => {
            const u = (sx + camX * 0.08) * 0.0065;
            return horizon - rise * (0.62 + 0.24 * Math.sin(u) + 0.14 * Math.sin(u * 2.3 + 1));
          };
          c.beginPath();
          c.moveTo(-20, horizon + 16);
          for (let sx = -20; sx <= L.vw + 20; sx += 8) c.lineTo(sx, top(sx));
          c.lineTo(L.vw + 20, horizon + 16);
          c.closePath();
          const wg = c.createLinearGradient(0, horizon - rise, 0, horizon + 16);
          wg.addColorStop(0, '#62bde0');
          wg.addColorStop(0.55, '#3d93c2');
          wg.addColorStop(1, '#4fa7cf');
          c.fillStyle = wg;
          c.fill();
          /* 浪身上的淺色條紋 */
          c.strokeStyle = `rgba(190,232,248,${0.7 * k})`;
          c.lineWidth = 3;
          c.lineCap = 'round';
          [0.35, 0.62].forEach((f) => {
            c.beginPath();
            for (let sx = -20; sx <= L.vw + 20; sx += 10) {
              const y = top(sx) + (horizon + 10 - top(sx)) * f;
              if (sx === -20) c.moveTo(sx, y);
              else c.lineTo(sx, y);
            }
            c.stroke();
          });
          /* 只留一個主要浪峰：間距比畫面寬，鏡頭內頂多一個捲邊 */
          const cspan = 1500;
          const coff = camX * 0.08;
          const cf = Math.floor((coff - 300) / cspan);
          for (let i = cf; i < cf + L.vw / cspan + 2; i++) {
            const cx = i * cspan - coff + 520;
            const cy = top(cx);
            const R = 24 * k;
            c.beginPath();
            c.moveTo(cx - 96, cy + 8);
            c.quadraticCurveTo(cx - 40, cy - R * 1.4, cx + 6, cy - R * 1.2);
            c.quadraticCurveTo(cx + R * 1.6, cy - R, cx + R * 1.5, cy + R * 0.2);
            c.quadraticCurveTo(cx + R * 1.2, cy + R * 0.7, cx + R * 0.5, cy + R * 0.2);
            c.quadraticCurveTo(cx + R * 0.9, cy - R * 0.2, cx + R * 0.3, cy - R * 0.3);
            c.quadraticCurveTo(cx - 10, cy - R * 0.3, cx - 18, cy + 10);
            c.closePath();
            c.fillStyle = '#56b0d8';
            c.fill();
            c.beginPath();
            c.moveTo(cx - 88, cy + 4);
            c.quadraticCurveTo(cx - 38, cy - R * 1.35, cx + 6, cy - R * 1.15);
            c.quadraticCurveTo(cx + R * 1.5, cy - R * 0.95, cx + R * 1.4, cy + R * 0.15);
            c.quadraticCurveTo(cx + R * 1.15, cy + R * 0.55, cx + R * 0.6, cy + R * 0.15);
            c.strokeStyle = `rgba(255,255,255,${0.95 * k})`;
            c.lineWidth = 5.5;
            c.stroke();
          }
          /* 浪頂的白沫：沿浪頂一條不連續的白邊，再撒大小、間距都不一的泡沫團（鎖在浪的座標，不會滑動） */
          c.strokeStyle = `rgba(255,255,255,${0.85 * k})`;
          c.lineWidth = 3;
          c.lineCap = 'round';
          c.beginPath();
          let pen = false;
          for (let sx = -20; sx <= L.vw + 20; sx += 8) {
            const on = hash(Math.floor((sx + camX * 0.08) / 70)) > 0.3;
            if (on && !pen) c.moveTo(sx, top(sx) + 1);
            else if (on) c.lineTo(sx, top(sx) + 1);
            pen = on;
          }
          c.stroke();
          c.fillStyle = `rgba(255,255,255,${0.88 * k})`;
          const fo = camX * 0.08;
          const fs = 26;
          const ff = Math.floor((fo - 40) / fs);
          for (let i = ff; i < ff + L.vw / fs + 3; i++) {
            if (hash(i + 401) < 0.42) continue;
            const n = 1 + Math.floor(hash(i + 403) * 3);
            for (let j = 0; j < n; j++) {
              const sx = i * fs - fo + hash(i * 3 + j + 405) * fs * 1.4;
              const ph = still ? 0 : Math.sin(t * 1.6 + i * 1.7 + j) * 0.8;
              const rr = 1.8 + hash(i * 5 + j + 409) ** 2 * 4.6;
              c.beginPath();
              c.arc(sx, top(sx) + 2 + hash(i + j + 411) * 6 + ph, rr, 0, Math.PI * 2);
              c.fill();
            }
          }
          c.globalAlpha = 1;
        }
        const m = w[2];
        if (m > 0.03) {
          /* 災後：海水仍是水（保留反光），但混著泥色，越近岸越濁 */
          const mg = c.createLinearGradient(0, horizon, 0, L.base);
          mg.addColorStop(0, `rgba(128,160,158,${0.4 * m})`);
          mg.addColorStop(0.45, `rgba(150,150,118,${0.7 * m})`);
          mg.addColorStop(1, `rgba(158,134,96,${0.85 * m})`);
          c.fillStyle = mg;
          c.fillRect(-20, horizon, L.vw + 40, shore - horizon + 2);
          c.globalAlpha = m;
          const off = camX * 0.22;
          c.strokeStyle = 'rgba(240,236,214,.55)';
          c.lineWidth = 2;
          c.lineCap = 'round';
          c.beginPath();
          for (let i = 0; i < 14; i++) {
            const sx = (((hash(i + 40) * 1700 - off) % (L.vw + 120)) + L.vw + 120) % (L.vw + 120) - 60;
            const y = horizon + 10 + hash(i + 61) * 70;
            const len = 12 + hash(i + 77) * 16;
            c.moveTo(sx - len, y);
            c.quadraticCurveTo(sx, y - 3, sx + len, y);
          }
          c.stroke();
          /* 海上漂的木頭，間距不一 */
          const span = 380;
          const first = Math.floor(off / span) - 1;
          for (let i = first; i < first + L.vw / span + 3; i++) {
            const sx = i * span - off + hash(i + 3) * 220;
            const y = horizon + 20 + hash(i + 7) * 46 + (still ? 0 : Math.sin(t + i) * 1.5);
            const len = 22 + hash(i + 5) * 22;
            c.save();
            c.translate(sx, y);
            c.rotate(0.12 + hash(i + 9) * 0.2);
            A.box(c, -len / 2, -3, len, 6, 3, '#8a6446');
            c.restore();
            A.ell(c, sx, y + 5, len * 0.7, 2.6, 'rgba(255,255,255,.3)');
          }
          /* 岸邊濕沙：上緣是一條不規則的泥沙、海草與碎木殘留線，碎片都斜向陸地 */
          const sandTop = (sx) => L.base - 70 + Math.sin((sx + off) * 0.013) * 6 + Math.sin((sx + off) * 0.041 + 2) * 3;
          c.beginPath();
          c.moveTo(-20, L.base + 40);
          for (let sx = -20; sx <= L.vw + 20; sx += 10) c.lineTo(sx, sandTop(sx));
          c.lineTo(L.vw + 20, L.base + 40);
          c.closePath();
          const sg = c.createLinearGradient(0, L.base - 76, 0, L.base);
          sg.addColorStop(0, '#b49b74');
          sg.addColorStop(1, '#cdb88f');
          c.fillStyle = sg;
          c.fill();
          c.beginPath();
          for (let sx = -20; sx <= L.vw + 20; sx += 10) {
            const y = sandTop(sx) + 4;
            if (sx === -20) c.moveTo(sx, y);
            else c.lineTo(sx, y);
          }
          c.strokeStyle = 'rgba(92,86,56,.6)';
          c.lineWidth = 4;
          c.stroke();
          const bits = 30;
          const first2 = Math.floor((off - 40) / bits);
          for (let i = first2; i < first2 + L.vw / bits + 3; i++) {
            const sx = i * bits - off + hash(i + 13) * 22;
            if (hash(i + 17) < 0.35) continue;
            const y = sandTop(sx) + 6 + hash(i + 19) * 10;
            c.save();
            c.translate(sx, y);
            c.rotate(0.32);
            if (hash(i + 23) < 0.6) A.ell(c, 0, 0, 7 + hash(i) * 6, 2.4, hash(i + 29) < 0.5 ? '#5f7f4a' : '#4f6c3e');
            else A.box(c, -9, -2, 18, 4, 2, '#8a6a4c');
            c.restore();
          }
          c.globalAlpha = 1;
        }
      },
      /* 災後：靠海那側路面與近景草地被泥沙蓋過。泥沙邊緣是寬窄不一、斷斷續續的泥沙舌，往右下拖長 */
      ground(c, L, g, env, w) {
        const m = w[2];
        if (m < 0.03) return;
        const step = 8;
        const edge = (wx) => env.pathTop(wx) + PATH_H - 3;
        const bottom = (wx) => env.pathTop(wx) + PATH_H + wrackAt(wx);
        c.globalAlpha = m;
        /* 蓋住草地的泥沙：濕的靠路面較深，舌尖較淺 */
        c.beginPath();
        for (let sx = -20; sx <= L.vw + 22; sx += step) {
          const y = edge(env.left + sx);
          if (sx === -20) c.moveTo(sx, y);
          else c.lineTo(sx, y);
        }
        for (let sx = L.vw + 22; sx >= -20; sx -= step) c.lineTo(sx, bottom(env.left + sx));
        c.closePath();
        const y0 = edge(env.left + L.vw / 2);
        const mg = c.createLinearGradient(0, y0, 0, y0 + 80);
        mg.addColorStop(0, 'rgba(150,124,86,.78)');
        mg.addColorStop(1, 'rgba(186,160,116,.6)');
        c.fillStyle = mg;
        c.fill();
        /* 舌尖外緣：只有泥沙真的流得遠的地方才有一道濕痕，其餘斷開 */
        c.strokeStyle = 'rgba(112,90,60,.5)';
        c.lineWidth = 2.5;
        c.lineCap = 'round';
        c.beginPath();
        let pen = false;
        for (let sx = -20; sx <= L.vw + 22; sx += step) {
          const wx = env.left + sx;
          const on = wrackAt(wx) > 13;
          const y = bottom(wx);
          if (on && !pen) c.moveTo(sx, y);
          else if (on) c.lineTo(sx, y);
          pen = on;
        }
        c.stroke();
        /* 舌尖外的濕草色：一圈暗一點的綠，寬窄跟著舌頭變 */
        c.beginPath();
        for (let sx = -20; sx <= L.vw + 22; sx += step) {
          const y = bottom(env.left + sx);
          if (sx === -20) c.moveTo(sx, y);
          else c.lineTo(sx, y);
        }
        for (let sx = L.vw + 22; sx >= -20; sx -= step) {
          const wx = env.left + sx;
          c.lineTo(sx, bottom(wx) + 4 + wrackAt(wx) * 0.35);
        }
        c.closePath();
        c.fillStyle = 'rgba(80,110,70,.2)';
        c.fill();
        /* 被壓倒的草：只在泥沙舌下方，越長的舌倒得越多，順著水退的方向往右下 */
        c.strokeStyle = 'rgba(104,140,84,.8)';
        c.lineWidth = 2.2;
        c.beginPath();
        const gs = 13;
        const f0 = Math.floor(env.left / gs) - 1;
        for (let i = f0; i < f0 + L.vw / gs + 3; i++) {
          const wx = i * gs + hash(i + 5) * 10;
          const reach = wrackAt(wx);
          if (hash(i + 8) > clamp((reach - 8) / 40, 0, 0.9)) continue;
          const sx = wx - env.left;
          const y = bottom(wx) + 2 + hash(i + 2) * (4 + reach * 0.3);
          const len = 8 + hash(i + 3) * 10;
          c.moveTo(sx, y);
          c.quadraticCurveTo(sx + len * 0.4, y - 5, sx + len, y - 1);
        }
        c.stroke();
        /* 路面上的泥流痕：粗細、長短不一，靠海堤缺口較多 */
        const ss = 52;
        const f1 = Math.floor(env.left / ss) - 1;
        for (let i = f1; i < f1 + L.vw / ss + 3; i++) {
          const wx = i * ss + hash(i + 33) * 40;
          const near = Math.exp(-(((wx - WRACK_GAP) / 260) ** 2));
          if (hash(i + 31) > 0.45 + near * 0.5) continue;
          const sx = wx - env.left;
          const y = env.pathTop(wx) + 14 + hash(i + 35) * (PATH_H - 20);
          A.ell(c, sx, y, 16 + hash(i + 37) * 40, 2.5 + hash(i + 39) * 4, `rgba(150,120,80,${0.18 + hash(i + 41) * 0.16})`, 0.18 + hash(i + 43) * 0.2);
        }
        c.globalAlpha = 1;
      },
      fx(c, L, g, w) {
        seagulls(c, L, g.t, g);
        if (w[2] > 0.05) haze(c, L, '150,160,160', 0.05 * w[2]);
      },
    },

    typhoon: {
      interactLines: {
        before: ["把陽台物品收妥，別讓強風吹落。", "先備妥飲水和照明，安心待在室內。"],
        during: ["強風時遠離窗戶，待在安全室內。", "風雨暫歇也別急著外出，留意官方訊息。"],
        after: ["外出前先確認安全，留意掉落的招牌。", "看到垂落電線要遠離，請專業人員處理。"],
      },
      palettes: [
        pal('#b4cfe4', '#f5e8d4', '#c7d3de', '#b8cdc6', '#a9c8ae', '#b6d6a0', '#a0c98f', '#e9dcc4', '#c9b490', '#a4d092', '#83bb7d', '#f4f6f4'),
        pal('#7f93b3', '#c7ccd2', '#9aa7ba', '#90a3a8', '#859e96', '#98b58e', '#86a780', '#c7bfb0', '#a39a88', '#8cb07f', '#749a70', '#d4d9e0'),
        pal('#aedaf0', '#fff1dc', '#c9dde4', '#b6d6c8', '#a4cfae', '#b1d99b', '#9bcd8c', '#e6dac0', '#c9b48e', '#9dd08c', '#7cbb78', '#ffffff'),
      ],
      backdrop: 'city',
      sun: [0.6, 0, 0.9],
      bugs: [0.4, 0, 0.3],
      gear: [{}, { raincoat: true }, {}],
      ambience: [0.15, 1, 0],
      birds: [1, 0, 1],
      decor(k, r) {
        k.signs(['先做好整備', '留在安全處', '小心清理']);
        k.street(B, ['house', 'apartment', 'shop']);
        k.add('sandbags', 900, k.front(6, 12), 1);
        k.street(D, ['house', 'apartment'], (x) => ({ closed: true, bend: 22 + (x % 8) }), ['tree', 'tree', 'pole']);
        for (let x = D[0] + 90; x < D[1]; x += r.range(180, 280)) k.add('tree', x, k.front(20, 60), r.range(0.72, 0.95), { bend: 26 });
        k.street(F, ['house', 'shop', 'apartment'], null, ['tree', 'bush', 'lamp']);
        for (let x = F[0] + 180; x < F[1] - 500; x += r.range(200, 320)) k.add('branch', x, r.next() < 0.5 ? -2 : k.front(8, 24), r.range(0.8, 1.15));
        k.add('broom', F[0] + 520, k.front(8, 12), 1.05);
        k.cues(NODES.before, (n) => {
          k.add('sandbags', n - 140, -1, 1);
          k.add('notice', n + 120, -5, 0.95, { label: '固定陽台' });
        });
        k.cues(NODES.during, (n) => {
          k.add('branch', n - 150, -1, 1.1);
          k.add('notice', n + 120, -5, 0.95, { label: '留在室內' });
        });
        k.cues(NODES.after, (n) => {
          k.add('branch', n - 140, -1, 1);
          k.add('notice', n + 120, -5, 0.95, { label: '小心斷枝' });
        });
        k.add('pole', F[0] + 820, -5, 0.95, { lean: true });
        k.add('cone', F[0] + 760, 0, 1);
        k.flowers(B, 44, 80);
        k.flowers(D, 80, 160, { kinds: ['fern', 'bush'] });
        k.flowers(F, 60, 120);
      },
      npcs: [
        { kind: 'neighbor', x: 1250, oy: 6, s: 0.9, dir: -1, colors: 'b', say: '颱風要來了，先整理陽台' },
        { kind: 'cat', x: 620, oy: -6, s: 0.8, dir: -1, say: '喵～窗戶關好了嗎？' },
        { kind: 'neighbor', x: 4620, oy: 6, s: 0.9, dir: 1, colors: 'c', say: '斷枝先別徒手碰喔' },
      ],
      fx(c, L, g, w) {
        rain(c, L, g.t, w[1] * 0.95 + w[0] * 0.1, 9);
        windLines(c, L, g.t, w[1] * 0.85 + w[0] * 0.2);
        flyers(c, L, g.t, w[1]);
      },
    },

    flood: {
      interactLines: {
        before: ["先看看住家附近的淹水潛勢與避難路線。", "把重要物品放高，避難包放在方便拿的地方。"],
        during: ["積水深淺看不清，別涉水通過。", "聽從疏散指示，及早前往安全處。"],
        after: ["水退後也要小心，先確認用電安全。", "清理淤泥時戴手套、穿雨鞋，保護自己。"],
      },
      palettes: [
        pal('#a6c4dc', '#efe6d6', '#bfcdd8', '#b0c6c2', '#a2c2ac', '#aed49c', '#98c78c', '#e4dac6', '#c1af90', '#9dcb8e', '#7eb67a', '#eef0ee'),
        pal('#7f94b2', '#bcc7cf', '#98a6b8', '#8fa2aa', '#85a09a', '#92b08e', '#80a180', '#c3bdb0', '#9e978a', '#88aa82', '#6f9674', '#ccd3dc'),
        pal('#b1d9ec', '#fbeed8', '#cbdbdf', '#bad3c5', '#a9cdb0', '#c0cf9a', '#aebf8b', '#d9cdb2', '#b8a585', '#a8c88c', '#88b077', '#ffffff'),
      ],
      backdrop: 'city',
      sun: [0.2, 0, 0.85],
      bugs: [0, 0, 0.2],
      gear: [{ raincoat: true }, { raincoat: true }, {}],
      ambience: [0.45, 0.8, 0],
      birds: [0, 0, 1],
      decor(k, r) {
        k.signs(['雨開始變大', '避開積水', '清理與消毒']);
        k.street(B, ['house', 'shop', 'apartment']);
        k.add('basement', 1120, -3, 1);
        k.add('sandbags', 1120, 4, 0.9);
        k.add('drain', 760, 100, 1);
        k.add('drain', 1530, 26, 1);
        k.cues(NODES.before, (n) => k.add('depthpole', n + 110, 2, 0.95, { level: 10 }));
        k.street(D, ['apartment', 'house', 'shop'], null, ['lamp', 'pole']);
        k.add('basement', D[0] + 720, -3, 1);
        k.add('sandbags', D[0] + 720, 4, 1);
        k.cues(NODES.during, (n, i) => {
          k.add('depthpole', n + 110, 2, 1.12, { level: [30, 58, 78][i] });
          k.add('sandbags', n - 140, 0, 1.05);
        });
        k.street(F, ['house', 'apartment'], null, ['bush', 'lamp']);
        for (let x = F[0] + 160; x < F[1] - 500; x += r.range(220, 340)) k.add('mud', x, k.front(10, 30), r.range(0.7, 1));
        for (let x = F[0] + 90; x < F[1]; x += r.range(180, 300)) k.add('puddle', x, r.range(30, 92), r.range(0.7, 1), { color: 'rgba(160,125,90,.5)' });
        k.add('broom', F[0] + 620, k.front(6, 12), 1.05);
        k.add('bucket', F[0] + 660, k.front(8, 12), 1);
        k.cues(NODES.after, (n) => {
          k.add('mud', n + 120, -2, 1);
          k.add('notice', n - 150, -4, 0.95, { label: '清理要消毒' });
        });
        k.flowers(B, 56, 100, { kinds: ['fern', 'bush'] });
        k.flowers(F, 90, 170, { kinds: ['fern'] });
      },
      npcs: [
        { kind: 'neighbor', x: 1350, oy: 6, s: 0.9, dir: -1, colors: 'b', say: '雨好大，先看看排水孔' },
        { kind: 'neighbor', x: 4660, oy: 4, s: 0.9, dir: 1, colors: 'c', say: '清理時記得保護自己' },
      ],
      /* 積水沿著當下這段逐步升高，災後退去 */
      ground(c, L, g, env, w) {
        const level = (x) => smooth(D[0] - 200, D[0] + 1500, x) * (1 - smooth(D[1] - 120, D[1] + 160, x)) * 68;
        if (env.left + L.vw < D[0] - 220 || env.left > D[1] + 180) return;
        c.beginPath();
        c.moveTo(-20, L.vh + 300);
        for (let sx = -20; sx <= L.vw + 22; sx += 14) {
          const x = env.left + sx;
          const ripple = Math.sin(x * 0.04 + g.t * 2) * 1.8;
          /* 水很淺時讓水線急降到畫面外，才不會在沒積水的路段留下一條水帶 */
          const lv = level(x);
          c.lineTo(sx, env.pathTop(x) + PATH_H - lv + ripple + (lv < 6 ? (6 - lv) * 200 : 0));
        }
        c.lineTo(L.vw + 22, L.vh + 300);
        c.closePath();
        c.fillStyle = 'rgba(118,160,190,.62)';
        c.fill();
        c.strokeStyle = 'rgba(255,255,255,.55)';
        c.lineWidth = 2;
        c.lineCap = 'round';
        c.beginPath();
        for (let i = 0; i < 16; i++) {
          const wx = Math.floor(env.left / 110) * 110 + i * 110 + hash(i) * 50;
          const lv = level(wx);
          if (lv < 8) continue;
          const y = env.pathTop(wx) + PATH_H - lv * (0.25 + hash(i + 2) * 0.5) + 6;
          c.moveTo(wx - env.left - 14, y);
          c.quadraticCurveTo(wx - env.left, y - 4, wx - env.left + 14, y);
        }
        c.stroke();
      },
      fx(c, L, g, w) {
        rain(c, L, g.t, w[0] * 0.5 + w[1], 4);
      },
    },

    debris: {
      interactLines: {
        before: ["住在坡地附近，先熟悉疏散路線。", "大雨前留意土石流警戒，備好避難包。"],
        during: ["收到疏散通知就及早離開，別等到路斷。", "遠離溪床與陡坡，不靠近查看落石。"],
        after: ["警戒解除前，先留在安全的安置處。", "坡地仍可能不穩，返家前確認官方指示。"],
      },
      palettes: [
        pal('#aed7ec', '#f6efd8', '#b9d4d4', '#a3ccb0', '#8fc397', '#a7d48e', '#90c67f', '#e9d9b6', '#c8b083', '#94cf84', '#74b872', '#ffffff'),
        pal('#8a9ab0', '#c9c6b8', '#9eabaa', '#8fa58f', '#7f9b7c', '#9aa877', '#889768', '#c2ac86', '#9c8767', '#8fa36b', '#76895c', '#d4d5d0'),
        pal('#b4dbee', '#fbf0d8', '#c3d9d4', '#adcfb2', '#98c79a', '#b6c98a', '#a2b97b', '#d6c29c', '#b39d76', '#a2c280', '#82aa6e', '#ffffff'),
      ],
      backdrop: 'mountain',
      hill: 1.35,
      sun: [0.9, 0, 0.9],
      bugs: [0.8, 0, 0.3],
      gear: [{}, { raincoat: true }, { helmet: true }],
      ambience: [0.1, 0.7, 0],
      birds: [1, 0, 1],
      decor(k, r) {
        k.signs(['山坡社區', '提早離開溪溝', '路阻別硬闖']);
        k.street(B, ['house', 'house', 'shop'], null, ['tree', 'tree', 'bush']);
        k.add('notice', 1250, -6, 0.95, { label: '疏散路線' });
        k.add('warnflag', 780, -5, 1, { color: '#f2c94c' });
        k.add('house', D[0] + 150, -14, 0.9);
        k.add('slope', NODES.before[1] + 210, -9, 0.62, { v: 'b', mild: true });
        /* 當下：明確的坡面與溪溝。泥流痕和岩土都停在路的後方，行走區保持乾淨 */
        k.cues(NODES.during, (n, i) => {
          /* 第一個坡面稍往左，讓後面的跨溪封閉牌整組進到初始鏡頭內 */
          k.add('slope', n + (i === 0 ? -90 : 60), -8, 0.92, [{ v: 'a', creek: true }, { v: 'b', flip: true }, { v: 'a', flip: true }][i]);
          /* 跨溪小橋緊接第一個崩塌的坡腳：沖蝕溝口的堆積扇直接流進溪溝。
             oy 稍大：溪溝要排在坡面之後畫（路面往右升高，同樣的 oy 會被山坡蓋住） */
          if (i === 0) k.add('creekcross', n - 90 + 245, 14, 1.02, { fan: true, slope: { x: -245, y: -22, s: 0.92 } });
          if (i !== 1) k.add('warnflag', n - 150, -3, 1.08, { color: i ? '#e5684d' : '#f2c94c' });
          /* 第一個坡面右側留給跨溪封閉牌，不再疊告示 */
          if (i) k.add('notice', n + 250, -2, 0.92, { label: i === 2 ? '遠離溪溝' : '提早撤離' });
        });
        k.add('mud', F[0] + 360, -2, 1.3);
        k.add('roadblock', F[0] + 500, 2, 1);
        k.add('mud', F[0] + 880, k.front(6, 18), 1.05);
        k.add('cone', F[0] + 300, 0, 1);
        k.add('cone', F[0] + 620, 0, 1);
        k.add('slope', NODES.after[0] + 90, -9, 0.7, { v: 'b' });
        k.add('creekcross', NODES.after[1] + 150, -3, 0.95);
        k.add('notice', NODES.after[1] - 150, -4, 0.95, { label: '路阻請繞道' });
        k.add('rallyflag', F[0] + 1120, k.front(6, 14), 1, { label: '避難處' });
        k.street([F[0] + 950, F[1]], ['house'], null, ['tree', 'bush']);
        k.flowers(B, 34, 70);
        k.flowers(F, 64, 120, { kinds: ['fern', 'bush'] });
      },
      npcs: [
        { kind: 'neighbor', x: 1000, oy: 6, s: 0.9, dir: -1, colors: 'b', say: '山上的溪溝要多留意' },
        { kind: 'dog', x: 1560, oy: 8, s: 0.8, dir: -1, say: '汪汪！' },
        { kind: 'neighbor', x: 4900, oy: 6, s: 0.9, dir: 1, colors: 'c', helmet: true, say: '繞路比較安全喔' },
      ],
      fx(c, L, g, w) {
        rain(c, L, g.t, w[1] * 0.85, 5);
      },
    },

    temperature: {
      interactLines: {
        before: ["出門前看溫度，衣物和飲水都準備好。", "天熱安排陰涼休息處，天冷備好保暖衣物。"],
        during: ["天熱補水、找陰涼處休息，別勉強活動。", "天冷注意保暖，使用燃氣設備保持通風。"],
        after: ["不舒服就休息，症狀持續要尋求協助。", "關心長輩和孩子，確認飲水與保暖都足夠。"],
      },
      palettes: [
        pal('#b4dcee', '#fff0dc', '#d1dfe8', '#bdd8cc', '#aad3b0', '#b8dea0', '#a2d291', '#efe2c6', '#d1bb94', '#a2d68f', '#80c17a', '#ffffff'),
        pal('#b4dcee', '#fff0dc', '#d1dfe8', '#bdd8cc', '#aad3b0', '#b8dea0', '#a2d291', '#efe2c6', '#d1bb94', '#a2d68f', '#80c17a', '#ffffff'),
        pal('#a9ddf5', '#fff3dc', '#c9e0ea', '#b5d8c9', '#a2d4ac', '#b3e09a', '#9ad48b', '#efe2c6', '#d1bb94', '#9bd68c', '#79c278', '#ffffff'),
      ],
      moodPal: {
        hot: pal('#8fd0f2', '#ffe2a8', '#e8d6bb', '#dcc9a0', '#c8c58f', '#d4d184', '#c4c273', '#f4dfb6', '#d9b985', '#bfcf79', '#a3b768', '#fff7e6'),
        cold: pal('#9fb2c8', '#dbe3ea', '#bccada', '#b0c2cf', '#a4bac4', '#b4cbc2', '#a1bcb4', '#dcdfe0', '#b8bec2', '#a9c4b7', '#8dada2', '#eef2f6'),
      },
      backdrop: 'city',
      sun: [1, 0.8, 1],
      bugs: [0.4, 0.2, 0.5],
      gear: [{}, {}, {}],
      ambience: [0, 0.15, 0],
      birds: [1, 0.4, 1],
      gearFor(stage, mood) {
        if (mood < -0.3) return { scarf: true, coat: true };
        if (mood > 0.3) return { sunhat: true };
        return {};
      },
      decor(k, r) {
        k.signs(['冷熱都要準備', '注意身體警訊', '持續關心彼此']);
        k.add('thermoboard', 620, -5, 1);
        k.street(B, ['house', 'shop', 'apartment']);
        k.street(D, ['house', 'apartment', 'shop'], null, ['tree', 'bench', 'lamp']);
        k.street(F, ['house', 'apartment'], null);
        /* 電扇只在不冷的時候出現；寒流畫面不放電扇，也不放冷熱對照牌 */
        k.add('fan', 1050, k.front(8, 14), 1, { mood: 'hot' });
        k.add('fan', D[0] + 460, k.front(8, 14), 1, { mood: 'hot' });
        k.add('bench', D[0] + 1300, k.front(6, 10), 1.1);
        /* 熱：遮蔭點在每個節點；補水只有一張主要的奉茶桌，其餘縮成店門口的小水壺。
           冷：保暖牌只留在災前；當下靠街區的共同反應（關窗掛門簾的住宅、穿厚衣的鄰居、店門口的熱飲） */
        k.cues([...NODES.before, ...NODES.during, ...NODES.after], (n) => k.add('shadespot', n + 130, -2, 1.02, { mood: 'hot' }));
        k.cues(NODES.before, (n) => {
          k.add('warmpost', n + 130, -2, 0.9, { mood: 'cold' });
          k.add('thermoboard', n - 150, -3, 0.95);
        });
        k.cues([...NODES.during, ...NODES.after], (n, i) => k.add('waterstation', n - 150, -2, i ? 0.95 : 1.05, { mood: 'hot', mini: i > 0 }));
        /* 第一個當下節點旁的住宅做寒流配置；它右邊的店家門口掛小小的保暖架與熱飲 */
        const n0 = NODES.during[0];
        const home = k.items.find((it) => it.type === 'house' && it.x > n0 && it.x < n0 + 260);
        if (home) home.winter = true;
        const shop = k.items.find((it) => it.type === 'shop' && it.x > n0 + 160 && it.x < n0 + 500);
        if (shop) {
          shop.label = '早餐店';
          k.add('warmrack', shop.x - 78 * shop.s, shop.oy + 5, 0.66, { mood: 'cold' });
        }
        k.flowers(B, 44, 84);
        k.flowers(D, 60, 110);
        k.flowers(F, 44, 84);
      },
      npcs: [
        { kind: 'neighbor', x: 980, oy: 6, s: 0.9, dir: -1, colors: 'b', say: '今天的天氣要多注意' },
        /* 寒流時換上厚外套與圍巾，嘴邊有一點哈氣（fx 畫） */
        { kind: 'neighbor', x: 2422, oy: 4, s: 0.88, dir: 1, colors: 'c', breath: true, gearCold: { coat: true, scarf: true, coatCol: { jacket: '#b98a6a', jacketDark: '#9a6f52' }, scarfCol: ['#f2c94c', '#d9a93a'] }, say: '也去看看隔壁長輩吧' },
        { kind: 'cat', x: 4500, oy: -4, s: 0.8, dir: 1, say: '喵～多喝水，也要保暖' },
      ],
      fx(c, L, g, w) {
        const hot = Math.max(0, g.mood || 0);
        const cold = Math.max(0, -(g.mood || 0));
        if (hot > 0.03) {
          /* 熱浪線只畫在曝曬的路段：遮蔭棚的範圍內淡掉不畫（12 條，集中在中下段的路面與空中） */
          const left = g.cam.x - L.vw / 2;
          const shades = g.decor.filter((it) => it.type === 'shadespot' && !it.hide).map((it) => [it.x - left, 120 * it.s]);
          c.lineWidth = 2.4;
          c.lineCap = 'round';
          for (let i = 0; i < 12; i++) {
            const x = (hash(i) * L.vw * 1.1) % L.vw;
            const y = L.base * (0.42 + hash(i + 5) * 0.52);
            const near = shades.reduce((m, [sx, r]) => Math.min(m, Math.abs(x - sx) / r), 9);
            const a = Math.max(0, Math.min(1, (near - 1) / 0.4));
            if (a < 0.02) continue;
            c.strokeStyle = `rgba(255,190,110,${0.42 * hot * a})`;
            c.beginPath();
            for (let k = 0; k <= 4; k++) {
              const py = y - k * 10;
              const px = x + Math.sin(k * 1.7 + g.t * 2 + i) * 5;
              if (k === 0) c.moveTo(px, py);
              else c.lineTo(px, py);
            }
            c.stroke();
          }
          haze(c, L, '255,190,120', 0.08 * hot);
        }
        if (cold > 0.03) {
          /* 寒流霧氣與主角哈氣 */
          c.globalAlpha = 0.28 * cold;
          c.drawImage(g.sprites.fog, -L.vw * 0.2, L.base - 190, L.vw * 1.4, 170);
          c.globalAlpha = 1;
          skyHaze(c, L, '170,205,240', 0.12 * cold);
          for (let i = 0; i < 3; i++) {
            const p = (g.t * 0.8 + i / 3) % 1;
            c.globalAlpha = (1 - p) * 0.8 * cold;
            A.ell(c, g.hero.sx + g.hero.dir * (36 + p * 26), g.hero.y - 74 - p * 14, 4 + p * 7, 3.4 + p * 5, '#fff');
          }
          /* 鄰居也在哈氣：比主角少一點、小一點 */
          const left = g.cam.x - L.vw / 2;
          g.npcs.filter((n) => n.breath).forEach((n) => {
            const sx = n.x - left;
            if (sx < -60 || sx > L.vw + 60) return;
            const ny = DH.world.pathTop(L, n.x) + n.oy;
            for (let i = 0; i < 2; i++) {
              const p = (g.t * 0.7 + i / 2 + 0.3) % 1;
              c.globalAlpha = (1 - p) * 0.85 * cold;
              A.ell(c, sx + n.dir * (34 + p * 22) * n.s, ny - 72 * n.s - p * 12, 3.6 + p * 6, 3 + p * 4.6, '#fff');
            }
          });
          c.globalAlpha = 1;
        }
      },
    },

    air: {
      interactLines: {
        before: ["出門前查看空氣品質，調整戶外活動。", "準備合適的口罩，也安排室內活動吧。"],
        during: ["空氣品質不佳時，減少戶外劇烈活動。", "呼吸不舒服就停下休息，必要時尋求醫療協助。"],
        after: ["先確認空氣品質改善，再恢復戶外活動。", "依空氣品質調整通風，照顧自己的呼吸。"],
      },
      palettes: [
        pal('#c2d9de', '#f4ecd8', '#d0d9d8', '#c2d2c4', '#b4ccb1', '#bcd8a4', '#a8cb94', '#ebe1cb', '#cdbb98', '#aed398', '#8fbf84', '#fbfaf2'),
        /* 當下：天空偏黃灰霾，遠景山與天際線偏冷的灰藍紫，兩者色相分開 */
        pal('#c2b083', '#e4d4a4', '#a9aec0', '#9fa5b8', '#97a0ae', '#afb48a', '#9ea57c', '#e2d9bf', '#aa9f82', '#97ab76', '#738a5c', '#e2d6b6'),
        pal('#88d2f5', '#e8f8f6', '#b9dcea', '#a2d6c6', '#8dd0a4', '#a8e093', '#8dd284', '#efe4c8', '#cfba90', '#92d883', '#6ec373', '#ffffff'),
      ],
      backdrop: 'city',
      sun: [0.7, 0.2, 1],
      bugs: [0.3, 0, 1],
      gear: [{}, { mask: true }, {}],
      ambience: [0, 0.15, 0],
      birds: [0.5, 0, 1],
      decor(k, r) {
        k.signs(['先看空氣指標', '減少外出暴露', '空氣變好了']);
        k.street(B, ['house', 'shop', 'apartment'], { haze: 0.2 });
        /* 街邊的高樓比小屋大，當下時多吃一點霾，不搶近景 */
        k.items.forEach((it) => { if (it.type === 'apartment' && it.x < B[1]) it.haze = 0.4; });
        k.add('aqiboard', 780, -4, 1, { level: 1 });
        /* 當下依景深分三層：最遠一排公寓退到街後、被霾吃掉大半對比；中層住家與店面保留部分細節；
           路邊的指標、口罩架與角色完全清楚 */
        for (let x = D[0] - 120; x < D[1]; x += r.range(210, 280)) {
          k.add('apartment', x, -r.range(46, 58), r.range(0.74, 0.84), { floors: r.pick([4, 5]), haze: 0.84 });
        }
        k.street(D, ['house', 'house', 'shop'], (x) => ({ closed: x % 2 < 1, haze: 0.2 }), ['tree', 'lamp']);
        k.cues(NODES.during, (n, i) => {
          k.add('aqiboard', n + 120, -3, 1.05, { level: [3, 4, 3][i] });
          k.add('maskstand', n - 140, -2, 1.1);
        });
        k.cues(NODES.before, (n) => {
          k.add('aqiboard', n + 120, -3, 1, { level: 1 });
          k.add('notice', n - 150, -5, 0.92, { label: '出門先看燈號' });
        });
        k.street(F, ['house', 'apartment', 'shop']);
        k.cues(NODES.after, (n) => {
          k.add('aqiboard', n + 120, -3, 1, { level: 0 });
          k.add('notice', n - 150, -5, 0.92, { label: '開窗換氣' });
        });
        k.flowers(B, 44, 84);
        k.flowers(D, 70, 130, { kinds: ['bush', 'fern'] });
        k.flowers(F, 30, 62);
      },
      npcs: [
        { kind: 'neighbor', x: 1050, oy: 6, s: 0.9, dir: -1, colors: 'b', say: '出門前先看今天的燈號' },
        { kind: 'neighbor', x: 2980, oy: 6, s: 0.9, dir: 1, colors: 'c', gear: { mask: true }, say: '今天就少跑步吧' },
        { kind: 'dog', x: 4780, oy: 6, s: 0.8, dir: 1, say: '汪！空氣真好！' },
      ],
      /* 景深霧化的強度（world.js 依物件的 haze 值套用），只在當下 */
      depthHaze: (w) => w[1],
      depthHazeRgb: '188,182,174',
      fx(c, L, g, w) {
        const amount = w[1] + w[0] * 0.18;
        if (amount < 0.02) return;
        /* 天空：黃灰霾，往下到屋頂高度就淡掉 */
        const top = L.base - 300;
        const sk = c.createLinearGradient(0, 0, 0, top + 40);
        sk.addColorStop(0, `rgba(196,172,112,${0.3 * amount})`);
        sk.addColorStop(0.7, `rgba(206,184,124,${0.22 * amount})`);
        sk.addColorStop(1, 'rgba(206,184,124,0)');
        c.fillStyle = sk;
        c.fillRect(-40, -40, L.vw + 80, top + 80);
        /* 一團團的霾停在天空，不壓到路面 */
        for (let i = 0; i < 5; i++) {
          const span = L.vw + 700;
          const x = ((i * 380 + g.t * (9 + i * 2) - g.cam.x * 0.4) % span + span) % span - 350;
          c.globalAlpha = 0.32 * amount;
          c.drawImage(g.sprites.smog, x - 280, L.base - 520 + (i % 3) * 40, 560, 200);
        }
        c.globalAlpha = 1;
      },
    },

    drought: {
      interactLines: {
        before: ["平時節約用水，順手檢查水龍頭漏水。", "適量儲備飲用水，記得定期更換。"],
        during: ["留意供水公告，一起珍惜每一滴水。", "優先保留飲水與衛生用水，不用來路不明的水。"],
        after: ["恢復供水後，先依供水單位指引用水。", "檢查儲水容器清潔，節水習慣繼續保持。"],
      },
      palettes: [
        pal('#a9d9f0', '#fff1d6', '#d3dce0', '#c8d6be', '#bfd2a2', '#cbd693', '#b9c884', '#ecdcb8', '#cdb486', '#b8ce82', '#9cb871', '#ffffff'),
        pal('#8fcdee', '#ffe4ae', '#e0d4bb', '#d8c79f', '#ceb988', '#d9c384', '#c9b070', '#ecd29e', '#c9a673', '#cdb777', '#b39d62', '#fff6e4'),
        pal('#a4dcf5', '#eef8ea', '#c4e0e6', '#acd8c4', '#98d2a4', '#afe098', '#97d28a', '#ecdfc0', '#cdb88e', '#9ad789', '#76c078', '#ffffff'),
      ],
      backdrop: 'mountain',
      sun: [1, 1, 1],
      bugs: [0.5, 0, 1],
      gear: [{ sunhat: true }, { sunhat: true }, {}],
      ambience: [0, 0.1, 0],
      birds: [0.6, 0, 1],
      decor(k, r) {
        k.signs(['珍惜每一滴水', '依分區取水', '恢復供水了']);
        k.add('reservoir', 760, -6, 1, { level: 0.55 });
        k.street([B[0], 560], ['house', 'shop']);
        k.street([1000, B[1]], ['house', 'apartment']);
        k.add('bucket', 1320, k.front(8, 14), 1);
        k.add('tap', 1120, k.front(10, 16), 1);
        k.add('reservoir', D[0] + 280, -6, 1.05, { level: 0.18 });
        k.street([D[0] + 480, D[0] + 800], ['house']);
        k.add('watertruck', D[0] + 1000, -6, 1);
        [40, 90, 150].forEach((dx) => k.add('bucket', D[0] + 1000 + dx, 8, 0.95, { color: ['#e8905c', '#6fbad2', '#f4c76b'][dx % 3] }));
        k.add('notice', D[0] + 1240, -6, 0.95, { label: '分區供水' });
        k.street([D[0] + 1350, D[1]], ['house'], null, ['bush']);
        for (let x = D[0] + 80; x < D[1]; x += r.range(160, 260)) k.add('rock', x, k.front(8, 40), r.range(0.4, 0.75), { dark: '#c9b58f', light: '#ddcdaa' });
        k.add('reservoir', F[0] + 360, -6, 1.02, { level: 0.86 });
        k.street([F[0] + 560, F[1]], ['house', 'apartment']);
        k.add('tap', F[0] + 200, k.front(10, 16), 1, { on: true });
        k.add('tap', F[0] + 820, k.front(10, 16), 1, { on: true });
        k.add('reservoir', NODES.during[2] + 160, -6, 1, { level: 0.14 });
        k.cues(NODES.during, (n) => k.add('bucket', n - 140, -1, 1.15, { color: '#6fbad2' }));
        k.cues(NODES.after, (n) => k.add('notice', n - 150, -5, 0.92, { label: '持續節水' }));
        k.flowers(F, 34, 66);
        k.flowers(B, 80, 150, { kinds: ['fern', 'bush'] });
      },
      npcs: [
        { kind: 'neighbor', x: 1500, oy: 6, s: 0.9, dir: -1, colors: 'b', say: '水要省著用喔' },
        { kind: 'neighbor', x: 2980, oy: 40, s: 0.9, dir: 1, colors: 'c', say: '排隊取水不要急' },
        { kind: 'cat', x: 4620, oy: -4, s: 0.8, dir: 1, say: '喵～有水了！' },
      ],
      ground(c, L, g, env, w) {
        cracksOnGround(c, L, env, w[1] * 0.95 + w[0] * 0.25, 'rgba(120,88,52,.5)');
      },
      fx(c, L, g, w) {
        if (w[1] > 0.05) haze(c, L, '255,200,120', 0.08 * w[1]);
      },
    },

    blackout: {
      interactLines: {
        before: ["手電筒放在好拿處，先檢查電池。", "行動電源先充好，和家人約定聯絡方式。"],
        during: ["用手電筒照明，走動時注意腳下。", "停電先保持冷靜，別搭電梯。"],
        after: ["復電後分批開啟電器，避免一下用電太多。", "檢查冷藏食物是否安全，有疑慮就別吃。"],
      },
      palettes: [
        pal('#8f88c2', '#ffc99a', '#b09cbc', '#a897b0', '#9c93a4', '#a4ab92', '#939c86', '#d2c4b0', '#a89a86', '#8ea27e', '#778c6e', '#ffe2cc'),
        pal('#2c3058', '#585a86', '#4a4c74', '#44496a', '#3e4560', '#4f5e62', '#465458', '#6c6c7c', '#585868', '#4a5c58', '#3f504c', '#6d7096'),
        pal('#9fd2ee', '#ffe9c6', '#c2d6e0', '#b4d0c4', '#a5caa8', '#b0d79a', '#9acb8c', '#e4d8bf', '#c6b18d', '#9dcf8c', '#7db978', '#ffffff'),
      ],
      backdrop: 'city',
      sun: [0.7, 0, 0.9],
      bugs: [0, 0, 0.3],
      gear: [{}, { light: true }, {}],
      ambience: [0, 0.05, 0],
      birds: [0, 0, 1],
      decor(k, r) {
        k.signs(['黃昏的社區', '燈熄了也別慌', '電回來了']);
        k.street(B, ['house', 'apartment', 'shop'], { lit: true }, ['lamp', 'tree', 'lamp']);
        k.street(D, ['apartment', 'house', 'shop', 'apartment'], { lit: false }, ['lamp', 'pole', 'lamp']);
        k.add('candlesign', D[0] + 520, k.front(10, 16), 0.95);
        k.add('candlesign', D[0] + 1370, k.front(10, 16), 0.95);
        /* 相鄰一棟有電、一棟沒電：看得出是停電，不只是天黑 */
        k.cues(NODES.during, (n, i) => {
          k.add('apartment', n + 90, -7, 0.92, { lit: false, floors: 3 });
          k.add('apartment', n + 240, -7, 0.92, { lit: true, floors: 3 });
          if (i === 1) k.add('emergencylight', n - 150, -3, 1.08);
          else k.add('deadsignal', n - 150, -3, 1);
        });
        k.cues(NODES.before, (n) => k.add('notice', n + 120, -5, 0.92, { label: '備好手電筒' }));
        k.cues(NODES.after, (n) => k.add('notice', n + 120, -5, 0.92, { label: '電回來先檢查' }));
        k.street(F, ['house', 'apartment', 'shop'], { lit: true }, ['lamp', 'tree', 'bush']);
        k.flowers(B, 60, 110, { kinds: ['fern', 'bush'], dark: '#6d8f70', light: '#82a584' });
        k.flowers(D, 90, 170, { kinds: ['fern', 'bush'], dark: '#3f584f', light: '#4d6a5e' });
        k.flowers(F, 44, 84);
      },
      npcs: [
        { kind: 'neighbor', x: 1150, oy: 6, s: 0.9, dir: -1, colors: 'b', say: '手電筒放哪裡了呢？' },
        { kind: 'cat', x: 2750, oy: -4, s: 0.8, dir: -1, color: '#b9a5d6', say: '喵？怎麼暗暗的' },
        { kind: 'neighbor', x: 4520, oy: 6, s: 0.9, dir: 1, colors: 'c', say: '電來了！先看看家電' },
      ],
      lamps: true,
      sky(c, L, g, w) {
        stars(c, L, w[1]);
        if (w[1] > 0.05) {
          A.ell(c, L.vw * 0.78, L.base * 0.26, 26, 26, `rgba(255,246,205,${w[1]})`);
          A.ell(c, L.vw * 0.78 + 10, L.base * 0.26 - 5, 22, 22, `rgba(44,48,88,${w[1]})`);
        }
      },
      /* 夜裡主角四周亮一點，事件標記仍看得清楚 */
      fx(c, L, g, w) {
        if (w[1] < 0.02) return;
        const { sx, y } = g.hero;
        const r = Math.max(L.vw, L.vh) * 0.72;
        const glow = c.createRadialGradient(sx, y - 50, 70, sx, y - 50, r);
        glow.addColorStop(0, 'rgba(14,16,40,0)');
        glow.addColorStop(0.5, `rgba(14,16,40,${0.26 * w[1]})`);
        glow.addColorStop(1, `rgba(14,16,40,${0.5 * w[1]})`);
        c.fillStyle = glow;
        c.fillRect(-40, -40, L.vw + 80, L.vh + 400);
      },
    },

    nuclear: {
      interactLines: {
        before: ["先認識官方通知管道與避難指引。", "備好避難包，和家人確認聯絡方式。"],
        during: ["依官方指示進入室內，關閉門窗。", "是否疏散聽從官方指示，別自行服用碘片。"],
        after: ["等官方確認安全，再恢復戶外活動。", "飲水與食物依官方指引選用，別聽信傳言。"],
      },
      palettes: [
        pal('#aee0f2', '#fff5e2', '#cfe4e8', '#bfe0d0', '#afdabb', '#bfe2a6', '#a9d597', '#eee3c9', '#cfbc96', '#a8da97', '#85c582', '#ffffff'),
        pal('#b7d6e6', '#f3ead6', '#cddae0', '#c1d6cc', '#b4d0ba', '#bfd9a8', '#abcb9a', '#e6dbc4', '#c6b392', '#abd29a', '#8ebd8a', '#fafaf4'),
        pal('#aee0f2', '#fff3de', '#cfe4e8', '#bfe0d0', '#afdabb', '#bfe2a6', '#a9d597', '#ecdfc4', '#cdb892', '#a6d896', '#83c381', '#ffffff'),
      ],
      backdrop: 'coast',
      sea: ['#9ad8e8', '#7fc9dc'],
      plant: true,
      /* 發電廠一次只出現一座：災害當下的初始鏡頭裡，它完整地落在告示牌與廣播柱之間的海景缺口 */
      plantSpan: 2200,
      plantPhase: 880,
      plantScale: 1.08,
      horizonLift: 100,
      hill: 0.42,
      sun: [1, 0.6, 1],
      bugs: [0.6, 0, 0.6],
      gear: [{}, {}, {}],
      ambience: [0.1, 0.1, 0.1],
      birds: [1, 0, 1],
      decor(k, r) {
        k.signs(['安靜的海邊小鎮', '聽指示掩蔽', '照公告再行動']);
        k.street(B, ['house', 'house', 'shop'], null, ['tree', 'bush', 'palm']);
        /* 當下的街道往後退，留一段看得到海的缺口，遠方設施先被看見；房子門窗都關上（掩蔽） */
        k.add('house', D[0] + 40 - 150, -14, 0.92, { closed: true });
        k.street([D[0] + 560, D[1]], ['house', 'house', 'apartment'], { closed: true }, ['bush', 'tree']);
        k.add('bush', D[0] + 250, -6, 0.8);
        /* 當下：每個節點只配一塊主看板，彼此拉開；廣播柱略小，是第二眼的資訊 */
        k.cues(NODES.during, (n, i) => {
          if (i === 0) k.add('responsepost', n + 130, -2, 0.96, { rad: true });
          else if (i === 1) k.add('shelterboard', n + 170, -3, 1);
          else k.add('radsign', n - 150, -3, 1);
        });
        k.cues(NODES.before, (n) => {
          k.add('shelterboard', n + 120, -3, 0.95);
          k.add('radsign', n - 140, -3, 0.9);
        });
        k.cues(NODES.after, (n) => {
          k.add('responsepost', n + 120, -2, 0.95);
          k.add('radsign', n - 140, -3, 0.9);
        });
        k.street(F, ['house', 'shop'], null, ['tree', 'palm']);
        k.add('notice', F[0] + 500, k.front(8, 14), 0.95, { label: '最新公告' });
        k.add('boat', F[0] + 900, -46, 0.72);
        k.flowers(B, 36, 70);
        k.flowers(D, 60, 120);
        k.flowers(F, 36, 70);
      },
      npcs: [
        { kind: 'neighbor', x: 1000, oy: 6, s: 0.9, dir: -1, colors: 'b', say: '先看看應變資訊吧' },
        { kind: 'cat', x: 1550, oy: -4, s: 0.8, dir: 1, say: '喵～' },
        { kind: 'neighbor', x: 4780, oy: 6, s: 0.9, dir: 1, colors: 'c', say: '公告怎麼說，我們就怎麼做' },
      ],
      fx(c, L, g) {
        seagulls(c, L, g.t, g);
      },
    },
  };

  const NEIGHBOR_COLORS = {
    b: { jacket: '#7ec1dd', jacketDark: '#5fa6c4', pack: '#e8785c', packDark: '#c9624a', hat: '#c9b6f2', hatBand: '#8f7ac9' },
    c: { jacket: '#a9d98a', jacketDark: '#89c06c', pack: '#f4c76b', packDark: '#d8a94c', hat: '#ffb1c4', hatBand: '#e8785c', hair: '#2c2a2e' },
  };

  /* 分類與題目文字判斷冷熱，高低溫場景跟著下一題轉換。回傳 1 熱、-1 冷、0 看不出來。 */
  const HOT = /高溫|熱|中暑|日曬|防曬|冷氣/;
  const COLD = /低溫|寒|失溫|取暖|保暖|一氧化碳/;
  function moodOf(s) {
    if (!s) return 0;
    const head = `${s.category}${s.title}`;
    if (HOT.test(head)) return 1;
    if (COLD.test(head)) return -1;
    if (HOT.test(s.situation)) return 1;
    if (COLD.test(s.situation)) return -1;
    return 0;
  }

  const fallbackInteractLines = {
    before: ['先備好避難包，一起做好準備。', '和家人確認聯絡方式與避難路線吧。'],
    during: ['先照顧自己的安全，聽從官方指示。', '保持冷靜，在安全處確認應變資訊。'],
    after: ['先確認環境安全，再安排下一步。', '照顧自己，也關心身邊的人。'],
  };
  THEMES.home.interactLines = fallbackInteractLines;

  const cache = {};
  function theme(id) {
    const t = THEMES[id] || THEMES.home;
    if (!cache[id]) {
      const r = makeRng(20261101 + id.length * 97 + id.charCodeAt(0));
      const k = kit(r);
      t.decor(k, r);
      /* 路牌前後不擺會擋字的樹與燈 */
      const signs = k.items.filter((it) => it.type === 'stagesign');
      const TALL = new Set(['tree', 'palm', 'lamp', 'pole', 'bush', 'warnflag', 'gauge', 'rock', 'cone']);
      k.items = k.items.filter((it) => !(TALL.has(it.type) && it.oy < 40 && signs.some((sg) => Math.abs(sg.x - it.x) < 120)));
      cache[id] = { items: k.items, npcs: t.npcs.map((n) => Object.assign({}, n, { colors: NEIGHBOR_COLORS[n.colors] })) };
    }
    return { def: t, decor: cache[id].items, npcs: cache[id].npcs };
  }

  DH.scenes = { theme, moodOf, THEMES };
})();
