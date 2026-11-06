/* 所有角色、動物、場景物件與結局插圖，全部用 Canvas 程式繪製。座標原點在腳底。 */
(function () {
  const DH = (window.DH = window.DH || {});
  const TAU = Math.PI * 2;
  /* Canvas 與 DOM 共用 style.css 的 --font，兩邊不會各自漂移 */
  const FONT = getComputedStyle(document.documentElement).getPropertyValue('--font').trim() || 'sans-serif';
  const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const reducedMotion = () => motionQuery.matches;
  const frac = (v) => v - Math.floor(v);

  function rr(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function ell(c, x, y, rx, ry, color, rot) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    if (color) { c.fillStyle = color; c.fill(); }
  }
  function box(c, x, y, w, h, r, color) {
    rr(c, x, y, w, h, r);
    c.fillStyle = color;
    c.fill();
  }
  function line(c, x1, y1, x2, y2, color, width) {
    c.beginPath();
    c.moveTo(x1, y1);
    c.lineTo(x2, y2);
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.stroke();
  }
  function poly(c, pts, color) {
    c.beginPath();
    c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.closePath();
    c.fillStyle = color;
    c.fill();
  }
  function text(c, str, x, y, size, color, weight) {
    c.font = `${weight || 700} ${size}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = color;
    c.fillText(str, x, y);
  }
  function shadow(c, rx, ry) {
    ell(c, 0, 1, rx, ry, 'rgba(60,50,40,.17)');
  }
  function drop(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y - 5 * s);
    c.quadraticCurveTo(x + 4.4 * s, y + 1 * s, x, y + 3.6 * s);
    c.quadraticCurveTo(x - 4.4 * s, y + 1 * s, x, y - 5 * s);
    c.fillStyle = '#8fd3f4';
    c.fill();
  }

  const HERO_COLORS = {
    jacket: '#f59e6c', jacketDark: '#dd8353', pants: '#55637a', boots: '#8a5a3b',
    pack: '#4fb3a5', packDark: '#3c978b', roll: '#fbeed2', hat: '#f4c76b', hatBand: '#e8785c',
    skin: '#ffe0c2', hair: '#5a3d2b',
  };
  const RAINCOAT = { jacket: '#ffd34f', jacketDark: '#e6b52e' };
  const COAT = { jacket: '#6f95b8', jacketDark: '#577ca0' };
  const RESCUE = { jacket: '#e8605c', jacketDark: '#c94d4a', pants: '#4a5468', hat: '#fffdf6', hatBand: '#e8605c', pack: '#f4c76b', packDark: '#d8a94c', hair: '#3a2c24' };

  function heroFace(c, risk, pose, t, o) {
    const seed = o.blinkSeed || 0;
    const period = 3.1 + frac(seed * 0.73) * 1.8;
    const blink = !reducedMotion() && (t + seed) % period < 0.12;
    const worried = risk >= 60;
    [1, 19].forEach((ex) => {
      if (blink || pose === 'cheer') {
        c.beginPath();
        if (pose === 'cheer') c.arc(ex, 3, 5, Math.PI * 1.15, Math.PI * 1.85);
        else { c.moveTo(ex - 5, 2); c.lineTo(ex + 5, 2); }
        c.strokeStyle = '#3a3028';
        c.lineWidth = 2.4;
        c.lineCap = 'round';
        c.stroke();
        return;
      }
      ell(c, ex, 2, 5.4, 7, '#3a3028');
      ell(c, ex + 1.6, -0.8, 2.1, 2.5, '#fff');
      if (o.detail) ell(c, ex - 1.5, 4.8, 1, 1.2, 'rgba(255,255,255,.75)');
    });
    if (worried) {
      line(c, -5, -8, 2, -10.5, '#5a3d2b', 2);
      line(c, 25, -8, 18, -10.5, '#5a3d2b', 2);
    }
    ell(c, -8, 11, 6, 3.7, 'rgba(255,135,135,.55)');
    ell(c, 25, 11, 5, 3.7, 'rgba(255,135,135,.55)');

    c.beginPath();
    c.strokeStyle = '#7a3e32';
    c.lineWidth = 2;
    c.lineCap = 'round';
    if (pose === 'cheer') {
      c.moveTo(4, 10);
      c.quadraticCurveTo(10, 21, 16, 10);
      c.closePath();
      c.fillStyle = '#e8605c';
      c.fill();
    } else if (pose === 'stumble') {
      ell(c, 10, 13, 3.2, 4, '#7a3e32');
    } else if (worried) {
      c.moveTo(5, 15);
      c.quadraticCurveTo(7.5, 11, 10, 14);
      c.quadraticCurveTo(12.5, 17, 15, 13);
      c.stroke();
    } else if (risk >= 35) {
      c.moveTo(6, 13.5);
      c.lineTo(14, 13.5);
      c.stroke();
    } else {
      c.moveTo(5, 11);
      c.quadraticCurveTo(10, 17, 15, 11);
      c.stroke();
    }
  }

  /* 主角帽子上的小愛心徽章 */
  function hatBadge(c, x, y) {
    ell(c, x, y, 7.4, 7.4, '#fffdf6');
    ell(c, x - 2.2, y - 1.2, 2.7, 2.7, '#e8785c');
    ell(c, x + 2.2, y - 1.2, 2.7, 2.7, '#e8785c');
    poly(c, [x - 4.7, y - 0.2, x + 4.7, y - 0.2, x, y + 4.8], '#e8785c');
  }

  /* gear：helmet 安全帽、raincoat 雨衣、mask 口罩、scarf 圍巾、light 手電筒、sunhat 遮陽帽。
     預設的小圓帽是這個系列的角色識別。 */
  function drawHero(c, x, y, o) {
    const t = o.t || 0;
    const s = o.scale || 1;
    const risk = o.risk || 0;
    const phase = o.phase || 0;
    const mv = o.moving ? 1 : 0;
    const pose = o.pose || 'idle';
    const jump = o.jump || 0;
    const gear = o.gear || {};
    const col = Object.assign({}, HERO_COLORS, o.colors, gear.raincoat ? RAINCOAT : null, gear.coat ? (gear.coatCol || COAT) : null);
    /* 螢幕上太小時，細線只會糊成一團，直接省略 */
    const detail = s * (DH.art.viewZ || 1) >= 0.82;

    c.save();
    c.translate(x, y);
    c.scale(s, s);
    shadow(c, 30 * (1 - Math.min(jump, 60) / 150), 7);
    c.translate(0, -jump);
    c.scale(o.dir || 1, 1);
    if (pose === 'stumble') c.rotate(reducedMotion() ? -0.05 : Math.sin(t * 22) * 0.07 - 0.05);
    /* 走路時身體往行進方向傾，一眼看得出朝向 */
    if (mv) c.rotate(0.075);

    const swing = Math.sin(phase) * mv;
    const lift = Math.cos(phase) * mv;
    const bob = mv ? Math.abs(Math.cos(phase)) * 3 : Math.sin(t * 2.1) * 0.9;

    /* 防災背包：往身體後方挪，和背帶之間留出間隙 */
    if (!o.noPack) {
      box(c, -36, -54 - bob, 21, 33, 8, col.pack);
      box(c, -34, -38 - bob, 13, 13, 4, col.packDark);
      box(c, -36, -62 - bob, 20, 10, 5, col.roll);
      if (detail) {
        box(c, -28.5, -50 - bob, 6, 2, 1, '#fffdf6');
        box(c, -26.5, -52 - bob, 2, 6, 1, '#fffdf6');
      }
    }

    /* 腿與鞋：側身大步，後腳較暗 */
    [
      { fx: -3 - swing * 16, ly: Math.max(0, -lift) * 8, shade: 0.8 },
      { fx: 4 + swing * 16, ly: Math.max(0, lift) * 8, shade: 1 },
    ].forEach((l) => {
      c.globalAlpha = l.shade;
      line(c, l.fx * 0.3, -22 - bob, l.fx, -5 - l.ly, col.pants, 9.5);
      box(c, l.fx - 6.5, -8 - l.ly, 17, 8, 4, gear.raincoat ? '#5fa6c4' : col.boots);
      c.globalAlpha = 1;
    });

    /* 身體 */
    box(c, -17, -48 - bob, 34, gear.raincoat ? 34 : 30, 12, col.jacket);
    box(c, -17, gear.raincoat ? -24 - bob : -28 - bob, 34, 7, 3, col.jacketDark);
    if (!o.noPack) line(c, -8, -46 - bob, -6, -25 - bob, col.packDark, 3);

    /* 厚外套：肩膀與下襬都鼓一點，再加一排扣子 */
    if (gear.coat) {
      box(c, -21, -49 - bob, 42, 36, 14, col.jacket);
      box(c, -21, -21 - bob, 42, 8, 4, col.jacketDark);
      [-40, -32, -24].forEach((y) => ell(c, 3, y - bob, 1.9, 1.9, '#e7eef4'));
    }

    /* 手 */
    const shoulderY = -42 - bob;
    if (pose === 'cheer') {
      line(c, -13, shoulderY, -23, shoulderY - 25, col.jacketDark, 7.5);
      line(c, 13, shoulderY, 24, shoulderY - 25, col.jacketDark, 7.5);
      ell(c, -23, shoulderY - 27, 4.6, 4.6, col.skin);
      ell(c, 24, shoulderY - 27, 4.6, 4.6, col.skin);
    } else if (pose === 'wave') {
      const wv = reducedMotion() ? 0 : Math.sin(t * 14) * 5;
      line(c, 13, shoulderY, 26 + wv, shoulderY - 25, col.jacketDark, 7.5);
      ell(c, 26 + wv, shoulderY - 28, 4.8, 4.8, col.skin);
    } else if (gear.light) {
      /* 手電筒往前照，暖色光錐要夠淡才不搶事件標記 */
      const hx = 27;
      const hy = -38 - bob;
      c.beginPath();
      c.moveTo(hx + 10, hy - 3);
      c.lineTo(hx + 96, hy - 26);
      c.quadraticCurveTo(hx + 106, hy + 2, hx + 96, hy + 28);
      c.lineTo(hx + 10, hy + 3);
      c.closePath();
      c.fillStyle = 'rgba(255,236,160,.34)';
      c.fill();
      line(c, 13, shoulderY, hx - 1, hy, col.jacketDark, 7.5);
      box(c, hx - 2, hy - 4, 14, 8, 2.5, '#4a5468');
      box(c, hx + 10, hy - 5.5, 4, 11, 1.5, '#ffe9a0');
      ell(c, hx - 1, hy, 4.2, 4.2, col.skin);
    } else {
      const hx = 24 + swing * 7;
      const hy = -28 - bob;
      line(c, 13, shoulderY, hx - 1, hy, col.jacketDark, 7.5);
      ell(c, hx - 1, hy, 4.2, 4.2, col.skin);
    }

    /* 頭 */
    c.save();
    c.translate(2 + mv * 3, -67 - bob);
    if (o.headTilt) c.rotate(o.headTilt);
    ell(c, -21, 0, 13, 16, col.hair);
    ell(c, 2, 0, 30, 27, col.skin);
    ell(c, -22, 4, 5, 6, '#ffd2ad');
    c.beginPath();
    c.moveTo(-27, -7);
    c.quadraticCurveTo(-4, -22, 28, -9);
    c.quadraticCurveTo(16, -3, 8, -9);
    c.quadraticCurveTo(-8, -4, -27, -7);
    c.fillStyle = col.hair;
    c.fill();
    c.save();
    c.translate(mv * 2.5, 0);
    heroFace(c, risk, pose, t, { detail, blinkSeed: o.blinkSeed });
    if (gear.mask) {
      box(c, -3, 6, 26, 15, 6, '#fdfdfb');
      line(c, -3, 11, 23, 11, 'rgba(120,150,170,.45)', 1.2);
      line(c, -3, 15.5, 23, 15.5, 'rgba(120,150,170,.45)', 1.2);
      line(c, -3, 9, -17, 4, 'rgba(255,255,255,.9)', 1.4);
    }
    c.restore();
    if (gear.helmet || o.helmet) {
      /* 安全帽 */
      c.beginPath();
      c.moveTo(-28, -11);
      c.quadraticCurveTo(-26, -36, 2, -36);
      c.quadraticCurveTo(30, -36, 32, -11);
      c.closePath();
      c.fillStyle = o.helmet ? col.hat : '#ffd34f';
      c.fill();
      box(c, -30, -15, 64, 6, 3, o.helmet ? col.hatBand : '#e6b52e');
      if (o.helmet) {
        box(c, 7, -31, 12, 4, 1.5, col.hatBand);
        box(c, 11, -35, 4, 12, 1.5, col.hatBand);
      } else {
        box(c, -3, -36, 10, 22, 4, '#ffe07f');
      }
    } else if (gear.raincoat) {
      /* 雨衣帽 */
      c.beginPath();
      c.moveTo(-31, 6);
      c.quadraticCurveTo(-36, -34, 2, -34);
      c.quadraticCurveTo(36, -34, 33, -8);
      c.quadraticCurveTo(10, -22, -14, -12);
      c.quadraticCurveTo(-23, -6, -22, 8);
      c.closePath();
      c.fillStyle = col.jacket;
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(-23, -14);
      c.quadraticCurveTo(-22, -39, 2, -39);
      c.quadraticCurveTo(26, -39, 27, -14);
      c.closePath();
      c.fillStyle = col.hat;
      c.fill();
      ell(c, 2, -14, gear.sunhat ? 45 : 39, gear.sunhat ? 9.5 : 8.5, col.hat, -0.03);
      ell(c, 2, -16, 25, 5, 'rgba(180,120,50,.17)');
      box(c, -23, -24, 50, 7, 3, col.hatBand);
      if (!o.colors) hatBadge(c, 15, -23);
    }
    if (risk >= 80 && !gear.mask) {
      [-2, 6, 14].forEach((lx) => line(c, lx, -8, lx, -3, 'rgba(90,120,190,.55)', 1.6));
    }
    c.restore();

    if (gear.scarf) {
      const sc = gear.scarfCol || ['#e8605c', '#d04f4b'];
      box(c, -16, -47 - bob, 34, 9, 4.5, sc[0]);
      box(c, -14, -42 - bob, 8, 16, 3.5, sc[1]);
    }

    /* 汗 */
    if (risk >= 50) {
      const n = risk >= 80 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const p = (t * 0.9 + i / n) % 1;
        c.globalAlpha = 1 - p;
        drop(c, -30 + i * 7 + (i === 2 ? 66 : 0), -96 - bob + p * 26, 1.05);
        c.globalAlpha = 1;
      }
    }
    c.restore();
  }

  /* 社區裡的貓狗：只負責可愛與講一句話 */
  const pets = {
    cat(c, t, color) {
      const col = color || '#f2b36f';
      const tail = Math.sin(t * 1.8) * 5;
      shadow(c, 20, 5);
      c.beginPath();
      c.moveTo(-14, -8);
      c.quadraticCurveTo(-30, -12, -28 + tail, -32);
      c.strokeStyle = col;
      c.lineWidth = 6;
      c.lineCap = 'round';
      c.stroke();
      ell(c, -2, -14, 17, 13, col);
      poly(c, [4, -40, 8, -54, 15, -43], col);
      poly(c, [21, -43, 28, -54, 32, -40], col);
      ell(c, 18, -32, 16, 14, col);
      ell(c, 12, -33, 2.3, 3, '#3a3028');
      ell(c, 24, -33, 2.3, 3, '#3a3028');
      ell(c, 18, -27, 3.4, 2.2, '#fbe3cf');
      ell(c, 18, -28.5, 1.4, 1, '#c9665f');
    },
    dog(c, t, color) {
      const col = color || '#e9d3b0';
      const wag = Math.sin(t * 7) * 6;
      shadow(c, 24, 5);
      line(c, -22, -24, -30 + wag * 0.4, -38, col, 6);
      [-15, -6, 10, 18].forEach((lx) => line(c, lx, -16, lx, -2, col, 6));
      ell(c, 0, -24, 25, 14, col);
      ell(c, 20, -40, 16, 15, col);
      ell(c, 8, -40, 6, 12, '#b98f63', 0.25);
      ell(c, 22, -42, 2.5, 3.1, '#3a3028');
      ell(c, 31, -37, 3.2, 2.5, '#3a3028');
      c.beginPath();
      c.arc(26, -34, 4, 0.3, Math.PI - 0.4);
      c.strokeStyle = '#7a3e32';
      c.lineWidth = 1.6;
      c.stroke();
      box(c, -2, -33, 8, 19, 3, '#e8605c');
    },
  };
  function drawPet(c, kind, x, y, s, t, dir, color) {
    c.save();
    c.translate(x, y);
    c.scale(s * (dir || 1), s);
    pets[kind](c, t, color);
    c.restore();
  }

  function drawButterfly(c, x, y, s, t, color) {
    const flap = Math.abs(Math.sin(t * 13)) * 0.8 + 0.2;
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    [-1, 1].forEach((side) => {
      c.save();
      c.scale(side * flap, 1);
      ell(c, 5, -3, 5.5, 4.2, color, -0.5);
      ell(c, 4, 3, 3.6, 3, color, 0.5);
      ell(c, 5.4, -3, 2, 1.5, 'rgba(255,255,255,.75)', -0.5);
      c.restore();
    });
    line(c, 0, -4, 0, 4, '#4a3b34', 1.6);
    c.restore();
  }

  function drawFlower(c, x, y, r, color, rot) {
    c.save();
    c.translate(x, y);
    c.rotate(rot || 0);
    for (let i = 0; i < 5; i++) {
      c.rotate(TAU / 5);
      ell(c, r * 0.72, 0, r * 0.62, r * 0.42, color);
    }
    ell(c, 0, 0, r * 0.36, r * 0.36, '#ffd965');
    c.restore();
  }

  function speech(c, x, y, str) {
    c.font = `700 15px ${FONT}`;
    const w = c.measureText(str).width + 22;
    box(c, x - w / 2, y - 32, w, 28, 12, 'rgba(255,253,246,.96)');
    poly(c, [x - 7, y - 5, x + 7, y - 5, x, y + 3], 'rgba(255,253,246,.96)');
    text(c, str, x, y - 18, 15, '#5a4a3e');
  }

  /* 事件標記圖示：在半徑約 14 的圓內繪製 ---------------------------------- */
  const icons = {
    pack(c) {
      box(c, -8.5, -8, 17, 19, 6, '#4fb3a5');
      box(c, -5.5, 2, 11, 6.5, 2.5, '#3c978b');
      box(c, -7.5, -12, 15, 6, 3, '#f4c76b');
      line(c, -3.5, -1.5, 3.5, -1.5, '#fffdf6', 2);
    },
    drop(c) {
      c.beginPath();
      c.moveTo(0, -12.5);
      c.quadraticCurveTo(11.5, 1, 8, 7);
      c.quadraticCurveTo(0, 15, -8, 7);
      c.quadraticCurveTo(-11.5, 1, 0, -12.5);
      c.fillStyle = '#58b4e4';
      c.fill();
      ell(c, -3, 4, 2, 3.2, 'rgba(255,255,255,.8)', 0.3);
    },
    sign(c) {
      box(c, -1.8, -12, 3.6, 25, 1.6, '#94694a');
      poly(c, [-10, -10.5, 7, -10.5, 12, -6.2, 7, -2, -10, -2], '#c9884f');
      poly(c, [10, 0.5, -6, 0.5, -11, 4.6, -6, 8.6, 10, 8.6], '#e0a86c');
    },
    bolt(c) {
      c.beginPath();
      c.moveTo(3, -13);
      c.lineTo(-8, 2.5);
      c.lineTo(-0.5, 2.5);
      c.lineTo(-3.5, 13);
      c.lineTo(8.5, -3.5);
      c.lineTo(1, -3.5);
      c.closePath();
      c.lineJoin = 'round';
      c.lineWidth = 2;
      c.strokeStyle = '#efae27';
      c.fillStyle = '#efae27';
      c.fill();
      c.stroke();
    },
    medkit(c) {
      box(c, -4.5, -11, 9, 6, 2, '#a83f3a');
      box(c, -12, -7, 24, 18, 5, '#e2564f');
      box(c, -2.2, -3.5, 4.4, 11, 1.2, '#fffdf6');
      box(c, -5.5, -0.2, 11, 4.4, 1.2, '#fffdf6');
    },
    thermo(c) {
      box(c, -3.6, -13, 7.2, 19, 3.6, '#c9d6de');
      ell(c, 0, 7, 6.2, 6.2, '#c9d6de');
      box(c, -1.5, -5, 3, 12, 1.4, '#e2564f');
      ell(c, 0, 7, 4, 4, '#e2564f');
      line(c, 6, -9, 10, -9, '#a9b6be', 1.8);
      line(c, 6, -4, 10, -4, '#a9b6be', 1.8);
    },
    map(c) {
      poly(c, [-12, -8, -4, -11, 4, -8, 12, -11, 12, 8, 4, 11, -4, 8, -12, 11], '#a6d6ab');
      poly(c, [-4, -11, 4, -8, 4, 11, -4, 8], '#8cc596');
      line(c, -8, 5, -2, -1, '#d9604a', 1.8);
      line(c, -2, -1, 7, -3, '#d9604a', 1.8);
    },
    team(c) {
      ell(c, -6, -5.5, 4.8, 4.8, '#6d94c6');
      box(c, -12.5, 0, 13, 10, 5, '#6d94c6');
      ell(c, 6, -4, 5.4, 5.4, '#e8905c');
      box(c, -1, 2, 14, 10, 5, '#e8905c');
    },
    flashlight(c) {
      c.beginPath();
      c.moveTo(3, -4);
      c.lineTo(14, -11);
      c.quadraticCurveTo(17, -2, 14, 7);
      c.lineTo(3, 2);
      c.closePath();
      c.fillStyle = '#ffdf83';
      c.fill();
      box(c, -13, -4.5, 13, 9, 3, '#4a5468');
      box(c, -1.5, -6.5, 6, 13, 2, '#7f8aa0');
    },
    mask(c) {
      box(c, -11, -7.5, 22, 15, 6, '#bfe4f2');
      line(c, -10, -2.5, 10, -2.5, '#8fbfd2', 1.6);
      line(c, -10, 2.5, 10, 2.5, '#8fbfd2', 1.6);
      c.beginPath();
      c.arc(-12, 0, 5, Math.PI * 0.55, Math.PI * 1.45);
      c.moveTo(12, -4.7);
      c.arc(12, 0, 5, -Math.PI * 0.45, Math.PI * 0.45);
      c.strokeStyle = '#8fbfd2';
      c.lineWidth = 1.8;
      c.stroke();
    },
    radio(c) {
      box(c, -12, -5, 24, 16, 5, '#e8905c');
      ell(c, -4.5, 3, 4.6, 4.6, '#fff0dc');
      box(c, 3.5, -1.5, 6, 2.6, 1.2, '#fff0dc');
      box(c, 3.5, 3.5, 6, 2.6, 1.2, '#fff0dc');
      line(c, 6, -5, 12, -13, '#7f8aa0', 2);
    },
    helmet(c) {
      c.beginPath();
      c.moveTo(-12, 4);
      c.quadraticCurveTo(-11, -11, 0, -11);
      c.quadraticCurveTo(11, -11, 12, 4);
      c.closePath();
      c.fillStyle = '#ffd34f';
      c.fill();
      box(c, -14, 3, 28, 6, 3, '#e6b52e');
      box(c, -2.5, -11, 5, 14, 2.4, '#ffe9a3');
    },
    phone(c) {
      box(c, -7.5, -12.5, 15, 25, 4, '#55637a');
      box(c, -5.5, -9, 11, 15.5, 1.5, '#cfeaf7');
      ell(c, 0, 9.3, 1.7, 1.7, '#cfeaf7');
    },
    home(c) {
      poly(c, [-13, -1, 0, -12, 13, -1], '#e0795e');
      box(c, -9, -2, 18, 14, 3, '#f7e4c0');
      box(c, -3, 3, 6, 9, 1.5, '#a4714c');
    },
    car(c) {
      box(c, -13, -2, 26, 9, 4, '#6fbad2');
      c.beginPath();
      c.moveTo(-8, -2);
      c.quadraticCurveTo(-6, -9, 0, -9);
      c.quadraticCurveTo(7, -9, 9, -2);
      c.closePath();
      c.fillStyle = '#a9dcec';
      c.fill();
      ell(c, -7, 7.5, 3.5, 3.5, '#4a5468');
      ell(c, 7, 7.5, 3.5, 3.5, '#4a5468');
    },
    broom(c) {
      line(c, 7, -12, -2, 3, '#a4714c', 2.8);
      poly(c, [-3, 0, 2.5, 4, -3, 12, -11, 7], '#e6c15c');
    },
    plug(c) {
      box(c, -7.5, -5, 15, 11, 4, '#7f8aa0');
      line(c, -3.5, -9.5, -3.5, -5, '#55637a', 2.6);
      line(c, 3.5, -9.5, 3.5, -5, '#55637a', 2.6);
      line(c, 0, 6, 0, 12, '#55637a', 3);
    },
    food(c) {
      c.beginPath();
      c.arc(0, 0, 12, 0.05, Math.PI - 0.05);
      c.closePath();
      c.fillStyle = '#f0a35e';
      c.fill();
      ell(c, 0, -2, 9.5, 4.5, '#fff9e6');
      line(c, 4, -12, -3, -3, '#a4714c', 1.8);
      line(c, 8, -11, 0, -3, '#a4714c', 1.8);
    },
    alert(c) {
      c.beginPath();
      c.moveTo(0, -12);
      c.quadraticCurveTo(2, -12, 3, -10);
      c.lineTo(13, 8);
      c.quadraticCurveTo(14, 11, 11, 11);
      c.lineTo(-11, 11);
      c.quadraticCurveTo(-14, 11, -13, 8);
      c.lineTo(-3, -10);
      c.quadraticCurveTo(-2, -12, 0, -12);
      c.closePath();
      c.fillStyle = '#f4c34a';
      c.fill();
      box(c, -1.6, -5, 3.2, 9, 1.5, '#6a4f22');
      ell(c, 0, 7, 1.9, 1.9, '#6a4f22');
    },
    wave(c) {
      c.beginPath();
      c.moveTo(-13, 10);
      c.quadraticCurveTo(-10, -12, 7, -11);
      c.quadraticCurveTo(14, -10, 13, -4);
      c.quadraticCurveTo(4, -7, 2, 2);
      c.quadraticCurveTo(6, 8, 13, 10);
      c.closePath();
      c.fillStyle = '#58b4e4';
      c.fill();
    },
    book(c) {
      box(c, -12, -9, 12, 19, 2.5, '#6fbf9b');
      box(c, 0, -9, 12, 19, 2.5, '#8fd2b3');
      line(c, 3.5, -3, 8.5, -3, '#fffdf6', 1.8);
      line(c, 3.5, 2, 8.5, 2, '#fffdf6', 1.8);
    },
    wind(c) {
      c.beginPath();
      c.moveTo(-13, -4);
      c.lineTo(4, -4);
      c.quadraticCurveTo(10, -4, 9, -9);
      c.moveTo(-13, 2);
      c.lineTo(9, 2);
      c.quadraticCurveTo(14, 3, 12, 8);
      c.moveTo(-9, 8);
      c.lineTo(1, 8);
      c.strokeStyle = '#7aa5c9';
      c.lineWidth = 3;
      c.lineCap = 'round';
      c.stroke();
    },
  };
  /* 依題目分類選事件圖示；認不出來時依階段：災前背包、當下警示、災後掃把 */
  const ICON_RULES = [
    [/門窗|就地掩蔽|床上|居家固定|室內|家庭/, 'home'],
    [/潛勢|路線規劃|應變區域/, 'map'],
    [/水塔|儲水|飲水|取水|復水|節水|限水|水情|供水|補水|加壓/, 'drop'],
    [/避難包|準備|整備|備援|規劃|冷藏/, 'pack'],
    [/照明|停電|復電|手電/, 'flashlight'],
    [/口罩|空品|煙霧|沙塵|污染|清淨/, 'mask'],
    [/資訊|通報|通訊|警報|官方|預報|指標|燈號|分級|查證|判讀|特報/, 'radio'],
    [/餘震|就地掩護|建物|戶外避風|窗邊/, 'helmet'],
    [/急救|健康|醫療|中暑|熱衰竭|失溫|照護|敏感|兒童|幼兒|長者|輔具|碘片/, 'medkit'],
    [/高溫|低溫|取暖|一氧化碳|熱害/, 'thermo'],
    [/車輛|交通|船舶|行人|地下道/, 'car'],
    [/電器|電線|落線|用電|瓦斯|泡水|設備|電梯/, 'plug'],
    [/清理|消毒|二次|恢復|返家|災後|去污/, 'broom'],
    [/飲食|食物/, 'food'],
    [/疏散|撤離|避難|路線|方向|時機|海嘯/, 'sign'],
    [/電話|手機/, 'phone'],
    [/迷思|概念|輻射/, 'book'],
    [/前兆|異常|邊坡|堰塞|警戒/, 'alert'],
    [/強風|颱風|停班/, 'wind'],
  ];
  const STAGE_ICON = { before: 'pack', during: 'alert', after: 'broom' };
  function markerIcon(category, stage) {
    const hit = ICON_RULES.find(([re]) => re.test(category || ''));
    return hit ? hit[1] : (STAGE_ICON[stage] || 'alert');
  }

  /* 災害卡片圖示：在 100×100 的底圖上繪製，同色系圓底、簡潔圓潤 ------------------- */
  const stroke = (c, color, width) => {
    c.strokeStyle = color;
    c.lineWidth = width;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.stroke();
  };
  const hazardIcons = {
    earthquake(c) {
      c.save();
      c.translate(50, 60);
      c.rotate(-0.09);
      poly(c, [-28, -8, 0, -32, 28, -8], '#d9694e');
      box(c, -22, -10, 44, 34, 5, '#fff3d6');
      box(c, -7, 6, 14, 18, 3, '#a4714c');
      c.restore();
      c.beginPath();
      c.moveTo(12, 86);
      [[24, 78], [34, 88], [46, 78], [56, 88], [68, 78], [78, 88], [88, 80]].forEach(([x, y]) => c.lineTo(x, y));
      stroke(c, '#7a5238', 4.5);
      [[14, 42], [86, 42]].forEach(([x, y], i) => {
        c.beginPath();
        c.arc(x + (i ? -8 : 8), y, 10, i ? -0.8 : Math.PI - 0.8, i ? 0.8 : Math.PI + 0.8);
        stroke(c, '#fff3d6', 3.6);
      });
    },
    tsunami(c) {
      c.beginPath();
      c.moveTo(8, 82);
      c.quadraticCurveTo(14, 26, 58, 22);
      c.quadraticCurveTo(84, 20, 86, 40);
      c.quadraticCurveTo(66, 30, 56, 48);
      c.quadraticCurveTo(52, 66, 92, 82);
      c.closePath();
      c.fillStyle = '#fffdf6';
      c.fill();
      c.beginPath();
      c.moveTo(22, 80);
      c.quadraticCurveTo(26, 44, 54, 34);
      stroke(c, '#7fc9e2', 5);
      ell(c, 80, 44, 4.5, 4.5, '#fffdf6');
      ell(c, 90, 56, 3, 3, '#fffdf6');
    },
    typhoon(c) {
      c.beginPath();
      for (let i = 0; i <= 70; i++) {
        const a = i * 0.21;
        const r = 3 + i * 0.5;
        const x = 50 + Math.cos(a) * r;
        const y = 50 + Math.sin(a) * r * 0.92;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      stroke(c, '#fffdf6', 7.5);
      ell(c, 50, 50, 5.5, 5.5, '#fffdf6');
    },
    flood(c) {
      [[28, 20], [52, 12], [74, 22]].forEach(([x, y]) => {
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(x + 9, y + 15, x, y + 21);
        c.quadraticCurveTo(x - 9, y + 15, x, y);
        c.fillStyle = '#fffdf6';
        c.fill();
      });
      [58, 72, 86].forEach((y, i) => {
        c.beginPath();
        c.moveTo(10, y);
        for (let k = 0; k < 4; k++) c.quadraticCurveTo(20 + k * 20, y + (k % 2 ? 9 : -9), 30 + k * 20, y);
        stroke(c, i === 0 ? '#fffdf6' : 'rgba(255,253,246,.72)', 5.5);
      });
    },
    debris(c) {
      c.beginPath();
      c.moveTo(4, 92);
      c.quadraticCurveTo(26, 28, 56, 14);
      c.quadraticCurveTo(90, 36, 96, 92);
      c.closePath();
      c.fillStyle = '#e6c8a0';
      c.fill();
      c.beginPath();
      c.moveTo(58, 22);
      c.quadraticCurveTo(44, 58, 18, 90);
      c.quadraticCurveTo(58, 92, 72, 90);
      c.quadraticCurveTo(66, 54, 58, 22);
      c.fillStyle = '#8a5f42';
      c.fill();
      [[42, 74, 8], [58, 80, 6.5], [50, 58, 5.5]].forEach(([x, y, r]) => ell(c, x, y, r, r * 0.85, '#d3d0c4'));
    },
    temperature(c) {
      box(c, 41, 12, 18, 54, 9, '#fffdf6');
      ell(c, 50, 72, 16, 16, '#fffdf6');
      box(c, 46, 34, 8, 36, 4, '#e2564f');
      ell(c, 50, 72, 10.5, 10.5, '#e2564f');
      ell(c, 20, 30, 10, 10, '#ffe08a');
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8;
        line(c, 20 + Math.cos(a) * 14, 30 + Math.sin(a) * 14, 20 + Math.cos(a) * 19, 30 + Math.sin(a) * 19, '#ffe08a', 3.4);
      }
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3 + 0.5;
        line(c, 80 - Math.cos(a) * 14, 34 - Math.sin(a) * 14, 80 + Math.cos(a) * 14, 34 + Math.sin(a) * 14, '#dff4ff', 3.6);
      }
    },
    air(c) {
      ell(c, 50, 36, 22, 17, '#fffdf6');
      ell(c, 30, 42, 15, 12, '#fffdf6');
      ell(c, 70, 42, 15, 12, '#fffdf6');
      box(c, 17, 40, 66, 14, 7, '#fffdf6');
      ['#5bbf7a', '#f2c94c', '#f2994a', '#e5484d', '#9b6bc9'].forEach((col, i) => {
        ell(c, 18 + i * 16, 76, 7.2, 7.2, col);
        ell(c, 18 + i * 16, 76, 7.2, 7.2);
        stroke(c, '#fffdf6', 2.2);
      });
    },
    drought(c) {
      c.beginPath();
      c.moveTo(50, 8);
      c.quadraticCurveTo(74, 38, 66, 50);
      c.quadraticCurveTo(50, 64, 34, 50);
      c.quadraticCurveTo(26, 38, 50, 8);
      c.fillStyle = '#fffdf6';
      c.fill();
      box(c, 8, 66, 84, 24, 10, '#c9914e');
      c.beginPath();
      c.moveTo(22, 66);
      c.lineTo(30, 76);
      c.lineTo(24, 90);
      c.moveTo(30, 76);
      c.lineTo(44, 80);
      c.moveTo(58, 66);
      c.lineTo(52, 78);
      c.lineTo(62, 90);
      c.moveTo(52, 78);
      c.lineTo(74, 76);
      stroke(c, '#8a5f33', 3);
    },
    blackout(c) {
      ell(c, 50, 42, 24, 24, '#fffdf6');
      box(c, 39, 60, 22, 18, 5, '#fffdf6');
      box(c, 41, 80, 18, 7, 3.5, '#d7d3ec');
      c.beginPath();
      c.moveTo(41, 46);
      c.lineTo(50, 38);
      c.lineTo(59, 46);
      stroke(c, '#7d78b8', 3.6);
      line(c, 18, 16, 82, 84, '#ffd34f', 7);
    },
    nuclear(c) {
      poly(c, [12, 50, 44, 22, 76, 50], '#fffdf6');
      box(c, 20, 48, 48, 38, 6, '#fffdf6');
      box(c, 28, 56, 13, 13, 2.5, '#6dbba0');
      box(c, 47, 56, 13, 13, 2.5, '#6dbba0');
      line(c, 34.5, 56, 34.5, 69, '#fffdf6', 2);
      line(c, 53.5, 56, 53.5, 69, '#fffdf6', 2);
      [8, 15].forEach((r) => {
        c.beginPath();
        c.arc(74, 28, r, -1, 0.5);
        stroke(c, '#fffdf6', 3.8);
      });
      ell(c, 74, 28, 3.4, 3.4, '#fffdf6');
    },
  };
  const HAZARD_COLOR = {
    earthquake: '#e8a15c', tsunami: '#5fb8d6', typhoon: '#8aa4c8', flood: '#6d9ee0', debris: '#b98a60',
    temperature: '#ef8f6b', air: '#a9b48c', drought: '#d9b45f', blackout: '#7d78b8', nuclear: '#6dbba0',
  };
  /* 畫一個圓底的災害圖示到 canvas（size 為 CSS 像素）；裝飾性圖片，不隨時間變動 */
  function paintHazardIcon(cv, id, size, round) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = size * dpr;
    cv.height = size * dpr;
    const c = cv.getContext('2d');
    c.setTransform((dpr * size) / 100, 0, 0, (dpr * size) / 100, 0, 0);
    const corner = round ? 50 : 30;
    box(c, 0, 0, 100, 100, corner, HAZARD_COLOR[id] || '#e8a15c');
    c.save();
    rr(c, 0, 0, 100, 100, corner);
    c.clip();
    if (hazardIcons[id]) hazardIcons[id](c);
    c.restore();
  }

  function skyFill(c, w, h, top, bottom) {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  }
  function bumps(c, w, y, h, step, color, phase) {
    c.fillStyle = color;
    c.fillRect(0, y, w, h);
    for (let x = -step; x < w + step; x += step) {
      const r = step * (0.62 + 0.25 * Math.sin(x * 0.04 + (phase || 0)));
      c.beginPath();
      c.arc(x, y + 2, r, 0, TAU);
      c.fill();
    }
  }
  function miniCloud(c, x, y, s, color) {
    ell(c, x, y, 26 * s, 12 * s, color);
    ell(c, x - 16 * s, y + 2 * s, 14 * s, 8 * s, color);
    ell(c, x + 17 * s, y + 2 * s, 15 * s, 9 * s, color);
    ell(c, x + 2 * s, y - 8 * s, 14 * s, 10 * s, color);
  }

  /* 結局場景的小房子 */
  function miniHouse(c, x, y, s, wall, roof) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    box(c, -34, -44, 68, 44, 6, wall);
    c.beginPath();
    c.moveTo(-44, -40);
    c.quadraticCurveTo(0, -86, 44, -40);
    c.closePath();
    c.fillStyle = roof;
    c.fill();
    box(c, -9, -26, 18, 26, 4, '#a4714c');
    box(c, 14, -32, 14, 13, 3, '#fff0bd');
    box(c, -28, -32, 14, 13, 3, '#fff0bd');
    c.restore();
  }

  const FAMILY = [
    { jacket: '#7ec1dd', jacketDark: '#5fa6c4', pack: '#e8785c', packDark: '#c9624a', hat: '#c9b6f2', hatBand: '#8f7ac9' },
    { jacket: '#a9d98a', jacketDark: '#89c06c', pack: '#f4c76b', packDark: '#d8a94c', hat: '#ffb1c4', hatBand: '#e8785c', hair: '#2c2a2e' },
  ];
  /* 立牌式的清單：勾起來的代表完成 */
  function checklist(c, x, y, s, title, ticks) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    line(c, -22, 0, -12, -40, '#8a5a44', 5);
    line(c, 22, 0, 12, -40, '#8a5a44', 5);
    box(c, -46, -112, 92, 84, 10, '#a4714c');
    box(c, -40, -106, 80, 72, 7, '#fffdf6');
    text(c, title, 0, -95, 13, '#7a5b42', 800);
    ticks.forEach((on, i) => {
      const ly = -78 + i * 16;
      box(c, -32, ly - 6, 12, 12, 3, on ? '#4fa871' : '#eadfc8');
      if (on) {
        c.beginPath();
        c.moveTo(-29, ly);
        c.lineTo(-26.5, ly + 3);
        c.lineTo(-22.5, ly - 3);
        stroke(c, '#fff', 2);
      }
      line(c, -14, ly, 30, ly, '#d8c6a4', 3);
    });
    c.restore();
  }
  function heart(c, x, y, alpha) {
    c.globalAlpha = Math.max(0, alpha);
    ell(c, x - 3, y, 3.8, 3.8, '#ef7f7a');
    ell(c, x + 3, y, 3.8, 3.8, '#ef7f7a');
    poly(c, [x - 6.6, y + 1.4, x + 6.6, y + 1.4, x, y + 9], '#ef7f7a');
    c.globalAlpha = 1;
  }
  /* props.js 比 art.js 晚載入，繪圖時才取用 */
  const A_decor = (c, type, s) => DH.art.decor[type](c, s, 0, { h: 0.3 });

  const endings = {
    /* 好結局：和家人一起看防災準備清單 */
    good(c, w, h, t) {
      skyFill(c, w, h, '#8fcdf2', '#fff0d2');
      ell(c, w * 0.84, h * 0.2, h * 0.11, h * 0.11, '#ffd27a');
      miniCloud(c, w * 0.16 + Math.sin(t * 0.3) * 8, h * 0.18, 1, '#fff');
      miniCloud(c, w * 0.56 - Math.sin(t * 0.25) * 8, h * 0.12, 0.7, 'rgba(255,255,255,.9)');
      const sc = Math.min(1, h / 225, w / 400);
      miniHouse(c, w * 0.5, h * 0.74, sc * 1.25, '#fff3d6', '#e0795e');
      c.fillStyle = '#a9de92';
      c.beginPath();
      c.moveTo(0, h * 0.74);
      c.quadraticCurveTo(w * 0.5, h * 0.67, w, h * 0.74);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.closePath();
      c.fill();
      const gy = h * 0.95;
      checklist(c, w * 0.5, gy - 2, sc * 1.1, '防災清單', [true, true, true]);
      drawHero(c, w * 0.5 - 98 * sc, gy, { t, pose: 'wave', scale: sc * 0.92 });
      drawHero(c, w * 0.5 + 92 * sc, gy, { t, scale: sc * 0.96, dir: -1, colors: FAMILY[0], noPack: true, blinkSeed: 2 });
      drawHero(c, w * 0.5 + 156 * sc, gy + 2, { t, pose: 'cheer', scale: sc * 0.62, dir: -1, colors: FAMILY[1], noPack: true, blinkSeed: 5 });
      drawPet(c, 'dog', w * 0.5 - 170 * sc, gy, sc * 0.8, t, 1);
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.3 + i / 3) % 1;
        heart(c, w * 0.5 + (i - 1) * 46 * sc, gy - 150 * sc - p * 20 * sc, Math.sin(p * Math.PI) * 0.8);
      }
    },
    /* 普通結局：黃昏時把裝備一樣一樣核對過 */
    normal(c, w, h, t) {
      skyFill(c, w, h, '#a597cc', '#ffd2a6');
      ell(c, w * 0.84, h * 0.22, h * 0.1, h * 0.1, '#fff3c9');
      miniCloud(c, w * 0.22 + Math.sin(t * 0.3) * 6, h * 0.2, 0.9, 'rgba(255,240,230,.72)');
      const sc = Math.min(1, h / 225, w / 400);
      miniHouse(c, w * 0.1, h * 0.72, sc, '#f3e0cf', '#b57f90');
      miniHouse(c, w * 0.9, h * 0.72, sc, '#ecdcd6', '#8f7fae');
      c.fillStyle = '#c9b184';
      c.fillRect(0, h * 0.7, w, h);
      c.fillStyle = 'rgba(255,255,255,.22)';
      c.fillRect(0, h * 0.7, w, 4);
      const gy = h * 0.93;
      drawHero(c, w * 0.5 - 118 * sc, gy, { t, risk: 30, scale: sc * 0.95, noPack: true });
      checklist(c, w * 0.5 - 60 * sc, gy - 2, sc * 0.7, '裝備', [true, true, false]);
      /* 攤開的背包與三樣裝備 */
      c.save();
      c.translate(w * 0.5, gy);
      c.scale(sc, sc);
      ell(c, 62, 2, 150, 16, 'rgba(120,90,60,.22)');
      box(c, -10, -46, 38, 46, 12, HERO_COLORS.pack);
      box(c, -5, -26, 28, 20, 6, HERO_COLORS.packDark);
      box(c, -6, -56, 30, 13, 6, HERO_COLORS.roll);
      [['flashlight', 56, true], ['medkit', 104, true], ['radio', 152, false]].forEach(([name, x, ok]) => {
        ell(c, x, -28, 22, 22, '#fffdf6');
        c.save();
        c.translate(x, -28);
        c.scale(0.9, 0.9);
        icons[name](c);
        c.restore();
        ell(c, x + 16, -46, 8, 8, ok ? '#4fa871' : '#e6b84c');
        if (ok) {
          c.beginPath();
          c.moveTo(x + 12, -46);
          c.lineTo(x + 15, -43);
          c.lineTo(x + 20, -49);
          stroke(c, '#fff', 2);
        } else {
          box(c, x + 15, -50, 2, 5, 1, '#fff');
          box(c, x + 15, -44, 2, 2, 1, '#fff');
        }
      });
      c.restore();
    },
    /* 險象環生：雨剛停，鄰居遞水問候，路障還在，但人平安 */
    narrow(c, w, h, t) {
      skyFill(c, w, h, '#93a7bd', '#f1dcc2');
      const sc = Math.min(1, h / 225, w / 400);
      [['#f3a6a0', 0], ['#f7d58a', 1], ['#a9d6a0', 2], ['#9cc8ea', 3]].forEach(([col, i]) => {
        c.beginPath();
        c.arc(w * 0.82, h * 0.74, h * (0.56 - i * 0.05), Math.PI, Math.PI * 1.72);
        stroke(c, col, h * 0.05);
      });
      miniCloud(c, w * 0.2 + Math.sin(t * 0.25) * 6, h * 0.2, 1.05, '#d7dee4');
      miniCloud(c, w * 0.48 - Math.sin(t * 0.2) * 6, h * 0.12, 0.8, '#e4e8ea');
      c.fillStyle = '#9dbb8a';
      c.fillRect(0, h * 0.72, w, h);
      c.fillStyle = '#d7cdb8';
      c.fillRect(0, h * 0.8, w, h * 0.2);
      [[0.18, 44], [0.56, 56], [0.86, 36]].forEach(([fx, r]) => {
        ell(c, w * fx, h * 0.92, r * sc, 7 * sc, 'rgba(140,175,205,.7)');
      });
      const gy = h * 0.93;
      /* 路障 */
      c.save();
      c.translate(w * 0.84, gy - 8 * sc);
      A_decor(c, 'roadblock', sc);
      c.restore();
      c.save();
      c.translate(w * 0.72, gy);
      A_decor(c, 'cone', sc);
      c.restore();
      /* 主角撐著收起來的傘，鄰居遞水 */
      const hx = w * 0.4;
      drawHero(c, hx, gy, { t, risk: 62, scale: sc * 0.96 });
      line(c, hx - 44 * sc, gy, hx - 44 * sc, gy - 74 * sc, '#6d5a70', 4 * sc);
      c.beginPath();
      c.moveTo(hx - 44 * sc, gy - 84 * sc);
      c.quadraticCurveTo(hx - 54 * sc, gy - 58 * sc, hx - 44 * sc, gy - 34 * sc);
      c.quadraticCurveTo(hx - 34 * sc, gy - 58 * sc, hx - 44 * sc, gy - 84 * sc);
      c.fillStyle = '#e8785c';
      c.fill();
      const nx = hx + 86 * sc;
      drawHero(c, nx, gy, { t, scale: sc * 0.92, dir: -1, colors: FAMILY[0], noPack: true, blinkSeed: 4 });
      box(c, nx - 42 * sc, gy - 50 * sc, 12 * sc, 22 * sc, 4 * sc, '#8fd0e6');
      box(c, nx - 40 * sc, gy - 55 * sc, 8 * sc, 6 * sc, 2 * sc, '#5fa6c4');
    },
    /* 求援結局：溫暖、被接住的感覺。沒有責備，救援隊與 119 救護車來幫忙。 */
    bad(c, w, h, t) {
      skyFill(c, w, h, '#a6dcf0', '#ffe6c2');
      const sunX = w * 0.12;
      const sunY = h * 0.2;
      ell(c, sunX, sunY, h * 0.2, h * 0.2, 'rgba(255,226,160,.42)');
      ell(c, sunX, sunY, h * 0.11, h * 0.11, '#ffd98a');
      miniCloud(c, w * 0.38 + Math.sin(t * 0.3) * 8, h * 0.14, 0.9, 'rgba(255,255,255,.92)');
      miniCloud(c, w * 0.9 - Math.sin(t * 0.25) * 8, h * 0.16, 0.7, 'rgba(255,255,255,.82)');
      const sc = Math.min(1, h / 240, w / 420);
      miniHouse(c, w * 0.5, h * 0.72, sc * 1.05, '#fff3d6', '#e0795e');
      c.fillStyle = '#a5d58f';
      c.beginPath();
      c.moveTo(0, h * 0.72);
      c.quadraticCurveTo(w * 0.5, h * 0.66, w, h * 0.72);
      c.lineTo(w, h);
      c.lineTo(0, h);
      c.closePath();
      c.fill();
      c.fillStyle = '#e6dcc4';
      c.fillRect(0, h * 0.82, w, h * 0.18);

      /* Q 版救護車 */
      c.save();
      c.translate(w * 0.76, h * 0.9);
      c.scale(sc, sc);
      shadow(c, 84, 8);
      box(c, -80, -76, 118, 66, 14, '#fffdf6');
      c.beginPath();
      c.moveTo(38, -66);
      c.lineTo(56, -66);
      c.quadraticCurveTo(70, -64, 78, -36);
      c.quadraticCurveTo(84, -30, 84, -22);
      c.lineTo(84, -10);
      c.lineTo(38, -10);
      c.closePath();
      c.fillStyle = '#fffdf6';
      c.fill();
      c.beginPath();
      c.moveTo(46, -60);
      c.lineTo(56, -60);
      c.quadraticCurveTo(64, -58, 70, -38);
      c.lineTo(46, -38);
      c.closePath();
      c.fillStyle = '#cfeaf7';
      c.fill();
      box(c, -80, -36, 164, 10, 4, '#e8605c');
      box(c, -40, -64, 12, 28, 3, '#e8605c');
      box(c, -48, -56, 28, 12, 3, '#e8605c');
      text(c, '119', 8, -52, 22, '#d04f4b', 800);
      const glow = reducedMotion() ? 0.8 : 0.55 + Math.sin(t * 5) * 0.35;
      ell(c, -10, -82, 13, 8, `rgba(232,96,92,${glow})`);
      box(c, -18, -86, 16, 10, 4, '#e8605c');
      [-48, 50].forEach((wx) => {
        ell(c, wx, -8, 14, 14, '#4a5468');
        ell(c, wx, -8, 6, 6, '#dfe6ea');
      });
      c.restore();

      /* 平安的主角與救援隊員 */
      const gx = w * 0.15;
      const gy = h * 0.92;
      const gs = sc * 0.86;
      drawHero(c, gx, gy, { t, risk: 10, pose: 'wave', scale: gs, blinkSeed: 1 });
      const rx = gx + 92 * sc;
      drawHero(c, rx, gy + 2, { t, pose: 'idle', dir: -1, scale: gs, colors: RESCUE, helmet: true, blinkSeed: 3 });
      c.save();
      c.translate(rx + 44 * sc, gy);
      c.scale(sc * 0.9, sc * 0.9);
      icons.medkit(c);
      c.restore();
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.35 + i / 3) % 1;
        const hxx = gx + 46 * sc + Math.sin(p * 6 + i) * 6;
        const hyy = gy - 96 * gs - p * 16;
        c.globalAlpha = Math.sin(p * Math.PI) * 0.85;
        ell(c, hxx - 2.4, hyy, 3, 3, '#ef7f7a');
        ell(c, hxx + 2.4, hyy, 3, 3, '#ef7f7a');
        poly(c, [hxx - 5.2, hyy + 1, hxx + 5.2, hyy + 1, hxx, hyy + 7], '#ef7f7a');
        c.globalAlpha = 1;
      }
      speech(c, Math.max(84, gx + 46 * sc), Math.max(36, gy - 128 * gs - 16), '別怕，我們來幫忙！');
    },
  };

  DH.art = {
    FONT, rr, ell, box, line, poly, text, drop, stroke,
    drawHero, drawPet, drawButterfly, drawFlower, speech,
    endings, icons, markerIcon, paintHazardIcon, HAZARD_COLOR, reducedMotion, viewZ: 1,
  };
})();
