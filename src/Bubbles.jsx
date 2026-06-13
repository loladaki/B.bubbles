import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRIES, CONTINENTS, interpolate } from './data/countries.js';

const WIDTH = 1000;
const HEIGHT = 700;
const MIN_R = 8;
const MAX_R = 110;

export default function Bubbles({ year, metric }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const pointerRef = useRef({ x: null, y: null, active: false });
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
      return prev ? { ...prev, ...n } : { ...n, x: WIDTH / 2 + (Math.random() - 0.5) * 200, y: HEIGHT / 2 + (Math.random() - 0.5) * 200 };
    });

    if (!simRef.current) {
      simRef.current = d3.forceSimulation(merged)
        .force('x', d3.forceX(WIDTH / 2).strength(0.04))
        .force('y', d3.forceY(HEIGHT / 2).strength(0.04))
        .force('collide', d3.forceCollide()
          .radius((d) => d.r + 1.5)
          .strength(0.85)
          .iterations(4))
        // Pointer pushes nearby bubbles away — the "fidget" feel.
        .force('pointer', (alpha) => {
          const p = pointerRef.current;
          if (!p.active || p.x == null) return;
          const sim = simRef.current;
          const ns = sim.nodes();
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
        .alphaDecay(0.01)
        .velocityDecay(0.14)
        .alphaMin(0.001);
      // Keep the sim warm forever so motion feels alive.
      simRef.current.alphaTarget(0.02);
    } else {
      simRef.current.nodes(merged);
      simRef.current.force('collide').radius((d) => d.r + 1.5);
      simRef.current.alpha(0.7).restart();
    }

    const sim = simRef.current;
    const g = svg.select('g.bubbles');

    const join = g.selectAll('g.bubble')
      .data(merged, (d) => d.code)
      .join((enter) => {
        const node = enter.append('g').attr('class', 'bubble').style('cursor', 'grab');
        // Flag-filled circle.
        node.append('circle')
          .attr('class', 'flag-circle')
          .attr('fill', (d) => `url(#flag-${d.code})`)
          .attr('stroke', (d) => CONTINENTS[d.continent].color)
          .attr('stroke-width', 3);
        // Country code label, only on bubbles big enough.
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
        // Carry momentum so a fast drag flings the bubble.
        d.vx = (d._lastvx || 0) * 4;
        d.vy = (d._lastvy || 0) * 4;
        sim.alphaTarget(0.02);
        sim.alpha(0.6).restart();
      });
    join.call(drag);

    sim.on('tick', () => {
      const t = performance.now();
      join.attr('transform', (d, i) => {
        // Subtle idle "breathing" + squash when moving fast.
        const speed = Math.sqrt((d.vx || 0) ** 2 + (d.vy || 0) ** 2);
        const breath = 1 + 0.018 * Math.sin(t / 650 + i * 0.7);
        const wobble = Math.min(0.12, speed * 0.01);
        const s = breath + wobble;
        return `translate(${d.x},${d.y}) scale(${s})`;
      });
    });

    // Pointer tracking on the SVG (viewBox coordinates).
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
        </defs>
        <g className="bubbles" />
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
