#!/usr/bin/env python3
"""合併 research/bank_*.json → data/hazards.json、data/scenarios.json、js/fallback-data.js。

格式不符的題目會在 stdout 警告並略過，不會修改題目內容。
用法：python3 tools/merge_bank.py [--research DIR] [--out DIR]
"""
import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
STAGES = ("before", "during", "after")
# 顯示順序與主題色、圖示 key（圖示由 js/art.js 的 hazardIcons 繪製）
HAZARD_META = {
    "earthquake": {"order": 0, "color": "#e8a15c", "icon": "earthquake"},
    "tsunami": {"order": 1, "color": "#5fb8d6", "icon": "tsunami"},
    "typhoon": {"order": 2, "color": "#8aa4c8", "icon": "typhoon"},
    "flood": {"order": 3, "color": "#6d9ee0", "icon": "flood"},
    "debris": {"order": 4, "color": "#b98a60", "icon": "debris"},
    "temperature": {"order": 5, "color": "#ef8f6b", "icon": "temperature"},
    "air": {"order": 6, "color": "#a9b48c", "icon": "air"},
    "drought": {"order": 7, "color": "#d9b45f", "icon": "drought"},
    "blackout": {"order": 8, "color": "#7d78b8", "icon": "blackout"},
    "nuclear": {"order": 9, "color": "#6dbba0", "icon": "nuclear"},
}

# 來源短標題：「機關｜短用途」總長上限（含分隔符）。完整機關與標題仍保留在原欄位。
SHORT_MAX = 14
AGENCY_SHORT = {
    "中央氣象署": "氣象署",
    "交通部中央氣象署": "氣象署",
    "中央氣象署／國家災害防救科技中心": "氣象署",
    "內政部消防署": "消防署",
    "勞動部勞動力發展署": "勞發署",
    "台灣電力公司北北區營業處": "台電北北區",
    "台灣電力公司基隆區營業處": "台電基隆",
    "國家災害防救科技中心": "災防中心",
    "國立臺灣大學醫學院附設醫院新竹臺大分院": "新竹臺大",
    "國防部全民防衛動員署": "全動署",
    "新北市政府交通局": "新北交通局",
    "新北市政府環境保護局": "新北環保局",
    "新北市金山區公所": "金山區公所",
    "新竹縣政府衛生局": "新竹縣衛生局",
    "核能安全委員會": "核安會",
    "核能安全委員會（原行政院原子能委員會出版）": "核安會",
    "經濟部標準檢驗局": "標檢局",
    "經濟部水利署": "水利署",
    "美國疾病管制與預防中心（CDC）": "美國CDC",
    "美國聯邦緊急事務管理署（FEMA）": "美國FEMA",
    "美國食品藥物管理局（FDA）": "美國FDA",
    "臺中市政府新聞局": "臺中新聞局",
    "臺北市大同區公所／台灣電力公司": "大同區公所",
    "臺北市政府": "臺北市府",
    "臺北市政府工務局水利工程處": "臺北水利處",
    "臺北市政府消防局": "臺北市消防局",
    "臺北市政府消防局防災科學教育館": "臺北防災館",
    "臺北市政府衛生局": "臺北市衛生局",
    "臺北自來水事業處": "北水處",
    "衛生福利部國民健康署": "國健署",
    "衛生福利部疾病管制署": "疾管署",
    "衛生福利部食品藥物管理署": "食藥署",
    "農業部林業及自然保育署": "林業保育署",
    "農業部農村發展及水土保持署": "農村水保署",
    "農業部農業金融署": "農金署",
    "高雄市政府環境保護局": "高雄環保局",
    "高雄市政府警察局": "高雄警局",
    "高雄市政府警察局左營分局": "左營分局",
    "內政部": "內政部",
    "教育部": "教育部",
    "農業部": "農業部",
    "環境部": "環境部",
    "環境部環境管理署": "環管署",
    "行政院原子能委員會（核能安全委員會典藏）": "原能會"
}
# 規則縮不好的標題由人工命名，只描述文件用途，不新增事實
TITLE_SHORT = {
    "93. 應如何避免海嘯災難？": "如何避免海嘯災難",
    "95. 地震前之準備事項為何？": "地震前準備事項",
    "我們「雨」災的距離—雨量分級": "雨量分級",
    "海嘯資訊種類及預估波高分級表": "海嘯波高分級表",
    "陸上強風特報：燈號標準與注意事項": "強風特報燈號",
    "颱風百問：第88題警報發布標準": "颱風警報發布標準",
    "強風特報警示資料說明": "強風特報說明",
    "颱風天貼膠帶在玻璃門窗上不能防風抗爆": "貼膠帶不能防風抗爆",
    "In an indoor space after the earthquake (the building is possibly damaged)": "震後室內應變",
    "防災有Bear來 海嘯安全應變": "海嘯安全應變",
    "LINE@移點通－電梯受困－多國語版本": "電梯受困",
    "防颱整備與停復電查報、落線安全提醒": "防颱與落線安全",
    "颱風災後復電安全注意事項": "災後復電安全",
    "海嘯溢淹潛勢圖於避難疏散規劃之應用（2026-11-01）": "海嘯溢淹潛勢圖",
    "防災無障礙：肢體障礙者": "肢體障礙者防災",
    "準備日常居家儲備：個人處方藥": "居家儲備處方藥",
    "災害應變參考程序手冊：水災應變原則": "水災應變手冊",
    "災害應變參考程序手冊：颱風、水災與土石流": "颱風水災土石流手冊",
    "重要路口設置 UPS 不斷電系統及路口安全提醒": "路口不斷電系統",
    "陳情管道與處理作業": "陳情管道",
    "核子事故區域民眾防護行動逐里與共同疏散演練": "逐里疏散演練",
    "核子事故民眾防護行動規範": "民眾防護行動規範",
    "輻射劑量比較圖：天然背景輻射": "輻射劑量比較圖",
    "身在輻中要知輻：碘片問答與碘-131小情報（第46、48–49頁）": "碘片問答",
    "室內空氣品質資訊網：空氣清淨機知多少": "空氣清淨機知多少",
    "空氣品質指標：2025年起濃度門檻與活動建議": "空氣品質指標",
    "空氣品質監測網：監測、預報與環境即時通": "空氣品質監測網",
    "使用轉接電源線組（延長線）注意事項": "延長線注意事項",
    "水情燈號意義及對應措施": "水情燈號與措施",
    "輻射緊急事故的食物、飲水與藥品安全": "輻射事故飲食安全",
    "做好應對準備：停電（繁體中文）": "停電應對準備",
    "停電與淹水期間的食物及飲水安全": "停電淹水飲食",
    "颱風季節期間敬請加強用電安全": "颱風季用電安全",
    "易積水地區之地下室或停車場如何防範淹水？": "地下室防淹水",
    "防災臺北：垂直避難與災情通報提醒": "垂直避難與通報",
    "如何防治一氧化碳中毒發生？": "防一氧化碳中毒",
    "颱風來襲先準備 居家防颱守護你我安全": "居家防颱準備",
    "豪（大）雨來了怎麼辦？": "豪大雨怎麼辦",
    "豪雨期防範傳染病 衛生局呼籲落實「防疫四步驟」": "豪雨防疫四步驟",
    "用戶用水設備建議資訊": "用水設備建議",
    "防災資訊答客問：地址查詢與緊急取水": "地址查詢與取水",
    "切勿獨留小孩於車內，保幼3招預防熱傷害": "勿留小孩在車內",
    "沙塵來襲3招自我保護策略": "沙塵自我保護",
    "空污自我防護與口罩正確配戴": "空污防護與口罩",
    "立秋已過暑氣未退，處暑防熱傷害不可鬆懈": "處暑防熱傷害",
    "預防熱傷害！保持涼爽、補充水分、提高警覺": "預防熱傷害",
    "缺水怎麼辦？省水兼防疫指引": "缺水防疫指引",
    "豪雨來襲造成多處積水或淹水 請民眾清理家園務必落實防疫三步驟 並注意自身健康安全": "淹水清理防疫",
    "限水期間飲水與儲水衛生指引（2021-04-06）": "限水飲水儲水衛生",
    "提醒餐飲業者應注意營業場所之通風及排氣，預防一氧化碳中毒": "餐飲通風防一氧化碳",
    "藥品可以放冰箱保存嗎？": "藥品冰箱保存",
    "森林火災災害防救業務計畫：第六章（第30頁）": "森林火災防救計畫",
    "堰塞湖應變機制簡介": "堰塞湖應變機制",
    "燕子口堰塞湖壩體今午已潰決 及時通報相關單位終平安落幕": "燕子口堰塞湖通報",
    "電梯停止，關人時的處置": "電梯受困處置",
    "禁止農業廢棄物露天燃燒": "禁止露天燃燒",
    "車輛停在路中未移動 警立即發現異常 通知號誌維修保護行人過馬路": "路口號誌異常",
    "重要路口交通號誌不斷電系統 預計年底完成130處": "路口不斷電系統",
    "LINE@移點通－停電安全事項要注意－多國語言版": "停電安全事項",
    "強颱薔琵逼近 台電台北北區營業處全力戒備 請民眾多利用網路通報查詢停復電資訊": "停復電查報與落線",
    "中央氣象署 強風特報 警示資料說明": "強風特報說明",
    "國民健康署提醒民眾做好空污自我防護，口罩正確配戴步驟「開、戴、壓、密」": "空污防護與口罩",
    "缺水怎麼辦？疾管署教您如何省水兼防疫 遠離傳染病": "缺水防疫指引",
    "進入抗旱關鍵時期！限水期間民眾應落實手部衛生及留意儲水方式，勿讓傳染病有機可乘": "限水飲水儲水衛生",
    "行動不便者之地震緊急避難原則": "行動不便者避震",
    "豪（大）雨特報：雨量分級與作業說明": "豪大雨分級",
    "颱風發生時該如何疏散、避難": "颱風疏散避難",
    "連續低溫來襲 如何自我保暖 隨身保暖商品使用2原則 低溫保健8要點": "低溫保健八要點",
    "冷氣團來襲 消防署提醒：熱水器要通風 防中毒卡安心": "熱水器通風防中毒",
    "氣象防災小知識：颱風警報發布標準": "颱風警報標準",
    "颱風水災土石流手冊": "颱風水災土石流"
}
TITLE_PREFIXES = ("臺灣全民安全指引：", "防災資訊答客問：")


def short_label(link):
    """回傳 (短標題, 是否超長)。超長表示需要補 AGENCY_SHORT／TITLE_SHORT。"""
    agency = AGENCY_SHORT.get(link["agency"], link["agency"])
    title = TITLE_SHORT.get(link["title"])
    if title is None:
        title = re.sub(r"^\d+\.\s*", "", link["title"])
        title = re.sub(r"（[^（）]*）$", "", title)
        for prefix in TITLE_PREFIXES:
            title = title.removeprefix(prefix)
        title = title.rstrip("？！。 ")
    room = SHORT_MAX - len(agency) - 1
    if len(title) > room:
        return f"{agency}｜{title[:max(room, 1)]}", True
    return f"{agency}｜{title}", False


def with_short(link, name):
    """複製一份加上 short；不修改 bank_*.json 的內容。"""
    short, too_long = short_label(link)
    if too_long:
        print(f"警告：{name} 來源短標題超過 {SHORT_MAX} 字，已硬切，請補對照表：{link['agency']}｜{link['title']}")
    return {**link, "short": short}


def is_text(v):
    return isinstance(v, str) and v.strip() != ""


def link_problem(link):
    if not isinstance(link, dict):
        return "連結不是物件"
    for key in ("agency", "title", "url"):
        if not is_text(link.get(key)):
            return f"連結缺少 {key}"
    if not link["url"].startswith("https://"):
        return f"網址不是 https：{link['url']}"
    return None


def scenario_problem(s, hazard_id):
    if not isinstance(s, dict):
        return "題目不是物件"
    for key in ("id", "category", "title", "situation", "why", "keypoint"):
        if not is_text(s.get(key)):
            return f"缺少 {key}"
    if s.get("hazard") != hazard_id:
        return f"hazard 應為 {hazard_id}，實際為 {s.get('hazard')}"
    if s.get("stage") not in STAGES:
        return f"stage 不合法：{s.get('stage')}"
    options = s.get("options")
    if not (isinstance(options, list) and len(options) == 3 and all(is_text(o) for o in options)):
        return "options 必須是 3 個字串"
    answer = s.get("answer")
    if isinstance(answer, bool) or not isinstance(answer, int) or not 0 <= answer <= 2:
        return "answer 必須是 0–2"
    risk = s.get("risk")
    if not (isinstance(risk, list) and len(risk) == 3):
        return "risk 長度必須是 3"
    for i, n in enumerate(risk):
        if isinstance(n, bool) or not isinstance(n, (int, float)):
            return "risk 必須是數字"
        if i == answer and n != 0:
            return "正解的 risk 必須是 0"
        if i != answer and n < 10:
            return "錯誤選項的 risk 必須 ≥ 10"
    sources = s.get("sources")
    if not (isinstance(sources, list) and len(sources) >= 1):
        return "sources 至少 1 筆"
    for link in sources:
        problem = link_problem(link)
        if problem:
            return f"sources：{problem}"
    return None


def load_bank(path, used_ids):
    """回傳 (hazard, scenarios)；檔案本身壞掉時回傳 (None, [])。"""
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        print(f"警告：{path.name} 讀取失敗，整份略過：{err}")
        return None, []
    hazard = raw.get("hazard") if isinstance(raw, dict) else None
    if not isinstance(hazard, dict) or hazard.get("id") not in HAZARD_META or not is_text(hazard.get("name")):
        print(f"警告：{path.name} 的 hazard 欄位不合法，整份略過")
        return None, []
    links = []
    for link in hazard.get("links") or []:
        problem = link_problem(link)
        if problem:
            print(f"警告：{path.name} hazard.links 略過一筆：{problem}")
        else:
            links.append(with_short(link, path.name))
    meta = HAZARD_META[hazard["id"]]
    out = {
        "id": hazard["id"],
        "name": hazard["name"],
        "tagline": hazard.get("tagline", ""),
        "intro": hazard.get("intro", ""),
        "links": links,
        **meta,
    }
    good = []
    for s in raw.get("scenarios") or []:
        problem = scenario_problem(s, hazard["id"])
        sid = s.get("id") if isinstance(s, dict) else None
        if not problem and sid in used_ids:
            problem = "id 重複"
        if problem:
            print(f"警告：{path.name} 略過 {sid}：{problem}")
            continue
        used_ids.add(sid)
        good.append({**s, "sources": [with_short(link, path.name) for link in s["sources"]]})
    return out, good


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--research", default=str(ROOT / "research"))
    ap.add_argument("--out", default=str(ROOT))
    args = ap.parse_args()
    research = pathlib.Path(args.research)
    out = pathlib.Path(args.out)

    used_ids = set()
    loaded = {}
    for path in sorted(research.glob("bank_*.json")):
        hazard, scenarios = load_bank(path, used_ids)
        if hazard:
            if hazard["id"] in loaded:
                print(f"警告：{path.name} 的災害 {hazard['id']} 重複，略過")
                continue
            loaded[hazard["id"]] = (hazard, scenarios)

    ordered = sorted(loaded.values(), key=lambda pair: pair[0]["order"])
    if not ordered:
        print("錯誤：沒有可用的題庫檔")
        return 1

    hazards = [h for h, _ in ordered]
    scenarios = [s for _, bank in ordered for s in bank]
    fallback = {"hazards": hazards, "scenarios": scenarios}

    (out / "data").mkdir(parents=True, exist_ok=True)
    (out / "js").mkdir(parents=True, exist_ok=True)
    dump = lambda v: json.dumps(v, ensure_ascii=False, indent=1)
    (out / "data" / "hazards.json").write_text(dump(hazards) + "\n", encoding="utf-8")
    (out / "data" / "scenarios.json").write_text(dump(scenarios) + "\n", encoding="utf-8")
    (out / "js" / "fallback-data.js").write_text(
        "/* 由 tools/merge_bank.py 產生的完整題庫副本，直接開啟檔案或題庫讀取失敗時使用。 */\n"
        f"window.DH_FALLBACK = {json.dumps(fallback, ensure_ascii=False)};\n",
        encoding="utf-8",
    )

    for hazard, bank in ordered:
        counts = {st: sum(1 for s in bank if s["stage"] == st) for st in STAGES}
        note = "" if len(bank) >= 8 and counts["during"] >= 3 else "（題數不足，部分局會少於配額）"
        print(f"{hazard['id']}: {len(bank)} 題 {counts}{note}")
    missing = sorted(set(HAZARD_META) - set(loaded))
    if missing:
        print("注意：尚缺題庫：" + "、".join(missing))
    print(f"共 {len(hazards)} 種災害、{len(scenarios)} 題")
    return 0


if __name__ == "__main__":
    sys.exit(main())
