'use client';

import { useState } from 'react';
import { 
  ExternalLink, TrendingUp, Users, BarChart3, Award, Globe, Package, 
  DollarSign, ShoppingCart, Star, Calendar, MapPin, Copy, Check,
  Info, Layers, Activity, AlertCircle, FileText, PieChart
} from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/formatters';
import { calculateScore, getCompetitorStrength } from '@/utils/scoring';
import { getMetricColor } from '@/utils/metricColors';
import { StatTile } from '../components/StatTile';
import { InfoRow } from '../components/InfoRow';
import { Badge } from '../components/Badge';
import { SegmentedBar } from '../components/SegmentedBar';
import { Tooltip } from '../components/Tooltip';
import { ValueText } from '../components/ValueText';

interface ProductInfoTabProps {
  productData: any;
}

// Helper to calculate listing age in months
const calculateListingAge = (dateStr?: string): number | null => {
  if (!dateStr || dateStr === 'Unknown' || dateStr === 'N/A') return null;
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30)); // Age in months
  } catch {
    return null;
  }
};

// Helper to format listing age (always in months)
const formatListingAge = (age: number | null | string | undefined): string => {
  if (age === null || age === undefined) return 'Not available';
  if (typeof age === 'string') {
    if (age === 'Unknown' || age === 'N/A') return 'Not available';
    // Try to parse if it's a string number
    const parsed = parseFloat(age);
    if (!isNaN(parsed)) {
      return `${Math.round(parsed)} months`;
    }
    return age;
  }
  return `${Math.round(age)} months`;
};

export function ProductInfoTab({ productData }: ProductInfoTabProps) {
  const [copiedAsin, setCopiedAsin] = useState(false);
  
  const competitors = productData?.productData?.competitors || [];
  const keepaResults = productData?.keepaResults || [];
  const marketScore = productData?.marketScore || { 
    score: productData?.score || 0, 
    status: productData?.status || 'RISKY' 
  };
  const distributions = productData?.productData?.distributions || {};

  // Get product ASIN and data
  const productAsin = productData?.asin || competitors[0]?.asin || 'N/A';
  const productAsinData = keepaResults.find((r: any) => r.asin === productAsin) || 
                         competitors.find((c: any) => c.asin === productAsin) || 
                         competitors[0] || {};

  // Extract Research Page CSV fields
  const researchData = {
    asin: productAsin,
    brand: productData?.brand || productAsinData?.brand || competitors[0]?.brand || 'Not available',
    title: productData?.title || productAsinData?.title || competitors[0]?.title || 'Not available',
    productTitle: productData?.title || productAsinData?.title || competitors[0]?.title || 'Not available',
    category: productData?.category || productAsinData?.category || competitors[0]?.category || 'Not available',
    price: productAsinData?.price || competitors[0]?.price || null,
    bsr: productAsinData?.bsr || competitors[0]?.bsr || null,
    monthlySales: productAsinData?.monthlySales || competitors[0]?.monthlySales || null,
    monthlyRevenue: productAsinData?.monthlyRevenue || competitors[0]?.monthlyRevenue || null,
    rating: productAsinData?.rating || competitors[0]?.rating || null,
    listingAge: calculateListingAge(productAsinData?.dateFirstAvailable || competitors[0]?.dateFirstAvailable),
    sellerCountry: productAsinData?.sellerCountry || competitors[0]?.sellerCountry || productAsinData?.soldBy || competitors[0]?.soldBy || 'Not available',
  };

  // Calculate product-level vetting data
  const productScore = productAsinData?.score !== undefined 
    ? parseFloat(String(productAsinData.score))
    : (productAsinData?.monthlyRevenue ? calculateScore(productAsinData) : null);
  
  const competitorStrength = productScore !== null && typeof productScore === 'number'
    ? getCompetitorStrength(productScore)
    : null;

  // Find product rank among competitors
  const sortedCompetitors = [...competitors].sort((a: any, b: any) => {
    const scoreA = a.score !== undefined ? parseFloat(String(a.score)) : calculateScore(a);
    const scoreB = b.score !== undefined ? parseFloat(String(b.score)) : calculateScore(b);
    const numA = typeof scoreA === 'number' ? scoreA : 0;
    const numB = typeof scoreB === 'number' ? scoreB : 0;
    return numB - numA;
  });
  
  const productRank = productAsin !== 'N/A' 
    ? sortedCompetitors.findIndex((c: any) => c.asin === productAsin) + 1
    : null;

  // Calculate market share and review share for this product
  const totalMarketCap = competitors.reduce((sum: number, c: any) => sum + (c.monthlyRevenue || 0), 0);
  const productMarketShare = totalMarketCap > 0 && researchData.monthlyRevenue
    ? (researchData.monthlyRevenue / totalMarketCap) * 100
    : null;

  const totalReviews = competitors.reduce((sum: number, c: any) => {
    const reviews = typeof c.reviews === 'string' ? parseFloat(c.reviews) : (c.reviews || 0);
    return sum + reviews;
  }, 0);
  const productReviews = typeof productAsinData.reviews === 'string' 
    ? parseFloat(productAsinData.reviews) 
    : (productAsinData.reviews || 0);
  const productReviewShare = totalReviews > 0 && productReviews > 0
    ? (productReviews / totalReviews) * 100
    : null;

  // Calculate market aggregate data
  const marketCap = totalMarketCap;
  const totalCompetitors = competitors.length;
  const revenuePerCompetitor = totalCompetitors > 0 ? marketCap / totalCompetitors : 0;

  // Calculate averages
  const validRatings = competitors.filter((c: any) => c.rating && c.rating > 0).map((c: any) => c.rating);
  const averageRating = validRatings.length > 0
    ? validRatings.reduce((sum: number, r: number) => sum + r, 0) / validRatings.length
    : null;

  const validReviews = competitors.map((c: any) => {
    return typeof c.reviews === 'string' ? parseFloat(c.reviews) : (c.reviews || 0);
  });
  const averageReviews = validReviews.length > 0
    ? validReviews.reduce((sum: number, r: number) => sum + r, 0) / validReviews.length
    : null;

  // Calculate average listing age
  const listingAges = competitors
    .map((c: any) => calculateListingAge(c.dateFirstAvailable))
    .filter((age: number | null): age is number => age !== null);
  const averageListingAge = listingAges.length > 0
    ? listingAges.reduce((sum: number, age: number) => sum + age, 0) / listingAges.length
    : null;

  // Calculate distributions
  const calculateAgeDistribution = () => {
    const ageRanges = { mature: 0, established: 0, growing: 0, new: 0 };
    competitors.forEach((c: any) => {
      const age = calculateListingAge(c.dateFirstAvailable);
      if (age === null) return;
      if (age >= 24) ageRanges.mature++;
      else if (age >= 12) ageRanges.established++;
      else if (age >= 6) ageRanges.growing++;
      else ageRanges.new++;
    });
    const total = competitors.length || 1;
    return {
      mature: (ageRanges.mature / total) * 100,
      established: (ageRanges.established / total) * 100,
      growing: (ageRanges.growing / total) * 100,
      new: (ageRanges.new / total) * 100,
    };
  };

  const calculateFulfillmentDistribution = () => {
    const fulfillment = { fba: 0, fbm: 0, amazon: 0 };
    competitors.forEach((c: any) => {
      const method = (c.fulfillment || c.fulfilledBy || '').toLowerCase();
      if (method.includes('fba')) fulfillment.fba++;
      else if (method.includes('fbm')) fulfillment.fbm++;
      else if (method.includes('amazon')) fulfillment.amazon++;
    });
    const total = competitors.length || 1;
    return {
      fba: (fulfillment.fba / total) * 100,
      fbm: (fulfillment.fbm / total) * 100,
      amazon: (fulfillment.amazon / total) * 100,
    };
  };

  const calculateStrengthDistribution = () => {
    const strengths = { weak: 0, decent: 0, strong: 0 };
    competitors.forEach((c: any) => {
      const score = c.score !== undefined ? parseFloat(String(c.score)) : calculateScore(c);
      const numScore = typeof score === 'number' ? score : 0;
      const strength = getCompetitorStrength(numScore);
      if (strength.label === 'STRONG') strengths.strong++;
      else if (strength.label === 'DECENT') strengths.decent++;
      else strengths.weak++;
    });
    const total = competitors.length || 1;
    return {
      weak: (strengths.weak / total) * 100,
      decent: (strengths.decent / total) * 100,
      strong: (strengths.strong / total) * 100,
    };
  };

  const calculateSizeTierDistribution = () => {
    const sizeTiers: Record<string, number> = {};
    competitors.forEach((c: any) => {
      const tier = c.sizeTier || 'Unknown';
      sizeTiers[tier] = (sizeTiers[tier] || 0) + 1;
    });
    const total = competitors.length || 1;
    const result: Record<string, number> = {};
    Object.entries(sizeTiers).forEach(([tier, count]) => {
      result[tier] = (count / total) * 100;
    });
    return result;
  };

  const calculateChinaSellerPercentage = () => {
    const chinaSellers = competitors.filter((c: any) => {
      const country = (c.sellerCountry || c.soldBy || '').toLowerCase();
      return country.includes('china') || country.includes('cn');
    }).length;
    return competitors.length > 0 ? (chinaSellers / competitors.length) * 100 : 0;
  };

  const ageDistribution = distributions.age || calculateAgeDistribution();
  const fulfillmentDistribution = distributions.fulfillment || calculateFulfillmentDistribution();
  const strengthDistribution = calculateStrengthDistribution();
  const sizeTierDistribution = calculateSizeTierDistribution();
  const chinaSellerPercentage = calculateChinaSellerPercentage();

  // Copy ASIN handler
  const handleCopyAsin = async () => {
    if (productAsin === 'N/A') return;
    try {
      await navigator.clipboard.writeText(productAsin);
      setCopiedAsin(true);
      setTimeout(() => setCopiedAsin(false), 2000);
    } catch (err) {
      console.error('Failed to copy ASIN:', err);
    }
  };

  const amazonUrl = (asin: string) => `https://www.amazon.com/dp/${asin}`;

  // Get status color classes for Vetting Score
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'PASS': return { text: 'text-emerald-400', border: 'border-emerald-500/50', bg: 'bg-emerald-900/30' };
      case 'RISKY': return { text: 'text-amber-400', border: 'border-amber-500/50', bg: 'bg-amber-900/30' };
      case 'FAIL': return { text: 'text-red-400', border: 'border-red-500/50', bg: 'bg-red-900/30' };
      default: return { text: 'text-slate-400', border: 'border-slate-500/50', bg: 'bg-slate-900/30' };
    }
  };

  const statusColors = getStatusColor(marketScore.status);

  return (
    <div className="space-y-6">
      {/* Research Details Header Block with Vetting Result - Full Width */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-6 relative">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          {/* Left Side - Product Info */}
          <div className="flex-1 min-w-0">
            {/* Product Title - Full Width, Wraps */}
            <h2 className="text-2xl font-bold text-white mb-4 break-words">
              {researchData.productTitle}
            </h2>
            
            {/* Metadata Row - Brand, ASIN, Category */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {/* Brand */}
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300 font-medium">{researchData.brand}</span>
              </div>
              
              {/* Divider */}
              <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
              
              {/* ASIN with Link and Copy */}
              {productAsin !== 'N/A' ? (
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" />
                  <a
                    href={amazonUrl(productAsin)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-1.5 font-medium"
                  >
                    {productAsin}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    onClick={handleCopyAsin}
                    className="text-slate-400 hover:text-white transition-colors"
                    title="Copy ASIN"
                  >
                    {copiedAsin ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" />
                  <span className="text-slate-400">Not available</span>
                </div>
              )}
              
              {/* Divider */}
              <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
              
              {/* Category Badge */}
              <Badge label={researchData.category} variant="info" />
            </div>
          </div>

          {/* Right Side - Vetting Score */}
          <div className={`bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border-2 ${statusColors.border} shadow-xl p-4 backdrop-blur-sm lg:min-w-[260px] lg:max-w-[340px]`}>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-400 mb-1">Vetting Result</div>
                <div className={`text-3xl font-bold ${statusColors.text} mb-2`}>
                  {marketScore.status}
                </div>
                <div className="text-xs text-slate-500">
                  Market analysis score based on competitor data
                </div>
              </div>
              <div className="w-[140px] flex flex-col items-end gap-2 flex-shrink-0">
                <div className="relative w-full h-4 bg-slate-700/40 rounded-full overflow-hidden">
                  <div 
                    className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                      marketScore.status === 'PASS' ? 'bg-emerald-500' :
                      marketScore.status === 'RISKY' ? 'bg-amber-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, marketScore.score || 0))}%` }}
                  />
                </div>
                <div className={`text-2xl font-bold ${statusColors.text} text-right`}>
                  {marketScore.score?.toFixed(1) || '0.0'}%
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Product Snapshot - Key Metrics Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {(() => {
          const priceColor = getMetricColor('price', researchData.price);
          return (
            <StatTile
              label="Price"
              value={researchData.price ? formatCurrency(researchData.price) : 'N/A'}
              icon={<DollarSign className="w-4 h-4" />}
              valueClassName={priceColor.text}
            />
          );
        })()}
        {(() => {
          const revenueColor = getMetricColor('monthlyRevenue', researchData.monthlyRevenue);
          return (
            <StatTile
              label="Monthly Revenue"
              value={researchData.monthlyRevenue ? formatCurrency(researchData.monthlyRevenue) : 'N/A'}
              icon={<TrendingUp className="w-4 h-4" />}
              valueClassName={revenueColor.text}
            />
          );
        })()}
        {(() => {
          const salesColor = getMetricColor('monthlySales', researchData.monthlySales);
          return (
            <StatTile
              label="Monthly Sales"
              value={researchData.monthlySales ? formatNumber(researchData.monthlySales) : 'N/A'}
              icon={<ShoppingCart className="w-4 h-4" />}
              valueClassName={salesColor.text}
            />
          );
        })()}
        {(() => {
          const ratingColor = getMetricColor('rating', researchData.rating);
          return (
            <StatTile
              label="Rating"
              value={researchData.rating ? `${researchData.rating.toFixed(1)} ⭐` : 'N/A'}
              icon={<Star className="w-4 h-4" />}
              valueClassName={ratingColor.text}
            />
          );
        })()}
        {(() => {
          const bsrColor = getMetricColor('bsr', researchData.bsr);
          return (
            <Tooltip content="Lower BSR indicates higher sales velocity" className="contents">
              <StatTile
                label="BSR"
                value={researchData.bsr ? formatNumber(researchData.bsr) : 'N/A'}
                icon={<BarChart3 className="w-4 h-4" />}
                valueClassName={bsrColor.text}
              />
            </Tooltip>
          );
        })()}
        {(() => {
          const listingAgeColor = getMetricColor('listingAge', researchData.listingAge);
          return (
            <StatTile
              label="Listing Age"
              value={formatListingAge(researchData.listingAge)}
              icon={<Calendar className="w-4 h-4" />}
              valueClassName={listingAgeColor.text}
            />
          );
        })()}
      </div>

      {/* Main Content Grid - Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column */}
        <div className="space-y-6">

          {/* Vetting Summary - Product Level */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              Product Vetting Details
            </h3>
            <div className="space-y-0">
              <InfoRow
                label="Competitor Rank"
                value={
                  productRank !== null && totalCompetitors > 0 ? (
                    <>
                      <ValueText value={productRank} metricType="competitorRank" displayValue={productRank} />
                      <span className="text-slate-400"> of {totalCompetitors}</span>
                    </>
                  ) : (
                    'Not available'
                  )
                }
                icon={<Award className="w-4 h-4" />}
              />
              <InfoRow
                label="Competitor Strength"
                value={
                  competitorStrength ? (
                    <Badge
                      label={competitorStrength.label}
                      variant={competitorStrength.label === 'STRONG' ? 'strong' : competitorStrength.label === 'DECENT' ? 'decent' : 'weak'}
                    />
                  ) : (
                    'Not available'
                  )
                }
                icon={<Activity className="w-4 h-4" />}
              />
              <InfoRow
                label="Competitor Score"
                value={
                  productScore !== null && typeof productScore === 'number' ? (
                    <ValueText 
                      value={productScore} 
                      metricType="competitorScore" 
                      displayValue={`${productScore.toFixed(1)}%`}
                    />
                  ) : (
                    'Not available'
                  )
                }
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <InfoRow
                label="Market Share"
                value={
                  productMarketShare !== null ? (
                    <ValueText 
                      value={productMarketShare} 
                      metricType="marketShare" 
                      displayValue={`${productMarketShare.toFixed(2)}%`}
                    />
                  ) : (
                    'Not available'
                  )
                }
                icon={<PieChart className="w-4 h-4" />}
                helperText="Percentage of total market revenue"
              />
              <InfoRow
                label="Review Share"
                value={
                  productReviewShare !== null ? (
                    <ValueText 
                      value={productReviewShare} 
                      metricType="reviewShare" 
                      displayValue={`${productReviewShare.toFixed(2)}%`}
                    />
                  ) : (
                    'Not available'
                  )
                }
                icon={<Users className="w-4 h-4" />}
                helperText="Percentage of total market reviews"
              />
            </div>
          </div>
          
          {/* Additional Product Details */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Package className="w-5 h-5 text-blue-400" />
              Additional Details
            </h3>
            <div className="space-y-0">
              <InfoRow
                label="Seller Country"
                value={<Badge label={researchData.sellerCountry} variant="default" />}
                icon={<MapPin className="w-4 h-4" />}
              />
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Market Overview */}
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-emerald-400" />
              Market Overview
            </h3>
            <div className="space-y-0">
              <InfoRow
                label="Market Cap"
                value={
                  <div className="flex items-center gap-2">
                    <ValueText 
                      value={marketCap} 
                      metricType="marketCap" 
                      displayValue={formatCurrency(marketCap)}
                    />
                    <Tooltip content="Total monthly revenue of all competitors in the market">
                      <Info className="w-3.5 h-3.5" />
                    </Tooltip>
                  </div>
                }
                icon={<DollarSign className="w-4 h-4" />}
              />
              <InfoRow
                label="Total Competitors"
                value={
                  <ValueText 
                    value={totalCompetitors} 
                    metricType="totalCompetitors" 
                    displayValue={totalCompetitors}
                  />
                }
                icon={<Users className="w-4 h-4" />}
              />
              <InfoRow
                label="Revenue Per Competitor"
                value={
                  <div className="flex items-center gap-2">
                    <ValueText 
                      value={revenuePerCompetitor} 
                      metricType="revenuePerCompetitor" 
                      displayValue={formatCurrency(revenuePerCompetitor)}
                    />
                    <Tooltip content="Average monthly revenue per competitor in the market">
                      <Info className="w-3.5 h-3.5" />
                    </Tooltip>
                  </div>
                }
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <InfoRow
                label="Average Reviews"
                value={
                  averageReviews !== null ? (
                    <ValueText 
                      value={averageReviews} 
                      metricType="averageReviews" 
                      displayValue={formatNumber(Math.round(averageReviews))}
                    />
                  ) : (
                    'Not available'
                  )
                }
                icon={<Star className="w-4 h-4" />}
              />
              <InfoRow
                label="Average Rating"
                value={
                  averageRating !== null ? (
                    <ValueText 
                      value={averageRating} 
                      metricType="averageRating" 
                      displayValue={`${averageRating.toFixed(2)} ⭐`}
                    />
                  ) : (
                    'Not available'
                  )
                }
                icon={<Star className="w-4 h-4" />}
              />
              <InfoRow
                label="Average Listing Age"
                value={
                  averageListingAge !== null ? (
                    <ValueText 
                      value={averageListingAge} 
                      metricType="averageListingAge" 
                      displayValue={formatListingAge(averageListingAge)}
                    />
                  ) : (
                    'Not available'
                  )
                }
                icon={<Calendar className="w-4 h-4" />}
              />
              <InfoRow
                label="Market Size"
                value={
                  (() => {
                    const size = marketCap >= 100000
                      ? 'Large'
                      : marketCap >= 50000
                      ? 'Medium'
                      : marketCap >= 20000
                      ? 'Small'
                      : 'Very Small';
                    const color = marketCap >= 100000
                      ? 'text-emerald-400'
                      : marketCap >= 50000
                      ? 'text-blue-400'
                      : marketCap >= 20000
                      ? 'text-yellow-400'
                      : 'text-amber-400';
                    return <span className={color}>{size}</span>;
                  })()
                }
                icon={<BarChart3 className="w-4 h-4" />}
              />
              <InfoRow
                label="BSR Stability"
                value={
                  <div className="flex items-center gap-2">
                    <span>N/A</span>
                    <Tooltip content="BSR stability metrics require historical Keepa data">
                      <Info className="w-3.5 h-3.5" />
                    </Tooltip>
                  </div>
                }
                icon={<Activity className="w-4 h-4" />}
              />
              <InfoRow
                label="Price Volatility"
                value={
                  <div className="flex items-center gap-2">
                    <span>N/A</span>
                    <Tooltip content="Price volatility metrics require historical Keepa data">
                      <Info className="w-3.5 h-3.5" />
                    </Tooltip>
                  </div>
                }
                icon={<TrendingUp className="w-4 h-4" />}
              />
              <InfoRow
                label="China Sellers"
                value={
                  <ValueText 
                    value={chinaSellerPercentage} 
                    metricType="chinaSellers" 
                    displayValue={`${chinaSellerPercentage.toFixed(1)}%`}
                  />
                }
                icon={<MapPin className="w-4 h-4" />}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Distribution Visualizations - Bottom Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Market Age Distribution */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-blue-400" />
            Market Age Distribution
          </h3>
          <SegmentedBar
            segments={[
              { label: 'Mature (2+ Years)', value: ageDistribution.mature || 0, color: 'rgba(5, 150, 105, 0.6)' },
              { label: 'Established (1-2 Years)', value: ageDistribution.established || 0, color: 'rgba(37, 99, 235, 0.6)' },
              { label: 'Growing (6-12 Months)', value: ageDistribution.growing || 0, color: 'rgba(217, 119, 6, 0.6)' },
              { label: 'New (0-6 Months)', value: ageDistribution.new || 0, color: 'rgba(220, 38, 38, 0.6)' },
            ]}
            showLabels={true}
            showValues={true}
          />
        </div>

        {/* Fulfillment Distribution */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-purple-400" />
            Fulfillment Distribution
          </h3>
          <SegmentedBar
            segments={[
              { label: 'FBA', value: fulfillmentDistribution.fba || 0, color: 'rgba(37, 99, 235, 0.6)' },
              { label: 'FBM', value: fulfillmentDistribution.fbm || 0, color: 'rgba(217, 119, 6, 0.6)' },
              { label: 'Amazon', value: fulfillmentDistribution.amazon || 0, color: 'rgba(5, 150, 105, 0.6)' },
            ]}
            showLabels={true}
            showValues={true}
          />
        </div>

        {/* Strength Distribution */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            Competitor Strength Distribution
          </h3>
          <SegmentedBar
            segments={[
              { label: 'Strong', value: strengthDistribution.strong || 0, color: 'rgba(220, 38, 38, 0.6)' },
              { label: 'Decent', value: strengthDistribution.decent || 0, color: 'rgba(217, 119, 6, 0.6)' },
              { label: 'Weak', value: strengthDistribution.weak || 0, color: 'rgba(5, 150, 105, 0.6)' },
            ]}
            showLabels={true}
            showValues={true}
          />
        </div>

        {/* Size Tier Distribution */}
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            Size Tier Distribution
          </h3>
          {Object.keys(sizeTierDistribution).length > 0 ? (
            <SegmentedBar
              segments={Object.entries(sizeTierDistribution).map(([tier, value]) => ({
                label: tier,
                value: value as number,
                color: tier === 'Standard' ? 'rgba(37, 99, 235, 0.6)' : tier === 'Large' ? 'rgba(217, 119, 6, 0.6)' : 'rgba(5, 150, 105, 0.6)',
              }))}
              showLabels={true}
              showValues={true}
            />
          ) : (
            <div className="text-sm text-slate-400">No size tier data available</div>
          )}
        </div>
      </div>
    </div>
  );
}
