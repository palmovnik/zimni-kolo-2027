# Zimní kolo 2027

Interaktivní přehled lokalit pro zimní a jarní cyklovýlet na silničních kolech (leden–květen 2027,
4–5 nocí, skupina 5–6 lidí, kola se půjčují na místě). Odlet z Prahy, Vídně nebo Bratislavy.
Web běží na GitHub Pages: https://palmovnik.github.io/zimni-kolo-2027/

## Struktura repozitáře

- `index.html`: aplikace (CSS, logika, šablony), bez build kroku. GitHub Pages servíruje větev
  `main` z kořene.
- `data.js`: všechna data lokalit (`SRC`, `LOC`, `GASTRO`, `REC`, `REC2`, `ROUTES`, `COORD`, `GEO`,
  `TR`, `WIND`). Načítá se před hlavním skriptem a jeho konstanty jsou globální. Změny dat dělej tady.
  Po každé změně `data.js` zvyš verzi v `<script src="data.js?v=…">` v `index.html`, jinak prohlížeče
  až 10 minut kombinují nový `index.html` se starým `data.js` z cache.
- `routes/`: předpočítané trasy (`<lokalita>-<číslo>.geojson` a `.gpx`). Generuje je
  `node tools/generate-routes.mjs` (potřebuje přístup na brouter.de); stránka je načítá přednostně,
  jinak trasu spočítá živě přes BRouter. Po změně tras v `ROUTES` nebo `COORD` spusť generátor
  s `--force` pro danou lokalitu.
- `tests/smoke.mjs`: automatický test (Playwright). Spouští se `npm test` a na GitHubu po každém
  pushi do `main` (`.github/workflows/test.yml`).
- `README.md`: krátký popis a postup nasazení.
- `reports/`: výstupy rešerší (Markdown).
- `research_notes/`: podklady k rešerším se zdroji. Slouží jako zdroj dat; nemazat ani nepřepisovat
  starší složky, nová rešerše dostane novou složku.
- `.nojekyll`: vypíná zpracování přes Jekyll, nemazat.

## Jak jsou data a kód uspořádané (hledej podle komentářů / názvů konstant)

V `data.js`:

- `SRC`: slovník zdrojů `{klíč: {t: popis, u: URL}}`. Všechny odkazy na zdroje jdou přes něj.
- `LOC`: pole lokalit. Klíčová pole:
  - `hi/lo/rain/sun/sea`: měsíční normály leden–květen; `cl.st` = stanice, `cl.src` = zdroje,
    `cl.est: 1` = neověřené normály
  - `f.PRG / f.VIE / f.BTS`: lety. `d`: `true` = přímý, `"s"` = jen sezónně / neověřeno,
    `false` = s přestupem. Dál `t` = doba letu (h), `tr` = vlastní transfer (h), `p` = odhad zpáteční
    letenky v Kč, `od` = nejnižší nalezená cena, `src` = zdroje
  - `hotel` (€/os/noc), `bike` (€/den), `car` (€/os/pobyt), `food` (€/os/den), `cs` = zdroje a
    poznámka k cenám
  - `sc`: hodnocení 1–5 v pořadí silnice, klid, kopce, zázemí, rozmanitost
  - `climbs`: `[název, km, výškové metry, sklon, klíč do SRC]`; `web`: odkazy na cyklistické weby
- `GASTRO`: hodnocení jídla `s` (může být i 4.5), cenová hladina, jídla, pití, komentář, `src`.
- `ROUTES`: `ph` = hledání fotek na Wikimedia Commons `[dotaz, popisek]`, `r` = základní trasy
  `[název, km, m, body trasy]`.
- `COORD`: souřadnice všech bodů tras. Každý bod z `ROUTES` tu musí být.
- `GEO`: poloha lokality na mapě a umístění popisku. `TR`: transfer z letiště v hodinách.
- `WIND`: vítr leden–květen u základny (první bod první trasy): `w` = průměr 9–17 h v km/h, `wd` = dny
  s denním průměrem ≥ 25 km/h. Generuje ho `node tools/fetch-wind.mjs` (Open-Meteo, ERA5) mezi značkami
  `WIND:start` a `WIND:end`; ručně neupravovat.

V `index.html`:

- `FACTORS`, `W0`, `PRESETS`: kritéria celkového indexu, výchozí váhy a předvolby.
- `parts()`, `total()`, `idx()`, `cost()`, `costParts()`, `travel()`: výpočty indexu, ceny a času.

## Hlasování (záložka Hlasování)

- Metoda D21: 3 kladné hlasy a 1 záporný na osobu, záporný až po 2 kladných, jedné lokalitě nejvýš
  jeden hlas. Konstanty `VPLUS`, `VMIN`, `VMIN_AFTER` v `index.html`.
- Hlasuje se přímo u lokalit: `vCtl(l)` vrací tlačítka + / − se součtem a jmény (karty, detail,
  srovnání, tabulka, výsledky v záložce Hlasování); jméno a zbývající hlasy jsou v liště `#vbar`
  nahoře (na telefonu dole). Hlas se uloží hned po kliknutí; po změně se volá `vRefresh()`, které
  přepíše jen prvky `[data-vl]`, lištu a mapu. Nová místa s hlasy přidávej přes `vCtl`.
- Hlasy jsou v Supabase (tabulka `votes`), stránka je čte a zapisuje přes REST s veřejným klíčem
  v `VOTE_CFG` (`url` = Project URL, `key` = anon / publishable klíč). Tajný (service_role) klíč do
  repozitáře nikdy nedávat. Bez `VOTE_CFG` se záložka zobrazí, ale nic neukládá.
- Přihlášení není: hlas patří jménu (bez ohledu na velikost písmen). Kdokoli s odkazem může hlasovat
  nebo přepsat cizí hlas; pro skupinu přátel to stačí.
- Založení tabulky (Supabase → SQL Editor):

  ```sql
  create table votes (id text primary key, name text not null, plus text[] not null default '{}',
    minus text[] not null default '{}', updated_at timestamptz not null default now());
  alter table votes enable row level security;
  create policy "cist" on votes for select to anon using (true);
  create policy "pridat" on votes for insert to anon with check (cardinality(plus) <= 3 and cardinality(minus) <= 1);
  create policy "zmenit" on votes for update to anon using (true) with check (cardinality(plus) <= 3 and cardinality(minus) <= 1);
  create policy "smazat" on votes for delete to anon using (true);
  ```

## Komentáře k lokalitám

- Každý může u lokality nechat jeden krátký komentář (max. 200 znaků) pod jménem z lišty hlasování.
  Zobrazují se v Hlasování: místo a v detailu lokality (`kBlock(l)`). Tabulka `komentare` v Supabase,
  `id` = jméno malými písmeny + `:` + id lokality.
- Založení tabulky (Supabase → SQL Editor):

  ```sql
  create table komentare (id text primary key, name text not null, loc text not null,
    text text not null, updated_at timestamptz not null default now());
  alter table komentare enable row level security;
  create policy "cist" on komentare for select to anon using (true);
  create policy "pridat" on komentare for insert to anon with check (char_length(text) <= 200);
  create policy "zmenit" on komentare for update to anon using (true) with check (char_length(text) <= 200);
  create policy "smazat" on komentare for delete to anon using (true);
  ```

## Termín (záložka Termín)

- Každý si pod jménem z lišty hlasování označí dny leden–květen 2027, kdy může jet. Uloží se hned do
  Supabase, tabulka `terminy` (`days` = pole dat `YYYY-MM-DD`). Stránka z toho spočítá nejlepší okna
  pro zvolený počet nocí (`S.n`, dny od odletu do návratu včetně) a tlačítkem „Použít termín“ nastaví
  `S.date`.
- Založení tabulky (Supabase → SQL Editor):

  ```sql
  create table terminy (id text primary key, name text not null, days text[] not null default '{}',
    updated_at timestamptz not null default now());
  alter table terminy enable row level security;
  create policy "cist" on terminy for select to anon using (true);
  create policy "pridat" on terminy for insert to anon with check (cardinality(days) <= 151);
  create policy "zmenit" on terminy for update to anon using (true) with check (cardinality(days) <= 151);
  create policy "smazat" on terminy for delete to anon using (true);
  ```

## Pravidla pro data (nejdůležitější)

1. Každý faktický údaj má zdroj v `SRC`, nebo je výslovně označený jako odhad (`cl.est`, text
   „odhad“ v `cs.hotel` nebo `a`, prázdné `src` u letu = „Bez ověřeného zdroje“). Nic si nevymýšlet.
2. Lety ověřovat pro konkrétní sezónu. Zimní řád končí 27. 3. 2027. Když linku nelze potvrdit,
   použij `d:"s"`, ne `true`.
3. Ceny jsou na osobu a vždy v rozsahu (min–max). Kurz 24,5 Kč/€. Pokud se změní metodika výpočtu
   ceny nebo indexu, aktualizuj i vysvětlení v patičce (`<footer>`) a popisy ve `FACTORS`.
4. Fotky:
   - Do stránky vkládat jen volně licencované fotky (Wikimedia Commons).
   - Fotky z Climbfinderu, Stravy, PJAMM, půjčoven a podobných webů nevkládat a nehotlinkovat
     (autorská práva). Na tyto weby jen odkazovat přes `SRC` a pole `web`.
5. Nová lokalita = záznam v `LOC`, `GASTRO`, `ROUTES`, body v `COORD`, poloha v `GEO`, transfer
   v `TR` a vítr ve `WIND` (spusť `node tools/fetch-wind.mjs`). Pak zkontroluj popisek na mapě, aby se nepřekrýval s ostatními.
6. Výchozí váhy indexu (`W0`) a stupnice skóre měnit jen po dohodě ve skupině. Mění pořadí lokalit
   pro všechny.
7. Lokality, kde už skupina byla, mají `known: true` (Mallorca, Tenerife, Gran Canaria).

## Jazyk a styl

- Veškerý text na webu je česky, věcně a bez marketingových frází. Desetinná čárka, měsíce česky.
- Barvy jen přes CSS proměnné v `:root` a obou tmavých blocích; nové barvy přidávat do všech tří.
- Web musí fungovat na telefonu (šířka 400 px) bez vodorovného posouvání stránky.
- Filtry (měsíc, odlet, noci) jsou nad mapou a ovlivňují celou stránku. Nové pohledy musí
  respektovat stav `S` (`S.m`, `S.ap`, `S.n`, `S.direct`, `S.hideKnown`, `S.w`).

## Ověření před commitem

- Spusť `npm install` (jednou) a `npm test`. Test projde stránku na 1440 i 400 px, zkontroluje
  chyby skriptu, úplnost dat (souřadnice tras, existující klíče zdrojů) a vodorovné posouvání.
- Otevři `index.html` v prohlížeči (stačí `file://`) a zkontroluj konzoli. Nesmí tam být chyby.
- Projdi všechny záložky, detail aspoň jedné lokality, okno vah a okno trasy.
- Ve sdíleném cloudovém prostředí je k dispozici Playwright s Chromiem: na načtení stránky,
  záložky a screenshot na šířce 1440 a 400 px.
- Externí služby (Wikimedia Commons, Nominatim, BRouter, dlaždice OSM) z cloudového prostředí
  nemusí být dostupné; jejich odpovědi lze při testu nasimulovat.

## Spolupráce

- Pull requesty neděláme. Změny se commitují a pushují rovnou do `main`, který se hned nasazuje
  na GitHub Pages. Proto před pushem vždy proveď ověření z předchozí sekce.
- Před začátkem práce si stáhni aktuální `main` (`git pull`), ať nepřepíšeš změny ostatních.
- Commity česky, v rozkazovacím způsobu („Přidat Fuerteventuru“, „Opravit ceny Mallorky“).
  Jeden commit = jedna věc; u změn dat napiš do zprávy, odkud jsou nové zdroje.
- Při konfliktu v `data.js` přednostně slučuj datové bloky po celých lokalitách.
- Když test na GitHubu po pushi selže (červený křížek u commitu), oprav to hned dalším commitem.
- Nesahat do `research_notes/` cizích rešerší; novou rešerši ukládej do nové složky.
