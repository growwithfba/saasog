// Test script to verify V4 competitor score calculation with weights

// MetricScoring functions
const MetricScoring = {
  price: (value) => {
    if (value < 20 || value > 75) return 1;
    return 10;
  },
  bsr: (value) => {
    if (value < 1000) return 10;
    if (value <= 5000) return 9;
    if (value <= 10000) return 8;
    if (value <= 20000) return 7;
    if (value <= 30000) return 6;
    if (value <= 50000) return 5;
    if (value <= 75000) return 4;
    if (value <= 100000) return 3;
    if (value <= 150000) return 2;
    return 1;
  },
  listingScore: (value) => {
    if (value === null) return 0; // Skip if N/A
    if (value <= 30) return 1;
    if (value <= 60) return 2;
    if (value <= 120) return 3;
    if (value <= 180) return 4;
    if (value <= 240) return 5;
    if (value <= 300) return 6;
    if (value <= 400) return 7;
    if (value <= 500) return 8;
    if (value <= 600) return 9;
    return 10;
  },
  monthlySales: (value) => {
    if (value <= 30) return 1;
    if (value <= 60) return 2;
    if (value <= 120) return 3;
    if (value <= 180) return 4;
    if (value <= 240) return 5;
    if (value <= 300) return 6;
    if (value <= 400) return 7;
    if (value <= 500) return 8;
    if (value <= 600) return 9;
    return 10;
  },
  monthlyRevenue: (value) => {
    if (value >= 10000) return 10;
    if (value >= 9000) return 9;
    if (value >= 7500) return 8;
    if (value >= 6000) return 7;
    if (value >= 5000) return 6;
    if (value >= 4000) return 5;
    if (value >= 3000) return 4;
    if (value >= 2500) return 3;
    if (value >= 1000) return 2;
    return 1;
  },
  rating: (value) => {
    if (value >= 4.9) return 10;
    if (value >= 4.8) return 9;
    if (value >= 4.6) return 8;
    if (value >= 4.4) return 7;
    if (value >= 4.0) return 6;
    if (value >= 3.8) return 5;
    if (value >= 3.6) return 4;
    if (value >= 3.4) return 3;
    if (value >= 3.0) return 2;
    return 1;
  },
  reviews: (value) => {
    if (value === 0) return 1;
    if (value < 10) return 2;
    if (value < 50) return 3;
    if (value < 100) return 4;
    if (value < 200) return 5;
    if (value < 300) return 6;
    if (value < 400) return 7;
    if (value < 500) return 8;
    return 10;
  },
  fulfillment: (value) => {
    if (value === "FBA") return 8;
    if (value === "Amazon") return 10;
    if (value === "FBM") return 1;
    return 0;
  }
};

// Safe parse number helper
const safeParseNumber = (value) => {
  if (typeof value === 'undefined') return 0;
  if (typeof value === 'number') return value;
  return parseFloat(value) || 0;
};

// Define weighting factors based on impact levels
const weights = {
  // HIGHEST IMPACT
  monthlySales: 2.0,
  reviews: 1.8,
  
  // MEDIUM IMPACT
  marketShare: 1.5,
  monthlyRevenue: 1.5,
  bsr: 1.3,
  rating: 1.3,
  reviewShare: 1.3,
  
  // LOWEST IMPACT
  price: 1.0,
  fulfillment: 0.8,
  listingScore: 0.8
};

// Calculate score function with weights
const calculateWeightedScore = (competitor) => {
  // Skip scoring if no competitor data
  if (!competitor) return "0.00";
  
  let weightedPoints = 0;
  let totalWeightPossible = 0;
  
  // Price score (1-10 points)
  const priceScore = MetricScoring.price(safeParseNumber(competitor.price || 0));
  weightedPoints += priceScore * weights.price;
  totalWeightPossible += 10 * weights.price;
  
  // BSR score (1-10 points)
  const bsrScore = MetricScoring.bsr(safeParseNumber(competitor.bsr || 999999));
  weightedPoints += bsrScore * weights.bsr;
  totalWeightPossible += 10 * weights.bsr;
  
  // Listing score (0-10 points) - Skip if N/A
  if (competitor.score !== null && competitor.score !== undefined) {
    const listingScore = MetricScoring.listingScore(safeParseNumber(competitor.score || null));
    weightedPoints += listingScore * weights.listingScore;
    totalWeightPossible += 10 * weights.listingScore;
  }
  
  // Monthly sales score (1-10 points)
  const salesScore = MetricScoring.monthlySales(safeParseNumber(competitor.monthlySales || 0));
  weightedPoints += salesScore * weights.monthlySales;
  totalWeightPossible += 10 * weights.monthlySales;
  
  // Monthly revenue score (1-10 points)
  const revenueScore = MetricScoring.monthlyRevenue(safeParseNumber(competitor.monthlyRevenue || 0));
  weightedPoints += revenueScore * weights.monthlyRevenue;
  totalWeightPossible += 10 * weights.monthlyRevenue;
  
  // Rating score (1-10 points)
  const ratingScore = MetricScoring.rating(safeParseNumber(competitor.rating || 0));
  weightedPoints += ratingScore * weights.rating;
  totalWeightPossible += 10 * weights.rating;
  
  // Reviews score (1-10 points)
  const reviewsScore = MetricScoring.reviews(safeParseNumber(competitor.reviews || 0));
  weightedPoints += reviewsScore * weights.reviews;
  totalWeightPossible += 10 * weights.reviews;
  
  // Market share (if available)
  if (competitor.marketShare !== undefined && competitor.marketShare !== null) {
    // Score market share on a scale of 1-10
    const marketShareValue = safeParseNumber(competitor.marketShare || 0);
    const marketShareScore = Math.min(10, Math.max(1, Math.ceil(marketShareValue / 3)));
    weightedPoints += marketShareScore * weights.marketShare;
    totalWeightPossible += 10 * weights.marketShare;
  }
  
  // Review share (if available)
  if (competitor.reviewShare !== undefined && competitor.reviewShare !== null) {
    // Score review share on a scale of 1-10
    const reviewShareValue = safeParseNumber(competitor.reviewShare || 0);
    const reviewShareScore = Math.min(10, Math.max(1, Math.ceil(reviewShareValue / 3)));
    weightedPoints += reviewShareScore * weights.reviewShare;
    totalWeightPossible += 10 * weights.reviewShare;
  }
  
  // Fulfillment score (0-10 points)
  const fulfillmentMethod = 
    (competitor.fulfillment || competitor.fulfillmentMethod || competitor.fulfilledBy || '').toString();
  const fulfillmentScore = MetricScoring.fulfillment(fulfillmentMethod);
  weightedPoints += fulfillmentScore * weights.fulfillment;
  totalWeightPossible += 10 * weights.fulfillment;
  
  // Calculate percentage score (adjust for any skipped metrics)
  const percentageScore = (weightedPoints / totalWeightPossible) * 100;
  
  return percentageScore.toFixed(2);
};

// Original calculate score function (unweighted) for comparison
const calculateScore = (competitor) => {
  // Skip scoring if no competitor data
  if (!competitor) return "0.00";
  
  let totalPoints = 0;
  let possiblePoints = 0;
  
  // Price score (1-10 points)
  const priceScore = MetricScoring.price(safeParseNumber(competitor.price || 0));
  totalPoints += priceScore;
  possiblePoints += 10;
  
  // BSR score (1-10 points)
  const bsrScore = MetricScoring.bsr(safeParseNumber(competitor.bsr || 999999));
  totalPoints += bsrScore;
  possiblePoints += 10;
  
  // Listing score (0-10 points) - Skip if N/A
  if (competitor.score !== null && competitor.score !== undefined) {
    const listingScore = MetricScoring.listingScore(safeParseNumber(competitor.score || null));
    totalPoints += listingScore;
    possiblePoints += 10;
  }
  
  // Monthly sales score (1-10 points)
  const salesScore = MetricScoring.monthlySales(safeParseNumber(competitor.monthlySales || 0));
  totalPoints += salesScore;
  possiblePoints += 10;
  
  // Monthly revenue score (1-10 points)
  const revenueScore = MetricScoring.monthlyRevenue(safeParseNumber(competitor.monthlyRevenue || 0));
  totalPoints += revenueScore;
  possiblePoints += 10;
  
  // Rating score (1-10 points)
  const ratingScore = MetricScoring.rating(safeParseNumber(competitor.rating || 0));
  totalPoints += ratingScore;
  possiblePoints += 10;
  
  // Reviews score (1-10 points)
  const reviewsScore = MetricScoring.reviews(safeParseNumber(competitor.reviews || 0));
  totalPoints += reviewsScore;
  possiblePoints += 10;
  
  // Fulfillment score (0-10 points)
  const fulfillmentMethod = 
    (competitor.fulfillment || competitor.fulfillmentMethod || competitor.fulfilledBy || '').toString();
  const fulfillmentScore = MetricScoring.fulfillment(fulfillmentMethod);
  totalPoints += fulfillmentScore;
  possiblePoints += 10;
  
  // Calculate percentage score (adjust for any skipped metrics)
  const percentageScore = (totalPoints / possiblePoints) * 100;
  
  return percentageScore.toFixed(2);
};

// Get competitor strength
const getCompetitorStrength = (score) => {
  if (score >= 60) {
    return { label: 'STRONG', color: 'red' };
  } else if (score >= 45) {
    return { label: 'DECENT', color: 'yellow' };
  } else {
    return { label: 'WEAK', color: 'green' };
  }
};

// Development-only test data
if (process.env.NODE_ENV === 'production') {
  console.warn('This file should not be used in production');
}

// GADFISH product data
const gadfish = { 
  ASIN: 'B0DHCNPZ29', 
  brand: 'GADFISH', 
  title: 'Basketball Rebounder Sturdy Metal Basketball Return Attachment', 
  category: 'Sports & Outdoors', 
  price: 39.99, 
  bsr: 17777, 
  score: null, 
  monthlySales: 226, 
  monthlyRevenue: 9038.00, 
  rating: 4.5, 
  reviews: 29, 
  fulfilledBy: 'FBA', 
  productType: 'SPONSORED', 
  sellerCountry: 'US', 
  grossProfit: 25.94, 
  dateFirstAvailable: '2024-09-18' 
};

// Calculate and display individual metric scores
console.log('GADFISH Individual Metric Scores:');
console.log('Price Score:', MetricScoring.price(gadfish.price), '/ 10');
console.log('BSR Score:', MetricScoring.bsr(gadfish.bsr), '/ 10');
console.log('Monthly Sales Score:', MetricScoring.monthlySales(gadfish.monthlySales), '/ 10');
console.log('Monthly Revenue Score:', MetricScoring.monthlyRevenue(gadfish.monthlyRevenue), '/ 10');
console.log('Rating Score:', MetricScoring.rating(gadfish.rating), '/ 10');
console.log('Reviews Score:', MetricScoring.reviews(gadfish.reviews), '/ 10');
console.log('Fulfillment Score:', MetricScoring.fulfillment(gadfish.fulfilledBy), '/ 10');

// Check if listing score is available
console.log('Listing Score:', gadfish.score !== null ? MetricScoring.listingScore(gadfish.score) : 'N/A (Skipped)');

// Original score calculation (unweighted)
const originalScore = parseFloat(calculateScore(gadfish));
const originalStrength = getCompetitorStrength(originalScore);

// Weighted score calculation
const weightedScore = parseFloat(calculateWeightedScore(gadfish));
const weightedStrength = getCompetitorStrength(weightedScore);

console.log('\n=== Original Score Calculation (Unweighted) ===');
const totalPoints = 
  MetricScoring.price(gadfish.price) +
  MetricScoring.bsr(gadfish.bsr) +
  MetricScoring.monthlySales(gadfish.monthlySales) +
  MetricScoring.monthlyRevenue(gadfish.monthlyRevenue) +
  MetricScoring.rating(gadfish.rating) +
  MetricScoring.reviews(gadfish.reviews) +
  MetricScoring.fulfillment(gadfish.fulfilledBy);
const possiblePoints = gadfish.score !== null ? 80 : 70;
console.log('Total Points:', totalPoints, '/', possiblePoints);
console.log('Percentage Score:', originalScore.toFixed(2) + '%');
console.log('Strength Rating:', originalStrength.label);

console.log('\n=== Weighted Score Calculation ===');
// Calculate weighted points for display
const weightedPoints = {
  price: MetricScoring.price(gadfish.price) * weights.price,
  bsr: MetricScoring.bsr(gadfish.bsr) * weights.bsr,
  monthlySales: MetricScoring.monthlySales(gadfish.monthlySales) * weights.monthlySales,
  monthlyRevenue: MetricScoring.monthlyRevenue(gadfish.monthlyRevenue) * weights.monthlyRevenue,
  rating: MetricScoring.rating(gadfish.rating) * weights.rating,
  reviews: MetricScoring.reviews(gadfish.reviews) * weights.reviews,
  fulfillment: MetricScoring.fulfillment(gadfish.fulfilledBy) * weights.fulfillment
};

const totalWeightedPoints = Object.values(weightedPoints).reduce((sum, val) => sum + val, 0);
const totalWeightPossible = (
  (10 * weights.price) +
  (10 * weights.bsr) +
  (10 * weights.monthlySales) +
  (10 * weights.monthlyRevenue) +
  (10 * weights.rating) +
  (10 * weights.reviews) +
  (10 * weights.fulfillment)
);

console.log('HIGH IMPACT:');
console.log('- Monthly Sales:', MetricScoring.monthlySales(gadfish.monthlySales), 'x', weights.monthlySales, '=', weightedPoints.monthlySales.toFixed(1));
console.log('- Reviews:', MetricScoring.reviews(gadfish.reviews), 'x', weights.reviews, '=', weightedPoints.reviews.toFixed(1));

console.log('\nMEDIUM IMPACT:');
console.log('- Monthly Revenue:', MetricScoring.monthlyRevenue(gadfish.monthlyRevenue), 'x', weights.monthlyRevenue, '=', weightedPoints.monthlyRevenue.toFixed(1));
console.log('- BSR:', MetricScoring.bsr(gadfish.bsr), 'x', weights.bsr, '=', weightedPoints.bsr.toFixed(1));
console.log('- Rating:', MetricScoring.rating(gadfish.rating), 'x', weights.rating, '=', weightedPoints.rating.toFixed(1));

console.log('\nLOW IMPACT:');
console.log('- Price:', MetricScoring.price(gadfish.price), 'x', weights.price, '=', weightedPoints.price.toFixed(1));
console.log('- Fulfillment:', MetricScoring.fulfillment(gadfish.fulfilledBy), 'x', weights.fulfillment, '=', weightedPoints.fulfillment.toFixed(1));

console.log('\nTotal Weighted Points:', totalWeightedPoints.toFixed(1), '/', totalWeightPossible.toFixed(1));
console.log('Weighted Percentage Score:', weightedScore.toFixed(2) + '%');
console.log('Weighted Strength Rating:', weightedStrength.label);

// After the GADFISH test
console.log('\n=== TESTING MISSING VALUES HANDLING ===');

// Create a test competitor without marketShare and reviewShare
const testCompetitor = { 
  ASIN: 'B0TEST123', 
  brand: 'TestBrand', 
  title: 'Test Product With Missing Values', 
  category: 'Test Category', 
  price: 45.99, 
  bsr: 25000, 
  score: null, 
  monthlySales: 150, 
  monthlyRevenue: 6898.50, 
  rating: 4.2, 
  reviews: 45, 
  fulfilledBy: 'FBA'
};

// Test with missing values
console.log('Testing competitor without marketShare and reviewShare:');
const missingValuesScore = calculateWeightedScore(testCompetitor);
console.log('Weighted Score:', missingValuesScore);
console.log('Strength Rating:', getCompetitorStrength(parseFloat(missingValuesScore)).label);

// Create another test with undefined values
const testCompetitorUndefined = { 
  ...testCompetitor,
  marketShare: undefined,
  reviewShare: undefined
};

// Test with undefined values
console.log('\nTesting competitor with undefined marketShare and reviewShare:');
const undefinedValuesScore = calculateWeightedScore(testCompetitorUndefined);
console.log('Weighted Score:', undefinedValuesScore);
console.log('Strength Rating:', getCompetitorStrength(parseFloat(undefinedValuesScore)).label);

// Test with null values
const testCompetitorNull = { 
  ...testCompetitor,
  marketShare: null,
  reviewShare: null
};

// Test with null values
console.log('\nTesting competitor with null marketShare and reviewShare:');
const nullValuesScore = calculateWeightedScore(testCompetitorNull);
console.log('Weighted Score:', nullValuesScore);
console.log('Strength Rating:', getCompetitorStrength(parseFloat(nullValuesScore)).label); 