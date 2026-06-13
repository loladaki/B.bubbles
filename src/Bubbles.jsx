import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { COUNTRIES, CONTINENTS, interpolate } from './data/countries.js';

const WIDTH = 1000;
const HEIGHT = 700;
const MIN_R = 6;
const MAX_R = 110;

export default function Bubbles({ year, metric }) {
  const svgRef = useRef(null);
  const simRef = useRef(null);
  const [hovered, setHovered] = useState(null);

  // Build node data for this year/metric.
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

  // Initialize / restart the simulation when nodes change.
  useEffect(() => {
    const svg = d3.select(svgRef.current);

    // Merge with existing node positions so bubbles stay put and just resize.
    const existing = simRef.current ? simRef.current.nodes() : [];
    const merged = nodes.map((n) => {
      const prev = existing.find((e) => e.code === n.code);
      return prev ? { ...prev, ...n } : { ...n, x: WIDTH / 2 + (Math.random() - 0.5) * 200, y: HEIGHT / 2 + (Math.random() - 0.5) * 200 };
    });

    if (!simRef.current) {
      simRef.current = d3.forceSimulation(merged)
        .force('center', d3.forceCenter(WIDTH / 2, HEIGHT / 2).strength(0.04))
        .force('charge', d3.forceManyBody().strength(2))
        .force('collide', d3.forceCollide().radius((d) => d.r + 1.5).iterations(3))
        .alphaDecay(0.02);
    } else {
      simRef.current.nodes(merged);
      simRef.current.force('collide').radius((d) => d.r + 1.5);
      simRef.current.alpha(0.7).restart();
    }

    const sim = simRef.current;
    const g = svg.select('g.bubbles');

    const join = g.selectAll('g.bubble')
      .data(merged, (d) => d.code)
      .join(
        (enter) => {
          const node = enter.append('g').attr('class', 'bubble').style('cursor', 'grab');
          node.append('circle')
            .attr('fill', (d) => CONTINENTS[d.continent].color)
            .attr('fill-opacity', 0.85)
            .attr('stroke', '#1a0510')
            .attr('stroke-width', 1.5);
          node.append('text')
            .attr('text-anchor', 'middle')
            .attr('dy', '-0.2em')
            .attr('fill', '#fff')
            .attr('font-weight', 700)
            .attr('pointer-events', 'none')
            .attr('font-family', 'system-ui, sans-serif');
          node.append('text')
            .attr('class', 'value')
            .attr('text-anchor', 'middle')
            .attr('dy', '1.1em')
            .attr('fill', '#fff')
            .attr('fill-opacity', 0.85)
            .attr('font-size', 11)
            .attr('pointer-events', 'none')
            .attr('font-family', 'system-ui, sans-serif');
          return node;
        }
      );

    join.select('circle')
      .transition().duration(600)
      .attr('r', (d) => d.r);

    join.select('text:not(.value)')
      .attr('font-size', (d) => Math.max(9, Math.min(18, d.r / 3)))
      .text((d) => (d.r > 22 ? d.name : d.r > 14 ? d.code : ''));

    join.select('text.value')
      .text((d) => (d.r > 28 ? formatValue(d.value, metric) : ''));

    join.on('mouseenter', (_, d) => setHovered(d))
        .on('mouseleave', () => setHovered(null));

    // Drag behavior.
    const drag = d3.drag()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x; d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      });
    join.call(drag);

    sim.on('tick', () => {
      join.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });
  }, [nodes, metric]);

  return (
    <div className="bubbles-wrap">
      <svg ref={svgRef} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMidYMid meet">
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
