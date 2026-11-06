/* 入口：主角站在場景中央，十個災害圖章環繞。位置全由容器尺寸算出，resize 時重算。 */
(function () {
  const DH = window.DH;
  const { store, BADGES } = DH.core;
  const A = DH.art;
  const $ = (id) => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const MIN_STAMP = 44;
  const EDGE = 8;
  const GAP = 4;
  /* 低於這個高度放不下「角色＋下方泡泡」，泡泡改放角色旁 */
  const SIDE_BELOW_H = 520;
  /* 泡泡預留高度：角色大小要先扣掉它 */
  const BUBBLE_ROOM = { wide: 104, narrow: 132 };
  /* 已有選取時，滑鼠要在新圖章上停一下才換；滑過去的途中不會把泡泡換掉 */
  const HOVER_SWITCH_MS = 140;
  /* 泡泡與下方圖章（含標籤）至少留的視覺間距 */
  const BUBBLE_CLEAR = 10;
  /* 紀錄記號：圖章與泡泡共用，不只靠顏色 */
  const TIER_MARK = { good: '✓', normal: '✓', bad: '!' };

  let hazards = [];
  let countOf = () => 0;
  let handlers = {};
  let active = null;
  let geo = null;
  /* 手指第一下只選取：pointerdown 時記下按之前是否已選，避免 focus 搶先選取後被當成第二下 */
  let press = null;
  let hoverTimer = 0;
  let muteFocus = false;
  const cancelHover = () => {
    clearTimeout(hoverTimer);
    hoverTimer = 0;
  };

  /* 沿橢圓依弧長平均取點，從正上方順時針，phase 讓正上下方空出來 */
  function ellipsePoints(n, rx, ry, phase) {
    const STEPS = 720;
    const table = [0];
    let px = 0;
    let py = -ry;
    for (let i = 1; i <= STEPS; i++) {
      const a = (i / STEPS) * Math.PI * 2;
      const x = rx * Math.sin(a);
      const y = -ry * Math.cos(a);
      table.push(table[i - 1] + Math.hypot(x - px, y - py));
      px = x;
      py = y;
    }
    const total = table[STEPS];
    const out = [];
    let k = 0;
    for (let i = 0; i < n; i++) {
      const want = ((i + phase) / n) * total;
      while (k < STEPS && table[k] < want) k++;
      const a = (k / STEPS) * Math.PI * 2;
      out.push({ x: rx * Math.sin(a), y: -ry * Math.cos(a) });
    }
    return out;
  }

  /* 標籤：橫式單行；直式最多兩行，長名稱才換行 */
  function cellOf(name, S, oneLine) {
    const font = S >= 70 ? 15 : 13;
    const line = Math.round(font * 1.3);
    const chars = name.length;
    if (oneLine || chars <= 5) {
      return { w: Math.max(S + 8, chars * font + 18), h: S + 4 + line + 6, font, lines: 1 };
    }
    return { w: Math.max(S + 8, Math.ceil(chars / 2) * font + 18), h: S + 4 + line * 2 + 6, font, lines: 2 };
  }

  const overlaps = (a, b, gap) => !(a.r + gap <= b.l || b.r + gap <= a.l || a.b + gap <= b.t || b.b + gap <= a.t);

  /* 試一組圖章大小與圈數；有重疊就回傳 null */
  function tryRing(area, S, rings, oneLine) {
    const cx = area.l + area.w / 2;
    const cy = area.t + area.h / 2;
    const cells = hazards.map((h) => cellOf(h.name, S, oneLine));
    const maxH = Math.max(...cells.map((c) => c.h));
    const stdW = Math.max(S + 8, 4 * cells[0].font + 18);
    const ry = (area.h - maxH) / 2;
    let rx = (area.w - stdW) / 2;
    /* 高螢幕不要把圖章推到天邊，保持「環繞主角」 */
    if (area.h >= SIDE_BELOW_H) rx = Math.min(rx, ry * 1.55);
    const pts = [];
    if (rings === 1) {
      pts.push(...ellipsePoints(hazards.length, rx, ry, 0.5));
    } else {
      const inner = Math.floor(hazards.length * 0.4);
      pts.push(...ellipsePoints(inner, rx * 0.56, ry * 0.56, 0.5));
      pts.push(...ellipsePoints(hazards.length - inner, rx, ry, 0));
    }
    const rects = pts.map((p, i) => {
      const c = cells[i];
      const x = clamp(cx + p.x, area.l + c.w / 2, area.l + area.w - c.w / 2);
      const y = clamp(cy + p.y, area.t + c.h / 2, area.t + area.h - c.h / 2);
      return { x, y, cell: c, l: x - c.w / 2, r: x + c.w / 2, t: y - c.h / 2, b: y + c.h / 2 };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        if (overlaps(rects[i], rects[j], GAP)) return null;
      }
    }
    return { S, rings, rx, ry, cx, cy, rects };
  }

  function fitRing(area, oneLine) {
    const start = clamp(Math.round(Math.min(area.w, area.h) * 0.15), MIN_STAMP, 96);
    for (const rings of [1, 2]) {
      for (let S = start; S >= MIN_STAMP; S -= 2) {
        const fit = tryRing(area, S, rings, oneLine);
        if (fit) return fit;
      }
    }
    return tryRing(area, MIN_STAMP, 2, oneLine) || { S: MIN_STAMP, rings: 2, rx: 0, ry: 0, cx: area.l + area.w / 2, cy: area.t + area.h / 2, rects: [] };
  }

  /* 手機直式與橫式：不用整圈等距橢圓，改成依景深分層的「場景式」排列。
     far＝遠空（雲朵上、較小較淡）、sky＝近空、side＝路旁、ground＝前景草地（較大）。
     陣列順序＝順時針，和 hazards 順序一一對應，方向鍵照這個順序走。lift 是弧形的高低差（px）。 */
  const LAYER_SCALE = { far: 0.84, sky: 0.9, side: 0.94, ground: 1.06 };
  const TEMPLATES = {
    /* 高直式（390x844）：遠空三枚成弧、近空兩枚落在帽簷兩側、路旁兩枚；前景三枚分在小徑兩側、高低不同，
       最遠（最高）的一枚再小一級（k），讀得出往村口的景深 */
    tall: [
      { x: 0.5, layer: 'far', lift: 0 },
      { x: 0.83, layer: 'far', lift: 16 },
      { x: 0.73, layer: 'sky', lift: 0 },
      { x: 0.9, layer: 'side' },
      { x: 0.82, layer: 'ground', lift: 4 },
      { x: 0.6, layer: 'ground', lift: 52, k: 0.86 },
      { x: 0.18, layer: 'ground', lift: 32 },
      { x: 0.1, layer: 'side' },
      { x: 0.27, layer: 'sky', lift: 10 },
      { x: 0.17, layer: 'far', lift: 24 },
    ],
    /* 矮直式（360x640）：遠空四枚一道弧、左側路旁上下兩枚（一高一低）、右側一枚、前景三枚 */
    short: [
      { x: 0.63, layer: 'far', lift: 0 },
      { x: 0.88, layer: 'far', lift: 20 },
      { x: 0.9, layer: 'side' },
      { x: 0.81, layer: 'ground', lift: 12 },
      { x: 0.5, layer: 'ground', lift: 0 },
      { x: 0.19, layer: 'ground', lift: 16 },
      { x: 0.1, layer: 'side' },
      { x: 0.1, layer: 'side', hi: true },
      { x: 0.12, layer: 'far', lift: 26 },
      { x: 0.37, layer: 'far', lift: 4 },
    ],
    /* 橫式手機：卡片靠左（主角左側），右半邊留給村口的土地公廟、雜貨店、房子與樹，整片讀成一幅場景。
       天空六枚高低錯落；右側兩枚貼在屋頂上方、前景兩枚在路邊，不壓到建物；左側兩枚天空與兩枚前景框住卡片 */
    land: [
      { x: 0.58, layer: 'far', lift: 2 },
      { x: 0.76, layer: 'far', lift: 0 },
      { x: 0.93, layer: 'far', lift: 10 },
      { x: 0.93, layer: 'ground', lift: 0 },
      { x: 0.76, layer: 'ground', lift: 4 },
      { x: 0.23, layer: 'ground', lift: 2 },
      { x: 0.07, layer: 'ground', lift: 10 },
      { x: 0.08, layer: 'far', lift: 6 },
      { x: 0.25, layer: 'far', lift: 22 },
      { x: 0.42, layer: 'far', lift: 0 },
    ],
  };
  /* 直式泡泡預留高度（選取態：名稱、兩行內的說明、一行紀錄） */
  const PORTRAIT_BUBBLE = 104;

  function sceneKind(area, side) {
    if (hazards.length !== 10) return null;
    if (area.w < 600 && area.h > area.w * 1.25) return area.h >= area.w * 1.75 ? 'tall' : 'short';
    if (side && area.h < 400) return 'land';
    return null;
  }

  /* 依模板擺圖章與主角；任何重疊、出界或主角太小就回傳 null */
  function trySlots(area, kind, S0, oneLine) {
    const slots = TEMPLATES[kind];
    const cx = area.l + area.w / 2;
    const bottom = area.t + area.h;
    const cells = slots.map((s, i) => {
      const S = Math.max(MIN_STAMP, Math.round(S0 * LAYER_SCALE[s.layer] * (s.k || 1)));
      return { ...cellOf(hazards[i].name, S, oneLine), S };
    });
    const xs = slots.map((s, i) => clamp(area.l + s.x * area.w, area.l + cells[i].w / 2, area.l + area.w - cells[i].w / 2));
    const tops = new Array(slots.length);
    const byLayer = (ly) => slots.map((s, i) => (s.layer === ly ? i : -1)).filter((i) => i >= 0);
    const far = byLayer('far');
    const sky = byLayer('sky');
    const ground = byLayer('ground');
    const sides = byLayer('side');
    const maxOf = (ids, f) => ids.reduce((m, i) => Math.max(m, f(i)), -1e9);
    const minOf = (ids, f) => ids.reduce((m, i) => Math.min(m, f(i)), 1e9);
    ground.forEach((i) => { tops[i] = bottom - (slots[i].lift || 0) - cells[i].h; });
    const groundTop = minOf(ground, (i) => tops[i]);
    let hero;
    if (kind === 'land') {
      far.forEach((i) => { tops[i] = area.t + (slots[i].lift || 0); });
      const heroHalf = area.h * 0.26;
      const above = far.filter((i) => Math.abs(xs[i] - cx) < cells[i].w / 2 + heroHalf);
      const top = maxOf(above, (i) => tops[i] + cells[i].h) + 6;
      const h = Math.min(area.h * 0.52, bottom - 4 - top, 190);
      if (h < 100) return null;
      const left = (ids) => ids.filter((i) => xs[i] < cx - h * 0.3);
      hero = {
        h,
        y: top + h / 2,
        /* 側邊泡泡（在主角左側）的上下界：左側天空圖章的下緣、左側前景圖章的上緣 */
        top: maxOf(left(far), (i) => tops[i] + cells[i].h),
        bottom: minOf(left(ground), (i) => tops[i]),
      };
    } else {
      const gc = ground.reduce((m, i) => (Math.abs(xs[i] - cx) < Math.abs(xs[m] - cx) ? i : m), ground[0]);
      const clear = BUBBLE_CLEAR + cells[gc].S * 0.1 + 3;
      const feetMax = groundTop - clear - PORTRAIT_BUBBLE - 10;
      far.forEach((i) => { tops[i] = area.t + (slots[i].lift || 0); });
      const farBottom = maxOf(far, (i) => tops[i] + cells[i].h);
      const skyH = sky.length ? maxOf(sky, (i) => cells[i].h + (slots[i].lift || 0)) + 4 : 0;
      const band = feetMax - (farBottom + skyH + 6);
      const hMax = Math.min(200, area.h * 0.3, area.w * 0.56);
      if (band < 110) return null;
      if (kind === 'tall') {
        /* 高直式：近空兩枚貼著遠空弧線下緣（和遠空錯落成一組高低交錯的天空），
           主角與村口緊接在下面；多出來的高度全部留在腳下的小徑與路旁，不平均攤開 */
        sky.forEach((i) => {
          const above = far.filter((j) => Math.abs(xs[i] - xs[j]) < (cells[i].w + cells[j].w) / 2 + GAP + 2);
          tops[i] = Math.max(area.t + 18, maxOf(above, (j) => tops[j] + cells[j].h + GAP + 6)) + (slots[i].lift || 0) * 0.4;
        });
        const hw = Math.min(hMax, band) * 0.44;
        const over = [...far, ...sky].filter((i) => Math.abs(xs[i] - cx) < cells[i].w / 2 + hw + 2);
        const top = maxOf(over, (i) => tops[i] + cells[i].h) + 6;
        const room = feetMax - top;
        if (room < 110) return null;
        /* 角色整組比上限再小一點，讓前景圖章與小徑分到畫面 */
        const h = Math.min(hMax * 0.93, room);
        /* 多出來的高度：遠景、近景與主角整組往下移一段，前景小徑不再空一大片；
           上方讓出來的是後方山坡的稜線（小徑從那裡翻過山） */
        const drop = Math.max(0, room - h) * 0.42;
        [...far, ...sky].forEach((i) => { tops[i] += drop; });
        const feet = top + drop + h + Math.min(14, (room - h - drop) * 0.12);
        hero = { h, y: feet - h / 2, top: feet - h, bottom: feet };
      } else {
      const h = Math.min(hMax, band);
      const slack = band - h;
      /* 多出來的高度：一部分留在泡泡和前景之間，其餘把天空分散開，不讓上半部空一大片 */
      const feet = feetMax - slack * 0.35;
      const heroTop = feet - h;
      if (kind === 'short') far.forEach((i) => { tops[i] += slack * 0.3; });
      if (sky.length) {
        const lo = farBottom + 4;
        const hi = heroTop - 8 - skyH + 4;
        sky.forEach((i) => { tops[i] = lo + (hi - lo) * 0.72 + (slots[i].lift || 0); });
      }
      hero = { h, y: feet - h / 2, top: heroTop, bottom: feet };
      }
    }
    /* 路旁：腳邊的一枚貼著主角腳下高度，另一枚（hi）疊在它上面 */
    const feetY = hero.y + hero.h / 2;
    sides.filter((i) => !slots[i].hi).forEach((i) => { tops[i] = feetY - 2 - cells[i].h; });
    sides.filter((i) => slots[i].hi).forEach((i) => {
      const low = sides.find((j) => !slots[j].hi && Math.abs(slots[j].x - slots[i].x) < 0.05);
      tops[i] = (low != null ? tops[low] : feetY) - 8 - cells[i].h;
    });
    const rects = slots.map((s, i) => {
      const c = cells[i];
      const x = xs[i];
      const y = tops[i] + c.h / 2;
      return { x, y, cell: c, layer: s.layer, l: x - c.w / 2, r: x + c.w / 2, t: tops[i], b: tops[i] + c.h };
    });
    const heroBox = { l: cx - hero.h * 0.44, r: cx + hero.h * 0.44, t: hero.y - hero.h / 2, b: hero.y + hero.h / 2 };
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.t < area.t - 0.5 || r.b > bottom + 0.5 || r.l < area.l - 0.5 || r.r > area.l + area.w + 0.5) return null;
      if (overlaps(r, heroBox, 2)) return null;
      for (let j = i + 1; j < rects.length; j++) {
        if (overlaps(r, rects[j], GAP + 2)) return null;
      }
    }
    return { S: S0, rings: 0, scene: kind, rx: area.w / 2, ry: area.h / 2, cx, cy: area.t + area.h / 2, rects, hero };
  }

  function fitScene(area, kind, oneLine) {
    const start = kind === 'land' ? clamp(Math.round(area.h * 0.18), 46, 60) : clamp(Math.round(area.w * 0.16), 48, 64);
    for (let S = start; S >= MIN_STAMP; S -= 1) {
      const fit = trySlots(area, kind, S, oneLine);
      if (fit) return fit;
    }
    return null;
  }

  /* 把主角放進環內：盡量正中央，下方泡泡放不下才往上挪 */
  function placeHero(fit, side) {
    if (fit.hero) return fit.hero;
    const { cx, cy, rects } = fit;
    const near = rects.filter((r) => Math.abs(r.x - cx) < r.cell.w / 2 + 90);
    const top = near.filter((r) => r.y < cy).reduce((m, r) => Math.max(m, r.b), cy - fit.ry);
    const bottom = near.filter((r) => r.y > cy).reduce((m, r) => Math.min(m, r.t), cy + fit.ry);
    const room = bottom - top;
    if (side) {
      const h = clamp(room - 16, 84, 230);
      return { h, y: (top + bottom) / 2, top, bottom };
    }
    const wide = fit.rx >= 240;
    const need = wide ? BUBBLE_ROOM.wide : BUBBLE_ROOM.narrow;
    const h = wide ? clamp(room - need - 14, 84, 300) : clamp(room - need - 18, 84, 236);
    const ideal = cy;
    const y = Math.min(ideal, bottom - need - 12 - h / 2);
    return { h, y: Math.max(y, top + 6 + h / 2), top, bottom };
  }

  function compute() {
    const screen = $('entry-screen');
    if (screen.hidden || !hazards.length) return null;
    const box = screen.getBoundingClientRect();
    const head = document.querySelector('.entry-top').getBoundingClientRect();
    const area = {
      l: box.left + EDGE,
      t: head.bottom + 4,
      w: box.width - EDGE * 2,
      h: box.bottom - head.bottom - 4 - EDGE,
    };
    let side = area.h < SIDE_BELOW_H;
    const kind = sceneKind(area, side);
    if (kind === 'tall' || kind === 'short') side = false;
    const fit = (kind && fitScene(area, kind, side)) || fitRing(area, area.h < SIDE_BELOW_H);
    if (!fit.scene) side = area.h < SIDE_BELOW_H;
    const hero = placeHero(fit, side);
    return { box, area, side, fit, hero };
  }

  /* 把算好的位置套到 DOM */
  function apply() {
    geo = compute();
    if (!geo) return null;
    const { box, fit, side } = geo;
    const ring = $('entry-ring');
    ring.classList.toggle('is-side', side);
    ring.classList.toggle('is-scene', !!fit.scene);
    ring.dataset.scene = fit.scene || 'ring';
    ring.style.setProperty('--stamp', `${fit.S}px`);
    ring.querySelectorAll('.hz-stamp').forEach((b, i) => {
      const r = fit.rects[i];
      if (!r) return;
      if (r.cell.S) b.style.setProperty('--stamp', `${r.cell.S}px`);
      else b.style.removeProperty('--stamp');
      b.dataset.layer = r.layer || 'ring';
      b.style.left = `${r.l - box.left}px`;
      b.style.top = `${r.t - box.top}px`;
      b.style.width = `${r.r - r.l}px`;
      b.style.height = `${r.b - r.t}px`;
      b.style.setProperty('--label-font', `${r.cell.font}px`);
    });
    const orbit = $('entry-orbit');
    orbit.style.left = `${fit.cx - fit.rx - box.left}px`;
    orbit.style.top = `${fit.cy - fit.ry - box.top}px`;
    orbit.style.width = `${fit.rx * 2}px`;
    orbit.style.height = `${fit.ry * 2}px`;
    placeBubble();
    return geo;
  }

  /* 泡泡寬度依旁邊的圖章調整：量高度 → 看會碰到誰 → 收窄，重複兩次就穩定 */
  function placeBubble() {
    if (!geo) return;
    const bub = $('entry-bubble');
    const { box, fit, hero, side, area } = geo;
    const cx = fit.cx;
    $('bubble-link').hidden = true;
    bub.style.removeProperty('--tail-x');
    bub.classList.remove('is-docked');
    if (side) {
      /* 場景式橫式：卡片在主角左側，右半邊的村落完整露出；其餘（環形）仍放右側 */
      const onLeft = !!fit.scene;
      bub.classList.toggle('is-left', onLeft);
      const heroHalf = hero.h * 0.46;
      const edge = onLeft ? cx - heroHalf - 12 : cx + heroHalf + 12;
      /* 提示泡泡比選取泡泡窄，讓後面的村落多露出一段 */
      const cap = bub.classList.contains('is-hint') ? 252 : 288;
      const span = onLeft ? edge - area.l : area.l + area.w - edge;
      let w = Math.min(cap, span);
      let top = hero.y;
      for (let pass = 0; pass < 3; pass++) {
        bub.style.width = `${w}px`;
        const h = bub.offsetHeight;
        top = clamp(hero.y - h / 2, hero.top + 4, Math.max(hero.top + 4, hero.bottom - h - 4));
        const hits = fit.rects.filter((r) => (onLeft ? r.x < cx : r.x > cx) && r.b + 4 > top && r.t - 4 < top + h);
        const limit = onLeft
          ? edge - hits.reduce((m, r) => Math.max(m, r.r + 8), area.l)
          : hits.reduce((m, r) => Math.min(m, r.l - 8), area.l + area.w) - edge;
        w = Math.max(170, Math.min(w, limit));
      }
      bub.style.width = `${w}px`;
      bub.style.left = `${(onLeft ? edge - w : edge) - box.left}px`;
      bub.style.top = `${top - box.top}px`;
      const ring = $('entry-ring');
      ring.classList.toggle('tail-right', onLeft);
      if (onLeft) {
        ring.style.setProperty('--tail-l', `${edge - box.left - 1}px`);
        ring.style.setProperty('--tail-t', `${top + bub.offsetHeight / 2 - box.top}px`);
      }
      return;
    }
    bub.classList.remove('is-left');
    $('entry-ring').classList.remove('tail-right');
    const wide = fit.rx >= 240;
    const feet = hero.y + hero.h / 2 + (wide ? 4 : 10);
    /* 圖章選取時會放大 10%、上下浮動 3px，淨空要把這些算進去，看起來才有 10px 以上的間距 */
    const clear = BUBBLE_CLEAR + fit.S * 0.1 + 3;
    const MIN_W = 170;
    const maxW = Math.min(wide ? 330 : 300, area.w - 8);
    /* 收窄也躲不掉的（正下方）圖章決定泡泡的下緣；其餘兩側的圖章決定寬度 */
    const under = fit.rects.filter((r) => r.y > feet && r.r > cx - MIN_W / 2 && r.l < cx + MIN_W / 2);
    const sides = fit.rects.filter((r) => !under.includes(r) && Math.abs(r.x - cx) > 40);
    const floor = under.reduce((m, r) => Math.min(m, r.t - clear), area.t + area.h);
    const widthAt = (top, h) => {
      const hits = sides.filter((r) => r.b + 6 > top && r.t - 6 < top + h);
      const half = hits.reduce((m, r) => Math.min(m, Math.abs(r.x - cx) - (r.r - r.l) / 2 - 8), area.w / 2);
      return Math.max(MIN_W, Math.min(maxW, half * 2));
    };
    let w = maxW;
    let top = feet;
    for (let pass = 0; pass < 3; pass++) {
      bub.style.width = `${w}px`;
      const h = bub.offsetHeight;
      /* 由腳下開始試：太高就往上收（最多到腰部）；兩側太擠時可往下挪一點換寬度 */
      const hi = Math.max(hero.y + hero.h * 0.12, Math.min(feet, floor - h));
      const lo = Math.max(hi, Math.min(feet + 36, floor - h));
      let best = { top: hi, w: widthAt(hi, h) };
      for (let y = hi + 4; y <= lo; y += 4) {
        const ww = widthAt(y, h);
        if (ww > best.w + 12) best = { top: y, w: ww };
      }
      top = best.top;
      w = best.w;
    }
    /* 選取前景圖章時：高直式把卡片下移到前景圖章列的正上方、往那一側靠，底緣的尖角直接指向被選的圖章
       （不拉虛線、不跨過草地）；矮直式空間不夠，卡片留在腳下，用一條短虛線連到圖章。
       選取路旁（腳邊）圖章時，卡片往那一側靠，頂端尖角指向它；其餘（天上的）仍由主角腳下的尖角帶出 */
    let left = cx - w / 2;
    let tailX = cx;
    const link = $('bubble-link');
    link.hidden = true;
    const pick = active ? hazards.findIndex((x) => x.id === active) : -1;
    const target = pick >= 0 && fit.scene ? fit.rects[pick] : null;
    const h = bub.offsetHeight;
    const others = target ? fit.rects.filter((r) => r !== target) : [];
    const docked = target && fit.scene === 'tall' && target.t > top + h + 12 && (() => {
      const room = (area.w - w) / 2;
      const want = clamp(target.x - cx, -room, room);
      let best = null;
      for (let k = 1; k >= 0; k -= 0.25) {
        const l = cx - w / 2 + want * k;
        /* 卡片底緣：橫向有交集的前景圖章裡最高的那枚決定；被選的那枚會放大浮動，留多一點 */
        const below = fit.rects.filter((r) => r.t > feet && r.r > l - 6 && r.l < l + w + 6);
        const floor2 = below.reduce((m, r) => Math.min(m, r.t - (r === target ? clear : BUBBLE_CLEAR + 3)), area.t + area.h);
        const t2 = floor2 - h;
        if (t2 < top) continue;
        if (others.some((r) => overlaps(r, { l, r: l + w, t: t2, b: floor2 }, BUBBLE_CLEAR + 2))) continue;
        const reach = target.t - floor2;
        if (!best || reach < best.reach - 2) best = { l, t: t2, reach };
      }
      if (!best) return false;
      left = best.l;
      top = best.t;
      tailX = clamp(target.x, left + 26, left + w - 26);
      bub.classList.add('is-docked');
      return true;
    })();
    if (target && !docked && fit.scene === 'tall' && target.b <= top && Math.abs(target.x - cx) > hero.h * 0.3) {
      /* 路旁圖章：卡片往它那側靠（不碰其他圖章），尖角指向它 */
      const l = clamp(target.x - w / 2, area.l, area.l + area.w - w);
      if (!others.some((r) => overlaps(r, { l, r: l + w, t: top, b: top + h }, BUBBLE_CLEAR + 2))) {
        left = l;
        tailX = clamp(target.x, left + 26, left + w - 26);
      }
    }
    if (target && !docked && target.t > top + h + 12) {
      const room = (area.w - w) / 2;
      const want = clamp(target.x - cx, -room, room) * 0.8;
      for (let k = 1; k >= 0; k -= 0.25) {
        const l = cx - w / 2 + want * k;
        const hit = others.some((r) => overlaps(r, { l, r: l + w, t: top, b: top + h }, BUBBLE_CLEAR + 2));
        if (!hit) { left = l; break; }
      }
      const sx = clamp(target.x, left + 30, left + w - 30);
      const sy = top + h - 2;
      const ex = target.x;
      const ey = target.t + 2;
      const len = Math.hypot(ex - sx, ey - sy);
      if (len > 14) {
        link.hidden = false;
        link.style.left = `${sx - box.left}px`;
        link.style.top = `${sy - box.top}px`;
        link.style.height = `${len}px`;
        link.style.transform = `rotate(${(-Math.atan2(ex - sx, ey - sy) * 180) / Math.PI}deg)`;
      }
    }
    bub.style.setProperty('--tail-x', `${tailX - left}px`);
    bub.style.width = `${w}px`;
    bub.style.left = `${left - box.left}px`;
    bub.style.top = `${top - box.top}px`;
  }

  function fillBubble(h) {
    const bub = $('entry-bubble');
    const body = $('bubble-body');
    const go = $('bubble-go');
    body.textContent = '';
    const touch = document.body.classList.contains('touch');
    if (!h) {
      bub.classList.add('is-hint');
      bub.dataset.hazard = '';
      go.hidden = true;
      const hint = document.createElement('p');
      hint.className = 'bubble-hint';
      /* 兩段各自不斷開：窄泡泡換行時落在問句之後，不會只剩一兩個字掉到第二行 */
      ['今天想練哪一種？', touch ? '點一個圖章看看。' : '把游標移到圖章上看看。'].forEach((t) => {
        const part = document.createElement('span');
        part.className = 'hint-part';
        part.textContent = t;
        hint.appendChild(part);
      });
      body.appendChild(hint);
      return;
    }
    bub.classList.remove('is-hint');
    bub.dataset.hazard = h.id;
    const add = (tag, cls, txt) => {
      const n = document.createElement(tag);
      n.className = cls;
      n.textContent = txt;
      body.appendChild(n);
      return n;
    };
    add('strong', 'bubble-name', h.name);
    add('p', 'bubble-tag', h.tagline);
    const meta = document.createElement('p');
    meta.className = 'bubble-meta';
    const count = countOf(h.id);
    const num = document.createElement('span');
    num.textContent = count ? `題庫 ${count} 題` : '準備中';
    meta.appendChild(num);
    /* 徽章接在題數後面（短），最佳紀錄膠囊放最後；窄泡泡最多兩行 */
    if (store.data.badges.includes(`done-${h.id}`)) {
      const badge = BADGES.find((b) => b.id === `done-${h.id}`);
      if (badge) {
        /* 徽章只用小圖示，名稱放在 title／讀屏文字，紀錄才放得進一行 */
        const chip = document.createElement('span');
        chip.className = 'badge-mini';
        chip.title = `已得徽章：${badge.name}`;
        chip.setAttribute('role', 'img');
        chip.setAttribute('aria-label', `已得徽章：${badge.name}`);
        chip.textContent = '★';
        meta.appendChild(chip);
      }
    }
    const best = store.bestOf(h.id);
    if (best) {
      const chip = document.createElement('span');
      chip.className = `hz-best tier-${best.tier}`;
      chip.textContent = `${TIER_MARK[best.tier] || '✓'} 最佳 ${best.title}`;
      chip.title = `最佳紀錄：${best.title}（風險值 ${best.risk}）`;
      meta.appendChild(chip);
    } else {
      const none = document.createElement('span');
      none.className = 'bubble-none';
      none.textContent = '・還沒演練';
      meta.appendChild(none);
    }
    body.appendChild(meta);
    go.hidden = !count;
    go.setAttribute('aria-label', `出發：${h.name}`);
  }

  function select(id) {
    if (active === id) return;
    active = id;
    const h = hazards.find((x) => x.id === id) || null;
    cancelHover();
    document.querySelectorAll('.hz-stamp').forEach((b) => {
      const on = b.dataset.hazard === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    if (id) rove(id);
    fillBubble(h);
    placeBubble();
    const stamp = id && document.querySelector(`.hz-stamp[data-hazard="${id}"]`);
    const faceLeft = stamp && geo ? stamp.getBoundingClientRect().left + stamp.offsetWidth / 2 < geo.fit.cx : false;
    if (handlers.preview) handlers.preview(id, faceLeft);
  }

  /* 圓環只佔一個 Tab 停點：目前選取（或第一個）圖章 tabindex=0，其餘用方向鍵 */
  function rove(id) {
    const stamps = [...document.querySelectorAll('.hz-stamp:not(:disabled)')];
    const pick = stamps.find((b) => b.dataset.hazard === id) || stamps[0];
    stamps.forEach((b) => { b.tabIndex = b === pick ? 0 : -1; });
  }

  function enter(id) {
    if (countOf(id)) handlers.selectHazard(id);
  }

  function render(list, count, hs) {
    hazards = list;
    countOf = count;
    handlers = hs;
    const ring = $('entry-ring');
    ring.querySelectorAll('.hz-stamp').forEach((n) => n.remove());
    active = null;
    list.forEach((h, i) => {
      const n = count(h.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `hz-stamp${n ? '' : ' is-empty'}`;
      b.dataset.hazard = h.id;
      b.disabled = !n;
      const best = store.bestOf(h.id);
      b.setAttribute('aria-label', `${h.name}。${h.tagline}。${n ? `題庫 ${n} 題` : '準備中'}${best ? `。最佳紀錄：${best.title}` : ''}`);
      b.setAttribute('aria-pressed', 'false');
      b.style.setProperty('--tone', A.HAZARD_COLOR[h.id] || '#e8a15c');
      b.style.setProperty('--float-delay', `${(-i * 0.73).toFixed(2)}s`);
      const inner = document.createElement('span');
      inner.className = 'hz-float';
      const disc = document.createElement('span');
      disc.className = 'hz-disc';
      const icon = document.createElement('canvas');
      icon.setAttribute('aria-hidden', 'true');
      A.paintHazardIcon(icon, h.id, 112, true);
      disc.appendChild(icon);
      if (best) {
        const seal = document.createElement('i');
        seal.className = `hz-seal tier-${best.tier}`;
        seal.setAttribute('aria-hidden', 'true');
        seal.textContent = TIER_MARK[best.tier] || '✓';
        disc.appendChild(seal);
      }
      inner.appendChild(disc);
      const label = document.createElement('span');
      label.className = 'hz-label';
      label.textContent = h.name;
      inner.appendChild(label);
      b.appendChild(inner);

      b.addEventListener('pointerdown', (e) => {
        press = { id: h.id, type: e.pointerType, was: active === h.id };
      });
      b.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse') return;
        cancelHover();
        if (!active) select(h.id);
        else if (active !== h.id) hoverTimer = setTimeout(() => select(h.id), HOVER_SWITCH_MS);
      });
      b.addEventListener('pointerleave', cancelHover);
      b.addEventListener('focus', () => {
        if (!muteFocus) select(h.id);
      });
      b.addEventListener('click', () => {
        const p = press && press.id === h.id ? press : null;
        press = null;
        if (p && p.type !== 'mouse' && !p.was) {
          select(h.id);
          return;
        }
        enter(h.id);
      });
      /* 圖章排在泡泡前面：Tab 從圖章接著到「出發」 */
      ring.insertBefore(b, $('entry-bubble'));
    });
    rove(null);
    fillBubble(null);
    apply();
  }

  function init() {
    const link = document.createElement('i');
    link.id = 'bubble-link';
    link.hidden = true;
    link.setAttribute('aria-hidden', 'true');
    $('entry-ring').appendChild(link);
    $('bubble-go').addEventListener('click', () => {
      if (active) enter(active);
    });
    /* 泡泡也算 hover 區：滑進泡泡就取消途中經過的圖章，泡泡不會換掉或消失 */
    $('entry-bubble').addEventListener('pointerenter', cancelHover);
    $('entry-bubble').addEventListener('pointermove', cancelHover);
    /* 方向鍵沿著圓環移動焦點；左／上逆時針，右／下順時針 */
    $('entry-ring').addEventListener('keydown', (e) => {
      const stamps = [...document.querySelectorAll('.hz-stamp:not(:disabled)')];
      let i = stamps.indexOf(document.activeElement);
      /* 焦點在「出發」鈕時，方向鍵也能回到圖章繼續換 */
      if (i < 0 && document.activeElement === $('bubble-go')) i = stamps.findIndex((b) => b.dataset.hazard === active);
      if (i < 0) return;
      let to = -1;
      if (e.code === 'ArrowRight' || e.code === 'ArrowDown') to = (i + 1) % stamps.length;
      else if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') to = (i - 1 + stamps.length) % stamps.length;
      else if (e.code === 'Home') to = 0;
      else if (e.code === 'End') to = stamps.length - 1;
      if (to < 0) return;
      e.preventDefault();
      stamps[to].focus();
    });
    /* 點場景空白處取消選取 */
    $('entry-screen').addEventListener('click', (e) => {
      if (e.target === $('entry-screen') || e.target === $('entry-ring')) select(null);
    });
  }

  DH.entry = {
    init,
    render,
    layout: apply,
    /* 主角在螢幕上的位置；main.js 用來對齊 canvas */
    heroSpot() {
      return geo ? { x: geo.fit.cx, y: geo.hero.y, h: geo.hero.h } : null;
    },
    /* 手機場景式排列：每枚圖章「站」的地面點（圓章底緣，螢幕座標），順序＝順時針。
       scenes.js 依這些點畫一條環繞主角的小徑，圖章就落在小徑的轉折上 */
    trail() {
      if (!geo || !geo.fit.scene || !geo.fit.hero) return null;
      const { fit, hero, side } = geo;
      return {
        kind: fit.scene,
        side,
        hero: { x: fit.cx, top: hero.y - hero.h / 2, feet: hero.y + hero.h / 2, h: hero.h },
        area: { l: geo.area.l, t: geo.area.t, r: geo.area.l + geo.area.w, b: geo.area.t + geo.area.h },
        spots: fit.rects.map((r) => ({ x: r.x, y: r.t + r.cell.S * 0.94, top: r.t, S: r.cell.S, layer: r.layer, l: r.l, r: r.r, b: r.b })),
      };
    },
    clear() {
      if (active) {
        const id = active;
        const fromGo = document.activeElement === $('bubble-go');
        select(null);
        /* 「出發」鈕隱藏前把焦點還給圖章，焦點不會掉到 body */
        if (fromGo) {
          const st = document.querySelector(`.hz-stamp[data-hazard="${id}"]`);
          muteFocus = true;
          if (st) st.focus();
          muteFocus = false;
        }
        return true;
      }
      return false;
    },
    get active() { return active; },
  };
})();
