// Předpočítá trasy z ROUTES (data.js) přes BRouter a uloží je do routes/ jako GeoJSON a GPX.
// Stránka pak trasy načítá z repozitáře a nezávisí na dostupnosti BRouteru.
//
// Spuštění (potřebuje přístup na https://brouter.de):
//   node tools/generate-routes.mjs            všechny trasy, existující soubory přeskočí
//   node tools/generate-routes.mjs --force    přepočítá všechny
//   node tools/generate-routes.mjs kypr       jen jedna lokalita
//
// Výstup: routes/<lokalita>-<číslo trasy>.geojson a .gpx (číslo = pořadí v ROUTES, od 1).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data.js'), 'utf8') + '\nthis.ROUTES=ROUTES;this.COORD=COORD;this.LOC=LOC;', ctx);
const { ROUTES, COORD, LOC } = ctx;

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find((a) => !a.startsWith('--'));
const outDir = path.join(root, 'routes');
fs.mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const names = Object.fromEntries(LOC.map((l) => [l.id, l.name]));
let ok = 0, skipped = 0, failed = 0;

for (const [id, data] of Object.entries(ROUTES)) {
  if (only && id !== only) continue;
  for (const [i, r] of data.r.entries()) {
    const base = path.join(outDir, `${id}-${i + 1}`);
    if (!force && fs.existsSync(base + '.geojson')) { skipped++; continue; }
    const pts = r[3].map((w) => COORD[w]);
    if (pts.some((p) => !p)) { console.error(`✗ ${id}-${i + 1}: chybí souřadnice v COORD`); failed++; continue; }
    const lonlats = pts.map((p) => `${p[1].toFixed(5)},${p[0].toFixed(5)}`).join('|');
    const url = `https://brouter.de/brouter?profile=fastbike&alternativeidx=0&format=geojson&lonlats=${lonlats}`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      const f = j.features[0];
      f.properties.name = `${names[id]} – ${r[0]}`;
      fs.writeFileSync(base + '.geojson', JSON.stringify({ type: 'FeatureCollection', features: [f] }));
      const trk = f.geometry.coordinates.map((c) => `<trkpt lat="${(+c[1]).toFixed(6)}" lon="${(+c[0]).toFixed(6)}"><ele>${Math.round(c[2] || 0)}</ele></trkpt>`).join('\n');
      fs.writeFileSync(base + '.gpx', `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Zimni kolo 2027" xmlns="http://www.topografix.com/GPX/1/1">
<metadata><name>${esc(f.properties.name)}</name><desc>Trasa z OpenStreetMap (BRouter, profil fastbike). © OpenStreetMap contributors</desc></metadata>
<trk><name>${esc(r[0])}</name><trkseg>
${trk}
</trkseg></trk></gpx>
`);
      console.log(`✓ ${id}-${i + 1}: ${r[0]} – ${(f.properties['track-length'] / 1000).toFixed(1)} km, ${f.properties['filtered ascend']} m`);
      ok++;
    } catch (e) {
      console.error(`✗ ${id}-${i + 1}: ${r[0]} – ${e.message}`);
      failed++;
    }
    await sleep(1200); // šetrně k veřejnému serveru BRouter
  }
}
console.log(`Hotovo: ${ok} nových, ${skipped} přeskočeno, ${failed} chyb.`);
process.exit(failed ? 1 : 0);
