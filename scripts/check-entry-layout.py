from playwright.sync_api import sync_playwright
from pathlib import Path
import atexit
import subprocess
ROOT = Path(__file__).resolve().parents[1]
server = subprocess.Popen(['python3','-m','http.server','8879','--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
atexit.register(lambda: (server.terminate(),server.wait()))
out=ROOT.parent/'screenshots/p1b-2026-11-06';out.mkdir(exist_ok=True)
with sync_playwright() as p:
 b=p.chromium.launch(args=['--no-sandbox'])
 for w,h in [(360,640),(390,844),(844,390),(1024,576),(1440,900)]:
  page=b.new_page(viewport={'width':w,'height':h},has_touch=w<900,is_mobile=w<900,reduced_motion='reduce')
  page.goto('http://127.0.0.1:8879');page.wait_for_function('window.__game && window.__game.state.screen !== "loading"');page.evaluate('window.__game.backToMenu()');page.wait_for_timeout(400)
  page.screenshot(path=str(out/f'{w}x{h}-entry.png'))
  page.locator('[data-hazard="debris"].hz-stamp').focus();page.wait_for_timeout(200);page.screenshot(path=str(out/f'{w}x{h}-entry-selected.png'))
  if w in [360,390]:
   for stamp in page.locator('.hz-stamp').all():
    stamp.focus();page.wait_for_timeout(200)
    for drift in [-3,3]:
     issues=page.evaluate('''drift=>{
      const stamps=[...document.querySelectorAll('.hz-stamp')];
      stamps.forEach(e=>{const f=e.querySelector('.hz-float');f.style.animation='none';f.style.transform=`translateY(${drift}px)`});
      const bubble=document.querySelector('#entry-bubble').getBoundingClientRect();
      const rects=stamps.map(e=>[...e.querySelectorAll('.hz-label,.hz-disc')].map(n=>n.getBoundingClientRect()));
      const gap=(a,b)=>Math.max(b.left-a.right,a.left-b.right,b.top-a.bottom,a.top-b.bottom);
      const issues=[];
      rects.forEach((parts,i)=>parts.forEach(r=>{
       if(r.left<7.5 || r.right>innerWidth-7.5)issues.push(`edge ${i}`);
       if(gap(r,bubble)<7.5)issues.push(`bubble ${i}: ${gap(r,bubble).toFixed(1)}`);
       rects.slice(i+1).forEach((other,j)=>other.forEach(q=>{if(gap(r,q)<7.5)issues.push(`pair ${i}/${i+j+1}`)}));
      }));return issues;
     }''',drift)
     assert not issues,(w,stamp.get_attribute('data-hazard'),drift,issues)
   page.evaluate("""()=>{const store=DH.core.store;
    store.data.badges.push('done-debris');store.hazard('debris').best={risk:0,title:'防災小達人',tier:'good',completed:true};
    DH.entry.clear();document.querySelector('.hz-stamp[data-hazard=debris]').focus();}""")
   page.wait_for_timeout(250)
   page.screenshot(path=str(out/f'{w}x{h}-entry-record.png'))
   issues=page.evaluate('''()=>{
    const b=document.querySelector('#entry-bubble').getBoundingClientRect();
    return [...document.querySelectorAll('.hz-stamp')].flatMap(s=>{
     const d=s.querySelector('.hz-disc').getBoundingClientRect(),l=s.querySelector('.hz-label').getBoundingClientRect();
     const r={left:Math.min(d.left,l.left),right:Math.max(d.right,l.right),top:Math.min(d.top,l.top),bottom:Math.max(d.bottom,l.bottom)};
     const gap=Math.max(b.left-r.right,r.left-b.right,b.top-r.bottom,r.top-b.bottom);
     return gap<8?[`${s.dataset.hazard}: ${gap}`]:[];
    });
   }''')
   assert not issues,(w,'completed record',issues)
   print(f'{w}x{h}: all ten selections, floating extrema and 8px clearance passed')
 b.close()
