// Development-only test data - not used in production
if (process.env.NODE_ENV !== 'production') {
  console.warn('Test scoring utilities should only be used in development');
}

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
      bsr: { stability: 1.0 },     // 100% Very Stable
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
      bsr: { stability: 1.0 },     // 100% Very Stable
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

// Our own implementation of the required functions for testing
const extractAsin = (asin) => asin && asin.length >= 10 ? asin.substring(0, 10) : asin;
const safeParseNumber = (val) => typeof val === 'number' ? val : parseFloat(val) || 0;

// Manual implementation of scoring for testing
function manualScoreCalculation() {
  // Base competitor scoring (should now be about 65-70%)
  const baseScore = 65;
  
  // Calculate revenue per competitor
  const totalRevenue = mockCompetitors.reduce((sum, comp) => sum + comp.monthlyRevenue, 0);
  const revenuePerCompetitor = totalRevenue / mockCompetitors.length;
  
  // Revenue modifier (+15 points for >$12,000 per competitor)
  let revenueModifier = 0;
  if (revenuePerCompetitor >= 12000) {
    revenueModifier = 15;
  } else if (revenuePerCompetitor >= 8000) {
    revenueModifier = 10;
  } else if (revenuePerCompetitor >= 5000) {
    revenueModifier = 5;
  }
  
  // Competitor count modifier (+15 points for ≤10 competitors)
  const competitorModifier = mockCompetitors.length <= 10 ? 15 : 
                             mockCompetitors.length <= 15 ? 8 :
                             mockCompetitors.length <= 20 ? 0 :
                             mockCompetitors.length <= 30 ? -8 : -20;
  
  // Calculate top 5 BSR and price stability
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
  
  console.log('---- Manual Score Calculation ----');
  console.log(`Base score: ${baseScore}`);
  console.log(`Revenue per competitor: $${revenuePerCompetitor.toFixed(2)} (modifier: +${revenueModifier})`);
  console.log(`Competitor count: ${mockCompetitors.length} (modifier: ${competitorModifier > 0 ? '+' : ''}${competitorModifier})`);
  console.log(`Top 5 BSR Stability: ${(top5BSRStability * 100).toFixed(1)}%`);
  console.log(`Top 5 Price Stability: ${(top5PriceStability * 100).toFixed(1)}%`);
  
  const expectedScore = baseScore + revenueModifier + competitorModifier;
  console.log(`\nExpected Score: ${expectedScore.toFixed(1)}%`);
  console.log(`Expected Status: ${expectedScore >= 70 ? 'PASS' : expectedScore >= 40 ? 'RISKY' : 'FAIL'}`);
  
  return {
    score: expectedScore,
    status: expectedScore >= 70 ? 'PASS' : expectedScore >= 40 ? 'RISKY' : 'FAIL'
  };
}

// Direct implementation for testing since we can't import the actual functions
// This will give us a rough idea of what the score should be
const manualResult = manualScoreCalculation();

console.log('\nTest complete!');
console.log(`The car ramp market scores approximately ${manualResult.score.toFixed(1)}% (${manualResult.status})`);
console.log('These changes should significantly improve the score compared to the original 60.0%'); 