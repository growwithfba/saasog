import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
// Fixed import path for Vercel deployment
import { PriceChartProps } from '../interfaces/ChartTypes';
import { ChartUtils } from './ChartUtils';
import { ChartConfig, formatters } from './ChartConfig';

export const PriceAnalysisChart: React.FC<PriceChartProps> = ({
  data,
  elements,
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

    const yScale = d3.scaleLinear()
      .domain([
        d3.min(data, d => d.value) as number * 0.95,
        d3.max(data, d => d.value) as number * 1.05
      ])
      .range([chartHeight, 0])
      .nice();

    // Create axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(ChartConfig.axis.ticks.x)
      .tickFormat(d => formatters.date.format(d as Date));

    const yAxis = d3.axisLeft(yScale)
      .ticks(ChartConfig.axis.ticks.y)
      .tickFormat(d => formatters.price.format(d as number));

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
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Add main price line
    svg.append('path')
      .datum(data)
      .attr('class', 'price-line')
      .attr('fill', 'none')
      .attr('stroke', ChartConfig.colors.primary)
      .attr('stroke-width', ChartConfig.line.main.width)
      .attr('d', line);

    // Add trend line if enabled
    if (elements.trendLine) {
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

    // Add stability periods if enabled
    if (elements.stabilityPeriods) {
      const stabilityPeriods = ChartUtils.detectStabilityPeriods(data);
      
      stabilityPeriods.forEach(period => {
        // Add stability period background
        svg.append('rect')
          .attr('class', 'stability-period')
          .attr('x', xScale(new Date(period.start)))
          .attr('y', 0)
          .attr('width', xScale(new Date(period.end)) - xScale(new Date(period.start)))
          .attr('height', chartHeight)
          .attr('fill', ChartConfig.colors.stability.period)
          .attr('opacity', ChartConfig.markers.stability.opacity);

        // Add stability indicator line
        svg.append('line')
          .attr('class', 'stability-indicator')
          .attr('x1', xScale(new Date(period.start)))
          .attr('x2', xScale(new Date(period.end)))
          .attr('y1', yScale(period.avgValue))
          .attr('y2', yScale(period.avgValue))
          .attr('stroke', ChartConfig.colors.stability.line)
          .attr('stroke-width', ChartConfig.markers.stability.height)
          .attr('stroke-dasharray', '4,4');
      });
    }

    // Add seasonal overlay if enabled
    if (elements.seasonalOverlay) {
      const seasonalData = ChartUtils.calculateVolatilityBands(data, 30);
      
      // Add seasonal band
      svg.append('path')
        .datum(seasonalData.mean)
        .attr('class', 'seasonal-overlay')
        .attr('fill', 'none')
        .attr('stroke', ChartConfig.colors.seasonal.overlay)
        .attr('stroke-width', ChartConfig.line.main.width * 2)
        .attr('opacity', 0.5)
        .attr('d', line);
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
              Price: ${formatters.price.format(d.value)}
            </div>
          `);
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
      });

  }, [data, elements, width, height]);

  return (
    <div className="relative">
      <svg ref={svgRef}></svg>
      <div ref={tooltipRef} className="absolute pointer-events-none"></div>
    </div>
  );
}; 