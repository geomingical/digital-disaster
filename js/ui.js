/* DOM 介面：HUD、選災害、簡介、事件卡片、結局與彈窗、提示。 */
(function () {
  const DH = (window.DH = window.DH || {});
  const { SECTIONS, FINISH_X, BADGES, riskColor, store, HAZARD_IDS } = DH.core;
  const A = DH.art;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt !== undefined) n.textContent = txt;
    return n;
  };

  const SOUND_ICON = {
    on: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9.5v5h3.6L12 18.5v-13L7.6 9.5z" fill="currentColor"/><path d="M15.4 9a4.2 4.2 0 0 1 0 6M17.8 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    off: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 9.5v5h3.6L12 18.5v-13L7.6 9.5z" fill="currentColor"/><path d="m15.5 9.5 5 5m0-5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };

  const FACES = [
    { max: 20, mouth: 'M10.5 19.5 Q16 25 21.5 19.5', drop: 0 },
    { max: 50, mouth: 'M11 21 L21 21', drop: 0 },
    { max: 80, mouth: 'M10.5 23 Q16 18.5 21.5 23', drop: 1 },
    { max: Infinity, mouth: 'M10 23 Q13 20 16 22.5 Q19 25 22 21.5', drop: 1 },
  ];
  const LEGAL = '教育演練用，非政府發布，請以官方公告為準。緊急時請撥 119（手機可撥 112）。';
  const lastHud = { stage: '', pct: -1 };

  /* 解說末尾的「重點：…」已經單獨顯示成關鍵提醒，不重複 */
  /* 與 style.css 手機單欄結局的斷點一致 */
  const NARROW = window.matchMedia('(max-width: 760px)');
  const stripPoint = (why) => why.replace(/\s*重點[:：][^。！？]*[。！？]?\s*$/, '').trim();

  /* 來源一律用新分頁開啟；網址在載入時已驗證為 https。
     平常露出 merge_bank.py 產生的「機關｜短用途」，完整機關、標題與日期收在展開內容。 */
  const MAX_SOURCE_LINKS = 2;
  const fullName = (s) => `${s.agency}｜${s.title}`;
  function sourceLink(s, text) {
    const a = el('a', '', text);
    a.href = s.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.title = fullName(s);
    return a;
  }
  function fillSources(box, sources) {
    box.textContent = '';
    const row = el('div', 'src-row');
    row.appendChild(el('span', 'src-label', '來源'));
    const links = el('div', 'src-links');
    sources.slice(0, MAX_SOURCE_LINKS).forEach((s) => links.appendChild(sourceLink(s, s.short || fullName(s))));
    row.appendChild(links);
    box.appendChild(row);
    if (sources.length > MAX_SOURCE_LINKS || sources.some((s) => s.date || (s.short && s.short !== fullName(s)))) {
      const more = el('details', 'src-more');
      more.appendChild(el('summary', '', '完整來源'));
      const ul = el('ul');
      sources.forEach((s) => {
        const li = el('li');
        li.appendChild(sourceLink(s, fullName(s)));
        if (s.date) li.appendChild(el('span', 'src-date', `（${s.date}）`));
        ul.appendChild(li);
      });
      more.appendChild(ul);
      box.appendChild(more);
    }
    return box;
  }

  const ui = {
    handlers: {},

    init(handlers) {
      this.handlers = handlers;
      const ticks = $('route-ticks');
      SECTIONS.slice(1).forEach((s) => {
        const tick = el('i', 'route-tick');
        tick.style.left = `${(s.from / FINISH_X) * 100}%`;
        ticks.appendChild(tick);
      });
      const on = (id, fn) => $(id).addEventListener('click', fn);
      on('btn-start', handlers.start);
      on('btn-again', handlers.again);
      on('btn-switch', handlers.toEntry);
      on('btn-howto', () => this.showHelp());
      on('btn-help', () => this.showHelp());
      on('btn-menu', () => this.confirmMenu());
      on('btn-records', () => this.showRecords());
      on('btn-entry-records', () => this.showRecords());
      on('btn-entry-back', handlers.toStart);
      on('btn-go', handlers.go);
      on('btn-intro-back', handlers.toEntry);
      on('btn-retry', handlers.retryLoad);
      on('btn-share', handlers.share);
      on('modal-close', () => this.closeModal());
      $('modal').addEventListener('pointerdown', (e) => {
        if (e.target === $('modal')) this.closeModal();
      });
      on('card-next', handlers.next);
      $('card-scroll').addEventListener('scroll', () => this.updateCardMore(), { passive: true });
      on('card-review', () => this.toggleCardReview());
      /* toggle 不冒泡，用捕捉階段接：展開完整來源後把內容帶進可視範圍 */
      $('fb-src').addEventListener('toggle', (e) => {
        if (e.target.open) e.target.scrollIntoView({ block: 'nearest' });
        this.updateCardMore();
      }, true);
      DH.entry.init();
      on('prompt', handlers.interact);
      on('btn-interact', handlers.interact);
      on('btn-sound', handlers.toggleSound);
      on('btn-sound-start', handlers.toggleSound);
      /* bump 播完就拿掉，才不會壓過風險過半的輕晃動畫 */
      $('hud-risk').addEventListener('animationend', (e) => {
        if (e.animationName === 'bump') $('hud-risk').classList.remove('bump');
      });
      this.setSound(false);
    },

    setScreen(name) {
      $('start-screen').hidden = name !== 'start' && name !== 'loading';
      $('entry-screen').hidden = name !== 'entry';
      $('intro-screen').hidden = name !== 'intro';
      $('ending-screen').hidden = name !== 'ending';
      const playing = name === 'play' || name === 'card';
      $('hud').hidden = !playing;
      $('controls').hidden = name !== 'play';
      $('card').hidden = name !== 'card';
      if (name !== 'play') this.setPrompt(null);
    },

    setSound(on) {
      ['btn-sound', 'btn-sound-start'].forEach((id) => {
        const b = $(id);
        b.innerHTML = on ? SOUND_ICON.on : SOUND_ICON.off;
        b.setAttribute('aria-pressed', String(on));
        const label = on ? '關閉音效' : '開啟音效';
        b.setAttribute('aria-label', label);
        b.title = `${label}（M）`;
        b.classList.toggle('is-on', on);
      });
    },

    setLoadState(state, count) {
      const start = $('btn-start');
      const notice = $('load-notice');
      if (state === 'loading') {
        start.disabled = true;
        start.textContent = '準備中…';
        notice.hidden = true;
      } else if (state === 'ok') {
        start.disabled = false;
        start.textContent = '開始演練';
        notice.hidden = true;
      } else if (state === 'fallback') {
        start.disabled = false;
        start.textContent = '開始演練';
        notice.hidden = false;
        $('load-notice-text').textContent = `題庫檔暫時讀不到，已改用內建題庫（${count} 題），可以照常練習，也可以再試一次。`;
      } else {
        start.disabled = true;
        start.textContent = '暫時無法開始';
        notice.hidden = false;
        $('load-notice-text').textContent = '題庫暫時讀不到，所以還不能開始。請確認網路或用網頁伺服器開啟後，再試一次。';
      }
    },

    /* 選災害 --------------------------------------------------------- */
    renderEntry(hazards, countOf) {
      DH.entry.render(hazards, countOf, { selectHazard: this.handlers.selectHazard, preview: this.handlers.preview });
    },

    showIntro(h, count) {
      A.paintHazardIcon($('intro-icon'), h.id, 72);
      $('intro-name').textContent = h.name;
      $('intro-tagline').textContent = h.tagline;
      $('intro-text').textContent = h.intro;
      const best = store.bestOf(h.id);
      $('intro-meta').textContent = `題庫 ${count} 題，每局抽 ${Math.min(count, DH.core.TOTAL_QUESTIONS)} 題${best ? `｜最佳結果：${best.title}（風險值 ${best.risk}）` : ''}`;
      $('btn-go').focus({ preventScroll: true });
    },

    /* HUD ------------------------------------------------------------ */
    setHazardName(name) {
      $('hud-hazard').textContent = name;
      lastHud.stage = '';
      lastHud.pct = -1;
    },

    updateHud(x, section, risk) {
      const pct = Math.round(Math.min(1, Math.max(0, x / FINISH_X)) * 100);
      if (lastHud.stage !== section.key) {
        $('hud-stage').textContent = section.name;
        SECTIONS.forEach((s) => $(`route-l-${s.key}`).classList.toggle('on', s.key === section.key));
        lastHud.stage = section.key;
      }
      if (lastHud.pct !== pct) {
        $('route-fill').style.width = `${pct}%`;
        $('route-dot').style.left = `${pct}%`;
        $('route-bar').setAttribute('aria-valuenow', String(pct));
        lastHud.pct = pct;
      }
      this.updateRisk(risk);
    },

    updateRisk(risk) {
      const color = riskColor(risk);
      const fill = $('risk-fill');
      $('risk-num').textContent = String(Math.round(risk));
      $('hud-risk').classList.toggle('is-warn', risk > 50);
      fill.style.width = `${Math.min(100, risk)}%`;
      fill.style.background = color;
      $('risk-bar').setAttribute('aria-valuenow', String(Math.round(risk)));
      $('risk-face-bg').setAttribute('fill', color);
      const face = FACES.find((f) => risk < f.max);
      $('risk-face-mouth').setAttribute('d', face.mouth);
      $('risk-face-drop').setAttribute('opacity', String(face.drop));
    },

    bumpRisk() {
      const n = $('hud-risk');
      n.classList.remove('bump');
      void n.offsetWidth;
      n.classList.add('bump');
    },

    flashStage() {
      const n = $('hud-stage');
      n.classList.remove('flash');
      void n.offsetWidth;
      n.classList.add('flash');
    },

    setPrompt(text) {
      const p = $('prompt');
      if (!text) {
        p.hidden = true;
        $('btn-interact').classList.remove('is-ready');
        return;
      }
      if (p.textContent !== text) p.textContent = text;
      p.hidden = false;
      $('btn-interact').classList.add('is-ready');
    },

    /* 同時只顯示一則，位置貼著 HUD 實際底緣 */
    toast(message, kind) {
      const box = $('toasts');
      const t = el('div', `toast ${kind || ''}`, message);
      const hud = $('hud');
      const stageTop = $('stage').getBoundingClientRect().top;
      box.style.top = hud.hidden ? '12px' : `${hud.getBoundingClientRect().bottom - stageTop + 8}px`;
      box.textContent = '';
      box.appendChild(t);
      setTimeout(() => t.classList.add('out'), 2600);
      setTimeout(() => t.remove(), 3000);
    },

    clearToasts() {
      $('toasts').textContent = '';
    },

    /* 事件卡片 ------------------------------------------------------- */
    openCard(ev, index, total) {
      const s = ev.scenario;
      const stage = SECTIONS.find((x) => x.key === s.stage);
      $('card-tag').textContent = s.category;
      $('card-count').textContent = `${stage.short}・第 ${index + 1} / ${total} 題`;
      $('mini-count').textContent = `第 ${index + 1} / ${total} 題`;
      $('mini-title').textContent = s.title;
      $('card-title').textContent = s.title;
      $('card-sit').textContent = s.situation;
      const opts = $('card-opts');
      opts.textContent = '';
      ev.options.forEach((opt, i) => {
        const b = el('button', 'opt');
        b.type = 'button';
        b.dataset.i = String(i);
        b.appendChild(el('span', 'opt-key', String(i + 1)));
        b.appendChild(el('span', 'opt-text', opt.text));
        b.addEventListener('click', () => this.handlers.answer(i));
        opts.appendChild(b);
      });
      $('card-fb').hidden = true;
      $('card-foot').hidden = true;
      const card = $('card');
      card.classList.remove('answered', 'is-right', 'is-wrong', 'shake', 'show-q');
      $('card-review').textContent = '看題目';
      $('card-review').setAttribute('aria-expanded', 'false');
      $('card-more').classList.remove('on');
      $('card-fb').style.marginBottom = '';
      $('card-scroll').scrollTop = 0;
      card.focus({ preventScroll: true });
    },

    showAnswer(ev, displayIndex, sos, gained, total) {
      const chosen = ev.options[displayIndex];
      const s = ev.scenario;
      const card = $('card');
      card.classList.add('answered', chosen.correct ? 'is-right' : 'is-wrong');
      if (!chosen.correct) {
        void card.offsetWidth;
        card.classList.add('shake');
      }
      document.querySelectorAll('#card-opts .opt').forEach((b, i) => {
        const opt = ev.options[i];
        b.disabled = true;
        if (opt.correct) b.classList.add('correct');
        if (i === displayIndex && !opt.correct) b.classList.add('wrong');
        const key = b.querySelector('.opt-key');
        if (opt.correct) key.textContent = '✓';
        else if (i === displayIndex) key.textContent = '✕';
      });
      const head = $('fb-head');
      head.textContent = '';
      head.appendChild(el('strong', '', chosen.correct ? '判斷正確！' : '這樣有點危險'));
      const tally = el('span', 'fb-tally');
      tally.appendChild(el('span', chosen.correct ? 'fb-gain' : 'fb-loss', `本題 +${Math.round(gained)}`));
      const sum = el('span', 'fb-total', `總風險 ${Math.round(total)} / 100`);
      sum.id = 'fb-total';
      sum.dataset.total = String(Math.round(total));
      tally.appendChild(sum);
      head.appendChild(tally);
      const right = ev.options.find((o) => o.correct);
      $('fb-answer').hidden = chosen.correct;
      $('fb-answer').textContent = chosen.correct ? '' : `正確答案：${right.text}`;
      $('fb-key').textContent = s.keypoint;
      $('fb-why').textContent = stripPoint(s.why);
      fillSources($('fb-src'), s.sources);
      $('card-fb').hidden = false;
      const next = $('card-next');
      next.textContent = sos ? '風險破表，請求支援' : '繼續前進';
      next.classList.toggle('btn-sos', !!sos);
      $('card-foot').hidden = false;
      next.focus({ preventScroll: true });
      /* 放不下時對齊到完整的段落：選項加解說放得下就從選項讀起，否則從解說開頭讀起。
         內容不夠捲時在解說下方補空白，才不會停在半個選項上。 */
      const scroll = $('card-scroll');
      const fbNode = $('card-fb');
      const collapsed = getComputedStyle($('card-opts')).display === 'none';
      if (collapsed) {
        /* 直式面板答後只留解說，卡片依內容收高，不需要對齊 */
        scroll.scrollTop = 0;
        this.updateCardMore();
        return;
      }
      const box = scroll.getBoundingClientRect();
      const fb = fbNode.getBoundingClientRect();
      if (fb.bottom > box.bottom + 1 || fb.top < box.top) {
        const opts = $('card-opts').getBoundingClientRect();
        const anchor = fb.bottom - opts.top + 12 <= box.height ? opts.top : fb.top;
        const target = scroll.scrollTop + anchor - box.top - 6;
        const short = target - (scroll.scrollHeight - scroll.clientHeight);
        if (short > 0) fbNode.style.marginBottom = `${Math.ceil(short)}px`;
        scroll.scrollTop = target;
      }
      this.updateCardMore();
    },

    /* 直式面板答後收起題目與選項，需要時可再打開 */
    toggleCardReview() {
      const open = $('card').classList.toggle('show-q');
      $('card-review').textContent = open ? '收起' : '看題目';
      $('card-review').setAttribute('aria-expanded', String(open));
      $('card-scroll').scrollTop = 0;
      this.updateCardMore();
    },

    /* 底部還有內容沒看到時，顯示淡陰影與提示 */
    updateCardMore() {
      const scroll = $('card-scroll');
      const left = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
      $('card-more').classList.toggle('on', left > 12 && $('card').classList.contains('answered'));
    },

    /* 結局 ----------------------------------------------------------- */
    /* 手機單欄時「先記住的 2 件事」要排在成績前面：直接搬 DOM，螢幕閱讀器順序才會一致；
       桌機雙欄搬回右欄「學習總結」標題下 */
    placeEndingBlocks() {
      const top = $('summary-top');
      if (NARROW.matches) {
        const stats = document.querySelector('.ending-left .ending-stats');
        if (top.nextElementSibling !== stats) stats.before(top);
      } else {
        const head = document.querySelector('.ending-right > h3');
        if (head.nextElementSibling !== top) head.after(top);
      }
    },

    /* 手機單欄：第一題詳解的標題還沒完整露出時，顯示「往下看答題解析」 */
    updateEndingMore() {
      const more = $('ending-more');
      const first = document.querySelector('#summary-list > li summary') || $('summary-list');
      if (!NARROW.matches || $('ending-screen').hidden || !first) {
        more.hidden = true;
        return;
      }
      const scroll = document.querySelector('.ending-scroll');
      const limit = document.querySelector('.ending-btns').getBoundingClientRect().top;
      more.hidden = first.getBoundingClientRect().bottom <= limit - 4 || scroll.scrollTop > 24;
    },

    showEnding(data) {
      const { grade, risk, answers, totalEvents, bestStreak, best, freshBadges, isNewBest, hazard } = data;
      $('ending-screen').dataset.tier = grade.tier;
      $('ending-kicker').textContent = `${hazard.name}演練・${grade.kicker}`;
      $('ending-title').textContent = grade.title;
      $('ending-msg').textContent = grade.message;
      $('ending-sos').hidden = grade.tier !== 'bad';
      $('ending-risk').textContent = String(Math.round(risk));
      $('ending-correct').textContent = `${answers.filter((a) => a.correct).length} / ${answers.length}`;
      $('ending-streak').textContent = String(bestStreak);
      const leftOver = totalEvents - answers.length;
      const stopped = grade.tier === 'bad';
      $('ending-status').classList.toggle('is-stop', stopped);
      $('ending-done').textContent = stopped ? `已完成 ${answers.length} / ${totalEvents} 題・本局先停下來求援` : `已完成 ${answers.length} / ${totalEvents} 題`;
      $('ending-why').textContent = stopped
        ? `演練指標累積到 100，所以提前結束${leftOver > 0 ? `，還有 ${leftOver} 題沒遇到` : ''}。`
        : '風險是演練指標，只用來提醒，不是真實機率。';
      if (grade.tier === 'bad') {
        /* 求援結局不恭喜「最佳紀錄」；之前完成過才提醒那次的成績 */
        $('ending-best').textContent = best && best.completed ? `最佳紀錄：${best.title}（風險值 ${best.risk}）` : '';
      } else {
        $('ending-best').textContent = isNewBest
          ? '這是你在這個災害的最佳紀錄！'
          : best ? `最佳紀錄：${best.title}（風險值 ${best.risk}）` : '';
      }

      const badgeBox = $('ending-badges');
      badgeBox.textContent = '';
      freshBadges.forEach((id) => {
        const b = BADGES.find((x) => x.id === id);
        if (b) badgeBox.appendChild(el('span', 'badge-chip', `新徽章：${b.name}`));
      });

      const wrong = answers.filter((a) => !a.correct);
      $('summary-note').textContent = wrong.length ? '答錯的題目已展開，答對的點開可看理由。' : '全部答對！點開任一題可複習理由。';

      /* 先列最該記住的 2 項：風險最高的錯題優先，不夠再補當下階段的重點 */
      const top = wrong.slice().sort((a, b) => b.risk - a.risk);
      answers.filter((a) => a.correct).sort((a, b) => (b.stage === 'during') - (a.stage === 'during')).forEach((a) => top.push(a));
      const topList = $('summary-top-list');
      topList.textContent = '';
      top.slice(0, 2).forEach((a) => topList.appendChild(el('li', '', a.keypoint)));
      $('summary-top').hidden = !top.length;

      const list = $('summary-list');
      list.textContent = '';
      wrong.concat(answers.filter((a) => a.correct)).forEach((a) => {
        const li = el('li', `sum-item ${a.correct ? 'ok' : 'ng'}`);
        const det = el('details');
        det.open = !a.correct;
        const sum = el('summary');
        sum.appendChild(el('span', 'sum-title', a.title));
        sum.appendChild(el('span', a.correct ? 'sum-res ok' : 'sum-res ng', a.correct ? '答對' : `風險 +${a.risk}`));
        det.appendChild(sum);
        const body = el('div', 'sum-body');
        body.appendChild(el('p', 'sum-key', a.keypoint));
        if (!a.correct) body.appendChild(el('p', 'sum-sit', a.situation));
        const dl = el('dl');
        dl.appendChild(el('dt', '', '你的選擇'));
        dl.appendChild(el('dd', a.correct ? 'c-ok' : 'c-ng', a.chosen));
        if (!a.correct) {
          dl.appendChild(el('dt', '', '正確答案'));
          dl.appendChild(el('dd', 'c-ok', a.answer));
        }
        dl.appendChild(el('dt', '', '為什麼'));
        dl.appendChild(el('dd', '', stripPoint(a.why)));
        body.appendChild(dl);
        body.appendChild(fillSources(el('div', 'sum-src'), a.sources));
        det.appendChild(body);
        li.appendChild(det);
        list.appendChild(li);
      });

      const res = $('res-list');
      res.textContent = '';
      $('res-box').hidden = !hazard.links.length;
      hazard.links.forEach((l) => {
        const li = el('li');
        const [org, purpose] = l.short ? l.short.split('｜') : [l.agency, l.title];
        li.appendChild(el('span', 'res-org', org));
        li.appendChild(sourceLink(l, purpose));
        res.appendChild(li);
      });

      this.placeEndingBlocks();
      document.querySelector('.ending-scroll').scrollTop = 0;
      document.querySelector('.ending-left').scrollTop = 0;
      document.querySelector('.ending-right').scrollTop = 0;
      $('btn-again').focus({ preventScroll: true });
      this.updateEndingMore();
    },

    /* 彈窗 ---------------------------------------------------------- */
    get modalOpen() { return !$('modal').hidden; },

    openModal(title, body) {
      $('modal-title').textContent = title;
      const box = $('modal-body');
      box.textContent = '';
      box.appendChild(body);
      $('modal').hidden = false;
      this.handlers.modalChange(true);
      $('modal-close').focus({ preventScroll: true });
    },

    closeModal() {
      if ($('modal').hidden) return;
      $('modal').hidden = true;
      this.handlers.modalChange(false);
    },

    showHelp() {
      const wrap = el('div', 'help');
      wrap.appendChild(el('p', 'help-note help-first', '這是教育演練，不是即時警報。風險值只是遊戲分數，不代表真實發生的機率。'));
      const rows = [
        ['走動', '方向鍵或 WASD；也可以點地面，角色會自己走過去。手機用左下角搖桿。'],
        ['看周圍', '在畫面上按住拖曳，就能看看前後的場景。'],
        ['情境事件', '路上的圓形圖示就是事件，橘框是下一個。走近會自動開啟；出現「查看」時按 E、空白鍵或互動鈕，也可以提早查看。'],
        ['回答', '點選項或按 1、2、3 回答，看完解說與來源後按「繼續前進」。'],
        ['風險值', '答對不加分，答錯加 15 到 28 左右；累積到 100 會提前結束，並提醒如何求援。'],
        ['音效', '預設靜音，按喇叭圖示或 M 鍵開關。'],
      ];
      const dl = el('dl', 'help-list');
      rows.forEach(([k, v]) => {
        dl.appendChild(el('dt', '', k));
        dl.appendChild(el('dd', '', v));
      });
      wrap.appendChild(dl);
      wrap.appendChild(el('p', 'help-note help-sos', LEGAL));
      this.openModal('操作說明', wrap);
    },

    /* 回選單前先問一聲，避免手滑丟掉這局 */
    confirmMenu() {
      const wrap = el('div', 'confirm');
      wrap.appendChild(el('p', '', '這局的進度不會保留，已作答的題目仍會記在紀錄裡。'));
      const row = el('div', 'confirm-btns');
      const leave = el('button', 'btn btn-primary', '回選單');
      leave.type = 'button';
      leave.addEventListener('click', () => {
        this.closeModal();
        this.handlers.toEntry();
      });
      const stay = el('button', 'btn', '繼續演練');
      stay.type = 'button';
      stay.addEventListener('click', () => this.closeModal());
      row.append(leave, stay);
      wrap.appendChild(row);
      this.openModal('要離開這局演練嗎？', wrap);
    },

    showRecords() {
      const d = store.data;
      const hazards = this.handlers.hazards();
      const wrap = el('div', 'records');
      const finished = HAZARD_IDS.filter((id) => d.badges.includes(`done-${id}`)).length;
      const stats = el('div', 'records-stats');
      [['遊玩次數', d.plays], ['完成災害', `${finished} / ${HAZARD_IDS.length}`], ['徽章', `${d.badges.length} / ${BADGES.length}`]].forEach(([k, v]) => {
        const box = el('div');
        box.appendChild(el('span', '', k));
        box.appendChild(el('b', '', String(v)));
        stats.appendChild(box);
      });
      wrap.appendChild(stats);

      wrap.appendChild(el('h3', '', '各災害最佳結果'));
      const rows = el('ul', 'records-list');
      hazards.forEach((h) => {
        const rec = d.byHazard[h.id];
        const li = el('li');
        li.appendChild(el('b', '', h.name));
        if (rec && rec.best) li.appendChild(el('span', `hz-best tier-${rec.best.tier}`, `${rec.best.title}・風險值 ${rec.best.risk}`));
        else li.appendChild(el('span', 'records-none', '還沒演練'));
        li.appendChild(el('small', '', `${rec ? rec.plays : 0} 次`));
        rows.appendChild(li);
      });
      wrap.appendChild(rows);

      const total = this.handlers.bankSize();
      const seen = Object.keys(d.seen).length;
      wrap.appendChild(el('p', 'records-seen', `已看過 ${Math.min(seen, total || seen)}${total ? ` / ${total}` : ''} 個情境，下次會優先遇到沒看過的題目。`));

      wrap.appendChild(el('h3', '', '徽章'));
      const grid = el('div', 'badge-grid');
      BADGES.forEach((b) => {
        const on = d.badges.includes(b.id);
        const cell = el('div', `badge ${on ? 'on' : ''}`);
        cell.appendChild(el('strong', '', b.name));
        cell.appendChild(el('span', '', on ? b.desc : `未解鎖：${b.desc}`));
        grid.appendChild(cell);
      });
      wrap.appendChild(grid);

      const reset = el('button', 'btn btn-small btn-ghost', '清除所有紀錄');
      reset.type = 'button';
      let armed = false;
      reset.addEventListener('click', () => {
        if (!armed) {
          armed = true;
          reset.textContent = '確定要清除嗎？再按一次';
          return;
        }
        store.reset();
        this.handlers.recordsChanged();
        this.showRecords();
      });
      wrap.appendChild(reset);
      this.openModal('我的紀錄', wrap);
    },
  };

  const onNarrow = () => {
    ui.placeEndingBlocks();
    ui.updateEndingMore();
  };
  document.querySelector('.ending-scroll').addEventListener('scroll', () => ui.updateEndingMore(), { passive: true });
  window.addEventListener('resize', () => ui.updateEndingMore());
  $('ending-more').addEventListener('click', () => {
    const sub = document.querySelector('.ending-right .summary-sub');
    sub.scrollIntoView({ block: 'start', behavior: A.reducedMotion() ? 'auto' : 'smooth' });
    $('ending-more').hidden = true;
  });
  if (NARROW.addEventListener) NARROW.addEventListener('change', onNarrow);
  else NARROW.addListener(onNarrow);
  DH.ui = ui;
})();
