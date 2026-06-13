import { useState } from 'react';
import Bubbles from './Bubbles.jsx';
import { CONTINENTS, COUNTRIES, interpolate } from './data/countries.js';
import './App.css';

export default function App() {
  const [year, setYear] = useState(2025);
  const [metric, setMetric] = useState('births');         // 'births' | 'pop'
  const [groupByContinent, setGroupByContinent] = useState(true);
  const [cursorFidget, setCursorFidget] = useState(false);

  const totals = COUNTRIES.reduce((acc, c) => {
    const v = interpolate(c[metric], year);
    acc.world += v;
    acc.byContinent[c.continent] = (acc.byContinent[c.continent] || 0) + v;
    return acc;
  }, { world: 0, byContinent: {} });

  return (
    <div className="app">
      <header className="header">
        <h1><span className="dot">●</span> B.bubbles</h1>
        <p className="tagline">
          The world's {metric === 'births' ? 'births' : 'population'} in <strong>{year}</strong>, as living bubbles.
          Drag them. Throw them. Slide through time.
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
          <label>Layout</label>
          <div className="toggle">
            <button className={groupByContinent ? 'on' : ''} onClick={() => setGroupByContinent(true)}>By continent</button>
            <button className={!groupByContinent ? 'on' : ''} onClick={() => setGroupByContinent(false)}>Free</button>
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
            type="range" min={2025} max={2050} step={1}
            value={year} onChange={(e) => setYear(+e.target.value)}
          />
          <div className="year-ticks">
            <span>2025</span><span>2030</span><span>2040</span><span>2050</span>
          </div>
        </div>
      </div>

      <Bubbles
        year={year}
        metric={metric}
        groupByContinent={groupByContinent}
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
        <span>Top ~28 countries · Source: UN WPP 2024 (approx.)</span>
      </footer>
    </div>
  );
}
