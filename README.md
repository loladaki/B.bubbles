# B.bubbles

The world's **births** and **population** as living, draggable bubbles.
Inspired by the static Voronoi treemap "All the World's Births in 2025" — but interactive, with a time slider that projects from **2025 → 2050** using UN World Population Prospects 2024 data.

## What it does (MVP)

- ~28 countries (the dominant ones from the inspiration chart) sized by either **births/year** or **total population**.
- Drag any bubble — d3-force physics rearranges the rest.
- Year slider 2025 → 2050. Watch Nigeria & DRC swell, Japan & China shrink.
- Toggle between **Births / year** and **Population**.
- Continent-colored, with per-continent and world totals.

## Stack

- Vite + React
- D3 (forceSimulation, scaleSqrt, drag)
- No backend. Static data in `src/data/countries.js`.

## Run

```bash
npm install
npm run dev
```

## Roadmap

- [ ] Full UN WPP dataset (200+ countries) loaded as JSON
- [ ] "Group by" options: continent / fertility rate / median age
- [ ] Compare two years side-by-side
- [ ] Click a bubble → expand a per-country detail panel
- [ ] Voronoi mode (toggle) for fidelity to the original
- [ ] Mobile layout pass
- [ ] Deploy to Vercel

## Data

Approximate UN World Population Prospects 2024 projections for 2025, 2030, 2050.
Intermediate years are linearly interpolated. See `src/data/countries.js`.

## License

MIT
