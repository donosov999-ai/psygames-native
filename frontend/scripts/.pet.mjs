import { webkit } from 'playwright';
const бр = await webkit.launch();
const стр = await бр.newPage({ viewport: { width: 403, height: 873 } });
await стр.goto('http://127.0.0.1:8127', { waitUntil: 'domcontentloaded' });
await стр.evaluate(() => { localStorage.setItem('language','ru'); localStorage.setItem('psygames_devchat_on','0'); localStorage.setItem('psygames_first_run_done','1'); });
await стр.goto('http://127.0.0.1:8127/pet', { waitUntil: 'networkidle' });
await стр.waitForTimeout(3500);
await стр.screenshot({ path: '/tmp/pet-full.png', clip: { x:0, y:0, width:403, height:600 } });
const кадры = await стр.evaluate(() => [...document.querySelectorAll('img')].map((e) => {
  const r = e.getBoundingClientRect();
  return { src: (e.getAttribute('src')||'').slice(-52), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), natural: `${e.naturalWidth}×${e.naturalHeight}`, complete: e.complete };
}));
console.log('картинок на экране питомца:', кадры.length);
кадры.slice(0,8).forEach(к => console.log(' ', JSON.stringify(к)));
await бр.close();
