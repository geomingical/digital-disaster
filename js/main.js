/* 遊戲主程式：狀態、更新迴圈、輸入、測試鉤子。 */
(function () {
  const DH = window.DH;
  const { core, world, ui, audio, art, scenes, entry } = DH;
  const { FINISH_X, store } = core;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  const SPEED = 250;
  const HINT_RANGE = 150;
  const AUTO_RANGE = 44;
  const START_X = 120;
  const MAX_X = FINISH_X + 40;
  const { reducedMotion } = art;
  /* Canvas 裡的時間：減少動態時整個停住，雲、草、眨眼與結局插圖一起靜止 */
  const STILL_T = 1;
  const artTime = () => (reducedMotion() ? STILL_T : view.t);
  const HERO_H = 112;
  /* drawHero 從腳底到帽頂的原始高度 */
  const HERO_NATIVE_H = 106;
  const ATTRACT = { lo: 640, hi: 775 };
  const ENTRY_CAM = 700;
  const HOME_D = 0.55;
  /* 首頁、選單看的是固定的社區構圖 */
  const STILL_SCREENS = new Set(['start', 'loading', 'entry']);

  const params = new URLSearchParams(location.search);
  const seedParam = params.get('seed');
  const hasSeed = seedParam !== null && seedParam !== '' && Number.isFinite(Number(seedParam));
  const rng = core.makeRng(hasSeed ? Number(seedParam) : (Date.now() ^ (Math.random() * 1e9)));
  const hazardParam = params.get('hazard');

  const canvas = document.getElementById('scene');
  const ctx = canvas.getContext('2d');
  const endingCanvas = document.getElementById('ending-art');
  const endingCtx = endingCanvas.getContext('2d');
  let layout = null;
  let dpr = 1;
  let endingKey = '';

  store.load();

  const state = {
    screen: 'loading',
    bankReady: false,
    bankSource: null,
    bankSize: 0,
    hazard: null,
    risk: 0,
    riskView: 0,
    streak: 0,
    bestStreak: 0,
    events: [],
    eventIndex: 0,
    current: null,
    answers: [],
    ending: null,
    nearEvent: false,
    paused: false,
    player: { x: START_X, d: 0.5, dir: 1, phase: 0, moving: false, pose: 'idle', jump: 0, say: '' },
  };

  /* 繪圖需要、但不屬於遊戲進度的東西 */
  const view = {
    t: 0,
    cam: { x: 400 },
    pan: 0,
    lift: 0,
    heroScale: 1,
    shake: { x: 0, y: 0 },
    shakeTime: 0,
    walkTarget: null,
    particles: [],
    theme: null,
    themeId: '',
    decor: [],
    npcs: [],
    npcSpeech: null,
    mood: 0,
    moodTarget: 0,
    gear: {},
  };

  const input = { keys: new Set(), joy: { x: 0, y: 0 } };
  let bank = [];
  let hazards = [];
  let jumpV = 0;
  let poseTimer = 0;
  let sayTimer = 0;
  let stepClock = 0;
  let currentSection = null;
  let answerLockUntil = 0;
  let lastRiskStep = 0;
  let pendingToast = null;
  let attractPause = 1.2;

  function useTheme(id) {
    if (view.themeId === id) return;
    const t = scenes.theme(id);
    view.themeId = id;
    view.theme = t.def;
    view.decor = t.decor;
    view.npcs = t.npcs;
    view.mood = 0;
    view.moodTarget = 0;
  }

  /* 題庫 ---------------------------------------------------------- */
  async function fetchJson(path) {
    const res = await fetch(path, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function adopt(rawHazards, rawBank) {
    const h = core.cleanHazards(rawHazards);
    const ids = new Set(h.map((x) => x.id));
    const b = core.cleanBank(rawBank).filter((s) => {
      if (ids.has(s.hazard)) return true;
      console.warn('略過沒有對應災害的題目：', s.id);
      return false;
    });
    return { h, b };
  }

  /* 內建題庫約 140 KB：只有 JSON 讀不到（含 file://）時才載入 */
  let fallbackLoad = null;
  function loadFallback() {
    if (window.DH_FALLBACK) return Promise.resolve();
    if (!fallbackLoad) {
      fallbackLoad = new Promise((resolve) => {
        const tag = document.createElement('script');
        tag.src = 'js/fallback-data.js';
        tag.onload = () => resolve();
        tag.onerror = () => {
          console.warn('內建題庫也讀不到');
          fallbackLoad = null;
          tag.remove();
          resolve();
        };
        document.head.appendChild(tag);
      });
    }
    return fallbackLoad;
  }

  async function loadData() {
    state.bankReady = false;
    ui.setLoadState('loading');
    let loaded = { h: [], b: [] };
    if (location.protocol !== 'file:') {
      try {
        const [rawH, rawB] = await Promise.all([fetchJson('data/hazards.json'), fetchJson('data/scenarios.json')]);
        loaded = adopt(rawH, rawB);
      } catch (err) {
        console.warn('題庫讀取失敗，改用內建題庫：', err.message);
      }
    }
    if (loaded.b.length) {
      state.bankSource = 'file';
      ui.setLoadState('ok');
    } else {
      await loadFallback();
      const fb = window.DH_FALLBACK || {};
      loaded = adopt(fb.hazards, fb.scenarios);
      state.bankSource = loaded.b.length ? 'fallback' : null;
      /* file:// 本來就讀不了 JSON，內建題庫就是完整題庫，不用提示 */
      const quiet = location.protocol === 'file:' && loaded.b.length;
      ui.setLoadState(quiet ? 'ok' : loaded.b.length ? 'fallback' : 'error', loaded.b.length);
    }
    hazards = loaded.h;
    bank = loaded.b;
    state.bankSize = bank.length;
    state.bankReady = bank.length > 0;
    ui.renderEntry(hazards, countOf);
  }

  const countOf = (id) => bank.filter((s) => s.hazard === id).length;
  const hazardById = (id) => hazards.find((h) => h.id === id) || null;

  /* 流程 ---------------------------------------------------------- */
  function setScreen(name) {
    state.screen = name;
    ui.setScreen(name);
    syncMusic();
  }

  /* 背景音樂：首頁／入口／簡介放入口曲；演練依階段；結局依等級 */
  const STAGE_MUSIC = { before: 'calm', during: 'tense', after: 'relief' };
  function musicFor() {
    switch (state.screen) {
      case 'play':
      case 'card':
        return { track: STAGE_MUSIC[core.sectionAt(state.player.x).key] };
      case 'ending':
        return { track: 'ending', variant: state.ending ? state.ending.tier : 'normal' };
      default:
        return { track: 'entry' };
    }
  }
  function syncMusic() {
    const m = musicFor();
    audio.setTrack(m.track, m.variant);
  }

  function resetPlayer(x) {
    const p = state.player;
    p.x = x;
    p.d = 0.5;
    p.dir = 1;
    p.moving = false;
    p.pose = 'idle';
    p.jump = 0;
    p.say = '';
    jumpV = 0;
    poseTimer = 0;
    sayTimer = 0;
  }

  /* 主選單與簡介都沒有進行中的一局：清掉事件與風險 */
  function clearRun() {
    state.events = [];
    state.eventIndex = 0;
    state.current = null;
    state.answers = [];
    state.ending = null;
    state.risk = 0;
    state.riskView = 0;
    state.nearEvent = false;
    view.lift = 0;
    view.pan = 0;
    view.heroScale = 1;
    view.walkTarget = null;
    view.particles = [];
    view.npcSpeech = null;
    view.gear = {};
    pendingToast = null;
    input.keys.clear();
    ui.clearToasts();
  }

  function showHome(name) {
    clearRun();
    useTheme(name === 'entry' ? 'entry' : 'home');
    world.clearAroundEvents(view.decor, view.npcs, []);
    resetPlayer(name === 'entry' ? ENTRY_CAM : ATTRACT.lo + 60);
    state.player.d = HOME_D;
    setScreen(name);
    if (name === 'entry') ui.renderEntry(hazards, countOf);
    resize();
    view.cam.x = layout.camX;
  }
  const toEntry = () => {
    if (!state.bankReady) return false;
    showHome('entry');
    return true;
  };
  const toStart = () => showHome('start');

  /* 簡介：場景換成該災害的社區日常，面板壓在上面 */
  function selectHazard(id) {
    const h = hazardById(id);
    if (!h || !countOf(id)) return false;
    clearRun();
    state.hazard = id;
    useTheme(id);
    world.clearAroundEvents(view.decor, view.npcs, []);
    resetPlayer(START_X + 200);
    setScreen('intro');
    resize();
    view.cam.x = state.player.x + 120;
    ui.showIntro(h, countOf(id));
    return true;
  }

  function startGame(hazardId) {
    const id = hazardId || state.hazard;
    const h = hazardById(id);
    if (!state.bankReady || !h || !countOf(id)) return false;
    ui.closeModal();
    clearRun();
    state.hazard = id;
    interactCounts.clear();
    useTheme(id);
    state.events = core.buildEvents(core.pickScenarios(bank, id, rng, store.data.seen), rng);
    state.streak = 0;
    state.bestStreak = 0;
    lastRiskStep = 0;
    endingKey = '';
    resetPlayer(START_X);
    view.cam.x = START_X + 80;
    world.clearAroundEvents(view.decor, view.npcs, state.events);
    currentSection = null;
    store.recordStart(id);
    ui.setHazardName(h.name);
    setScreen('play');
    resize();
    audio.pop();
    return true;
  }

  function nextEvent() {
    return state.events[state.eventIndex] || null;
  }

  function openEvent(ev) {
    state.current = ev;
    view.walkTarget = null;
    view.npcSpeech = null;
    state.player.moving = false;
    state.player.dir = ev.x >= state.player.x ? 1 : -1;
    ui.clearToasts();
    setScreen('card');
    ui.openCard(ev, state.eventIndex, state.events.length);
    audio.pop();
    answerLockUntil = 0;
  }

  function answer(displayIndex) {
    const ev = state.current;
    if (!ev || ev.done || !ev.options[displayIndex]) return false;
    const opt = ev.options[displayIndex];
    const s = ev.scenario;
    const before = state.risk;
    ev.done = true;
    ev.correct = opt.correct;
    ev.chosen = displayIndex;
    state.risk = Math.min(100, state.risk + opt.risk);
    state.answers.push({
      id: s.id,
      category: s.category,
      title: s.title,
      stage: s.stage,
      situation: s.situation,
      chosen: opt.text,
      answer: s.options[s.answer],
      why: s.why,
      keypoint: s.keypoint,
      sources: s.sources,
      risk: state.risk - before,
      correct: opt.correct,
    });
    store.recordAnswer(s.id, opt.correct);

    if (opt.correct) {
      state.streak++;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      setPose('cheer', 1.3);
      if (!reducedMotion()) {
        jumpV = 230;
        burstFlowers();
      }
      floatText('答對了！');
      audio.correct();
      if (state.streak === 3 || state.streak === 5) notify(`連續答對 ${state.streak} 題！`, 'good');
    } else {
      /* 答錯的焦點只留表情與風險條，風險數字已經寫在卡片上 */
      state.streak = 0;
      setPose('stumble', 0.8);
      if (!reducedMotion()) view.shakeTime = 0.18;
      audio.wrong();
      ui.bumpRisk();
    }
    /* HUD 與回饋卡在同一刻結算，數字永遠一致 */
    ui.updateRisk(state.risk);
    ui.showAnswer(ev, displayIndex, state.risk >= 100, state.risk - before, state.risk);
    answerLockUntil = performance.now() + 220;
    announceRisk();
    return true;
  }

  function announceRisk() {
    const step = state.risk >= 80 ? 2 : state.risk >= 50 ? 1 : 0;
    if (step > lastRiskStep && state.risk < 100) {
      notify(step === 2 ? '再出錯就需要求援了，放慢腳步想一想' : '風險正在升高，多留意提醒', 'warn');
    }
    lastRiskStep = Math.max(lastRiskStep, step);
  }

  /* 卡片開著時先不跳提示，免得蓋住角色；關卡片後再講，同時只留最新一則 */
  function notify(message, kind) {
    if (state.screen === 'card') pendingToast = { message, kind };
    else ui.toast(message, kind);
  }

  function continueAfterAnswer() {
    const ev = state.current;
    if (!ev || !ev.done) return false;
    if (performance.now() < answerLockUntil) return false;
    state.current = null;
    state.eventIndex++;
    if (state.risk >= 100) {
      finish(false);
      return true;
    }
    setScreen('play');
    if (pendingToast) {
      ui.toast(pendingToast.message, pendingToast.kind);
      pendingToast = null;
    }
    return true;
  }

  function finish(completed) {
    const grade = core.gradeFor(state.risk);
    const { fresh, isNewBest } = store.recordEnding({
      hazard: state.hazard,
      risk: state.risk,
      grade,
      completed,
      bestStreak: state.bestStreak,
    });
    state.ending = { completed, risk: state.risk, gradeKey: grade.key, tier: grade.tier, title: grade.title, freshBadges: fresh };
    state.current = null;
    view.walkTarget = null;
    /* 結局要讓插畫、成績與徽章先被看見 */
    pendingToast = null;
    ui.clearToasts();
    view.particles = [];
    state.player.say = '';
    setScreen('ending');
    ui.showEnding({
      grade,
      risk: state.risk,
      answers: state.answers,
      totalEvents: state.events.length,
      bestStreak: state.bestStreak,
      best: store.bestOf(state.hazard),
      freshBadges: fresh,
      isNewBest,
      hazard: hazardById(state.hazard),
    });
    needsRedraw = true;
    sizeEndingCanvas();
    if (grade.tier === 'bad') audio.sosCue();
    else audio.fanfare();
  }

  const interactCounts = new Map();

  function interact() {
    if (state.screen === 'card') {
      if (state.current && state.current.done) continueAfterAnswer();
      return;
    }
    if (state.screen !== 'play') return;
    updateNpcSpeech();
    if (view.npcSpeech) {
      say('', 0);
      view.walkTarget = null;
      state.player.dir = view.npcSpeech.x >= state.player.x ? 1 : -1;
      audio.pop();
      return;
    }
    const ev = nextEvent();
    if (ev && Math.abs(ev.x - state.player.x) < HINT_RANGE) {
      openEvent(ev);
    } else {
      const stage = core.sectionAt(state.player.x).key;
      const lines = (view.theme.interactLines || scenes.THEMES.home.interactLines)[stage];
      const key = `${state.hazard}:${stage}`;
      const count = interactCounts.get(key) || 0;
      interactCounts.set(key, count + 1);
      const finishHint = state.eventIndex >= state.events.length ? ' 往終點拱門走吧！' : '';
      say(lines[count % lines.length] + finishHint, 4);
    }
  }

  /* 小動作與回饋 ------------------------------------------------------ */
  function setPose(name, seconds) {
    state.player.pose = name;
    poseTimer = seconds;
  }
  function say(text, seconds) {
    state.player.say = text;
    sayTimer = seconds;
  }

  function burstFlowers() {
    const p = state.player;
    const y = layout ? world.playerY(layout, p.x, p.d) - 74 : 0;
    const colors = ['#ffb1c4', '#ffd965', '#ffffff', '#c9b6f2', '#ffc78f'];
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 90;
      view.particles.push({
        kind: 'flower', x: p.x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 110,
        g: 340, r: 3.5 + Math.random() * 3, rot: Math.random() * 6,
        color: colors[i % colors.length], life: 0.8 + Math.random() * 0.4,
      });
    }
  }

  const TEXT_LIFE = 1.1;
  const TEXT_RISE = 24;

  /* 從頭頂上浮約 24px 後淡出，同時只留一則 */
  function floatText(text) {
    const p = state.player;
    const y = layout ? world.playerY(layout, p.x, p.d) - (HERO_H + 16) * view.heroScale : 0;
    const vy = reducedMotion() ? 0 : -TEXT_RISE / TEXT_LIFE / (layout ? layout.z : 1);
    view.particles = view.particles.filter((q) => q.kind !== 'text');
    view.particles.push({ kind: 'text', text, color: '#237a45', size: 20, x: p.x, y, vx: 0, vy, g: 0, rot: 0, life: TEXT_LIFE });
  }

  /* 更新 ---------------------------------------------------------- */
  function moveVector() {
    const k = input.keys;
    const x = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    const y = (k.has('down') ? 1 : 0) - (k.has('up') ? 1 : 0);
    if (x || y) {
      const n = Math.hypot(x, y);
      return { x: x / n, y: y / n };
    }
    if (input.joy.x || input.joy.y) return input.joy;
    return null;
  }

  function updatePlayer(dt) {
    const p = state.player;
    const vec = moveVector();
    let vx = 0;
    let vy = 0;
    if (vec) {
      view.walkTarget = null;
      vx = vec.x * SPEED;
      vy = vec.y * SPEED * 0.62;
    } else if (view.walkTarget) {
      const dx = view.walkTarget.x - p.x;
      const dy = (view.walkTarget.d - p.d) * world.PATH_H;
      const dist = Math.hypot(dx, dy);
      if (dist < 7) {
        view.walkTarget = null;
      } else {
        vx = (dx / dist) * SPEED;
        vy = (dy / dist) * SPEED;
      }
    }
    const speed = Math.hypot(vx, vy);
    p.moving = speed > 1;
    if (p.moving) {
      p.x = clamp(p.x + vx * dt, 30, MAX_X);
      p.d = clamp(p.d + (vy * dt) / world.PATH_H, 0, 1);
      if (Math.abs(vx) > 6) p.dir = vx > 0 ? 1 : -1;
      p.phase += dt * (5 + (speed / SPEED) * 6.5);
      if (p.pose !== 'cheer' && p.pose !== 'stumble') {
        p.pose = 'idle';
        poseTimer = 0;
      }
      stepClock -= dt;
      if (stepClock <= 0) {
        stepClock = 0.31;
        audio.step();
      }
      view.pan *= Math.pow(0.02, dt);
    }
  }

  function updateEvents() {
    const p = state.player;
    const ev = nextEvent();
    state.nearEvent = false;
    if (ev) {
      const dist = Math.abs(ev.x - p.x);
      state.nearEvent = dist < HINT_RANGE;
      if (dist < AUTO_RANGE) {
        openEvent(ev);
        return;
      }
      const touch = document.body.classList.contains('touch');
      ui.setPrompt(state.nearEvent ? (touch ? '前方有狀況，點這裡查看' : '前方有狀況，按 E／空白鍵查看') : null);
    } else {
      const left = FINISH_X - p.x;
      ui.setPrompt(left < 500 && left > 0 ? '演練終點就在前面！' : null);
      if (p.x >= FINISH_X) finish(true);
    }
  }

  function updateNpcSpeech() {
    const p = state.player;
    view.npcSpeech = view.npcs.find((n) => Math.abs(n.x - p.x) < 130) || null;
  }

  function stageIndex(x) {
    return core.SECTIONS.indexOf(core.sectionAt(x));
  }

  function updateSection() {
    const sec = core.sectionAt(state.player.x);
    if (sec !== currentSection) {
      if (currentSection && state.screen === 'play') {
        ui.flashStage();
        audio.jingle();
      }
      const i = core.SECTIONS.indexOf(sec);
      audio.setAmbience(view.theme.ambience[i], view.theme.birds[i] > 0.5);
      currentSection = sec;
      syncMusic();
    }
  }

  function updateGear(dt) {
    const def = view.theme;
    const i = stageIndex(state.player.x);
    if (def.moodPal) {
      /* 高低溫：看下一題是熱還是冷；看不出來就維持目前的天氣 */
      const ev = state.current || nextEvent();
      const m = ev ? scenes.moodOf(ev.scenario) : 0;
      if (m) view.moodTarget = m;
      view.mood += (view.moodTarget - view.mood) * Math.min(1, dt * 1.6);
      if (reducedMotion()) view.mood = view.moodTarget;
    }
    view.gear = def.gearFor ? def.gearFor(i, view.mood) : def.gear[i];
  }

  function updateCommon(dt) {
    const p = state.player;
    view.t += dt;
    state.riskView += (state.risk - state.riskView) * Math.min(1, dt * 2.6);

    if (poseTimer > 0) {
      poseTimer -= dt;
      if (poseTimer <= 0) p.pose = 'idle';
    }
    if (sayTimer > 0) {
      sayTimer -= dt;
      if (sayTimer <= 0) p.say = '';
    }
    if (jumpV !== 0 || p.jump > 0) {
      p.jump += jumpV * dt;
      jumpV -= 980 * dt;
      if (p.jump <= 0) {
        jumpV = 0;
        p.jump = 0;
      }
    }

    if (view.shakeTime > 0) {
      view.shakeTime = Math.max(0, view.shakeTime - dt);
      const m = view.shakeTime * 11;
      view.shake.x = Math.sin(view.t * 62) * m;
      view.shake.y = Math.cos(view.t * 49) * m * 0.55;
    } else {
      view.shake.x = 0;
      view.shake.y = 0;
    }

    for (let i = view.particles.length - 1; i >= 0; i--) {
      const q = view.particles[i];
      q.life -= dt;
      if (q.life <= 0) {
        view.particles.splice(i, 1);
        continue;
      }
      /* 浮字跟著角色，不會留在原地或被夾到畫面邊緣 */
      if (q.kind === 'text') q.x = p.x;
      q.vy += q.g * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.rot += dt * 3;
    }

    if (!layout) return;
    if (STILL_SCREENS.has(state.screen)) {
      view.cam.x = layout.camX;
      view.lift = 0;
      view.heroScale = layout.heroScale || 1;
      return;
    }
    if (state.screen === 'intro') return;
    const cardRect = state.screen === 'card' ? document.getElementById('card').getBoundingClientRect() : null;
    /* 寬螢幕：把角色移到卡片旁邊。窄螢幕放不下，改把場景往上抬。 */
    const beside = cardRect && cardRect.left >= 130;
    let target;
    if (beside) {
      const free = cardRect.left / layout.z;
      const facingLeft = state.current && state.current.x < p.x;
      const heroAt = free >= 300 ? free * (facingLeft ? 0.8 : 0.2) : free / 2;
      target = p.x - heroAt + layout.vw / 2;
    } else {
      target = p.x + p.dir * Math.min(120, layout.vw * 0.12) + view.pan;
    }
    const lo = layout.vw * 0.3;
    const hi = FINISH_X + 260;
    view.cam.x += (clamp(target, lo, hi) - view.cam.x) * Math.min(1, dt * 4.5);

    let liftTarget = 0;
    let scaleTarget = 1;
    if (cardRect && !beside) {
      /* 腳底離卡片至少 12px、帽頂離 HUD 8px；擠不下就先縮小角色 */
      const z = layout.z;
      const feetY = (world.playerY(layout, p.x, p.d) + 6) * z;
      const topLimit = document.getElementById('hud').getBoundingClientRect().bottom + 8;
      const natural = HERO_H * (0.92 + p.d * 0.12) * z;
      const room = cardRect.top - 12 - topLimit;
      scaleTarget = clamp(room / natural, 0.58, 1);
      const headY = feetY - natural * scaleTarget;
      const over = feetY - (cardRect.top - 12);
      liftTarget = clamp(over, 0, Math.max(0, headY - topLimit)) / z;
    }
    view.lift += (liftTarget - view.lift) * Math.min(1, dt * 5);
    view.heroScale += (scaleTarget - view.heroScale) * Math.min(1, dt * 5);
  }

  /* 首頁：角色在社區裡來回走，也順便展示左右朝向 */
  function updateAttract(dt) {
    const p = state.player;
    if (reducedMotion()) {
      p.moving = false;
      return;
    }
    if (attractPause > 0) {
      attractPause -= dt;
      p.moving = false;
      return;
    }
    p.moving = true;
    p.phase += dt * 8;
    p.x += p.dir * dt * 54;
    if (p.x >= ATTRACT.hi || p.x <= ATTRACT.lo) {
      p.x = clamp(p.x, ATTRACT.lo, ATTRACT.hi);
      p.dir = -p.dir;
      attractPause = 1.6;
    }
  }

  function update(dt) {
    updateCommon(dt);
    if (state.screen === 'play') {
      updatePlayer(dt);
      updateNpcSpeech();
      updateSection();
      updateEvents();
    } else if (state.screen === 'start' || state.screen === 'loading') {
      updateAttract(dt);
    }
    if (view.theme && (state.screen === 'play' || state.screen === 'card' || state.screen === 'intro')) updateGear(dt);
    if (state.screen === 'play' || state.screen === 'card') {
      const p = state.player;
      ui.updateHud(p.x, core.sectionAt(p.x), state.risk);
    }
  }

  /* 繪製 ---------------------------------------------------------- */
  function resize() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    if (state.screen === 'entry') layout = entryLayout(w, h);
    else layout = STILL_SCREENS.has(state.screen) ? startLayout(w, h) : world.makeLayout(w, h);
    const card = document.getElementById('card');
    if (!card.hidden) {
      const topSafe = document.getElementById('hud').getBoundingClientRect().bottom + 24;
      card.style.maxHeight = `calc(100% - ${topSafe}px)`;
    }
    sizeEndingCanvas();
    needsRedraw = true;
  }

  /* 入口構圖：圖章位置先由 entry.js 算好，再把主角的腳底與大小對齊環的中央 */
  function entryLayout(w, h) {
    const base = world.makeLayout(w, h);
    entry.layout();
    const spot = entry.heroSpot();
    if (!spot) return base;
    const z = base.z;
    const heroScale = spot.h / (HERO_NATIVE_H * z * (0.92 + HOME_D * 0.12));
    const feet = spot.y + spot.h / 2;
    const flat = world.makeLayout(w, h, { z, basePx: 0, camX: ENTRY_CAM });
    const basePx = (feet / z - world.playerY(flat, ENTRY_CAM, HOME_D)) * z;
    const L = world.makeLayout(w, h, { z, basePx, camX: ENTRY_CAM + (w / 2 - spot.x) / z });
    L.heroScale = heroScale;
    view.heroScale = heroScale;
    return L;
  }

  /* 首頁構圖：
     - 卡片在左：場景從卡片右緣開始，房子與角色都不被遮
     - 卡片在上（手機）：角色緊接在卡片下方，近景花草補滿下半部 */
  function startLayout(w, h) {
    const card = document.querySelector('.start-card').getBoundingClientRect();
    const SCENE_LEFT = 62;
    const SCENE_SPAN = 830;
    if (!card.width) {
      /* 選單蓋住場景時卡片已隱藏，沿用置中的社區構圖 */
      const base = world.makeLayout(w, h);
      return world.makeLayout(w, h, { z: base.z, camX: 700 });
    }
    if (card.width > w * 0.6) {
      const z = clamp(w / 390, 0.75, 1.2);
      const legal = document.getElementById('legal').offsetHeight;
      const basePx = Math.min(card.bottom + 24 + 166 * z, h - legal - 128 * z);
      const L = world.makeLayout(w, h, { z, basePx, camX: 660 });
      /* 短直式讓角色完整落在首頁卡與法定頁尾之間。 */
      const room = h - legal - card.bottom - 24;
      const heroHeight = HERO_NATIVE_H * z * (0.92 + HOME_D * 0.12);
      L.heroScale = Math.min(1, Math.max(1, room) / heroHeight);
      const feet = Math.max(card.bottom + 12 + heroHeight * L.heroScale,
        Math.min(world.playerY(L, 660, HOME_D) * z, h - legal - 12));
      L.base += feet / z - world.playerY(L, 660, HOME_D);
      return L;
    }
    const gap = 16;
    const z = clamp((w - card.right - gap) / SCENE_SPAN, 0.55, 1.05);
    const left = SCENE_LEFT - (card.right + gap) / z;
    return world.makeLayout(w, h, { z, camX: left + w / z / 2 });
  }

  function sizeEndingCanvas() {
    if (state.screen !== 'ending') return;
    const w = Math.max(1, endingCanvas.clientWidth);
    const h = Math.max(1, endingCanvas.clientHeight);
    endingCanvas.width = Math.round(w * dpr);
    endingCanvas.height = Math.round(h * dpr);
    endingKey = `${w}x${h}`;
  }

  function drawScene() {
    ctx.setTransform(dpr * layout.z, 0, 0, dpr * layout.z, 0, 0);
    world.render(ctx, layout, {
      t: artTime(),
      cam: view.cam,
      lift: view.lift,
      heroScale: view.heroScale,
      bottomSafe: document.getElementById('legal').offsetHeight / layout.z,
      shake: view.shake,
      riskView: state.riskView,
      theme: view.theme,
      mood: view.mood,
      gear: view.gear,
      decor: view.decor,
      npcs: view.npcs,
      events: state.events,
      eventIndex: state.eventIndex,
      nearEvent: state.nearEvent && state.screen === 'play',
      player: state.player,
      walkTarget: view.walkTarget,
      particles: view.particles,
      npcSpeech: state.screen === 'play' && !state.player.say ? view.npcSpeech : null,
      topSafe: (document.getElementById('hud').getBoundingClientRect().bottom + 22) / layout.z,
    });
  }

  function drawEnding() {
    if (!state.ending) return;
    const w = endingCanvas.clientWidth;
    const h = endingCanvas.clientHeight;
    if (!w || !h) return;
    if (endingKey !== `${w}x${h}`) sizeEndingCanvas();
    endingCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    art.viewZ = 1;
    (art.endings[state.ending.gradeKey] || art.endings[state.ending.tier])(endingCtx, w, h, artTime());
  }

  /* 結局畫面蓋住場景時不用重畫，省電 */
  let needsRedraw = true;
  let rafId = 0;
  let lastTime = 0;

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    if (!layout) return;
    update(dt);
    if (state.screen === 'ending') {
      if (needsRedraw) {
        drawScene();
        needsRedraw = false;
      }
      drawEnding();
    } else {
      drawScene();
    }
  }

  function setPaused(paused) {
    if (paused === state.paused) return;
    state.paused = paused;
    if (paused) {
      cancelAnimationFrame(rafId);
      input.keys.clear();
      audio.suspend();
    } else {
      lastTime = performance.now();
      rafId = requestAnimationFrame(frame);
      audio.resume();
    }
  }

  /* 輸入 ---------------------------------------------------------- */
  const KEY_DIRS = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down',
  };
  const OPT_KEYS = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
  const NUM_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 };

  function toggleSound() {
    const on = !audio.enabled;
    if (audio.setEnabled(on)) {
      ui.setSound(on);
      store.data.sound = on;
      store.save();
      if (on) {
        if (view.theme && (state.screen === 'play' || state.screen === 'card')) {
          const i = stageIndex(state.player.x);
          audio.setAmbience(view.theme.ambience[i], view.theme.birds[i] > 0.5);
        } else {
          audio.setAmbience(0, true);
        }
        setTimeout(() => audio.pop(), 60);
      }
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (ui.modalOpen) {
      if (e.code === 'Escape') ui.closeModal();
      return;
    }
    if (e.code === 'KeyM' && !e.repeat) toggleSound();
    if (e.code === 'Escape') {
      if (state.screen === 'intro') toEntry();
      else if (state.screen === 'entry' && !entry.clear()) toStart();
      return;
    }

    if (state.screen === 'card') {
      const ev = state.current;
      /* 作答前：方向鍵在選項間移動焦點（頭尾循環），Enter／空白鍵選取 */
      if (ev && !ev.done && OPT_KEYS[e.code]) {
        e.preventDefault();
        const opts = [...document.querySelectorAll('#card-opts .opt')];
        const i = opts.indexOf(document.activeElement);
        const to = i < 0 ? (OPT_KEYS[e.code] > 0 ? 0 : opts.length - 1) : (i + OPT_KEYS[e.code] + opts.length) % opts.length;
        if (opts[to]) opts[to].focus();
        return;
      }
      if (KEY_DIRS[e.code]) input.keys.add(KEY_DIRS[e.code]);
      if (ev && !ev.done && e.code in NUM_KEYS && !e.repeat) {
        e.preventDefault();
        answer(NUM_KEYS[e.code]);
      } else if (ev && ev.done && !e.repeat && !e.target.closest('summary, a') && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) {
        e.preventDefault();
        continueAfterAnswer();
      }
      return;
    }
    if (state.screen !== 'play') return;

    if (KEY_DIRS[e.code]) {
      input.keys.add(KEY_DIRS[e.code]);
      view.walkTarget = null;
      e.preventDefault();
    } else if ((e.code === 'KeyE' || e.code === 'Space') && !e.repeat) {
      e.preventDefault();
      interact();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (KEY_DIRS[e.code]) input.keys.delete(KEY_DIRS[e.code]);
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    releaseJoy();
  });

  /* 點地面走過去、拖曳看周圍 */
  const drag = { id: null, x: 0, y: 0, moved: false, startPan: 0 };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') document.body.classList.add('touch');
    if (state.screen !== 'play') return;
    drag.id = e.pointerId;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved = false;
    drag.startPan = view.pan;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.hypot(dx, e.clientY - drag.y) > 10) drag.moved = true;
    if (drag.moved) view.pan = clamp(drag.startPan - dx / layout.z, -700, 700);
  });
  function endDrag(e) {
    if (e.pointerId !== drag.id) return;
    drag.id = null;
    if (e.type !== 'pointerup' || drag.moved || state.screen !== 'play') return;
    const left = view.cam.x - layout.vw / 2;
    const wx = clamp(e.clientX / layout.z + left, 30, MAX_X);
    const wy = e.clientY / layout.z + view.lift;
    const top = world.pathTop(layout, wx);
    const d = clamp((wy - top - 16) / (world.PATH_H - 32), 0, 1);
    view.walkTarget = { x: wx, d };
    view.pan = 0;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  /* 虛擬搖桿 */
  const joy = document.getElementById('joy');
  const knob = document.getElementById('joy-knob');
  let joyId = null;
  function joyMove(e) {
    const r = joy.getBoundingClientRect();
    const max = r.width * 0.36;
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > max) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / max;
    const ny = dy / max;
    const dead = Math.hypot(nx, ny) < 0.14;
    input.joy.x = dead ? 0 : nx;
    input.joy.y = dead ? 0 : ny;
  }
  function releaseJoy() {
    joyId = null;
    input.joy.x = 0;
    input.joy.y = 0;
    knob.style.transform = '';
  }
  joy.addEventListener('pointerdown', (e) => {
    joyId = e.pointerId;
    joy.setPointerCapture(e.pointerId);
    joyMove(e);
    e.preventDefault();
  });
  joy.addEventListener('pointermove', (e) => {
    if (e.pointerId === joyId) joyMove(e);
  });
  joy.addEventListener('pointerup', releaseJoy);
  joy.addEventListener('pointercancel', releaseJoy);

  /* 分享 ---------------------------------------------------------- */
  async function share() {
    const end = state.ending;
    if (!end) return;
    const h = hazardById(state.hazard);
    const text = `我在《數位災害》完成了「${h.name}」演練，結果是「${end.title}」，風險值 ${Math.round(end.risk)}。一起來練習防災吧！`;
    const url = (location.hostname.endsWith('aimingdata.com') ? location.origin + '/' : location.href.split('?')[0]);
    if (navigator.share) {
      try {
        await navigator.share({ title: '數位災害', text, url });
      } catch (e) { /* 使用者取消分享 */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      ui.toast('已複製分享文字', 'good');
    } catch (e) {
      ui.toast('這個瀏覽器無法複製，手動截圖分享吧', 'warn');
    }
  }

  /* 測試鉤子 -------------------------------------------------------- */
  const GRADE_RISK = { good: 10, normal: 60, bad: 100 };

  window.__game = {
    state,
    view,
    store,
    rng,
    audio,
    getBank: () => bank,
    getHazards: () => hazards,
    startGame,
    interact,
    selectHazard,
    backToMenu: toEntry,
    teleportToNextEvent() {
      const ev = nextEvent();
      if (!ev || state.screen !== 'play') return null;
      state.player.x = ev.x - 110;
      view.walkTarget = null;
      return ev.scenario.id;
    },
    teleportToFinish() {
      if (state.screen !== 'play') return false;
      state.player.x = FINISH_X - 60;
      view.walkTarget = null;
      return true;
    },
    triggerNextEvent() {
      const ev = nextEvent();
      if (!ev || state.screen !== 'play') return null;
      state.player.x = ev.x - 60;
      openEvent(ev);
      return ev.scenario.id;
    },
    /* i 是畫面上的選項順序（洗牌後），可搭配 correctIndex() 使用 */
    answer,
    correctIndex() {
      return state.current ? state.current.options.findIndex((o) => o.correct) : -1;
    },
    wrongIndex() {
      return state.current ? state.current.options.findIndex((o) => !o.correct) : -1;
    },
    continue() {
      answerLockUntil = 0;
      return continueAfterAnswer();
    },
    /* 不帶參數：以目前風險直接結束。可帶 'good'｜'normal'｜'bad' 或數字指定風險。 */
    skipToEnding(what) {
      if (state.screen !== 'play' && state.screen !== 'card') startGame(state.hazard || (hazards[0] && hazards[0].id));
      if (typeof what === 'number') state.risk = clamp(what, 0, 100);
      else if (what in GRADE_RISK) state.risk = GRADE_RISK[what];
      state.riskView = state.risk;
      finish(state.risk < 100);
      return state.ending;
    },
  };

  /* 啟動 ---------------------------------------------------------- */
  ui.init({
    start: toEntry,
    again: () => startGame(state.hazard),
    toEntry,
    toStart,
    go: () => startGame(state.hazard),
    selectHazard,
    preview(id, faceLeft) {
      /* 主角換上該災害的裝備，轉頭看向選中的圖章 */
      const def = id ? scenes.THEMES[id] : null;
      view.gear = def ? (def.gear[1] || {}) : {};
      state.player.dir = faceLeft ? -1 : 1;
      state.player.pose = id ? 'wave' : 'idle';
    },
    retryLoad: () => loadData().then(afterLoad),
    share,
    next: () => continueAfterAnswer(),
    answer,
    interact,
    toggleSound,
    hazards: () => hazards,
    bankSize: () => bank.length,
    recordsChanged() {
      ui.renderEntry(hazards, countOf);
    },
    modalChange() {
      input.keys.clear();
      releaseJoy();
    },
  });

  function afterLoad() {
    if (state.screen === 'loading') state.screen = 'start';
    /* 載入失敗的提示會把卡片撐高，重算首頁構圖 */
    resize();
    if (hazardParam && state.bankReady) {
      if (!startGame(hazardParam)) toEntry();
    }
  }

  if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

  /* 上次開著音效：按鈕先顯示開啟，AudioContext 等第一次手勢才建立 */
  if (store.data.sound) {
    audio.restore(true);
    ui.setSound(true);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  document.addEventListener('visibilitychange', () => setPaused(document.hidden));

  useTheme('home');
  setScreen('loading');
  resetPlayer(ATTRACT.lo + 60);
  state.player.d = 0.55;
  resize();
  view.cam.x = layout.camX;
  rafId = requestAnimationFrame(frame);
  loadData().then(afterLoad);
})();
