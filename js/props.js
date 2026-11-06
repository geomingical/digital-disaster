/* 場景物件庫：c 已平移到物件腳底，s 為縮放。全部圓潤、程式繪製。 */
(function () {
  const DH = window.DH;
  const A = DH.art;
  const { ell, box, line, poly, text, rr } = A;
  const frac = (v) => v - Math.floor(v);
  const WIN_ON = '#ffe7a6';
  const WIN_OFF = '#5f6a86';
  const WIN_DAY = '#bfe5f4';

  const windowColor = (it) => (it.lit === true ? WIN_ON : it.lit === false ? WIN_OFF : WIN_DAY);

  function softRoof(c, hw, y, rise, color) {
    c.beginPath();
    c.moveTo(-hw, y);
    c.quadraticCurveTo(-hw * 0.45, y - rise, 0, y - rise);
    c.quadraticCurveTo(hw * 0.45, y - rise, hw, y);
    c.quadraticCurveTo(hw + 5, y + 7, hw - 5, y + 7);
    c.lineTo(-hw + 5, y + 7);
    c.quadraticCurveTo(-hw - 5, y + 7, -hw, y);
    c.closePath();
    c.fillStyle = color;
    c.fill();
  }

  function shutters(c, x, y, w, h) {
    box(c, x, y, w, h, 3, '#c3c9d2');
    for (let i = 1; i < 4; i++) line(c, x + 2, y + (h * i) / 4, x + w - 2, y + (h * i) / 4, 'rgba(90,100,120,.45)', 1.4);
  }

  function crackLines(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + 6 * s, y + 10 * s);
    c.lineTo(x + 1 * s, y + 18 * s);
    c.lineTo(x + 9 * s, y + 30 * s);
    A.stroke(c, 'rgba(110,85,70,.6)', 2);
  }

  const WALLS = ['#fff3d6', '#fde2cf', '#e6f2e4', '#e3eef6', '#f8e4ec'];
  const ROOFS = ['#e0795e', '#6fb1a4', '#e6a24f', '#7d9fc9', '#c98398'];
  const SHOP_NAMES = ['雜貨店', '早餐店', '藥局', '麵包店', '五金行', '水果行'];

  /* 崩塌坡（slope）與跨溪小橋（creekcross）共用的零件：石塊、樹、斷木、草叢、Catmull-Rom 取樣、描點 */
  const slopeKit = (c) => {
    const rock = (x, y, r, rot, col) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      c.beginPath();
      c.moveTo(-r, r * 0.3);
      c.lineTo(-r * 0.7, -r * 0.55);
      c.lineTo(r * 0.15, -r * 0.75);
      c.lineTo(r * 0.95, -r * 0.2);
      c.lineTo(r * 0.75, r * 0.5);
      c.lineTo(-r * 0.2, r * 0.6);
      c.closePath();
      c.fillStyle = col || '#a39c8c';
      c.fill();
      ell(c, -r * 0.2, -r * 0.3, r * 0.4, r * 0.2, '#c8c3b5');
      c.restore();
    };
    const tree = (x, y, rot, k, broken) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      box(c, -3 * k, -30 * k, 6 * k, 32 * k, 3 * k, '#8a6446');
      if (broken) {
        poly(c, [-3 * k, -30 * k, 0, -36 * k, 3 * k, -30 * k], '#d6bf9c');
      } else {
        ell(c, 0, -40 * k, 15 * k, 14 * k, '#6fa463');
        ell(c, -6 * k, -44 * k, 8 * k, 7 * k, '#86b874');
      }
      c.restore();
    };
    const log = (x, y, rot, len) => {
      c.save();
      c.translate(x, y);
      c.rotate(rot);
      box(c, -len / 2, -3.5, len, 7, 3.5, '#8a6446');
      ell(c, len / 2 - 1, 0, 2.6, 3.4, '#d6bf9c');
      line(c, -len * 0.15, -2, -len * 0.05, -9, '#8a6446', 2.5);
      c.restore();
    };
    const tuft = (x, y, k, col) => {
      c.beginPath();
      c.moveTo(x - 7 * k, y);
      c.quadraticCurveTo(x - 6 * k, y - 7 * k, x - 2 * k, y - 9 * k);
      c.quadraticCurveTo(x, y - 4 * k, x + 2 * k, y - 10 * k);
      c.quadraticCurveTo(x + 6 * k, y - 6 * k, x + 8 * k, y);
      c.closePath();
      c.fillStyle = col || '#7f9a62';
      c.fill();
    };
    /* Catmull-Rom 取樣：輪廓與溝道邊緣是平滑的有機曲線 */
    const spline = (pts, closed, per) => {
      const out = [];
      const n = pts.length;
      const P = (i) => (closed ? pts[(i + n) % n] : pts[Math.max(0, Math.min(n - 1, i))]);
      const last = closed ? n : n - 1;
      for (let i = 0; i < last; i++) {
        const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
        for (let k = 0; k < per; k++) {
          const t2 = k / per, tt = t2 * t2, ttt = tt * t2;
          out.push([0, 1].map((d) => 0.5 * ((2 * p1[d]) + (-p0[d] + p2[d]) * t2 + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * tt + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * ttt)));
        }
      }
      if (!closed) out.push(pts[n - 1]);
      return out;
    };
    /* cont=true：接續目前子路徑（只 lineTo），讓多段點列合成同一條封閉路徑；否則第一點 moveTo 起新子路徑 */
    const trace = (pts, cont) => pts.forEach(([x, y], i) => (i || cont ? c.lineTo(x, y) : c.moveTo(x, y)));
    return { rock, tree, log, tuft, spline, trace };
  };

  /* 坡腳堆積扇（以 slope v='a' 的局部座標畫）：舌口流出的泥攤成一片低平的薄片——頂緣整條藏在舌內（y≈-62～-70，
     與舌同色，所以沒有接縫、沒有獨立的圓拱），兩側從舌口就開始向左右攤開，前緣是一條從 x≈10 到溪邊的低平線，
     整片是一個由舌口向下展寬的大梯形扇，左側低平面與右側入溪段是同一個形，不是泥舌加一條薄尾。
     沒有整圈包邊：只有推進水裡的那段邊緣夾一道短、淡的唇（讀成「泥推入水」）。
     toCreek：右側不往上游爬，從舌口右緣的高度直接推進溪裡到約六成寬、再順水往下攤薄，水道被擠到右岸；
     這個版本由 creekcross 蓋在溪與橋頭上面畫（slope 只先鋪同樣的底色，baseOnly），拖痕、倒樹、石塊都只畫一次 */
  function debrisFan(c, K, toCreek, baseOnly) {
    const { rock, tree, log, spline, trace } = K;
    /* 頂緣（舌內）→ 溪側／右側邊 → 低平前緣 → 左側邊回到舌口 */
    const FAN = toCreek
      ? [[110, -62], [150, -66], [190, -68], [224, -72], [240, -80], [248, -66], [252, -50], [248, -34], [240, -18], [231, -4], [222, 10], [198, 19], [160, 22], [122, 21], [84, 18], [50, 13], [20, 7], [10, 2], [30, -10], [56, -26], [82, -42], [100, -54]]
      : [[110, -62], [150, -66], [190, -68], [224, -70], [250, -64], [268, -50], [276, -32], [272, -12], [258, 6], [232, 16], [196, 21], [160, 22], [122, 21], [84, 18], [50, 13], [20, 7], [10, 2], [30, -10], [56, -26], [82, -42], [100, -54]];
    const fanPath = () => {
      c.beginPath();
      trace(spline(FAN, true, 4));
      c.closePath();
    };
    fanPath();
    const gf = c.createLinearGradient(0, -70, 0, 22);
    gf.addColorStop(0, '#a67a50');
    gf.addColorStop(0.35, '#b08860');
    gf.addColorStop(1, '#b8926c');
    c.fillStyle = gf;
    c.fill();
    if (baseOnly) return;
    /* 入水的唇：只沿推進水裡的那段邊（溪版）或右前緣（非溪版），短、細、兩端淡出；前緣與左側完全沒有包邊 */
    c.save();
    fanPath();
    c.clip();
    const lipPts = spline(toCreek ? FAN.slice(5, 11) : FAN.slice(5, 10), false, 4);
    c.beginPath();
    trace(lipPts);
    const [lx0, ly0] = lipPts[0];
    const [lx1, ly1] = lipPts[lipPts.length - 1];
    const lg = c.createLinearGradient(lx0, ly0, lx1, ly1);
    lg.addColorStop(0, 'rgba(143,102,68,0)');
    lg.addColorStop(0.3, 'rgba(143,102,68,.75)');
    lg.addColorStop(0.75, 'rgba(143,102,68,.6)');
    lg.addColorStop(1, 'rgba(143,102,68,0)');
    A.stroke(c, lg, 5);
    c.restore();
    /* 拖痕：都從舌內（舌口上方）起筆、沿上段流線的右下走向跨過舌口，到扇面上才各自散開——
       一道往左攤、一道直落、一道順舌緣轉進溪裡（或非溪版的右前緣），加一道更左、更淡的短痕；每道往末端淡出 */
    const fade = (x0, y0, x3, y3, col) => {
      const g = c.createLinearGradient(x0, y0, x3, y3);
      g.addColorStop(0, col.replace(/[\d.]+\)$/, '0)'));
      g.addColorStop(0.15, col);
      g.addColorStop(0.7, col);
      g.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      return g;
    };
    [[148, -92, 162, -66, 150, -34, 108, -4, 'rgba(70,44,26,.32)', 3],
      [182, -100, 198, -70, 198, -34, 186, 8, 'rgba(236,206,160,.36)', 2],
      toCreek ? [214, -104, 232, -74, 244, -52, 246, -30, 'rgba(70,44,26,.28)', 2.6] : [214, -104, 236, -72, 254, -44, 262, -14, 'rgba(70,44,26,.28)', 2.6],
      [126, -84, 128, -58, 96, -30, 52, -8, 'rgba(236,206,160,.26)', 1.8]].forEach(([x0, y0, x1, y1, x2, y2, x3, y3, col, w]) => {
      c.beginPath();
      c.moveTo(x0, y0);
      c.bezierCurveTo(x1, y1, x2, y2, x3, y3);
      A.stroke(c, fade(x0, y0, x3, y3, col), w);
    });
    /* 被推倒的樹與斷木停在前緣與左側低平面上；舌口附近與入溪交會處不放東西 */
    tree(34, -2, -1.4, 0.8);
    tree(98, -10, 2.25, 0.75);
    log(160, 10, 0.1, 44);
    if (!toCreek) tree(254, -4, -1.45, 0.75, true);
    /* 石塊：面上只留兩顆小石，大石沿著低平前緣停住、截住拖痕；入溪交會處不放，泥與水的交界才乾淨 */
    [[62, -4, 5, 0.3], [136, -8, 6, 0.2]].forEach(([x, y, r, a]) => rock(x, y, r, a));
    [[24, 6, 11, 0.3], [70, 14, 11, -0.2], [118, 17, 13, 0.4], [168, 18, 10, 0.1], [206, 14, 10, -0.1]].forEach(([x, y, r, a]) => rock(x, y, r, a, '#8f8878'));
    if (!toCreek) [[236, 10, 13, -0.3], [268, -22, 7, 0.1]].forEach(([x, y, r, a]) => rock(x, y, r, a, '#8f8878'));
  }

  const decor = {
    /* 建築 ------------------------------------------------------- */
    house(c, s, t, it) {
      c.scale(s, s);
      const k = Math.floor(frac(it.h * 5.3) * 5);
      box(c, -62, -76, 124, 76, 9, it.wall || WALLS[k]);
      softRoof(c, 76, -72, 42, it.roof || ROOFS[k]);
      box(c, -14, -46, 30, 46, 7, '#a4714c');
      ell(c, 9, -22, 2.2, 2.2, '#f4c76b');
      const col = windowColor(it);
      [[-50, -56], [28, -56]].forEach(([x, y]) => {
        if (it.closed) {
          shutters(c, x, y, 26, 24);
        } else {
          box(c, x, y, 26, 24, 5, col);
          line(c, x + 13, y + 2, x + 13, y + 22, 'rgba(255,255,255,.75)', 2);
        }
      });
      if (it.closed) box(c, -14, -46, 30, 46, 7, '#8d6b4f');
      if (it.winter && (A.mood || 0) < -0.1) {
        /* 寒流：窗簾拉上、玻璃起霧；門口掛厚棉門簾，旁邊一片擋風板，門墊上一雙鞋 */
        [[-50, -56], [28, -56]].forEach(([x, y]) => {
          box(c, x, y, 26, 24, 5, '#f1e3c8');
          box(c, x + 1, y + 1, 12, 22, 4, '#d98c78');
          box(c, x + 13, y + 1, 12, 22, 4, '#d98c78');
          line(c, x + 13, y + 2, x + 13, y + 22, '#b86f5e', 1.5);
          box(c, x, y, 26, 24, 5, 'rgba(236,242,248,.35)');
          box(c, x - 2, y + 22, 30, 4, 2, '#d8cbb4');
        });
        box(c, -17, -48, 36, 48, 7, '#6f86a8');
        for (let i = 0; i < 4; i++) line(c, -12 + i * 9, -44, -12 + i * 9, -4, 'rgba(255,255,255,.18)', 2);
        box(c, -17, -50, 36, 6, 3, '#56698a');
        poly(c, [22, 0, 24, -34, 40, -30, 40, 0], '#c9a97f');
        line(c, 24, -24, 40, -21, 'rgba(120,90,60,.45)', 2);
        line(c, 23, -12, 40, -10, 'rgba(120,90,60,.45)', 2);
        ell(c, 1, 1, 22, 4, '#b8a58a');
        box(c, -12, -4, 9, 4, 2, '#5d4a3e');
        box(c, 1, -4, 9, 4, 2, '#5d4a3e');
      }
      if (it.radio) {
        c.save();
        c.translate(0, -94);
        A.icons.radio(c);
        c.restore();
      }
    },
    apartment(c, s, t, it) {
      c.scale(s, s);
      const k = Math.floor(frac(it.h * 3.7) * 5);
      const floors = it.floors || 4;
      const H = floors * 48 + 22;
      box(c, -72, -H, 144, H, 12, it.wall || WALLS[k]);
      box(c, -78, -H - 7, 156, 14, 7, it.roof || ROOFS[k]);
      box(c, 28, -H - 28, 30, 22, 6, '#c8d6dd');
      for (let f = 0; f < floors; f++) {
        const y = -H + 18 + f * 48;
        [-56, -14, 28].forEach((x, i) => {
          const lit = it.lit === undefined ? undefined : (it.lit && frac((f + 1) * (i + 2) * 0.37 + it.h) > 0.28);
          box(c, x, y, 28, 28, 6, it.lit === undefined ? WIN_DAY : (lit ? WIN_ON : WIN_OFF));
        });
        if (f < floors - 1) line(c, -66, y + 39, 66, y + 39, 'rgba(120,90,70,.14)', 3);
      }
      box(c, -14, -30, 28, 30, 6, '#a4714c');
      if (it.crack) {
        crackLines(c, -32, -H + 40, 1.3);
        crackLines(c, 44, -H + 90, 1);
      }
    },
    shop(c, s, t, it) {
      c.scale(s, s);
      const k = Math.floor(frac(it.h * 7.1) * 5);
      box(c, -60, -92, 120, 92, 9, WALLS[k]);
      box(c, -52, -86, 104, 22, 6, '#fff9ea');
      text(c, it.label || SHOP_NAMES[Math.floor(frac(it.h * 11.3) * SHOP_NAMES.length)], 0, -75, 15, '#7a5b42', 800);
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.moveTo(-60 + i * 20, -62);
        c.lineTo(-40 + i * 20, -62);
        c.lineTo(-40 + i * 20, -50);
        c.quadraticCurveTo(-50 + i * 20, -41, -60 + i * 20, -50);
        c.closePath();
        c.fillStyle = i % 2 ? '#fffdf6' : ROOFS[k];
        c.fill();
      }
      box(c, -46, -40, 44, 26, 4, it.lit === false ? WIN_OFF : (it.lit ? WIN_ON : WIN_DAY));
      box(c, 12, -42, 32, 42, 6, '#a4714c');
    },
    /* 村口的土地公廟：紅瓦燕尾屋脊、小香爐與燈籠，入口畫面的地標 */
    shrine(c, s, t, it) {
      c.scale(s, s);
      ell(c, 0, 0, 52, 7, 'rgba(90,70,50,.14)');
      box(c, -46, -10, 92, 10, 3, '#d9cfbd');
      box(c, -34, -58, 68, 50, 6, '#f6e7cc');
      box(c, -14, -44, 28, 36, 5, '#8a4e3a');
      box(c, -10, -40, 20, 10, 3, '#f4c76b');
      /* 屋頂：兩端翹起的燕尾 */
      c.beginPath();
      c.moveTo(-54, -58);
      c.quadraticCurveTo(-60, -72, -66, -78);
      c.quadraticCurveTo(-40, -70, -26, -78);
      c.lineTo(26, -78);
      c.quadraticCurveTo(40, -70, 66, -78);
      c.quadraticCurveTo(60, -72, 54, -58);
      c.closePath();
      c.fillStyle = '#d9694a';
      c.fill();
      box(c, -30, -86, 60, 9, 4, '#c4553a');
      ell(c, 0, -90, 6, 5, '#f4c76b');
      /* 兩側小燈籠 */
      [-26, 26].forEach((x) => {
        line(c, x, -58, x, -52, '#7a5238', 1.6);
        ell(c, x, -46, 5.5, 7, '#e5574a');
        box(c, x - 3, -40, 6, 2.4, 1, '#f4c76b');
      });
      /* 香爐 */
      box(c, -9, -16, 18, 8, 3, '#b08a4c');
      c.globalAlpha = 0.45;
      const wv = Math.sin(t * 1.4) * 2;
      line(c, 0, -18, wv, -30, '#fffdf6', 1.6);
      c.globalAlpha = 1;
    },
    /* 植物 ------------------------------------------------------- */
    tree(c, s, t, it) {
      c.scale(s, s);
      const sway = Math.sin(t * 0.9 + it.h * 9) * 1.5;
      const bend = it.bend || 0;
      const gust = bend ? Math.sin(t * 2.2 + it.h * 7) * 3 : 0;
      c.beginPath();
      c.moveTo(-7, 0);
      c.quadraticCurveTo(-5, -30, -5 + bend * 0.7, -56);
      c.lineTo(7 + bend * 0.7, -56);
      c.quadraticCurveTo(7, -30, 7, 0);
      c.closePath();
      c.fillStyle = it.trunk || '#94694a';
      c.fill();
      const dx = bend + sway + gust;
      const col = it.dark || '#7fc47e';
      const col2 = it.light || '#a4d98f';
      ell(c, dx, -86, 40, 35, col);
      ell(c, dx - 21 - bend * 0.15, -67, 23, 21, col);
      ell(c, dx + 23 + bend * 0.15, -69, 23, 21, col);
      ell(c, dx - 7, -97, 21, 16, col2);
    },
    palm(c, s, t, it) {
      c.scale(s, s);
      const sw = Math.sin(t * 1.2 + it.h * 8) * 3 + (it.bend || 0);
      c.beginPath();
      c.moveTo(-6, 0);
      c.quadraticCurveTo(0, -60, 8 + sw * 0.3, -116);
      c.lineTo(15 + sw * 0.3, -116);
      c.quadraticCurveTo(10, -60, 8, 0);
      c.closePath();
      c.fillStyle = '#b28a5e';
      c.fill();
      [-2.5, -1.7, -0.9, -0.1, 0.6].forEach((a) => {
        c.save();
        c.translate(11 + sw * 0.3, -118);
        c.rotate(a + sw * 0.025);
        ell(c, 30, 0, 32, 8.5, '#6db37c', 0.25);
        c.restore();
      });
    },
    bush(c, s, t, it) {
      c.scale(s, s);
      const col = it.dark || '#86c97f';
      ell(c, 0, -14, 25, 17, col);
      ell(c, -14, -9, 15, 11, col);
      ell(c, 15, -9, 14, 10, col);
      ell(c, -5, -19, 12, 8, it.light || '#a5da92');
    },
    fern(c, s, t, it) {
      c.scale(s, s);
      const col = it.dark || '#6fb278';
      for (let i = -3; i <= 3; i++) {
        c.save();
        c.rotate(i * 0.36 + Math.sin(t * 1.2 + it.h * 7) * 0.04);
        ell(c, 0, -14, 3.8, 15, col);
        c.restore();
      }
    },
    flower(c, s, t, it) {
      c.scale(s, s);
      line(c, 0, 0, 0, -14, '#6fae68', 2);
      A.drawFlower(c, 0, -16, 6, it.color || '#ffb1c4', it.h * 6);
    },
    rock(c, s, t, it) {
      c.scale(s, s);
      c.beginPath();
      c.moveTo(-28, 0);
      c.quadraticCurveTo(-32, -20, -12, -26);
      c.quadraticCurveTo(4, -34, 16, -24);
      c.quadraticCurveTo(30, -16, 28, 0);
      c.quadraticCurveTo(0, 5, -28, 0);
      c.closePath();
      c.fillStyle = it.dark || '#b6b3a8';
      c.fill();
      ell(c, -6, -18, 11, 5.5, it.light || '#d1cec2', -0.12);
    },
    /* 街道 ------------------------------------------------------- */
    lamp(c, s, t, it) {
      c.scale(s, s);
      if (it.lit) {
        const g = c.createRadialGradient(0, -106, 2, 0, -106, 60);
        g.addColorStop(0, 'rgba(255,226,150,.72)');
        g.addColorStop(1, 'rgba(255,210,130,0)');
        c.fillStyle = g;
        c.fillRect(-60, -166, 120, 120);
      }
      line(c, 0, 0, 0, -96, '#6f7a8c', 6);
      box(c, -14, -116, 28, 22, 10, it.lit ? '#fff1b8' : '#aab2c0');
      box(c, -16, -119, 32, 7, 3.5, '#6f7a8c');
    },
    pole(c, s, t, it) {
      c.scale(s, s);
      line(c, 0, 0, 0, -142, '#8b8778', 7);
      line(c, -24, -128, 24, -128, '#8b8778', 5);
      box(c, 9, -112, 20, 26, 6, '#a7acb4');
      if (it.lean) {
        c.beginPath();
        c.moveTo(-24, -128);
        c.quadraticCurveTo(-52, -48, -70, -8);
        A.stroke(c, '#3c4252', 2);
      }
    },
    car(c, s, t, it) {
      c.scale(s, s);
      const body = it.color || '#7fc4d9';
      ell(c, 0, 1, 46, 6, 'rgba(60,50,40,.17)');
      box(c, -44, -28, 88, 21, 9, body);
      c.beginPath();
      c.moveTo(-27, -28);
      c.quadraticCurveTo(-20, -50, 2, -50);
      c.lineTo(10, -50);
      c.quadraticCurveTo(25, -50, 33, -28);
      c.closePath();
      c.fillStyle = body;
      c.fill();
      c.beginPath();
      c.moveTo(-19, -29);
      c.quadraticCurveTo(-14, -45, 2, -45);
      c.lineTo(2, -29);
      c.closePath();
      c.moveTo(7, -29);
      c.lineTo(7, -45);
      c.quadraticCurveTo(21, -45, 26, -29);
      c.closePath();
      c.fillStyle = '#eefaff';
      c.fill();
      [-25, 25].forEach((wx) => {
        ell(c, wx, -7, 9.5, 9.5, '#4a5468');
        ell(c, wx, -7, 4, 4, '#dfe6ea');
      });
    },
    bench(c, s) {
      c.scale(s, s);
      box(c, -30, -22, 60, 7, 3, '#a4714c');
      box(c, -30, -36, 60, 6, 3, '#b98a60');
      box(c, -25, -36, 5, 36, 2, '#8a5a44');
      box(c, 20, -36, 5, 36, 2, '#8a5a44');
    },
    bin(c, s) {
      c.scale(s, s);
      box(c, -12, -30, 24, 30, 6, '#7fbf9f');
      box(c, -14, -35, 28, 8, 4, '#5fa381');
    },
    hydrant(c, s) {
      c.scale(s, s);
      box(c, -8, -30, 16, 30, 5, '#e8605c');
      box(c, -14, -22, 28, 8, 4, '#c94d4a');
      ell(c, 0, -32, 8, 6, '#c94d4a');
    },
    cone(c, s) {
      c.scale(s, s);
      c.beginPath();
      c.moveTo(-11, -3);
      c.quadraticCurveTo(-3, -34, 0, -34);
      c.quadraticCurveTo(3, -34, 11, -3);
      c.closePath();
      c.fillStyle = '#f2914f';
      c.fill();
      box(c, -6.5, -19, 13, 6, 2, '#fffdf6');
      box(c, -16, -4, 32, 5, 2.5, '#d9733a');
    },
    /* 路牌與旗子 --------------------------------------------------- */
    stagesign(c, s, t, it) {
      c.scale(s, s);
      box(c, -6, -80, 12, 80, 3, '#94694a');
      c.beginPath();
      c.moveTo(-72, -122);
      c.lineTo(66, -122);
      c.quadraticCurveTo(72, -122, 76, -117);
      c.lineTo(88, -101);
      c.quadraticCurveTo(92, -96, 88, -91);
      c.lineTo(76, -75);
      c.quadraticCurveTo(72, -70, 66, -70);
      c.lineTo(-72, -70);
      c.quadraticCurveTo(-82, -70, -82, -80);
      c.lineTo(-82, -112);
      c.quadraticCurveTo(-82, -122, -72, -122);
      c.closePath();
      c.fillStyle = '#fff3d6';
      c.fill();
      c.strokeStyle = '#a4714c';
      c.lineWidth = 3.5;
      c.lineJoin = 'round';
      c.stroke();
      text(c, it.label, 2, -105, 20, '#7a5b42', 800);
      text(c, it.sub, 2, -83, 15, '#a4714c');
    },
    gate(c, s, t, it) {
      c.scale(s, s);
      box(c, -78, -132, 15, 132, 7, '#d98e63');
      box(c, 63, -132, 15, 132, 7, '#d98e63');
      c.beginPath();
      c.moveTo(-96, -118);
      c.quadraticCurveTo(0, -170, 96, -118);
      c.quadraticCurveTo(0, -146, -96, -118);
      c.fillStyle = '#7fc4a0';
      c.fill();
      box(c, -64, -166, 128, 40, 14, '#fff3d6');
      rr(c, -64, -166, 128, 40, 14);
      c.strokeStyle = '#d98e63';
      c.lineWidth = 3;
      c.stroke();
      text(c, it.label || '演練完成', 0, -146, 23, '#8a4a30', 800);
      [[-96, '#ffb1c4'], [96, '#ffd965']].forEach(([x, col]) => {
        ell(c, x, -116, 11, 11, col);
        ell(c, x, -116, 4, 4, '#fff');
      });
    },
    notice(c, s, t, it) {
      c.scale(s, s);
      box(c, -40, -36, 8, 36, 3, '#94694a');
      box(c, 32, -36, 8, 36, 3, '#94694a');
      box(c, -54, -98, 108, 66, 10, '#a4714c');
      box(c, -48, -92, 96, 54, 7, '#fff9ea');
      text(c, it.label || '社區公告', 0, -80, 14, '#7a5b42');
      line(c, -36, -66, 36, -66, '#d8c6a4', 3);
      line(c, -36, -57, 22, -57, '#d8c6a4', 3);
      line(c, -36, -48, 30, -48, '#d8c6a4', 3);
    },
    rallyflag(c, s, t, it) {
      c.scale(s, s);
      line(c, 0, 0, 0, -104, '#8a5a44', 4);
      const w = Math.sin(t * 3 + it.h * 5) * 3;
      c.beginPath();
      c.moveTo(0, -104);
      c.quadraticCurveTo(30, -99 + w, 62, -102);
      c.lineTo(62, -70);
      c.quadraticCurveTo(30, -67 + w, 0, -72);
      c.closePath();
      c.fillStyle = it.color || '#6fbf9b';
      c.fill();
      text(c, it.label || '集合點', 31, -86, 15, '#fff', 800);
      box(c, -14, -6, 28, 7, 3.5, '#a4714c');
    },
    warnflag(c, s, t, it) {
      c.scale(s, s);
      line(c, 0, 0, 0, -92, '#7a6a58', 4);
      const w = Math.sin(t * 5 + it.h * 5) * 3;
      c.beginPath();
      c.moveTo(0, -92);
      c.quadraticCurveTo(20, -86 + w, 44, -90);
      c.quadraticCurveTo(40, -76 + w, 44, -62);
      c.quadraticCurveTo(20, -60 + w, 0, -66);
      c.closePath();
      c.fillStyle = it.color || '#f2c94c';
      c.fill();
      ell(c, 20, -77, 2.6, 2.6, '#fff');
      box(c, 19, -86, 2.6, 6, 1.3, '#fff');
    },
    evacsign(c, s, t, it) {
      c.scale(s, s);
      box(c, -5, -74, 10, 74, 3, '#94694a');
      box(c, -48, -124, 96, 56, 14, '#6fbf9b');
      c.beginPath();
      c.moveTo(-32, -82);
      c.quadraticCurveTo(-8, -82, 2, -100);
      A.stroke(c, '#fff', 6);
      poly(c, [-6, -112, 14, -113, 8, -94], '#fff');
      text(c, it.label || '往高處', 20, -82, 14, '#fff', 800);
    },
    thermoboard(c, s) {
      c.scale(s, s);
      box(c, -5, -60, 10, 60, 3, '#94694a');
      box(c, -60, -112, 60, 56, 12, '#ffd7b5');
      box(c, 0, -112, 60, 56, 12, '#cfe6f7');
      ell(c, -30, -90, 11, 11, '#f7a84a');
      text(c, '防熱', -30, -66, 13, '#a24a24', 800);
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI) / 3 + 0.5;
        line(c, 30 - Math.cos(a) * 12, -90 - Math.sin(a) * 12, 30 + Math.cos(a) * 12, -90 + Math.sin(a) * 12, '#6fa8d6', 3);
      }
      text(c, '防寒', 30, -66, 13, '#3f6f96', 800);
    },
    aqiboard(c, s, t, it) {
      c.scale(s, s);
      box(c, -6, -70, 12, 70, 3, '#94694a');
      box(c, -72, -128, 144, 64, 14, '#fff9ea');
      rr(c, -72, -128, 144, 64, 14);
      c.strokeStyle = '#a4714c';
      c.lineWidth = 3;
      c.stroke();
      text(c, '今日空氣', 0, -113, 14, '#7a5b42', 800);
      ['#5bbf7a', '#f2c94c', '#f2994a', '#e5484d', '#9b6bc9'].forEach((col, i) => {
        const x = -60 + i * 25;
        box(c, x, -100, 21, 25, 6, col);
        if (i === it.level) {
          rr(c, x - 3, -103, 27, 31, 8);
          c.strokeStyle = '#4d4037';
          c.lineWidth = 2.6;
          c.stroke();
        }
      });
    },
    candlesign(c, s) {
      c.scale(s, s);
      box(c, -5, -52, 10, 52, 3, '#94694a');
      box(c, -42, -108, 84, 60, 12, '#fff3d6');
      rr(c, -42, -108, 84, 60, 12);
      c.strokeStyle = '#d98e63';
      c.lineWidth = 3;
      c.stroke();
      box(c, -28, -92, 11, 26, 3, '#fffdf6');
      rr(c, -28, -92, 11, 26, 3);
      c.strokeStyle = '#c9b89a';
      c.lineWidth = 1.5;
      c.stroke();
      c.beginPath();
      c.moveTo(-22.5, -106);
      c.quadraticCurveTo(-16, -98, -22.5, -94);
      c.quadraticCurveTo(-29, -98, -22.5, -106);
      c.fillStyle = '#f7a84a';
      c.fill();
      text(c, '用火', 10, -88, 15, '#a24a24', 800);
      text(c, '要小心', 10, -68, 13, '#a24a24', 700);
    },
    /* 災害小物 ----------------------------------------------------- */
    helmetbox(c, s) {
      c.scale(s, s);
      box(c, -22, -20, 44, 20, 5, '#d4ae7c');
      line(c, -22, -12, 22, -12, 'rgba(120,90,50,.35)', 2);
      c.save();
      c.translate(0, -28);
      c.scale(1.05, 1.05);
      A.icons.helmet(c);
      c.restore();
    },
    debrispile(c, s) {
      c.scale(s, s);
      ell(c, 0, -2, 40, 8, 'rgba(120,100,80,.3)');
      box(c, -34, -16, 24, 16, 4, '#c9a27c');
      box(c, -8, -24, 30, 24, 5, '#d4b48c');
      box(c, 16, -13, 20, 13, 4, '#b8a58c');
      line(c, -30, -24, 12, -36, '#94694a', 5);
    },
    branch(c, s) {
      c.scale(s, s);
      line(c, -38, -5, 32, -9, '#8a6444', 7);
      line(c, -6, -8, 14, -24, '#8a6444', 5);
      ell(c, 18, -26, 14, 9, '#86c97f');
      ell(c, 36, -12, 12, 8, '#7fc47e');
      ell(c, -40, -8, 10, 7, '#86c97f');
    },
    broom(c, s) {
      c.scale(s, s);
      line(c, 18, -64, -6, -10, '#a4714c', 4.5);
      c.beginPath();
      c.moveTo(-12, -14);
      c.lineTo(-1, -9);
      c.lineTo(-6, 0);
      c.lineTo(-24, -2);
      c.closePath();
      c.fillStyle = '#e6c15c';
      c.fill();
    },
    sandbags(c, s) {
      c.scale(s, s);
      [[-24, -9], [0, -9], [24, -9], [-12, -24], [12, -24]].forEach(([x, y]) => {
        ell(c, x, y, 15, 9, '#d4bf94');
        ell(c, x - 3, y - 2, 7, 3, 'rgba(255,255,255,.28)');
      });
    },
    drain(c, s) {
      c.scale(s, s);
      box(c, -22, -7, 44, 12, 3, '#6f7a8c');
      for (let i = 0; i < 5; i++) line(c, -15 + i * 7.5, -5, -15 + i * 7.5, 3, '#3f4656', 2.4);
    },
    basement(c, s) {
      c.scale(s, s);
      box(c, -48, -70, 96, 70, 10, '#d9d4c8');
      box(c, -34, -56, 68, 56, 8, '#59627a');
      [0, 1, 2, 3].forEach((i) => box(c, -32 + i * 3, -14 + i * -9 + 27, 64 - i * 6, 7, 2, i % 2 ? '#8791a8' : '#7a84a0'));
      box(c, -42, -92, 84, 22, 8, '#fff3d6');
      text(c, '地下室', 0, -81, 14, '#7a5b42', 800);
    },
    gauge(c, s, t, it) {
      c.scale(s, s);
      box(c, -7, -92, 14, 92, 4, '#fffdf6');
      [0, 1, 2, 3].forEach((i) => box(c, -7, -84 + i * 22, 14, 11, 2, ['#e5484d', '#f2994a', '#f2c94c', '#5bbf7a'][i]));
      box(c, -14, -6, 28, 6, 3, '#8a8f98');
      if (it.level) {
        line(c, -20, -it.level, 20, -it.level, '#3f8dc9', 3.5);
      }
    },
    puddle(c, s, t, it) {
      c.scale(s, s);
      ell(c, 0, 0, 44, 11, it.color || 'rgba(120,175,215,.55)');
      ell(c, -12, -2, 14, 3, 'rgba(255,255,255,.4)');
    },
    mud(c, s) {
      c.scale(s, s);
      ell(c, 0, -4, 62, 16, '#a97f58');
      ell(c, -22, -10, 26, 12, '#b98f66');
      ell(c, 24, -8, 22, 10, '#a07650');
      [[-30, -15], [8, -14], [30, -10]].forEach(([x, y]) => ell(c, x, y, 7, 5, '#c5c1b4'));
    },
    roadblock(c, s) {
      c.scale(s, s);
      [-46, 46].forEach((x) => box(c, x - 4, -40, 8, 40, 3, '#7a6a58'));
      rr(c, -58, -44, 116, 20, 7);
      c.save();
      c.clip();
      c.fillStyle = '#fffdf6';
      c.fillRect(-58, -44, 116, 20);
      for (let i = -3; i < 7; i++) poly(c, [-58 + i * 22, -24, -46 + i * 22, -44, -34 + i * 22, -44, -46 + i * 22, -24], '#f2914f');
      c.restore();
    },
    /* 海堤：wet 留下浪越過的水痕與泥漬，broken 缺一角、塊石落在堤腳 */
    seawall(c, s, t, it) {
      c.scale(s, s);
      const w = it.w || 240;
      const L0 = -w / 2;
      if (!it.broken) {
        box(c, L0, -34, w, 40, 8, '#c9c6ba');
        box(c, L0, -40, w, 12, 6, '#dcd9cd');
      } else {
        /* 中間偏右缺一個不規則口：堤頂斷開，露出較深的斷面 */
        const g0 = w * 0.12;
        const g1 = w * 0.34;
        box(c, L0, -34, w, 40, 8, '#c9c6ba');
        box(c, L0, -40, w / 2 + g0, 12, 6, '#dcd9cd');
        box(c, g1, -40, w / 2 - g1, 12, 6, '#dcd9cd');
        poly(c, [g0, -40, g0 + 8, -30, g0 + 4, -18, g0 + 16, -12, g1 - 14, -14, g1 - 6, -26, g1, -40, g1, -26, g1 - 4, -8, g0 + 2, -6, g0 - 4, -22], '#a9a395');
        poly(c, [g0 + 4, -18, g0 + 16, -12, g1 - 14, -14, g1 - 6, -26, g1 - 4, -8, g0 + 2, -6], '#8e887b');
        /* 落在堤前的塊石 */
        [[g0 + 6, 6, 13, 0.3], [g0 + 34, 9, 10, -0.4], [g1 + 10, 5, 11, 0.6]].forEach(([x, y, r, rot]) => {
          c.save();
          c.translate(x, y);
          c.rotate(rot);
          box(c, -r, -r * 0.7, r * 2, r * 1.4, 3, '#cfcbbf');
          box(c, -r, -r * 0.7, r * 2, r * 0.45, 3, '#dedbd0');
          c.restore();
        });
      }
      for (let x = L0 + 40; x < w / 2; x += 60) line(c, x, -26, x, 2, 'rgba(120,110,100,.25)', 2);
      if (it.wet) {
        /* 浪退後的水痕：下半較深，上緣一道不平整的泥線 */
        c.save();
        rr(c, L0, -34, w, 40, 8);
        c.clip();
        c.beginPath();
        c.moveTo(L0, 8);
        for (let x = L0; x <= w / 2; x += 12) c.lineTo(x, -22 + Math.sin(x * 0.09 + (it.h || 0) * 6) * 3 + ((x * 7) % 5));
        c.lineTo(w / 2, 8);
        c.closePath();
        c.fillStyle = 'rgba(122,104,78,.32)';
        c.fill();
        c.beginPath();
        for (let x = L0; x <= w / 2; x += 12) {
          const y = -22 + Math.sin(x * 0.09 + (it.h || 0) * 6) * 3 + ((x * 7) % 5);
          if (x === L0) c.moveTo(x, y);
          else c.lineTo(x, y);
        }
        A.stroke(c, 'rgba(110,86,58,.55)', 2.5);
        /* 往下流的泥水痕 */
        for (let x = L0 + 18; x < w / 2; x += 34 + ((x * 13) % 17)) line(c, x, -20, x + 3, -4 - ((x * 5) % 9), 'rgba(110,86,58,.3)', 3);
        c.restore();
      }
    },
    /* 浪退後留在岸上的海草團：葉片往同一方向倒（dir），len 改變葉長，buried 時下半被泥蓋住 */
    seaweed(c, s, t, it) {
      c.scale(s, s);
      const d = it.dir || 1;
      const k = it.len || 1;
      const seed = it.h || 0;
      ell(c, 2 * d, 1, 22 * k + 4, 5, 'rgba(70,80,50,.22)');
      const cols = ['#5f7f4a', '#6f9152', '#4f6c3e', '#7a9a5a', '#567446'];
      const n = 3 + Math.floor(seed * 3);
      for (let i = 0; i < n; i++) {
        const x = -10 + i * 6 + ((seed * 37 + i * 13) % 5);
        const y = (i % 2) * 2 - 1;
        const reach = (16 + ((seed * 53 + i * 7) % 14)) * k;
        c.beginPath();
        c.moveTo(x - 6 * d, y);
        c.quadraticCurveTo(x + 8 * d, y - 8 - i, x + reach * d, y - 2 + (i % 2) * 4);
        c.quadraticCurveTo(x + 10 * d, y - 2, x - 6 * d, y + 3);
        c.closePath();
        c.fillStyle = cols[(i + Math.floor(seed * 5)) % cols.length];
        c.fill();
      }
      ell(c, -6 * d, -1, 6, 3.6, '#4a6339');
      if (it.buried) ell(c, 0, 4, 16 * k + 6, 4.5, 'rgba(160,132,92,.92)');
    },
    /* 漂流木：樹皮紋與斷口；buried 時一端埋進泥裡 */
    driftwood(c, s, t, it) {
      c.scale(s, s);
      c.rotate(it.rot || 0);
      const len = it.len || 46;
      ell(c, 0, 3, len * 0.55, 4, 'rgba(70,55,40,.22)');
      box(c, -len / 2, -5, len, 10, 5, '#a88664');
      line(c, -len / 2 + 6, -1, len / 2 - 8, -2, '#8a6a4c', 2);
      ell(c, len / 2 - 2, 0, 3, 5, '#d6bf9c');
      if (len > 34) line(c, -len * 0.12, -4, -len * 0.02, -13, '#8a6a4c', 3.2);
      if (it.buried) ell(c, -len / 2 + 4, 3, 12, 6, 'rgba(160,132,92,.95)');
    },
    /* 浪帶上岸的碎塊：幾片大小不一的木片與石子 */
    rubble(c, s, t, it) {
      c.scale(s, s);
      const n = it.n || 3;
      const seed = it.h || 0.5;
      for (let i = 0; i < n; i++) {
        const x = (i - n / 2) * 9 + ((seed * 41 + i * 17) % 7);
        const y = ((seed * 29 + i * 11) % 6) - 2;
        c.save();
        c.translate(x, y);
        c.rotate(((seed * 7 + i) % 2) - 0.5);
        if ((i + Math.floor(seed * 4)) % 3 === 0) {
          ell(c, 0, 0, 4 + (i % 2) * 2, 3, '#b3ab9a');
          ell(c, -1, -1, 2, 1.2, '#d3cdbf');
        } else box(c, -6 - (i % 3) * 2, -2, 12 + (i % 3) * 4, 4, 2, i % 2 ? '#9a7656' : '#b89470');
        c.restore();
      }
    },
    lighthouse(c, s) {
      c.scale(s, s);
      c.beginPath();
      c.moveTo(-26, 0);
      c.lineTo(-16, -128);
      c.lineTo(16, -128);
      c.lineTo(26, 0);
      c.closePath();
      c.fillStyle = '#fffdf6';
      c.fill();
      poly(c, [-21, -46, 21, -46, 19, -74, -19, -74], '#e8785c');
      box(c, -14, -152, 28, 26, 6, '#ffe7a6');
      c.beginPath();
      c.moveTo(-19, -150);
      c.quadraticCurveTo(0, -176, 19, -150);
      c.closePath();
      c.fillStyle = '#e8785c';
      c.fill();
    },
    boat(c, s, t, it) {
      c.scale(s, s);
      const b = Math.sin(t * 1.4 + it.h * 6) * 2;
      c.translate(0, b);
      c.beginPath();
      c.moveTo(-38, -16);
      c.quadraticCurveTo(-30, 2, 0, 2);
      c.quadraticCurveTo(30, 2, 42, -18);
      c.closePath();
      c.fillStyle = '#e8785c';
      c.fill();
      box(c, -14, -36, 28, 20, 5, '#fffdf6');
      box(c, -8, -31, 8, 8, 2, '#a9dcec');
    },
    bucket(c, s, t, it) {
      c.scale(s, s);
      c.beginPath();
      c.moveTo(-14, -26);
      c.lineTo(14, -26);
      c.lineTo(10, 0);
      c.quadraticCurveTo(0, 3, -10, 0);
      c.closePath();
      c.fillStyle = it.color || '#6fbad2';
      c.fill();
      ell(c, 0, -26, 14, 4.5, it.full ? '#a9e0f5' : '#4f97ae');
      c.beginPath();
      c.arc(0, -26, 14, Math.PI, 0);
      A.stroke(c, '#7f8aa0', 2);
    },
    watertruck(c, s) {
      c.scale(s, s);
      ell(c, 0, 1, 76, 7, 'rgba(60,50,40,.17)');
      box(c, -72, -62, 96, 48, 22, '#8fd0e6');
      text(c, '供水', -24, -38, 19, '#fff', 800);
      box(c, 28, -56, 44, 42, 10, '#fff3d6');
      box(c, 40, -50, 24, 17, 4, '#cfeaf7');
      box(c, -72, -18, 146, 8, 4, '#7f8aa0');
      [-46, 48].forEach((x) => {
        ell(c, x, -8, 12, 12, '#4a5468');
        ell(c, x, -8, 5, 5, '#dfe6ea');
      });
    },
    tap(c, s, t, it) {
      c.scale(s, s);
      box(c, -5, -56, 10, 56, 3, '#8791a8');
      box(c, -5, -60, 26, 9, 4, '#8791a8');
      box(c, 15, -60, 9, 16, 3, '#8791a8');
      box(c, -10, -66, 20, 5, 2.5, '#e8785c');
      if (it.on) {
        const p = (t * 1.6 + it.h) % 1;
        A.drop(c, 19.5, -38 + p * 30, 1.1);
      }
      c.save();
      c.translate(19.5, 0);
      decor.bucket(c, 0.72, t, { h: it.h, full: it.on });
      c.restore();
    },
    reservoir(c, s, t, it) {
      c.scale(s, s);
      const lv = it.level === undefined ? 0.6 : it.level;
      box(c, -110, -84, 220, 90, 18, '#b9c9c2');
      rr(c, -98, -76, 196, 78, 12);
      c.save();
      c.clip();
      c.fillStyle = lv < 0.35 ? '#d9bf8f' : '#d6d2bf';
      c.fillRect(-98, -76, 196, 78);
      const y = 2 - 78 * lv;
      c.fillStyle = '#7cc5e4';
      c.fillRect(-98, y, 196, 80);
      c.strokeStyle = 'rgba(255,255,255,.7)';
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(-98, y);
      for (let x = -98; x < 98; x += 28) c.quadraticCurveTo(x + 7, y - 4, x + 14, y), c.quadraticCurveTo(x + 21, y + 4, x + 28, y);
      c.stroke();
      c.restore();
      [0.25, 0.5, 0.75].forEach((f) => line(c, 86, 2 - 78 * f, 98, 2 - 78 * f, '#6a7f78', 2.4));
      box(c, -60, -102, 120, 22, 10, '#fff3d6');
      text(c, it.label || '水庫水位', 0, -91, 14, '#7a5b42', 800);
    },
    plant(c, s) {
      /* 遠方中性造型的發電廠：坐在對岸的低岬角上，圓頂、廠房、矮煙囪與圍籬；不放警示符號、不冒煙 */
      c.scale(s, s);
      c.beginPath();
      c.moveTo(-190, 8);
      c.quadraticCurveTo(-150, -12, -100, -8);
      c.lineTo(110, -8);
      c.quadraticCurveTo(170, -10, 210, 8);
      c.closePath();
      c.fillStyle = '#a9c4b4';
      c.fill();
      box(c, -150, -10, 330, 6, 3, '#94b3a3');
      box(c, 104, -118, 14, 72, 5, '#d3dad8');
      box(c, 104, -118, 14, 8, 4, '#b9c6c9');
      box(c, -96, -50, 192, 46, 10, '#dfe5e4');
      box(c, -96, -14, 192, 10, 5, '#c9d3d3');
      box(c, 40, -76, 56, 30, 8, '#d0d8d7');
      c.beginPath();
      c.moveTo(-84, -48);
      c.quadraticCurveTo(-84, -120, -38, -120);
      c.quadraticCurveTo(8, -120, 8, -48);
      c.closePath();
      c.fillStyle = '#eef2f1';
      c.fill();
      c.beginPath();
      c.moveTo(-10, -50);
      c.quadraticCurveTo(-6, -104, -38, -118);
      c.quadraticCurveTo(8, -112, 8, -48);
      c.closePath();
      c.fillStyle = 'rgba(160,180,190,.35)';
      c.fill();
      ell(c, -54, -90, 12, 7, 'rgba(255,255,255,.85)');
      for (let i = 0; i < 4; i++) box(c, 20 + i * 18, -34, 11, 11, 3, '#9fbccb');
      for (let x = -150; x <= 176; x += 14) line(c, x, -10, x, -18, 'rgba(120,140,140,.55)', 1.5);
      line(c, -150, -16, 176, -16, 'rgba(120,140,140,.55)', 1.5);
    },
    radiopost(c, s, t) {
      c.scale(s, s);
      box(c, -4, -44, 8, 44, 3, '#94694a');
      c.save();
      c.translate(0, -56);
      c.scale(1.5, 1.5);
      A.icons.radio(c);
      c.restore();
      [14, 24].forEach((r, i) => {
        c.beginPath();
        c.arc(18, -74, r, -1, 0.3);
        c.globalAlpha = 0.5 + Math.sin(t * 2 + i) * 0.3;
        A.stroke(c, '#e8905c', 3);
        c.globalAlpha = 1;
      });
    },
    maskstand(c, s) {
      c.scale(s, s);
      box(c, -22, -34, 44, 34, 7, '#e7f3f7');
      c.save();
      c.translate(0, -17);
      A.icons.mask(c);
      c.restore();
      box(c, -26, -38, 52, 8, 4, '#8fbfd2');
    },
    /* R1 主視覺線索：固定配置，貼著角色與事件標記 ------------------------------ */
    /* 海嘯：高處避難建物與山丘（只畫安全的目的地，不畫海浪） */
    highground(c, s, t, it) {
      c.scale(s, s);
      c.beginPath();
      c.moveTo(-210, 4);
      c.quadraticCurveTo(-130, -66, -60, -120);
      c.quadraticCurveTo(0, -158, 70, -120);
      c.quadraticCurveTo(150, -62, 210, 4);
      c.closePath();
      c.fillStyle = '#9fcf8f';
      c.fill();
      ell(c, -40, -104, 52, 16, '#b4dc9f', -0.5);
      if (it && it.muddy) {
        /* 災後：坡腳被浪帶上來的泥蓋住一段，上緣不平整；上面一圈濕色與倒伏草、少量碎木。避難所與步道保持乾淨 */
        c.save();
        c.beginPath();
        c.moveTo(-210, 4);
        c.quadraticCurveTo(-130, -66, -60, -120);
        c.quadraticCurveTo(0, -158, 70, -120);
        c.quadraticCurveTo(150, -62, 210, 4);
        c.closePath();
        c.clip();
        const mudTop = (x) => -22 - 10 * Math.sin(x * 0.045 + 1) - 7 * Math.sin(x * 0.11) - (x > -60 && x < 40 ? 6 : 0);
        c.beginPath();
        c.moveTo(-220, 8);
        for (let x = -220; x <= 220; x += 10) c.lineTo(x, mudTop(x) - 14);
        c.lineTo(220, 8);
        c.closePath();
        c.fillStyle = 'rgba(96,130,82,.28)';
        c.fill();
        c.beginPath();
        c.moveTo(-220, 8);
        for (let x = -220; x <= 220; x += 10) c.lineTo(x, mudTop(x));
        c.lineTo(220, 8);
        c.closePath();
        c.fillStyle = 'rgba(166,138,96,.82)';
        c.fill();
        c.beginPath();
        for (let x = -220; x <= 220; x += 10) {
          if (x === -220) c.moveTo(x, mudTop(x));
          else c.lineTo(x, mudTop(x));
        }
        A.stroke(c, 'rgba(116,92,62,.5)', 2.5);
        c.beginPath();
        for (let x = -196; x < 200; x += 15 + ((x * 7) % 11)) {
          const y = mudTop(x) - 4 - ((x * 13) % 7);
          c.moveTo(x, y);
          c.quadraticCurveTo(x + 5, y - 5, x + 13, y - 2);
        }
        A.stroke(c, 'rgba(104,140,84,.85)', 2);
        [[-150, -10, 0.4, 20], [-104, -16, -0.2, 14], [64, -20, 0.5, 18], [150, -8, 0.2, 24], [112, -4, -0.3, 10]].forEach(([x, y, rot, len]) => {
          c.save();
          c.translate(x, y);
          c.rotate(rot);
          box(c, -len / 2, -3, len, 6, 3, '#9e7c5a');
          c.restore();
        });
        c.restore();
      }
      /* 之字步道 */
      c.beginPath();
      c.moveTo(-130, 2);
      c.lineTo(-40, -28);
      c.lineTo(-96, -56);
      c.lineTo(-14, -86);
      c.lineTo(-22, -128);
      A.stroke(c, '#fff3d6', 9);
      /* 步道上的上坡箭頭 */
      [[-85, -15, -0.32], [-68, -42, 2.68], [-55, -71, -0.35], [-18, -107, -1.76]].forEach(([x, y, a]) => {
        c.save();
        c.translate(x, y);
        c.rotate(a);
        poly(c, [-5, -5, 5, 0, -5, 5], '#3f8f6c');
        c.restore();
      });
      /* 避難建物 */
      box(c, -48, -222, 96, 92, 9, '#fff3d6');
      box(c, -54, -228, 108, 13, 6, '#6fb1a4');
      [-34, -7, 20].forEach((x) => [-208, -178].forEach((y) => box(c, x, y, 16, 20, 4, '#bfe5f4')));
      box(c, -11, -156, 22, 26, 5, '#a4714c');
      box(c, -46, -262, 92, 28, 10, '#4f9d78');
      text(c, '避難所', 0, -248, 17, '#fff', 800);
      line(c, 0, -228, 0, -234, '#4f9d78', 4);
    },
    /* 路面接到高地步道口的短泥土小徑（往後方斜上） */
    trailspur(c, s) {
      c.scale(s, s);
      c.beginPath();
      c.moveTo(-40, 40);
      c.quadraticCurveTo(-6, 10, 24, -14);
      c.lineTo(48, -12);
      c.quadraticCurveTo(22, 14, 22, 44);
      c.closePath();
      c.fillStyle = 'rgba(232,214,176,.95)';
      c.fill();
      c.strokeStyle = 'rgba(190,160,118,.5)';
      c.lineWidth = 1.5;
      c.stroke();
    },
    /* 海嘯警報器：鐵塔上的喇叭。it.on 時亮紅燈並發出聲波 */
    sirentower(c, s, t, it) {
      c.scale(s, s);
      const still = A.reducedMotion();
      line(c, -20, 0, -5, -150, '#8d97a8', 5);
      line(c, 20, 0, 5, -150, '#8d97a8', 5);
      [-40, -80, -118].forEach((y, i) => {
        const hw = 18 - i * 4.5;
        line(c, -hw, y, hw, y - 22, '#a3acbb', 3);
        line(c, hw, y, -hw, y - 22, '#a3acbb', 3);
      });
      box(c, -24, -8, 48, 8, 4, '#6f7a8c');
      box(c, -30, -158, 60, 10, 5, '#6f7a8c');
      /* 左右兩支喇叭與正面一支 */
      [-1, 1].forEach((dir) => {
        c.save();
        c.translate(dir * 10, -176);
        c.scale(dir, 1);
        c.beginPath();
        c.moveTo(0, -6);
        c.lineTo(26, -18);
        c.quadraticCurveTo(31, 0, 26, 18);
        c.lineTo(0, 6);
        c.closePath();
        c.fillStyle = '#f2c94c';
        c.fill();
        ell(c, 27, 0, 4, 17, '#d9a93a');
        if (it.on) {
          [18, 31, 44].forEach((r, i) => {
            c.beginPath();
            c.arc(30, 0, r, -0.62, 0.62);
            c.globalAlpha = still ? 0.6 : Math.max(0, 0.75 - frac(t * 0.9 + i * 0.33) * 0.75);
            A.stroke(c, '#e8785c', 3.5);
            c.globalAlpha = 1;
          });
        }
        c.restore();
      });
      box(c, -10, -194, 20, 36, 6, '#e8ebf0');
      ell(c, 0, -176, 8, 8, '#f2c94c');
      ell(c, 0, -176, 4, 4, '#d9a93a');
      /* 頂燈 */
      const blink = it.on ? (still ? 1 : 0.55 + Math.abs(Math.sin(t * 4)) * 0.45) : 0.35;
      c.globalAlpha = blink;
      ell(c, 0, -202, 8, 8, it.on ? '#ff6b5a' : '#c9a6a0');
      if (it.on) ell(c, 0, -202, 15, 15, 'rgba(255,107,90,.25)');
      c.globalAlpha = 1;
      box(c, -34, -142, 68, 22, 7, '#fffdf6');
      text(c, '海嘯警報', 0, -131, 13, '#a4471f', 800);
    },
    /* 海嘯標誌：藍底白色浪頭＋往高處的箭頭，下方小字牌 */
    tsunamisign(c, s, t, it) {
      c.scale(s, s);
      box(c, -5, -64, 10, 64, 3, '#7f8aa0');
      box(c, -46, -152, 92, 92, 14, '#fffdf6');
      box(c, -41, -147, 82, 82, 11, '#2f6fb5');
      /* 浪頭 */
      c.beginPath();
      c.moveTo(-34, -74);
      c.quadraticCurveTo(-34, -112, -4, -118);
      c.quadraticCurveTo(18, -121, 22, -104);
      c.quadraticCurveTo(10, -112, -2, -104);
      c.quadraticCurveTo(-12, -96, -6, -84);
      c.quadraticCurveTo(-1, -76, 8, -74);
      c.closePath();
      c.fillStyle = '#fff';
      c.fill();
      c.beginPath();
      c.moveTo(-36, -72);
      c.quadraticCurveTo(-26, -78, -16, -72);
      c.quadraticCurveTo(-6, -66, 4, -72);
      A.stroke(c, '#fff', 3.5);
      /* 往高處的箭頭與小山 */
      poly(c, [10, -70, 36, -70, 36, -98], 'rgba(255,255,255,.45)');
      c.beginPath();
      c.moveTo(12, -80);
      c.lineTo(28, -114);
      A.stroke(c, '#fff', 5);
      poly(c, [20, -120, 35, -128, 34, -110], '#fff');
      if (it.label) {
        box(c, -48, -58, 96, 22, 7, '#fffdf6');
        text(c, it.label, 0, -47, 13, '#2f6fb5', 800);
      }
    },
    /* 路面彩繪的撤離箭頭：角色踩在上面 */
    evacarrow(c, s, t, it) {
      c.scale(s, s);
      if (it.rot) c.rotate(it.rot);
      [-46, 0, 46].forEach((x, i) => {
        c.globalAlpha = 0.72 + i * 0.12;
        c.beginPath();
        c.moveTo(x - 16, -15);
        c.lineTo(x + 3, -15);
        c.lineTo(x + 22, 0);
        c.lineTo(x + 3, 15);
        c.lineTo(x - 16, 15);
        c.lineTo(x + 1, 0);
        c.closePath();
        c.fillStyle = it.color || '#4f9d78';
        c.fill();
        c.globalAlpha = 1;
      });
    },
    /* 坡地：v='a' 崩崖切破山脊的主崩塌；v='b' 較緩、植被多的長坡（mild＝只有裂縫與零星落石的災前狀態）。
       flip 左右翻轉，相鄰坡體輪廓與土層分布才不會重複 */
    slope(c, s, t, it) {
      const o = it || {};
      c.scale(s, s);
      if (o.flip) c.scale(-1, 1);
      const { rock, tree, log, tuft, spline, trace } = slopeKit(c);
      /* 沖蝕溝：寬窄不一（ws 逐點寬度），skip 內的區段斷開（被石塊、倒木、草叢遮住），一側受光的溝壁 */
      const gully = (raw, ws, skip) => {
        const per = 4;
        const pts = spline(raw, false, per);
        const n = pts.length;
        const wAt = (i) => {
          const f = (i / (n - 1)) * (ws.length - 1);
          const a = Math.floor(f);
          const b = Math.min(ws.length - 1, a + 1);
          return ws[a] + (ws[b] - ws[a]) * (f - a);
        };
        const nrm = (i) => {
          const a = pts[Math.min(n - 1, i + 1)];
          const b = pts[Math.max(0, i - 1)];
          const dx = a[0] - b[0], dy = a[1] - b[1];
          const len = Math.hypot(dx, dy) || 1;
          return [-dy / len, dx / len];
        };
        const seg = (i0, i1, k, dx, col) => {
          if (i1 - i0 < 1) return;
          const L = [], R = [];
          for (let i = i0; i <= i1; i++) {
            const [nx, ny] = nrm(i);
            const w = wAt(i) * k / 2;
            L.push([pts[i][0] + dx - nx * w, pts[i][1] - ny * w]);
            R.push([pts[i][0] + dx + nx * w, pts[i][1] + ny * w]);
          }
          c.beginPath();
          trace([...L, ...R.reverse()]);
          c.closePath();
          c.fillStyle = col;
          c.fill();
        };
        const cuts = (skip || []).map(([a, b]) => [Math.round(a * (n - 1)), Math.round(b * (n - 1))]);
        const runs = [];
        let start = 0;
        cuts.forEach(([a, b]) => { runs.push([start, a]); start = b; });
        runs.push([start, n - 1]);
        runs.forEach(([a, b]) => {
          seg(a, b, 1.25, -1.5, 'rgba(214,176,128,.55)');
          seg(a, b, 1, 0, '#7a5034');
          seg(a, b, 0.5, 1.2, 'rgba(92,62,40,.9)');
        });
      };
      const v = o.v || 'a';
      if (v === 'b') {
        /* 長緩坡：峰頂偏左，右肩長長拖下來；草木茂密，只在右肩一塊淺層滑動 */
        const HB = [[-292, 6], [-256, -62], [-214, -128], [-164, -182], [-116, -204], [-70, -200], [-24, -184], [30, -160], [86, -132], [146, -100], [204, -64], [252, -30], [292, 6]];
        const hb = () => {
          c.beginPath();
          trace(spline(HB, false, 5));
          c.closePath();
        };
        hb();
        c.fillStyle = '#93ad73';
        c.fill();
        [[-170, -150, 34, 12, -0.7, '#a6bd83'], [-110, -180, 26, 9, -0.2, '#86a166'], [-220, -70, 30, 10, -0.9, '#86a166'], [-60, -120, 40, 14, 0.2, '#a6bd83'], [60, -110, 30, 10, 0.4, '#86a166'],
          [-140, -60, 36, 12, -0.3, '#9fb87c'], [170, -50, 30, 9, 0.5, '#a6bd83']].forEach(([x, y, rx, ry, a, col]) => ell(c, x, y, rx, ry, col, a));
        if (o.mild) {
          /* 災前：坡頂張力裂縫、一棵微傾的樹、坡腳零星落石 */
          [[-96, -196, 16], [-60, -192, 12], [-30, -180, 10]].forEach(([x, y, w]) => {
            c.beginPath();
            c.moveTo(x - w / 2, y + 2);
            c.lineTo(x - w / 6, y + 5);
            c.lineTo(x + w / 6, y + 1);
            c.lineTo(x + w / 2, y + 4);
            A.stroke(c, 'rgba(96,70,48,.7)', 2.2);
          });
          tree(-180, -154, -0.05, 1);
          tree(-130, -196, 0.02, 0.95);
          tree(-40, -176, 0.22, 0.9);
          tree(40, -150, 0.03, 0.95);
          tree(120, -106, -0.04, 0.9);
          tree(-230, -86, 0.02, 0.85);
          [[60, -4, 7, 0.3], [84, 0, 5, -0.4], [-20, -2, 4, 0.2]].forEach(([x, y, r, a]) => rock(x, y, r, a));
          return;
        }
        c.save();
        hb();
        c.clip();
        const SB = [[34, -164], [62, -150], [92, -132], [118, -116], [128, -96], [140, -66], [162, -36], [196, -10], [236, 8], [96, 8], [72, -16], [58, -48], [52, -86], [40, -120], [30, -146]];
        c.save();
        c.beginPath();
        trace(spline(SB, true, 4));
        c.closePath();
        const gb = c.createLinearGradient(0, -164, 0, 8);
        gb.addColorStop(0, '#94693f');
        gb.addColorStop(1, '#b48c64');
        c.fillStyle = gb;
        c.fill();
        c.clip();
        /* 淺層滑動：冠部一道矮陡坎，下面只有順坡的流痕 */
        c.beginPath();
        trace([[28, -168], [64, -152], [96, -134], [122, -118], [120, -108], [94, -122], [62, -138], [34, -150]]);
        c.closePath();
        c.fillStyle = '#7a5236';
        c.fill();
        for (let i = 0; i < 6; i++) {
          const x0 = 48 + i * 16;
          c.beginPath();
          c.moveTo(x0, -130 + i * 6);
          c.quadraticCurveTo(x0 + 10, -70, x0 + 34 + i * 6, 6);
          A.stroke(c, i % 2 ? 'rgba(206,166,120,.4)' : 'rgba(120,84,52,.35)', 2 + (i % 2));
        }
        c.restore();
        c.restore();
        line(c, 32, -162, 120, -118, 'rgba(232,206,160,.8)', 2);
        gully([[78, -136], [84, -104], [100, -70], [128, -34], [160, -4]], [3, 6, 10, 8, 14], [[0.42, 0.52]]);
        tree(-200, -122, 0.02, 1.05);
        tree(-150, -176, -0.03, 0.95);
        tree(-96, -200, 0.02, 1);
        tree(-40, -186, 0.04, 0.9);
        tree(-230, -60, -0.02, 0.85);
        tree(4, -168, 0.05, 0.95);
        tree(150, -96, 0.05, 0.9);
        tree(196, -64, -0.03, 0.85);
        tree(110, -118, 0.62, 0.8);
        log(104, -62, 0.5, 34);
        [[70, -96, 6, 0.4], [116, -40, 8, -0.2], [86, -24, 5, 0.6]].forEach(([x, y, r, a]) => rock(x, y, r, a));
        c.beginPath();
        c.moveTo(70, 8);
        c.quadraticCurveTo(110, -12, 160, -10);
        c.quadraticCurveTo(210, -14, 262, 8);
        c.closePath();
        c.fillStyle = '#9c7048';
        c.fill();
        [[140, -6, 9, 0.4], [180, -4, 6, -0.3], [222, 0, 5, 0.2], [112, 0, 4, 0.5]].forEach(([x, y, r, a]) => rock(x, y, r, a));
        return;
      }
      /* v='a'：山脊完整；上坡處一道鋸齒狀崩崖（冠部）撕開草皮，露出深褐／赭／灰的分層土，冠部最暗。
         自崩崖往下一條長形流動舌順坡流到坡腳：表面是凹進坡面的槽（左內緣背光、右內緣受光；沒有圓頂高光、
         沒有整圈外框），泥、石塊、斷樹順著流線往下拖；坡腳攤成扇形堆積，掩埋一段溪溝與路緣，扇緣停著大石與倒樹 */
      const HA = [[-292, 6], [-250, -56], [-204, -112], [-152, -158], [-100, -194], [-48, -222], [4, -246], [56, -268], [104, -288], [144, -298], [180, -284], [210, -238], [240, -168], [266, -88], [292, 6]];
      const hillPath = () => {
        c.beginPath();
        trace(spline(HA, false, 5));
        c.closePath();
      };
      hillPath();
      c.fillStyle = '#8fa86f';
      c.fill();
      [[-160, -110, 40, 14, -0.6, '#a4bb80'], [-214, -50, 30, 10, -0.5, '#9db57a'], [222, -150, 18, 9, 1.1, '#a4bb80'], [238, -60, 24, 9, 0.9, '#7f9a62'],
        [-60, -186, 30, 8, -0.4, '#9db57a'], [-10, -226, 22, 7, -0.4, '#a4bb80'], [-244, -12, 22, 6, -0.3, '#7f9a62'], [10, -150, 34, 11, -0.5, '#9db57a'], [-20, -80, 36, 12, -0.4, '#a4bb80']].forEach(([x, y, rx, ry, a, col]) => ell(c, x, y, rx, ry, col, a));
      /* 冠部（左→右）：鋸齒狀撕裂口，約在山脊下方 40～50px，上面的綠色稜線完整保留；齒距、齒深不規則，
         齒頂是短平的斷塊（不是尖點），x≈100～128 留一處沒有齒的大缺口；左右兩側高低不對稱，縮圖才不會讀成兩座山峰夾一條溝 */
      const CROWN = [[28, -224], [40, -246], [52, -238], [60, -252], [76, -246], [86, -256], [94, -257], [100, -250], [128, -247], [142, -262], [150, -264], [158, -257], [172, -266], [184, -232]];
      /* 冠部的平滑基線：赭、灰兩層沿著它走，只有最上面的黑土層跟著鋸齒 */
      const CROWN_S = CROWN.map(([x, y]) => [x, -246 + (y + 246) * 0.3]);
      /* 流動舌兩側邊緣（上→下）：整條朝右下、朝溪溝流，滑移帶略寬；下段不收腰——左緣到 y≈-80 就不再往右走、直落到舌口，
         右緣順著走到溪邊，舌口寬度直接被堆積扇（頂緣藏在舌內 y≈-62～-70）接走、向兩側攤成扇 */
      const LEFT = [[28, -224], [34, -198], [42, -170], [52, -146], [68, -122], [84, -100], [98, -82], [106, -66], [112, -50]];
      const RIGHT = [[184, -232], [196, -206], [202, -182], [210, -156], [220, -132], [230, -108], [244, -88], [258, -64], [270, -40]];
      const BOTTOM = [[270, -40], [240, -50], [200, -56], [160, -56], [130, -54], [112, -50]];
      const Ls = spline(LEFT, false, 6);
      const Rs = spline(RIGHT, false, 6);
      /* 冠部→右緣→底緣→左緣（反向）接成單一封閉路徑：中間整片才會被填滿（分開 moveTo 只會填到邊緣細條） */
      const tonguePath = () => {
        c.beginPath();
        trace(CROWN);
        trace(Rs, true);
        trace(spline(BOTTOM, false, 3), true);
        trace([...Ls].reverse(), true);
        c.closePath();
      };
      /* 舌面上順坡的一條線：L 與 R 之間 f 比例處（0＝左緣、1＝右緣），從 u0 到 u1 */
      const flowLine = (f, u0, u1, col, w) => {
        const n = Math.min(Ls.length, Rs.length);
        c.beginPath();
        for (let i = Math.round(u0 * (n - 1)); i <= Math.round(u1 * (n - 1)); i++) {
          const x = Ls[i][0] + (Rs[i][0] - Ls[i][0]) * f;
          const y = Ls[i][1] + (Rs[i][1] - Ls[i][1]) * f;
          if (i === Math.round(u0 * (n - 1))) c.moveTo(x, y); else c.lineTo(x, y);
        }
        A.stroke(c, col, w);
      };
      /* 冠部下方的土層帶：沿鋸齒頂緣往下平移；seg 指定斷開的區段 */
      const layer = (d0, d1, segs, col, base) => {
        segs.forEach(([a, b]) => {
          const pts = (base || CROWN).slice(a, b + 1);
          c.beginPath();
          trace(pts.map(([x, y]) => [x, y + d0]));
          trace(pts.map(([x, y]) => [x, y + d1]).reverse(), true);
          c.closePath();
          c.fillStyle = col;
          c.fill();
        });
      };
      c.save();
      hillPath();
      c.clip();
      tonguePath();
      /* 由冠部深到流動段較淺：上段濕泥深褐，下段與坡腳堆積扇同色 */
      const gb = c.createLinearGradient(0, -250, 0, -36);
      gb.addColorStop(0, '#6a4830');
      gb.addColorStop(0.25, '#8a6342');
      gb.addColorStop(0.6, '#a0744b');
      gb.addColorStop(1, '#a67a50');
      c.fillStyle = gb;
      c.fill();
      c.save();
      c.clip();
      /* 凹槽：左內緣背光只在上中段（局部、往下淡出），右內緣受光分成兩截（下面那截在堆積扇頂緣之上就收掉，
         免得被扇面截成一道淺弧）；兩道都只在舌內、都不走完整條邊，所以不會合成一圈凸起的外框 */
      const Lsh = Ls.slice(0, Math.round(Ls.length * 0.6));
      c.beginPath();
      trace(Lsh);
      A.stroke(c, 'rgba(58,36,20,.18)', 28);
      c.beginPath();
      trace(Ls.slice(2, Math.round(Ls.length * 0.45)));
      A.stroke(c, 'rgba(58,36,20,.3)', 11);
      [[5, 18], [27, 36]].forEach(([a, b]) => {
        c.beginPath();
        trace(Rs.slice(a, b));
        A.stroke(c, 'rgba(240,214,170,.2)', 14);
        c.beginPath();
        trace(Rs.slice(a + 1, b - 1));
        A.stroke(c, 'rgba(240,214,170,.34)', 6);
      });
      /* 崩崖正下方的陰影：冠部最暗，往下很快淡掉 */
      const gx = c.createLinearGradient(0, -236, 0, -170);
      gx.addColorStop(0, 'rgba(40,24,12,.5)');
      gx.addColorStop(1, 'rgba(40,24,12,0)');
      c.fillStyle = gx;
      c.fillRect(16, -278, 182, 118);
      /* 順坡流線與拖曳痕：全部沿舌的走向往右下，明暗交錯、長短不一 */
      flowLine(0.22, 0.12, 0.96, 'rgba(236,206,160,.3)', 1.8);
      flowLine(0.36, 0.2, 1, 'rgba(70,44,26,.34)', 3);
      flowLine(0.5, 0.1, 0.9, 'rgba(236,206,160,.26)', 1.6);
      flowLine(0.62, 0.28, 1, 'rgba(70,44,26,.3)', 2.6);
      flowLine(0.78, 0.16, 0.86, 'rgba(236,206,160,.3)', 1.6);
      flowLine(0.44, 0.52, 1, 'rgba(70,44,26,.2)', 5);
      flowLine(0.7, 0.6, 1, 'rgba(236,206,160,.2)', 4);
      flowLine(0.3, 0.45, 0.8, 'rgba(70,44,26,.22)', 1.4);
      flowLine(0.88, 0.3, 0.7, 'rgba(70,44,26,.2)', 1.4);
      /* 分層土：深褐（最上、最暗）、赭、灰礫石；各自斷開一兩處，不是整條完整弧帶 */
      layer(0, 7, [[0, 4], [5, 13]], '#3f2816');
      layer(6, 13, [[0, 3], [5, 7], [9, 13]], '#a8763a', CROWN_S);
      layer(13, 19, [[0, 2], [6, 8], [10, 12]], '#8c8375', CROWN_S);
      /* 崩崖面上的細裂痕：短、斜，讀起來是撕開的土壁 */
      [[44, -238], [70, -244], [116, -242], [148, -258], [174, -244]].forEach(([x, y]) => line(c, x, y, x + 3, y + 18, 'rgba(50,30,16,.55)', 1.6));
      /* 舌面的石塊：順著流向散布，越往下越大；每顆上游側拖一道淺色拖痕 */
      [[76, -196, 4.5, 0.3], [128, -206, 4, -0.4], [148, -178, 4.5, 0.6], [66, -176, 4, -0.2], [118, -140, 6.5, -0.3], [176, -126, 5.5, -0.5],
        [160, -92, 7.5, 0.3], [224, -80, 6.5, -0.3], [204, -64, 9, 0.2], [238, -68, 7, 0.4]].forEach(([x, y, r, a]) => {
        line(c, x - 4, y - 12, x, y - r * 0.6, 'rgba(236,206,160,.35)', r * 0.6);
        rock(x, y, r, a, '#9a9384');
      });
      /* 被沖下來的樹與斷木：樹冠朝下坡、根朝上，和石塊一起順坡滑 */
      tree(108, -190, 2.55, 0.8);
      tree(166, -108, 2.45, 0.8, true);
      log(132, -150, 1.15, 28);
      log(192, -86, 1.05, 32);
      log(222, -74, 1.2, 24);
      c.restore();
      c.restore();
      /* 崩崖頂的草皮邊：細、順著鋸齒走；幾叢被拉鬆的草與半掛的草皮塊 */
      c.beginPath();
      trace(CROWN);
      A.stroke(c, '#76935a', 2.4);
      tuft(52, -236, 0.75, '#7f9a62');
      tuft(90, -256, 0.8, '#7f9a62');
      tuft(160, -258, 0.7, '#7f9a62');
      /* 半掛的草皮塊：缺口裡的那塊縮小，不再是一塊垂在中央的大綠 */
      [[60, -250, 6, 2.4, 0.5], [118, -247, 5, 2, -0.2], [150, -262, 5, 2.2, 0.5]].forEach(([x, y, rx, ry, a]) => {
        ell(c, x + 1, y + 7, rx, ry, 'rgba(60,36,20,.5)', a);
        ell(c, x, y + 5, rx, ry, '#8fa86f', a);
      });
      /* 兩側邊緣：草叢跨在邊線上壓住，邊緣鬆、沒有連續輪廓線 */
      [[34, -208, 9, 3.6, 0.6], [62, -136, 9, 3.6, 0.6], [102, -76, 10, 3.8, 0.6], [192, -212, 8, 3.2, -0.5], [216, -140, 9, 3.6, -0.6], [252, -72, 9, 3.6, -0.5]].forEach(([x, y, rx, ry, a]) => ell(c, x, y, rx, ry, '#8fa86f', a));
      tuft(44, -166, 0.7, '#7f9a62');
      tuft(88, -96, 0.7, '#7f9a62');
      tuft(198, -176, 0.65, '#7f9a62');
      tuft(226, -102, 0.7, '#7f9a62');
      /* 冠部後方的張力裂縫 */
      [[54, -262], [112, -270], [162, -280]].forEach(([x, y], i) => {
        c.save();
        c.translate(x, y);
        c.rotate([-0.2, 0.05, 0.4][i]);
        c.beginPath();
        c.moveTo(-8, 0);
        c.lineTo(-2, 3);
        c.lineTo(3, -1);
        c.lineTo(9, 2);
        A.stroke(c, 'rgba(96,70,48,.75)', 2);
        c.restore();
      });
      /* 樹：崩塌範圍外完好；貼著舌緣的幾棵被掏空根部、往槽裡傾斜 */
      tree(-170, -130, -0.04, 1);
      tree(-126, -168, 0.03, 0.9);
      tree(-222, -70, 0.02, 0.85);
      tree(-84, -192, 0.02, 0.85);
      tree(-30, -212, -0.02, 0.85);
      tree(-50, -130, -0.03, 0.85);
      tree(-60, -70, 0.02, 0.8);
      tree(8, -176, 0.02, 0.85);
      tree(26, -110, -0.03, 0.85);
      tree(2, -60, 0.03, 0.8);
      tree(34, -150, 0.46, 0.8);
      tree(86, -94, 0.4, 0.75);
      tree(206, -232, 0.03, 0.95);
      tree(216, -160, -0.42, 0.8);
      tree(238, -150, -0.03, 0.85);
      tree(236, -108, -0.36, 0.75);
      tree(60, -268, 0.02, 0.85);
      tree(110, -282, -0.02, 0.9);
      tree(150, -276, -0.03, 0.9);
      /* 坡腳堆積扇：見 debrisFan。creek 版由 creekcross 蓋在溪與橋頭上重畫完整的一片，這裡只先鋪同樣的底色 */
      const toCreek = !!o.creek;
      debrisFan(c, { rock, tree, log, spline, trace }, toCreek, toCreek);
    },

    /* 封閉的跨溪小橋：彎曲的溪溝裡有流水與大小卵石，橋面封閉、叉叉路障與警示牌 */
    creekcross(c, s, t, it) {
      c.scale(s, s);
      const still = A.reducedMotion();
      /* 溪的中線：往下彎、變寬 */
      const mid = (u) => -16 + 18 * Math.sin(u * 5.2 + 0.4) - 10 * u;
      const wid = (u) => 12 + 46 * u;
      const yAt = (u) => -152 + 158 * u;
      const N = 20;
      const fan = !!(it && it.fan);
      /* 有堆積扇時，左岸的卵石灘從交會處往下收窄到剩一點（那一段反正被扇面蓋掉；少一層材質疊在舌口上） */
      const bank = (dir, u) => (fan && dir < 0 ? Math.max(0.15, 1 - 3 * Math.max(0, u - 0.3)) : 1);
      const side = (dir, extra) => {
        const pts = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N;
          const k = bank(dir, u);
          const wob = extra ? (6 + 4 * Math.sin(u * 17 + dir * 2)) * (0.4 + u) * k : 0;
          pts.push([mid(u) + dir * (wid(u) / 2 + (extra || 0) * (0.5 + u) * k + wob), yAt(u)]);
        }
        return pts;
      };
      const ribbon = (extra, fill) => {
        const l = side(-1, extra);
        const r = side(1, extra).reverse();
        c.beginPath();
        [...l, ...r].forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
        c.closePath();
        c.fillStyle = fill;
        c.fill();
      };
      /* 河床（卵石灘）比水面寬，邊緣參差 */
      ribbon(fan ? 12 : 22, '#b5a68a');
      ribbon(0, '#7fb0c4');
      /* 水面：中間較淺的流心與流動的白色水紋 */
      c.beginPath();
      for (let i = 0; i <= N; i++) {
        const u = i / N;
        if (i) c.lineTo(mid(u) - 2, yAt(u));
        else c.moveTo(mid(u) - 2, yAt(u));
      }
      A.stroke(c, 'rgba(176,214,226,.8)', 4);
      for (let i = 0; i < 7; i++) {
        const u = frac(i * 0.37 + (still ? 0 : t * 0.22));
        const x = mid(u) + (i % 3 - 1) * wid(u) * 0.22;
        const y = yAt(u);
        c.beginPath();
        c.moveTo(x - 6 - u * 6, y);
        c.quadraticCurveTo(x, y + 3, x + 6 + u * 6, y);
        A.stroke(c, 'rgba(255,255,255,.75)', 2.2);
      }
      /* 卵石：沿兩岸大小不一；有堆積扇時交會處附近兩岸都不放（左岸被埋、右岸窄流要露出連續的水道） */
      for (let i = 0; i < 22; i++) {
        const u = 0.08 + frac(Math.sin(i * 12.9) * 77.3) * 0.9;
        const dir = i % 2 ? 1 : -1;
        if (fan && ((dir < 0 && u > 0.34) || (dir > 0 && u > 0.36 && u < 0.82))) continue;
        const off = wid(u) / 2 + 4 + frac(Math.sin(i * 7.7) * 51.1) * (12 + 14 * u);
        const r0 = 2.5 + frac(Math.sin(i * 3.3) * 91.9) * (3 + 4 * u);
        ell(c, mid(u) + dir * off, yAt(u), r0 * 1.3, r0 * 0.8, i % 3 ? '#9d9585' : '#c9c1ae');
      }
      (fan ? [[12, -8, 5]] : [[-4, -40, 6], [10, -10, 5], [-30, -14, 4]]).forEach(([x, y, r]) => {
        ell(c, x, y, r * 1.4, r * 0.8, '#8f897b');
        ell(c, x - 1, y - 2, r * 0.7, r * 0.3, '#c8c3b5');
      });
      if (it && it.fan) {
        /* 坡腳交會處：泥水從左岸灌入，交會處（舌口右緣碰到水的地方，u≈0.4）以下整段溪水轉成濁水，
           顏色由藍連續轉成偏橄欖的泥水色——和河床的灰米、堆積面的赭褐都拉開色相（綠灰對暖褐），明度居中，
           縮圖裡是一條獨立的色帶而不是和岸石合成一圈深框（上游仍是藍水）；
           堆積扇再把左半邊溪溝填掉，水只剩右岸一條窄流 */
        const muddy = (u) => Math.max(0, Math.min(1, (u - 0.38) / 0.12));
        c.beginPath();
        for (let i = 7; i <= N; i++) {
          const u = i / N;
          c[i === 7 ? 'moveTo' : 'lineTo'](mid(u) - wid(u) / 2 - 1, yAt(u));
        }
        for (let i = N; i >= 7; i--) {
          const u = i / N;
          c.lineTo(mid(u) - wid(u) / 2 + (wid(u) + 2) * (0.06 + 0.96 * muddy(u)), yAt(u));
        }
        c.closePath();
        const gm = c.createLinearGradient(0, yAt(0.38), 0, yAt(0.58));
        gm.addColorStop(0, '#7fb0c4');
        gm.addColorStop(0.45, '#789e92');
        gm.addColorStop(1, '#73897a');
        c.fillStyle = gm;
        c.fill();
        /* 濁流的流心與泡沫：一條較亮的卡其色流心從交會處一路接到橋下，是縮圖裡把窄流讀成「水」的主線；
           堆積扇把左岸六成寬填掉了，流心與泡沫都靠右岸那條窄水道走 */
        c.beginPath();
        for (let i = 9; i <= N; i++) {
          const u = i / N;
          c[i === 9 ? 'moveTo' : 'lineTo'](mid(u) + wid(u) * 0.3, yAt(u));
        }
        A.stroke(c, 'rgba(214,206,166,.85)', 4.5);
        for (let i = 0; i < 5; i++) {
          const u = 0.5 + frac(i * 0.41 + (still ? 0 : t * 0.22)) * 0.48;
          const x = mid(u) + wid(u) * (0.2 + (i % 3) * 0.1);
          const y = yAt(u);
          c.beginPath();
          c.moveTo(x - 4 - u * 4, y);
          c.quadraticCurveTo(x, y + 3, x + 4 + u * 4, y);
          A.stroke(c, 'rgba(236,228,208,.7)', 2);
        }
      }
      /* 有堆積扇時橋面壓低一點，扇面流進溪溝的地方不被橋擋住 */
      const BY = fan ? 16 : 0;
      box(c, -116, -58 + BY, 232, 18, 6, '#b98a60');
      for (let i = 0; i < 6; i++) box(c, -110 + i * 38, -56 + BY, 30, 14, 3, '#d2a579');
      /* 坡腳堆積扇那一側（左岸）不放叉叉，交接處保持看得見 */
      (fan ? [82] : [-82, 82]).forEach((x) => {
        line(c, x - 18, -86 + BY, x + 18, -38 + BY, '#e5684d', 8);
        line(c, x + 18, -86 + BY, x - 18, -38 + BY, '#e5684d', 8);
      });
      if (fan) {
        /* 掩埋關係：坡腳堆積扇（與 slope 同一片、同一套座標）蓋過溪溝左岸、橋頭與橋下一段溪床，橋面只剩右半截露出來，
           水被擠成右岸一條窄流。it.slope＝相鄰 slope 物件相對本物件的世界座標偏移與縮放（scenes.js 給；預設值對應土石流場景） */
        const SL = (it && it.slope) || { x: -245, y: -22, s: 0.92 };
        c.save();
        c.translate(SL.x / s, SL.y / s);
        c.scale(SL.s / s, SL.s / s);
        debrisFan(c, slopeKit(c), true, false);
        c.restore();
      }
      /* 告示牌立在右岸路邊（橋頭外側），不擋坡面→沖溝→溪溝的交接 */
      const SX = fan ? 104 : 0;
      const SY = fan ? 56 : 0;
      ell(c, SX, -50 + SY + 4, 16, 4, 'rgba(70,60,40,.22)');
      box(c, SX - 5, -106 + SY, 10, 58, 3, '#7a6a58');
      box(c, SX - 66, -164 + SY, 132, 60, 13, '#ffd34f');
      rr(c, SX - 66, -164 + SY, 132, 60, 13);
      c.strokeStyle = '#a4471f';
      c.lineWidth = 3.5;
      c.stroke();
      text(c, '跨溪路段', SX, -146 + SY, 18, '#7a3a18', 800);
      text(c, '封閉', SX, -122 + SY, 20, '#b5322a', 800);
    },
    /* 高溫：遮蔭休息點 */
    shadespot(c, s) {
      c.scale(s, s);
      /* 棚下的柔和陰影：中間較深、往外漸淡，和曬到太陽的路面拉開差異 */
      c.save();
      c.scale(1, 0.2);
      const sh = c.createRadialGradient(0, 0, 10, 0, 0, 118);
      sh.addColorStop(0, 'rgba(60,96,104,.42)');
      sh.addColorStop(0.6, 'rgba(60,96,104,.26)');
      sh.addColorStop(1, 'rgba(60,96,104,0)');
      c.fillStyle = sh;
      c.fillRect(-120, -120, 240, 240);
      c.restore();
      const back = c.createLinearGradient(0, -100, 0, 0);
      back.addColorStop(0, 'rgba(60,96,104,.2)');
      back.addColorStop(1, 'rgba(60,96,104,.06)');
      c.beginPath();
      c.moveTo(-72, -98);
      c.quadraticCurveTo(0, -116, 72, -98);
      c.lineTo(72, 0);
      c.lineTo(-72, 0);
      c.closePath();
      c.fillStyle = back;
      c.fill();
      [-72, 72].forEach((x) => line(c, x, 0, x, -104, '#94694a', 7));
      c.beginPath();
      c.moveTo(-98, -96);
      c.quadraticCurveTo(0, -152, 98, -96);
      c.quadraticCurveTo(0, -112, -98, -96);
      c.closePath();
      c.fillStyle = '#6fb1a4';
      c.fill();
      box(c, -40, -24, 80, 7, 3, '#a4714c');
      box(c, -34, -24, 6, 24, 2, '#8a5a44');
      box(c, 28, -24, 6, 24, 2, '#8a5a44');
      box(c, -54, -92, 108, 26, 9, '#fff3d6');
      text(c, '遮蔭休息', 0, -79, 15, '#7a5b42', 800);
    },
    /* 高溫：路邊奉茶／飲水桌，藍色水桶與杯子，水滴圖示代替文字看板 */
    waterstation(c, s, t, it) {
      c.scale(s, s);
      if (it && it.mini) {
        /* 店門口的小水壺：附屬於店家，不再是一整張補水桌 */
        ell(c, 0, 0, 22, 4, 'rgba(70,90,80,.2)');
        box(c, -16, -24, 32, 6, 3, '#c98f5e');
        [-12, 9].forEach((x) => box(c, x, -18, 4, 18, 2, '#a4714c'));
        box(c, -12, -48, 18, 24, 6, '#8fd0e6');
        box(c, -12, -48, 18, 7, 4, '#b9e4f1');
        box(c, -6, -53, 7, 6, 2, '#5fa6c4');
        poly(c, [8, -34, 15, -34, 14, -25, 9, -25], '#fffdf6');
        return;
      }
      ell(c, 0, 0, 50, 8, 'rgba(70,90,80,.22)');
      box(c, -42, -40, 84, 9, 4, '#c98f5e');
      [-34, 30].forEach((x) => box(c, x, -32, 5, 32, 2, '#a4714c'));
      /* 水桶 */
      box(c, -28, -86, 34, 46, 10, '#8fd0e6');
      box(c, -28, -86, 34, 12, 8, '#b9e4f1');
      box(c, -16, -94, 10, 9, 3, '#5fa6c4');
      ell(c, -11, -60, 7, 9, 'rgba(255,255,255,.45)');
      box(c, 4, -54, 8, 5, 2, '#5fa6c4');
      /* 杯子 */
      [14, 26].forEach((x, i) => {
        poly(c, [x - 5, -54, x + 5, -54, x + 4, -41, x - 4, -41], i ? '#fffdf6' : '#ffe6c8');
      });
      /* 水滴小牌 */
      box(c, 18, -96, 4, 42, 2, '#94694a');
      ell(c, 20, -104, 15, 15, '#fffdf6');
      c.beginPath();
      c.moveTo(20, -115);
      c.quadraticCurveTo(29, -102, 26, -99);
      c.quadraticCurveTo(20, -92, 14, -99);
      c.quadraticCurveTo(11, -102, 20, -115);
      c.fillStyle = '#4fa7cf';
      c.fill();
      c.globalAlpha = 0.5 + Math.sin(t * 2) * 0.2;
      ell(c, -11, -98, 2, 2, '#fff');
      c.globalAlpha = 1;
    },
    /* 低溫：保暖提醒站（衣物與熱飲），外加室內通風提醒 */
    warmpost(c, s) {
      c.scale(s, s);
      box(c, -5, -62, 10, 62, 3, '#94694a');
      box(c, -62, -128, 124, 72, 13, '#e3eef6');
      rr(c, -62, -128, 124, 72, 13);
      c.strokeStyle = '#5f88ad';
      c.lineWidth = 3;
      c.stroke();
      text(c, '注意保暖', 0, -115, 15, '#3f6f96', 800);
      box(c, -48, -100, 40, 12, 6, '#e8605c');
      box(c, -22, -96, 10, 28, 4, '#d04f4b');
      box(c, 12, -90, 26, 24, 6, '#fffdf6');
      c.beginPath();
      c.arc(40, -78, 7, -1.3, 1.3);
      A.stroke(c, '#c9b89a', 3.5);
      c.beginPath();
      c.moveTo(22, -94);
      c.quadraticCurveTo(27, -98, 22, -103);
      A.stroke(c, '#fffdf6', 2.6);
    },
    /* 寒流：門口的保暖衣架（圍巾、毛帽、外套）與冒熱氣的保溫壺 */
    warmrack(c, s, t) {
      c.scale(s, s);
      const still = A.reducedMotion();
      line(c, -34, 0, -30, -96, '#94694a', 5);
      line(c, 34, 0, 30, -96, '#94694a', 5);
      line(c, -36, -94, 36, -94, '#94694a', 5);
      ell(c, 0, 2, 44, 5, 'rgba(70,80,100,.18)');
      /* 外套 */
      poly(c, [-24, -92, -10, -92, -6, -46, -30, -46], '#5f88ad');
      line(c, -18, -90, -18, -48, '#4a7396', 2);
      /* 圍巾 */
      box(c, -2, -94, 12, 52, 5, '#e8605c');
      box(c, -2, -50, 12, 8, 3, '#f3b0a8');
      line(c, -2, -70, 10, -70, '#f3b0a8', 2);
      /* 毛帽 */
      c.beginPath();
      c.arc(23, -80, 10, Math.PI, 0);
      c.closePath();
      c.fillStyle = '#f2c94c';
      c.fill();
      box(c, 12, -82, 22, 6, 3, '#d9a93a');
      ell(c, 23, -92, 4, 4, '#fffdf6');
      /* 保溫壺與熱氣 */
      box(c, 40, -26, 14, 26, 5, '#e8785c');
      box(c, 41, -32, 12, 7, 3, '#c9624a');
      [0, 1].forEach((i) => {
        const p = still ? 0.4 : frac(t * 0.6 + i * 0.5);
        c.globalAlpha = 0.75 * (1 - p);
        c.beginPath();
        c.moveTo(45 + i * 5, -36 - p * 18);
        c.quadraticCurveTo(50 + i * 5, -42 - p * 18, 45 + i * 5, -48 - p * 18);
        A.stroke(c, '#fffdf6', 2.4);
        c.globalAlpha = 1;
      });
    },
    /* 核與輻射：大型應變廣播站 */
    responsepost(c, s, t, it) {
      c.scale(s, s);
      box(c, -8, -150, 16, 150, 4, '#7f8aa0');
      box(c, -24, -8, 48, 8, 4, '#6f7a8c');
      if (it && it.rad) {
        /* 掛在廣播柱上的小輻射牌：次要訊息附著在設備上，不另立看板 */
        box(c, -19, -48, 38, 34, 8, '#ffdb70');
        rr(c, -19, -48, 38, 34, 8);
        c.strokeStyle = '#7a5b42';
        c.lineWidth = 2;
        c.stroke();
        for (let i = 0; i < 3; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
          c.beginPath();
          c.arc(0, -31, 11, a - 0.52, a + 0.52);
          c.arc(0, -31, 4, a + 0.52, a - 0.52, true);
          c.closePath();
          c.fillStyle = '#4d4037';
          c.fill();
        }
        ell(c, 0, -31, 2.4, 2.4, '#4d4037');
      }
      box(c, -72, -116, 144, 62, 13, '#fff3d6');
      rr(c, -72, -116, 144, 62, 13);
      c.strokeStyle = '#a4714c';
      c.lineWidth = 3.5;
      c.stroke();
      text(c, '應變廣播', 0, -98, 19, '#7a5b42', 800);
      text(c, '聽公告行動', 0, -72, 14, '#a4471f', 800);
      [-1, 1].forEach((dir) => {
        c.save();
        c.translate(dir * 8, -150);
        c.scale(dir, 1);
        c.beginPath();
        c.moveTo(0, -7);
        c.lineTo(30, -24);
        c.quadraticCurveTo(36, -8, 30, 8);
        c.lineTo(0, 7);
        c.closePath();
        c.fillStyle = '#e8905c';
        c.fill();
        [20, 32].forEach((r, i) => {
          c.beginPath();
          c.arc(32, -8, r, -0.7, 0.7);
          c.globalAlpha = A.reducedMotion() ? 0.7 : 0.55 + Math.sin(t * 2.4 + i) * 0.3;
          A.stroke(c, '#e8905c', 3.5);
          c.globalAlpha = 1;
        });
        c.restore();
      });
    },
    /* 輻射警示牌：圓角、低彩度，只用來標示主題 */
    radsign(c, s) {
      c.scale(s, s);
      box(c, -5, -46, 10, 46, 3, '#94694a');
      box(c, -40, -118, 80, 76, 16, '#ffdb70');
      rr(c, -40, -118, 80, 76, 16);
      c.strokeStyle = '#7a5b42';
      c.lineWidth = 3;
      c.stroke();
      const cy = -80;
      for (let i = 0; i < 3; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 3;
        c.beginPath();
        c.arc(0, cy, 25, a - 0.52, a + 0.52);
        c.arc(0, cy, 9, a + 0.52, a - 0.52, true);
        c.closePath();
        c.fillStyle = '#4d4037';
        c.fill();
      }
      ell(c, 0, cy, 5.5, 5.5, '#4d4037');
    },
    /* 室內掩蔽圖示：進屋、關窗、聽廣播。圖示先讀，文字只當小註解 */
    shelterboard(c, s) {
      c.scale(s, s);
      box(c, -5, -52, 10, 52, 3, '#94694a');
      box(c, -72, -132, 144, 84, 14, '#e6f2e4');
      rr(c, -72, -132, 144, 84, 14);
      c.strokeStyle = '#4f9d78';
      c.lineWidth = 3;
      c.stroke();
      /* 進屋 */
      c.beginPath();
      c.moveTo(-67, -94);
      c.lineTo(-45, -122);
      c.lineTo(-23, -94);
      c.closePath();
      c.fillStyle = '#e0795e';
      c.fill();
      box(c, -62, -96, 34, 25, 3, '#fff3d6');
      box(c, -51, -90, 12, 19, 2, '#a4714c');
      /* 關窗 */
      box(c, -17, -120, 34, 49, 4, '#fff3d6');
      rr(c, -17, -120, 34, 49, 4);
      c.strokeStyle = '#7a5b42';
      c.lineWidth = 2.5;
      c.stroke();
      shutters(c, -12, -115, 24, 39);
      /* 聽廣播 */
      box(c, 24, -108, 42, 37, 7, '#4f9d78');
      ell(c, 36, -89, 9, 9, '#e6f2e4');
      ell(c, 36, -89, 3.8, 3.8, '#2f6e50');
      box(c, 50, -99, 11, 4, 2, '#e6f2e4');
      box(c, 50, -91, 11, 4, 2, '#e6f2e4');
      box(c, 50, -83, 11, 4, 2, '#e6f2e4');
      line(c, 32, -108, 56, -124, '#4f9d78', 3.5);
      text(c, '進屋', -45, -60, 12, '#2f6e50', 800);
      text(c, '關窗', 0, -60, 12, '#2f6e50', 800);
      text(c, '聽廣播', 45, -60, 12, '#2f6e50', 800);
    },
    /* 停電：熄滅的號誌 */
    deadsignal(c, s) {
      c.scale(s, s);
      box(c, -5, -128, 10, 128, 3, '#5d6476');
      box(c, -20, -178, 40, 76, 11, '#3f4656');
      [-162, -140, -118].forEach((y) => {
        ell(c, 0, y, 9, 9, '#59607a');
        ell(c, -3, y - 3, 2.6, 2.6, 'rgba(255,255,255,.28)');
      });
      box(c, 8, -98, 74, 26, 8, '#fff3d6');
      text(c, '號誌熄滅', 45, -85, 13, '#7a5b42', 800);
    },
    /* 停電：有電的應急燈箱 */
    emergencylight(c, s) {
      c.scale(s, s);
      const g = c.createRadialGradient(0, -90, 4, 0, -80, 86);
      g.addColorStop(0, 'rgba(255,236,160,.72)');
      g.addColorStop(1, 'rgba(255,226,140,0)');
      c.fillStyle = g;
      c.fillRect(-90, -170, 180, 176);
      box(c, -4, -70, 8, 70, 3, '#7f8aa0');
      box(c, -40, -104, 80, 38, 9, '#f4f2ea');
      [-20, 20].forEach((x) => {
        ell(c, x, -85, 13, 13, '#ffe9a0');
        ell(c, x, -85, 7, 7, '#fff9dc');
      });
      box(c, -32, -66, 64, 20, 6, '#4f9d78');
      text(c, '應急燈', 0, -56, 12.5, '#fff', 800);
    },
    /* 豪雨：貼在路邊的水深尺 */
    depthpole(c, s, t, it) {
      c.scale(s, s);
      box(c, -11, -116, 22, 116, 5, '#fffdf6');
      rr(c, -11, -116, 22, 116, 5);
      c.strokeStyle = '#6a7f78';
      c.lineWidth = 2.5;
      c.stroke();
      [['#5bbf7a', 0], ['#f2c94c', 1], ['#f2994a', 2], ['#e5484d', 3]].forEach(([col, i]) => box(c, -8, -24 - i * 28, 16, 22, 3, col));
      box(c, 14, -86, 62, 24, 8, '#fff3d6');
      text(c, '水深注意', 45, -74, 12.5, '#7a5b42', 800);
      box(c, -18, -5, 36, 6, 3, '#6f7a8c');
      if (it.level) line(c, -20, -it.level, 20, -it.level, '#2f7fb9', 4);
    },
    fan(c, s, t) {
      c.scale(s, s);
      line(c, 0, 0, 0, -44, '#7f8aa0', 5);
      box(c, -16, -5, 32, 6, 3, '#7f8aa0');
      c.save();
      c.translate(0, -56);
      ell(c, 0, 0, 20, 20, '#e7f3f7');
      c.rotate(t * 6);
      for (let i = 0; i < 3; i++) {
        c.rotate((Math.PI * 2) / 3);
        ell(c, 0, -10, 5.5, 9.5, '#8fd0e6');
      }
      c.restore();
    },
  };
  /* 地面上的平面物件：畫在其他物件之前，角色踩在上面 */
  A.flatDecor = new Set(['puddle', 'drain', 'crack', 'evacarrow', 'trailspur']);

  decor.crack = function crack(c, s, t, it) {
    c.scale(s, s);
    const sway = it.h * 20 - 10;
    c.beginPath();
    c.moveTo(-34, 0);
    c.lineTo(-18, 7);
    c.lineTo(-8 + sway * 0.2, -3);
    c.lineTo(8, 8);
    c.lineTo(20 + sway * 0.2, 0);
    c.lineTo(36, 6);
    A.stroke(c, 'rgba(95,75,62,.68)', 3.4);
    c.beginPath();
    c.moveTo(8, 8);
    c.lineTo(12, 22);
    c.moveTo(-18, 7);
    c.lineTo(-22, 16);
    A.stroke(c, 'rgba(95,75,62,.5)', 2.4);
  };

  A.decor = decor;
})();
