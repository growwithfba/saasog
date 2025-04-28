'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CsvUpload } from '@/components/Upload/CsvUpload';
import { Loader2, AlertCircle, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

export function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('submissions');
  const router = useRouter();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);
  const [totalPages, setTotalPages] = useState(1);
  
  // Sorting state
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Selection state
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    // Check if user is logged in via Supabase
    const checkUser = async () => {
      const { data: { user: supabaseUser }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !supabaseUser) {
        router.push('/login');
        return;
      }
      
      setUser({
        id: supabaseUser.id,
        email: supabaseUser.email,
        name: supabaseUser.user_metadata?.name || supabaseUser.email
      });
      
      fetchSubmissions();
    };
    
    checkUser();
  }, [router]);
  
  // Update total pages when submissions change
  useEffect(() => {
    setTotalPages(Math.max(1, Math.ceil(submissions.length / itemsPerPage)));
    
    // If current page is beyond total pages, reset to page 1
    if (currentPage > Math.ceil(submissions.length / itemsPerPage) && submissions.length > 0) {
      setCurrentPage(1);
    }
  }, [submissions, itemsPerPage]);

  // Refresh submissions when activeTab changes to 'submissions' or when component first mounts
  useEffect(() => {
    if (user) {
      console.log('Loading submissions for user:', user.email);
      fetchSubmissions();
    }
  }, [user]); // Only depend on user to avoid potential infinite loops
  
  // Refresh when tab changes 
  useEffect(() => {
    if (activeTab === 'submissions' && user) {
      console.log('Tab changed to submissions, refreshing data...');
      fetchSubmissions();
    }
  }, [activeTab]);

  const fetchSubmissions = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      console.log("Fetching submissions...");
      console.log(`Fetching submissions for user: ${user.email}`);
      
      // Create an array to hold all submissions from different sources
      let allSubmissions = [];
      let sourcesChecked = [];
      
      // First try getting current anonymous session ID
      let anonymousId = null;
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user?.id) {
          anonymousId = sessionData.session.user.id;
          console.log('Found anonymous session ID:', anonymousId);
        }
      } catch (sessionError) {
        console.error('Error getting session:', sessionError);
      }
      
      // Try fetching from Supabase directly with the current user ID (if we have an anonymous session)
      if (anonymousId) {
        try {
          console.log('Fetching from Supabase with anonymous ID:', anonymousId);
          const { data: supabaseSubmissions, error } = await supabase
            .from('submissions')
            .select('*')
            .eq('user_id', anonymousId)
            .order('created_at', { ascending: false });
            
          if (!error && supabaseSubmissions && supabaseSubmissions.length > 0) {
            // Transform Supabase data format to match existing app structure
            const transformedData = supabaseSubmissions.map(submission => ({
              id: submission.id,
              userId: submission.user_id,
              title: submission.title,
              score: submission.score,
              status: submission.status,
              productData: submission.submission_data?.productData,
              keepaResults: submission.submission_data?.keepaResults,
              marketScore: submission.submission_data?.marketScore,
              productName: submission.product_name,
              createdAt: submission.created_at,
              metrics: submission.metrics
            }));
            
            console.log(`Retrieved ${transformedData.length} submissions from Supabase with anonymous ID`);
            allSubmissions = [...allSubmissions, ...transformedData];
            sourcesChecked.push('Supabase (anonymous)');
          }
        } catch (supabaseError) {
          console.error('Supabase fetch with anonymous ID failed:', supabaseError);
        }
      }
      
      // Continue with the API endpoint which handles both Supabase and cookie fallback
      try {
        console.log('Fetching from API endpoint...');
        const response = await fetch(`/api/analyze?userId=${user.id}`);
        
        if (response.ok) {
          const apiData = await response.json();
          
          if (apiData.success && apiData.submissions && apiData.submissions.length > 0) {
            console.log(`Retrieved ${apiData.submissions.length} submissions from API (${apiData.source})`);
            allSubmissions = [...allSubmissions, ...apiData.submissions];
            sourcesChecked.push(`API (${apiData.source})`);
          }
        }
      } catch (apiError) {
        console.error('API endpoint method failed:', apiError);
      }
      
      // Try direct Supabase as another source
      try {
        console.log('Fetching with regular user ID:', user.id);
        const { data, error: submissionsError } = await supabase
          .from('submissions')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
          
        if (!submissionsError && data && data.length > 0) {
          // Transform Supabase data format to match existing app structure
          const transformedData = data.map(submission => ({
            id: submission.id,
            userId: submission.user_id,
            title: submission.title,
            score: submission.score,
            status: submission.status,
            productData: submission.submission_data?.productData,
            keepaResults: submission.submission_data?.keepaResults,
            marketScore: submission.submission_data?.marketScore,
            productName: submission.product_name,
            createdAt: submission.created_at,
            metrics: submission.metrics
          }));
          
          console.log(`Retrieved ${transformedData.length} submissions from Supabase`);
          allSubmissions = [...allSubmissions, ...transformedData];
          sourcesChecked.push('Supabase');
        }
      } catch (supabaseError) {
        console.error('Supabase fetch failed:', supabaseError);
      }
      
      // Try reading cookies directly from the browser
      console.log('Trying to read cookies directly from browser...');
      const cookieSubmissions = loadSubmissionsFromCookies();
      if (cookieSubmissions.length > 0) {
        // Filter submissions for this user
        const userSubmissions = cookieSubmissions.filter(sub => isSubmissionForCurrentUser(sub.userId, user.id, user.email));
        console.log(`Found ${userSubmissions.length} submissions for user ${user.id} in browser cookies`);
        allSubmissions = [...allSubmissions, ...userSubmissions];
        sourcesChecked.push('Cookies');
      }
      
      // Check localStorage
      console.log('Checking localStorage...');
      try {
        const savedSubmissionsJson = localStorage.getItem('savedSubmissions');
        if (savedSubmissionsJson) {
          const savedSubmissions = JSON.parse(savedSubmissionsJson);
          if (Array.isArray(savedSubmissions) && savedSubmissions.length > 0) {
            // Filter for current user
            const userLocalSubmissions = savedSubmissions.filter(sub => isSubmissionForCurrentUser(sub.userId, user.id, user.email));
            if (userLocalSubmissions.length > 0) {
              console.log(`Found ${userLocalSubmissions.length} submissions in localStorage`);
              allSubmissions = [...allSubmissions, ...userLocalSubmissions];
              sourcesChecked.push('LocalStorage');
            }
          }
        }
      } catch (localStorageError) {
        console.error('Error reading from localStorage:', localStorageError);
      }
      
      // Filter out duplicates from combined sources using the id and title
      const seenIds = new Set();
      const seenTitles = new Set();
      const uniqueSubmissions = [];
      
      for (const submission of allSubmissions) {
        // Skip if we've seen this id or title before
        if (seenIds.has(submission.id) || (submission.title && seenTitles.has(submission.title))) {
          continue;
        }
        
        if (submission.id) seenIds.add(submission.id);
        if (submission.title) seenTitles.add(submission.title);
        uniqueSubmissions.push(submission);
      }
      
      console.log(`Deduplicated from ${allSubmissions.length} to ${uniqueSubmissions.length} submissions`);
      console.log('Sources checked:', sourcesChecked.join(', '));
      
      // If we got here, we set the deduped submissions
      setSubmissions(uniqueSubmissions);
      
    } catch (error) {
      console.error('Error fetching submissions:', error);
      setError(error instanceof Error ? error.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  // Function to directly read cookies from the browser
  const getCookie = (name) => {
    if (typeof document === 'undefined') return null; // Not in browser
    
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop().split(';').shift();
    }
    return null;
  };
  
  // Load submissions directly from cookies if needed
  const loadSubmissionsFromCookies = () => {
    try {
      const savedSubmissionsCookie = getCookie('savedSubmissions');
      if (savedSubmissionsCookie) {
        const cookieData = JSON.parse(decodeURIComponent(savedSubmissionsCookie));
        if (cookieData && Array.isArray(cookieData)) {
          console.log(`Loaded ${cookieData.length} submissions directly from browser cookies`);
          return cookieData;
        }
      }
    } catch (error) {
      console.error('Error loading submissions from cookies:', error);
    }
    return [];
  };
  
  // Check if a userId matches the current user (handles both UUID and email formats)
  const isSubmissionForCurrentUser = (submissionUserId: string, currentUserId: string, currentUserEmail: string) => {
    if (!submissionUserId) return false;
    
    // For debugging - log the comparison
    console.log(`Comparing submission userId: "${submissionUserId}" with user.id: "${currentUserId}" and email: "${currentUserEmail}"`);
    
    // Handle both ID and email formats
    const isMatch = (
      submissionUserId === currentUserId || 
      submissionUserId === currentUserEmail ||
      // If the submission has an email-like userId
      (submissionUserId.includes('@') && 
        (currentUserEmail.includes(submissionUserId) || submissionUserId.includes(currentUserEmail))) ||
      // If the current user email contains part of the submission userId or vice versa
      (currentUserEmail.includes('@') && submissionUserId.includes(currentUserEmail.split('@')[0]))
    );
    
    if (isMatch) {
      console.log(`✅ MATCH found for submission with userId: ${submissionUserId}`);
    }
    
    return isMatch;
  };

  // Format date for better readability
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return dateString;
    }
  };
  
  // Toggle selection of a submission
  const toggleSubmissionSelection = (submissionId: string) => {
    setSelectedSubmissions(prevSelected => {
      if (prevSelected.includes(submissionId)) {
        return prevSelected.filter(id => id !== submissionId);
      } else {
        return [...prevSelected, submissionId];
      }
    });
  };
  
  // Select all submissions on current page
  const selectAllCurrentPage = () => {
    const currentPageIds = getPaginatedSubmissions().map(sub => sub.id);
    setSelectedSubmissions(prevSelected => {
      // If all current page items are already selected, deselect them
      if (currentPageIds.every(id => prevSelected.includes(id))) {
        return prevSelected.filter(id => !currentPageIds.includes(id));
      } 
      // Otherwise, add all current page items that aren't already selected
      else {
        const newSelected = [...prevSelected];
        currentPageIds.forEach(id => {
          if (!newSelected.includes(id)) {
            newSelected.push(id);
          }
        });
        return newSelected;
      }
    });
  };
  
  // Delete selected submissions
  const deleteSelectedSubmissions = async () => {
    if (selectedSubmissions.length === 0) return;
    
    try {
      // First check if these IDs are in Supabase or just in local storage
      const hasSupabaseIds = selectedSubmissions.some(id => 
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
      );
      
      // If there are valid UUID formatted IDs, attempt to delete from Supabase
      if (hasSupabaseIds) {
        // Filter for only valid UUIDs before sending to Supabase
        const validUuids = selectedSubmissions.filter(id => 
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
        );
        
        if (validUuids.length > 0) {
          const { error } = await supabase
            .from('submissions')
            .delete()
            .in('id', validUuids);
            
          if (error) {
            console.error('Supabase deletion error:', error);
          }
        }
      }
      
      // Handle local storage deletion (for cookie-based submissions)
      try {
        // Delete from localStorage if present
        const savedSubmissionsJson = localStorage.getItem('savedSubmissions');
        if (savedSubmissionsJson) {
          let savedSubmissions = JSON.parse(savedSubmissionsJson);
          if (Array.isArray(savedSubmissions)) {
            savedSubmissions = savedSubmissions.filter(sub => !selectedSubmissions.includes(sub.id));
            localStorage.setItem('savedSubmissions', JSON.stringify(savedSubmissions));
          }
        }
        
        // Delete from cookies if present
        const savedSubmissionsCookie = getCookie('savedSubmissions');
        if (savedSubmissionsCookie) {
          let cookieSubmissions = JSON.parse(decodeURIComponent(savedSubmissionsCookie));
          if (Array.isArray(cookieSubmissions)) {
            cookieSubmissions = cookieSubmissions.filter(sub => !selectedSubmissions.includes(sub.id));
            // Update cookie with filtered submissions
            document.cookie = `savedSubmissions=${encodeURIComponent(JSON.stringify(cookieSubmissions))}; path=/;`;
          }
        }
      } catch (localError) {
        console.error('Error handling local storage/cookies:', localError);
      }
      
      // Update local state (this still happens regardless of where data was stored)
      const updatedSubmissions = submissions.filter(
        submission => !selectedSubmissions.includes(submission.id)
      );
      
      // Update state
      setSubmissions(updatedSubmissions);
      setSelectedSubmissions([]);
      setIsDeleteConfirmOpen(false);
      
      // If we deleted all submissions on the current page and it's not the first page,
      // go back to the previous page
      const remainingPagesCount = Math.ceil(updatedSubmissions.length / itemsPerPage);
      if (currentPage > remainingPagesCount && currentPage > 1) {
        setCurrentPage(remainingPagesCount);
      }
    } catch (error) {
      console.error('Error deleting submissions:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete submissions');
    }
  };
  
  // Function to get paginated submissions
  const getPaginatedSubmissions = () => {
    // First sort the submissions
    const sortedSubmissions = [...submissions].sort((a, b) => {
      if (sortField === 'date') {
        const aDate = new Date(a.createdAt || 0);
        const bDate = new Date(b.createdAt || 0);
        return sortDirection === 'desc' 
          ? bDate.getTime() - aDate.getTime() 
          : aDate.getTime() - bDate.getTime();
      } else if (sortField === 'status') {
        // Sort by status: PASS > RISKY > FAIL
        const statusOrder = { PASS: 3, RISKY: 2, FAIL: 1 };
        const aValue = statusOrder[a.status] || 0;
        const bValue = statusOrder[b.status] || 0;
        return sortDirection === 'desc' 
          ? bValue - aValue 
          : aValue - bValue;
      } else if (sortField === 'score') {
        // Sort by score
        const aScore = typeof a.score === 'number' ? a.score : 0;
        const bScore = typeof b.score === 'number' ? b.score : 0;
        return sortDirection === 'desc' 
          ? bScore - aScore 
          : aScore - bScore;
      } else if (sortField === 'competitors') {
        // Sort by competitor count
        const aCount = a.productData?.competitors?.length || 0;
        const bCount = b.productData?.competitors?.length || 0;
        return sortDirection === 'desc'
          ? bCount - aCount
          : aCount - bCount;
      } else if (sortField === 'revenuePerCompetitor') {
        // Sort by revenue per competitor using improved calculation
        // Calculate revenue per competitor for item A
        const aCompetitors = a.productData?.competitors?.length || 0;
        const aTotalRevenue = a.metrics?.totalMarketCap || 
          (a.productData?.competitors?.reduce((sum, comp) => sum + (comp.monthlyRevenue || 0), 0) || 0);
        
        // First check if metrics has the value directly
        let aRevenue = a.metrics?.revenuePerCompetitor || 0;
        
        // If not available or zero, calculate it
        if (aRevenue === 0 && aCompetitors > 0 && aTotalRevenue > 0) {
          aRevenue = aTotalRevenue / aCompetitors;
        }
        
        // Try first competitor as fallback
        if (aRevenue === 0 && a.productData?.competitors?.length > 0) {
          const firstCompetitor = a.productData.competitors[0];
          if (firstCompetitor?.monthlyRevenue) {
            aRevenue = firstCompetitor.monthlyRevenue;
          }
        }

        // Calculate revenue per competitor for item B
        const bCompetitors = b.productData?.competitors?.length || 0;
        const bTotalRevenue = b.metrics?.totalMarketCap || 
          (b.productData?.competitors?.reduce((sum, comp) => sum + (comp.monthlyRevenue || 0), 0) || 0);
        
        // First check if metrics has the value directly
        let bRevenue = b.metrics?.revenuePerCompetitor || 0;
        
        // If not available or zero, calculate it
        if (bRevenue === 0 && bCompetitors > 0 && bTotalRevenue > 0) {
          bRevenue = bTotalRevenue / bCompetitors;
        }
        
        // Try first competitor as fallback
        if (bRevenue === 0 && b.productData?.competitors?.length > 0) {
          const firstCompetitor = b.productData.competitors[0];
          if (firstCompetitor?.monthlyRevenue) {
            bRevenue = firstCompetitor.monthlyRevenue;
          }
        }
        
        return sortDirection === 'desc'
          ? bRevenue - aRevenue
          : aRevenue - bRevenue;
      } else if (sortField === 'title') {
        // Sort by product title
        const aTitle = a.title || '';
        const bTitle = b.title || '';
        return sortDirection === 'desc'
          ? bTitle.localeCompare(aTitle)
          : aTitle.localeCompare(bTitle);
      }
      return 0;
    });
    
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedSubmissions.slice(startIndex, endIndex);
  };
  
  // Handle sort change
  const handleSortChange = (field) => {
    if (sortField === field) {
      // Toggle direction if clicking the same field
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      // New field, default to descending
      setSortField(field);
      setSortDirection('desc');
    }
    // Reset to first page when sorting changes
    setCurrentPage(1);
  };
  
  // Add helper functions for determining color based on our updated scales
  const getCompetitorColor = (count: number): string => {
    if (count < 10) return 'text-emerald-400';        // Great - under 10
    if (count < 15) return 'text-green-400';          // Good - under 15
    if (count < 25) return 'text-yellow-400';         // Caution - under 25
    return 'text-red-400';                            // Bad - 25+
  };

  const getRevenueColor = (revenue: number): string => {
    if (revenue >= 20000) return 'text-red-400';      // Bad - over 20k
    if (revenue >= 15000) return 'text-yellow-400';   // Caution - 15-20k
    if (revenue >= 7000) return 'text-green-400';     // Good - 7-15k
    if (revenue >= 5000) return 'text-yellow-400';    // Average - 5-7k
    return 'text-red-400';                            // Bad - under 5k
  };
  
  // Handle page changes
  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };
  
  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };
  
  // Handle items per page change
  const handleItemsPerPageChange = (e) => {
    setItemsPerPage(Number(e.target.value));
    setCurrentPage(1); // Reset to first page
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl p-6 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img
              src="/Elevate 2 - Icon.png"
              alt="Product Vetting Calculator Logo"
              className="h-12 w-auto object-contain"
            />
            <div>
              <img
                src="/ElevateAI.png"
                alt="ElevateAI"
                className="h-10 w-auto object-contain mb-1"
              />
              <p className="text-slate-400">Welcome, {user.name || user.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            Sign Out
          </button>
        </div>

        {/* Dashboard Tabs */}
        <div className="bg-slate-800/50 backdrop-blur-xl rounded-2xl overflow-hidden">
          <div className="flex border-b border-slate-700/50">
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-6 py-3 transition-colors ${
                activeTab === 'submissions'
                  ? 'bg-blue-500/30 text-blue-400 font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              My Products
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`px-6 py-3 transition-colors ${
                activeTab === 'new'
                  ? 'bg-emerald-500/30 text-emerald-400 font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              New Analysis
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'submissions' && (
              <>
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
                    <p className="text-slate-400">Loading your saved submissions...</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                    <p className="text-slate-300 mb-2">Failed to load submissions</p>
                    <p className="text-slate-400 mb-4">{error}</p>
                    <button
                      onClick={fetchSubmissions}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : submissions.length > 0 ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg text-white font-medium">Your Vetted Products</h2>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-sm">Total: {submissions.length}</span>
                        <button
                          onClick={fetchSubmissions}
                          className="px-3 py-1.5 bg-slate-700/50 hover:bg-slate-700 rounded-lg text-slate-300 hover:text-white transition-colors text-sm flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          Refresh Data
                        </button>
                      </div>
                    </div>
                    
                    {/* Action bar for bulk operations */}
                    <div className="flex justify-between items-center mb-4 bg-slate-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                            checked={getPaginatedSubmissions().every(sub => selectedSubmissions.includes(sub.id)) && getPaginatedSubmissions().length > 0}
                            onChange={selectAllCurrentPage}
                          />
                          <span>Select All</span>
                        </label>
                        {selectedSubmissions.length > 0 && (
                          <span className="text-slate-400 text-sm">
                            {selectedSubmissions.length} selected
                          </span>
                        )}
                      </div>
                      
                      {selectedSubmissions.length > 0 && (
                        <button
                          onClick={() => setIsDeleteConfirmOpen(true)}
                          className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm transition-colors flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete Selected
                        </button>
                      )}
                    </div>
                    
                    {/* Delete confirmation modal */}
                    {isDeleteConfirmOpen && (
                      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full">
                          <h3 className="text-xl font-semibold text-white mb-2">Confirm Deletion</h3>
                          <p className="text-slate-300 mb-6">
                            Are you sure you want to delete {selectedSubmissions.length} selected {selectedSubmissions.length === 1 ? 'submission' : 'submissions'}? This action cannot be undone.
                          </p>
                          <div className="flex justify-end gap-3">
                            <button
                              onClick={() => setIsDeleteConfirmOpen(false)}
                              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={deleteSelectedSubmissions}
                              className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Column-based table with sortable headers */}
                    <div className="overflow-x-auto bg-slate-800/30 rounded-lg">
                      <table className="w-full text-left table-auto">
                        <thead className="bg-slate-800/70 text-slate-300 text-xs uppercase">
                          <tr>
                            {/* Checkbox column */}
                            <th className="p-3 w-10">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                                checked={getPaginatedSubmissions().every(sub => selectedSubmissions.includes(sub.id)) && getPaginatedSubmissions().length > 0}
                                onChange={selectAllCurrentPage}
                              />
                            </th>
                            
                            {/* Date column */}
                            <th 
                              className={`p-3 cursor-pointer hover:bg-slate-700/30 ${sortField === 'date' ? 'text-blue-400' : ''}`}
                              onClick={() => handleSortChange('date')}
                            >
                              <div className="flex items-center">
                                Date
                                {sortField === 'date' && (
                                  <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            
                            {/* Product Idea column */}
                            <th 
                              className={`p-3 cursor-pointer hover:bg-slate-700/30 ${sortField === 'title' ? 'text-blue-400' : ''}`}
                              onClick={() => handleSortChange('title')}
                            >
                              <div className="flex items-center">
                                Product Idea
                                {sortField === 'title' && (
                                  <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            
                            {/* Total Competitors column */}
                            <th 
                              className={`p-3 cursor-pointer hover:bg-slate-700/30 ${sortField === 'competitors' ? 'text-blue-400' : ''}`}
                              onClick={() => handleSortChange('competitors')}
                            >
                              <div className="flex items-center">
                                Total Competitors
                                {sortField === 'competitors' && (
                                  <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            
                            {/* Revenue per Competitor column */}
                            <th 
                              className={`p-3 cursor-pointer hover:bg-slate-700/30 ${sortField === 'revenuePerCompetitor' ? 'text-blue-400' : ''}`}
                              onClick={() => handleSortChange('revenuePerCompetitor')}
                            >
                              <div className="flex items-center">
                                Revenue/Competitor
                                {sortField === 'revenuePerCompetitor' && (
                                  <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            
                            {/* Score column */}
                            <th 
                              className={`p-3 cursor-pointer hover:bg-slate-700/30 ${sortField === 'score' ? 'text-blue-400' : ''}`}
                              onClick={() => handleSortChange('score')}
                            >
                              <div className="flex items-center">
                                Market Score
                                {sortField === 'score' && (
                                  <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            
                            {/* Status column */}
                            <th 
                              className={`p-3 cursor-pointer hover:bg-slate-700/30 ${sortField === 'status' ? 'text-blue-400' : ''}`}
                              onClick={() => handleSortChange('status')}
                            >
                              <div className="flex items-center">
                                Status
                                {sortField === 'status' && (
                                  <span className="ml-1">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            
                            {/* Actions column */}
                            <th className="p-3 text-right">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {getPaginatedSubmissions().map((submission: any) => {
                            // Calculate revenue per competitor
                            const competitors = submission.productData?.competitors?.length || 0;
                            
                            // Try different possible locations for revenue data
                            const totalRevenue = submission.metrics?.totalMarketCap || 
                              (submission.productData?.competitors?.reduce((sum, comp) => 
                                sum + (comp.monthlyRevenue || 0), 0) || 0);
                              
                            // First check if metrics has the value directly
                            let revenuePerCompetitor = submission.metrics?.revenuePerCompetitor || 0;
                            
                            // If not available or zero, calculate it from totalRevenue and competitor count
                            if (revenuePerCompetitor === 0 && competitors > 0 && totalRevenue > 0) {
                              revenuePerCompetitor = totalRevenue / competitors;
                            }
                            
                            // If still zero, try to calculate from first competitor's revenue as a sample
                            if (revenuePerCompetitor === 0 && submission.productData?.competitors?.length > 0) {
                              const firstCompetitor = submission.productData.competitors[0];
                              if (firstCompetitor?.monthlyRevenue) {
                                revenuePerCompetitor = firstCompetitor.monthlyRevenue;
                              }
                            }
                            
                            return (
                              <tr 
                                key={submission.id} 
                                className="border-t border-slate-700/30 hover:bg-slate-700/20"
                              >
                                {/* Checkbox cell */}
                                <td className="p-3">
                                  <input 
                                    type="checkbox" 
                                    className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                                    checked={selectedSubmissions.includes(submission.id)}
                                    onChange={() => toggleSubmissionSelection(submission.id)}
                                  />
                                </td>
                                
                                {/* Date cell */}
                                <td className="p-3 text-xs text-slate-300">
                                  {formatDate(submission.createdAt)}
                                </td>
                                
                                {/* Product Idea cell */}
                                <td className="p-3">
                                  <div className="font-medium text-white text-sm">{submission.title || 'Untitled Analysis'}</div>
                                </td>
                                
                                {/* Total Competitors cell */}
                                <td className="p-3 text-sm text-center">
                                  <span className={`font-medium ${getCompetitorColor(competitors)}`}>
                                    {competitors}
                                  </span>
                                </td>
                                
                                {/* Revenue per Competitor cell */}
                                <td className="p-3 text-sm text-center">
                                  {revenuePerCompetitor > 0 ? (
                                    <span className={`font-medium ${getRevenueColor(revenuePerCompetitor)}`}>
                                      ${revenuePerCompetitor.toLocaleString(undefined, {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 0
                                      })}
                                    </span>
                                  ) : (
                                    <span className="text-slate-500">N/A</span>
                                  )}
                                </td>
                                
                                {/* Score cell */}
                                <td className="p-3">
                                  <div className={`text-center text-sm font-bold ${
                                    submission.score >= 70 ? 'text-emerald-400' :
                                    submission.score >= 40 ? 'text-amber-400' :
                                    'text-red-400'
                                  }`}>
                                    {typeof submission.score === 'number' ? submission.score.toFixed(1) : 'N/A'}%
                                    {submission.score >= 70 && <CheckCircle className="w-3.5 h-3.5 inline ml-1" />}
                                  </div>
                                </td>
                                
                                {/* Status cell */}
                                <td className="p-3">
                                  <div className="flex justify-center">
                                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                      submission.status === 'PASS' ? 'bg-emerald-500/20 text-emerald-400' :
                                      submission.status === 'RISKY' ? 'bg-amber-500/20 text-amber-400' :
                                      'bg-red-500/20 text-red-400'
                                    }`}>
                                      {submission.status || 'N/A'}
                                    </span>
                                  </div>
                                </td>
                                
                                {/* Actions cell */}
                                <td className="p-3 text-right">
                                  <Link
                                    href={`/submission/${submission.id}`}
                                    className="px-2.5 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition-colors"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      router.push(`/submission/${submission.id}`);
                                    }}
                                  >
                                    View Details
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                          
                          {getPaginatedSubmissions().length === 0 && (
                            <tr>
                              <td colSpan={8} className="p-4 text-center text-slate-400">
                                No products found
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Pagination controls */}
                    <div className="flex justify-between items-center pt-6 border-t border-slate-700/50">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-sm">Show</span>
                        <select 
                          value={itemsPerPage}
                          onChange={handleItemsPerPageChange}
                          className="bg-slate-800 border border-slate-700 rounded-md text-slate-300 text-sm px-2 py-1"
                        >
                          <option value={5}>5</option>
                          <option value={10}>10</option>
                          <option value={20}>20</option>
                        </select>
                        <span className="text-slate-400 text-sm">items per page</span>
                      </div>
                      
                      <div className="flex items-center">
                        <span className="text-slate-400 text-sm mr-4">
                          Page {currentPage} of {totalPages}
                        </span>
                        <div className="flex">
                          <button
                            onClick={handlePreviousPage}
                            disabled={currentPage === 1}
                            className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-l-lg"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <button
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages}
                            className="p-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-r-lg border-l border-slate-800"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <div className="flex justify-center mb-4">
                      <svg className="w-16 h-16 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-slate-300 font-medium mb-2">No saved analyses found</p>
                    <p className="text-slate-400 mb-6">Create a new analysis to calculate product market scores</p>
                    <button
                      onClick={() => setActiveTab('new')}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors"
                    >
                      Start Your First Analysis
                    </button>
                  </div>
                )}
              </>
            )}

            {activeTab === 'new' && (
              <div>
                <h2 className="text-xl font-semibold text-white mb-4">New Product Analysis</h2>
                <CsvUpload onSubmit={fetchSubmissions} userId={user.id} />
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Add a small reset link */}
      <div className="mt-8 text-center">
        <Link 
          href="/reset" 
          className="text-xs text-slate-500 hover:text-slate-400 transition" 
          title="Reset all saved submissions"
        >
          Reset Data
        </Link>
      </div>
    </div>
  );
} 