import { useMemo, useState } from 'react';
import Bubbles from './Bubbles.jsx';
import { CONTINENTS, COUNTRIES, YEARS, interpolate } from './data/countries.js';
import './App.css';

const END_YEAR = YEARS[YEARS.length - 1];

export default function App() {
  const [year, setYear] = useState(2025);
  const [metric, setMetric] = useState('births');
  const [cursorFidget, setCursorFidget] = useState(false);

  const totals = COUNTRIES.reduce((acc, c) => {
    const v = interpolate(c[metric], year);
    acc.world += v;
    acc.byContinent[c.continent] = (acc.byContinent[c.continent] || 0) + v;
    return acc;
  }, { world: 0, byContinent: {} });

  // Biggest absolute movers from the selected year to 2050 (excluding the
  // aggregate "Rest of the World" bubble).
  const movers = useMemo(() => {
    const rows = COUNTRIES.filter((c) => !c.isRest).map((c) => {
      const now = interpolate(c[metric], year);
      const fut = interpolate(c[metric], END_YEAR);
      return { code: c.code, flag: c.flag, name: c.name, delta: fut - now };
    });
    const growing = [...rows].sort((a, b) => b.delta - a.delta).slice(0, 4);
    const shrinking = [...rows].sort((a, b) => a.delta - b.delta).slice(0, 4);
    return { growing, shrinking };
  }, [metric, year]);

  return (
    <div className="app">
      <header className="header">
        <h1><span className="dot">●</span> B.bubbles</h1>
        <p className="tagline">
          The world's {metric === 'births' ? 'births' : 'population'} in <strong>{year}</strong>, as soap-bubble countries.
          Drag them, throw them, and scrub through time to {END_YEAR}.
        </p>
      </header>

      <div className="controls">
        <div className="control-group">
          <label>Metric</label>
          <div className="toggle">
            <button className={metric === 'births' ? 'on' : ''} onClick={() => setMetric('births')}>Births / year</button>
            <button className={metric === 'pop' ? 'on' : ''} onClick={() => setMetric('pop')}>Population</button>
          </div>
        </div>

        <div className="control-group">
          <label>Cursor fidget</label>
          <div className="toggle">
            <button className={!cursorFidget ? 'on' : ''} onClick={() => setCursorFidget(false)}>Off</button>
            <button className={cursorFidget ? 'on' : ''} onClick={() => setCursorFidget(true)}>On</button>
          </div>
        </div>

        <div className="control-group year-group">
          <label>Year <strong>{year}</strong></label>
          <input
            type="range" min={YEARS[0]} max={END_YEAR} step={1}
            value={year} onChange={(e) => setYear(+e.target.value)}
          />
          <div className="year-ticks">
            <span>1990</span><span>2005</span><span>2020</span><span>2035</span><span>2050</span>
          </div>
        </div>
      </div>

      {year < END_YEAR && (
        <div className="movers">
          <span className="movers-head">By {END_YEAR}</span>
          <div className="movers-group grow">
            <span className="movers-label">▲ Growing</span>
            {movers.growing.map((m) => (
              <span key={m.code} className="mover" title={m.name}>
                {m.flag} {m.code} <b>+{formatDelta(m.delta, metric)}</b>
              </span>
            ))}
          </div>
          <div className="movers-group shrink">
            <span className="movers-label">▼ Shrinking</span>
            {movers.shrinking.map((m) => (
              <span key={m.code} className="mover" title={m.name}>
                {m.flag} {m.code} <b>{formatDelta(m.delta, metric)}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      <Bubbles
        year={year}
        metric={metric}
        cursorFidget={cursorFidget}
      />

      <div className="legend">
        {Object.entries(CONTINENTS).map(([name, { color }]) => (
          <div key={name} className="legend-item">
            <span className="swatch" style={{ background: color }} />
            <span>{name}</span>
            <span className="legend-val">
              {metric === 'pop'
                ? totals.byContinent[name] >= 1000
                  ? `${((totals.byContinent[name] || 0) / 1000).toFixed(2)}B`
                  : `${(totals.byContinent[name] || 0).toFixed(0)}M`
                : `${(totals.byContinent[name] || 0).toFixed(1)}M`}
            </span>
          </div>
        ))}
      </div>

      <footer className="footer">
        World total ({metric === 'births' ? 'births' : 'pop.'}, {year}):{' '}
        <strong>
          {metric === 'pop'
            ? `${(totals.world / 1000).toFixed(2)}B`
            : `${totals.world.toFixed(1)}M`}
        </strong>
        {' · '}
        <span>
          Top 120 countries + 🌍 Rest of the World (≈100% of people) ·
          Source: UN World Population Prospects 2024 (medium variant)
        </span>
      </footer>
    </div>
  );
}

function formatDelta(v, metric) {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (metric === 'pop') {
    if (a >= 1000) return `${sign}${(a / 1000).toFixed(2)}B`;
    return `${sign}${a.toFixed(0)}M`;
  }
  return `${sign}${a.toFixed(1)}M`;
}
