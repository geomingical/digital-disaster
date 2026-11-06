# 數位災害

操控 Q 版角色走過「災前準備 → 災害當下 → 災後」，在情境題裡學台灣的防災知識。主角站在社區廣場中央，十個災害圖章環繞四周，選一種出發；每種災害題庫 12 題，每局抽選 8 題。純靜態網站，不需要 build，沒有後端、API key 或外部資源。

教育演練用，非政府發布，請以官方公告為準。風險值是作答累積的遊戲分數，不是真實機率。

## 執行

```bash
python3 -m http.server 8000
# 開啟 http://localhost:8000/
```

題庫平常從 `data/*.json` 讀取，`index.html` 不預先載入備援檔。只有 JSON 讀不到時（包含直接用 `file://` 開啟），`main.js` 才動態插入 `<script src="js/fallback-data.js">`，改用內建的完整題庫（120 題，約 140 KB），每局一樣 8 題、階段配額 2/3/3。http 讀不到 JSON 時會提示可重試；兩者都讀不到時顯示友善的錯誤畫面與重試鈕。

網址參數：`?hazard=<id>` 直接開始、`?seed=123` 固定題序與選項順序（抽題也會參考 localStorage 的作答紀錄，要完全重現請用乾淨的瀏覽器資料）。

## 部署

正式站：https://disaster.aimingdata.com/（Vercel 靜態站，專案根目錄就是本資料夾）。把 `index.html`、`style.css`、`js/`、`data/`、`assets/`、`vercel.json` 放到靜態伺服器即可，不需要 build。

`research/` 只在本機保留（題庫草稿、審查筆記、CLI 紀錄），不會進公開 repo；公開題庫以 `data/*.json` 與 `js/fallback-data.js` 為準。

## 操作

入口：滑鼠移到圖章看說明泡泡、點一下進入；滑鼠從圖章移到泡泡途中掠過別的圖章不會換掉泡泡（停留約 0.14 秒才換），泡泡本身也算 hover 區。手機第一次點選取，再點一次或按泡泡裡的圓形「出發」進入。鍵盤：圓環只佔一個 Tab 停點，方向鍵（左右上下皆可）在圖章間循環，Enter／空白鍵出發，再按 Tab 到「出發」鈕，Esc 關閉泡泡（焦點回到圖章），再按一次 Esc 回首頁。

遊戲中：方向鍵／WASD 移動、點地面走過去、拖曳看周圍、E／空白鍵互動、M 音效（音效＋背景音樂一起開關，偏好存在 localStorage，重新載入後沿用；開著音效時 AudioContext 仍等第一次點擊／按鍵才建立）。題目卡：1／2／3 直接作答，或方向鍵在選項間移動（頭尾循環）再按 Enter／空白鍵；答後 Enter／E 繼續。所有可聚焦元素有深藍外框＋白色光暈的 `:focus-visible` 樣式。手機用左下搖桿與右下互動鈕。

手機結局（≤760px）的 DOM 順序就是閱讀順序：插畫→完成狀態→119/112→安慰句→「先記住這 2 件事」→成績→逐題詳解；`ui.placeEndingBlocks()` 依視窗寬度把「2 件事」搬到成績前，桌機雙欄時搬回右欄。

## 結構

| 檔案 | 內容 |
| --- | --- |
| `js/core.js` | 亂數、資料驗證、抽題配額、結局分級、徽章、localStorage（`digital-disaster.v1`，含 `sound` 音效偏好） |
| `js/art.js` | 角色、貓狗、事件圖示、災害圖章圖示、結局插圖 |
| `js/props.js` | 場景物件庫（房子、路燈、水庫、警示旗、海嘯警報塔 `sirentower`、藍白海嘯標誌 `tsunamisign`…） |
| `js/scenes.js` | 十種災害的配色、物件擺放、天氣與氛圍；海嘯用 `seaFx` 依階段畫海面（災前平靜、當下退潮＋擱淺小船＋海平線大浪、災後混濁泥水） |
| `js/world.js` | 視差背景、地面、物件排序與整體渲染 |
| `js/entry.js` | 入口圖章：桌機為環形；手機直式／橫式用分層場景模板（遠空雲朵、路旁、前景，`TEMPLATES`），說明泡泡、觸控與鍵盤 |
| `js/ui.js` | HUD、簡介、事件卡片、結局、彈窗 |
| `js/audio.js` | WebAudio 合成音效與程序生成背景音樂（無音檔），預設靜音 |
| `js/main.js` | 狀態、主迴圈、輸入、測試鉤子 |
| `tools/merge_bank.py` | 題庫合併與驗證；依對照表產生來源短標題 `short`（「機關｜短用途」，≤14 字，超長會警告），不改 `bank_*.json` |

## 背景音樂

`js/audio.js` 的 BGM 全部由振盪器即時合成，沒有外部音檔。曲目：首頁／入口／簡介放柔和的音樂盒循環（`entry`）；演練依主角所在階段切換：災前 `calm`（F 大調、輕快撥弦）、災害當下 `tense`（D 小調、116 bpm、八分音符低音脈動與固定音型，音色仍柔和）、災後 `relief`（G 大調慢板長音墊）；結局 `ending` 依等級微調（good 亮一點、normal 中性、bad 慢而安穩）。切換曲目淡入淡出約 1 秒。

訊號鏈：聲部 → 曲目 gain → 壓縮器 → 低通 3.4 kHz → BGM 匯流排（gain 0.08，靜音時 0）→ master，整體低於音效。排程用 lookahead scheduler（每 100 ms 只排 0.25 s 內的音符，音符結束即拆節點）。AudioContext 只在使用者手勢內建立／`resume()`（iOS／WebKit 安全）；頁籤切走時 `suspend()`，切回來恢復。測試鉤子 `__game.audio.state()` 回傳 `ctx`（AudioContext 狀態）、`track`（播放中曲目，如 `tense`、`ending:good`）、`muted`、`bgmGain`／`busGain`、`voices` 等。

## 題庫

作者撰寫 `research/bank_<id>.json`（規格見 `research/bank_spec.md`），再合併：

```bash
python3 tools/merge_bank.py   # 可加 --research DIR --out DIR
```

輸出 `data/hazards.json`、`data/scenarios.json` 與 `js/fallback-data.js`。格式不符的題目會在 stdout 警告並略過，不會改動內容；`core.js` 的 `cleanBank` 在載入時會再驗證一次（console 警告）。顯示順序、主題色與圖示 key 在腳本的 `HAZARD_META`。

```json
{"id":"","hazard":"earthquake","category":"","stage":"before|during|after","title":"","situation":"","options":["","",""],"answer":0,"risk":[0,18,24],"why":"","keypoint":"","sources":[{"agency":"","title":"","url":"https://"}]}
```

正解的 risk 必須是 0，其他 ≥ 10。

## 測試

```bash
python3 tests/smoke_test.py            # 模擬題庫跑邏輯，截圖用真實題庫（沒有才用模擬）
python3 tests/smoke_test.py --real     # 全部用 data/ 的真實題庫
python3 tests/smoke_test.py --no-shots # 不輸出截圖
python3 tests/smoke_test.py --browser webkit  # WebKit（預設 chromium；all 兩者都跑）
```

WebKit 需要 `python3 -m playwright install webkit` 與 `install-deps webkit`。這台機器的 apt 經代理時 SRV 查詢會回 500，已加 `/etc/apt/apt.conf.d/99-no-srv`（`Acquire::EnableSrvRecords "false";`）才裝得起來，細節見 `research/webkit_install_notes.md`。

十種災害各玩一次全對與全錯，並檢查配額、分級、備援（http 正常時不得請求 `fallback-data.js`；`file://` 完整玩一局）、風險結算（HUD == 回饋卡）、入口圖章不重疊且不出界、hover 從圖章移到泡泡按「出發」、鍵盤從開始畫面玩到結局、焦點樣式（computed outline／box-shadow）、WebAudio 開關、背景音樂（手勢前不建立 AudioContext；點擊後播放入口曲；各階段與結局曲目切換；靜音使 BGM gain 歸零並寫入 localStorage、重新載入後仍靜音；模擬 `visibilitychange` hidden 時暫停、切回恢復；全程無 console error）、手機答後閱讀（360x640 與 390x844 全部 120 題×正誤兩種卡片不需捲動、字級 ≥14px、按鈕 ≥44px）、手機結局 DOM 順序與安慰句 ≤2 行、版面溢出、外部請求。截圖輸出到上一層的 `screenshots/`（海嘯另有 `play-tsunami-before/during/after.png`；手機入口另有 `mobile-entry-360.png`、`mobile-entry-selected-360.png`（有紀錄＋徽章）、`mobile-entry-landscape.png`），版面稽核圖在 `screenshots/audit/`（390x844、360x640、844x390、1024x576、1440x900）；WebKit 的截圖在 `screenshots/webkit/`。

`window.__game`：`state`、`view`、`store`、`audio`（`audio.state()` 見上）、`getBank()`、`getHazards()`、`startGame(id)`、`selectHazard(id)`、`teleportToNextEvent()`、`teleportToFinish()`、`triggerNextEvent()`、`answer(i)`（i 為畫面上的選項順序）、`correctIndex()`、`wrongIndex()`、`continue()`、`skipToEnding('good'|'normal'|'bad'|風險值)`、`backToMenu()`。

## 合規／分級

起始畫面、操作說明與頁尾並列官方 GSRR 普級標識、「普遍級（普級）」與法定警語「注意使用時間、避免沉迷、遊戲虛擬情節勿模仿。」。原有教育演練聲明與真遇險才撥 119／112 的提醒保留。

發行人須自行至 https://www.gamerating.org.tw/ 完成遊戲分級登錄。本次改動只做站上標示，不代表已完成登錄。

## 素材授權

遊戲場景圖像以 Canvas 程式自繪，見 `js/art.js`、`js/props.js`。`props.js` 的 `sirentower` 是 Canvas 繪製的警報塔視覺道具，無聲音。

所有音效與背景音樂以 WebAudio 即時合成，無音檔，未取樣或引用任何真實警報器或官方警報（如國家級警報、PWS）音檔，音型刻意不同於官方警報。求援提示音函式為 `sosCue()`。

`assets/` 僅有 `og-cover.jpg` 與官方 GSRR 普級標識 `gsrr-g.svg`。標識來源為《遊戲軟體分級管理辦法》法定標識，依規定原樣使用。

## 隱私

遊戲僅在瀏覽器 localStorage 的 `digital-disaster.v1` 鍵儲存遊玩進度、作答紀錄、徽章及音效偏好，不上傳伺服器，無分析追蹤。程式的 `fetch()` 用於讀取本站題庫 JSON。部署 CSP 設定為 `connect-src 'self'`，圖片亦允許本站來源。

可從「我的紀錄」清除紀錄，但會保留音效偏好。若要全部清除，請清除此網站的瀏覽器儲存資料，或在本站開發者工具執行 `localStorage.removeItem('digital-disaster.v1')` 後重新載入。
