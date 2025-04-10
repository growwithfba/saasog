'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, FileText, ArrowLeft, BarChart3, Users, TrendingUp, Calendar, Info, CheckCircle2, X } from 'lucide-react';
import { getSubmissionFromLocalStorage, saveSubmissionToLocalStorage } from '@/utils/storageUtils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';

// You might want to create these components in separate files
const CompetitorTable = ({ competitors }: { competitors: any[] }) => {
  if (!competitors || competitors.length === 0) {
    return <p className="text-slate-400">No competitor data available</p>;
  }
  
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="text-left text-slate-400 p-2 border-b border-slate-700">Competitor</th>
            <th className="text-left text-slate-400 p-2 border-b border-slate-700">Revenue</th>
            <th className="text-left text-slate-400 p-2 border-b border-slate-700">Market Share</th>
          </tr>
        </thead>
        <tbody>
          {competitors?.map((competitor, index) => (
            <tr key={index} className="hover:bg-slate-700/30">
              <td className="p-2 border-b border-slate-700/50">{competitor.brand || competitor.title || `Competitor ${index + 1}`}</td>
              <td className="p-2 border-b border-slate-700/50">${competitor.monthlyRevenue?.toLocaleString() || 'N/A'}</td>
              <td className="p-2 border-b border-slate-700/50">{competitor.marketShare ? `${competitor.marketShare}%` : 'N/A'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const DistributionChannels = ({ distributions }: { distributions: any[] }) => {
  if (!distributions || distributions.length === 0) {
    return <p className="text-slate-400">No distribution channel data available</p>;
  }
  
  // Ensure distributions is an array before mapping
  if (!Array.isArray(distributions)) {
    return <p className="text-slate-400">Distribution data format is invalid</p>;
  }
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {distributions.map((channel, index) => (
        <div key={index} className="bg-slate-700/30 rounded-xl p-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-medium text-white">{channel.name || `Channel ${index + 1}`}</h4>
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              channel.potential === 'High' ? 'bg-green-500/20 text-green-400' : 
              channel.potential === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' : 
              'bg-red-500/20 text-red-400'
            }`}>
              {channel.potential || 'N/A'} Potential
            </span>
          </div>
          <p className="text-slate-300 text-sm">{channel.description || 'No description available'}</p>
        </div>
      ))}
    </div>
  );
};

const ScoreGauge = ({ score, status }: { score: number, status: string }) => {
  // Ensure score is a valid number
  const numericScore = typeof score === 'number' && !isNaN(score) ? score : 
                      typeof score === 'string' ? parseFloat(score) || 0 : 0;
  
  const getColor = (score: number) => {
    if (score >= 70) return 'text-emerald-400';
    if (score >= 40) return 'text-amber-400';
    return 'text-red-400';
  };
  
  const getLabel = (status: string) => {
    if (status === 'PASS') return 'GOOD';
    if (status === 'RISKY') return 'CAUTION';
    return 'RISKY';
  };

  const getDescription = (score: number) => {
    if (score >= 70) return 'Good market opportunity';
    if (score >= 40) return 'Proceed with caution';
    return 'High risk market - careful consideration required';
  };

  return (
    <div className="flex flex-col items-center justify-center p-6">
      <div className={`text-7xl font-bold ${getColor(numericScore)}`}>
        {numericScore.toFixed(1)}%
      </div>
      <div className={`text-3xl font-bold mt-2 ${getColor(numericScore)}`}>
        {getLabel(status)}
      </div>
      <div className="text-slate-400 mt-4 text-center">
        {getDescription(numericScore)}
      </div>
    </div>
  );
};

export default function SubmissionPage() {
  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('overview');
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  useEffect(() => {
    if (!id) return;
    
    // Check if user is logged in
    const user = localStorage.getItem('user');
    
    if (!user) {
      router.push('/login');
      return;
    }
    
    fetchSubmission();
  }, [id, router]);

  const fetchSubmission = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log(`Fetching submission with ID: ${id}`);
      
      // First try to get from local storage
      const localSubmission = getSubmissionFromLocalStorage(id);
      if (localSubmission) {
        console.log(`Found submission in local storage: ${localSubmission.id}`);
        
        // Normalize it like we do with API data - ensure all fields are preserved
        const normalizedLocalSubmission = {
          ...localSubmission,
          // Ensure score is a number
          score: typeof localSubmission.score === 'number' ? localSubmission.score : 0,
          // Ensure we have a status
          status: localSubmission.status || 'N/A',
          // Ensure we have product data
          productData: localSubmission.productData || { 
            competitors: [],
            distributions: null
          },
          // Ensure metrics exist
          metrics: localSubmission.metrics || {},
          // Ensure market score exists
          marketScore: localSubmission.marketScore || { 
            score: localSubmission.score, 
            status: localSubmission.status || 'N/A' 
          },
          // Preserve keepaResults if they exist
          keepaResults: localSubmission.keepaResults || [],
          // Preserve market insights if they exist
          marketInsights: localSubmission.marketInsights || '',
          // Ensure ID is preserved
          id: localSubmission.id,
          // Ensure createdAt exists
          createdAt: localSubmission.createdAt || new Date().toISOString()
        };
        
        // No need to save back to local storage as this is causing duplicate entries
        // Just use the normalized version directly
        setSubmission(normalizedLocalSubmission);
        setLoading(false);
      }
      
      // Wait a moment to ensure the submission is saved to storage
      await new Promise(resolve => setTimeout(resolve, 300));
      
      try {
        // Fetch the submission from our API
        const response = await fetch(`/api/analyze/${id}`);
        
        if (!response.ok) {
          console.log(`API returned status ${response.status} - using local data if available`);
          
          // If we already have a local submission, keep using it and don't show error
          if (localSubmission) {
            console.log(`Using local data since API request failed`);
            return;
          }
          
          // Only throw if we don't have local data
          throw new Error(`Failed to fetch submission: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.submission) {
          console.log(`API returned no data or error - using local data if available`);
          
          // If we already have a local submission, keep using it and don't show error
          if (localSubmission) {
            console.log('Using local data since API returned no submission');
            return;
          }
          
          // Only throw if we don't have local data
          throw new Error('Failed to retrieve submission data');
        }
        
        console.log(`Successfully fetched submission from API: ${data.submission.id}`);
        
        // Validate and normalize important data
        const normalizedSubmission = {
          ...data.submission,
          // Ensure score is a number
          score: typeof data.submission.score === 'number' ? data.submission.score : 0,
          // Ensure we have a status
          status: data.submission.status || 'N/A',
          // Ensure we have product data
          productData: data.submission.productData || { 
            competitors: [],
            distributions: null
          },
          // Ensure metrics exist
          metrics: data.submission.metrics || {},
          // Ensure market score exists
          marketScore: data.submission.marketScore || { 
            score: data.submission.score, 
            status: data.submission.status || 'N/A' 
          },
          // Preserve keepaResults if they exist
          keepaResults: data.submission.keepaResults || [],
          // Preserve market insights if they exist
          marketInsights: data.submission.marketInsights || '',
          // Ensure ID is preserved
          id: data.submission.id,
          // Ensure createdAt exists
          createdAt: data.submission.createdAt || new Date().toISOString()
        };
        
        // Save to local storage only if we didn't already have this submission locally
        if (!localSubmission) {
          saveSubmissionToLocalStorage(normalizedSubmission);
        }
        
        setSubmission(normalizedSubmission);
      } catch (apiError) {
        console.error('API error:', apiError);
        
        // If we already have a local submission, don't show the error
        if (!localSubmission) {
          setError(apiError instanceof Error ? apiError.message : 'Failed to fetch submission details');
        }
      }
    } catch (error) {
      console.error('Error fetching submission:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while fetching the submission');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPDF = () => {
    alert('PDF Export feature will be implemented here');
    // In production, implement PDF generation and download
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="flex flex-col items-center">
          <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
          <p className="text-slate-400">Loading analysis results...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 max-w-md text-center">
          <div className="text-red-400 mb-4 flex justify-center">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-slate-300 font-medium mb-2">Failed to load submission</p>
          <p className="text-slate-400 mb-6">{error}</p>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white inline-block"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 max-w-md text-center">
          <p className="text-slate-400 mb-4">Analysis not found</p>
          <Link
            href="/dashboard"
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white inline-block"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Calculate metric values from submission data
  const marketCap = submission.metrics?.totalMarketCap || 
    (submission.productData?.competitors?.reduce((sum, comp) => sum + (comp.monthlyRevenue || 0), 0) || 0);
  
  const revenuePerCompetitor = submission.metrics?.revenuePerCompetitor || 
    (submission.productData?.competitors?.length > 0 
      ? marketCap / submission.productData.competitors.length 
      : 0);
  
  const totalCompetitors = submission.metrics?.competitorCount || 
    (submission.productData?.competitors?.length || 0);
  
  const marketScore = typeof submission.marketScore === 'object' 
    ? submission.marketScore.score || submission.score
    : submission.score;
  
  const marketStatus = typeof submission.marketScore === 'object'
    ? submission.marketScore.status || 'N/A'
    : submission.status;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-4">
              <img 
                src="/Elevate 2 - Icon.png"
                alt="Elevate Icon"
                className="h-12 w-auto"
              />
              <div>
                <h1 className="text-2xl font-bold text-white">{submission.title || 'Untitled Analysis'}</h1>
                <p className="text-slate-400">
                  Analyzed on {submission.createdAt ? new Date(submission.createdAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }).replace(/\//g, '/') : '4/9/2025'} • ID: {submission.id ? submission.id.substring(0, 10) : 'sub_17442521'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={handleExportPDF}
                className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                <span>Export PDF</span>
              </button>
              <Link
                href="/dashboard"
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
        
        {/* KPI Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-5">
            <div className="flex justify-between mb-1">
              <span className="text-slate-400 text-sm">Market Cap</span>
              <span className="text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 opacity-75"><path d="M3 3v18h18"></path><path d="m19 9-5 5-4-4-3 3"></path></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-emerald-400">
              {marketCap > 0 ? `$${marketCap.toLocaleString()}` : '$0'}
            </div>
          </div>
          
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-5">
            <div className="flex justify-between mb-1">
              <span className="text-slate-400 text-sm">Revenue per Competitor</span>
              <span className="text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 opacity-75"><path d="M22 12h-4l-3 9L9 3l-3 9H2"></path></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-emerald-400">
              {revenuePerCompetitor > 0 ? `$${revenuePerCompetitor.toLocaleString()}` : '$0'}
            </div>
            <div className="mt-2 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md inline-block">
              {revenuePerCompetitor >= 12000 ? 'EXCELLENT' : 
               revenuePerCompetitor >= 8000 ? 'VERY GOOD' : 
               revenuePerCompetitor >= 5000 ? 'GOOD' : 
               revenuePerCompetitor >= 4000 ? 'AVERAGE' : 
               revenuePerCompetitor >= 3000 ? 'LOW' : 'VERY LOW'}
            </div>
          </div>
          
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-5">
            <div className="flex justify-between mb-1">
              <span className="text-slate-400 text-sm">Total Competitors</span>
              <span className="text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 opacity-75"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              </span>
            </div>
            <div className="text-3xl font-bold text-emerald-400">
              {totalCompetitors > 0 ? totalCompetitors : '0'}
            </div>
            <div className="mt-2 text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-md inline-block">
              {totalCompetitors === 0 ? 'LOW' :
               totalCompetitors < 10 ? 'LOW' : 
               totalCompetitors < 15 ? 'MODERATE' : 
               totalCompetitors < 20 ? 'AVERAGE' : 
               totalCompetitors < 30 ? 'HIGH' : 'VERY HIGH'}
            </div>
          </div>
        </div>
        
        {/* Middle Content - Score, Top Competitors, KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Top 5 Competitors Summary */}
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Top 5 Competitors</h2>
            
            <div className="space-y-5">
              <div>
                <div className="text-slate-400 text-sm mb-1">Average Reviews</div>
                <div className="bg-slate-700/40 rounded-lg p-2.5">
                  <div className="text-lg font-semibold text-emerald-400">
                    {
                      submission.productData?.competitors?.length > 0 
                      ? Math.round(
                          submission.productData.competitors
                            .slice(0, 5)
                            .reduce((sum, comp) => sum + (Number(comp.reviews) || 0), 0) / 
                          Math.min(5, submission.productData.competitors.length)
                        )
                      : 0
                    }
                  </div>
                  <div className="text-xs text-slate-500 mt-1">(LOW)</div>
                </div>
              </div>
              
              <div>
                <div className="text-slate-400 text-sm mb-1">Average Rating</div>
                <div className="bg-slate-700/40 rounded-lg p-2.5">
                  <div className="text-lg font-semibold text-amber-400 flex items-center">
                    {
                      submission.productData?.competitors?.length > 0 
                      ? (
                          submission.productData.competitors
                            .slice(0, 5)
                            .reduce((sum, comp) => sum + (Number(comp.rating) || 0), 0) / 
                          Math.min(5, submission.productData.competitors.length)
                        ).toFixed(1)
                      : 0
                    }
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 ml-1">
                      <path fillRule="evenodd" d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-xs text-slate-500 mt-1">(AVERAGE QUALITY)</div>
                </div>
              </div>
              
              <div>
                <div className="text-slate-400 text-sm mb-1">Average Listing Age</div>
                <div className="bg-slate-700/40 rounded-lg p-2.5">
                  <div className="text-lg font-semibold text-blue-400">
                    {
                      submission.productData?.competitors?.length > 0 &&
                      submission.productData.competitors.some(comp => comp.dateFirstAvailable)
                      ? (() => {
                          const ages = submission.productData.competitors
                            .slice(0, 5)
                            .map(comp => {
                              if (!comp.dateFirstAvailable) return 0;
                              const date = new Date(comp.dateFirstAvailable);
                              const now = new Date();
                              const diffTime = Math.abs(now.getTime() - date.getTime());
                              const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
                              return diffMonths;
                            })
                            .filter(age => age > 0);
                          
                          if (ages.length === 0) return '2y'; // Default if no valid dates
                          
                          const avgMonths = ages.reduce((sum, age) => sum + age, 0) / ages.length;
                          if (avgMonths >= 24) return `${Math.round(avgMonths / 12)}y`;
                          return `${Math.round(avgMonths)}mo`;
                        })()
                      : '2y' // Default if no competitors or dates
                    }
                  </div>
                </div>
              </div>
              </div>
            </div>
            
          {/* Market Assessment */}
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6">
            <div className="flex flex-col items-center justify-center h-full">
              <div className="text-7xl font-bold text-emerald-400 mb-2">93.6%</div>
              <div className="text-4xl font-bold text-emerald-400 mb-4">PASS</div>
              <div className="text-lg text-center text-slate-300 mb-4">Great Opportunity</div>
              <p className="text-sm text-slate-400 text-center">
                Exceptional market with high revenue potential and manageable competition level. Opportunity to capture significant market share with the right product. BSR shows high stability and listings are well-established.
              </p>
              <div className="w-full bg-emerald-900/20 rounded-full h-2 mt-4">
                <div 
                  className="bg-emerald-400 h-2 rounded-full" 
                  style={{ width: `93.6%` }}
                ></div>
              </div>
            </div>
          </div>
          
          {/* Key Market Indicators */}
          <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Key Market Indicators</h2>
            
            <div className="space-y-5">
              <div>
                <div className="text-slate-400 text-sm mb-1">Market Size</div>
                <div className="bg-slate-700/40 rounded-lg p-2.5">
                  <div className="text-lg font-semibold text-emerald-400 flex items-center">
                    Small <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 ml-1 text-emerald-400"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </div>
                      </div>
                    </div>
                    
              <div>
                <div className="text-slate-400 text-sm mb-1">BSR Stability</div>
                <div className="bg-slate-700/40 rounded-lg p-2.5">
                  <div className="text-lg font-semibold text-emerald-400">
                    {submission.metrics?.bsrStability !== undefined ? 
                      (submission.metrics.bsrStability >= 0.7 ? 'Highly Stable' :
                       submission.metrics.bsrStability >= 0.4 ? 'Moderately Stable' :
                       'Unstable') : 'Highly Stable'}
                          </div>
                      </div>
                    </div>
                    
              <div>
                <div className="text-slate-400 text-sm mb-1">Price Volatility</div>
                <div className="bg-slate-700/40 rounded-lg p-2.5">
                  <div className="text-lg font-semibold text-emerald-400">
                    {submission.metrics?.priceStability !== undefined ? 
                      (submission.metrics.priceStability >= 0.7 ? 'Highly Stable' :
                       submission.metrics.priceStability >= 0.4 ? 'Moderately Stable' :
                       'Unstable') : 'Moderately Stable'}
                      </div>
                    </div>
                  </div>
            </div>
          </div>
        </div>
        
        {/* Detailed Competitor Analysis */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold text-white mb-4">Detailed Competitor Analysis</h2>
          
          <div className="mb-4 border-b border-slate-700">
            <div className="flex space-x-6 overflow-x-auto pb-1">
              <button 
                className={`px-4 py-2 whitespace-nowrap ${
                  activeTab === 'overview' 
                    ? 'text-emerald-400 border-b-2 border-emerald-400 font-medium' 
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                onClick={() => setActiveTab('overview')}
              >
                Competitor Overview
              </button>
              <button 
                className={`px-4 py-2 whitespace-nowrap ${
                  activeTab === 'age' 
                    ? 'text-emerald-400 border-b-2 border-emerald-400 font-medium' 
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                onClick={() => setActiveTab('age')}
              >
                Market Age Distribution
              </button>
              <button 
                className={`px-4 py-2 whitespace-nowrap ${
                  activeTab === 'fulfillment' 
                    ? 'text-emerald-400 border-b-2 border-emerald-400 font-medium' 
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                onClick={() => setActiveTab('fulfillment')}
              >
                Fulfillment Methods
              </button>
              <button 
                className={`px-4 py-2 whitespace-nowrap ${
                  activeTab === 'quality' 
                    ? 'text-emerald-400 border-b-2 border-emerald-400 font-medium' 
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                onClick={() => setActiveTab('quality')}
              >
                Listing Quality
              </button>
              <button 
                className={`px-4 py-2 whitespace-nowrap ${
                  activeTab === 'market_share' 
                    ? 'text-emerald-400 border-b-2 border-emerald-400 font-medium' 
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                onClick={() => setActiveTab('market_share')}
              >
                Market Share
              </button>
              <button 
                className={`px-4 py-2 whitespace-nowrap ${
                  activeTab === 'all_data' 
                    ? 'text-emerald-400 border-b-2 border-emerald-400 font-medium' 
                    : 'text-slate-400 hover:text-slate-300'
                }`}
                onClick={() => setActiveTab('all_data')}
              >
                All Data
              </button>
            </div>
          </div>
          
          {activeTab === 'overview' && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-700/30">
                    <th className="text-left text-slate-400 p-3 border-b border-slate-700">Rank</th>
                    <th className="text-left text-slate-400 p-3 border-b border-slate-700">Brand</th>
                    <th className="text-left text-slate-400 p-3 border-b border-slate-700">ASIN</th>
                    <th className="text-right text-slate-400 p-3 border-b border-slate-700">Monthly Revenue</th>
                    <th className="text-right text-slate-400 p-3 border-b border-slate-700">Market Share</th>
                    <th className="text-right text-slate-400 p-3 border-b border-slate-700">Review Share</th>
                    <th className="text-center text-slate-400 p-3 border-b border-slate-700">Competitor Score</th>
                    <th className="text-center text-slate-400 p-3 border-b border-slate-700">Strength</th>
                  </tr>
                </thead>
                <tbody>
                  {(submission.productData?.competitors || [])
                    .sort((a: any, b: any) => (b.monthlyRevenue || 0) - (a.monthlyRevenue || 0))
                    .slice(0, 8)
                    .map((competitor: any, index: number) => {
                      const totalReviews = submission.productData.competitors.reduce(
                        (sum: number, comp: any) => sum + (Number(comp.reviews) || 0), 0
                      );
                      const reviewShare = totalReviews > 0 ? 
                        ((Number(competitor.reviews) || 0) / totalReviews * 100) : 0;
                      
                      // Create a clean ASIN for display and linking
                      const asin = competitor.asin || '';
                      const cleanAsin = typeof asin === 'string' ? asin.replace(/[^A-Z0-9]/g, '') : asin;
                      
                      return (
                        <tr key={index} className="hover:bg-slate-700/30">
                          <td className="p-3 border-b border-slate-700/50">{index + 1}</td>
                          <td className="p-3 border-b border-slate-700/50 font-medium text-white">
                            {competitor.brand || 'Unknown'}
                          </td>
                          <td className="p-3 border-b border-slate-700/50">
                            <a 
                              href={`https://www.amazon.com/dp/${cleanAsin}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 hover:underline"
                            >
                              {cleanAsin.substring(0, 10)}
                            </a>
                          </td>
                          <td className="p-3 border-b border-slate-700/50 text-right">
                            ${(competitor.monthlyRevenue || 0).toLocaleString()}
                          </td>
                          <td className="p-3 border-b border-slate-700/50 text-right">
                            {competitor.marketShare?.toFixed(2) || '0.00'}%
                          </td>
                          <td className="p-3 border-b border-slate-700/50 text-right">
                            {reviewShare.toFixed(2)}%
                          </td>
                          <td className="p-3 border-b border-slate-700/50 text-center">
                            <div className="flex items-center justify-center">
                              <span className="text-emerald-400 font-medium">
                                {(Number(competitor.score) || 66).toFixed(2)}%
                      </span>
                              <button className="ml-2 text-slate-400 hover:text-slate-300">
                                <Info className="w-4 h-4" />
                              </button>
                    </div>
                          </td>
                          <td className="p-3 border-b border-slate-700/50 text-center">
                            <span className="bg-red-400/20 text-red-400 px-2 py-1 rounded text-xs font-medium">
                              STRONG
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
                  </div>
                )}
                
          {activeTab !== 'overview' && (
            <div className="p-8 flex items-center justify-center">
              <p className="text-slate-400">
                {activeTab === 'age' && 'Market Age Distribution view will be displayed here.'}
                {activeTab === 'fulfillment' && 'Fulfillment Methods view will be displayed here.'}
                {activeTab === 'quality' && 'Listing Quality view will be displayed here.'}
                {activeTab === 'market_share' && 'Market Share view will be displayed here.'}
                {activeTab === 'all_data' && 'All Data view will be displayed here.'}
              </p>
            </div>
          )}
        </div>
        
        {/* Competitor Graph Analysis */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6 mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">Competitor Graph Analysis</h2>
            
            <div className="flex space-x-2">
              <button className="px-3 py-1.5 text-xs font-medium rounded bg-slate-700/70 text-slate-300">
                All Competitors
              </button>
              <button className="px-3 py-1.5 text-xs font-medium rounded bg-emerald-500/80 text-white">
                Top 5 Sales
              </button>
              <button className="px-3 py-1.5 text-xs font-medium rounded bg-slate-700/70 text-slate-300">
                Bottom 5 Sales
              </button>
              <button className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500/70 text-white">
                Sales
              </button>
              <button className="px-3 py-1.5 text-xs font-medium rounded bg-emerald-500/80 text-white">
                Revenue
              </button>
              <button className="px-3 py-1.5 text-xs font-medium rounded bg-slate-700/70 text-slate-300">
                Reviews
              </button>
                    </div>
          </div>
          
          <div className="h-96 w-full">
            {submission.productData?.competitors && submission.productData.competitors.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={submission.productData.competitors
                    .sort((a: any, b: any) => (b.monthlyRevenue || 0) - (a.monthlyRevenue || 0))
                    .slice(0, 5)
                    .map((competitor: any) => ({
                      name: competitor.brand || 'Unknown',
                      revenue: competitor.monthlyRevenue || 0,
                      sales: competitor.monthlySales || 0,
                    }))}
                  margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="name" 
                    stroke="#94A3B8" 
                    tick={{ fill: '#94A3B8' }}
                  />
                  <YAxis 
                    yAxisId="left" 
                    orientation="left" 
                    stroke="#94A3B8" 
                    tick={{ fill: '#94A3B8' }}
                    tickFormatter={(value) => `$${value.toLocaleString()}`}
                  />
                  <YAxis 
                    yAxisId="right" 
                    orientation="right" 
                    stroke="#94A3B8" 
                    tick={{ fill: '#94A3B8' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1E293B', borderColor: '#334155', color: '#F1F5F9' }}
                    labelStyle={{ color: '#F1F5F9' }}
                    formatter={(value: any) => [`$${value.toLocaleString()}`, 'Monthly Revenue']}
                  />
                  <Legend />
                  <Bar 
                    yAxisId="left" 
                    dataKey="revenue" 
                    name="Monthly Revenue" 
                    fill="#10B981" 
                    radius={[4, 4, 0, 0]} 
                  />
                  <Bar 
                    yAxisId="right" 
                    dataKey="sales" 
                    name="Monthly Sales (units)" 
                    fill="#10B981" 
                    radius={[4, 4, 0, 0]} 
                    fillOpacity={0.6} 
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-slate-400">No competitor data available for charts</p>
                  </div>
                )}
          </div>
        </div>
        
        {/* Top 5 Competitors - Keepa Analysis */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6 mb-8">
          <h2 className="text-xl font-semibold text-white mb-2">Top 5 Competitors - Keepa Analysis</h2>
          <p className="text-slate-400 text-sm mb-6">12 Months of BSR and Pricing History for detailed analysis of consistency, trends and patterns.</p>
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {submission.keepaResults && submission.keepaResults.length > 0 ? (
              submission.keepaResults.slice(0, 3).map((keepaResult: any, index: number) => (
                <div key={index} className="bg-slate-800/70 rounded-xl p-5 border border-slate-700/50">
                  <div className="mb-3">
                    <div className="flex justify-between items-start">
                      <div className="mb-2">
                        <div className="text-xs font-medium text-slate-400 mb-1">
                          {index === 0 ? 'TOP COMPETITOR' : 
                           index === 1 ? '2ND COMPETITOR' : '3RD COMPETITOR'}
                        </div>
                        <h3 className="text-white font-medium">
                          {keepaResult.brand || 'Unknown Brand'}
                        </h3>
                        <p className="text-slate-400 text-xs mt-1 line-clamp-1">
                          {keepaResult.title || 'Product Title Unavailable'}
                        </p>
                      </div>
                      <span className="bg-red-900/30 text-red-400 text-xs font-medium px-2 py-1 rounded uppercase">
                        STRONG
                      </span>
                    </div>
                    <a 
                      href={`https://amazon.com/dp/${keepaResult.asin}`}
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center mt-2 text-xs text-blue-400 hover:text-blue-300"
                    >
                      View on Amazon
                    </a>
                  </div>
                  
                  <div className="flex items-center text-yellow-400 text-xs mb-4 gap-1">
                    <span className="inline-flex items-center bg-yellow-900/30 px-2 py-1 rounded-full">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                        <line x1="9" y1="9" x2="9.01" y2="9"></line>
                        <line x1="15" y1="9" x2="15.01" y2="9"></line>
                      </svg>
                      <span className="ml-1">Maintains BSR under 50k for 67% of time</span>
                      </span>
                  </div>
                
                  <div className="grid grid-cols-2 gap-4">
                  <div>
                      <div className="text-xs text-slate-400 mb-1 flex justify-between">
                        <span>BSR Metrics</span>
                        <span className="text-blue-400">Moderate</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">BSR Stability Score:</span>
                          <span className="text-blue-400">66.2%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Current BSR:</span>
                          <span className="text-white">#12,979</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Average BSR:</span>
                          <span className="text-white">#54,787</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Highest BSR:</span>
                          <span className="text-yellow-400">#378,120</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Lowest BSR:</span>
                          <span className="text-emerald-400">#4,036</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">OOS Rate:</span>
                          <span className="text-emerald-400">0.0%</span>
                        </div>
                      </div>
                    </div>
                
                  <div>
                      <div className="text-xs text-slate-400 mb-1 flex justify-between">
                        <span>Price Metrics</span>
                        <span className="text-blue-400">Moderate</span>
                      </div>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Price Stability Score:</span>
                          <span className="text-blue-400">62.6%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Current Price:</span>
                          <span className="text-white">$53.99</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Average Price:</span>
                          <span className="text-white">$51.63</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Highest Price:</span>
                          <span className="text-yellow-400">$58.99</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Lowest Price:</span>
                          <span className="text-emerald-400">$45.99</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Sale Frequency:</span>
                          <span className="text-white">3.9%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-3 flex items-center justify-center py-10">
                <p className="text-slate-400">No Keepa analysis data available</p>
              </div>
            )}
          </div>
          
          <div className="mt-4 text-center">
            <p className="text-xs text-slate-400">
              Showing top 5 competitors by revenue. 23 competitors hidden.
            </p>
              </div>
            </div>
            
        {/* Market Insights */}
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">Market Insights</h2>
              <p className="text-slate-300 leading-relaxed">
            {submission.marketInsights || 'Niche market with modest revenue potential but limited competition. May offer targeted opportunity. competitors maintain excellent ratings and top 5 competitors dominate market share.'}
              </p>
        </div>
      </div>
    </div>
  );
} 