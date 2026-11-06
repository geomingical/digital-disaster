"""Rebuild the OG from game drawing functions and capture local review evidence."""
import base64
import pathlib
import subprocess
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'screenshots/p1b-2026-11-06'
OUT.mkdir(parents=True, exist_ok=True)
server = subprocess.Popen(['python3', '-m', 'http.server', '8878', '--bind', '127.0.0.1'], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
        page = browser.new_page(viewport={'width': 1440, 'height': 900})
        page.goto('http://127.0.0.1:8878/?seed=123')
        page.wait_for_function('window.__game && window.__game.state.screen !== "loading"')
        data = page.evaluate('''() => {
          const A = DH.art, canvas = document.createElement('canvas');
          canvas.width = 1200; canvas.height = 630;
          const c = canvas.getContext('2d');
          c.fillStyle = '#fbf3e0'; c.fillRect(0,0,1200,630);
          A.ell(c, 955, 315, 390, 320, '#e3ebd5');
          A.ell(c, 925, 590, 420, 140, '#b9d29d');
          c.save(); c.translate(820,410); DH.art.decor.house(c,1.5,0,{lit:true,h:0.4,label:'社區雜貨店'}); c.restore();
          c.save(); c.translate(1080,430); DH.art.decor.shop(c,1.1,0,{lit:true,h:0.4,label:'社區雜貨店'}); c.restore();
          A.box(c,610,475,570,70,28,'#e9d8b4');
          A.drawHero(c,855,552,{t:1,scale:2.45,dir:1,risk:0,pose:'wave',gear:{}});
          [['earthquake',665,116],['flood',1055,90],['air',1100,265],['blackout',655,310]].forEach(([id,x,y])=>{
            A.ell(c,x,y,57,57,'#fffdf6');
            A.ell(c,x,y,51,51,A.HAZARD_COLOR[id]);
            const icon = document.createElement('canvas');
            A.paintHazardIcon(icon,id,100,true); c.drawImage(icon,x-47,y-47,94,94);
          });
          c.textAlign='left'; c.textBaseline='middle';
          c.fillStyle='#4d4037'; c.font=`900 100px ${A.FONT}`; c.fillText('數位災害',62,213);
          c.font=`700 40px ${A.FONT}`; c.fillText('防災情境演練',68,300);
          A.box(c,68,365,402,58,20,'#bd542b');
          c.fillStyle='#fffdf6'; c.font=`700 26px ${A.FONT}`; c.fillText('走進社區，練習每一步應變',88,395);
          c.save(); c.translate(92,503); A.icons.pack(c); c.restore();
          c.save(); c.translate(148,503); A.icons.drop(c); c.restore();
          c.fillStyle='#6b5c50'; c.font=`600 23px ${A.FONT}`; c.fillText('十種主題・災前／當下／災後',192,505);
          return canvas.toDataURL('image/jpeg',.94).split(',')[1];
        }''')
        (ROOT/'assets/og-cover.jpg').write_bytes(base64.b64decode(data))
        from PIL import Image
        for size in [(600,315),(300,158)]:
            Image.open(ROOT/'assets/og-cover.jpg').resize(size).save(OUT/f'og-{size[0]}.jpg')
        for width,height,mobile in [(1440,900,False),(390,844,True)]:
            ctx=browser.new_context(viewport={'width':width,'height':height},is_mobile=mobile,has_touch=mobile,device_scale_factor=2 if mobile else 1,reduced_motion='reduce')
            p=ctx.new_page(); p.goto('http://127.0.0.1:8878/?seed=123')
            p.wait_for_function('window.__game && window.__game.state.screen !== "loading"')
            p.evaluate('window.__game.backToMenu()'); p.wait_for_timeout(400)
            p.screenshot(path=str(OUT/f'{width}-entry.png'))
            for hid in ['tsunami','flood','air','blackout']:
                for stage in ['during']:
                    for risk in [90]:
                        p.evaluate('window.__game.startGame('+repr(hid)+')')
                        p.evaluate('''([stage,risk])=>{const G=window.__game,s=G.state;
                          const i=s.events.findIndex(e=>e.scenario.stage===stage);
                          for(let k=0;k<i;k++)s.events[k].done=true,s.events[k].correct=true;
                          s.eventIndex=i;s.player.x=s.events[i].x-170;G.view.cam.x=s.player.x+100;
                          s.risk=risk;s.riskView=risk;
                        }''',[stage,risk])
                        p.wait_for_timeout(900)
                        p.screenshot(path=str(OUT/f'{width}-{hid}-{stage}-{risk}.png'))
            p.evaluate('''() => { const G=window.__game; G.startGame('blackout');
              for(let i=0;i<8;i++){G.triggerNextEvent();G.answer(G.correctIndex());G.continue();}
              G.skipToEnding(); }'''); p.wait_for_timeout(500)
            p.screenshot(path=str(OUT/f'{width}-ending.png'))
            p.evaluate('window.__game.skipToEnding(100)'); p.wait_for_timeout(500)
            p.screenshot(path=str(OUT/f'{width}-ending-rescue.png'))
            ctx.close()
        browser.close()
finally:
    server.terminate(); server.wait()
