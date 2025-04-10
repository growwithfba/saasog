import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
// Fixed import path for Vercel deployment
import { BSRChartProps } from '../interfaces/ChartTypes';
import { ChartUtils } from './ChartUtils';
import { ChartConfig, formatters } from './ChartConfig';

export const BSRTrendChart: React.FC<BSRChartProps> = ({
  data,
  indicators,
  width = ChartConfig.dimensions.default.width,
  height = ChartConfig.dimensions.default.height
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!data || !svgRef.current) return;

    // Clear existing chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Setup dimensions
    const { margin, chartWidth, chartHeight } = ChartUtils.getChartDimensions(width, height);

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(data, d => new Date(d.timestamp)) as [Date, Date])
      .range([0, chartWidth])
      .nice();

    const yScale = d3.scaleLog()
      .domain([
        d3.min(data, d => d.value) as number * 0.9,
        d3.max(data, d => d.value) as number * 1.1
      ])
      .range([chartHeight, 0])
      .nice();

    // Create axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(ChartConfig.axis.ticks.x)
      .tickFormat(d => formatters.date.format(d as Date));

    const yAxis = d3.axisLeft(yScale)
      .ticks(ChartConfig.axis.ticks.y)
      .tickFormat(d => formatters.number.format(d as number));

    // Add axes
    svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${chartHeight})`)
      .call(xAxis);

    svg.append('g')
      .attr('class', 'y-axis')
      .call(yAxis);

    // Create line generator
    const line = d3.line<any>()
      .x(d => xScale(new Date(d.timestamp)))
      .y(d => yScale(d.value));

    // Add main line
    svg.append('path')
      .datum(data)
      .attr('class', 'bsr-line')
      .attr('fill', 'none')
      .attr('stroke', ChartConfig.colors.primary)
      .attr('stroke-width', ChartConfig.line.main.width)
      .attr('d', line);

    // Add trend line if enabled
    if (indicators.trendline) {
      const trendData = ChartUtils.calculateTrendLine(data);
      const trendPoints = [
        [xScale(new Date(data[0].timestamp)), yScale(data[0].value * (1 + trendData.slope))],
        [xScale(new Date(data[data.length - 1].timestamp)), 
         yScale(data[data.length - 1].value * (1 + trendData.slope))]
      ];

      svg.append('path')
        .datum(trendPoints)
        .attr('class', 'trend-line')
        .attr('fill', 'none')
        .attr('stroke', ChartConfig.colors.trend)
        .attr('stroke-width', ChartConfig.line.trend.width)
        .attr('stroke-dasharray', ChartConfig.line.trend.dash.join(','))
        .attr('d', d3.line());
    }

    // Add volatility bands if enabled
    if (indicators.volatilityBands) {
      const bands = ChartUtils.calculateVolatilityBands(data);
      
      // Add bands
      ['upper', 'lower', 'mean'].forEach(band => {
        svg.append('path')
          .datum(bands[band as keyof typeof bands])
          .attr('class', `band-${band}`)
          .attr('fill', 'none')
          .attr('stroke', ChartConfig.colors.bands[band as keyof typeof ChartConfig.colors.bands])
          .attr('stroke-width', ChartConfig.line.bands.width)
          .attr('d', line);
      });
    }

    // Add seasonal markers if enabled
    if (indicators.seasonalMarkers) {
      svg.selectAll('.seasonal-marker')
        .data(data.filter(d => d.value > d3.mean(data, d => d.value) * 1.1))
        .enter()
        .append('circle')
        .attr('class', 'seasonal-marker')
        .attr('cx', d => xScale(new Date(d.timestamp)))
        .attr('cy', d => yScale(d.value))
        .attr('r', ChartConfig.markers.seasonal.size)
        .attr('fill', ChartConfig.colors.seasonal.peak)
        .attr('stroke', 'white')
        .attr('stroke-width', ChartConfig.markers.seasonal.strokeWidth);
    }

    // Add tooltip
    const tooltip = d3.select(tooltipRef.current)
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background-color', ChartConfig.tooltip.background)
      .style('padding', `${ChartConfig.tooltip.padding}px`)
      .style('border', ChartConfig.tooltip.border)
      .style('border-radius', `${ChartConfig.tooltip.radius}px`)
      .style('box-shadow', ChartConfig.tooltip.shadow);

    // Add hover effects
    const bisect = d3.bisector((d: any) => new Date(d.timestamp)).left;
    
    svg.append('rect')
      .attr('class', 'overlay')
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mousemove', function(event) {
        const x0 = xScale.invert(d3.pointer(event, this)[0]);
        const i = bisect(data, x0, 1);
        const d0 = data[i - 1];
        const d1 = data[i];
        const d = x0.getTime() - d0.timestamp > d1.timestamp - x0.getTime() ? d1 : d0;

        tooltip
          .style('opacity', 1)
          .style('left', `${event.pageX + 10}px`)
          .style('top', `${event.pageY - 10}px`)
          .html(`
            <div style="
              font-size: ${ChartConfig.tooltip.text.title.size};
              font-weight: ${ChartConfig.tooltip.text.title.weight};
              color: ${ChartConfig.tooltip.text.title.color};
            ">
              ${formatters.date.format(new Date(d.timestamp))}
            </div>
            <div style="
              font-size: ${ChartConfig.tooltip.text.content.size};
              font-weight: ${ChartConfig.tooltip.text.content.weight};
              color: ${ChartConfig.tooltip.text.content.color};
            ">
              BSR: ${formatters.number.format(d.value)}
            </div>
          `);
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      });

  }, [data, indicators, width, height]);

  return (
    <div className="relative">
      <svg ref={svgRef}></svg>
      <div ref={tooltipRef} className="absolute pointer-events-none"></div>
    </div>
  );
}; 