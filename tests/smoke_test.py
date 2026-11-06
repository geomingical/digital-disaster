#!/usr/bin/env python3
"""數位災害煙霧測試：十種災害各玩到結局，並輸出截圖。

python3 tests/smoke_test.py          用模擬題庫跑邏輯（截圖優先用真實題庫，沒有才用模擬）
python3 tests/smoke_test.py --real   全部用 data/ 的真實題庫
python3 tests/smoke_test.py --no-shots   不輸出截圖
python3 tests/smoke_test.py --browser webkit   用 WebKit 跑（chromium 為預設；all 兩者都跑）
                                          WebKit 截圖輸出到 screenshots/webkit/
"""
import argparse
import json
import pathlib
import subprocess
import sys
import tempfile
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT.parent / "screenshots"
PORT = 8766
BASE = f"http://localhost:{PORT}"
URL = f"{BASE}/index.html"
HAZARDS = ["earthquake", "tsunami", "typhoon", "flood", "debris", "temperature", "air", "drought", "blackout", "nuclear"]
NAMES = ["地震", "海嘯", "颱風強風", "豪雨淹水", "土石流與坡地災害", "高低溫", "空氣品質", "乾旱停水", "停電", "核與輻射"]
_ap = argparse.ArgumentParser(description="數位災害煙霧測試")
_ap.add_argument("--real", action="store_true", help="全部用 data/ 的真實題庫")
_ap.add_argument("--no-shots", action="store_true", help="不輸出截圖")
_ap.add_argument("--browser", choices=["chromium", "webkit", "all"], default="chromium")
ARGS = _ap.parse_args()
REAL = ARGS.real
NO_SHOTS = ARGS.no_shots
BROWSER = "chromium"
failures = []
external = []
VIEWPORTS = [(390, 844, "390x844", True), (360, 640, "360x640", True), (844, 390, "844x390", True), (1024, 576, "1024x576", False), (1440, 900, "1440x900", False)]


def shots_dir():
    return SHOTS / "webkit" if BROWSER == "webkit" else SHOTS


def check(cond, label):
    print(("  ok  " if cond else "  FAIL") + " " + label)
    if not cond:
        failures.append(f"[{BROWSER}] {label}")


def mock_data(per_stage=None):
    per_stage = per_stage or {"before": 4, "during": 5, "after": 3}
    hazards, bank = [], []
    for hi, (hid, name) in enumerate(zip(HAZARDS, NAMES)):
        hazards.append({
            "id": hid, "name": name, "tagline": "模擬的一句話介紹文字", "order": hi,
            "intro": "這是模擬的災害簡介文字，用來測試版面。實際內容由題庫提供，長度大約兩到三句話，口吻友善。",
            "links": [{"agency": "模擬機關", "title": "模擬連結頁面", "url": "https://example.org/a"}],
        })
        for stage, n in per_stage.items():
            for i in range(n):
                ans = i % 3
                risk = [18, 24, 28]
                risk[ans] = 0
                bank.append({
                    "id": f"{hid}-{stage}-{i}", "hazard": hid, "category": "模擬分類", "stage": stage,
                    "title": f"{name}情境 {i}",
                    "situation": "你正在家裡準備晚餐，手機突然響起提醒，家人問接下來該怎麼做，手邊只有一支手電筒與一瓶水。",
                    "options": [f"選項{j}：先確認狀況再決定下一步，並通知家人" for j in range(3)],
                    "answer": ans, "risk": risk,
                    "why": "這是測試版面的解說文字，長度接近正式題庫。先確認狀況再行動，可以避免小問題變成大麻煩。重點：先看清楚再行動。",
                    "keypoint": "先看清楚狀況，再決定行動",
                    "sources": [{"agency": "模擬機關", "title": "模擬來源頁面", "url": "https://example.org/b"}],
                })
    return hazards, bank


def route_data(page, hazards, bank):
    page.route("**/data/hazards.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(hazards)))
    page.route("**/data/scenarios.json", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(bank)))


def new_page(browser, errors, data=None, viewport=(1280, 720), mobile=False, **ctx_opts):
    opts = {"viewport": {"width": viewport[0], "height": viewport[1]}}
    if mobile:
        opts.update(device_scale_factor=2, is_mobile=True, has_touch=True)
    opts.update(ctx_opts)
    ctx = browser.new_context(**opts)
    page = ctx.new_page()
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))

    def on_request(req):
        if not (req.url.startswith(BASE) or req.url.startswith("data:") or req.url.startswith("file:") or req.url.startswith("blob:")):
            external.append(req.url)
    page.on("request", on_request)
    if data:
        route_data(page, *data)
    return page


def open_game(page, query="?seed=123"):
    page.goto(URL + query)
    page.wait_for_function("window.__game && window.__game.state.screen !== 'loading'")
    page.wait_for_timeout(120)


BUBBLE_READY_JS = """(hid) => { const b = document.getElementById('entry-bubble');
  return b.dataset.hazard === hid && !document.getElementById('bubble-go').hidden && b.getAnimations().every(a => a.playState !== 'running'); }"""


def wait_bubble(page, hid, timeout=3000):
    """等泡泡真的換成 hid、出發鈕出現、彈出動畫跑完（hover 切換有 140ms 延遲，WebKit 偶爾更慢）。"""
    try:
        page.wait_for_function(BUBBLE_READY_JS, arg=hid, timeout=timeout)
    except Exception:  # noqa: BLE001 — 逾時交給後面的斷言報告實際狀態
        pass


def g(page, expr):
    return page.evaluate(f"window.__game.{expr}")


def play(page, method):
    """走完所有事件。method 為 correctIndex 或 wrongIndex。"""
    risks = []
    while g(page, "state.screen") == "play":
        if g(page, "triggerNextEvent()") is None:
            break
        i = g(page, f"{method}()")
        g(page, f"answer({i})")
        risks.append(g(page, "state.risk"))
        g(page, "continue()")
    return risks


def walk_to_finish(page):
    g(page, "teleportToFinish()")
    page.keyboard.down("ArrowRight")
    page.wait_for_function("window.__game.state.screen === 'ending'", timeout=8000)
    page.keyboard.up("ArrowRight")


def stage_counts(page):
    return page.evaluate("""() => {
      const out = {before:0,during:0,after:0};
      window.__game.state.events.forEach(e => out[e.scenario.stage]++);
      return out; }""")


def test_all_hazards(browser, data):
    errors = []
    page = new_page(browser, errors, data)
    open_game(page)
    check(g(page, "getHazards().length") == 10, "載入 10 種災害")
    for hid in HAZARDS:
        print(f"[{hid}]")
        # 全部答對
        check(g(page, f"startGame('{hid}')") is True, "可以開始")
        counts = stage_counts(page)
        total = sum(counts.values())
        check(total == 8, f"每局 8 題（{total}）")
        check(counts["during"] == 3 and 2 <= counts["before"] <= 3 and 2 <= counts["after"] <= 3, f"階段配額 {counts}")
        order = page.evaluate("window.__game.state.events.map(e => e.scenario.stage)")
        check(order == sorted(order, key=["before", "during", "after"].index), "題目依階段排序")
        xs = page.evaluate("window.__game.state.events.map(e => e.x)")
        check(xs == sorted(xs) and xs[0] > 200, "事件位置遞增")
        check(all(s == hid for s in page.evaluate("window.__game.state.events.map(e => e.scenario.hazard)")), "題目屬於這個災害")
        risks = play(page, "correctIndex")
        check(len(risks) == 8 and all(r == 0 for r in risks), "全對風險維持 0")
        walk_to_finish(page)
        end = g(page, "state.ending")
        check(end["tier"] == "good" and end["gradeKey"] == "master" and end["completed"], "全對→好結局「防災小達人」")
        check(f"done-{hid}" in end["freshBadges"] or g(page, f"store.data.badges.includes('done-{hid}')"), "取得完成徽章")
        # 全部答錯
        g(page, f"startGame('{hid}')")
        risks = play(page, "wrongIndex")
        check(risks[-1] == 100, f"全錯風險到 100（{risks}）")
        check(all(b > a or b == 100 for a, b in zip(risks, risks[1:])), "風險遞增")
        increments = [b - a for a, b in zip([0] + risks[:-1], risks)]
        check(all(10 <= d <= 28 for d in increments[:-1]), f"每題加 10–28（{increments}）")
        check(g(page, "state.screen") == "ending", "破表提前結束")
        end = g(page, "state.ending")
        check(end["tier"] == "bad" and not end["completed"] and end["title"] == "需要求援", "全錯→求援結局")
        check(len(risks) < 8, f"求援中途結束（{len(risks)} 題）")
        check(page.locator("#ending-sos").is_visible() and "119" in page.inner_text("#ending-sos") and "112" in page.inner_text("#ending-sos"), "求援結局提醒 119/112")
        check(page.locator("#res-list a").count() >= 1, "顯示官方資源連結")
    best = page.evaluate("window.__game.store.data")
    check(all(best["byHazard"][h]["best"]["tier"] == "good" for h in HAZARDS), "最佳結果保留好結局")
    check("all" in best["badges"], "十種災害完成→防災達人")
    check(best["plays"] == 20, "遊玩次數正確")
    saved = page.evaluate("JSON.parse(localStorage.getItem('digital-disaster.v1'))")
    check(saved and saved["plays"] == 20 and "earthquake" in saved["byHazard"], "localStorage 有存")
    check(not errors, f"無 console error {errors[:3]}")
    page.context.close()


def test_rules(browser, data):
    print("[規則與流程]")
    errors = []
    page = new_page(browser, errors, data)
    open_game(page)
    grades = page.evaluate("[0,19,20,49,50,79,80,99,100].map(r => DH.core.gradeFor(r).title)")
    check(grades == ["防災小達人", "防災小達人", "有驚無險", "有驚無險", "平安但需加強", "平安但需加強", "險象環生", "險象環生", "需要求援"], f"分級門檻 {grades}")
    tiers = page.evaluate("[10,30,60,90,100].map(r => DH.core.gradeFor(r).tier)")
    check(tiers == ["good", "good", "normal", "normal", "bad"], "結局層級")

    # 入口流程
    check(page.locator("#start-screen").is_visible() and "在情境裡學會台灣的防災知識" in page.inner_text(".start-sub"), "開始畫面")
    check("119" in page.inner_text(".start-legal") and "119" in page.inner_text("#legal"), "開始卡片與頁尾都有固定小字")
    page.click("#btn-start")
    check(g(page, "state.screen") == "entry" and page.locator(".hz-stamp").count() == 10, "入口 10 個圖章")
    head = page.inner_text(".entry-ribbon")
    check("選一種災害" in head and "每局抽選 8 題" in head, "場景標題寫每局抽選 8 題")
    check(page.locator("#btn-entry-back").is_visible() and page.locator("#btn-entry-records").is_visible(), "保留回首頁與我的紀錄")
    check("教育演練用，非政府發布" in page.inner_text("#legal"), "入口保留免責聲明")
    page.hover(".hz-stamp[data-hazard='flood']")
    wait_bubble(page, "flood")
    bubble = page.inner_text("#entry-bubble")
    check(g(page, "state.screen") == "entry" and "豪雨" in bubble and "題庫" in bubble and "出發" in bubble, "hover 先顯示說明泡泡")
    page.click(".hz-stamp[data-hazard='flood']")
    check(g(page, "state.screen") == "intro" and page.inner_text("#intro-name") != "", "桌機點圖章看簡介")
    page.click("#btn-go")
    check(g(page, "state.screen") == "play" and g(page, "state.hazard") == "flood", "簡介按開始演練")
    # 回選單需確認
    page.click("#btn-menu")
    check(page.locator("#modal").is_visible() and g(page, "state.screen") == "play", "回選單先確認")
    page.click("#modal .btn-primary")
    check(g(page, "state.screen") == "entry", "確認後回選單")
    page.hover(".hz-stamp[data-hazard='air']")
    wait_bubble(page, "air")
    page.click("#bubble-go")
    check(g(page, "state.screen") == "intro", "泡泡的出發進簡介")
    page.click("#btn-go")
    check(g(page, "state.hazard") == "air" and g(page, "state.screen") == "play", "簡介後開始 air")

    # 實際走路碰到事件、鍵盤作答
    g(page, "teleportToNextEvent()")
    page.keyboard.down("ArrowRight")
    page.wait_for_function("window.__game.state.screen === 'card'", timeout=5000)
    page.keyboard.up("ArrowRight")
    check(page.locator("#card").is_visible(), "走近自動開卡")
    check(page.locator("#card-opts .opt").count() == 3, "3 個選項")
    page.keyboard.press("Digit1")
    check(page.locator("#card-fb").is_visible(), "按 1 作答並顯示解說")
    fb_head = page.inner_text("#fb-head")
    check("本題 +" in fb_head and "總風險" in fb_head and "/ 100" in fb_head, "顯示本題 +N 與總風險")
    check(page.inner_text("#fb-key") != "", "顯示關鍵提醒")
    link = page.locator("#fb-src a").first
    check(link.get_attribute("target") == "_blank" and link.get_attribute("rel") == "noopener" and link.get_attribute("href").startswith("https://"), "來源連結新分頁開啟")
    page.wait_for_timeout(260)
    page.keyboard.press("KeyE")
    check(g(page, "state.screen") == "play", "E 繼續")
    # 選項有洗牌：多抽幾局，正解不會永遠在同一格
    positions = set()
    for _ in range(6):
        g(page, "startGame('air')")
        g(page, "triggerNextEvent()")
        positions.add(g(page, "correctIndex()"))
    check(len(positions) > 1, f"選項洗牌 {positions}")

    # 操作說明
    g(page, "backToMenu()")
    page.click("#btn-entry-records")
    check("我的紀錄" in page.inner_text("#modal-title"), "我的紀錄彈窗")
    page.keyboard.press("Escape")
    page.click("#btn-entry-back")
    page.click("#btn-howto")
    help_text = page.inner_text("#modal-body")
    check("演練" in help_text and "遊戲分數" in help_text and "機率" in help_text, "說明寫明是演練、風險值不是機率")
    page.keyboard.press("Escape")

    # 優先抽沒看過的題目
    page.evaluate("localStorage.clear(); window.__game.store.reset()")
    g(page, "startGame('tsunami')")
    first = set(page.evaluate("window.__game.state.events.map(e => e.scenario.id)"))
    play(page, "correctIndex")
    g(page, "startGame('tsunami')")
    second = set(page.evaluate("window.__game.state.events.map(e => e.scenario.id)"))
    pool = g(page, "getBank().filter(s => s.hazard === 'tsunami').length")
    check(len(first & second) <= max(0, 16 - pool), f"第二局優先抽沒看過的（重複 {len(first & second)}）")

    # 總結：答錯展開、答對收合
    g(page, "startGame('typhoon')")
    g(page, "triggerNextEvent()")
    g(page, "answer(window.__game.wrongIndex())")
    g(page, "continue()")
    g(page, "triggerNextEvent()")
    g(page, "answer(window.__game.correctIndex())")
    g(page, "continue()")
    g(page, "skipToEnding(60)")
    check(g(page, "state.ending.tier") == "normal" and g(page, "state.ending.title") == "平安但需加強", "skipToEnding 指定分數")
    opened = page.evaluate("[...document.querySelectorAll('.sum-item')].map(n => [n.classList.contains('ng'), n.querySelector('details').open])")
    check(all(ng == op for ng, op in opened) and len(opened) == 2, f"答錯展開、答對收合 {opened}")
    check(page.evaluate("[...document.querySelectorAll('.ending-right a')].every(a => a.target === '_blank' && a.rel === 'noopener' && a.href.startsWith('https://'))"), "總結連結安全")
    page.click("#btn-share")
    page.click("#btn-switch")
    check(g(page, "state.screen") == "entry", "換一種災害")

    # 不該出現開發工具字樣、外部資源
    words = page.evaluate("document.documentElement.innerHTML")
    check(not any(w in words for w in ["Claude", "Codex", "GPT", "模型", "人工智慧", "登山"]), "畫面沒有開發工具字樣")
    check(not any(w in words for w in ["cdn.", "googleapis", "@import"]), "沒有外部 CDN")

    # 視窗縮放與分頁切換
    page.set_viewport_size({"width": 500, "height": 700})
    page.wait_for_timeout(120)
    page.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    page.wait_for_timeout(60)
    # 非法災害與直接開始
    open_game(page, "?hazard=drought&seed=7")
    check(g(page, "state.screen") == "play" and g(page, "state.hazard") == "drought", "?hazard= 直接開始")
    ids_a = page.evaluate("window.__game.state.events.map(e => e.scenario.id + e.options.map(o => o.orig).join(''))")
    page.evaluate("localStorage.clear()")
    open_game(page, "?hazard=drought&seed=7")
    ids_b = page.evaluate("window.__game.state.events.map(e => e.scenario.id + e.options.map(o => o.orig).join(''))")
    page.evaluate("localStorage.clear()")
    check(ids_a == ids_b, "?seed= 固定題序與選項")
    open_game(page, "?hazard=nope")
    check(g(page, "state.screen") == "entry", "未知災害回到選單")
    check(not errors, f"無 console error {errors[:3]}")
    page.context.close()


def test_small_bank(browser):
    print("[題庫不足]")
    errors = []
    hazards, bank = mock_data({"before": 7, "during": 1, "after": 1})
    page = new_page(browser, errors, (hazards, bank))
    open_game(page)
    g(page, "startGame('earthquake')")
    counts = stage_counts(page)
    check(sum(counts.values()) == 8 and counts["during"] == 1 and counts["after"] == 1 and counts["before"] == 6, f"從其他階段補但留在自己階段 {counts}")
    order = page.evaluate("window.__game.state.events.map(e => [e.scenario.stage, e.x])")
    check(all(1800 > x for s, x in order if s == "before"), "補來的題目位置在自己階段")
    page.context.close()
    hazards, bank = mock_data({"before": 1, "during": 1, "after": 1})
    page = new_page(browser, errors, (hazards, bank))
    open_game(page)
    g(page, "startGame('air')")
    check(len(g(page, "state.events")) == 3, "題庫只有 3 題也能玩")
    play(page, "correctIndex")
    walk_to_finish(page)
    check(g(page, "state.ending.tier") == "good", "少題也能到結局")
    check(not errors, f"無 console error {errors[:3]}")
    page.context.close()


def test_validation(browser, data):
    print("[資料驗證與備援]")
    errors = []
    hazards, bank = data
    bad = [dict(bank[0], id="bad-1", risk=[10, 10, 10]), dict(bank[0], id="bad-2", options=["a", "b"]), dict(bank[0], id="bad-3", stage="x"),
           dict(bank[0], id="bad-4", sources=[]), dict(bank[0], id="bad-5", sources=[{"agency": "a", "title": "t", "url": "javascript:alert(1)"}]),
           dict(bank[0], id="bad-6", keypoint=""), dict(bank[0], id="bad-7", hazard="unknown"), bank[0], None]
    page = new_page(browser, errors, (hazards, bank + bad))
    open_game(page)
    check(g(page, "getBank().length") == len(bank), "cleanBank 略過格式不符的題目")
    page.context.close()

    # 資料讀不到、有備援
    page = new_page(browser, errors)
    fb = {"hazards": hazards[:2], "scenarios": [s for s in bank if s["hazard"] in HAZARDS[:2]][:6]}
    page.route("**/data/*.json", lambda r: r.abort())
    page.route("**/js/fallback-data.js", lambda r: r.fulfill(status=200, content_type="text/javascript", body=f"window.DH_FALLBACK={json.dumps(fb)};"))
    open_game(page)
    check(g(page, "state.bankSource") == "fallback" and page.locator("#load-notice").is_visible(), "讀不到題庫改用內建題庫並提示")
    check(g(page, "startGame('earthquake')") is True, "內建題庫可以玩")
    page.context.close()

    # 全部讀不到：友善錯誤
    page = new_page(browser, errors)
    page.route("**/data/*.json", lambda r: r.abort())
    page.route("**/js/fallback-data.js", lambda r: r.fulfill(status=200, content_type="text/javascript", body="window.DH_FALLBACK={hazards:[],scenarios:[]};"))
    open_game(page)
    check(page.locator("#btn-start").is_disabled() and page.locator("#load-notice").is_visible(), "全部讀不到顯示友善錯誤")
    check(page.locator("#btn-retry").is_visible(), "可以重試")
    page.unroute("**/data/*.json")
    route_data(page, hazards, bank)
    page.click("#btn-retry")
    page.wait_for_function("window.__game.state.bankReady")
    check(page.locator("#btn-start").is_enabled(), "重試成功可開始")
    page.context.close()
    # 中止請求時瀏覽器本身會記 net::ERR，這是預期的網路訊息，只看程式錯誤
    errs = [e for e in errors if "Failed to load resource" not in e]
    check(not errs, f"無程式錯誤 {errs[:3]}")

    # file:// 直接開
    errors2 = []
    page = new_page(browser, errors2)
    page.goto((ROOT / "index.html").as_uri())
    page.wait_for_function("window.__game && window.__game.state.screen !== 'loading'")
    check(g(page, "getBank().length") == 120, f"file:// 內建完整題庫（{g(page, 'getBank().length')}）")
    for hid in HAZARDS:
        g(page, f"startGame('{hid}')")
        counts = stage_counts(page)
        check(sum(counts.values()) == 8 and counts["during"] == 3 and {counts["before"], counts["after"]} == {2, 3}, f"file:// {hid} 每局 8 題、配額 2/3/3 {counts}")
    g(page, "startGame('tsunami')")
    play(page, "correctIndex")
    walk_to_finish(page)
    check(g(page, "state.screen") == "ending" and g(page, "state.ending")["completed"], "file:// 完整玩一局到結局")
    check(page.evaluate("!!document.querySelector('script[src=\"js/fallback-data.js\"]')"), "file:// 才動態載入內建題庫")
    g(page, "backToMenu()")
    check(page.locator(".hz-stamp").count() == 10 and "題庫 12 題" in page.evaluate("(document.querySelector('.hz-stamp').focus(), document.getElementById('entry-bubble').innerText)"), "file:// 泡泡寫題庫 12 題")
    check(not errors2, f"file:// 無錯誤 {errors2[:3]}")
    page.context.close()

    # localStorage 被擋
    errors3 = []
    page = new_page(browser, errors3, data)
    page.add_init_script("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });")
    open_game(page)
    g(page, "startGame('air')")
    play(page, "correctIndex")
    walk_to_finish(page)
    check(g(page, "store.data.plays") == 1, "localStorage 被擋時退回記憶體")
    check(not errors3, f"被擋時無錯誤 {errors3[:3]}")
    page.context.close()

    # 紀錄檔損毀
    errors4 = []
    page = new_page(browser, errors4, data)
    page.add_init_script("localStorage.setItem('digital-disaster.v1', '{\"plays\":\"x\",\"byHazard\":3,\"badges\":{}}')")
    open_game(page)
    g(page, "startGame('air')")
    check(g(page, "store.data.plays") == 1 and not errors4, "損毀的紀錄不影響遊戲")
    page.context.close()

    # 減少動態
    errors5 = []
    page = new_page(browser, errors5, data, reduced_motion="reduce")
    open_game(page)
    g(page, "startGame('earthquake')")
    g(page, "triggerNextEvent()")
    g(page, "answer(window.__game.correctIndex())")
    check(g(page, "state.player.jump") == 0, "減少動態時不跳躍")
    g(page, "continue()")
    g(page, "triggerNextEvent()")
    g(page, "answer(window.__game.wrongIndex())")
    check(risk_numbers(page)[0] == risk_numbers(page)[1], f"減少動態：答錯後 HUD 與回饋卡一致 {risk_numbers(page)}")
    g(page, "backToMenu()")
    page.wait_for_timeout(100)
    anim = page.evaluate("getComputedStyle(document.querySelector('.hz-float')).animationName")
    check(anim == "none", f"減少動態時圖章不漂浮（{anim}）")
    check(not errors5, f"減少動態無錯誤 {errors5[:3]}")
    page.context.close()

FOCUS_JS = """(sel) => {
  const n = sel ? document.querySelector(sel) : document.activeElement;
  const st = getComputedStyle(n);
  return { id: n.id, cls: n.className, outline: st.outlineStyle !== 'none' && parseFloat(st.outlineWidth) >= 2,
           ow: st.outlineWidth, oc: st.outlineColor, shadow: st.boxShadow, focusVisible: n.matches(':focus-visible') };
}"""
FOCUS_RING = "rgb(27, 79, 143)"


def has_ring(f):
    return f["outline"] or FOCUS_RING in f["shadow"]


def test_interaction(browser, data):
    print("[互動：延遲載入、hover、鍵盤、焦點]")
    errors = []
    page = new_page(browser, errors, data, viewport=(1280, 720))
    requested = []
    page.on("request", lambda r: requested.append(r.url))
    open_game(page)
    page.wait_for_timeout(300)
    check(not any("fallback-data.js" in u for u in requested), "http 正常時沒有請求 fallback-data.js")
    check(page.evaluate("!window.DH_FALLBACK && !document.querySelector('script[src*=fallback]')"), "http 正常時沒有內建題庫 script")
    # WebAudio 只在使用者手勢內建立；開關不應產生錯誤
    page.click("#btn-sound-start")
    page.wait_for_timeout(250)
    snd = page.evaluate("({ on: DH.audio.enabled, pressed: document.getElementById('btn-sound-start').getAttribute('aria-pressed') })")
    check(snd["on"] and snd["pressed"] == "true", f"點擊開啟音效（WebAudio 手勢內建立）{snd}")
    page.click("#btn-sound-start")
    check(not page.evaluate("DH.audio.enabled"), "再點關閉音效")

    # hover：從圖章移到泡泡，途中經過別的圖章也不換、不消失，點「出發」進得去
    g(page, "backToMenu()")
    page.wait_for_timeout(150)
    # 記錄游標停在土石流圖章上的時間：「快速掠過」要真的快（< 140ms 切換延遲）才算數
    page.evaluate("""() => { const s = document.querySelector(".hz-stamp[data-hazard='debris']"); window.__dwell = { enter: 0, ms: 0 };
      s.addEventListener('pointerenter', () => { window.__dwell.enter = performance.now(); });
      s.addEventListener('pointerleave', () => { window.__dwell.ms = Math.max(window.__dwell.ms, performance.now() - window.__dwell.enter); }); }""")
    for attempt in range(3):
        page.hover(".hz-stamp[data-hazard='temperature']")
        wait_bubble(page, "temperature")
        go = page.locator("#bubble-go").bounding_box()
        other = page.locator(".hz-stamp[data-hazard='debris'] .hz-disc").bounding_box()
        page.evaluate("window.__dwell = { enter: 0, ms: 0 }")
        # 先快速掠過土石流圖章，再進泡泡
        page.mouse.move(other["x"] + other["width"] / 2, other["y"] + other["height"] / 2, steps=3)
        page.wait_for_timeout(40)
        page.mouse.move(go["x"] + go["width"] / 2, go["y"] + go["height"] / 2, steps=6)
        page.wait_for_timeout(400)
        dwell = page.evaluate("window.__dwell.ms")
        # 瀏覽器太忙、游標實際停留超過切換延遲：這次不算「快速掠過」，重做一次（不放寬斷言）
        if dwell < 130:
            break
    check(page.get_attribute("#entry-bubble", "data-hazard") == "temperature" and page.locator("#bubble-go").is_visible(),
          f"滑鼠經過別的圖章移到泡泡，泡泡不換不消失（{page.get_attribute('#entry-bubble', 'data-hazard')}，停留 {dwell:.0f}ms）")
    page.mouse.click(go["x"] + go["width"] / 2, go["y"] + go["height"] / 2)
    check(g(page, "state.screen") == "intro" and g(page, "state.hazard") == "temperature", "泡泡「出發」成功進入")
    # 停在別的圖章上夠久才換
    g(page, "backToMenu()")
    page.wait_for_timeout(150)
    page.hover(".hz-stamp[data-hazard='flood']")
    wait_bubble(page, "flood")
    page.hover(".hz-stamp[data-hazard='typhoon']")
    wait_bubble(page, "typhoon")
    check(page.get_attribute("#entry-bubble", "data-hazard") == "typhoon", "停留後才換成新圖章")
    page.context.close()

    # 鍵盤全流程：開始 → 入口 → 圖章 → 出發 → 簡介 → 作答 → 結局
    errors2 = []
    page = new_page(browser, errors2, data, viewport=(1280, 720))
    open_game(page)
    for _ in range(8):
        page.keyboard.press("Tab")
        if page.evaluate("document.activeElement.id") == "btn-start":
            break
    f = page.evaluate(FOCUS_JS, None)
    check(f["id"] == "btn-start" and has_ring(f), f"Tab 到「開始」且有焦點樣式 {f['ow']} {f['oc']}")
    page.keyboard.press("Enter")
    check(g(page, "state.screen") == "entry", "Enter 進入選災害")
    check(page.evaluate("[...document.querySelectorAll('.hz-stamp')].filter(b => b.tabIndex === 0).length") == 1, "圓環只佔一個 Tab 停點")
    for _ in range(6):
        page.keyboard.press("Tab")
        if page.evaluate("document.activeElement.classList.contains('hz-stamp')"):
            break
    first = page.evaluate("document.activeElement.dataset.hazard")
    check(first == "earthquake", f"Tab 進入圓環（{first}）")
    page.wait_for_timeout(300)
    ring = page.evaluate("getComputedStyle(document.activeElement.querySelector('.hz-disc')).boxShadow")
    check(FOCUS_RING in ring, f"圖章焦點環明顯 {ring[:60]}")
    seq = []
    for key in ["ArrowRight", "ArrowDown", "ArrowUp", "ArrowLeft", "ArrowLeft", "ArrowDown"]:
        page.keyboard.press(key)
        seq.append(page.evaluate("document.activeElement.dataset.hazard"))
    check(seq == ["tsunami", "typhoon", "tsunami", "earthquake", "nuclear", "earthquake"], f"左右／上下方向鍵在圖章間循環 {seq}")
    check(page.get_attribute("#entry-bubble", "data-hazard") == "earthquake", "鍵盤焦點同步泡泡")
    page.keyboard.press("Tab")
    f = page.evaluate(FOCUS_JS, None)
    check(f["id"] == "bubble-go" and has_ring(f), f"Tab 到圓形「出發」且有焦點樣式 {f['ow']}")
    page.keyboard.press("Escape")
    f = page.evaluate(FOCUS_JS, None)
    check(page.get_attribute("#entry-bubble", "data-hazard") == "" and "hz-stamp" in f["cls"], "Esc 關閉泡泡，焦點回到圖章")
    page.keyboard.press("ArrowRight")
    check(page.get_attribute("#entry-bubble", "data-hazard") == "tsunami", "Esc 後方向鍵可再選")
    page.keyboard.press("Space")
    check(g(page, "state.screen") == "intro" and g(page, "state.hazard") == "tsunami", "空白鍵出發")
    f = page.evaluate(FOCUS_JS, None)
    check(f["id"] == "btn-go", "簡介焦點在「開始演練」")
    page.keyboard.press("Enter")
    check(g(page, "state.screen") == "play", "Enter 開始演練")
    answered = 0
    opt_ring = True
    for k in range(12):
        if g(page, "state.screen") != "play":
            break
        if g(page, "triggerNextEvent()") is None:
            break
        page.wait_for_timeout(80)
        want = g(page, "correctIndex()")
        if k % 2 == 0:
            # 方向鍵移到正解再按 Enter
            for _ in range(want + 1):
                page.keyboard.press("ArrowDown")
            f = page.evaluate(FOCUS_JS, None)
            opt_ring = opt_ring and has_ring(f) and "opt" in f["cls"]
            page.keyboard.press("Enter")
        else:
            page.keyboard.press(f"Digit{want + 1}")
        if not g(page, "state.current.done"):
            check(False, f"第 {k + 1} 題鍵盤作答失敗")
            break
        answered += 1
        page.wait_for_timeout(300)
        page.keyboard.press("Enter")
        page.wait_for_timeout(60)
    check(answered == 8 and opt_ring, f"方向鍵＋Enter／數字鍵答完 8 題（{answered}），選項有焦點樣式")
    if g(page, "state.screen") != "ending":
        walk_to_finish(page)
    check(g(page, "state.screen") == "ending" and g(page, "state.ending")["tier"] == "good", "鍵盤從入口玩到結局")
    f = page.evaluate(FOCUS_JS, None)
    check(f["id"] == "btn-again" and has_ring(f), "結局焦點在「再玩一次」且看得到")
    page.keyboard.press("Tab")
    f = page.evaluate(FOCUS_JS, None)
    check(has_ring(f), f"結局下一個焦點也有樣式（{f['id'] or f['cls']}）")
    check(not errors and not errors2, f"互動無錯誤 {(errors + errors2)[:3]}")
    page.context.close()


def test_merge_tool(data):
    print("[合併工具]")
    hazards, bank = data
    with tempfile.TemporaryDirectory() as tmp:
        tmp = pathlib.Path(tmp)
        res = tmp / "research"
        res.mkdir()
        good = [s for s in bank if s["hazard"] == "flood"]
        broken = [dict(good[0], id="x1", answer=5), dict(good[0], id="x2", risk=[1, 0, 2]), dict(good[0], id=good[0]["id"]),
                  dict(good[0], id="x3", sources=[{"agency": "a", "title": "b", "url": "http://x"}])]
        (res / "bank_flood.json").write_text(json.dumps({"hazard": hazards[3], "scenarios": good + broken}, ensure_ascii=False), encoding="utf-8")
        (res / "bank_air.json").write_text("{壞掉", encoding="utf-8")
        out = subprocess.run([sys.executable, str(ROOT / "tools" / "merge_bank.py"), "--research", str(res), "--out", str(tmp)], capture_output=True, text=True)
        check(out.returncode == 0, "merge_bank 可執行")
        merged = json.loads((tmp / "data" / "scenarios.json").read_text(encoding="utf-8"))
        check(len(merged) == len(good), f"格式不符的題目被略過（{len(merged)}）")
        check("警告" in out.stdout and "x1" in out.stdout, "stdout 有警告")
        hz = json.loads((tmp / "data" / "hazards.json").read_text(encoding="utf-8"))
        check(hz[0]["id"] == "flood" and "icon" in hz[0] and "color" in hz[0] and hz[0]["order"] == 3, "hazards.json 有順序與主題")
        fb = (tmp / "js" / "fallback-data.js").read_text(encoding="utf-8")
        check("DH_FALLBACK" in fb, "產生備援檔")
        parsed = json.loads(fb.split("window.DH_FALLBACK = ", 1)[1].rsplit(";", 1)[0])
        check(len(parsed["scenarios"]) == len(good), "備援檔包含全部題目")
        shorts = [l["short"] for s in merged for l in s["sources"]]
        check(shorts and all("｜" in x for x in shorts), "來源都有短標題欄位")


def risk_numbers(page):
    return page.evaluate("[Number(document.getElementById('risk-num').textContent), Number(document.getElementById('fb-total').dataset.total)]")


def test_risk_sync(browser, data):
    print("[風險結算]")
    errors = []
    page = new_page(browser, errors, data)
    open_game(page)
    g(page, "startGame('earthquake')")
    expected = 0
    for k in range(4):
        g(page, "triggerNextEvent()")
        gain = page.evaluate("(() => { const G = window.__game; const i = G.wrongIndex(); return G.state.current.options[i].risk; })()")
        # 同一個 evaluate 內立刻讀值：不等任何動畫
        hud, total, text = page.evaluate("""() => { const G = window.__game; G.answer(G.wrongIndex());
          return [Number(document.getElementById('risk-num').textContent), Number(document.getElementById('fb-total').dataset.total), document.getElementById('fb-head').innerText]; }""")
        expected = min(100, expected + gain)
        check(hud == total == expected and f"本題 +{gain}" in text, f"答錯 {k + 1}：HUD {hud} == 回饋卡 {total} == {expected}")
        page.wait_for_timeout(120)
        check(risk_numbers(page) == [expected, expected], "動畫期間數字不變")
        g(page, "continue()")
    check(not errors, f"無 console error {errors[:3]}")
    page.context.close()


def stamp_report(page):
    return page.evaluate("""() => {
      const rect = (n) => n.getBoundingClientRect();
      const stamps = [...document.querySelectorAll('.hz-stamp')];
      const rs = stamps.map(rect);
      const discs = stamps.map(s => rect(s.querySelector('.hz-disc')));
      const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const bad = [];
      const legal = rect(document.getElementById('legal')).top;
      const head = rect(document.querySelector('.entry-top')).bottom;
      rs.forEach((r, i) => {
        if (r.left < 0 || r.right > innerWidth || r.top < head || r.bottom > legal) bad.push('超出 ' + stamps[i].dataset.hazard + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        if (discs[i].width < 44 || discs[i].height < 44) bad.push('太小 ' + stamps[i].dataset.hazard + ' ' + discs[i].width);
        if (Math.abs(discs[i].width - discs[i].height) > 1) bad.push('不圓 ' + stamps[i].dataset.hazard);
        const label = rect(stamps[i].querySelector('.hz-label'));
        if (label.right > r.right + 1 || label.left < r.left - 1 || label.bottom > r.bottom + 5) bad.push('標籤超出圖章 ' + stamps[i].dataset.hazard + ' ' + [label.left - r.left, label.bottom - r.bottom].map(Math.round));
        for (let j = i + 1; j < rs.length; j++) if (hit(r, rs[j])) bad.push('重疊 ' + stamps[i].dataset.hazard + '/' + stamps[j].dataset.hazard);
        if (!stamps[i].getAttribute('aria-label')) bad.push('缺 aria-label');
      });
      const bubble = rect(document.getElementById('entry-bubble'));
      rs.forEach((r, i) => { if (hit(r, bubble)) bad.push('泡泡蓋到 ' + stamps[i].dataset.hazard); });
      if (bubble.left < 0 || bubble.right > innerWidth || bubble.top < head || bubble.bottom > legal) bad.push('泡泡超出 ' + [bubble.left, bubble.top, bubble.right, bubble.bottom].map(Math.round));
      return { bad, minDisc: Math.min(...discs.map(d => d.width)) };
    }""")


def test_entry(browser, data):
    print("[入口]")
    for vw, vh, tag, mobile in VIEWPORTS:
        errors = []
        page = new_page(browser, errors, data, viewport=(vw, vh), mobile=mobile)
        open_game(page)
        g(page, "backToMenu()")
        page.wait_for_timeout(150)
        rep = stamp_report(page)
        check(not rep["bad"], f"{tag} 入口未選取 {rep['bad'][:5]}（圖章 {rep['minDisc']:.0f}px）")
        # 主角真的站在環的中央區，且沒被圖章蓋到
        hero = page.evaluate("""() => { const G = window.__game, sp = DH.entry.heroSpot();
          const hit = [...document.querySelectorAll('.hz-stamp')].some(s => { const r = s.getBoundingClientRect();
            return !(r.right <= innerWidth/2 - sp.h*.42 || r.left >= innerWidth/2 + sp.h*.42 || r.bottom <= sp.y - sp.h/2 || r.top >= sp.y + sp.h/2); });
          return { h: sp.h, dx: Math.abs(sp.x - innerWidth/2), hit, scale: G.view.heroScale }; }""")
        check(hero["dx"] < 2 and not hero["hit"] and hero["h"] >= 84, f"{tag} 主角在中央且不被遮 {hero}")
        # 手機直式／橫式：場景式分層排列（不是整圈橢圓），遠空較小、前景較大，虛線環不顯示
        if mobile:
            sc = page.evaluate("""() => {
              const ring = document.getElementById('entry-ring');
              const st = [...document.querySelectorAll('.hz-stamp')].map(s => ({ layer: s.dataset.layer, d: s.querySelector('.hz-disc').getBoundingClientRect(), r: s.getBoundingClientRect() }));
              const of = (l) => st.filter(s => s.layer === l);
              const avg = (a) => a.reduce((m, s) => m + s.d.width, 0) / Math.max(1, a.length);
              const sp = DH.entry.heroSpot();
              const far = of('far'), ground = of('ground');
              /* 不是等距橢圓：各圖章到主角中心的距離差異要夠大 */
              const ds = st.map(s => Math.hypot(s.r.left + s.r.width / 2 - sp.x, s.r.top + s.r.height / 2 - sp.y));
              return { scene: ring.dataset.scene, orbit: getComputedStyle(document.getElementById('entry-orbit')).display,
                far: far.length, sky: far.length + of('sky').length, ground: ground.length, farW: avg(far), groundW: avg(ground),
                farAbove: far.every(s => s.r.top + s.r.height / 2 < sp.y - sp.h * 0.25), groundBelow: ground.every(s => s.r.top + s.r.height / 2 > sp.y + sp.h * 0.1),
                spread: (Math.max(...ds) - Math.min(...ds)) / Math.max(...ds) };
            }""")
            check(sc["scene"] in ("tall", "short", "land") and sc["orbit"] == "none", f"{tag} 場景式排列 {sc['scene']}，虛線環隱藏")
            check(sc["far"] >= 3 and sc["sky"] >= 4 and sc["ground"] >= 3 and sc["farW"] < sc["groundW"] and sc["farAbove"] and sc["groundBelow"],
                  f"{tag} 遠空 {sc['far']} 枚（{sc['farW']:.0f}px）在角色上方、前景 {sc['ground']} 枚（{sc['groundW']:.0f}px）在腳下方")
            check(sc["spread"] > 0.35, f"{tag} 圖章離主角遠近不一（{sc['spread']:.2f}），不是等距長橢圓")
        ids = page.evaluate("[...document.querySelectorAll('.hz-stamp')].map(s => s.dataset.hazard)")
        for hid in ids:
            page.evaluate(f"document.querySelector('.hz-stamp[data-hazard={hid}]').focus()")
            rep = stamp_report(page)
            if rep["bad"]:
                check(False, f"{tag} 選取 {hid} {rep['bad'][:4]}")
            text = page.inner_text("#entry-bubble")
            if "題庫 12 題" not in text or "出發" not in text:
                check(False, f"{tag} {hid} 泡泡內容 {text}")
            btn = page.evaluate("document.getElementById('bubble-go').getBoundingClientRect().height")
            if btn < 44:
                check(False, f"{tag} 出發鈕高度 {btn}")
        # 點每個圖示都進得去（桌機點一下；觸控點兩下）
        for hid in ids:
            g(page, "backToMenu()")
            page.wait_for_timeout(30)
            sel = f".hz-stamp[data-hazard='{hid}']"
            if mobile:
                page.tap(sel)
                if g(page, "state.screen") != "entry":
                    check(False, f"{tag} 第一次點 {hid} 不該離開入口")
                if page.locator("#bubble-go").is_hidden():
                    check(False, f"{tag} 第一次點 {hid} 要顯示出發鈕")
                page.tap("#bubble-go")
            else:
                page.click(sel)
            if not (g(page, "state.screen") == "intro" and g(page, "state.hazard") == hid):
                check(False, f"{tag} 點 {hid} 進不去")
        check(True, f"{tag} 10 個圖示都能進入對應災害")
        if mobile:
            g(page, "backToMenu()")
            page.wait_for_timeout(30)
            page.tap(".hz-stamp[data-hazard='air']")
            page.tap(".hz-stamp[data-hazard='air']")
            check(g(page, "state.screen") == "intro" and g(page, "state.hazard") == "air", f"{tag} 再點一次進入")
            g(page, "backToMenu()")
            page.wait_for_timeout(30)
            page.tap(".hz-stamp[data-hazard='air']")
            page.tap(".hz-stamp[data-hazard='nuclear']")
            check(g(page, "state.screen") == "entry" and page.get_attribute("#entry-bubble", "data-hazard") == "nuclear", f"{tag} 改點別的只換選取")
        check(not errors, f"{tag} 入口無錯誤 {errors[:3]}")
        page.context.close()

    # 鍵盤、旋轉、再次進入
    errors = []
    page = new_page(browser, errors, data, viewport=(1024, 576))
    open_game(page)
    g(page, "backToMenu()")
    page.keyboard.press("Tab")
    page.keyboard.press("Tab")
    page.keyboard.press("Tab")
    focused = page.evaluate("document.activeElement.dataset.hazard")
    check(focused == "earthquake", f"Tab 走到第一個圖章（{focused}）")
    page.keyboard.press("ArrowRight")
    check(page.evaluate("document.activeElement.dataset.hazard") == "tsunami", "方向鍵往下一個")
    check(page.get_attribute("#entry-bubble", "data-hazard") == "tsunami", "鍵盤焦點也顯示泡泡")
    page.keyboard.press("ArrowLeft")
    page.keyboard.press("ArrowLeft")
    check(page.evaluate("document.activeElement.dataset.hazard") == "nuclear", "方向鍵繞回最後一個")
    page.keyboard.press("Escape")
    check(g(page, "state.screen") == "entry" and page.get_attribute("#entry-bubble", "data-hazard") == "", "Esc 先取消選取")
    page.evaluate("document.querySelector('.hz-stamp[data-hazard=drought]').focus()")
    page.keyboard.press("Enter")
    check(g(page, "state.screen") == "intro" and g(page, "state.hazard") == "drought", "Enter 進入")
    page.keyboard.press("Escape")
    check(g(page, "state.screen") == "entry", "簡介 Esc 回入口")
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(120)
    rep = stamp_report(page)
    check(not rep["bad"], f"resize 後重算 {rep['bad'][:4]}")
    page.set_viewport_size({"width": 844, "height": 390})
    page.wait_for_timeout(120)
    rep = stamp_report(page)
    check(not rep["bad"], f"轉橫式後重算 {rep['bad'][:4]}")
    check(not errors, f"無 console error {errors[:3]}")
    page.context.close()


def test_bubble_clearance(browser, data):
    """手機選取泡泡：最長名稱（土石流與坡地災害），無紀錄與有最佳紀錄＋多徽章兩種狀態，泡泡與圖章（含標籤）至少 8px。"""
    print("[手機選取泡泡淨空]")
    measure = """() => {
      const b = document.getElementById('entry-bubble').getBoundingClientRect();
      const out = { gaps: [], bad: [], h: b.height, w: b.width };
      for (const s of document.querySelectorAll('.hz-stamp')) {
        const d = s.querySelector('.hz-disc').getBoundingClientRect();
        const l = s.querySelector('.hz-label').getBoundingClientRect();
        const r = { left: Math.min(d.left, l.left), right: Math.max(d.right, l.right), top: Math.min(d.top, l.top), bottom: Math.max(d.bottom, l.bottom) };
        const dx = Math.max(r.left - b.right, b.left - r.right, 0);
        const dy = Math.max(r.top - b.bottom, b.top - r.bottom, 0);
        const gap = Math.max(dx, dy);
        out.gaps.push([s.dataset.hazard, Math.round(gap)]);
        if (gap < 8) out.bad.push(s.dataset.hazard + ' ' + Math.round(gap) + 'px');
      }
      const legal = document.getElementById('legal').getBoundingClientRect().top;
      if (b.left < 0 || b.right > innerWidth || b.bottom > legal) out.bad.push('泡泡超出畫面');
      const go = document.getElementById('bubble-go').getBoundingClientRect();
      out.go = Math.min(go.width, go.height);
      const meta = document.querySelector('.bubble-meta');
      /* 行數：子元素高度不同（小圓徽章 vs 文字），以「是否和上一行垂直重疊」分行，不用 top 值去重 */
      const kids = [...meta.children].map(n => n.getBoundingClientRect()).sort((a, b) => a.top - b.top);
      let lines = 0, lineBottom = -1e9;
      for (const k of kids) { if (k.top >= lineBottom - 2) { lines++; lineBottom = k.bottom; } else lineBottom = Math.max(lineBottom, k.bottom); }
      out.metaLines = lines;
      const tag = document.querySelector('.bubble-tag');
      out.tagLines = Math.round(tag.getBoundingClientRect().height / parseFloat(getComputedStyle(tag).lineHeight));
      const badge = document.querySelector('.bubble-meta .badge-mini');
      out.badge = badge ? (badge.getAttribute('aria-label') || '') : '';
      out.text = document.getElementById('entry-bubble').innerText;
      return out;
    }"""
    for vw, vh in [(360, 640), (390, 844)]:
        for state in ["none", "multi"]:
            errors = []
            page = new_page(browser, errors, data, viewport=(vw, vh), mobile=True)
            open_game(page)
            if state == "multi":
                for hid in ["debris", "earthquake", "flood"]:
                    g(page, f"startGame('{hid}')")
                    play(page, "correctIndex")
                    if g(page, "state.screen") != "ending":
                        walk_to_finish(page)
            g(page, "backToMenu()")
            page.wait_for_timeout(150)
            page.tap(".hz-stamp[data-hazard='debris']")
            page.wait_for_timeout(350)
            rep = page.evaluate(measure)
            tag = f"{vw}x{vh} {state}"
            check("土石流與坡地災害" in rep["text"], f"{tag} 泡泡顯示最長名稱")
            if state == "none":
                check("還沒演練" in rep["text"] and rep["metaLines"] == 1, f"{tag} 「還沒演練」與題數同一行（{rep['metaLines']} 行）")
            else:
                check(rep["badge"] and "最佳" in rep["text"] and page.evaluate("JSON.parse(localStorage.getItem('digital-disaster.v1')).badges.length") >= 3,
                      f"{tag} 有最佳紀錄與多個徽章（徽章為小圖示 {rep['badge']}）")
                # 精簡版面：說明最多兩行、題數＋徽章＋紀錄同一行
                check(rep["tagLines"] <= 2 and rep["metaLines"] == 1, f"{tag} 說明 {rep['tagLines']} 行、紀錄 {rep['metaLines']} 行")
            check(not rep["bad"], f"{tag} 泡泡與圖章（含標籤）至少 8px {rep['bad'][:3]} 最近 {sorted(rep['gaps'], key=lambda x: x[1])[:2]}")
            check(rep["go"] >= 44, f"{tag} 出發鈕觸控區 {rep['go']:.0f}px")
            check(not errors, f"{tag} 無錯誤 {errors[:3]}")
            page.context.close()


def test_ending_more(browser, data):
    """手機結局：390x844 第一題標題完整露出；較短的 360x640 出現「往下看答題解析」，點了捲到詳解。"""
    print("[手機結局詳解露出]")
    probe = """() => {
      const first = document.querySelector('#summary-list > li summary').getBoundingClientRect();
      const btns = document.querySelector('.ending-btns').getBoundingClientRect();
      const more = document.getElementById('ending-more');
      return { visible: first.bottom <= btns.top - 4, more: !more.hidden, gap: Math.round(btns.top - first.bottom) };
    }"""
    for vw, vh in [(390, 844), (360, 640)]:
        errors = []
        page = new_page(browser, errors, data, viewport=(vw, vh), mobile=True)
        open_game(page)
        g(page, "startGame('flood')")
        play(page, "wrongIndex")
        page.wait_for_timeout(300)
        rep = page.evaluate(probe)
        if vh >= 800:
            check(rep["visible"] and not rep["more"], f"{vw}x{vh} 第一題標題完整露出、不需提示 {rep}")
        else:
            check(rep["more"], f"{vw}x{vh} 詳解在下方時顯示「往下看答題解析」 {rep}")
            page.tap("#ending-more")
            page.wait_for_timeout(700)
            after = page.evaluate(probe)
            sub = page.evaluate("document.querySelector('.ending-right .summary-sub').getBoundingClientRect().top")
            check(after["visible"] and not after["more"] and sub >= 0, f"{vw}x{vh} 點提示後捲到詳解 {after}")
        check(not errors, f"{vw}x{vh} 無錯誤 {errors[:3]}")
        page.context.close()


# 版面稽核：文字溢出、被截斷、互相重疊 ---------------------------------------------
AUDIT_JS = """(selectors) => {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  for (const sel of selectors) {
    for (const n of document.querySelectorAll(sel)) {
      const st = getComputedStyle(n);
      if (st.display === 'none' || st.visibility === 'hidden' || !n.getClientRects().length) continue;
      const r = n.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1) out.push(sel + ' 超出視窗左右 ' + Math.round(r.left) + '~' + Math.round(r.right));
      if (n.scrollWidth > n.clientWidth + 1 && st.overflowX !== 'auto' && !n.matches('canvas')) out.push(sel + ' 橫向溢出：' + (n.textContent || '').slice(0, 14));
    }
  }
  return out;
}"""
AUDIT_SELECTORS = ["#hud", ".hud-route", ".hud-route-top", ".hud-risk", ".risk-top", ".hud-btns", "#card", ".card-head", "#card h2", ".opt", ".opt-text", ".fb-head",
                   ".start-card", ".start-btns .btn", ".entry-top", ".entry-ribbon", ".hz-stamp", ".hz-label", "#entry-bubble", "#bubble-go",
                   ".intro-panel", ".intro-btns .btn", ".ending-panel", ".ending-btns .btn", ".ending-stats > div", ".sum-title", "#legal", ".modal-box"]


def audit(page, name, problems):
    for p in page.evaluate(AUDIT_JS, AUDIT_SELECTORS):
        problems.append(f"{name}: {p}")


def overlap_check(page, a, b):
    return page.evaluate("""([a,b]) => { const x=document.querySelector(a).getBoundingClientRect(), y=document.querySelector(b).getBoundingClientRect();
      return !(x.bottom<=y.top||y.bottom<=x.top||x.right<=y.left||y.right<=x.left); }""", [a, b])


def test_layouts(browser, data):
    print("[版面稽核]")
    audit_dir = shots_dir() / "audit"
    for vw, vh, tag, mobile in VIEWPORTS:
        errors, problems = [], []
        page = new_page(browser, errors, data, viewport=(vw, vh), mobile=mobile)
        shot = (lambda n: page.screenshot(path=str(audit_dir / f"{tag}-{n}.png"))) if not NO_SHOTS else (lambda n: None)
        open_game(page)
        page.wait_for_timeout(200)
        audit(page, "start", problems)
        shot("start")
        g(page, "backToMenu()")
        page.wait_for_timeout(150)
        audit(page, "entry", problems)
        shot("entry")
        g(page, "selectHazard('debris')")
        page.wait_for_timeout(200)
        audit(page, "intro", problems)
        shot("intro")
        g(page, "startGame('debris')")
        g(page, "teleportToNextEvent()")
        page.wait_for_timeout(500)
        audit(page, "play", problems)
        shot("play")
        if tag in ("390x844", "360x640"):
            h = page.evaluate("document.getElementById('hud').getBoundingClientRect().height")
            if not (98 <= h <= 114):
                problems.append(f"手機 HUD 高度 {h}")
        g(page, "triggerNextEvent()")
        page.wait_for_timeout(600)
        audit(page, "card", problems)
        shot("card")
        if overlap_check(page, "#card", "#hud"):
            problems.append("卡片蓋到 HUD")
        g(page, "answer(window.__game.wrongIndex())")
        page.wait_for_timeout(500)
        audit(page, "feedback", problems)
        shot("feedback")
        foot = page.evaluate("(() => { const c=document.getElementById('card').getBoundingClientRect(), b=document.getElementById('card-next').getBoundingClientRect(); return b.bottom <= c.bottom + 1 && b.bottom <= innerHeight; })()")
        if not foot:
            problems.append("繼續鍵超出卡片")
        reading = page.evaluate("""() => {
          const r = (id) => document.getElementById(id).getBoundingClientRect();
          const scroll = r('card-scroll'), fb = r('card-fb'), opts = r('card-opts'), next = r('card-next'), mini = r('card-mini');
          const top = document.getElementById('card-scroll').scrollTop;
          // 沒捲動，或捲到選項／解說的開頭（不停在半個段落上）
          const aligned = top === 0 || [opts.top, fb.top].some((y) => y - scroll.top >= 0 && y - scroll.top <= 24);
          return { btn: next.height, aligned, top, gap: fb.top - scroll.top, mini: mini.height,
                   miniText: document.getElementById('card-mini').innerText,
                   more: document.getElementById('card-more').classList.contains('on'),
                   overflow: document.getElementById('card-scroll').scrollHeight - document.getElementById('card-scroll').clientHeight - document.getElementById('card-scroll').scrollTop };
        }""")
        if reading["btn"] < 44:
            problems.append(f"繼續鍵太矮 {reading['btn']}")
        if not reading["aligned"]:
            problems.append(f"答後沒有捲到解說起點 {reading}")
        if reading["mini"] < 20 or "第 " not in reading["miniText"]:
            problems.append(f"精簡題目列不見了 {reading}")
        if reading["overflow"] > 12 and not reading["more"]:
            problems.append("還有內容卻沒有下滑提示")
        hud, total = risk_numbers(page)
        if hud != total:
            problems.append(f"HUD {hud} ≠ 回饋卡 {total}")
        g(page, "continue()")
        play(page, "wrongIndex")
        page.wait_for_timeout(300)
        audit(page, "ending", problems)
        shot("ending-bad")
        btn = page.evaluate("(() => { const b=document.getElementById('btn-again').getBoundingClientRect(); return b.bottom <= innerHeight && b.top >= 0; })()")
        if not btn:
            problems.append("結局按鈕超出畫面")
        status = page.inner_text("#ending-status")
        if "已完成" not in status or "本局先停下來求援" not in status:
            problems.append(f"求援狀態不明確 {status}")
        if vw <= 760:
            # 手機把「學習總結」眉標收給螢幕閱讀器，可見的解析標題是「逐題詳解」
            top = page.evaluate("document.querySelector('.ending-right .summary-sub').getBoundingClientRect().top")
            if top > vh * 1.15:
                problems.append(f"學習總結太晚出現 {round(top)}")
        last = page.evaluate("""() => {
          const sc = [document.querySelector('.ending-scroll'), document.querySelector('.ending-right')].find(n => n.scrollHeight > n.clientHeight + 1);
          if (sc) sc.scrollTop = sc.scrollHeight;
          const last = [...document.querySelectorAll('.ending-right a')].pop().getBoundingClientRect();
          const btns = document.querySelector('.ending-btns').getBoundingClientRect();
          const clear = innerWidth <= 760 ? last.bottom <= btns.top : last.bottom <= innerHeight;
          if (sc) sc.scrollTop = 0;
          return clear;
        }""")
        if not last:
            problems.append("最後一條來源捲不到操作列上方")
        page.click("#btn-switch")
        page.click("#btn-entry-records")
        page.wait_for_timeout(100)
        audit(page, "records", problems)
        shot("records")
        page.click("#modal-close")
        page.context.close()
        check(not problems, f"{tag} 版面 {problems[:6]}")
        check(not errors, f"{tag} 無錯誤 {errors[:3]}")


def test_mobile_reading(browser, data):
    print("[手機閱讀]")
    for vw, vh in [(390, 844), (360, 640)]:
        errors = []
        page = new_page(browser, errors, data, viewport=(vw, vh), mobile=True)
        open_game(page)
        g(page, "startGame('flood')")
        g(page, "triggerNextEvent()")
        page.wait_for_timeout(400)
        # 每一題都實際渲染：最短與最長解說都在其中
        rep = page.evaluate("""() => {
          const bad = [];
          const r = (id) => document.getElementById(id).getBoundingClientRect();
          const scroll = document.getElementById('card-scroll');
          const gaps = [];
          const hud = document.getElementById('hud').getBoundingClientRect().bottom;
          for (const s of window.__game.getBank()) {
            const wrong = [0, 1, 2].find((i) => i !== s.answer);
            const ev = { scenario: s, options: [{ text: s.options[s.answer], correct: true }, { text: s.options[wrong], correct: false }] };
            for (const pick of [0, 1]) {
              DH.ui.openCard(ev, 0, 8);
              DH.ui.showAnswer(ev, pick, false, pick ? 18 : 0, 18);
              const card = r('card');
              if (card.top < hud) bad.push(s.id + ' 蓋到 HUD');
              if (r('card-next').bottom > innerHeight) bad.push(s.id + ' 按鈕超出');
              scroll.scrollTop = scroll.scrollHeight;
              const gap = r('card-next').top - r('card-fb').bottom;
              gaps.push(gap);
              if (gap < 8 || gap > 32) bad.push(s.id + ' 解說到按鈕 ' + gap);
              const links = [...document.querySelectorAll('#fb-src .src-links a')];
              if (links.length > 2 || !links.length) bad.push(s.id + ' 短連結數 ' + links.length);
              const row = document.querySelector('#fb-src .src-links');
              if (row.scrollWidth > row.clientWidth + 1) bad.push(s.id + ' 來源橫向溢出');
              const more = document.querySelector('#fb-src .src-more');
              if (more) {
                more.open = true;
                scroll.scrollTop = scroll.scrollHeight;
                const last = [...more.querySelectorAll('a')].pop();
                if (!last.textContent.includes(s.sources[s.sources.length - 1].title)) bad.push(s.id + ' 展開沒有完整標題');
                if (last.getBoundingClientRect().bottom > r('card-foot').top) bad.push(s.id + ' 最後來源捲不到按鈕上方');
                if (r('card').top < hud) bad.push(s.id + ' 展開後蓋到 HUD');
                if (scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop > 2) bad.push(s.id + ' 捲不到底');
              }
              if (!document.getElementById('card-mini').innerText.includes(s.title)) bad.push(s.id + ' 題名不見');
            }
          }
          return { bad, min: Math.min(...gaps), max: Math.max(...gaps) };
        }""")
        # 不展開來源時，答後解說是否一屏讀完（不必捲動）；最短解說一定要
        fit = page.evaluate("""() => {
          const sc = document.getElementById('card-scroll');
          const bank = window.__game.getBank().slice().sort((a, b) => a.why.length - b.why.length);
          const need = [];
          let shortest = null;
          bank.forEach((s, k) => {
            const wrong = [0, 1, 2].find((i) => i !== s.answer);
            const ev = { scenario: s, options: [{ text: s.options[s.answer], correct: true }, { text: s.options[wrong], correct: false }] };
            for (const pick of [0, 1]) {
              DH.ui.openCard(ev, 0, 8);
              DH.ui.showAnswer(ev, pick, false, 0, 0);
              const over = sc.scrollHeight - sc.clientHeight;
              if (k === 0) shortest = Math.max(shortest || 0, over);
              if (over > 1) need.push(s.id + ':' + over);
            }
          });
          const px = Math.min(...['fb-why', 'fb-key'].map((id) => parseFloat(getComputedStyle(document.getElementById(id)).fontSize)));
          const btn = document.getElementById('card-next').getBoundingClientRect().height;
          return { shortest, need, total: bank.length * 2, px, btn };
        }""")
        check(fit["shortest"] <= 1, f"{vw}x{vh} 最短解說不需捲動（多 {fit['shortest']}px）")
        check(fit["px"] >= 14 and fit["btn"] >= 44, f"{vw}x{vh} 解說字級 {fit['px']}px ≥14、按鈕 {fit['btn']:.0f}px ≥44")
        check(not fit["need"], f"{vw}x{vh} 全部 {fit['total']} 種答後卡片一屏讀完（需捲動 {len(fit['need'])}：{fit['need'][:4]}）")
        check(not rep["bad"], f"{vw}x{vh} 全題庫答後卡片 間距 {rep['min']:.0f}–{rep['max']:.0f}px {rep['bad'][:5]}")
        # 短解說真的收高，且看得回題目與選項
        s = page.evaluate("""() => {
          const bank = window.__game.getBank().slice().sort((a, b) => a.why.length - b.why.length);
          const r = (id) => document.getElementById(id).getBoundingClientRect();
          const fit = (s) => {
            const wrong = [0, 1, 2].find((i) => i !== s.answer);
            const ev = { scenario: s, options: [{ text: s.options[s.answer], correct: true }, { text: s.options[wrong], correct: false }] };
            DH.ui.openCard(ev, 0, 8);
            DH.ui.showAnswer(ev, 0, false, 0, 0);
            return r('card').height;
          };
          const short = fit(bank[0]);
          const hideOpts = getComputedStyle(document.getElementById('card-opts')).display === 'none';
          document.getElementById('card-review').click();
          const showOpts = getComputedStyle(document.getElementById('card-opts')).display !== 'none';
          const sit = getComputedStyle(document.getElementById('card-sit')).display !== 'none';
          document.getElementById('card-review').click();
          return { short, tall: fit(bank[bank.length - 1]), hideOpts, showOpts, sit };
        }""")
        check(s["hideOpts"] and s["showOpts"] and s["sit"], f"{vw}x{vh} 答後可再看題目與選項")
        check(s["short"] < vh * 0.6, f"{vw}x{vh} 最短解說卡片依內容收高（{s['short']:.0f}px，最長 {s['tall']:.0f}px）")
        # 求援結局：兩件事在第一屏、順序正確、操作列不遮內容
        page.evaluate("DH.ui.closeModal()")
        g(page, "startGame('flood')")
        play(page, "wrongIndex")
        page.wait_for_timeout(300)
        e = page.evaluate("""() => {
          const y = (sel) => document.querySelector(sel).getBoundingClientRect();
          const list = ['#ending-art', '#ending-status', '#ending-sos', '#ending-msg', '#summary-top', '.ending-stats', '#summary-list', '#res-box'].map((q) => y(q).top);
          const sc = document.querySelector('.ending-scroll');
          const fold = y('.ending-btns').top;
          const top = y('#summary-top');
          sc.scrollTop = sc.scrollHeight;
          const last = [...document.querySelectorAll('#res-list a')].pop().getBoundingClientRect().bottom;
          const clear = last <= y('.ending-btns').top;
          sc.scrollTop = 0;
          return { sorted: list.every((v, i) => !i || list[i - 1] < v), bottom: top.bottom, fold, clear, msg: document.getElementById('ending-msg').innerText.length };
        }""")
        check(e["sorted"], f"{vw}x{vh} 結局閱讀順序 {e}")
        check(e["bottom"] <= e["fold"], f"{vw}x{vh} 先記住的兩件事在第一屏（{e['bottom']:.0f} / {e['fold']:.0f}）")
        check(e["clear"] and e["msg"] <= 40, f"{vw}x{vh} 操作列不遮內容、安慰句夠短（{e['msg']} 字）")
        dom = page.evaluate("""() => {
          const want = ['#ending-art', '#ending-status', '#ending-sos', '#ending-msg', '#summary-top', '.ending-stats', '#summary-list'];
          const nodes = want.map((q) => document.querySelector(q));
          const inOrder = nodes.every((n, i) => !i || (nodes[i - 1].compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING));
          const msg = document.getElementById('ending-msg');
          const lines = Math.round(msg.getBoundingClientRect().height / parseFloat(getComputedStyle(msg).lineHeight));
          return { inOrder, lines };
        }""")
        check(dom["inOrder"], f"{vw}x{vh} DOM 順序＝插畫→完成狀態→電話→安慰句→2 件事→成績→詳解")
        check(dom["lines"] <= 2, f"{vw}x{vh} 安慰句 ≤2 行（{dom['lines']} 行）")
        # 轉成桌機寬度：2 件事搬回右欄，雙欄不壞
        page.set_viewport_size({"width": 1280, "height": 720})
        page.wait_for_timeout(150)
        desk = page.evaluate("""() => {
          const top = document.getElementById('summary-top');
          const left = document.querySelector('.ending-left').getBoundingClientRect();
          const right = document.querySelector('.ending-right').getBoundingClientRect();
          return { inRight: !!top.closest('.ending-right'), afterHead: top.previousElementSibling && top.previousElementSibling.tagName === 'H3',
                   twoCol: right.left >= left.right - 1 && Math.abs(right.top - left.top) < 2 };
        }""")
        check(desk["inRight"] and desk["afterHead"] and desk["twoCol"], f"{vw}x{vh} 轉桌機後雙欄、2 件事回到右欄 {desk}")
        check(not errors, f"{vw}x{vh} 無錯誤 {errors[:3]}")
        page.context.close()

    # 真實題庫：每個來源都有 ≤14 字的短標題
    if data is None:
        for name in ("scenarios", "hazards"):
            items = json.loads((ROOT / "data" / f"{name}.json").read_text(encoding="utf-8"))
            links = [l for x in items for l in x.get("sources", x.get("links", []))]
            bad = [l for l in links if not (l.get("short") and len(l["short"]) <= 14 and "｜" in l["short"] and "…" not in l["short"])]
            check(not bad, f"{name} 短標題全部合格（{len(links)} 筆）{bad[:2]}")

    # 桌面入口：泡泡靠近腳下、與圖章保持淨空；紀錄記號不只靠顏色
    for vw, vh in [(1280, 720), (1440, 900)]:
        errors = []
        page = new_page(browser, errors, data, viewport=(vw, vh))
        open_game(page)
        for tier_method in ["correctIndex"]:
            g(page, "startGame('earthquake')")
            play(page, tier_method)
            if g(page, "state.screen") != "ending":
                walk_to_finish(page)
        g(page, "backToMenu()")
        page.wait_for_timeout(150)
        rep = page.evaluate("""() => {
          const out = { bad: [], clear: 1e9, gap: 0 };
          const stamps = [...document.querySelectorAll('.hz-stamp')];
          const sp = DH.entry.heroSpot();
          out.hero = sp.h;
          for (const st of stamps) {
            st.focus();
            const b = document.getElementById('entry-bubble').getBoundingClientRect();
            out.gap = b.top - (sp.y + sp.h / 2);
            for (const o of stamps) {
              const r = o.getBoundingClientRect();
              if (r.right > b.left && r.left < b.right && r.top >= b.top) out.clear = Math.min(out.clear, r.top - b.bottom);
            }
            for (const o of stamps) {
              const r = o.getBoundingClientRect();
              if (r.right > b.left && r.left < b.right && r.bottom > b.top && r.top < b.bottom) out.bad.push(st.dataset.hazard + ' 蓋到 ' + o.dataset.hazard);
            }
          }
          const seal = document.querySelector('.hz-stamp[data-hazard=earthquake] .hz-seal');
          out.seal = seal ? seal.textContent : '';
          document.querySelector('.hz-stamp[data-hazard=earthquake]').focus();
          out.bubble = document.getElementById('entry-bubble').innerText;
          return out;
        }""")
        check(not rep["bad"] and rep["clear"] >= 5, f"{vw}x{vh} 泡泡與下方圖章淨空 {rep['clear']:.0f}px {rep['bad'][:3]}")
        check(rep["gap"] <= 6 and rep["hero"] >= 200, f"{vw}x{vh} 主角 {rep['hero']:.0f}px、泡泡距腳 {rep['gap']:.0f}px")
        check(rep["seal"] == "✓" and "✓ 最佳" in rep["bubble"], f"{vw}x{vh} 記號與泡泡說明一致")
        check(not errors, f"{vw}x{vh} 無錯誤 {errors[:3]}")
        page.context.close()


def take_screenshots(browser, data):
    print("[截圖]")
    errors = []
    page = new_page(browser, errors, data)
    S = lambda n: page.screenshot(path=str(shots_dir() / f"{n}.png"))
    open_game(page)
    page.wait_for_timeout(300)
    S("start")
    page.click("#btn-howto")
    page.wait_for_timeout(100)
    S("help")
    page.click("#modal-close")
    # 先累積幾筆最佳結果，選單才看得到徽章
    for hid, method in [("earthquake", "correctIndex"), ("flood", "wrongIndex"), ("air", "correctIndex")]:
        g(page, f"startGame('{hid}')")
        play(page, method)
        if g(page, "state.screen") != "ending":
            walk_to_finish(page)
    g(page, "backToMenu()")
    page.wait_for_timeout(250)
    S("entry")
    page.hover(".hz-stamp[data-hazard='earthquake']")
    wait_bubble(page, "earthquake")
    S("entry-hover")
    g(page, "selectHazard('earthquake')")
    page.wait_for_timeout(300)
    S("intro")

    g(page, "startGame('typhoon')")
    g(page, "triggerNextEvent()")
    page.wait_for_timeout(700)
    S("question")
    g(page, "answer(window.__game.correctIndex())")
    page.wait_for_timeout(600)
    S("feedback-right")
    g(page, "continue()")
    g(page, "triggerNextEvent()")
    page.wait_for_timeout(500)
    g(page, "answer(window.__game.wrongIndex())")
    page.wait_for_timeout(600)
    S("feedback-wrong")
    g(page, "continue()")

    for hid in HAZARDS:
        g(page, f"startGame('{hid}')")
        # 跳到災害當下的第一個事件前面，主題才看得出來
        page.evaluate("""() => {
          const G = window.__game, st = G.state;
          const i = st.events.findIndex(e => e.scenario.stage === 'during');
          for (let k = 0; k < i; k++) st.events[k].done = true, st.events[k].correct = true;
          st.eventIndex = i;
          st.player.x = st.events[i].x - 240;
          G.view.cam.x = st.player.x + 100;
        }""")
        page.wait_for_timeout(900)
        S(f"play-{hid}")

    # 海嘯：災前／當下／災後各一張（場景隨階段變化）
    g(page, "startGame('tsunami')")
    for stage in ["before", "during", "after"]:
        page.evaluate("""(stage) => {
          const G = window.__game, st = G.state;
          const i = st.events.findIndex(e => e.scenario.stage === stage);
          for (let k = 0; k < i; k++) st.events[k].done = true, st.events[k].correct = true;
          st.eventIndex = i;
          st.player.x = st.events[i].x - 240;
          G.view.cam.x = st.player.x + 100;
        }""", stage)
        page.wait_for_timeout(1200)
        S(f"play-tsunami-{stage}")

    # 高低溫：冷熱各一張
    for name, want in [("cold", -1), ("hot", 1)]:
        g(page, "startGame('temperature')")
        page.evaluate("""(want) => {
          const G = window.__game, st = G.state;
          const i = st.events.findIndex(e => e.scenario.stage === 'during');
          for (let k = 0; k < i; k++) st.events[k].done = true, st.events[k].correct = true;
          st.eventIndex = i;
          const pick = G.getBank().find(s => s.hazard === 'temperature' && DH.scenes.moodOf(s) === want);
          st.events[i].scenario = pick;
          st.player.x = st.events[i].x - 240;
          G.view.cam.x = st.player.x + 100;
        }""", want)
        page.wait_for_timeout(1800)
        S(f"play-temperature-{name}")

    # 結局：好、普通、求援、總結
    g(page, "startGame('earthquake')")
    play(page, "correctIndex")
    walk_to_finish(page)
    page.wait_for_timeout(500)
    S("ending-good")
    g(page, "startGame('flood')")
    for k in range(8):
        g(page, "triggerNextEvent()")
        g(page, "answer(window.__game.wrongIndex())" if k in (1, 3, 6) else "answer(window.__game.correctIndex())")
        g(page, "continue()")
    walk_to_finish(page)
    page.wait_for_timeout(500)
    S("ending-normal")
    g(page, "startGame('air')")
    for k in range(4):
        g(page, "triggerNextEvent()")
        g(page, "answer(window.__game.wrongIndex())" if k < 3 else "answer(window.__game.correctIndex())")
        g(page, "continue()")
    g(page, "skipToEnding(90)")
    page.wait_for_timeout(400)
    S("ending-narrow")
    g(page, "startGame('tsunami')")
    play(page, "wrongIndex")
    page.wait_for_timeout(500)
    S("ending-bad")
    page.evaluate("document.querySelector('.ending-right').scrollTop = 0")
    g(page, "startGame('blackout')")
    for k in range(8):
        g(page, "triggerNextEvent()")
        g(page, "answer(window.__game.wrongIndex())" if k in (1, 5) else "answer(window.__game.correctIndex())")
        g(page, "continue()")
    walk_to_finish(page)
    page.wait_for_timeout(300)
    page.evaluate("document.querySelector('.ending-right').scrollTop = document.querySelector('.ending-right').scrollHeight")
    page.wait_for_timeout(200)
    S("summary")
    check(not errors, f"截圖流程無錯誤 {errors[:3]}")
    page.context.close()

    page = new_page(browser, errors, data, viewport=(390, 844), mobile=True)
    S = lambda n: page.screenshot(path=str(shots_dir() / f"{n}.png"))
    open_game(page)
    g(page, "backToMenu()")
    page.wait_for_timeout(250)
    S("mobile-entry")
    page.tap(".hz-stamp[data-hazard='debris']")
    page.wait_for_timeout(250)
    S("mobile-entry-selected")
    g(page, "startGame('flood')")
    g(page, "triggerNextEvent()")
    page.wait_for_timeout(800)
    S("mobile-question")
    g(page, "answer(window.__game.wrongIndex())")
    page.wait_for_timeout(700)
    S("mobile-feedback")
    g(page, "continue()")
    play(page, "wrongIndex")
    page.wait_for_timeout(500)
    S("mobile-ending")
    page.context.close()

    # 360x640：未選取，以及「有最佳紀錄＋徽章」的選取狀態
    page = new_page(browser, errors, data, viewport=(360, 640), mobile=True)
    S = lambda n: page.screenshot(path=str(shots_dir() / f"{n}.png"))
    open_game(page)
    g(page, "backToMenu()")
    page.wait_for_timeout(250)
    S("mobile-entry-360")
    for hid in ["debris", "earthquake"]:
        g(page, f"startGame('{hid}')")
        play(page, "correctIndex")
        if g(page, "state.screen") != "ending":
            walk_to_finish(page)
    g(page, "backToMenu()")
    page.wait_for_timeout(250)
    page.tap(".hz-stamp[data-hazard='debris']")
    page.wait_for_timeout(350)
    S("mobile-entry-selected-360")
    page.context.close()

    # 橫式手機
    page = new_page(browser, errors, data, viewport=(844, 390), mobile=True)
    S = lambda n: page.screenshot(path=str(shots_dir() / f"{n}.png"))
    open_game(page)
    g(page, "backToMenu()")
    page.wait_for_timeout(250)
    S("mobile-entry-landscape")
    page.tap(".hz-stamp[data-hazard='debris']")
    page.wait_for_timeout(350)
    S("mobile-entry-selected-landscape-empty")
    # 最長名稱＋完整紀錄（最佳紀錄、多個徽章）
    for hid in ["debris", "earthquake", "flood"]:
        g(page, f"startGame('{hid}')")
        play(page, "correctIndex")
        if g(page, "state.screen") != "ending":
            walk_to_finish(page)
    g(page, "backToMenu()")
    page.wait_for_timeout(250)
    page.tap(".hz-stamp[data-hazard='debris']")
    page.wait_for_timeout(350)
    S("mobile-entry-selected-landscape")
    check(not errors, f"手機入口截圖無錯誤 {errors[:3]}")
    page.context.close()


HIDE_JS = """() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange')); }"""
SHOW_JS = """() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); }"""
STORE_SOUND_JS = "JSON.parse(localStorage.getItem('digital-disaster.v1') || '{}').sound"


def audio_state(page):
    return g(page, "audio.state()")


def wait_audio(page, cond, timeout=8000):
    """等 __game.audio.state()（以 s 代稱）滿足條件；逾時交給後面的斷言報告實際狀態。"""
    try:
        page.wait_for_function(f"() => {{ const s = window.__game.audio.state(); return {cond}; }}", timeout=timeout)
    except Exception:  # noqa: BLE001
        pass


def wait_track(page, track, timeout=3000):
    try:
        page.wait_for_function("(t) => window.__game.audio.state().track === t", arg=track, timeout=timeout)
    except Exception:  # noqa: BLE001 — 逾時交給後面的斷言報告實際曲目
        pass
    return audio_state(page)["track"]


def test_bgm(browser, data):
    print("[背景音樂]")
    errors = []
    page = new_page(browser, errors, data)
    open_game(page)
    st = audio_state(page)
    check(st["ctx"] is None and st["track"] is None and st["muted"] and st["bgmGain"] == 0, f"手勢前沒有 AudioContext、沒有播放 {st}")
    # 預設靜音：點畫面（手勢）也不建立
    page.mouse.click(6, 6)
    page.wait_for_timeout(120)
    check(audio_state(page)["ctx"] is None, "預設靜音時點畫面不建立 AudioContext")

    # 點音效鈕：手勢內建立並播放入口曲，淡入約 1 秒
    page.click("#btn-sound-start")
    tr = wait_track(page, "entry")
    # 淡入是音訊時鐘的 1 秒；headless 的音訊時鐘剛啟動時會落後牆上時間，等條件成立而不是睡固定時間
    wait_audio(page, "s.trackGain > 0.9 && s.busGain >= s.bgmGain - 0.002")
    st = audio_state(page)
    check(st["ctx"] == "running" and tr == "entry", f"點擊後 AudioContext running、播放入口曲 {st['ctx']} {tr}")
    check(0.06 <= st["bgmGain"] <= 0.1 and abs(st["busGain"] - st["bgmGain"]) < 0.005, f"BGM 匯流排音量 {st['bgmGain']}（節點 {st['busGain']:.3f}）")
    check(st["trackGain"] > 0.9 and st["voices"] > 0, f"淡入完成且有聲部在播 gain={st['trackGain']:.2f} voices={st['voices']}")
    check(page.evaluate(STORE_SOUND_JS) is True, "開啟音效寫入 localStorage")

    # 演練：災前 calm → 當下 tense → 災後 relief → 結局 ending → 回選單 entry
    g(page, "startGame('earthquake')")
    check(wait_track(page, "calm") == "calm", "災前：calm")
    page.evaluate("window.__game.state.player.x = 2000")
    check(wait_track(page, "tense") == "tense", "災害當下：tense")
    peak = 0
    for _ in range(20):
        peak = max(peak, audio_state(page)["voices"])
        page.wait_for_timeout(100)
    check(0 < peak <= 48, f"lookahead 排程：同時存在的聲部不累積（最多 {peak}）")
    page.evaluate("window.__game.state.player.x = 4000")
    check(wait_track(page, "relief") == "relief", "災後：relief")
    g(page, "skipToEnding('good')")
    check(wait_track(page, "ending:good") == "ending:good", "結局：ending:good")
    g(page, "backToMenu()")
    check(wait_track(page, "entry") == "entry", "回選單：entry")
    g(page, "startGame('flood')")
    g(page, "skipToEnding('bad')")
    check(wait_track(page, "ending:bad") == "ending:bad", "求援結局：ending:bad")

    # 靜音鈕：BGM 匯流排歸零、曲目停止、音效也關；寫入 localStorage
    g(page, "backToMenu()")
    g(page, "startGame('typhoon')")
    wait_track(page, "calm")
    page.click("#btn-sound")
    wait_audio(page, "s.busGain < 0.002")
    st = audio_state(page)
    check(st["muted"] and st["bgmGain"] == 0 and st["busGain"] < 0.002 and st["track"] is None, f"靜音：BGM gain 為 0、曲目停止 {st}")
    check(not page.evaluate("DH.audio.enabled") and page.get_attribute("#btn-sound", "aria-pressed") == "false", "靜音同時關閉音效")
    check(page.evaluate(STORE_SOUND_JS) is False, "靜音寫入 localStorage")
    try:
        page.wait_for_function("window.__game.audio.state().voices === 0", timeout=8000)
    except Exception:  # noqa: BLE001
        pass
    check(audio_state(page)["voices"] == 0, f"靜音後淡出的聲部全部釋放 voices={audio_state(page)['voices']}")

    # 重新載入後仍靜音：不建立 AudioContext、按鈕顯示關閉
    page.reload()
    page.wait_for_function("window.__game && window.__game.state.screen !== 'loading'")
    page.mouse.click(6, 6)
    page.wait_for_timeout(150)
    st = audio_state(page)
    check(st["ctx"] is None and st["muted"] and page.get_attribute("#btn-sound-start", "aria-pressed") == "false", f"重新載入後仍靜音 {st}")

    # 反向：開著音效重新載入 → 按鈕顯示開啟，但 AudioContext 等第一次手勢才建立
    page.click("#btn-sound-start")
    wait_track(page, "entry")
    page.reload()
    page.wait_for_function("window.__game && window.__game.state.screen !== 'loading'")
    page.wait_for_timeout(200)
    st = audio_state(page)
    check(st["ctx"] is None and not st["muted"] and page.get_attribute("#btn-sound-start", "aria-pressed") == "true", f"開著音效重新載入：手勢前不建立 {st}")
    page.mouse.click(6, 6)
    check(wait_track(page, "entry") == "entry" and audio_state(page)["ctx"] == "running", "第一次手勢後恢復播放入口曲")

    # 頁籤切走：暫停；切回來：恢復
    page.evaluate(HIDE_JS)
    try:
        page.wait_for_function("window.__game.audio.state().ctx === 'suspended'", timeout=3000)
    except Exception:  # noqa: BLE001
        pass
    check(audio_state(page)["ctx"] == "suspended" and g(page, "state.paused"), f"hidden 時 AudioContext 暫停 {audio_state(page)['ctx']}")
    page.evaluate(SHOW_JS)
    try:
        page.wait_for_function("window.__game.audio.state().ctx === 'running'", timeout=3000)
    except Exception:  # noqa: BLE001
        pass
    check(audio_state(page)["ctx"] == "running" and not g(page, "state.paused"), f"切回來恢復播放 {audio_state(page)['ctx']}")
    check(not errors, f"背景音樂流程無 console error／pageerror {errors[:3]}")
    page.context.close()


def run_suite(pw, name, logic_data, shot_data, mock):
    global BROWSER
    BROWSER = name
    print(f"===== {name} =====")
    try:
        browser = getattr(pw, name).launch()
    except Exception as e:  # noqa: BLE001 — 啟動失敗要明確記錄
        check(False, f"{name} 無法啟動：{str(e).splitlines()[0]}")
        return
    if not NO_SHOTS:
        (shots_dir() / "audit").mkdir(parents=True, exist_ok=True)
    print(f"{name} {browser.version}")
    test_all_hazards(browser, logic_data)
    test_rules(browser, logic_data)
    test_small_bank(browser)
    test_validation(browser, mock)
    if name == "chromium":
        test_merge_tool(mock)
    test_risk_sync(browser, logic_data)
    test_interaction(browser, logic_data)
    test_bgm(browser, logic_data)
    test_entry(browser, logic_data)
    test_bubble_clearance(browser, logic_data)
    test_layouts(browser, shot_data)
    test_mobile_reading(browser, logic_data)
    test_ending_more(browser, logic_data)
    if not NO_SHOTS:
        take_screenshots(browser, shot_data)
    browser.close()


def main():
    data_file = ROOT / "data" / "scenarios.json"
    has_real = data_file.exists() and (ROOT / "data" / "hazards.json").exists()
    if REAL and not has_real:
        print("找不到 data/scenarios.json，請先執行 tools/merge_bank.py")
        return 1
    mock = mock_data()
    logic_data = None if REAL else mock
    shot_data = None if has_real else mock
    names = ["chromium", "webkit"] if ARGS.browser == "all" else [ARGS.browser]
    server = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.6)
    try:
        with sync_playwright() as pw:
            for name in names:
                run_suite(pw, name, logic_data, shot_data, mock)
            check(not external, f"沒有外部請求 {external[:3]}")
    finally:
        server.terminate()
    print()
    if failures:
        print(f"失敗 {len(failures)} 項：")
        for f in failures:
            print(" -", f)
        return 1
    print("全部通過（" + "、".join(names) + "）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
