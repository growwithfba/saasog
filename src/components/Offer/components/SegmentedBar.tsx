'use client';

interface Segment {
  label: string;
  value: number;
  color: string;
}

interface SegmentedBarProps {
  segments: Segment[];
  className?: string;
  showLabels?: boolean;
  showValues?: boolean;
}

export function SegmentedBar({ segments, className = '', showLabels = true, showValues = true }: SegmentedBarProps) {
  const total = segments.reduce((sum, seg) => sum + seg.value, 0);
  
  if (total === 0) {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="h-6 bg-slate-700/30 rounded-md"></div>
        {showLabels && (
          <div className="text-xs text-slate-500">No data available</div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="h-6 bg-slate-700/30 rounded-md overflow-hidden flex">
        {segments.map((segment, index) => {
          const width = (segment.value / total) * 100;
          if (width === 0) return null;
          
          return (
            <div
              key={index}
              className="h-full transition-all"
              style={{
                width: `${width}%`,
                backgroundColor: segment.color,
              }}
              title={`${segment.label}: ${segment.value.toFixed(1)}%`}
            />
          );
        })}
      </div>
      {showLabels && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {segments.map((segment, index) => {
            if (segment.value === 0) return null;
            const width = (segment.value / total) * 100;
            
            return (
              <div key={index} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="text-slate-400">{segment.label}</span>
                {showValues && (
                  <span className="text-slate-300 font-medium">{segment.value.toFixed(1)}%</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

