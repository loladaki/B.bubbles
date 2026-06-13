// Builds src/data/countries.js from real UN WPP 2024 data (via Our World in Data)
// plus ISO-3166 country metadata for flags + continents.
//
// Inputs (already downloaded next to this repo root):
//   births_raw.csv  — OWID "births-and-deaths-projected-to-2100"
//   pop_raw.csv     — OWID "population-with-un-projections"
//   iso3166.json    — lukes/ISO-3166-Countries-with-Regional-Codes
//
// Run: node scripts/build-data.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const YEARS = [1990, 1995, 2000, 2005, 2010, 2015, 2020, 2025, 2030, 2035, 2040, 2045, 2050];

// --- tiny CSV parser (only the first field is ever quoted in these files) ---
function parseRows(file) {
  const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split(/\r?\n/);
  const header = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    let entity, rest;
    if (line[0] === '"') {
      const end = line.indexOf('",');
      entity = line.slice(1, end);
      rest = line.slice(end + 2).split(',');
    } else {
      const parts = line.split(',');
      entity = parts[0];
      rest = parts.slice(1);
    }
    rows.push([entity, ...rest]);
  }
  return { header, rows };
}

// --- ISO metadata: iso3 -> { iso2, continent } ---
const iso = JSON.parse(fs.readFileSync(path.join(ROOT, 'iso3166.json'), 'utf8'));
const metaByIso3 = new Map();
for (const c of iso) {
  const iso3 = c['alpha-3'];
  const iso2 = (c['alpha-2'] || '').toLowerCase();
  let continent;
  switch (c.region) {
    case 'Africa': continent = 'Africa'; break;
    case 'Europe': continent = 'Europe'; break;
    case 'Asia': continent = 'Asia'; break;
    case 'Oceania': continent = 'Oceania'; break;
    case 'Americas':
      continent = c['intermediate-region'] === 'South America' ? 'S. America' : 'N. America';
      break;
    default: continent = null;
  }
  if (iso3 && iso2 && continent) metaByIso3.set(iso3, { iso2, continent });
}

// --- read metric CSVs, build iso3 -> year -> value (millions) ---
function buildMetric(file, estCol, projCol) {
  const { header, rows } = parseRows(file);
  const ci = (name) => header.indexOf(name);
  const iEst = ci(estCol);
  const iProj = ci(projCol);
  const iCode = 0; // after entity strip, code is rest[0] => index 1 overall; see below
  // rows are [entity, code, year, ...]; metric column indexes are into header,
  // and header[0]=entity so header indexes line up with row indexes directly.
  const out = new Map();
  for (const r of rows) {
    const code = r[1];
    if (!code || !metaByIso3.has(code)) continue;
    const year = +r[2];
    if (!YEARS.includes(year)) continue;
    const estRaw = r[iEst];
    const projRaw = r[iProj];
    const raw = estRaw !== '' && estRaw != null ? estRaw : projRaw;
    if (raw === '' || raw == null) continue;
    const val = +raw / 1e6; // -> millions
    if (!out.has(code)) out.set(code, {});
    out.get(code)[year] = val;
  }
  return out;
}

const births = buildMetric(
  'births_raw.csv',
  'births__sex_all__age_all__variant_estimates',
  'births__sex_all__age_all__variant_medium__projected',
);
const pop = buildMetric(
  'pop_raw.csv',
  'population__sex_all__age_all__variant_estimates',
  'population__sex_all__age_all__variant_medium__projected',
);

// --- entity display names (use births file's names) ---
const nameByCode = new Map();
{
  const { rows } = parseRows('births_raw.csv');
  for (const r of rows) {
    const code = r[1];
    if (code && metaByIso3.has(code) && !nameByCode.has(code)) nameByCode.set(code, r[0]);
  }
}
const RENAME = {
  COD: 'DR Congo', COG: 'Congo', USA: 'United States', GBR: 'United Kingdom',
  KOR: 'South Korea', PRK: 'North Korea', TZA: 'Tanzania', IRN: 'Iran',
  RUS: 'Russia', SYR: 'Syria', VEN: 'Venezuela', BOL: 'Bolivia',
  LAO: 'Laos', MDA: 'Moldova', CZE: 'Czechia', ARE: 'UAE',
  CAF: 'Central African Rep.', DOM: 'Dominican Rep.',
};

// --- flag emoji from iso2 ---
function flagEmoji(iso2) {
  return iso2.toUpperCase().replace(/./g, (ch) =>
    String.fromCodePoint(127397 + ch.charCodeAt(0)));
}

// --- assemble, require full coverage across all YEARS for both metrics ---
const records = [];
for (const [code, meta] of metaByIso3) {
  const b = births.get(code);
  const p = pop.get(code);
  if (!b || !p) continue;
  const birthsArr = YEARS.map((y) => b[y]);
  const popArr = YEARS.map((y) => p[y]);
  if (birthsArr.some((v) => v == null) || popArr.some((v) => v == null)) continue;
  records.push({
    name: RENAME[code] || nameByCode.get(code) || code,
    code,
    iso2: meta.iso2,
    flag: flagEmoji(meta.iso2),
    continent: meta.continent,
    births: birthsArr.map((v) => +v.toFixed(3)),
    pop: popArr.map((v) => +v.toFixed(2)),
  });
}

// Keep the top ~120 by 2025 population.
const i2025 = YEARS.indexOf(2025);
records.sort((a, b) => b.pop[i2025] - a.pop[i2025]);
const TOP = 120;
const kept = records.slice(0, TOP);

// --- emit countries.js ---
const continents = `export const CONTINENTS = {
  Asia:        { color: '#ff6fa0' },
  Africa:      { color: '#ff8b3d' },
  Europe:      { color: '#6b7fff' },
  'N. America':{ color: '#b85eff' },
  'S. America':{ color: '#4dd6a6' },
  Oceania:     { color: '#ffd24d' },
};`;

const body = kept.map((c) => {
  const b = `[${c.births.join(', ')}]`;
  const p = `[${c.pop.join(', ')}]`;
  return `  { name: ${JSON.stringify(c.name)}, code: '${c.code}', iso2: '${c.iso2}', continent: ${JSON.stringify(c.continent)}, flag: '${c.flag}', births: ${b}, pop: ${p} },`;
}).join('\n');

const file = `// AUTO-GENERATED by scripts/build-data.mjs — do not edit by hand.
// Source: UN World Population Prospects 2024 via Our World in Data.
// births / population are in millions. Estimates through ~2023, medium-variant
// projections thereafter. Continents/flags from ISO-3166.
export const YEARS = [${YEARS.join(', ')}];

${continents}

export const COUNTRIES = [
${body}
];

// Linear interpolation between the 5-year keyframes.
export function interpolate(values, year) {
  if (year <= YEARS[0]) return values[0];
  if (year >= YEARS[YEARS.length - 1]) return values[values.length - 1];
  for (let i = 0; i < YEARS.length - 1; i++) {
    const y0 = YEARS[i], y1 = YEARS[i + 1];
    if (year >= y0 && year <= y1) {
      const t = (year - y0) / (y1 - y0);
      return values[i] + t * (values[i + 1] - values[i]);
    }
  }
  return values[0];
}
`;

fs.writeFileSync(path.join(ROOT, 'src/data/countries.js'), file);
console.log(`Wrote ${kept.length} countries to src/data/countries.js`);
console.log('Top 8 by 2025 pop:', kept.slice(0, 8).map((c) => `${c.code} ${c.pop[i2025]}M`).join(', '));
console.log('Sample (Nigeria):', JSON.stringify(kept.find((c) => c.code === 'NGA')));
