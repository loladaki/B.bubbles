import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRIES, interpolate } from './data/countries.js';

const WIDTH = 1000;
const HEIGHT = 700;
const PAD = 6;
const MIN_R = 16;
const MAX_R = 104;
const GAP = 5; // clear space between balls so each stays distinct

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
        x: WIDTH / 2 + (Math.random() - 0.5) * 300,
        y: HEIGHT / 2 + (Math.random() - 0.5) * 220,
      };
    });

    if (!simRef.current) {
      simRef.current = d3.forceSimulation(merged)
        .force('x', d3.forceX(WIDTH / 2).strength(0.04))
        .force('y', d3.forceY(HEIGHT / 2).strength(0.05))
        // Keep a clear gap between balls — no jumbled mass.
        .force('collide', d3.forceCollide()
          .radius((d) => d.r + GAP)
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
      simRef.current.force('collide').radius((d) => d.r + GAP);
      simRef.current.alpha(0.5).restart();
    }

    const sim = simRef.current;

    // Each ball is a <g> (so we can squash it) holding a flag-filled circle.
    const ballsG = svg.select('g.balls');
    const bJoin = ballsG.selectAll('g.ball')
      .data(merged, (d) => d.code)
      .join((enter) => {
        const g = enter.append('g').attr('class', 'ball').style('cursor', 'grab');
        g.append('circle')
          .attr('class', 'flag')
          .attr('r', (d) => d.r)
          .attr('fill', (d) => `url(#flag-${d.code})`)
          .attr('stroke', 'rgba(255,255,255,0.22)')
          .attr('stroke-width', 1.5);
        // Soft top-left sheen for a subtle soap-bubble feel.
        g.append('ellipse')
          .attr('class', 'sheen')
          .attr('fill', 'rgba(255,255,255,0.28)')
          .attr('pointer-events', 'none');
        return g;
      });

    bJoin.select('circle.flag')
      .transition().duration(500)
      .attr('r', (d) => d.r);
    bJoin.select('ellipse.sheen')
      .attr('cx', (d) => -d.r * 0.3)
      .attr('cy', (d) => -d.r * 0.4)
      .attr('rx', (d) => d.r * 0.32)
      .attr('ry', (d) => d.r * 0.2)
      .attr('transform', (d) => `rotate(-28 ${-d.r * 0.3} ${-d.r * 0.4})`);

    bJoin.on('mouseenter', (_, d) => setHovered(d))
         .on('mouseleave', () => setHovered(null));

    // Labels on a separate, unsquashed layer so they stay crisp.
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
      const t = performance.now();
      bJoin.attr('transform', (d, i) => {
        const speed = Math.sqrt((d.vx || 0) ** 2 + (d.vy || 0) ** 2);
        // Subtle directional squash (jelly), upright (no net rotation).
        const k = Math.min(0.14, speed * 0.009);
        const ang = (Math.atan2(d.vy || 0, d.vx || 0) * 180) / Math.PI;
        const breath = 1 + 0.012 * Math.sin(t / 720 + i * 0.6);
        const sx = (1 + k) * breath;
        const sy = (1 - k) * breath;
        return `translate(${d.x},${d.y}) rotate(${ang}) scale(${sx.toFixed(3)},${sy.toFixed(3)}) rotate(${-ang})`;
      });
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

        <g className="balls" />
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
