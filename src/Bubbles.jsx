import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRIES, CONTINENTS, interpolate } from './data/countries.js';

const WIDTH = 1000;
const HEIGHT = 700;
const PAD = 8;
const MIN_R = 14;
const MAX_R = 100;

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
        x: PAD + Math.random() * (WIDTH - 2 * PAD),
        y: PAD + Math.random() * (HEIGHT - 2 * PAD),
      };
    });

    if (!simRef.current) {
      simRef.current = d3.forceSimulation(merged)
        .force('x', d3.forceX(WIDTH / 2).strength(0.015))
        .force('y', d3.forceY(HEIGHT / 2).strength(0.015))
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
        // Rectangular bound: keep bubbles inside the canvas.
        .force('bound', () => {
          const ns = simRef.current.nodes();
          for (const n of ns) {
            const minX = PAD + n.r;
            const maxX = WIDTH - PAD - n.r;
            const minY = PAD + n.r;
            const maxY = HEIGHT - PAD - n.r;
            if (n.x < minX) { n.x = minX; n.vx *= -0.4; }
            if (n.x > maxX) { n.x = maxX; n.vx *= -0.4; }
            if (n.y < minY) { n.y = minY; n.vy *= -0.4; }
            if (n.y > maxY) { n.y = maxY; n.vy *= -0.4; }
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

    // Per-country clipPaths (each path is updated per tick).
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

    // Country = Voronoi cell filled with flag image.
    const countriesG = svg.select('g.countries');
    const cJoin = countriesG.selectAll('g.country')
      .data(merged, (d) => d.code)
      .join((enter) => {
        const g = enter.append('g')
          .attr('class', 'country')
          .style('cursor', 'grab');

        g.append('path')
          .attr('class', 'cell-fill')
          .attr('fill', (d) => CONTINENTS[d.continent].color)
          .attr('fill-opacity', 0.45)
          .attr('stroke', 'none');

        g.append('image')
          .attr('class', 'flag-img')
          .attr('href', (d) => `https://flagcdn.com/w320/${d.iso2}.png`)
          .attr('preserveAspectRatio', 'xMidYMid slice')
          .attr('opacity', 0.78)
          .attr('clip-path', (d) => `url(#cell-clip-${d.code})`);

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

    sim.on('tick', () => {
      const delaunay = d3.Delaunay.from(merged, (d) => d.x, (d) => d.y);
      const voronoi = delaunay.voronoi([PAD, PAD, WIDTH - PAD, HEIGHT - PAD]);

      clipJoin.select('path').attr('d', (_, i) => voronoi.renderCell(i));

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
          <g className="clip-defs" />
        </defs>

        <g className="countries" />
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
