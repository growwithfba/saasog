export const ChartConfig = {
  colors: {
    primary: '#2563eb',      // Blue for main line
    secondary: '#64748b',    // Slate for secondary elements
    trend: '#059669',        // Green for trend line
    bands: {
      upper: 'rgba(37, 99, 235, 0.1)',   // Light blue for upper band
      lower: 'rgba(37, 99, 235, 0.1)',   // Light blue for lower band
      mean: 'rgba(37, 99, 235, 0.5)'     // Semi-transparent blue for mean
    },
    seasonal: {
      peak: '#dc2626',       // Red for seasonal peaks
      trough: '#2563eb',     // Blue for seasonal troughs
      overlay: 'rgba(37, 99, 235, 0.15)' // Very light blue for seasonal overlay
    },
    stability: {
      period: 'rgba(5, 150, 105, 0.2)',  // Light green for stability periods
      line: '#059669'        // Green for stability indicators
    }
  },

  dimensions: {
    default: {
      width: 800,
      height: 400,
      margin: {
        top: 20,
        right: 30,
        bottom: 30,
        left: 60
      }
    },
    compact: {
      width: 600,
      height: 300,
      margin: {
        top: 15,
        right: 20,
        bottom: 25,
        left: 50
      }
    }
  },

  animation: {
    duration: 750,           // Duration for transitions
    delay: 150              // Delay between elements
  },

  axis: {
    ticks: {
      x: 6,                 // Number of x-axis ticks
      y: 5                  // Number of y-axis ticks
    },
    padding: {
      x: 0.2,              // Padding for x domain
      y: 0.1               // Padding for y domain
    }
  },

  line: {
    main: {
      width: 2,            // Width of main data line
      opacity: 1
    },
    trend: {
      width: 2,            // Width of trend line
      opacity: 0.8,
      dash: [6, 4]         // Dash pattern for trend line
    },
    bands: {
      width: 1,            // Width of volatility band lines
      opacity: 0.5
    }
  },

  tooltip: {
    padding: 8,
    radius: 4,
    background: 'rgba(255, 255, 255, 0.95)',
    border: '1px solid #e2e8f0',
    shadow: '0 2px 4px rgba(0,0,0,0.1)',
    text: {
      title: {
        size: '14px',
        weight: '600',
        color: '#1e293b'
      },
      content: {
        size: '12px',
        weight: '400',
        color: '#64748b'
      }
    }
  },

  markers: {
    seasonal: {
      size: 6,             // Size of seasonal markers
      strokeWidth: 2
    },
    stability: {
      height: 4,           // Height of stability period indicators
      opacity: 0.3
    }
  }
};

export const formatters = {
  date: new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }),
  
  number: new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }),
  
  price: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }),
  
  percent: new Intl.NumberFormat('en-US', {
    style: 'percent',
    minimumFractionDigits: 1
  })
}; 