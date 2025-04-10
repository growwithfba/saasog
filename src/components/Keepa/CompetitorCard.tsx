import React from 'react';
import { KeepaAnalysisResult } from './KeepaTypes';

// Get color for average BSR based on value ranges
const getBSRColor = (bsr: number): string => {
  if (bsr <= 2000) return 'text-red-400'; // Very competitive - hard to rank
  if (bsr <= 10000) return 'text-yellow-400'; // Competitive but possible
  if (bsr <= 50000) return 'text-emerald-400'; // Ideal BSR range
  if (bsr <= 75000) return 'text-yellow-400'; // Acceptable but not ideal
  return 'text-red-400'; // Poor BSR - very difficult to compete
};

// Get color for BSR percentage under 50k
const getBSRPercentageColor = (percentage: number): string => {
  if (percentage >= 85) return 'text-emerald-400';
  if (percentage >= 65) return 'text-yellow-400';
  return 'text-red-400';
};

interface CompetitorCardProps {
  competitor: KeepaAnalysisResult;
}

const CompetitorCard: React.FC<CompetitorCardProps> = ({ competitor }) => {
  // Calculate average BSR correctly
  const calculateAvgBSR = (): string => {
    if (!competitor.productData.bsr || competitor.productData.bsr.length === 0) {
      return 'N/A';
    }
    
    const avgBSR = Math.round(
      competitor.productData.bsr.reduce((sum, point) => sum + point.value, 0) / 
      competitor.productData.bsr.length
    );
    
    return avgBSR.toLocaleString();
  };

  // Get current BSR (most recent datapoint)
  const getCurrentBSR = (): string => {
    if (!competitor.productData.bsr || competitor.productData.bsr.length === 0) {
      return 'N/A';
    }
    
    // Sort by timestamp in descending order and get the most recent
    const sorted = [...competitor.productData.bsr].sort((a, b) => b.timestamp - a.timestamp);
    return sorted[0].value.toLocaleString();
  };

  // Get highest BSR (worst rank)
  const getHighestBSR = (): string => {
    if (!competitor.productData.bsr || competitor.productData.bsr.length === 0) {
      return 'N/A';
    }
    
    const highestBSR = Math.max(...competitor.productData.bsr.map(point => point.value));
    return highestBSR.toLocaleString();
  };

  // Get lowest BSR (best rank)
  const getLowestBSR = (): string => {
    if (!competitor.productData.bsr || competitor.productData.bsr.length === 0) {
      return 'N/A';
    }
    
    const lowestBSR = Math.min(...competitor.productData.bsr.map(point => point.value));
    return lowestBSR.toLocaleString();
  };

  // Calculate OTS frequency (Out of Stock)
  const getOTSFrequency = (): string => {
    if (!competitor.productData.bsr || competitor.productData.bsr.length === 0) {
      return 'N/A';
    }
    
    // Detect potential OTS by looking for extreme BSR spikes
    // (This is an approximation - actual OTS detection might require more data)
    const values = competitor.productData.bsr.map(point => point.value);
    const median = [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    
    // Count instances where BSR is 5x or more than the median (potential OTS)
    const otsCount = values.filter(val => val > median * 5).length;
    const percentage = (otsCount / values.length) * 100;
    
    return `${percentage.toFixed(1)}%`;
  };

  // Get the average BSR as a number for color coding
  const getAvgBSRNum = (): number => {
    if (!competitor.productData.bsr || competitor.productData.bsr.length === 0) {
      return 0;
    }
    
    return Math.round(
      competitor.productData.bsr.reduce((sum, point) => sum + point.value, 0) / 
      competitor.productData.bsr.length
    );
  };

  // Format BSR stability as percentage
  const getBSRStability = (): string => {
    if (typeof competitor.analysis.bsr.stability !== 'number') {
      return 'N/A';
    }
    return `${(competitor.analysis.bsr.stability * 100).toFixed(1)}%`;
  };

  // Get current price (most recent datapoint)
  const getCurrentPrice = (): string => {
    if (!competitor.productData.prices || competitor.productData.prices.length === 0) {
      return 'N/A';
    }
    
    // Sort by timestamp in descending order and get the most recent
    const sorted = [...competitor.productData.prices].sort((a, b) => b.timestamp - a.timestamp);
    return `$${(sorted[0].value / 100).toFixed(2)}`;
  };

  // Get average price
  const getAveragePrice = (): string => {
    if (!competitor.productData.prices || competitor.productData.prices.length === 0) {
      return 'N/A';
    }
    
    const avgPrice = competitor.productData.prices.reduce((sum, point) => sum + point.value, 0) / 
                     competitor.productData.prices.length;
    
    return `$${(avgPrice / 100).toFixed(2)}`;
  };

  // Get highest price
  const getHighestPrice = (): string => {
    if (!competitor.productData.prices || competitor.productData.prices.length === 0) {
      return 'N/A';
    }
    
    const highestPrice = Math.max(...competitor.productData.prices.map(point => point.value));
    return `$${(highestPrice / 100).toFixed(2)}`;
  };

  // Get lowest price
  const getLowestPrice = (): string => {
    if (!competitor.productData.prices || competitor.productData.prices.length === 0) {
      return 'N/A';
    }
    
    const lowestPrice = Math.min(...competitor.productData.prices.map(point => point.value));
    return `$${(lowestPrice / 100).toFixed(2)}`;
  };

  // Calculate sale/discount frequency
  const getSaleFrequency = (): string => {
    if (!competitor.productData.prices || competitor.productData.prices.length < 5) {
      return 'N/A';
    }
    
    const prices = competitor.productData.prices.map(point => point.value / 100);
    const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    
    // Count instances where price is at least 10% below average
    const saleThreshold = avgPrice * 0.9;
    const salesCount = prices.filter(price => price <= saleThreshold).length;
    const percentage = (salesCount / prices.length) * 100;
    
    return `${percentage.toFixed(1)}%`;
  };

  // Get price stability
  const getPriceStability = (): string => {
    if (typeof competitor.analysis.price.stability !== 'number') {
      return 'N/A';
    }
    return `${(competitor.analysis.price.stability * 100).toFixed(1)}%`;
  };

  // Get category based on stability value
  const getStabilityCategory = (): string => {
    const stability = competitor.analysis.bsr.stability;
    if (stability >= 0.8) return 'Very Stable';
    if (stability >= 0.6) return 'Moderate';
    if (stability >= 0.4) return 'Somewhat Stable';
    if (stability >= 0.2) return 'Unstable';
    return 'Poor';
  };

  // Price stability category
  const getPriceStabilityCategory = (): string => {
    const stability = competitor.analysis.price.stability;
    if (stability >= 0.9) return 'Very Stable';
    if (stability >= 0.75) return 'Stable';
    if (stability >= 0.6) return 'Moderate';
    if (stability >= 0.45) return 'Variable';
    return 'Highly Variable';
  };

  // Calculate OTS Rate
  const getOTSRate = (): React.ReactNode => {
    if (!competitor.productData.bsr || competitor.productData.bsr.length === 0) {
      return 'N/A';
    }
    
    const sortedBsr = [...competitor.productData.bsr].sort((a, b) => a.timestamp - b.timestamp);
    const oldestTimestamp = sortedBsr[0].timestamp;
    const newestTimestamp = sortedBsr[sortedBsr.length - 1].timestamp;
    const totalTimeInDays = (newestTimestamp - oldestTimestamp) / (1000 * 60 * 60 * 24);
    
    // Find gaps in BSR data > 7 days (likely OTS periods)
    let otsTimeInDays = 0;
    for (let i = 1; i < sortedBsr.length; i++) {
      const gap = (sortedBsr[i].timestamp - sortedBsr[i-1].timestamp) / (1000 * 60 * 60 * 24);
      if (gap > 7) {
        otsTimeInDays += gap;
      }
    }
    
    // Calculate OTS percentage
    const otsPercentage = Math.min(100, (otsTimeInDays / totalTimeInDays) * 100);
    
    // Return with appropriate color
    const otsValue = `${otsPercentage.toFixed(1)}%`;
    
    if (otsPercentage < 5) {
      return <span className="text-emerald-400">{otsValue}</span>;
    } else if (otsPercentage < 15) {
      return <span className="text-yellow-400">{otsValue}</span>;
    } else {
      return <span className="text-red-400">{otsValue}</span>;
    }
  };

  // Check if BSR is consistently poor (never under 50k)
  const hasConsistentlyPoorBSR = (): boolean => {
    if (!competitor.productData.bsr || competitor.productData.bsr.length === 0) {
      return false;
    }
    
    const values = competitor.productData.bsr.map(point => point.value);
    const pointsUnder50k = values.filter(v => v < 50000).length;
    return pointsUnder50k === 0;
  };

  // Calculate percentage of time BSR is under 50k
  const getBSRPercentageUnder50k = (): number => {
    if (!competitor.productData.bsr || competitor.productData.bsr.length === 0) {
      return 0;
    }
    
    const values = competitor.productData.bsr.map(point => point.value);
    const pointsUnder50k = values.filter(v => v < 50000).length;
    return (pointsUnder50k / values.length) * 100;
  };

  // Check if BSR is consistently under 50k (90% or more of the time)
  const isConsistentlyUnder50k = (): boolean => {
    return getBSRPercentageUnder50k() >= 90;
  };

  return (
    <div className="bg-slate-700/30 rounded-lg p-4">
      <h3 className="text-lg font-medium text-white mb-3 flex items-center justify-between">
        <span className="truncate mr-2">{competitor.productData.title || 'Unknown Product'}</span>
        <a 
          href={`https://www.amazon.com/dp/${competitor.asin}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs bg-slate-600/50 hover:bg-slate-600 text-slate-300 px-2 py-1 rounded"
        >
          View on Amazon
        </a>
      </h3>
      
      {hasConsistentlyPoorBSR() && (
        <div className="mb-4 bg-slate-700/40 rounded-lg p-2 text-xs">
          <div className="text-red-400 flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-5a1 1 0 112 0v1a1 1 0 11-2 0v-1zm2-2a1 1 0 10-2 0V7a1 1 0 112 0v4z" clipRule="evenodd" />
            </svg>
            Never achieves good BSR ranking (consistently above 50k)
          </div>
        </div>
      )}

      {!hasConsistentlyPoorBSR() && (
        <div className="mb-4 bg-slate-700/40 rounded-lg p-2 text-xs">
          {isConsistentlyUnder50k() ? (
            <div className="text-emerald-400 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Consistently maintains BSR under 50k ({Math.round(getBSRPercentageUnder50k())}% of time)
            </div>
          ) : (
            <div className={`${getBSRPercentageColor(getBSRPercentageUnder50k())} flex items-center gap-1`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              Maintains BSR under 50k for {Math.round(getBSRPercentageUnder50k())}% of time
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <div className="bg-slate-800/50 p-3 rounded-lg">
            <h4 className="text-slate-300 text-sm font-medium mb-2">BSR Metrics</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">BSR Stability Score:</span>
                <span className={`${getBSRStability() !== 'N/A' && parseFloat(getBSRStability()) > 75 ? 
                  'text-emerald-400' : parseFloat(getBSRStability()) > 50 ? 
                  'text-blue-400' : 'text-red-400'}`}>
                  {getBSRStability()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">BSR Category:</span>
                <span className={`${getBSRStability() !== 'N/A' && parseFloat(getBSRStability()) > 75 ? 
                  'text-emerald-400' : parseFloat(getBSRStability()) > 50 ? 
                  'text-blue-400' : 'text-red-400'}`}>
                  {getStabilityCategory()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Current BSR:</span>
                <span className="text-slate-300">#{getCurrentBSR()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Average BSR:</span>
                <span className="text-slate-300">#{calculateAvgBSR()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Highest BSR:</span>
                <span className="text-amber-400">#{getHighestBSR()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Lowest BSR:</span>
                <span className="text-emerald-400">#{getLowestBSR()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">OTS Rate:</span>
                <span>{getOTSRate()}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-2">
          <div className="bg-slate-800/50 p-3 rounded-lg">
            <h4 className="text-slate-300 text-sm font-medium mb-2">Price Metrics</h4>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Price Stability Score:</span>
                <span className={`${competitor.analysis.price.stability * 100 > 75 ? 
                  'text-emerald-400' : competitor.analysis.price.stability * 100 > 50 ? 
                  'text-blue-400' : 'text-red-400'}`}>
                  {getPriceStability()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Price Category:</span>
                <span className={`${competitor.analysis.price.stability * 100 > 75 ? 
                  'text-emerald-400' : competitor.analysis.price.stability * 100 > 50 ? 
                  'text-blue-400' : 'text-red-400'}`}>
                  {getPriceStabilityCategory()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Current Price:</span>
                <span className="text-slate-300">{getCurrentPrice()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Average Price:</span>
                <span className="text-slate-300">{getAveragePrice()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Highest Price:</span>
                <span className="text-amber-400">{getHighestPrice()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Lowest Price:</span>
                <span className="text-emerald-400">{getLowestPrice()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 text-sm">Sale Frequency:</span>
                <span>
                  {(() => {
                    const frequency = getSaleFrequency();
                    if (frequency === 'N/A') return 'N/A';
                    
                    const percentage = parseFloat(frequency);
                    if (percentage < 5) {
                      return <span className="text-blue-400">{frequency}</span>;
                    } else if (percentage < 25) {
                      return <span className="text-yellow-400">{frequency}</span>;
                    } else {
                      return <span className="text-emerald-400">{frequency}</span>;
                    }
                  })()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompetitorCard; 