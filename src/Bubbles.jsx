import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRIES, CONTINENTS, interpolate } from './data/countries.js';

const WIDTH = 1000;
const HEIGHT = 700;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const WORLD_R = 320;
const MIN_R = 8;
const MAX_R = 100;

// Where each continent's centroid sits inside the world disk.
const CONTINENT_CENTERS = {
  'Europe':     { x: 380, y: 130 },
  'N. America': { x: 220, y: 270 },
  'Asia':       { x: 700, y: 300 },
  'S. America': { x: 250, y: 530 },
  'Africa':     { x: 520, y: 510 },
  'Oceania':    { x: 740, y: 540 },
};

// Continent label arcs around the perimeter (start..end in radians, clockwise from top).
// Angle 0 = top, increases clockwise (north-clockwise).
const CONTINENT_LABEL_ARCS = [
  { name: 'EUROPE',        startDeg: -55, endDeg:  -5 },
  { name: 'ASIA',          startDeg:   5, endDeg:  90 },
  { name: 'OCEANIA',       startDeg: 100, endDeg: 140 },
  { name: 'AFRICA',        startDeg: 150, endDeg: 230 },
  { name: 'SOUTH AMERICA', startDeg: 235, endDeg: 280 },
  { name: 'NORTH AMERICA', startDeg: 285, endDeg: 350 },
];

export default function Bubbles({ year, metric, groupByContinent, cursorFidget }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const pointerRef = useRef({ x: null, y: null, active: false });
  const fidgetRef = useRef(cursorFidget);
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

    // Merge with existing positions so bubbles stay put.
    const existing = simRef.current ? simRef.current.nodes() : [];
    const merged = nodes.map((n) => {
      const prev = existing.find((e) => e.code === n.code);
      if (prev) return { ...prev, ...n };
      // Seed inside the continent zone for nicer initial layout.
      const seed = CONTINENT_CENTERS[n.continent] || CENTER;
      return {
        ...n,
        x: seed.x + (Math.random() - 0.5) * 40,
        y: seed.y + (Math.random() - 0.5) * 40,
      };
    });

    if (!simRef.current) {
      simRef.current = d3.forceSimulation(merged)
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
        // Soft bound inside the world disk.
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
        .alphaDecay(0.01)
        .velocityDecay(0.18)
        .alphaMin(0.001);
      simRef.current.alphaTarget(0.02);
    } else {
      simRef.current.nodes(merged);
      simRef.current.force('collide').radius((d) => d.r + 2);
    }

    const sim = simRef.current;

    // Continent grouping force: pulls each bubble toward its continent zone.
    if (groupByContinent) {
      sim
        .force('x', d3.forceX((d) => CONTINENT_CENTERS[d.continent]?.x ?? CENTER.x).strength(0.13))
        .force('y', d3.forceY((d) => CONTINENT_CENTERS[d.continent]?.y ?? CENTER.y).strength(0.13));
    } else {
      sim
        .force('x', d3.forceX(CENTER.x).strength(0.04))
        .force('y', d3.forceY(CENTER.y).strength(0.04));
    }
    sim.alpha(0.6).restart();

    const cellsG = svg.select('g.cells');
    const bubblesG = svg.select('g.bubbles');

    // Voronoi cells under the bubbles, colored by continent.
    const cellsJoin = cellsG.selectAll('path.cell')
      .data(merged, (d) => d.code)
      .join((enter) =>
        enter.append('path')
          .attr('class', 'cell')
          .attr('fill', (d) => CONTINENTS[d.continent].color)
          .attr('fill-opacity', 0.22)
          .attr('stroke', 'rgba(0,0,0,0.35)')
          .attr('stroke-width', 1)
      );

    cellsJoin
      .attr('fill', (d) => CONTINENTS[d.continent].color);

    // Flag bubbles on top.
    const join = bubblesG.selectAll('g.bubble')
      .data(merged, (d) => d.code)
      .join((enter) => {
        const node = enter.append('g').attr('class', 'bubble').style('cursor', 'grab');
        node.append('circle')
          .attr('class', 'flag-circle')
          .attr('fill', (d) => `url(#flag-${d.code})`)
          .attr('stroke', (d) => CONTINENTS[d.continent].color)
          .attr('stroke-width', 2.5);
        node.append('text')
          .attr('class', 'code-label')
          .attr('text-anchor', 'middle')
          .attr('dy', '0.35em')
          .attr('fill', '#fff')
          .attr('font-weight', 800)
          .attr('pointer-events', 'none')
          .attr('font-family', 'system-ui, sans-serif')
          .attr('paint-order', 'stroke')
          .attr('stroke', 'rgba(0,0,0,0.7)')
          .attr('stroke-width', 3)
          .attr('stroke-linejoin', 'round');
        return node;
      });

    join.select('circle.flag-circle')
      .transition().duration(600)
      .attr('r', (d) => d.r);

    join.select('text.code-label')
      .attr('font-size', (d) => Math.max(10, Math.min(20, d.r / 2.8)))
      .text((d) => (d.r > 26 ? d.code : ''));

    join.on('mouseenter', (_, d) => setHovered(d))
        .on('mouseleave', () => setHovered(null));

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
    join.call(drag);

    sim.on('tick', () => {
      const t = performance.now();

      // Recompute Voronoi from current bubble centers.
      const delaunay = d3.Delaunay.from(merged, (d) => d.x, (d) => d.y);
      const voronoi = delaunay.voronoi([0, 0, WIDTH, HEIGHT]);
      cellsJoin.attr('d', (_d, i) => voronoi.renderCell(i));

      join.attr('transform', (d, i) => {
        const speed = Math.sqrt((d.vx || 0) ** 2 + (d.vy || 0) ** 2);
        const breath = 1 + 0.015 * Math.sin(t / 650 + i * 0.7);
        const wobble = Math.min(0.1, speed * 0.008);
        return `translate(${d.x},${d.y}) scale(${breath + wobble})`;
      });
    });

    svg
      .on('pointermove', (event) => {
        const [x, y] = d3.pointer(event, svgRef.current);
        pointerRef.current = { x, y, active: true };
      })
      .on('pointerleave', () => {
        pointerRef.current.active = false;
      });
  }, [nodes, metric, groupByContinent]);

  // Continent label arc paths.
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
          {COUNTRIES.map((c) => (
            <pattern
              key={c.code}
              id={`flag-${c.code}`}
              patternContentUnits="objectBoundingBox"
              width="1"
              height="1"
            >
              <image
                href={`https://flagcdn.com/w320/${c.iso2}.png`}
                width="1"
                height="1"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          ))}
          <clipPath id="world-clip">
            <circle cx={CENTER.x} cy={CENTER.y} r={WORLD_R} />
          </clipPath>
          {labelArcs.map((a) => (
            <path key={a.id} id={a.id} d={a.d} fill="none" />
          ))}
        </defs>

        {/* Outer ring */}
        <circle
          cx={CENTER.x} cy={CENTER.y} r={WORLD_R}
          fill="rgba(255,111,160,0.04)"
          stroke="rgba(255,111,160,0.25)"
          strokeWidth={1.5}
        />

        {/* Voronoi tiles clipped to world disk */}
        <g className="cells" clipPath="url(#world-clip)" />

        {/* Flag bubbles */}
        <g className="bubbles" />

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
