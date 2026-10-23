// Kouřový test stránky: načte index.html v Chromiu, projde záložky, detail, váhy a okno trasy
// a selže, pokud se v konzoli objeví chyba skriptu. Externí služby se simulují.
// Spuštění: node tests/smoke.mjs   (potřebuje balíček playwright a Chromium)
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = pathToFileURL(path.join(root, 'index.html')).href;
const errors = [];
const fail = (msg) => { errors.push(msg); };

const browser = await chromium.launch();
for (const [width, height] of [[1440, 900], [400, 850]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (e) => fail(`[${width}px] ${e.message}`));
  // externí služby: prázdné odpovědi, aby test nezávisel na síti
  await page.route(/commons\.wikimedia\.org|wikipedia\.org/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' }));
  await page.route(/brouter\.de\/brouter\?/, (r) => r.fulfill({ status: 503, body: '' }));
  await page.route(/tile\.openstreetmap|upload\.wikimedia/, (r) => r.fulfill({ status: 204, body: '' }));
  await page.route(/supabase\.co/, (r) => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' }));
  await page.goto(url);
  await page.waitForTimeout(300);

  const n = await page.evaluate(() => typeof LOC !== 'undefined' ? LOC.length : 0);
  if (n < 10) fail(`[${width}px] data se nenačetla (LOC.length = ${n})`);

  // každý bod trasy má souřadnice
  const missing = await page.evaluate(() => { const m = []; for (const k in ROUTES) for (const r of ROUTES[k].r) for (const w of r[3]) if (!COORD[w]) m.push(w); return m; });
  if (missing.length) fail(`chybí souřadnice v COORD: ${missing.join(', ')}`);
  // každá lokalita má gastro, trasy a polohu na mapě
  const incomplete = await page.evaluate(() => LOC.filter((l) => !GASTRO[l.id] || !ROUTES[l.id] || !GEO[l.id] || TR[l.id] == null).map((l) => l.id));
  if (incomplete.length) fail(`neúplná lokalita (GASTRO/ROUTES/GEO/TR): ${incomplete.join(', ')}`);
  // každá lokalita má vítr na leden–květen (tools/fetch-wind.mjs)
  const noWind = await page.evaluate(() => LOC.filter((l) => !WIND[l.id] || WIND[l.id].w.length !== 5 || WIND[l.id].wd.length !== 5).map((l) => l.id));
  if (noWind.length) fail(`chybí vítr ve WIND (spusť node tools/fetch-wind.mjs): ${noWind.join(', ')}`);
  // každý klíč zdroje existuje v SRC
  const badSrc = await page.evaluate(() => { const b = []; const chk = (ks, w) => (ks || []).forEach((k) => { if (!SRC[k]) b.push(`${w}:${k}`); });
    LOC.forEach((l) => { chk(l.cl.src, l.id); chk(l.cs.src, l.id); chk(l.web, l.id); Object.values(l.f).forEach((f) => chk(f.src, l.id)); l.climbs.forEach((c) => c[4] && chk([c[4]], l.id)); chk(GASTRO[l.id].src, l.id); });
    return b; });
  if (badSrc.length) fail(`neexistující klíče zdrojů: ${badSrc.join(', ')}`);

  for (const tab of ['pocasi', 'srovnani', 'tabulka', 'termin', 'hlasovani']) {
    const el = await page.$(`[data-tab=${tab}]`);
    if (el) await el.click(); else fail(`chybí záložka ${tab}`);
    const tw = await page.evaluate(() => document.documentElement.scrollWidth);
    if (tw > width + 1) fail(`[${width}px] záložka ${tab} se posouvá do strany (šířka ${tw})`);
  }
  for (const m of ['0', '3']) await page.click(`[data-m="${m}"]`);
  for (const ap of ['PRG', 'VIE', 'BTS', 'ALL']) await page.click(`[data-ap=${ap}]`);

  // hlasování bez jména: klik na + u karty nesmí nic uložit, ale má nabídnout zadání jména
  await page.click('#voteWrap [data-v]');
  if (!(await page.$('#vName'))) fail(`[${width}px] po kliknutí na hlas bez jména se neukázalo pole pro jméno`);

  // sekce „Co ještě ověřit“ dole
  await page.click('#verify summary');
  await page.waitForTimeout(100);
  if (!(await page.$$eval('#vList .vgrp', (x) => x.length))) fail(`[${width}px] sekce Co ještě ověřit je prázdná`);
  await page.click('#verify summary');

  // detail lokality, okno vah, okno trasy
  await page.click('#voteWrap [data-open]');
  await page.waitForTimeout(200);
  if (!(await page.$eval('#dlg', (d) => d.open))) fail(`[${width}px] neotevřel se detail lokality`);
  await page.click('#dlg .ibd .wbtn');
  if (!(await page.$eval('#wdlg', (d) => d.open))) fail(`[${width}px] neotevřelo se okno vah`);
  await page.click('#wDone');
  await page.click('#dlg [data-route]');
  await page.waitForTimeout(300);
  if (!(await page.$eval('#rdlg', (d) => d.open))) fail(`[${width}px] neotevřelo se okno trasy`);

  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  if (sw > width + 1) fail(`[${width}px] stránka se posouvá do strany (šířka ${sw})`);
  await page.close();
}
await browser.close();

if (errors.length) {
  console.error('TEST SELHAL:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log('Test prošel: stránka se načte bez chyb na 1440 i 400 px.');
