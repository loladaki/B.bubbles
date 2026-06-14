import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRIES, YEARS, interpolate } from './data/countries.js';

const PAD = 6;
const MIN_R = 8;
const MAX_R = 94;
const SAMPLES = 32;   // outline resolution per bubble
const FILL = 0.55;    // total bubble area ~ FILL * shortSide^2 (cluster fits the short side)
const Y0 = YEARS[0];
const Y1 = YEARS[YEARS.length - 1];

const closedCurve = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6));

// Soap-bubble outline: a circle flattened against nearby neighbours using the
// radical (power-diagram) plane, pulled in by `inset` to leave a thin membrane.
function bubbleOutline(node, neighbours, inset) {
  const rd = node.r - inset;
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
      const t = (D * D + node.r * node.r - nb.r * nb.r) / (2 * D) - inset;
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

function makeRScale(metric) {
  let max = 0;
  for (const c of COUNTRIES) for (const v of c[metric]) if (v > max) max = v;
  return d3.scaleSqrt().domain([0, max]).range([MIN_R, MAX_R]);
}

export default function Bubbles({ year, metric, cursorFidget, playing }) {
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const nodesRef = useRef(null);
  const pointerRef = useRef({ x: null, y: null, active: false });
  const dimsRef = useRef({ w: 1200, h: 600 });
  const hoveredCodeRef = useRef(null);
  const fidgetRef = useRef(cursorFidget);
  const playingRef = useRef(playing);
  const applyRef = useRef(null);    // applyMetricYear(year, metric)
  const relayoutRef = useRef(null); // recompute radii for current canvas
  fidgetRef.current = cursorFidget;
  playingRef.current = playing;

  const [viewBox, setViewBox] = useState('0 0 1200 600');
  const [hovered, setHovered] = useState(null);

  // Keep the SVG coordinate space equal to the wrapper's real pixel size.
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      if (w < 100 || h < 100) return;
      const cur = dimsRef.current;
      if (cur.w === w && cur.h === h) return;
      dimsRef.current = { w, h };
      setViewBox(`0 0 ${w} ${h}`);
      if (relayoutRef.current) relayoutRef.current();
      if (simRef.current) simRef.current.alpha(0.3).restart();
    };
    update();
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

  // One-time setup: persistent nodes, simulation, joins, handlers, render loop.
  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const { w, h } = dimsRef.current;

    // Persistent node objects (positions survive year/metric changes).
    const nodes = COUNTRIES.map((c) => ({
      ...c,
      x: w / 2 + (Math.random() - 0.5) * Math.min(w * 0.6, 400),
      y: h / 2 + (Math.random() - 0.5) * Math.min(h * 0.6, 280),
      value: 0, r0: MIN_R, r: MIN_R, trend: 0,
    }));
    nodesRef.current = nodes;

    const scaleCache = {};
    const getScale = (m) => (scaleCache[m] ||= makeRScale(m));

    // Recompute display radii so total bubble area targets FILL of the canvas.
    const relayout = () => {
      const { w: cw, h: ch } = dimsRef.current;
      let baseArea = 0;
      for (const n of nodes) baseArea += Math.PI * n.r0 * n.r0;
      // Scale by the SHORT side: a roundish cluster is limited by the smaller
      // canvas dimension, so this keeps it from overflowing on wide-short or
      // tall-narrow canvases alike.
      const short = Math.min(cw, ch);
      const k = baseArea > 0
        ? Math.max(0.35, Math.min(1.6, Math.sqrt((FILL * short * short) / baseArea)))
        : 1;
      for (const n of nodes) n.r = n.r0 * k;
    };
    relayoutRef.current = relayout;

    const sim = d3.forceSimulation(nodes)
      .force('x', d3.forceX(() => dimsRef.current.w / 2).strength(0.03))
      .force('y', d3.forceY(() => dimsRef.current.h / 2).strength(0.05))
      .force('collide', d3.forceCollide().radius((d) => d.r * 0.93).strength(0.85).iterations(3))
      .force('pointer', (alpha) => {
        if (!fidgetRef.current) return;
        const p = pointerRef.current;
        if (!p.active || p.x == null) return;
        for (const n of nodes) {
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
        const { w: cw, h: ch } = dimsRef.current;
        for (const n of nodes) {
          const minX = PAD + n.r, maxX = cw - PAD - n.r;
          const minY = PAD + n.r, maxY = ch - PAD - n.r;
          if (n.x < minX) { n.x = minX; n.vx *= -0.4; }
          if (n.x > maxX) { n.x = maxX; n.vx *= -0.4; }
          if (n.y < minY) { n.y = minY; n.vy *= -0.4; }
          if (n.y > maxY) { n.y = maxY; n.vy *= -0.4; }
        }
      })
      .alphaDecay(0.015)
      .velocityDecay(0.22)
      .alphaMin(0.001);
    simRef.current = sim;

    const bJoin = svg.select('g.bubbles').selectAll('path.bubble')
      .data(nodes, (d) => d.code)
      .join((enter) =>
        enter.append('path')
          .attr('class', 'bubble')
          .style('cursor', 'grab')
          .attr('fill', (d) => (d.isRest ? 'url(#rest-fill)' : `url(#flag-${d.code})`))
      );

    const sJoin = svg.select('g.sheen').selectAll('ellipse.sheen')
      .data(nodes, (d) => d.code)
      .join((enter) =>
        enter.append('ellipse')
          .attr('class', 'sheen')
          .attr('fill', 'rgba(255,255,255,0.25)')
          .attr('pointer-events', 'none')
      );

    const lJoin = svg.select('g.labels').selectAll('text.code-label')
      .data(nodes, (d) => d.code)
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

    bJoin
      .on('mouseenter', (_, d) => { setHovered(d); hoveredCodeRef.current = d.code; render(); })
      .on('mouseleave', () => { setHovered(null); hoveredCodeRef.current = null; render(); });

    const drag = d3.drag()
      .on('start', (event, d) => {
        sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y; d._lastvx = 0; d._lastvy = 0;
      })
      .on('drag', (event, d) => {
        d.fx = event.x; d.fy = event.y; d._lastvx = event.dx; d._lastvy = event.dy;
      })
      .on('end', (event, d) => {
        d.fx = null; d.fy = null;
        d.vx = (d._lastvx || 0) * 3; d.vy = (d._lastvy || 0) * 3;
        sim.alphaTarget(playingRef.current ? 0.06 : 0);
        sim.alpha(0.5).restart();
      });
    bJoin.call(drag);

    // Per-frame render: Voronoi-ish neighbour deformation via a quadtree.
    const render = () => {
      let maxR = 0;
      for (const n of nodes) if (n.r > maxR) maxR = n.r;
      const tree = d3.quadtree().x((d) => d.x).y((d) => d.y).addAll(nodes);

      bJoin.attr('d', (a) => {
        const searchR = a.r + maxR;
        const nbs = [];
        tree.visit((quad, x0, y0, x1, y1) => {
          if (!quad.length) {
            let q = quad;
            do {
              const b = q.data;
              if (b && b !== a) {
                const dx = b.x - a.x, dy = b.y - a.y;
                if (dx * dx + dy * dy < (a.r + b.r) ** 2) nbs.push(b);
              }
            } while ((q = q.next));
          }
          return x0 > a.x + searchR || x1 < a.x - searchR || y0 > a.y + searchR || y1 < a.y - searchR;
        });
        const inset = Math.max(1, Math.min(3, a.r * 0.06));
        return bubbleOutline(a, nbs, inset);
      });

      sJoin
        .attr('cx', (d) => d.x - d.r * 0.3)
        .attr('cy', (d) => d.y - d.r * 0.4)
        .attr('rx', (d) => d.r * 0.3)
        .attr('ry', (d) => d.r * 0.18)
        .attr('transform', (d) => `rotate(-28 ${d.x - d.r * 0.3} ${d.y - d.r * 0.4})`);

      lJoin
        .attr('x', (d) => d.x)
        .attr('y', (d) => d.y)
        .attr('font-size', (d) => Math.max(10, Math.min(20, d.r / 2.4)))
        .text((d) => (d.isRest ? '🌍' : d.code === hoveredCodeRef.current ? d.code : ''));
    };
    sim.on('tick', render);

    // Apply a given year/metric: update values, radii, trend rings.
    const applyMetricYear = (yr, m) => {
      const scale = getScale(m);
      for (const n of nodes) {
        const value = interpolate(n[m], yr);
        const ahead = interpolate(n[m], Math.min(Y1, yr + 3));
        const behind = interpolate(n[m], Math.max(Y0, yr - 3));
        n.value = value;
        n.r0 = scale(value);
        n.trend = value > 0 ? (ahead - behind) / value : 0;
      }
      relayout();
      bJoin
        .attr('stroke', (d) => {
          if (Math.abs(d.trend) < 0.03) return 'rgba(255,255,255,0.16)';
          return d.trend >= 0 ? '#3df08a' : '#ff4d6d';
        })
        .attr('stroke-opacity', (d) => {
          const a = Math.abs(d.trend);
          return a < 0.03 ? 0.16 : Math.min(0.45, 0.12 + a * 1.6);
        })
        .attr('stroke-width', (d) => 0.8 + Math.min(1.4, Math.abs(d.trend) * 7));
      render(); // resize immediately, regardless of the sim's tick cadence
      if (playingRef.current) {
        sim.alphaTarget(0.06).restart(); // stay warm so positions re-settle
      } else {
        sim.alphaTarget(0);
        sim.alpha(0.3).restart();
      }
    };
    applyRef.current = applyMetricYear;

    applyMetricYear(year, metric);

    svg
      .on('pointermove', (event) => {
        const [x, y] = d3.pointer(event, svgRef.current);
        pointerRef.current = { x, y, active: true };
        if (fidgetRef.current && sim.alpha() < 0.08) sim.alphaTarget(0.12).restart();
      })
      .on('pointerleave', () => {
        pointerRef.current.active = false;
        if (!playingRef.current) sim.alphaTarget(0);
      });

    return () => { sim.stop(); sim.on('tick', null); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Year / metric changes: cheap value+size update, no re-join.
  useEffect(() => {
    if (applyRef.current) applyRef.current(year, metric);
  }, [year, metric]);

  // Keep the sim gently warm while playing so the cluster tracks size changes.
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (playing) sim.alphaTarget(0.06).restart();
    else sim.alphaTarget(0);
  }, [playing]);

  return (
    <div className="bubbles-wrap" ref={wrapRef}>
      <svg ref={svgRef} viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
        <defs>
          {COUNTRIES.filter((c) => c.iso2).map((c) => (
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
          <radialGradient id="rest-fill" cx="0.36" cy="0.3" r="0.95">
            <stop offset="0%" stopColor="#46598a" />
            <stop offset="100%" stopColor="#1b2440" />
          </radialGradient>
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
            <div className="tt-meta">
              {hovered.isRest
                ? `${hovered.count} smaller countries & territories`
                : hovered.continent}
            </div>
            <div className="tt-value">
              {formatValue(hovered.value, metric)}{' '}
              <span className="tt-unit">{metric === 'births' ? 'births/yr' : 'people'}</span>
            </div>
            <div className="tt-trend" style={{ color: hovered.trend >= 0 ? '#3df08a' : '#ff4d6d' }}>
              {hovered.trend >= 0 ? '▲ growing' : '▼ shrinking'}
            </div>
            {hovered.isRest && (
              <div className="tt-note">
                Everyone not in the top 120 — combined so the bubbles add up to
                the full UN world total.
              </div>
            )}
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
