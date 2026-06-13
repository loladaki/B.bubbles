import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRIES, interpolate } from './data/countries.js';

const WIDTH = 1000;
const HEIGHT = 700;
const PAD = 6;
const MIN_R = 16;
const MAX_R = 104;
const SAMPLES = 44; // outline resolution per bubble

const closedCurve = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6));

// Build a soap-bubble outline: a circle flattened against nearby neighbours
// using the radical (power-diagram) plane, so bubbles share a soft flat edge
// where they touch and stay round where they're free.
function bubbleOutline(node, neighbours) {
  const pts = new Array(SAMPLES);
  for (let a = 0; a < SAMPLES; a++) {
    const th = (a / SAMPLES) * Math.PI * 2;
    let px = node.x + node.r * Math.cos(th);
    let py = node.y + node.r * Math.sin(th);
    for (let k = 0; k < neighbours.length; k++) {
      const nb = neighbours[k];
      const dx = nb.x - node.x;
      const dy = nb.y - node.y;
      const D = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const nx = dx / D;
      const ny = dy / D;
      // Distance from this node's centre to the shared contact plane.
      const t = (D * D + node.r * node.r - nb.r * nb.r) / (2 * D);
      const proj = (px - node.x) * nx + (py - node.y) * ny;
      if (proj > t) {
        px -= (proj - t) * nx;
        py -= (proj - t) * ny;
      }
    }
    pts[a] = [px, py];
  }
  return closedCurve(pts);
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
      return {
        ...n,
        x: WIDTH / 2 + (Math.random() - 0.5) * 280,
        y: HEIGHT / 2 + (Math.random() - 0.5) * 200,
      };
    });

    if (!simRef.current) {
      simRef.current = d3.forceSimulation(merged)
        // Pack them together so they actually touch.
        .force('x', d3.forceX(WIDTH / 2).strength(0.06))
        .force('y', d3.forceY(HEIGHT / 2).strength(0.07))
        // Slight overlap -> visible flattening at contacts.
        .force('collide', d3.forceCollide()
          .radius((d) => d.r - 5)
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
            const reach = 100 + n.r;
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
            const minX = PAD + n.r, maxX = WIDTH - PAD - n.r;
            const minY = PAD + n.r, maxY = HEIGHT - PAD - n.r;
            if (n.x < minX) { n.x = minX; n.vx *= -0.4; }
            if (n.x > maxX) { n.x = maxX; n.vx *= -0.4; }
            if (n.y < minY) { n.y = minY; n.vy *= -0.4; }
            if (n.y > maxY) { n.y = maxY; n.vy *= -0.4; }
          }
        })
        .alphaDecay(0.015)
        .velocityDecay(0.22)
        .alphaMin(0.001);
      simRef.current.alphaTarget(0.01);
    } else {
      simRef.current.nodes(merged);
      simRef.current.force('collide').radius((d) => d.r - 5);
      simRef.current.alpha(0.5).restart();
    }

    const sim = simRef.current;

    // One flexible flag-filled bubble per country.
    const bubblesG = svg.select('g.bubbles');
    const bJoin = bubblesG.selectAll('path.bubble')
      .data(merged, (d) => d.code)
      .join((enter) =>
        enter.append('path')
          .attr('class', 'bubble')
          .style('cursor', 'grab')
          .attr('fill', (d) => `url(#flag-${d.code})`)
          .attr('stroke', 'rgba(255,255,255,0.2)')
          .attr('stroke-width', 1.2)
      );

    bJoin.on('mouseenter', (_, d) => setHovered(d))
         .on('mouseleave', () => setHovered(null));

    // Soft sheen highlights (separate layer, on top).
    const sheenG = svg.select('g.sheen');
    const sJoin = sheenG.selectAll('ellipse.sheen')
      .data(merged, (d) => d.code)
      .join((enter) =>
        enter.append('ellipse')
          .attr('class', 'sheen')
          .attr('fill', 'rgba(255,255,255,0.25)')
          .attr('pointer-events', 'none')
      );

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
      .attr('font-size', (d) => Math.max(11, Math.min(20, d.r / 2.6)))
      .text((d) => (d.r > 26 ? d.code : ''));

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
        sim.alphaTarget(0.01);
        sim.alpha(0.5).restart();
      });
    bJoin.call(drag);

    const render = () => {
      // Precompute neighbour lists (only nearby bubbles can deform a bubble).
      for (let i = 0; i < merged.length; i++) {
        const a = merged[i];
        const nbs = [];
        for (let j = 0; j < merged.length; j++) {
          if (i === j) continue;
          const b = merged[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          if (dx * dx + dy * dy < (a.r + b.r) ** 2) nbs.push(b);
        }
        a._nbs = nbs;
      }
      bJoin.attr('d', (d) => bubbleOutline(d, d._nbs));
      sJoin
        .attr('cx', (d) => d.x - d.r * 0.3)
        .attr('cy', (d) => d.y - d.r * 0.4)
        .attr('rx', (d) => d.r * 0.3)
        .attr('ry', (d) => d.r * 0.18)
        .attr('transform', (d) => `rotate(-28 ${d.x - d.r * 0.3} ${d.y - d.r * 0.4})`);
      lJoin.attr('x', (d) => d.x).attr('y', (d) => d.y);
    };
    sim.on('tick', render);
    render();

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

        <g className="bubbles" />
        <g className="sheen" />
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
