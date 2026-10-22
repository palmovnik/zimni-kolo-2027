// Stáhne z Open-Meteo (archiv ERA5) vítr pro základnu každé lokality a zapíše měsíční průměry leden–květen
// do konstanty WIND v data.js (blok mezi značkami WIND:start a WIND:end, při prvním běhu se přidá na konec).
// Základna = první bod první trasy v ROUTES (data.js). Po přidání lokality skript spusť znovu.
//
// Spuštění (Node 18 nebo novější, žádné balíčky; potřebuje přístup na archive-api.open-meteo.com):
//   node tools/fetch-wind.mjs
//
// Pro každý měsíc leden–květen v letech 2016–2025 počítá:
//   w  = průměrná rychlost větru v 10 m nad zemí přes den (9–17 h místního času), km/h
//   wd = průměrný počet dní v měsíci, kdy denní průměr (9–17 h) dosáhl aspoň 25 km/h
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8') + '\nthis.ROUTES=ROUTES;this.COORD=COORD;this.LOC=LOC;', ctx);
const { ROUTES, COORD, LOC } = ctx;

const Y0 = 2016, Y1 = 2025, WINDY = 25;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (x) => Math.round(x * 10) / 10;
const out = {};

for (const l of LOC) {
  const base = ROUTES[l.id].r[0][3][0], [lat, lon] = COORD[base];
  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}` +
    `&start_date=${Y0}-01-01&end_date=${Y1}-05-31&hourly=wind_speed_10m&wind_speed_unit=kmh&timezone=auto`;
  let j = null;
  for (let a = 1; a <= 4 && !j; a++) {
    try { const res = await fetch(url); if (!res.ok) throw new Error('HTTP ' + res.status); j = await res.json(); }
    catch (e) { console.error(`  ${l.id}: pokus ${a} selhal (${e.message})`); await sleep(3000 * a); }
  }
  if (!j) { console.error(`✗ ${l.id}: data se nepodařilo stáhnout`); continue; }
  // denní průměry 9–17 h podle dne
  const days = {};
  j.hourly.time.forEach((t, i) => {
    const h = +t.slice(11, 13), v = j.hourly.wind_speed_10m[i];
    if (h < 9 || h > 17 || v == null) return;
    const d = t.slice(0, 10); (days[d] = days[d] || []).push(v);
  });
  const sum = Array(5).fill(0), n = Array(5).fill(0), windy = Array(5).fill(0), seasons = new Set();
  for (const [d, vs] of Object.entries(days)) {
    const m = +d.slice(5, 7) - 1; if (m > 4) continue;
    const mean = vs.reduce((a, b) => a + b, 0) / vs.length;
    sum[m] += mean; n[m]++; if (mean >= WINDY) windy[m]++; seasons.add(d.slice(0, 4) + '-' + m);
  }
  const years = (m) => [...seasons].filter((s) => s.endsWith('-' + m)).length || 1;
  out[l.id] = { w: sum.map((s, m) => r1(s / (n[m] || 1))), wd: windy.map((c, m) => r1(c / years(m))), at: base, ll: [lat, lon], grid: [j.latitude, j.longitude] };
  console.log(`✓ ${l.id.padEnd(13)} ${base.padEnd(32)} vítr ${out[l.id].w.join(' / ')} km/h · větrné dny ${out[l.id].wd.join(' / ')}`);
  await sleep(800); // šetrně k bezplatnému API
}

const ORDER = LOC.map((l) => l.id).filter((id) => out[id]);
const prevFile = fs.readFileSync(path.join(root, 'data.js'), 'utf8');
const START = '/* WIND:start */', END = '/* WIND:end */';
// lokality, které se teď nepodařilo stáhnout, si ponechají předchozí hodnoty
let prev = {};
if (prevFile.includes(START)) { const c = {}; vm.createContext(c); vm.runInContext(prevFile + '\nthis.WIND=WIND;', c); prev = c.WIND; }
const all = LOC.map((l) => l.id).filter((id) => out[id] || prev[id]);
const row = (id) => { const o = out[id] || prev[id]; return ` ${id}:{w:${JSON.stringify(o.w)},wd:${JSON.stringify(o.wd)},at:${JSON.stringify(o.at)}}`; };
const block = `${START}
/* Vítr: Open-Meteo Historical Weather API (reanalýza ERA5), ${Y0}–${Y1}, bod u základny lokality (at).
   w = průměrná rychlost větru v 10 m přes den (9–17 h), km/h; wd = průměrný počet dní v měsíci s denním průměrem ≥ ${WINDY} km/h.
   Generuje tools/fetch-wind.mjs (staženo ${new Date().toISOString().slice(0, 10)}), ručně neupravovat. */
const WIND={
${all.map(row).join(',\n')}};
${END}`;
const next = prevFile.includes(START)
  ? prevFile.slice(0, prevFile.indexOf(START)) + block + prevFile.slice(prevFile.indexOf(END) + END.length)
  : prevFile.replace(/\s*$/, '\n\n') + block + '\n';
fs.writeFileSync(path.join(root, 'data.js'), next);
console.log(`\nHotovo: ${ORDER.length} z ${LOC.length} lokalit staženo, WIND v data.js má ${all.length} lokalit`);
