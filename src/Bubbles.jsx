import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRIES, YEARS, interpolate } from './data/countries.js';

const PAD = 6;
const MIN_R = 8;
const MAX_R = 94;
const SAMPLES = 40; // outline resolution per bubble
const INSET = 2.5;  // subtle uniform gap (thin soap-foam membrane) between bubbles

const closedCurve = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6));

// Build a soap-bubble outline: a circle flattened against nearby neighbours
// using the radical (power-diagram) plane, so bubbles share a soft flat edge
// where they touch and stay round where they're free. Everything is pulled in
// by INSET so neighbours never quite meet, leaving a thin even gap.
function bubbleOutline(node, neighbours) {
  const rd = node.r - INSET;
  const pts = new Array(SAMPLES);
  for (let a = 0; a < SAMPLES; a++) {
    const th = (a / SAMPLES) * Math.PI * 2;
    let px = node.x + rd * Math.cos(th);
    let py = node.y + rd * Math.sin(th);
    for (let k = 0; k < neighbours.length; k++) {
      const nb = neighbours[k];
      const dx = nb.x - node.x;
      const dy = nb.y - node.y;
      const D = Math.sqrt(dx * dx + dy * dy) || 1e-6;
      const nx = dx / D;
      const ny = dy / D;
      // Shared contact plane, pulled back by INSET to leave a membrane gap.
      const t = (D * D + node.r * node.r - nb.r * nb.r) / (2 * D) - INSET;
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
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const pointerRef = useRef({ x: null, y: null, active: false });
  const dimsRef = useRef({ w: 1200, h: 600 });
  const fidgetRef = useRef(cursorFidget);
  fidgetRef.current = cursorFidget;
  const [viewBox, setViewBox] = useState('0 0 1200 600');
  const [hovered, setHovered] = useState(null);

  // Measure the wrapper and keep the SVG coordinate space equal to its real
  // pixel size, so bubbles can travel the full width edge to edge.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      if (w < 100 || h < 100) return; // ignore pre-layout zero sizes
      const cur = dimsRef.current;
      if (cur.w === w && cur.h === h) return;
      dimsRef.current = { w, h };
      setViewBox(`0 0 ${w} ${h}`);
      if (simRef.current) simRef.current.alpha(0.3).restart();
    };
    update();
    // Catch late layout over the next few frames.
    const r1 = requestAnimationFrame(update);
    const r2 = requestAnimationFrame(() => requestAnimationFrame(update));
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // Fixed scale across ALL years so sizes reflect absolute values over time:
  // as births fall or populations grow, bubbles actually shrink/swell.
  const rScale = useMemo(() => {
    let max = 0;
    for (const c of COUNTRIES) for (const v of c[metric]) if (v > max) max = v;
    return d3.scaleSqrt().domain([0, max]).range([MIN_R, MAX_R]);
  }, [metric]);

  const nodes = useMemo(() => {
    return COUNTRIES.map((c) => {
      const value = interpolate(c[metric], year);
      // Local trend: how fast this country is growing/shrinking right now.
      const ahead = interpolate(c[metric], Math.min(YEARS[YEARS.length - 1], year + 3));
      const behind = interpolate(c[metric], Math.max(YEARS[0], year - 3));
      const trend = value > 0 ? (ahead - behind) / value : 0; // fractional change / ~6yr
      return { ...c, value, r: rScale(value), trend };
    });
  }, [year, metric, rScale]);

  useEffect(() => {
    const svg = d3.select(svgRef.current);

    const existing = simRef.current ? simRef.current.nodes() : [];
    const merged = nodes.map((n) => {
      const prev = existing.find((e) => e.code === n.code);
      if (prev) return { ...prev, ...n };
      const { w, h } = dimsRef.current;
      return {
        ...n,
        x: w / 2 + (Math.random() - 0.5) * Math.min(w * 0.6, 400),
        y: h / 2 + (Math.random() - 0.5) * Math.min(h * 0.6, 280),
      };
    });

    if (!simRef.current) {
      simRef.current = d3.forceSimulation(merged)
        // Gentle, balanced pull so bubbles form a centered 2D cluster that
        // uses both width and height (not a flat line).
        .force('x', d3.forceX(() => dimsRef.current.w / 2).strength(0.03))
        .force('y', d3.forceY(() => dimsRef.current.h / 2).strength(0.05))
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
          const { w, h } = dimsRef.current;
          for (const n of ns) {
            const minX = PAD + n.r, maxX = w - PAD - n.r;
            const minY = PAD + n.r, maxY = h - PAD - n.r;
            if (n.x < minX) { n.x = minX; n.vx *= -0.4; }
            if (n.x > maxX) { n.x = maxX; n.vx *= -0.4; }
            if (n.y < minY) { n.y = minY; n.vy *= -0.4; }
            if (n.y > maxY) { n.y = maxY; n.vy *= -0.4; }
          }
        })
        .alphaDecay(0.015)
        .velocityDecay(0.22)
        .alphaMin(0.001);
      // No permanent heat — let the cluster settle at rest, then re-heat only
      // on interaction (drag / fidget-hover). Calmer, and lets bubbles come
      // to a satisfying rest.
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
      );

    // Trend ring: green = growing, red = shrinking, intensity = how fast.
    bJoin
      .attr('stroke', (d) => (d.trend >= 0 ? '#3df08a' : '#ff4d6d'))
      .attr('stroke-opacity', (d) => Math.min(0.95, 0.1 + Math.abs(d.trend) * 4.5))
      .attr('stroke-width', (d) => 1 + Math.min(5, Math.abs(d.trend) * 22));

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
      .attr('font-size', (d) => Math.max(9, Math.min(18, d.r / 2.6)))
      .text((d) => (d.r > 20 ? d.code : ''));

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
        sim.alphaTarget(0);     // let it settle back to rest
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
        // Keep the sim warm while fidget is on so hovering pushes bubbles.
        if (fidgetRef.current && sim.alpha() < 0.08) {
          sim.alphaTarget(0.12).restart();
        }
      })
      .on('pointerleave', () => {
        pointerRef.current.active = false;
        sim.alphaTarget(0); // settle once the pointer leaves
      });
  }, [nodes, metric]);

  return (
    <div className="bubbles-wrap" ref={wrapRef}>
      <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
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
            <div className="tt-trend" style={{ color: hovered.trend >= 0 ? '#3df08a' : '#ff4d6d' }}>
              {hovered.trend >= 0 ? '▲ growing' : '▼ shrinking'}
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
