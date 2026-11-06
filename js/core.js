/* 純邏輯：亂數、抽題、分級、紀錄。不碰畫面。 */
(function () {
  const DH = (window.DH = window.DH || {});

  const SECTIONS = [
    { key: 'before', name: '災前準備', short: '災前', from: 0, to: 1800 },
    { key: 'during', name: '災害當下', short: '當下', from: 1800, to: 3700 },
    { key: 'after', name: '災後', short: '災後', from: 3700, to: 5400 },
  ];
  const FINISH_X = 5400;
  const STAGE_KEYS = SECTIONS.map((s) => s.key);
  const TOTAL_QUESTIONS = 8;
  const HAZARD_IDS = ['earthquake', 'tsunami', 'typhoon', 'flood', 'debris', 'temperature', 'air', 'drought', 'blackout', 'nuclear'];

  function sectionAt(x) {
    for (const s of SECTIONS) if (x < s.to) return s;
    return SECTIONS[SECTIONS.length - 1];
  }

  function makeRng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
    return {
      next,
      int,
      range: (lo, hi) => lo + next() * (hi - lo),
      pick: (arr) => arr[Math.floor(next() * arr.length)],
      shuffle(arr) {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = int(0, i);
          [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
      },
    };
  }

  const isText = (v) => typeof v === 'string' && v.trim() !== '';
  const isLink = (l) => !!l && isText(l.agency) && isText(l.title) && isText(l.url) && l.url.startsWith('https://');

  function isValidScenario(s) {
    return !!s
      && isText(s.id)
      && isText(s.hazard)
      && isText(s.category)
      && STAGE_KEYS.includes(s.stage)
      && isText(s.title)
      && isText(s.situation)
      && Array.isArray(s.options) && s.options.length === 3 && s.options.every(isText)
      && Number.isInteger(s.answer) && s.answer >= 0 && s.answer <= 2
      && Array.isArray(s.risk) && s.risk.length === 3
      && s.risk.every((n, i) => Number.isFinite(n) && (i === s.answer ? n === 0 : n >= 10))
      && isText(s.why)
      && isText(s.keypoint)
      && Array.isArray(s.sources) && s.sources.length >= 1 && s.sources.every(isLink);
  }

  function cleanBank(raw) {
    if (!Array.isArray(raw)) return [];
    const seen = new Set();
    const out = [];
    for (const s of raw) {
      if (!isValidScenario(s) || seen.has(s.id)) {
        console.warn('略過格式不符的題目：', s && s.id);
        continue;
      }
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }

  /* 只留有題目的災害；未列在 HAZARD_IDS 的沒有對應場景，不開放 */
  function cleanHazards(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const h of raw) {
      if (!h || !HAZARD_IDS.includes(h.id) || !isText(h.name)) {
        console.warn('略過格式不符的災害：', h && h.id);
        continue;
      }
      out.push({
        id: h.id,
        name: h.name,
        tagline: isText(h.tagline) ? h.tagline : '',
        intro: isText(h.intro) ? h.intro : '',
        links: Array.isArray(h.links) ? h.links.filter(isLink) : [],
        order: Number.isFinite(h.order) ? h.order : HAZARD_IDS.indexOf(h.id),
      });
    }
    return out.sort((a, b) => a.order - b.order);
  }

  /* 0 = 沒看過、1 = 看過但沒答對過、2 = 答對過。數字小的先抽。 */
  function freshness(id, history) {
    const h = history && history[id];
    if (!h) return 0;
    return h.correct > 0 ? 2 : 1;
  }

  function byFreshness(list, rng, history) {
    return rng.shuffle(list)
      .map((s, i) => ({ s, i, f: freshness(s.id, history) }))
      .sort((a, b) => a.f - b.f || a.i - b.i)
      .map((e) => e.s);
  }

  /* 每局 8 題：當下 3 題，災前與災後一邊 2、一邊 3。
     某階段題目不夠時從其他階段補，但補來的題目留在自己的階段，場景才對得上。 */
  function pickScenarios(bank, hazardId, rng, history) {
    const pool = bank.filter((s) => s.hazard === hazardId);
    const more = rng.next() < 0.5 ? 'before' : 'after';
    const quota = { before: 2, during: 3, after: 2 };
    quota[more] = 3;
    const chosen = [];
    const taken = new Set();
    STAGE_KEYS.forEach((k) => {
      byFreshness(pool.filter((s) => s.stage === k), rng, history).slice(0, quota[k]).forEach((s) => {
        chosen.push(s);
        taken.add(s.id);
      });
    });
    const spare = byFreshness(pool.filter((s) => !taken.has(s.id)), rng, history);
    while (chosen.length < TOTAL_QUESTIONS && spare.length) chosen.push(spare.shift());
    const grouped = [];
    STAGE_KEYS.forEach((k) => {
      grouped.push(...rng.shuffle(chosen.filter((s) => s.stage === k)));
    });
    return grouped;
  }

  /* 把題目排進三段場景的 x 座標，並洗牌選項。 */
  function buildEvents(scenarios, rng) {
    const events = [];
    SECTIONS.forEach((sec) => {
      const list = scenarios.filter((s) => s.stage === sec.key);
      const lead = sec.key === 'before' ? 520 : 170;
      const tail = sec.key === 'after' ? 280 : 130;
      const span = sec.to - sec.from - lead - tail;
      list.forEach((scenario, i) => {
        const slot = span / list.length;
        events.push({
          scenario,
          x: Math.round(sec.from + lead + slot * (i + 0.5) + rng.range(-0.15, 0.15) * slot),
          d: rng.range(0.25, 0.75),
          options: rng.shuffle(scenario.options.map((text, orig) => ({
            text,
            orig,
            risk: scenario.risk[orig],
            correct: orig === scenario.answer,
          }))),
          done: false,
          correct: null,
        });
      });
    });
    return events;
  }

  const GRADES = [
    {
      key: 'master', tier: 'good', max: 20,
      kicker: '好結局',
      title: '防災小達人',
      message: '從準備到災後都很穩！把這些觀念分享給家人吧。',
    },
    {
      key: 'safe', tier: 'good', max: 50,
      kicker: '好結局',
      title: '有驚無險',
      message: '大部分都判斷得很好，看看總結，下次更從容。',
    },
    {
      key: 'improve', tier: 'normal', max: 80,
      kicker: '普通結局',
      title: '平安但需加強',
      message: '平安走完了！把答錯的題目看熟，再挑戰一次吧。',
    },
    {
      key: 'narrow', tier: 'normal', max: 100,
      kicker: '普通結局',
      title: '險象環生',
      message: '有點驚險，但在演練答錯，總比真的遇到才學好。',
    },
    {
      key: 'rescue', tier: 'bad', max: Infinity,
      kicker: '求援結局',
      title: '需要求援',
      message: '沒關係，及早求援也是好判斷。看熟提醒，下次更穩。',
    },
  ];

  function gradeFor(risk) {
    return GRADES.find((g) => risk < g.max);
  }

  const RISK_STOPS = [
    [0, [91, 191, 122]],
    [40, [242, 201, 76]],
    [70, [242, 153, 74]],
    [100, [229, 72, 77]],
  ];
  function riskRgb(risk) {
    for (let i = 1; i < RISK_STOPS.length; i++) {
      const [p1, c1] = RISK_STOPS[i];
      const [p0, c0] = RISK_STOPS[i - 1];
      if (risk <= p1) {
        const t = (risk - p0) / (p1 - p0);
        return c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
      }
    }
    return RISK_STOPS[RISK_STOPS.length - 1][1];
  }
  const riskColor = (risk) => `rgb(${riskRgb(Math.max(0, risk)).join(',')})`;

  const HAZARD_BADGES = {
    earthquake: '地震', tsunami: '海嘯', typhoon: '颱風強風', flood: '豪雨淹水', debris: '土石流',
    temperature: '高低溫', air: '空氣品質', drought: '乾旱停水', blackout: '停電', nuclear: '核與輻射',
  };
  const BADGES = [
    ...HAZARD_IDS.map((id) => ({ id: `done-${id}`, name: `${HAZARD_BADGES[id]}演練員`, desc: `完成一次${HAZARD_BADGES[id]}演練` })),
    { id: 'legend', name: '穩穩的判斷', desc: '風險低於 20 完成演練' },
    { id: 'zero', name: '滿分應變', desc: '演練分數 0 完成' },
    { id: 'streak5', name: '判斷連發', desc: '一局中連續答對 5 題' },
    { id: 'rescue', name: '勇於求援', desc: '經歷一次求援結局' },
    { id: 'all', name: '防災達人', desc: '十種災害全部完成' },
  ];

  const STORE_KEY = 'digital-disaster.v1';
  /* sound：音效＋背景音樂開關的偏好，跟紀錄存在同一個 key */
  const emptyStore = () => ({ plays: 0, byHazard: {}, seen: {}, badges: [], sound: false });
  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

  /* localStorage 可能被擋（隱私模式），退回記憶體內的一份，遊戲照常進行。 */
  const store = {
    data: emptyStore(),
    load() {
      this.data = emptyStore();
      try {
        const raw = localStorage.getItem(STORE_KEY);
        const saved = raw ? JSON.parse(raw) : null;
        if (isObject(saved)) {
          if (Number.isFinite(saved.plays)) this.data.plays = saved.plays;
          if (isObject(saved.byHazard)) this.data.byHazard = saved.byHazard;
          if (isObject(saved.seen)) this.data.seen = saved.seen;
          if (Array.isArray(saved.badges)) this.data.badges = saved.badges;
          if (typeof saved.sound === 'boolean') this.data.sound = saved.sound;
        }
      } catch (e) { /* 讀不到就從空白開始 */ }
      return this.data;
    },
    save() {
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify(this.data));
      } catch (e) { /* 存不了就只留在這次遊玩 */ }
    },
    /* 清紀錄不動音效偏好 */
    reset() {
      const { sound } = this.data;
      this.data = emptyStore();
      this.data.sound = sound;
      this.save();
    },
    hazard(id) {
      return this.data.byHazard[id] || (this.data.byHazard[id] = { plays: 0, finishes: 0, rescues: 0, best: null });
    },
    bestOf(id) {
      const h = this.data.byHazard[id];
      return h ? h.best : null;
    },
    recordStart(id) {
      this.data.plays++;
      this.hazard(id).plays++;
      this.save();
    },
    recordAnswer(id, correct) {
      const h = this.data.seen[id] || (this.data.seen[id] = { seen: 0, correct: 0 });
      h.seen++;
      if (correct) h.correct++;
      this.save();
    },
    /* 回傳本局新解鎖的徽章。 */
    recordEnding({ hazard, risk, grade, completed, bestStreak }) {
      const d = this.data;
      const h = this.hazard(hazard);
      if (completed) h.finishes++;
      else h.rescues++;
      const cur = { risk, title: grade.title, tier: grade.tier, completed, date: new Date().toISOString().slice(0, 10) };
      const isNewBest = !h.best
        || (completed && !h.best.completed)
        || (completed === h.best.completed && risk < h.best.risk);
      if (isNewBest) h.best = cur;
      const earned = [];
      if (completed) earned.push(`done-${hazard}`);
      if (completed && risk < 20) earned.push('legend');
      if (completed && risk === 0) earned.push('zero');
      if (bestStreak >= 5) earned.push('streak5');
      if (!completed) earned.push('rescue');
      const fresh = earned.filter((id) => !d.badges.includes(id));
      d.badges.push(...fresh);
      if (!d.badges.includes('all') && HAZARD_IDS.every((id) => d.badges.includes(`done-${id}`))) {
        d.badges.push('all');
        fresh.push('all');
      }
      this.save();
      return { fresh, isNewBest };
    },
  };

  DH.core = {
    SECTIONS, FINISH_X, STAGE_KEYS, BADGES, GRADES, HAZARD_IDS, TOTAL_QUESTIONS,
    sectionAt, makeRng, cleanBank, cleanHazards, byFreshness, pickScenarios, buildEvents,
    gradeFor, riskColor, store,
  };
})();
