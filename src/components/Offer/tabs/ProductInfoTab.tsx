'use client';

import { ExternalLink, TrendingUp, Users, BarChart3, Award, Globe, Package, DollarSign, ShoppingCart, Star, Image, Layers } from 'lucide-react';
import { formatCurrency, formatNumber } from '@/utils/formatters';

interface ProductInfoTabProps {
  productData: any;
}

export function ProductInfoTab({ productData }: ProductInfoTabProps) {
  const competitors = productData?.productData?.competitors || [];
  const keepaResults = productData?.keepaResults || [];
  const marketScore = productData?.marketScore || { score: productData?.score || 0, status: productData?.status || 'RISKY' };
  const metrics = productData?.metrics || {};

  // Get top competitor
  const topCompetitor = competitors.length > 0 
    ? competitors.sort((a: any, b: any) => (b.monthlyRevenue || 0) - (a.monthlyRevenue || 0))[0]
    : null;

  // Calculate market metrics
  const marketCap = competitors.reduce((sum: number, comp: any) => sum + (comp.monthlyRevenue || 0), 0);
  const totalCompetitors = competitors.length;
  const revenuePerCompetitor = totalCompetitors > 0 ? marketCap / totalCompetitors : 0;

  // Get product ASIN data from keepaResults or competitors
  const productAsin = productData?.asin || competitors[0]?.asin || 'N/A';
  const productAsinData = keepaResults.find((r: any) => r.asin === productAsin) || competitors.find((c: any) => c.asin === productAsin) || {};

  // Get status color classes
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'PASS': return { text: 'text-emerald-400', border: 'border-emerald-500/50', bg: 'bg-emerald-900/30' };
      case 'RISKY': return { text: 'text-amber-400', border: 'border-amber-500/50', bg: 'bg-amber-900/30' };
      case 'FAIL': return { text: 'text-red-400', border: 'border-red-500/50', bg: 'bg-red-900/30' };
      default: return { text: 'text-slate-400', border: 'border-slate-500/50', bg: 'bg-slate-900/30' };
    }
  };

  const statusColors = getStatusColor(marketScore.status);

  // Get revenue per competitor color
  const getRevenueColor = (revenue: number) => {
    if (revenue >= 8000) return 'text-emerald-400 border-emerald-500/50';
    if (revenue >= 5000) return 'text-blue-400 border-blue-500/50';
    if (revenue >= 3000) return 'text-amber-400 border-amber-500/50';
    return 'text-red-400 border-red-500/50';
  };

  // Get competitor count color
  const getCompetitorColor = (count: number) => {
    if (count < 10) return 'text-emerald-400 border-emerald-500/50';
    if (count < 15) return 'text-green-400 border-green-500/50';
    if (count < 20) return 'text-blue-400 border-blue-500/50';
    if (count < 30) return 'text-amber-400 border-amber-500/50';
    return 'text-red-400 border-red-500/50';
  };

  const competitorColorClass = getCompetitorColor(totalCompetitors);
  const revenueColorClass = getRevenueColor(revenuePerCompetitor);

  const amazonUrl = (asin: string) => `https://www.amazon.com/dp/${asin}`;

  // Get product title and brand
  const productTitle = productData?.title || 'N/A';
  const productBrand = productData?.brand || competitors[0]?.brand || 'N/A';

  return (
    <div className="space-y-6">
      {/* Top Sub-Container: Title, Brand, Score - Enhanced */}
      <div className="bg-gradient-to-br from-slate-800/60 via-slate-800/50 to-slate-800/60 rounded-2xl border-2 border-blue-500/50 shadow-xl p-6 relative overflow-hidden">
        {/* Subtle background decoration */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl"></div>
        
        <div className="flex items-center justify-between relative z-10">
          <div className="flex-1">
            <h1 className="text-4xl font-bold text-white mb-2 bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent">
              {productTitle}
            </h1>
            <div className="flex items-center gap-2">
              <p className="text-xl text-slate-300 font-medium">{productBrand}</p>
              <span className="w-1.5 h-1.5 bg-blue-500/50 rounded-full"></span>
              <span className="text-sm text-slate-500">Vetted Product</span>
            </div>
          </div>
          <div className={`bg-gradient-to-br from-slate-800/80 to-slate-900/80 rounded-xl border-2 ${statusColors.border} shadow-xl px-6 py-4 flex items-center gap-4 backdrop-blur-sm`}>
            <div className={`text-3xl font-bold ${statusColors.text}`}>
              {marketScore.status}
            </div>
            <div className="flex items-center gap-3">
              <div className="relative w-28 h-3 bg-slate-700/40 rounded-full overflow-hidden">
                <div 
                  className={`absolute left-0 top-0 h-full rounded-full transition-all duration-500 ${
                    marketScore.status === 'PASS' ? 'bg-emerald-500' :
                    marketScore.status === 'RISKY' ? 'bg-amber-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${marketScore.score || 0}%` }}
                />
              </div>
              <div className={`text-2xl font-bold ${statusColors.text} min-w-[65px]`}>
                {marketScore.score?.toFixed(1) || '0.0'}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Market Metrics - Two Column Layout */}
      <div className="bg-slate-800/50 rounded-2xl border-2 border-slate-700/50 p-6">
        <h3 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-blue-400" strokeWidth={2} />
          Market Metrics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Labels */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-emerald-400" strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">Market Cap</div>
            </div>
            <div className="flex items-center gap-3">
              <TrendingUp className={`w-5 h-5 ${revenuePerCompetitor >= 8000 ? 'text-emerald-400' : revenuePerCompetitor >= 5000 ? 'text-blue-400' : revenuePerCompetitor >= 3000 ? 'text-amber-400' : 'text-red-400'}`} strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">Revenue Per Competitor</div>
            </div>
            <div className="flex items-center gap-3">
              <Users className={`w-5 h-5 ${totalCompetitors < 10 ? 'text-emerald-400' : totalCompetitors < 15 ? 'text-green-400' : totalCompetitors < 20 ? 'text-blue-400' : totalCompetitors < 30 ? 'text-amber-400' : 'text-red-400'}`} strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">Total Competitors</div>
            </div>
          </div>

          {/* Right Column - Data */}
          <div className="space-y-4">
            <div className="flex items-center">
              <div className="text-lg font-semibold text-emerald-400">
                {formatCurrency(marketCap)}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-semibold ${revenueColorClass.split(' ')[0]}`}>
                {formatCurrency(revenuePerCompetitor)}
              </span>
              <span className={`text-xs font-medium rounded px-2 py-0.5 ${
                revenuePerCompetitor >= 8000 
                  ? 'bg-emerald-900/30 text-emerald-400'
                  : revenuePerCompetitor >= 5000
                  ? 'bg-blue-900/30 text-blue-400'
                  : revenuePerCompetitor >= 3000
                  ? 'bg-amber-900/30 text-amber-400'
                  : 'bg-red-900/30 text-red-400'
              }`}>
                {revenuePerCompetitor >= 8000 ? 'EXCELLENT' : revenuePerCompetitor >= 5000 ? 'GOOD' : revenuePerCompetitor >= 3000 ? 'MODERATE' : 'LOW'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-lg font-semibold ${competitorColorClass.split(' ')[0]}`}>
                {totalCompetitors}
              </span>
              <span className={`text-xs font-medium rounded px-2 py-0.5 ${
                totalCompetitors < 10
                  ? 'bg-emerald-900/30 text-emerald-400'
                  : totalCompetitors < 15
                  ? 'bg-green-900/30 text-green-400'
                  : totalCompetitors < 20
                  ? 'bg-blue-900/30 text-blue-400'
                  : totalCompetitors < 30
                  ? 'bg-amber-900/30 text-amber-400'
                  : 'bg-red-900/30 text-red-400'
              }`}>
                {totalCompetitors < 10 ? 'LOW' : totalCompetitors < 15 ? 'MODERATE' : totalCompetitors < 20 ? 'MODERATE' : totalCompetitors < 30 ? 'HIGH' : 'VERY HIGH'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Product Info - Two Column Layout */}
      <div className="bg-slate-800/50 rounded-2xl border-2 border-slate-700/50 p-6">
        <h3 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
          <Package className="w-5 h-5 text-blue-400" strokeWidth={2} />
          Main Product Info
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Labels */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <ExternalLink className="w-5 h-5 text-blue-400" strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">ASIN</div>
            </div>
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-slate-400" strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">BSR</div>
            </div>
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-purple-400" strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">Category</div>
            </div>
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-amber-400" strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">Size Tier</div>
            </div>
          </div>

          {/* Right Column - Data */}
          <div className="space-y-4">
            <div className="flex items-center">
              {productAsin !== 'N/A' ? (
                <a 
                  href={amazonUrl(productAsin)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1.5 text-base font-medium"
                >
                  {productAsin}
                  <ExternalLink className="w-4 h-4" />
                </a>
              ) : (
                <span className="text-white text-base font-medium">N/A</span>
              )}
            </div>
            <div className="flex items-center">
              <p className="text-white text-base font-medium">{productAsinData?.bsr || competitors[0]?.bsr || 'N/A'}</p>
            </div>
            <div className="flex items-center">
              <p className="text-white text-base font-medium">{productData?.category || competitors[0]?.category || 'N/A'}</p>
            </div>
            <div className="flex items-center">
              <p className="text-white text-base font-medium">{productAsinData?.sizeTier || competitors[0]?.sizeTier || 'N/A'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Top Competitor - Two Column Layout */}
      {topCompetitor && (
        <div className="bg-slate-800/50 rounded-2xl border-2 border-slate-700/50 p-6">
          <h3 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
            <Globe className="w-5 h-5 text-purple-400" strokeWidth={2} />
            Top Competitor
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column - Labels */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Award className="w-5 h-5 text-purple-400" strokeWidth={2} />
                <div className="text-base font-medium text-slate-300">Brand</div>
              </div>
              <div className="flex items-center gap-3">
                <ExternalLink className="w-5 h-5 text-blue-400" strokeWidth={2} />
                <div className="text-base font-medium text-slate-300">ASIN</div>
              </div>
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-emerald-400" strokeWidth={2} />
                <div className="text-base font-medium text-slate-300">Monthly Revenue</div>
              </div>
            </div>

            {/* Right Column - Data */}
            <div className="space-y-4">
              <div className="flex items-center">
                <p className="text-white text-base font-medium">{topCompetitor.brand || 'N/A'}</p>
              </div>
              <div className="flex items-center">
                <a 
                  href={amazonUrl(topCompetitor.asin)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 flex items-center gap-1.5 text-base font-medium"
                >
                  {topCompetitor.asin}
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className="flex items-center">
                <p className="text-emerald-400 text-base font-semibold">
                  {formatCurrency(topCompetitor.monthlyRevenue || 0)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Other Metrics - Two Column Layout */}
      <div className="bg-slate-800/50 rounded-2xl border-2 border-slate-700/50 p-6">
        <h3 className="text-xl font-bold text-white mb-5 flex items-center gap-2">
          <Layers className="w-5 h-5 text-slate-400" strokeWidth={2} />
          Other Metrics
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Labels */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Package className="w-5 h-5 text-slate-400" strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">Variation Count</div>
            </div>
            <div className="flex items-center gap-3">
              <DollarSign className="w-5 h-5 text-emerald-400" strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">Parent Level Revenue</div>
            </div>
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-blue-400" strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">Parent Units Sold</div>
            </div>
            <div className="flex items-center gap-3">
              <Image className="w-5 h-5 text-purple-400" strokeWidth={2} />
              <div className="text-base font-medium text-slate-300">Number of Images</div>
            </div>
          </div>

          {/* Right Column - Data */}
          <div className="space-y-4">
            <div className="flex items-center">
              <p className="text-white text-base font-medium">
                {productAsinData?.variations || competitors[0]?.variations || competitors[0]?.variationCount || 'N/A'}
              </p>
            </div>
            <div className="flex items-center">
              <p className="text-white text-base font-medium">
                {productAsinData?.parentLevelRevenue || competitors[0]?.parentLevelRevenue || 'N/A'}
              </p>
            </div>
            <div className="flex items-center">
              <p className="text-white text-base font-medium">
                {productAsinData?.parentLevelSales || competitors[0]?.parentLevelSales || 'N/A'}
              </p>
            </div>
            <div className="flex items-center">
              <p className="text-white text-base font-medium">
                {productAsinData?.numberOfImages || competitors[0]?.numberOfImages || 'N/A'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
