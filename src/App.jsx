import { useEffect, useMemo, useRef, useState } from 'react';
import Bubbles from './Bubbles.jsx';
import { CONTINENTS, COUNTRIES, YEARS, interpolate } from './data/countries.js';
import './App.css';

const START_YEAR = YEARS[0];
const END_YEAR = YEARS[YEARS.length - 1];
const PLAY_SPEED = 9; // years per second

export default function App() {
  const [year, setYear] = useState(2025);
  const [metric, setMetric] = useState('births');
  const [cursorFidget, setCursorFidget] = useState(false);
  const [playing, setPlaying] = useState(false);
  const dirRef = useRef(1); // ping-pong direction

  // Auto-advance the year while playing (ping-pong between 1990 and 2050).
  // setInterval (not rAF) so it keeps running even when the tab can't paint.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setYear((y) => {
        let ny = y + dirRef.current * PLAY_SPEED * dt;
        if (ny >= END_YEAR) { ny = END_YEAR; dirRef.current = -1; }
        else if (ny <= START_YEAR) { ny = START_YEAR; dirRef.current = 1; }
        return ny;
      });
    }, 33);
    return () => clearInterval(id);
  }, [playing]);

  const displayYear = Math.round(year);

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
          The world's {metric === 'births' ? 'births' : 'population'} in <strong>{displayYear}</strong>, as soap-bubble countries.
          Drag them, throw them, and press play to watch {START_YEAR}→{END_YEAR}.
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
          <label>Year <strong>{displayYear}</strong></label>
          <div className="year-row">
            <button
              className="play-btn"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause' : 'Play'}
            >
              {playing ? '❚❚' : '▶'}
            </button>
            <input
              type="range" min={START_YEAR} max={END_YEAR} step={0.5}
              value={year}
              onChange={(e) => { setPlaying(false); setYear(+e.target.value); }}
            />
          </div>
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
        playing={playing}
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
