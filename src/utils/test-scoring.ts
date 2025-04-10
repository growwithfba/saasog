import { calculateMarketScore, ScoringWeights } from './scoring';

// Mock the car ramps market data from the screenshots
const mockCompetitors = [
  {
    asin: "B01KZ5X6Z0",
    title: "MaxxHaul 50516 4400 lb Capacity Low Profile Car Ramp",
    price: 38.88,
    monthlySales: 180,
    monthlyRevenue: 7000,
    rating: 4.3,
    reviews: 500,
    score: 8.2,
    marketShare: 20,
    bsr: 9178,
    fulfillment: 'FBA'
  },
  {
    asin: "B07DNVYB92",
    title: "VEVOR 1Piece Vehicle Ramp 20000 lbs 9 Ton Capacity",
    price: 32.03,
    monthlySales: 150,
    monthlyRevenue: 4800,
    rating: 4.2,
    reviews: 320,
    score: 7.8,
    marketShare: 15,
    bsr: 13132,
    fulfillment: 'FBA'
  },
  {
    asin: "B07S8TQRN3",
    title: "MaxxHaul 50962 Heavy Duty Curb Ramp Portable Poly",
    price: 49.90,
    monthlySales: 130,
    monthlyRevenue: 6500,
    rating: 4.5,
    reviews: 280,
    score: 7.5,
    marketShare: 18,
    bsr: 18739,
    fulfillment: 'FBA'
  },
  {
    asin: "B07K87KV95",
    title: "ROBLOCK Car Ramps for Lift and Vehicle Maintenance",
    price: 27.31,
    monthlySales: 100,
    monthlyRevenue: 2730,
    rating: 4.1,
    reviews: 180,
    score: 7.0,
    marketShare: 12,
    bsr: 9316,
    fulfillment: 'FBA'
  },
  {
    asin: "B083J8DMHB",
    title: "BISupply Car Service Ramps Set",
    price: 42.99,
    monthlySales: 95,
    monthlyRevenue: 4084,
    rating: 4.2,
    reviews: 210,
    score: 6.8,
    marketShare: 10,
    bsr: 21500,
    fulfillment: 'FBA'
  },
  {
    asin: "B07GQ9GT6N",
    title: "BUNKERWALL Low Profile Car Service Ramps",
    price: 38.95,
    monthlySales: 85,
    monthlyRevenue: 3311,
    rating: 4.3,
    reviews: 150,
    score: 6.5,
    marketShare: 8,
    bsr: 22700,
    fulfillment: 'FBA'
  },
  {
    asin: "B01N1ZOZ8I",
    title: "RhinoGear RhinoRamps MAX Vehicle Ramps",
    price: 52.35,
    monthlySales: 80,
    monthlyRevenue: 4188,
    rating: 4.4,
    reviews: 190,
    score: 7.1,
    marketShare: 7,
    bsr: 25300,
    fulfillment: 'FBA'
  },
  {
    asin: "B09B89DSB2",
    title: "Race Ramps RR-40 40 Inch Race Ramp",
    price: 35.99,
    monthlySales: 70,
    monthlyRevenue: 2519,
    rating: 4.0,
    reviews: 120,
    score: 6.0,
    marketShare: 6,
    bsr: 29700,
    fulfillment: 'FBM'
  },
  {
    asin: "B08TM8QTHQ",
    title: "Camco Drive-On Tri-Leveler",
    price: 31.25,
    monthlySales: 65,
    monthlyRevenue: 2031,
    rating: 4.2,
    reviews: 140,
    score: 6.2,
    marketShare: 4,
    bsr: 34500,
    fulfillment: 'FBM'
  }
];

// Create mock Keepa data with the stability metrics from the screenshots
const mockKeepaResults = [
  {
    asin: "B01KZ5X6Z0",
    analysis: {
      bsr: { stability: 1.0 },    // 100% Very Stable
      price: { stability: 0.617 }, // 61.7% Moderate
      competitivePosition: { score: 8.5 }
    }
  },
  {
    asin: "B07DNVYB92",
    analysis: {
      bsr: { stability: 0.568 },   // 56.8% Somewhat Stable
      price: { stability: 0.904 }, // 90.4% Very Stable
      competitivePosition: { score: 7.8 }
    }
  },
  {
    asin: "B07S8TQRN3",
    analysis: {
      bsr: { stability: 0.849 },   // 84.9% Very Stable
      price: { stability: 0.934 }, // 93.4% Very Stable
      competitivePosition: { score: 8.2 }
    }
  },
  {
    asin: "B07K87KV95",
    analysis: {
      bsr: { stability: 1.0 },    // 100% Very Stable
      price: { stability: 0.561 }, // 56.1% Variable
      competitivePosition: { score: 7.6 }
    }
  },
  // Default values for the rest
  {
    asin: "B083J8DMHB",
    analysis: {
      bsr: { stability: 0.75 },
      price: { stability: 0.7 },
      competitivePosition: { score: 7.0 }
    }
  },
  {
    asin: "B07GQ9GT6N",
    analysis: {
      bsr: { stability: 0.7 },
      price: { stability: 0.65 },
      competitivePosition: { score: 6.8 }
    }
  },
  {
    asin: "B01N1ZOZ8I",
    analysis: {
      bsr: { stability: 0.68 },
      price: { stability: 0.72 },
      competitivePosition: { score: 7.1 }
    }
  },
  {
    asin: "B09B89DSB2",
    analysis: {
      bsr: { stability: 0.65 },
      price: { stability: 0.68 },
      competitivePosition: { score: 6.5 }
    }
  },
  {
    asin: "B08TM8QTHQ",
    analysis: {
      bsr: { stability: 0.62 },
      price: { stability: 0.66 },
      competitivePosition: { score: 6.2 }
    }
  }
];

// Run the score calculation and log the results
function runScoringTest() {
  // Compute the score
  const marketScoreResult = calculateMarketScore(mockCompetitors, mockKeepaResults);
  
  // Calculate total revenue and revenue per competitor
  const totalRevenue = mockCompetitors.reduce((sum, comp) => sum + comp.monthlyRevenue, 0);
  const revenuePerCompetitor = totalRevenue / mockCompetitors.length;
  
  // Get the top 5 competitors' BSR and price stability
  const top5Comps = [...mockCompetitors]
    .sort((a, b) => b.monthlySales - a.monthlySales)
    .slice(0, 5);
    
  const top5BSRStability = top5Comps
    .map(comp => {
      const keepaData = mockKeepaResults.find(k => k.asin === comp.asin);
      return keepaData?.analysis?.bsr?.stability || 0.5;
    })
    .reduce((sum, val) => sum + val, 0) / 5;
    
  const top5PriceStability = top5Comps
    .map(comp => {
      const keepaData = mockKeepaResults.find(k => k.asin === comp.asin);
      return keepaData?.analysis?.price?.stability || 0.5;
    })
    .reduce((sum, val) => sum + val, 0) / 5;
  
  // Log the results
  console.log('---- Market Score Test Results ----');
  console.log(`Final Score: ${marketScoreResult.score.toFixed(1)}%`);
  console.log(`Status: ${marketScoreResult.status}`);
  console.log('\nMarket Metrics:');
  console.log(`Total Competitors: ${mockCompetitors.length}`);
  console.log(`Total Revenue: $${totalRevenue.toFixed(2)}`);
  console.log(`Revenue per Competitor: $${revenuePerCompetitor.toFixed(2)}`);
  console.log(`Top 5 BSR Stability: ${(top5BSRStability * 100).toFixed(1)}%`);
  console.log(`Top 5 Price Stability: ${(top5PriceStability * 100).toFixed(1)}%`);
  
  console.log('\nScoring Weights:');
  Object.entries(ScoringWeights).forEach(([key, value]) => {
    console.log(`${key}: ${(value * 100).toFixed(1)}%`);
  });
  
  return marketScoreResult;
}

export default runScoringTest; 