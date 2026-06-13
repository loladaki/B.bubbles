import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRIES, interpolate } from './data/countries.js';

const WIDTH = 1000;
const HEIGHT = 700;
const PAD = 4;
const MIN_R = 18;
const MAX_R = 120;

// Build a smooth, soap-bubble-like closed path through the midpoints of a
// polygon's edges, using each vertex as a quadratic control point. Rounds the
// hard Voronoi corners into soft, flexible blobs.
function smoothCell(points) {
  if (!points || points.length < 3) return '';
  const n = points.length;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(points[n - 1], points[0]);
  let d = `M ${m0[0].toFixed(1)} ${m0[1].toFixed(1)} `;
  for (let i = 0; i < n; i++) {
    const cur = points[i];
    const next = points[(i + 1) % n];
    const m = mid(cur, next);
    d += `Q ${cur[0].toFixed(1)} ${cur[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)} `;
  }
  return d + 'Z';
}

export default function Bubbles({ year, metric, cursorFidget }) {
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

    const existing = simRef.current ? simRef.current.nodes() : [];
    const merged = nodes.map((n) => {
      const prev = existing.find((e) => e.code === n.code);
      if (prev) return { ...prev, ...n };
      // Spread across the whole canvas so cells tessellate evenly.
      return {
        ...n,
        x: PAD + Math.random() * (WIDTH - 2 * PAD),
        y: PAD + Math.random() * (HEIGHT - 2 * PAD),
      };
    });

    if (!simRef.current) {
      simRef.current = d3.forceSimulation(merged)
        // Very weak centering — just enough to avoid drift.
        .force('x', d3.forceX(WIDTH / 2).strength(0.01))
        .force('y', d3.forceY(HEIGHT / 2).strength(0.01))
        // Spacing ∝ births/population, so big countries claim bigger cells.
        .force('collide', d3.forceCollide()
          .radius((d) => d.r)
          .strength(0.9)
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
            const reach = 110 + n.r;
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
            if (n.x < PAD) { n.x = PAD; n.vx *= -0.4; }
            if (n.x > WIDTH - PAD) { n.x = WIDTH - PAD; n.vx *= -0.4; }
            if (n.y < PAD) { n.y = PAD; n.vy *= -0.4; }
            if (n.y > HEIGHT - PAD) { n.y = HEIGHT - PAD; n.vy *= -0.4; }
          }
        })
        .alphaDecay(0.012)
        .velocityDecay(0.22)
        .alphaMin(0.001);
      simRef.current.alphaTarget(0.015);
    } else {
      simRef.current.nodes(merged);
      simRef.current.force('collide').radius((d) => d.r);
      simRef.current.alpha(0.5).restart();
    }

    const sim = simRef.current;

    // One flexible, flag-filled cell per country.
    const cellsG = svg.select('g.cells');
    const cJoin = cellsG.selectAll('path.cell')
      .data(merged, (d) => d.code)
      .join((enter) =>
        enter.append('path')
          .attr('class', 'cell')
          .style('cursor', 'grab')
          .attr('fill', (d) => `url(#flag-${d.code})`)
          .attr('stroke', 'none')
      );

    cJoin.on('mouseenter', (_, d) => setHovered(d))
         .on('mouseleave', () => setHovered(null));

    // Labels on top, crisp.
    const labelsG = svg.select('g.labels');
    const lJoin = labelsG.selectAll('text.code-label')
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
          .attr('stroke', 'rgba(0,0,0,0.55)')
          .attr('stroke-width', 3.5)
          .attr('stroke-linejoin', 'round')
      );
    lJoin
      .attr('font-size', (d) => Math.max(12, Math.min(22, d.r / 2.4)))
      .text((d) => (d.r > 30 ? d.code : ''));

    const drag = d3.drag()
      .on('start', (event, d) => {
        sim.alphaTarget(0.3).restart();
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
        d.vx = (d._lastvx || 0) * 3;
        d.vy = (d._lastvy || 0) * 3;
        sim.alphaTarget(0.015);
        sim.alpha(0.5).restart();
      });
    cJoin.call(drag);

    const render = () => {
      const delaunay = d3.Delaunay.from(merged, (d) => d.x, (d) => d.y);
      const voronoi = delaunay.voronoi([PAD, PAD, WIDTH - PAD, HEIGHT - PAD]);
      cJoin.attr('d', (_, i) => smoothCell(voronoi.cellPolygon(i)));
      lJoin.attr('x', (d) => d.x).attr('y', (d) => d.y);
    };
    sim.on('tick', render);
    render(); // paint once immediately (covers static/headless first frame)

    svg
      .on('pointermove', (event) => {
        const [x, y] = d3.pointer(event, svgRef.current);
        pointerRef.current = { x, y, active: true };
      })
      .on('pointerleave', () => {
        pointerRef.current.active = false;
      });
  }, [nodes, metric]);

  return (
    <div className="bubbles-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
        <defs>
          {COUNTRIES.map((c) => (
            <pattern
              key={c.code}
              id={`flag-${c.code}`}
              patternContentUnits="objectBoundingBox"
              width="1" height="1"
            >
              <image
                href={`https://flagcdn.com/w320/${c.iso2}.png`}
                width="1" height="1"
                preserveAspectRatio="xMidYMid slice"
              />
            </pattern>
          ))}
        </defs>

        <g className="cells" />
        <g className="labels" />
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
