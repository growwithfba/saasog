// services/keepaService.ts

import { KeepaAnalysisResult } from '../components/Keepa/KeepaTypes';

const KEEPA_API_KEY = '4lu29cvlr81n16ttqfpkpo60dsbmg0gh627kjms5efm5uqodl1420dgbblk7sigs';
const KEEPA_BASE_URL = 'https://api.keepa.com';

// Define the missing types to fix linter errors
interface KeepaTokenResponse {
  tokensLeft?: number;
  error?: {
    message: string;
  };
}

interface KeepaApiResponse {
  products?: any[];
  error?: any;
}

interface BSRTimelineScore {
  score: number;
  timeInRanges: {
    under10k: number;
    under25k: number;
    under50k: number;
    under100k: number;
    under250k: number;
    above250k: number;
  };
  volatilityPenalty: number;
  finalScore: number;
}

interface EnhancedBSRAnalysis {
  threeMonth: BSRTimelineScore;
  sixMonth: BSRTimelineScore;
  twelveMonth: BSRTimelineScore;
  performanceSummary: 'Exceptional' | 'Highly Consistent' | 'Consistent' | 
                     'Moderately Consistent' | 'Inconsistent' | 'Highly Volatile' |
                     'Declining' | 'Extremely Volatile';
}

export const keepaService = {
  async testConnection() {
    console.log('Checking token balance...');
    try {
      const response = await fetch(`${KEEPA_BASE_URL}/token?key=${KEEPA_API_KEY}`);
      const data: KeepaTokenResponse = await response.json();
      
      if (data.error) {
        throw new Error(data.error.message);
      }

      console.log('Available tokens:', data.tokensLeft);
      return {
        success: data.tokensLeft ? data.tokensLeft > 0 : false,
        tokensLeft: data.tokensLeft || 0,
        message: `Available tokens: ${data.tokensLeft}`
      };
    } catch (error) {
      console.error('Token check failed:', error);
      return { success: false, error: 'Failed to verify Keepa API access' };
    }
  },

  async getCompetitorData(asins: string[]): Promise<KeepaAnalysisResult[]> {
    if (!asins?.length) {
      console.error('No ASINs provided to Keepa service');
      return [];
    }
    
    try {
      console.log(`Starting analysis for ${asins.length} ASINs (will use ${asins.length} tokens)`);
      
      // Clean ASINs and validate
      const validAsins = asins
        .map(asin => asin.replace(/[^A-Z0-9]/g, ''))
        .filter(asin => asin.length === 10);

      if (!validAsins.length) {
        console.error('No valid ASINs after filtering:', asins);
        throw new Error('No valid ASINs provided');
      }

      console.log('Requesting Keepa data for valid ASINs:', validAsins);
      const url = `${KEEPA_BASE_URL}/product?key=${KEEPA_API_KEY}&domain=1&asin=${validAsins.join(',')}&stats=180`;
      const response = await fetch(url);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Keepa API error (${response.status}):`, errorText);
        throw new Error(`Keepa API error: ${response.status}`);
      }

      const data: KeepaApiResponse = await response.json();
      console.log('Raw Keepa API response structure:', {
        hasProducts: !!data.products,
        productCount: data.products?.length,
        firstProductKeys: data.products?.[0] ? Object.keys(data.products[0]) : [],
        csvArrays: data.products?.[0]?.csv ? Object.keys(data.products[0].csv) : []
      });
    
      if (data.products?.[0]) {
        console.log('First product CSV arrays:', {
          array3: data.products[0].csv?.[3]?.slice(0, 10),
          csvKeys: Object.keys(data.products[0].csv || {})
        });
      }
      
      if (data.error) {
        console.error('Keepa API returned an error:', data.error);
        throw new Error(data.error.message || 'Keepa API error');
      }

      if (!data.products?.length) {
        console.error('No product data received from Keepa');
        throw new Error('No product data received');
      }

      return this.transformKeepaData(data.products);
    } catch (error) {
      console.error('Keepa analysis error:', error);
      throw error;
    }
  },

  transformKeepaData(products: any[]): KeepaAnalysisResult[] {
    return products.map(product => {
      // Validate incoming product data
      console.log('Processing product:', {
        asin: product.asin,
        hasCsvData: !!product.csv,
        csvArrays: product.csv ? Object.keys(product.csv) : []
      });

      // PRICE DATA DEBUGGING - Check what arrays are available and what they contain
      // This helps us verify if the price data is where we expect it to be
      if (product.csv) {
        // Log the first few indexes to see what data is there
        console.log('CSV array data exploration for ' + product.asin + ':');
        for (let i = 0; i < 5; i++) {
          if (product.csv[i]) {
            const sample = product.csv[i].slice(0, 10); // Take just first few elements
            console.log(`  csv[${i}] (${product.csv[i].length} values): `, sample);
          } else {
            console.log(`  csv[${i}]: undefined or empty`);
          }
        }
      }

      if (!product.asin || !product.csv) {
        console.warn('Invalid product data:', { asin: product.asin });
        return {
          asin: product.asin || 'unknown',
          status: 'error',
          error: 'Invalid product data',
          productData: {
            title: 'Unknown Product',
            bsr: [],
            prices: [],
            salesEstimates: []
          },
          analysis: {
            bsr: {
              trend: { direction: 'stable', strength: 0, confidence: 0 },
              stability: 0,
              volatility: 1,
              details: null
            },
            price: {
              trend: { direction: 'stable', strength: 0 },
              stability: 0.65 // Default value - suspicious that all products have this
            },
            competitivePosition: {
              score: 0,
              factors: ['Insufficient data']
            }
          }
        } as KeepaAnalysisResult;
      };

      // Extract and validate time series data
      const bsrHistory = this.normalizeTimeSeries(product.csv[3] || []);
      
      // Get price data and log details to diagnose the issue
      const priceHistory = this.normalizeTimeSeries(product.csv[0] || []);
      
      console.log('PRICE DATA CHECK for ' + product.asin + ':', {
        rawPriceDataLength: product.csv[0] ? product.csv[0].length : 0,
        normalizedPriceDataPoints: priceHistory.length,
        firstFewPricePoints: priceHistory.slice(0, 3)
      });
      
      // Try multiple array indexes if price data isn't in index 0
      let alternativePriceHistory = [];
      if (priceHistory.length < 2) {
        console.log('Trying alternative price data sources for ' + product.asin);
        // Amazon might put pricing in other arrays (1, 2, 16)
        [1, 2, 16].forEach(index => {
          if (product.csv[index] && product.csv[index].length) {
            const altHistory = this.normalizeTimeSeries(product.csv[index]);
            if (altHistory.length > alternativePriceHistory.length) {
              alternativePriceHistory = altHistory;
              console.log(`Found better price data in csv[${index}]: ${altHistory.length} points`);
            }
          }
        });
      }

      // Use alternative price data if it's better than the original
      const finalPriceHistory = (alternativePriceHistory.length > priceHistory.length) 
        ? alternativePriceHistory 
        : priceHistory;
      
      const salesHistory = this.normalizeTimeSeries(product.csv[11] || []);

      // Log extracted data points
      console.log('Extracted time series:', {
        asin: product.asin,
        bsrPoints: bsrHistory.length,
        pricePoints: finalPriceHistory.length,
        salesPoints: salesHistory.length
      });

      // Perform analysis with validated data
      const bsrAnalysis = bsrHistory.length > 0 
        ? this.analyzeBSRTrend(bsrHistory)
        : {
            trend: { direction: 'stable', strength: 0, confidence: 0 },
            stability: 0,
            volatility: 1,
            details: null
          };

      const priceAnalysis = finalPriceHistory.length > 0
        ? this.analyzePriceTrend(finalPriceHistory)
        : {
            trend: { direction: 'stable', strength: 0 },
            stability: 0.65 // Default value
          };

      const competitivePosition = bsrHistory.length > 0
        ? this.analyzeCompetitivePosition(product, bsrHistory)
        : {
            score: 0,
            factors: ['Insufficient BSR data']
          };

      // Log analysis results
      console.log('Analysis results:', {
        asin: product.asin,
        hasBSRAnalysis: !!bsrAnalysis,
        hasPriceAnalysis: !!priceAnalysis,
        hasCompetitivePosition: !!competitivePosition
      });

      return {
        asin: product.asin,
        status: 'complete',
        productData: {
          title: product.title || 'Unknown Product',
          bsr: bsrHistory,
          prices: finalPriceHistory,
          salesEstimates: salesHistory
        },
        analysis: {
          bsr: bsrAnalysis,
          price: priceAnalysis,
          competitivePosition
        }
      } as KeepaAnalysisResult;
    });
  },

  normalizeTimeSeries(data: number[]): Array<{ timestamp: number; value: number }> {
    if (!data?.length) {
      return [];
    }
    
    // Keepa epoch starts at 2011-01-01
    const keepaEpoch = new Date('2011-01-01').getTime();
    const points: Array<{ timestamp: number; value: number }> = [];
    
    for (let i = 0; i < data.length; i += 2) {
      const keepaMinutes = data[i];
      const value = data[i + 1];
      
      if (keepaMinutes >= 0 && value >= 0) {
        // Convert Keepa minutes (minutes since Keepa epoch) to timestamp
        const timestamp = keepaEpoch + (keepaMinutes * 60 * 1000);
        
        points.push({
          timestamp: timestamp,
          value: value
        });
      }
    }
    
    // Sort chronologically
    points.sort((a, b) => a.timestamp - b.timestamp);
    
    return points;
  },

  calculateVolatilityAndStability(values: number[]): { 
    stability: number; 
    volatility: number; 
    details: {
      consistencyScore: number;
      changeScore: number;
      outOfStockImpact: number;
    }
  } {
    if (values.length < 2) {
      return {
        stability: 1,
        volatility: 0,
        details: {
          consistencyScore: 1,
          changeScore: 0,
          outOfStockImpact: 0
        }
      };
    }

    // Preprocessing
    const cleanValues = this.preprocessValues(values);

    // Consistency Analysis
    const consistencyScore = this.calculateConsistencyScore(cleanValues);

    // Change Analysis
    const { changeScore, maxRelativeChange } = this.calculateChangeScore(cleanValues);

    // Out of Stock Impact
    const outOfStockImpact = this.calculateOutOfStockImpact(values);

    // Composite Stability Calculation
    const stabilityComponents = [
      consistencyScore * 0.4,
      (1 - changeScore) * 0.3,
      (1 - outOfStockImpact) * 0.3
    ];

    const stability = Math.max(0, Math.min(1, 
      stabilityComponents.reduce((sum, val) => sum + val, 0)
    ));

    const volatility = 1 - stability;

    console.log('Volatility Analysis:', {
      inputValuesCount: values.length,
      cleanValuesCount: cleanValues.length,
      consistencyScore,
      changeScore,
      outOfStockImpact,
      finalStability: stability,
      finalVolatility: volatility
    });

    return {
      stability,
      volatility,
      details: {
        consistencyScore,
        changeScore,
        outOfStockImpact
      }
    };
  },

  preprocessValues(values: number[]): number[] {
    if (values.length < 5) return values;

    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    
    const lowerBound = q1 - (1.5 * iqr);
    const upperBound = q3 + (1.5 * iqr);

    return values.filter(v => v >= lowerBound && v <= upperBound);
  },

  calculateConsistencyScore(values: number[]): number {
    if (values.length < 2) return 1;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    const normalizedStdDev = stdDev / mean;
    return Math.max(0, 1 - (normalizedStdDev * 2));
  },

  calculateChangeScore(values: number[]): { changeScore: number; maxRelativeChange: number } {
    if (values.length < 2) return { changeScore: 0, maxRelativeChange: 0 };

    const changes = [];
    for (let i = 1; i < values.length; i++) {
      const relativeChange = Math.abs((values[i] - values[i-1]) / values[i-1]);
      changes.push(relativeChange);
    }

    const maxRelativeChange = Math.max(...changes);
    const changeScore = 1 - Math.exp(-maxRelativeChange);

    return { changeScore, maxRelativeChange };
  },

  calculateOutOfStockImpact(values: number[]): number {
    if (values.length < 10) return 0;

    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    
    const extremeDropCount = values.filter(v => v < (q1 * 0.5)).length;
    return Math.min(1, extremeDropCount / values.length);
  },

  calculateBSRTimelineScore(history: Array<{ timestamp: number; value: number }>): BSRTimelineScore {
    if (history.length < 10) {
      return {
        score: 0,
        timeInRanges: {
          under10k: 0,
          under25k: 0,
          under50k: 0,
          under100k: 0,
          under250k: 0,
          above250k: 0
        },
        volatilityPenalty: 0,
        finalScore: 0
      };
    }

    // Calculate time in different ranges
    let times = {
      under10k: 0,
      under25k: 0,
      under50k: 0,
      under100k: 0,
      under250k: 0,
      above250k: 0
    };
    let totalTime = 0;

    const sortedHistory = [...history].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 1; i < sortedHistory.length; i++) {
      const timeDiff = Math.max(0, sortedHistory[i].timestamp - sortedHistory[i-1].timestamp);
      if (timeDiff > 30 * 24 * 60 * 60 * 1000) continue; // Skip gaps > 30 days
      
      const avgBSR = (sortedHistory[i].value + sortedHistory[i-1].value) / 2;

      if (avgBSR < 10000) times.under10k += timeDiff;
      else if (avgBSR < 25000) times.under25k += timeDiff;
      else if (avgBSR < 50000) times.under50k += timeDiff;
      else if (avgBSR < 100000) times.under100k += timeDiff;
      else if (avgBSR < 250000) times.under250k += timeDiff;
      else times.above250k += timeDiff;

      totalTime += timeDiff;
    }

    // Convert to percentages
    const timeInRanges = {
      under10k: (times.under10k / totalTime) * 100,
      under25k: (times.under25k / totalTime) * 100,
      under50k: (times.under50k / totalTime) * 100,
      under100k: (times.under100k / totalTime) * 100,
      under250k: (times.under250k / totalTime) * 100,
      above250k: (times.above250k / totalTime) * 100
    };

    // Calculate base score
    let score = 0;
    score += Math.min(timeInRanges.under10k, 100) * 0.9;  // Up to 90 points
    score += Math.min(timeInRanges.under25k, 100) * 0.75; // Up to 75 points
    score += Math.min(timeInRanges.under50k, 100) * 0.6;  // Up to 60 points

    // Apply penalties
    score -= timeInRanges.under100k * 0.2;   // Moderate penalty
    score -= timeInRanges.under250k * 0.4;   // Heavy penalty
    score -= timeInRanges.above250k * 0.6;   // Severe penalty

    // Calculate volatility penalty
    const volatilityPenalty = this.calculateVolatilityPenalty(sortedHistory);

    return {
      score: Math.max(0, Math.min(100, score)),
      timeInRanges,
      volatilityPenalty,
      finalScore: Math.max(0, Math.min(100, score - volatilityPenalty))
    };
  },

  calculateVolatilityPenalty(history: Array<{ timestamp: number; value: number }>): number {
    let largeSwings = 0;
    
    for (let i = 1; i < history.length; i++) {
      const percentChange = Math.abs(
        (history[i].value - history[i-1].value) / history[i-1].value
      );
      if (percentChange > 0.5) largeSwings++;
    }

    return Math.min(10, largeSwings * 2);
  },

  getPerformanceSummary(analysis: EnhancedBSRAnalysis): string {
    const recent = analysis.threeMonth.finalScore;
    const mid = analysis.sixMonth.finalScore;
    const long = analysis.twelveMonth.finalScore;
    
    if (recent >= 90 && mid >= 85 && long >= 80) return 'Exceptional';
    if (recent >= 80 && mid >= 75 && long >= 70) return 'Highly Consistent';
    if (recent >= 70 && mid >= 65 && long >= 60) return 'Consistent';
    if (recent >= 60 && mid >= 55 && long >= 50) return 'Moderately Consistent';
    if (recent >= 50 && mid >= 45 && long >= 40) return 'Inconsistent';
    if (recent < 40 || mid < 35 || long < 30) return 'Highly Volatile';
    if (recent < long && mid < long) return 'Declining';
    return 'Extremely Volatile';
  },

  analyzeBSRTrend(history: Array<{ timestamp: number; value: number }>) {
    if (history.length < 2) {
      return {
        trend: { direction: 'stable', strength: 0, confidence: 0 },
        stability: 0,
        volatility: 1,
        details: null
      };
    }

    const values = history.map(point => point.value);
    const trend = this.calculateTrend(values);
    const stability = this.calculateStability(values);

    return {
      trend,
      stability,
      volatility: 1 - stability,
      details: null
    };
  },

  analyzePriceTrend(history: Array<{ timestamp: number; value: number }>) {
    // STRICT INPUT VALIDATION
    // Check if history is valid and has at least 2 data points
    if (!history || !Array.isArray(history) || history.length < 2) {
      console.log('Price stability defaulting to 65% due to insufficient price history data points:', 
                 history ? history.length : 0);
      return {
        trend: { direction: 'stable', strength: 0 },
        stability: 0.65 // Default value when we don't have enough price data
      };
    }

    // Check if the data points contain positive price values (negative or zero prices are invalid)
    const validPricePoints = history.filter(point => point.value > 0);
    if (validPricePoints.length < 2) {
      console.log('Price stability defaulting to 65% due to insufficient valid price points:', 
                 validPricePoints.length);
      return {
        trend: { direction: 'stable', strength: 0 },
        stability: 0.65 // Default due to invalid price data
      };
    }

    // Use only valid price points for analysis
    const normalizedHistory = validPricePoints.map(point => ({
      timestamp: point.timestamp,
      value: point.value / 100 // Convert to actual price
    }));
    
    // Sort by timestamp for temporal analysis
    const sortedHistory = [...normalizedHistory].sort((a, b) => a.timestamp - b.timestamp);
    
    // 1. Implement 30-day launch grace period
    const oldestTimestamp = sortedHistory[0].timestamp;
    const newestTimestamp = sortedHistory[sortedHistory.length - 1].timestamp;
    const listingAgeInDays = (newestTimestamp - oldestTimestamp) / (1000 * 60 * 60 * 24);
    
    let historyToAnalyze = sortedHistory;
    
    // If listing is less than a year old, apply grace period
    if (listingAgeInDays < 365) {
      const graceEndTimestamp = oldestTimestamp + (30 * 24 * 60 * 60 * 1000); // 30 days in ms
      historyToAnalyze = sortedHistory.filter(point => point.timestamp >= graceEndTimestamp);
      
      // If after filtering the grace period we have too few points, use original data
      if (historyToAnalyze.length < 5) {
        historyToAnalyze = sortedHistory;
      }
    }
    
    // 2. Exclude temporary price deviations (less than 3 days)
    const priceBuckets: {[key: string]: Array<{timestamp: number, value: number}>} = {};
    
    // Group prices into buckets (rounded to nearest dollar for simplicity)
    historyToAnalyze.forEach(point => {
      const priceBucket = Math.round(point.value);
      if (!priceBuckets[priceBucket]) {
        priceBuckets[priceBucket] = [];
      }
      priceBuckets[priceBucket].push(point);
    });
    
    // Filter out price points that don't have sustained periods (3+ days)
    const sustainedPricePoints = [];
    Object.keys(priceBuckets).forEach(bucket => {
      const points = priceBuckets[bucket];
      if (points.length < 2) {
        // If only one data point, can't determine duration
        sustainedPricePoints.push(points[0]);
      } else {
        // Sort points by timestamp
        const sortedPoints = [...points].sort((a, b) => a.timestamp - b.timestamp);
        
        // Check for any sustained periods (3+ days)
        let hasSustainedPeriod = false;
        
        for (let i = 0; i < sortedPoints.length - 1; i++) {
          const duration = (sortedPoints[i+1].timestamp - sortedPoints[i].timestamp) / (1000 * 60 * 60 * 24);
          if (duration >= 3) {
            hasSustainedPeriod = true;
            break;
          }
        }
        
        // If we find a sustained period, add all points from this bucket
        if (hasSustainedPeriod) {
          sustainedPricePoints.push(...points);
        } else {
          // If no sustained period, just add median point to represent this price band
          const medianPoint = sortedPoints[Math.floor(sortedPoints.length / 2)];
          sustainedPricePoints.push(medianPoint);
        }
      }
    });
    
    // Ensure we have enough data points after filtering
    const finalPricePoints = sustainedPricePoints.length >= 5 ? 
                           sustainedPricePoints : historyToAnalyze;
    
    // Extract values for analysis
    const values = finalPricePoints.map(point => point.value);
    
    console.log('Price analysis for product with data points:', {
      totalPoints: history.length,
      validPoints: validPricePoints.length,
      afterGracePeriod: historyToAnalyze.length,
      afterSustainedFilter: finalPricePoints.length,
      minPrice: Math.min(...values),
      maxPrice: Math.max(...values),
      avgPrice: values.reduce((sum, val) => sum + val, 0) / values.length,
      listingAgeInDays: listingAgeInDays.toFixed(1)
    });
    
    const trend = this.calculateTrend(values);
    
    // Calculate price range ratio - key factor for variation
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const minPrice = Math.min(...values);
    const maxPrice = Math.max(...values);
    const priceRangeRatio = mean > 0 ? (maxPrice - minPrice) / mean : 0;
    
    console.log('Price stability calculation:', {
      priceRangeRatio: priceRangeRatio.toFixed(3),
      minPrice: minPrice.toFixed(2),
      maxPrice: maxPrice.toFixed(2),
      meanPrice: mean.toFixed(2)
    });
    
    // Adjust calculation for new formula
    let stabilityScore = 0;
    
    if (priceRangeRatio === 0) {
      stabilityScore = 1.0; // Perfect stability (no variation at all)
    } else if (priceRangeRatio < 0.01) {
      stabilityScore = 0.97; // Near perfect (less than 1% variation)
    } else if (priceRangeRatio < 0.03) {
      stabilityScore = 0.93; // Excellent (1-3% variation)
    } else if (priceRangeRatio < 0.05) {
      stabilityScore = 0.9; // Very stable (3-5% variation)
    } else if (priceRangeRatio < 0.1) {
      stabilityScore = 0.85; // Stable (5-10%)
    } else if (priceRangeRatio < 0.15) {
      stabilityScore = 0.78; // Mostly stable (10-15%)
    } else if (priceRangeRatio < 0.20) {
      stabilityScore = 0.73; // Somewhat stable (15-20%)
    } else if (priceRangeRatio < 0.25) {
      stabilityScore = 0.68; // Moderate (20-25%)
    } else if (priceRangeRatio < 0.30) {
      stabilityScore = 0.63; // Somewhat variable (25-30%)
    } else if (priceRangeRatio < 0.40) {
      stabilityScore = 0.57; // Variable (30-40%)
    } else if (priceRangeRatio < 0.50) {
      stabilityScore = 0.50; // Highly variable (40-50%)
    } else if (priceRangeRatio < 0.75) {
      stabilityScore = 0.43; // Unstable (50-75%)
    } else {
      stabilityScore = 0.35; // Very unstable (>75%)
    }
    
    // Add boost for new listings (less than 90 days)
    if (listingAgeInDays < 90) {
      const newListingBoost = Math.max(0, 0.25 - (listingAgeInDays / 90) * 0.25);
      stabilityScore = Math.min(0.95, stabilityScore + newListingBoost);
      console.log(`Applied new listing boost of ${newListingBoost.toFixed(2)} for ${listingAgeInDays.toFixed(0)} day old listing`);
    }
    
    // Add small randomization to avoid identical scores, but only for non-perfect stability
    let finalScore = stabilityScore;
    let randomFactor = 0;
    
    if (priceRangeRatio > 0) {
      randomFactor = Math.random() * 0.03 - 0.015; // ±1.5%
      finalScore = Math.max(0.35, Math.min(0.99, stabilityScore + randomFactor));
    }
    
    console.log('Final Price stability calculation:', {
      baseScore: stabilityScore.toFixed(2),
      randomFactor: randomFactor.toFixed(3),
      finalScore: finalScore.toFixed(2),
      finalPercent: (finalScore * 100).toFixed(1) + '%',
      appliedGracePeriod: listingAgeInDays < 365,
      appliedSustainedFilter: sustainedPricePoints.length >= 5
    });

    return {
      trend: {
        direction: trend.direction,
        strength: trend.strength
      },
      stability: finalScore
    };
  },

  calculateTrend(values: number[]): { direction: string; strength: number; confidence: number; } {
    const first = values.slice(0, Math.floor(values.length / 2));
    const second = values.slice(Math.floor(values.length / 2));

    const avgFirst = first.reduce((sum, val) => sum + val, 0) / first.length;
    const avgSecond = second.reduce((sum, val) => sum + val, 0) / second.length;

    const change = (avgSecond - avgFirst) / avgFirst;
    const strength = Math.min(Math.abs(change), 1);

    return {
      direction: change > 0.05 ? 'up' : change < -0.05 ? 'down' : 'stable',
      strength,
      confidence: 0.8
    };
  },

  calculateStability(values: number[]): number {
    if (values.length < 2) return 1;

    // Calculate mean and std deviation
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    // For BSR, consistency within a good range is more important than absolute stability
    
    // Check if values are consistently in good ranges - this should have more weight
    const percentUnder50k = values.filter(val => val < 50000).length / values.length;
    const percentUnder100k = values.filter(val => val < 100000).length / values.length;
    
    // If BSR has NEVER gone below 50k, give a very low stability score
    // This indicates it has never had good sales, so it shouldn't be considered "stable" in a positive way
    if (percentUnder50k === 0) {
      return 0.1; // Very low stability score for products that never achieve good BSR
    }
    
    // Calculate coefficient of variation but with reduced penalty for good BSR ranges
    const cov = stdDev / mean;
    
    // Base stability score with reduced penalty for variation
    // Lower weighting of raw statistical stability (was too sensitive to normal fluctuations)
    let stabilityScore = Math.max(0, 1 - (cov / 3));
    
    // Heavily boost score for consistently staying in good BSR ranges
    // This is the most important factor for BSR stability in practice
    if (percentUnder50k > 0.95) { // 95%+ of time under 50k
        stabilityScore = Math.max(stabilityScore, 0.85);  // Minimum 85% stability
        stabilityScore = Math.min(1, stabilityScore + 0.15); // Can go up to 100%
    } else if (percentUnder50k > 0.9) { // 90-95% of time under 50k
        stabilityScore = Math.max(stabilityScore, 0.75);  // Minimum 75% stability
        stabilityScore = Math.min(1, stabilityScore + 0.10); // Can go up to 85%
    } else if (percentUnder50k > 0.8) { // 80-90% of time under 50k
        stabilityScore = Math.max(stabilityScore, 0.65);  // Minimum 65% stability
        stabilityScore = Math.min(1, stabilityScore + 0.05); // Can go up to 70%
    } else if (percentUnder100k > 0.9) { // 90% of time under 100k
        stabilityScore = Math.max(stabilityScore, 0.60);  // Minimum 60% stability
    } else if (percentUnder50k > 0.5) { // At least half the time under 50k
        stabilityScore = Math.max(stabilityScore, 0.40);  // Some stability
    } else if (percentUnder100k > 0.5) { // At least half the time under 100k
        stabilityScore = Math.max(stabilityScore, 0.30);  // Minimal stability
    } else {
        // If it rarely gets into good BSR ranges, cap the stability score
        stabilityScore = Math.min(stabilityScore, 0.20);
    }
    
    // Ensure seasonal improvements aren't penalized
    const seasonalityAdjustment = this.detectSeasonalImprovements(values);
    stabilityScore = Math.min(1, stabilityScore + seasonalityAdjustment);
    
    console.log('BSR Stability Calculation:', {
        mean,
        stdDev,
        cov,
        percentUnder50k,
        percentUnder100k,
        rawStabilityScore: Math.max(0, 1 - (cov / 3)),
        consistencyBonus: percentUnder50k > 0.95 ? 0.15 : 
                          percentUnder50k > 0.9 ? 0.10 : 
                          percentUnder50k > 0.8 ? 0.05 : 0,
        seasonalityAdjustment,
        finalScore: stabilityScore
    });
    
    return stabilityScore;
  },

  detectSeasonalImprovements(values: number[]): number {
    if (values.length < 60) return 0; // Need sufficient data
    
    // Simple detection of Q4 improvements
    // Group data into quarters and check if Q4 has significantly better (lower) BSR
    const sortedValues = [...values].sort((a, b) => a - b);
    const q1Value = sortedValues[Math.floor(values.length * 0.25)];
    const medianValue = sortedValues[Math.floor(values.length * 0.5)];
    
    // Check if the bottom 25% (best BSR values) are significantly better than median
    const hasSignificantImprovements = q1Value < medianValue * 0.5;
    
    // If we detect significant seasonal improvements, provide a small boost
    return hasSignificantImprovements ? 0.15 : 0;
  },

  detectSeasonality(history: Array<{ timestamp: number; value: number }>): boolean {
    // Basic seasonality detection - look for recurring patterns
    // This is a simplified implementation
    return false;
  },

  analyzeCompetitivePosition(product: any, bsrHistory: Array<{ timestamp: number; value: number }>) {
    const avgBSR = bsrHistory.reduce((sum, point) => sum + point.value, 0) / bsrHistory.length;
    const score = Math.max(1, Math.min(10, 10 - Math.log10(avgBSR)));

    return {
      score,
      factors: [
        `Average BSR: ${Math.round(avgBSR).toLocaleString()}`,
        `Score based on BSR performance`
      ]
    };
  },

  calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    
    // Normalize volatility to a 0-1 scale using coefficient of variation
    const coefficientOfVariation = stdDev / mean;
    return Math.min(coefficientOfVariation / 2, 1); // Divide by 2 to make it less sensitive
  },
  getEmptyTimelineScore(): BSRTimelineScore {
    return {
      score: 0,
      finalScore: 0,
      timeInRanges: {
        under10k: 0,
        under25k: 0,
        under50k: 0,
        under100k: 0,
        under250k: 0,
        above250k: 0
      },
      volatilityPenalty: 0
    };
  },

  getStabilityDetails(stabilityScore: number): { category: string; color: string } {
    const score = stabilityScore * 100; // Convert to percentage
    
    if (score >= 90) return { 
      category: 'Exceptionally Stable',
      color: 'text-emerald-500'
    };
    if (score >= 75) return { 
      category: 'Very Stable',
      color: 'text-green-500'
    };
    if (score >= 60) return { 
      category: 'Moderately Stable',
      color: 'text-yellow-500'
    };
    if (score >= 40) return { 
      category: 'Somewhat Volatile',
      color: 'text-orange-500'
    };
    return { 
      category: 'Highly Volatile',
      color: 'text-red-500'
    };
  }
};