/* 所有音效以 WebAudio 即時合成，無音檔，未取樣或引用任何真實警報器／官方警報（如國家級警報、PWS）音檔，音型刻意不同於官方警報。
 * WebAudio 合成音效與程序生成背景音樂（BGM）。預設靜音，使用者開啟後才建立 AudioContext。 */
(function () {
  const DH = (window.DH = window.DH || {});
  let ctx = null;
  let master = null;
  let windGain = null;
  let birdTimer = null;
  let enabled = false;
  let birdsWanted = true;

  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /* Safari／WebKit 的 resume() 不在手勢內會被拒絕；吃掉 rejection，下一次點擊再試 */
  function wake() {
    const p = ctx.resume();
    if (p && p.catch) p.catch(() => {});
  }

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
    } catch (err) {
      /* 沒有音訊裝置或瀏覽器拒絕時，遊戲照常進行 */
      console.warn('無法建立音效：', err.message);
      return false;
    }
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    const wind = ctx.createBufferSource();
    wind.buffer = noiseBuffer(3);
    wind.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    const lfo = ctx.createOscillator();
    const lfoAmt = ctx.createGain();
    lfo.frequency.value = 0.13;
    lfoAmt.gain.value = 170;
    lfo.connect(lfoAmt).connect(lp.frequency);
    wind.connect(lp).connect(windGain).connect(master);
    wind.start();
    lfo.start();
    initBgm();
    return true;
  }

  function tone(freq, start, dur, vol, type, slideTo) {
    const t = ctx.currentTime + start;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function chirp() {
    if (!enabled || ctx.state !== 'running') return;
    const base = 2100 + Math.random() * 1400;
    const notes = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < notes; i++) {
      tone(base, i * 0.13, 0.09, 0.022, 'sine', base * (1.12 + Math.random() * 0.25));
    }
  }

  function scheduleBirds() {
    clearTimeout(birdTimer);
    if (!enabled) return;
    birdTimer = setTimeout(() => {
      if (birdsWanted) chirp();
      scheduleBirds();
    }, 3500 + Math.random() * 7000);
  }

  const play = (fn) => {
    if (enabled && ctx && ctx.state === 'running') fn();
  };

  /* ===================================================================
     背景音樂：全部由振盪器即時合成，沒有音檔。
     訊號鏈：各聲部 → 曲目 gain（淡入淡出） → 壓縮器 → 低通 → BGM 匯流排（靜音時 0） → master
     排程：lookahead scheduler，每 TICK_MS 檢查一次、只排到 LOOKAHEAD 秒以內的音符，
           每顆音符用完即 stop() 並 disconnect，不會堆積節點。
     =================================================================== */
  const BGM_LEVEL = 0.08;
  const FADE = 1.0;
  const LOOKAHEAD = 0.25;
  const TICK_MS = 100;
  let bgmBus = null;
  let bgmIn = null;
  let bgmLevel = 0;
  let current = null;
  let wanted = { track: null, variant: null };
  let voices = 0;
  let hatBuffer = null;

  const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

  /* 樂譜寫法：chords 每小節一組音（MIDI 編號），pattern 字串每格一個八分音符：
     '.' 休止、'0'–'9' 和弦音序號（超過和弦音數就往上八度）、'a'–'j' 同序號但較輕。
     lead 為 [小節, 格, MIDI, 長度(格), 力度] 的旋律線。 */
  const TRACKS = {
    /* 入口：柔和的音樂盒，C 大調 I–vi–IV–V */
    entry: {
      bpm: 70,
      chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 64], [60, 64, 67, 71], [52, 55, 59, 62], [53, 57, 60, 64], [55, 59, 62, 67]],
      pad: { vol: 0.42, type: 'sine' },
      bass: { pattern: '0.......', oct: -12, vol: 0.4, hold: 0.95 },
      arp: { patterns: ['0.2.1.3.', '2.3.1.0.'], oct: 12, vol: 0.2, voice: 'pluck', hold: 1.6 },
    },
    /* 災前：溫暖的日常，F 大調，輕快的撥弦 */
    calm: {
      bpm: 84,
      chords: [[53, 57, 60], [57, 60, 64, 67], [58, 62, 65], [55, 60, 64], [53, 57, 60], [50, 53, 57, 60], [58, 62, 65], [55, 60, 64]],
      pad: { vol: 0.3, type: 'triangle' },
      bass: { pattern: '0...2...', oct: -12, vol: 0.42, hold: 0.9 },
      arp: { patterns: ['0.1.2.1.', '0.2.1.3.'], oct: 12, vol: 0.18, voice: 'pluck', hold: 1.3 },
      lead: {
        vol: 0.16,
        notes: [[0, 4, 69, 2], [0, 6, 72, 2], [1, 0, 76, 6], [2, 0, 74, 4], [2, 4, 70, 2], [3, 0, 72, 7], [4, 4, 69, 2], [4, 6, 72, 2], [5, 0, 74, 4], [5, 4, 72, 2], [6, 0, 70, 4], [6, 4, 74, 2], [7, 0, 72, 8]],
      },
    },
    /* 災害當下：D 小調，八分音符低音脈動、固定音型，較快但音色柔和 */
    tense: {
      bpm: 116,
      chords: [[50, 53, 57], [50, 53, 57], [50, 53, 58], [50, 55, 58], [50, 53, 57], [50, 53, 58], [50, 55, 58], [52, 57, 60]],
      pad: { vol: 0.26, type: 'sine' },
      bass: { pattern: '0a0a0a0a', oct: -12, vol: 0.5, hold: 0.8 },
      kick: '0...0...',
      hat: '.h.h.h.h',
      arp: { patterns: ['0.2.1.2.', '0.2.1.3.'], oct: 0, vol: 0.14, voice: 'soft', hold: 0.7 },
      lead: {
        vol: 0.14,
        notes: [[1, 0, 69, 6], [2, 0, 67, 3], [2, 4, 65, 3], [3, 0, 64, 8], [5, 0, 65, 3], [5, 4, 64, 3], [6, 0, 62, 6], [7, 0, 64, 8]],
      },
    },
    /* 災後：G 大調，慢速、長音墊與舒緩旋律 */
    relief: {
      bpm: 76,
      chords: [[55, 59, 62], [54, 57, 62], [52, 55, 59, 62], [55, 60, 64], [55, 59, 62], [52, 55, 59], [55, 60, 64], [54, 57, 62]],
      pad: { vol: 0.5, type: 'sine' },
      bass: { pattern: '0.......', oct: -12, vol: 0.4, hold: 0.95 },
      arp: { patterns: ['0...1.2.', '0.....1.'], oct: 12, vol: 0.14, voice: 'pluck', hold: 1.8 },
      lead: {
        vol: 0.18,
        notes: [[0, 0, 71, 4], [0, 4, 74, 4], [1, 0, 69, 6], [2, 0, 67, 4], [2, 4, 71, 4], [3, 0, 72, 8], [4, 0, 71, 4], [4, 4, 67, 4], [5, 0, 64, 6], [6, 0, 67, 4], [6, 4, 69, 4], [7, 0, 66, 8]],
      },
    },
  };

  /* 結局：依等級微調，好結局亮一點、求援結局慢而安穩（不嚇人） */
  const ENDING = {
    good: {
      bpm: 80,
      chords: [[60, 64, 67], [55, 59, 62, 67], [57, 60, 64], [53, 57, 60, 65], [60, 64, 67], [53, 57, 60, 65], [55, 59, 62, 67], [60, 64, 67, 72]],
      pad: { vol: 0.38, type: 'sine' },
      bass: { pattern: '0...0...', oct: -12, vol: 0.4, hold: 0.9 },
      arp: { patterns: ['0.1.2.3.', '2.3.1.0.'], oct: 12, vol: 0.18, voice: 'bell', hold: 1.8 },
      lead: {
        vol: 0.18,
        notes: [[0, 0, 67, 2], [0, 2, 72, 2], [0, 4, 76, 4], [1, 0, 74, 6], [2, 0, 72, 4], [2, 4, 69, 4], [3, 0, 72, 8], [4, 0, 76, 4], [4, 4, 79, 4], [5, 0, 77, 6], [6, 0, 74, 4], [6, 4, 71, 4], [7, 0, 72, 8]],
      },
    },
    normal: {
      bpm: 76,
      chords: [[60, 64, 67], [55, 59, 62, 67], [57, 60, 64], [53, 57, 60, 65], [60, 64, 67], [53, 57, 60, 65], [55, 59, 62, 67], [60, 64, 67, 72]],
      pad: { vol: 0.4, type: 'sine' },
      bass: { pattern: '0.......', oct: -12, vol: 0.4, hold: 0.95 },
      arp: { patterns: ['0...1.2.', '2...1.0.'], oct: 12, vol: 0.16, voice: 'pluck', hold: 1.8 },
      lead: {
        vol: 0.16,
        notes: [[0, 0, 67, 4], [0, 4, 72, 4], [1, 0, 71, 6], [2, 0, 69, 4], [2, 4, 72, 4], [3, 0, 69, 8], [4, 0, 67, 4], [4, 4, 72, 4], [5, 0, 69, 6], [6, 0, 71, 4], [6, 4, 74, 4], [7, 0, 72, 8]],
      },
    },
    bad: {
      bpm: 66,
      chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62], [57, 60, 64], [53, 57, 60], [55, 60, 64], [52, 55, 59, 64]],
      pad: { vol: 0.46, type: 'sine' },
      bass: { pattern: '0.......', oct: -12, vol: 0.36, hold: 0.95 },
      lead: {
        vol: 0.15,
        notes: [[0, 0, 64, 6], [1, 0, 65, 4], [1, 4, 64, 4], [2, 0, 60, 8], [3, 0, 62, 6], [4, 0, 64, 6], [5, 0, 65, 4], [5, 4, 69, 4], [6, 0, 67, 8], [7, 0, 64, 8]],
      },
    },
  };

  const STEPS_PER_BAR = 8;

  function chordTone(chord, idx) {
    return chord[idx % chord.length] + 12 * Math.floor(idx / chord.length);
  }

  function parseStep(ch) {
    if (ch >= '0' && ch <= '9') return { idx: ch.charCodeAt(0) - 48, vel: 1 };
    if (ch >= 'a' && ch <= 'j') return { idx: ch.charCodeAt(0) - 97, vel: 0.55 };
    return null;
  }

  function compile(def) {
    const bars = def.chords.length;
    const total = bars * STEPS_PER_BAR;
    const lead = new Array(total).fill(null);
    if (def.lead) {
      def.lead.notes.forEach(([bar, step, note, len, vel]) => {
        const at = bar * STEPS_PER_BAR + step;
        if (at < total) (lead[at] = lead[at] || []).push({ note, len, vel: vel || 1 });
      });
    }
    return { def, total, lead, stepLen: 60 / def.bpm / 2 };
  }

  function initBgm() {
    bgmBus = ctx.createGain();
    bgmBus.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3400;
    lp.Q.value = 0.4;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    bgmIn = comp;
    comp.connect(lp).connect(bgmBus).connect(master);
    hatBuffer = noiseBuffer(0.1);
  }

  /* 每顆音符：建立少量節點、排好 start/stop、結束時拆掉 */
  function finishVoice(src, nodes) {
    voices++;
    src.onended = () => {
      voices--;
      nodes.forEach((n) => n.disconnect());
    };
  }

  function pluckVoice(dest, freq, t, dur, vol, kind) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = kind === 'soft' ? 'sine' : 'triangle';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    const nodes = [o, g];
    if (kind === 'bell') {
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = 'sine';
      o2.frequency.value = freq * 3;
      g2.gain.setValueAtTime(vol * 0.18, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.4);
      o2.connect(g2).connect(dest);
      o2.start(t);
      o2.stop(t + dur * 0.4 + 0.02);
      nodes.push(o2, g2);
    }
    o.start(t);
    o.stop(t + dur + 0.03);
    finishVoice(o, nodes);
  }

  function padVoice(dest, freq, t, dur, vol, type) {
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o2.type = 'triangle';
    o2.frequency.value = freq;
    o2.detune.value = 6;
    g2.gain.value = 0.3;
    const atk = Math.min(0.9, dur * 0.3);
    const rel = Math.min(1.0, dur * 0.3);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + atk);
    g.gain.setValueAtTime(vol, t + dur - rel);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(dest);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.02);
    o2.stop(t + dur + 0.02);
    finishVoice(o, [o, o2, g, g2]);
  }

  function bassVoice(dest, freq, t, dur, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.03);
    finishVoice(o, [o, g]);
  }

  function leadVoice(dest, freq, t, dur, vol) {
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const g2 = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    o2.type = 'triangle';
    o2.frequency.value = freq;
    g2.gain.value = 0.22;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.06);
    g.gain.setValueAtTime(vol, t + Math.max(0.06, dur - 0.18));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(dest);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.02);
    o2.stop(t + dur + 0.02);
    finishVoice(o, [o, o2, g, g2]);
  }

  function kickVoice(dest, t, vol) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.22);
    finishVoice(o, [o, g]);
  }

  function hatVoice(dest, t, vol) {
    const src = ctx.createBufferSource();
    src.buffer = hatBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2400;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
    src.connect(f).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.06);
    finishVoice(src, [src, f, g]);
  }

  function scheduleStep(track, step, t) {
    const { def, stepLen, lead } = track.song;
    const dest = track.gain;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const pos = step % STEPS_PER_BAR;
    const chord = def.chords[bar];
    const barLen = stepLen * STEPS_PER_BAR;

    if (pos === 0 && def.pad) {
      chord.forEach((n) => padVoice(dest, midiHz(n), t, barLen + 0.4, def.pad.vol / chord.length, def.pad.type));
    }
    if (def.bass) {
      const hit = parseStep(def.bass.pattern[pos]);
      if (hit) {
        /* 低音撐到下一個音之前 */
        let gap = 1;
        while (gap < STEPS_PER_BAR && !parseStep(def.bass.pattern[(pos + gap) % STEPS_PER_BAR])) gap++;
        bassVoice(dest, midiHz(chordTone(chord, hit.idx) + def.bass.oct), t, stepLen * gap * def.bass.hold, def.bass.vol * hit.vel);
      }
    }
    if (def.arp) {
      const pat = def.arp.patterns[bar % def.arp.patterns.length];
      const hit = parseStep(pat[pos]);
      if (hit) pluckVoice(dest, midiHz(chordTone(chord, hit.idx) + def.arp.oct), t, stepLen * def.arp.hold, def.arp.vol * hit.vel, def.arp.voice);
    }
    if (def.kick && def.kick[pos] !== '.') kickVoice(dest, t, 0.45);
    if (def.hat && def.hat[pos] !== '.') hatVoice(dest, t, 0.09);
    const notes = lead[step];
    if (notes) notes.forEach((n) => leadVoice(dest, midiHz(n.note), t, stepLen * n.len * 0.92, def.lead.vol * n.vel));
  }

  function tick(track) {
    if (track.stopped) return;
    if (ctx.state === 'running') {
      const now = ctx.currentTime;
      /* 主執行緒卡住太久就直接跳到現在，不要一口氣補排一堆音 */
      if (track.nextTime < now - 0.1) track.nextTime = now + 0.05;
      while (track.nextTime < now + LOOKAHEAD) {
        scheduleStep(track, track.step, track.nextTime);
        track.step = (track.step + 1) % track.song.total;
        track.nextTime += track.song.stepLen;
      }
    }
    track.timer = setTimeout(() => tick(track), TICK_MS);
  }

  function startTrack(id, def) {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE);
    gain.connect(bgmIn);
    const track = { id, def, song: compile(def), gain, step: 0, nextTime: now + 0.05, timer: null, stopped: false };
    tick(track);
    return track;
  }

  function stopTrack(track) {
    track.stopped = true;
    clearTimeout(track.timer);
    const now = ctx.currentTime;
    const g = track.gain.gain;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(0, now, FADE / 3);
    g.setValueAtTime(0, now + FADE);
    /* 排進去的長音最多一小節多一點，等它們都停了再拆 */
    setTimeout(() => track.gain.disconnect(), (FADE + 5) * 1000);
  }

  function defFor(name, variant) {
    if (name === 'ending') return ENDING[variant] || ENDING.normal;
    return TRACKS[name] || null;
  }

  function trackId(name, variant) {
    return name === 'ending' ? `ending:${variant || 'normal'}` : name;
  }

  /* 把目前想要的曲目對齊到實際播放中的；沒開音效或沒 ctx 就只記住 */
  function syncMusic() {
    if (!ctx || !enabled) return;
    const def = defFor(wanted.track, wanted.variant);
    const id = def ? trackId(wanted.track, wanted.variant) : null;
    if (current && current.id === id) return;
    if (current) stopTrack(current);
    current = def ? startTrack(id, def) : null;
  }

  function setBusLevel(level) {
    bgmLevel = level;
    if (!bgmBus) return;
    const now = ctx.currentTime;
    bgmBus.gain.cancelScheduledValues(now);
    bgmBus.gain.setTargetAtTime(level, now, FADE / 3);
    bgmBus.gain.setValueAtTime(level, now + FADE);
  }

  /* 使用者手勢：記得要開音效但還沒建 ctx（重新載入後）就在這裡建；ctx 被系統中斷就喚醒 */
  function onGesture() {
    if (!enabled) return;
    if (!ctx) {
      if (!init()) return;
      setBusLevel(BGM_LEVEL);
      windGain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.4);
      scheduleBirds();
    }
    if (ctx.state !== 'running') wake();
    syncMusic();
  }
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach((ev) => document.addEventListener(ev, onGesture, true));

  DH.audio = {
    get enabled() { return enabled; },
    setEnabled(on) {
      if (on && !init()) return false;
      enabled = on;
      if (ctx) {
        windGain.gain.setTargetAtTime(on ? 0.05 : 0, ctx.currentTime, 0.4);
        if (on) wake();
        setBusLevel(on ? BGM_LEVEL : 0);
        if (on) syncMusic();
        else if (current) {
          stopTrack(current);
          current = null;
        }
      }
      scheduleBirds();
      return true;
    },
    /* 重新載入時還原偏好：不在手勢內，先不建 AudioContext，等第一次點擊／按鍵 */
    restore(on) {
      enabled = !!on;
    },
    /* 頁籤切走時暫停，切回來時恢復。 */
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && enabled) wake(); },
    /* 平常有鳥叫；level 0–1 是當下的風雨聲大小。 */
    setAmbience(level, birds) {
      birdsWanted = !!birds;
      if (ctx && enabled) windGain.gain.setTargetAtTime(0.045 + (level || 0) * 0.14, ctx.currentTime, 1.2);
    },
    /* 背景音樂：'entry'｜'calm'｜'tense'｜'relief'｜'ending'（variant 為結局等級）｜null */
    setTrack(name, variant) {
      wanted = { track: name || null, variant: variant || null };
      syncMusic();
    },
    /* 測試與除錯用 */
    state() {
      return {
        ctx: ctx ? ctx.state : null,
        enabled,
        muted: !enabled,
        track: current ? current.id : null,
        wanted: wanted.track ? trackId(wanted.track, wanted.variant) : null,
        bgmGain: bgmLevel,
        busGain: bgmBus ? bgmBus.gain.value : 0,
        trackGain: current ? current.gain.gain.value : 0,
        step: current ? current.step : -1,
        voices,
      };
    },
    step() {
      play(() => {
        const src = ctx.createBufferSource();
        src.buffer = noiseBuffer(0.07);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 500 + Math.random() * 400;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.05, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.07);
        src.connect(f).connect(g).connect(master);
        src.start();
      });
    },
    correct() {
      play(() => {
        tone(880, 0, 0.22, 0.14, 'triangle');
        tone(1318, 0.11, 0.34, 0.13, 'triangle');
      });
    },
    wrong() {
      play(() => {
        tone(170, 0, 0.32, 0.26, 'sine', 80);
        tone(110, 0.05, 0.3, 0.14, 'triangle', 70);
      });
    },
    pop() { play(() => tone(620, 0, 0.1, 0.09, 'sine', 900)); },
    jingle() {
      play(() => [523, 659, 784].forEach((n, i) => tone(n, i * 0.12, 0.28, 0.09, 'triangle')));
    },
    fanfare() {
      play(() => [523, 659, 784, 1046].forEach((n, i) => tone(n, i * 0.15, 0.42, 0.11, 'triangle')));
    },
    /* 所有音效以 WebAudio 即時合成，無音檔，未取樣或引用任何真實警報器／官方警報（如國家級警報、PWS）音檔，音型刻意不同於官方警報。 */
    sosCue() {
      play(() => [0, 0.5].forEach((s) => tone(520, s, 0.45, 0.07, 'sine', 700)));
    },
  };
})();
