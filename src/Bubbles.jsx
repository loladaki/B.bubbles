import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRIES, CONTINENTS, interpolate } from './data/countries.js';

const WIDTH = 1000;
const HEIGHT = 700;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const WORLD_R = 320;
const MIN_R = 14;
const MAX_R = 92;

const CONTINENT_CENTERS = {
  'Europe':     { x: 400, y: 140 },
  'N. America': { x: 230, y: 280 },
  'Asia':       { x: 700, y: 290 },
  'S. America': { x: 260, y: 520 },
  'Africa':     { x: 520, y: 510 },
  'Oceania':    { x: 730, y: 540 },
};

const CONTINENT_LABEL_ARCS = [
  { name: 'EUROPE',        startDeg: -55, endDeg:  -5 },
  { name: 'ASIA',          startDeg:   5, endDeg:  90 },
  { name: 'OCEANIA',       startDeg: 100, endDeg: 140 },
  { name: 'AFRICA',        startDeg: 150, endDeg: 230 },
  { name: 'SOUTH AMERICA', startDeg: 235, endDeg: 280 },
  { name: 'NORTH AMERICA', startDeg: 285, endDeg: 350 },
];

export default function Bubbles({ year, metric, cursorFidget, groupSignal }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const pointerRef = useRef({ x: null, y: null, active: false });
  const fidgetRef = useRef(cursorFidget);
  const didInitialGroupRef = useRef(false);
  fidgetRef.current = cursorFidget;
  const [hovered, setHovered] = useState(null);

  const nodes = useMemo(() => {
    const values = COUNTRIES.map((c) => interpolate(c[metric], year));
    const max = Math.max(...values);
    const rScale = d3.scaleSqrt().domain([0, max]).range([MIN_R, MAX_R]);
    return COUNTRIES.map((c, i) => ({
      ...c,
      value: values[i],
      r: rScale(values[i]),
    }));
  }, [year, metric]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const isFirstMount = !simRef.current;

    const existing = simRef.current ? simRef.current.nodes() : [];
    const merged = nodes.map((n) => {
      const prev = existing.find((e) => e.code === n.code);
      if (prev) return { ...prev, ...n };
      const seed = CONTINENT_CENTERS[n.continent] || CENTER;
      return {
        ...n,
        x: seed.x + (Math.random() - 0.5) * 30,
        y: seed.y + (Math.random() - 0.5) * 30,
      };
    });

    if (!simRef.current) {
      simRef.current = d3.forceSimulation(merged)
        .force('x', d3.forceX(CENTER.x).strength(0.02))
        .force('y', d3.forceY(CENTER.y).strength(0.02))
        .force('collide', d3.forceCollide()
          .radius((d) => d.r + 2)
          .strength(0.85)
          .iterations(4))
        .force('pointer', (alpha) => {
          if (!fidgetRef.current) return;
          const p = pointerRef.current;
          if (!p.active || p.x == null) return;
          const ns = simRef.current.nodes();
          for (const n of ns) {
            const dx = n.x - p.x;
            const dy = n.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
            const reach = 90 + n.r;
            if (dist < reach) {
              const push = (1 - dist / reach) * 6 * alpha * 30;
              n.vx += (dx / dist) * push;
              n.vy += (dy / dist) * push;
            }
          }
        })
        .force('bound', () => {
          const ns = simRef.current.nodes();
          for (const n of ns) {
            const dx = n.x - CENTER.x;
            const dy = n.y - CENTER.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
            const maxR = WORLD_R - n.r - 4;
            if (dist > maxR) {
              const t = maxR / dist;
              n.x = CENTER.x + dx * t;
              n.y = CENTER.y + dy * t;
              n.vx *= -0.4;
              n.vy *= -0.4;
            }
          }
        })
        .alphaDecay(0.012)
        .velocityDecay(0.2)
        .alphaMin(0.001);
      simRef.current.alphaTarget(0.02);
    } else {
      simRef.current.nodes(merged);
      simRef.current.force('collide').radius((d) => d.r + 2);
      simRef.current.alpha(0.4).restart();
    }

    const sim = simRef.current;

    // --- d3 joins ----------------------------------------------------------

    // Per-country clipPath definitions (each holds a path updated per tick).
    const clipDefs = svg.select('g.clip-defs');
    const clipJoin = clipDefs.selectAll('clipPath.cell-clip')
      .data(merged, (d) => d.code)
      .join((enter) => {
        const cp = enter.append('clipPath')
          .attr('class', 'cell-clip')
          .attr('id', (d) => `cell-clip-${d.code}`);
        cp.append('path');
        return cp;
      });

    // Country groups: each is a Voronoi cell filled with a flag image.
    const countriesG = svg.select('g.countries');
    const cJoin = countriesG.selectAll('g.country')
      .data(merged, (d) => d.code)
      .join((enter) => {
        const g = enter.append('g')
          .attr('class', 'country')
          .style('cursor', 'grab');

        // Continent-tinted background fill of the cell.
        g.append('path')
          .attr('class', 'cell-fill')
          .attr('fill', (d) => CONTINENTS[d.continent].color)
          .attr('fill-opacity', 0.45)
          .attr('stroke', 'none');

        // Flag image, clipped to the cell shape so the flag IS the country's
        // flexible shape (no perfect circles anywhere).
        g.append('image')
          .attr('class', 'flag-img')
          .attr('href', (d) => `https://flagcdn.com/w320/${d.iso2}.png`)
          .attr('preserveAspectRatio', 'xMidYMid slice')
          .attr('opacity', 0.78)
          .attr('clip-path', (d) => `url(#cell-clip-${d.code})`);

        // Subtle border drawn on top.
        g.append('path')
          .attr('class', 'cell-border')
          .attr('fill', 'none')
          .attr('stroke', 'rgba(255,255,255,0.28)')
          .attr('stroke-width', 1)
          .attr('stroke-linejoin', 'round');

        return g;
      });

    cJoin.on('mouseenter', (_, d) => setHovered(d))
         .on('mouseleave', () => setHovered(null));

    // Labels (country codes) outside the cell so they stay crisp.
    const labelsG = svg.select('g.labels');
    const labelJoin = labelsG.selectAll('text.code-label')
      .data(merged, (d) => d.code)
      .join((enter) =>
        enter.append('text')
          .attr('class', 'code-label')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', '#fff')
          .attr('font-weight', 800)
          .attr('pointer-events', 'none')
          .attr('font-family', 'system-ui, sans-serif')
          .attr('paint-order', 'stroke')
          .attr('stroke', 'rgba(0,0,0,0.75)')
          .attr('stroke-width', 3)
          .attr('stroke-linejoin', 'round')
      );
    labelJoin
      .attr('font-size', (d) => Math.max(11, Math.min(20, d.r / 2.6)))
      .text((d) => (d.r > 24 ? d.code : ''));

    // Drag with throw momentum.
    const drag = d3.drag()
      .on('start', (event, d) => {
        sim.alphaTarget(0.35).restart();
        d.fx = d.x; d.fy = d.y;
        d._lastvx = 0; d._lastvy = 0;
      })
      .on('drag', (event, d) => {
        d.fx = event.x; d.fy = event.y;
        d._lastvx = event.dx;
        d._lastvy = event.dy;
      })
      .on('end', (event, d) => {
        d.fx = null; d.fy = null;
        d.vx = (d._lastvx || 0) * 4;
        d.vy = (d._lastvy || 0) * 4;
        sim.alphaTarget(0.02);
        sim.alpha(0.6).restart();
      });
    cJoin.call(drag);

    // --- per-tick rendering -----------------------------------------------
    sim.on('tick', () => {
      const delaunay = d3.Delaunay.from(merged, (d) => d.x, (d) => d.y);
      const voronoi = delaunay.voronoi([
        CENTER.x - WORLD_R, CENTER.y - WORLD_R,
        CENTER.x + WORLD_R, CENTER.y + WORLD_R,
      ]);

      // Update each clipPath's path to match its Voronoi cell.
      clipJoin.select('path').attr('d', (_, i) => voronoi.renderCell(i));

      // Update cell paths + flag image position/size.
      cJoin.each(function (d, i) {
        const cellPath = voronoi.renderCell(i);
        const node = d3.select(this);
        node.select('path.cell-fill').attr('d', cellPath);
        node.select('path.cell-border').attr('d', cellPath);
        const size = d.r * 3;
        node.select('image.flag-img')
          .attr('x', d.x - size / 2)
          .attr('y', d.y - size / 2)
          .attr('width', size)
          .attr('height', size);
      });

      labelJoin
        .attr('x', (d) => d.x)
        .attr('y', (d) => d.y);
    });

    // Pointer events on the SVG, used by the optional fidget force.
    svg
      .on('pointermove', (event) => {
        const [x, y] = d3.pointer(event, svgRef.current);
        pointerRef.current = { x, y, active: true };
      })
      .on('pointerleave', () => {
        pointerRef.current.active = false;
      });

    // On very first mount, pin each country to its continent zone for a
    // moment so the user actually SEES the continent organisation, then
    // release into free movement.
    if (isFirstMount && !didInitialGroupRef.current) {
      didInitialGroupRef.current = true;
      const ns = sim.nodes();
      ns.forEach((n) => {
        const c = CONTINENT_CENTERS[n.continent] || CENTER;
        n.fx = c.x + (Math.random() - 0.5) * 50;
        n.fy = c.y + (Math.random() - 0.5) * 50;
      });
      sim.alpha(1).restart();
      const tid = setTimeout(() => {
        ns.forEach((n) => { n.fx = null; n.fy = null; });
        sim.alpha(0.4).restart();
      }, 1400);
      return () => clearTimeout(tid);
    }
  }, [nodes, metric]);

  // "Group by continent" button signal: snap back to continent zones briefly.
  useEffect(() => {
    if (!simRef.current || groupSignal === 0) return;
    const sim = simRef.current;
    const ns = sim.nodes();
    ns.forEach((n) => {
      const c = CONTINENT_CENTERS[n.continent] || CENTER;
      n.fx = c.x + (Math.random() - 0.5) * 50;
      n.fy = c.y + (Math.random() - 0.5) * 50;
    });
    sim.alpha(1).restart();
    const tid = setTimeout(() => {
      ns.forEach((n) => { n.fx = null; n.fy = null; });
      sim.alpha(0.5).restart();
    }, 1000);
    return () => clearTimeout(tid);
  }, [groupSignal]);

  // Continent label arc paths around the perimeter.
  const labelArcs = useMemo(() => {
    const labelR = WORLD_R + 18;
    return CONTINENT_LABEL_ARCS.map((arc) => {
      const a0 = ((arc.startDeg - 90) * Math.PI) / 180;
      const a1 = ((arc.endDeg - 90) * Math.PI) / 180;
      const x0 = CENTER.x + labelR * Math.cos(a0);
      const y0 = CENTER.y + labelR * Math.sin(a0);
      const x1 = CENTER.x + labelR * Math.cos(a1);
      const y1 = CENTER.y + labelR * Math.sin(a1);
      const largeArc = arc.endDeg - arc.startDeg > 180 ? 1 : 0;
      return {
        name: arc.name,
        id: `arc-${arc.name.replace(/\s/g, '-')}`,
        d: `M ${x0} ${y0} A ${labelR} ${labelR} 0 ${largeArc} 1 ${x1} ${y1}`,
      };
    });
  }, []);

  return (
    <div className="bubbles-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id="world-clip">
            <circle cx={CENTER.x} cy={CENTER.y} r={WORLD_R} />
          </clipPath>
          {/* d3 populates per-country clipPaths here */}
          <g className="clip-defs" />
          {labelArcs.map((a) => (
            <path key={a.id} id={a.id} d={a.d} fill="none" />
          ))}
        </defs>

        {/* Outer ring */}
        <circle
          cx={CENTER.x} cy={CENTER.y} r={WORLD_R}
          fill="rgba(255,111,160,0.03)"
          stroke="rgba(255,111,160,0.2)"
          strokeWidth={1}
        />

        {/* Country cells (Voronoi-shaped, flexible) */}
        <g className="countries" clipPath="url(#world-clip)" />

        {/* Labels above the cells, outside any clip */}
        <g className="labels" />

        {/* Continent labels around the perimeter */}
        <g className="continent-labels">
          {labelArcs.map((a) => (
            <text key={a.id} fill="rgba(255,255,255,0.55)" fontSize={14} fontWeight={700} letterSpacing="0.3em">
              <textPath href={`#${a.id}`} startOffset="50%" textAnchor="middle">
                {a.name}
              </textPath>
            </text>
          ))}
        </g>
      </svg>

      {hovered && (
        <div className="tooltip">
          <div className="tt-flag">{hovered.flag}</div>
          <div>
            <div className="tt-name">{hovered.name}</div>
            <div className="tt-meta">{hovered.continent}</div>
            <div className="tt-value">
              {formatValue(hovered.value, metric)}{' '}
              <span className="tt-unit">{metric === 'births' ? 'births/yr' : 'people'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(v, metric) {
  if (metric === 'pop') {
    if (v >= 1000) return `${(v / 1000).toFixed(2)}B`;
    return `${v.toFixed(0)}M`;
  }
  return `${v.toFixed(1)}M`;
}
