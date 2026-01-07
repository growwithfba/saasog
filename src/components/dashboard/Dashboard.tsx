'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  FileText,
  TrendingUp,
  Search,
  Share2,
  Trash2,
  User,
  LogOut,
  Package,
  BarChart3,
  DollarSign,
  ShoppingCart,
  Eye,
  HelpCircle,
  ArrowRight,
  PlayCircle,
  X,
  CreditCard
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { CsvUpload } from '../Upload/CsvUpload';
import VettedIcon from '../Icons/VettedIcon';
import OffersIcon from '../Icons/OfferIcon';
import SourcedIcon from '../Icons/SourcedIcon';

export function Dashboard() {
  const [user, setUser] = useState<any>(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('submissions');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const router = useRouter();
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  
  // Sorting state
  const [sortField, setSortField] = useState('date');
  const [sortDirection, setSortDirection] = useState('desc');
  
  // Selection state
  const [selectedSubmissions, setSelectedSubmissions] = useState<string[]>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [deletingSubmissionId, setDeletingSubmissionId] = useState<string | null>(null);
  const [sharingSubmissionId, setSharingSubmissionId] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [deleteConfirmSubmission, setDeleteConfirmSubmission] = useState<{id: string, name: string} | null>(null);
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);

  const [initialProductName, setInitialProductName] = useState<string>('');
  const [researchProductId, setResearchProductId] = useState<string>('');
  const [asin, setAsin] = useState<string>('');

  // Stage confirmation modals
  const [isOfferConfirmOpen, setIsOfferConfirmOpen] = useState(false);
  const [offerConfirmProduct, setOfferConfirmProduct] = useState<{ asin: string; title: string } | null>(null);
  const [isSourcingConfirmOpen, setIsSourcingConfirmOpen] = useState(false);
  const [sourcingConfirmProduct, setSourcingConfirmProduct] = useState<{ asin: string; title: string } | null>(null);

  useEffect(() => {
    // Check URL parameters for tab selection, product name, and research product ID
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    const productNameParam = urlParams.get('productName');
    const researchProductIdParam = urlParams.get('researchProductId');
    const asinParam = urlParams.get('asin');
    
    if (tabParam === 'new') {
      setActiveTab('new');
    }
    
    if (productNameParam) {
      setInitialProductName(decodeURIComponent(productNameParam));
    }
    
    if (researchProductIdParam) {
      setResearchProductId(decodeURIComponent(researchProductIdParam));
    }

    if (asinParam) {
      setAsin(decodeURIComponent(asinParam));
    }
    // Clean URL by removing query params after reading them
    if (tabParam || productNameParam || researchProductIdParam) {
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
    }
    
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
        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || supabaseUser.email?.split('@')[0] || 'User',
        created_at: supabaseUser.created_at
      });
      
      fetchSubmissions();
    };
    
    checkUser();
  }, [router]);
  
  // Update total pages when submissions change
  useEffect(() => {
    const filteredSubmissions = getFilteredSubmissions();
    setTotalPages(Math.max(1, Math.ceil(filteredSubmissions.length / itemsPerPage)));
    
    // If current page is beyond total pages, reset to page 1
    if (currentPage > Math.ceil(filteredSubmissions.length / itemsPerPage) && filteredSubmissions.length > 0) {
      setCurrentPage(1);
    }
  }, [submissions, itemsPerPage, searchTerm]);

  // Refresh submissions when activeTab changes to 'submissions' or when component first mounts
  useEffect(() => {
    if (user) {
      fetchSubmissions();
    }
  }, [user]);
  
  // Refresh when tab changes 
  useEffect(() => {
    if (activeTab === 'submissions' && user) {
      fetchSubmissions();
    }
  }, [activeTab]);

  const fetchSubmissions = async () => {
    if (!user) return;
    
    try {
      setLoading(true);
      setError(null);
      
      // Get session for authorization
      const { data: { session } } = await supabase.auth.getSession();

      const [researchRes, submissionsRes] = await Promise.all([
        fetch('/api/research', {
          headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          credentials: 'include',
        }),
        fetch(`/api/analyze?userId=${user.id}`, {
          headers: { ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }) },
          credentials: 'include',
        }),
      ]);
      
      if (researchRes.ok && submissionsRes.ok) {
        const researchData = await researchRes.json();
        const submissionsData = await submissionsRes.json();
        const updatedSubmissions: any[] = submissionsData.submissions.map((submission: any) => {
          const foundResearchProduct = researchData.data.find((product: any) => product.id === submission.research_product_id);
          if (foundResearchProduct) {
            return {
              ...submission,
              asin: foundResearchProduct.asin,
              is_vetted: foundResearchProduct.is_vetted,
              is_offered: foundResearchProduct.is_offered,
              is_sourced: foundResearchProduct.is_sourced,
            };
          }
          return submission;
        });
        setSubmissions(updatedSubmissions);
      }
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

  // Format date for better readability
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
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
      // Delete from Supabase
      const { error } = await supabase
        .from('submissions')
        .delete()
        .in('id', selectedSubmissions);
        
      if (error) {
        console.error('Supabase deletion error:', error);
      }
      
      // Update local state
      const updatedSubmissions = submissions.filter(
        submission => !selectedSubmissions.includes(submission.id)
      );
      
      setSubmissions(updatedSubmissions);
      setSelectedSubmissions([]);
      setIsDeleteConfirmOpen(false);
    } catch (error) {
      console.error('Error deleting submissions:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete submissions');
    }
  };

  // Show delete confirmation for individual submission
  const showDeleteConfirmation = (submissionId: string, submissionName: string) => {
    setDeleteConfirmSubmission({ id: submissionId, name: submissionName });
  };

  // Delete individual submission after confirmation
  const confirmDeleteIndividualSubmission = async () => {
    if (!deleteConfirmSubmission) return;
    
    const submissionId = deleteConfirmSubmission.id;
    setDeletingSubmissionId(submissionId);
    setDeleteConfirmSubmission(null);
    
    try {
      // Get session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      // Delete from Supabase
      const { error } = await supabase
        .from('submissions')
        .delete()
        .eq('id', submissionId);
        
      if (error) {
        console.error('Supabase deletion error:', error);
        setError('Failed to delete submission');
        return;
      }
      
      // Update local state
      const updatedSubmissions = submissions.filter(
        submission => submission.id !== submissionId
      );
      
      setSubmissions(updatedSubmissions);
    } catch (error) {
      console.error('Error deleting submission:', error);
      setError(error instanceof Error ? error.message : 'Failed to delete submission');
    } finally {
      setDeletingSubmissionId(null);
    }
  };

  // Share individual submission
  const shareSubmission = async (submissionId: string) => {
    setSharingSubmissionId(submissionId);
    
    try {
      // Get session for authorization
      const { data: { session } } = await supabase.auth.getSession();
      
      // Call the share API endpoint
      const response = await fetch('/api/submissions/share', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        credentials: 'include',
        body: JSON.stringify({ submissionId })
      });

      const data = await response.json();
      
      if (data.success) {
        const fullUrl = `${window.location.origin}/submission/${submissionId}`;
        setShareUrl(fullUrl);
        
        // Copy to clipboard
        await navigator.clipboard.writeText(fullUrl);
        
        // Show success message temporarily
        setTimeout(() => {
          setShareUrl('');
        }, 3000);
      } else {
        setError('Failed to share submission');
      }
    } catch (error) {
      console.error('Error sharing submission:', error);
      setError('Failed to share submission');
    } finally {
      setSharingSubmissionId(null);
    }
  };
  
  // Filter submissions based on search term
  const getFilteredSubmissions = () => {
    if (!searchTerm) return submissions;
    
    return submissions.filter(submission => {
      const searchLower = searchTerm.toLowerCase();
      return (
        submission.title?.toLowerCase().includes(searchLower) ||
        submission.productName?.toLowerCase().includes(searchLower) ||
        submission.status?.toLowerCase().includes(searchLower)
      );
    });
  };
  
  // Calculate progress score (1-3 based on stages completed: vetted, offered, sourced)
  const getProgressScore = (submission: any): number => {
    let score = 1; // Vetted is always 1 (products in this view are vetted)
    if (submission.is_offered) score += 1;
    if (submission.is_sourced) score += 1;
    return score;
  };

  // Function to get paginated submissions
  const getPaginatedSubmissions = () => {
    // First filter
    const filteredSubmissions = getFilteredSubmissions();
    
    // Then sort the submissions
    const sortedSubmissions = [...filteredSubmissions].sort((a, b) => {
      if (sortField === 'date') {
        const aDate = new Date(a.createdAt || 0);
        const bDate = new Date(b.createdAt || 0);
        return sortDirection === 'desc' 
          ? bDate.getTime() - aDate.getTime() 
          : aDate.getTime() - bDate.getTime();
      } else if (sortField === 'status') {
        const statusOrder = { PASS: 3, RISKY: 2, FAIL: 1 };
        const aValue = statusOrder[a.status] || 0;
        const bValue = statusOrder[b.status] || 0;
        return sortDirection === 'desc' 
          ? bValue - aValue 
          : aValue - bValue;
      } else if (sortField === 'score') {
        const aScore = typeof a.score === 'number' ? a.score : 0;
        const bScore = typeof b.score === 'number' ? b.score : 0;
        return sortDirection === 'desc' 
          ? bScore - aScore 
          : aScore - bScore;
      } else if (sortField === 'progress') {
        const aProgress = getProgressScore(a);
        const bProgress = getProgressScore(b);
        return sortDirection === 'desc' 
          ? bProgress - aProgress 
          : aProgress - bProgress;
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
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
    setCurrentPage(1);
  };
  
  // Get status badge color
  const getStatusColor = (status: string) => {
    switch(status) {
      case 'PASS': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/20';
      case 'RISKY': return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/20';
      case 'FAIL': return 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-500 border-red-200 dark:border-red-500/20';
      default: return 'bg-gray-50 dark:bg-gray-500/10 text-gray-700 dark:text-gray-500 border-gray-200 dark:border-gray-500/20';
    }
  };
  
  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-600 dark:text-emerald-500';
    if (score >= 40) return 'text-amber-600 dark:text-amber-500';
    return 'text-red-600 dark:text-red-500';
  };

  // Handle offer icon click
  const handleOfferClick = (submission: any) => {
    if (submission.is_offered) {
      // Already offered, navigate directly
      router.push(`/offer/${submission.asin}`);
      return;
    }
    // Show confirmation modal to move to offer stage
    setOfferConfirmProduct({ asin: submission.asin, title: submission.productName || submission.title || submission.asin });
    setIsOfferConfirmOpen(true);
  };

  const confirmOfferNavigation = () => {
    if (offerConfirmProduct) {
      router.push(`/offer/${offerConfirmProduct.asin}`);
    }
    setIsOfferConfirmOpen(false);
    setOfferConfirmProduct(null);
  };

  // Handle sourcing icon click
  const handleSourcingClick = (submission: any) => {
    if (!submission.is_offered) {
      // Product is not offered yet, cannot proceed to sourcing
      return;
    }
    if (submission.is_sourced) {
      // Already sourced, navigate directly
      router.push(`/sourcing/${submission.asin}`);
      return;
    }
    // Show confirmation modal to move to sourcing stage
    setSourcingConfirmProduct({ asin: submission.asin, title: submission.productName || submission.title || submission.asin });
    setIsSourcingConfirmOpen(true);
  };

  const confirmSourcingNavigation = () => {
    if (sourcingConfirmProduct) {
      router.push(`/sourcing/${sourcingConfirmProduct.asin}`);
    }
    setIsSourcingConfirmOpen(false);
    setSourcingConfirmProduct(null);
  };

  if (!user) {
    return null;
  }

  // Calculate stats
  const totalSubmissions = submissions.length;
  const passCount = submissions.filter(s => s.status === 'PASS').length;
  const avgScore = submissions.length > 0 
    ? (submissions.reduce((acc, s) => acc + (s.score || 0), 0) / submissions.length).toFixed(1)
    : '0';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-900">
      {/* Modern Navigation Bar */}
      <nav className="bg-white/80 dark:bg-slate-900/50 backdrop-blur-xl border-b border-gray-200 dark:border-slate-700/50 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <img
                src="/grow-with-fba-banner.png"
                alt="Grow Logo"
                className="h-10 w-auto object-contain"
              />
              <div className="hidden sm:block">
                {/* <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                  Grow With FBA AI
                </h1> */}
              </div>
            </div>

            {/* Right Side - Learn Button, Theme Toggle and User Menu */}
            <div className="flex items-center gap-3">
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-800/50 hover:bg-gray-200 dark:hover:bg-slate-800/70 transition-all duration-200 transform hover:scale-105 border-b-2 border-r-2 border-lime-500 text-gray-800 dark:text-white">
                <Link href="/research">
                  <span className="hidden sm:inline font-medium">Research</span>
                </Link>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-800/50 hover:bg-gray-200 dark:hover:bg-slate-800/70 transition-all duration-200 transform hover:scale-105 border-b-2 border-r-2 border-yellow-500 text-gray-800 dark:text-white">
                <Link href="/vetting">
                  <span className="hidden sm:inline font-medium">Vetting</span>
                </Link>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-800/50 hover:bg-gray-200 dark:hover:bg-slate-800/70 transition-all duration-200 transform hover:scale-105 border-b-2 border-r-2 border-orange-500 text-gray-800 dark:text-white">
                <Link href="/offer">
                  <span className="hidden sm:inline font-medium">Offer</span>
                </Link>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-slate-800/50 hover:bg-gray-200 dark:hover:bg-slate-800/70 transition-all duration-200 transform hover:scale-105 border-b-2 border-r-2 border-blue-500 text-gray-800 dark:text-white">
                <Link href="/sourcing">
                  <span className="hidden sm:inline font-medium">Sourcing</span>
                </Link>
              </button>
              {/* Learn Button */}
              <button
                onClick={() => setIsLearnModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/30 rounded-lg text-purple-300 hover:text-purple-200 transition-all duration-200 transform hover:scale-105"
              >
                <PlayCircle className="w-4 h-4" />
                <span className="hidden sm:inline font-medium">Learn</span>
              </button>
              
              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {user.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</p>
                    <p className="text-xs text-gray-600 dark:text-slate-400">{user.email}</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-600 dark:text-slate-400 transition-transform ${isProfileOpen ? 'rotate-90' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700/50 overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-slate-700/50">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{user.name}</p>
                      <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">{user.email}</p>
                      <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">Member since {formatDate(user.created_at)}</p>
                    </div>
                    
                    <div className="p-2">
                      <Link 
                        href="/profile"
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-left"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <User className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                        <span className="text-sm text-gray-700 dark:text-slate-300">Profile Settings</span>
                      </Link>
                      <Link 
                        href="/subscription"
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors text-left"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <CreditCard className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                        <span className="text-sm text-gray-700 dark:text-slate-300">Subscription</span>
                      </Link>
                      <hr className="my-2 border-gray-200 dark:border-slate-700/50" />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left group"
                      >
                        <LogOut className="w-4 h-4 text-gray-600 dark:text-slate-400 group-hover:text-red-600 dark:group-hover:text-red-400" />
                        <span className="text-sm text-gray-700 dark:text-slate-300 group-hover:text-red-600 dark:group-hover:text-red-400">Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section with Stats */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2 border-b-2 border-yellow-500 pb-2">
            Vetted Products
          </h2>
          <p className="text-gray-600 dark:text-slate-400">Here's an overview of your product analysis</p>
          
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white/90 dark:bg-slate-800/50 backdrop-blur-xl rounded-xl p-4 border border-gray-200 dark:border-slate-700/50 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 dark:text-slate-400 text-sm">Total Products</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{totalSubmissions}</p>
                </div>
                <Package className="w-8 h-8 text-blue-500/50" />
              </div>
            </div>
            
            <div className="bg-white/90 dark:bg-slate-800/50 backdrop-blur-xl rounded-xl p-4 border border-gray-200 dark:border-slate-700/50 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 dark:text-slate-400 text-sm">Passed Products</p>
                  <p className="text-2xl font-bold text-emerald-500 mt-1">{passCount}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-emerald-500/50" />
              </div>
            </div>
            
            <div className="bg-white/90 dark:bg-slate-800/50 backdrop-blur-xl rounded-xl p-4 border border-gray-200 dark:border-slate-700/50 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 dark:text-slate-400 text-sm">Average Score</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{avgScore}%</p>
                </div>
                <BarChart3 className="w-8 h-8 text-purple-500/50" />
              </div>
            </div>
            
            <div className="bg-white/90 dark:bg-slate-800/50 backdrop-blur-xl rounded-xl p-4 border border-gray-200 dark:border-slate-700/50 shadow-md">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-600 dark:text-slate-400 text-sm">Success Rate</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {totalSubmissions > 0 ? Math.round((passCount / totalSubmissions) * 100) : 0}%
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-amber-500/50" />
              </div>
            </div>
          </div>
        </div>

        {/* Main Dashboard Content */}
        <div className="bg-white/90 dark:bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-gray-200 dark:border-slate-700/50 overflow-hidden shadow-lg">
          {/* Modern Tab Navigation */}
          <div className="flex border-b border-gray-200 dark:border-slate-700/50 bg-gray-50 dark:bg-slate-800/50">
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-6 py-4 font-medium transition-all relative ${
                activeTab === 'submissions'
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Vetted Products
              </span>
              {activeTab === 'submissions' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
              )}
            </button>
            <button
              onClick={() => {
                setActiveTab('new');
                // Smooth scroll to the "Keep Building..." section after a short delay
                setTimeout(() => {
                  const element = document.getElementById('keep-building-section');
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }, 100);
              }}
              className={`px-6 py-4 font-medium transition-all relative ${
                activeTab === 'new'
                  ? 'text-gray-900 dark:text-white'
                  : 'text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2" id="keep-building-section" >
                <Plus className="w-4 h-4" />
                Product Analysis Engine
              </span>
              {activeTab === 'new' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
              )}
            </button>
          </div>

          {/* Tab Content */}
          <div className="p-6">
            {activeTab === 'submissions' && (
              <>
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <Loader2 className="h-12 w-12 text-blue-500 animate-spin mb-4" />
                    <p className="text-gray-600 dark:text-slate-400">Loading your products...</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-16">
                    <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
                    <p className="text-gray-900 dark:text-slate-300 mb-2">Failed to load submissions</p>
                    <p className="text-gray-600 dark:text-slate-400 mb-4">{error}</p>
                    <button
                      onClick={fetchSubmissions}
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors"
                    >
                      Try Again
                    </button>
                  </div>
                ) : submissions.length > 0 ? (
                  <div className="space-y-4">
                    {/* Search and Filter Bar */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-6">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400 dark:text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search products..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900/50 border border-gray-300 dark:border-slate-700/50 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-400 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                        />
                      </div>
                      {selectedSubmissions.length > 0 && (() => {
                        // Get the selected product to determine which action button to show
                        const selectedProduct = submissions?.find((s: any) => s.id === selectedSubmissions[0]);
                        const isSingleSelection = selectedSubmissions.length === 1;
                        
                        // Determine the next action based on product status (products here are already vetted)
                        const getNextAction = () => {
                          if (!selectedProduct) return null;
                          if (!selectedProduct.is_offered) return 'offer';
                          if (selectedProduct.is_offered && !selectedProduct.is_sourced) return 'source';
                          return null; // Product has completed all stages
                        };
                        
                        const nextAction = getNextAction();
                        
                        return (
                          <div className="flex items-center gap-2">
                            {nextAction && (
                              <div className="relative inline-block">
                                <div 
                                  className="relative group"
                                  onMouseEnter={(e) => {
                                    if (!isSingleSelection) {
                                      const tooltip = e.currentTarget.querySelector('.action-disabled-tooltip') as HTMLElement;
                                      if (tooltip) {
                                        tooltip.classList.remove('opacity-0', 'invisible');
                                        tooltip.classList.add('opacity-100', 'visible');
                                      }
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    const tooltip = e.currentTarget.querySelector('.action-disabled-tooltip') as HTMLElement;
                                    if (tooltip) {
                                      tooltip.classList.remove('opacity-100', 'visible');
                                      tooltip.classList.add('opacity-0', 'invisible');
                                    }
                                  }}
                                >
                                  {nextAction === 'offer' && (
                                    <button
                                      onClick={() => {
                                        if (isSingleSelection && selectedProduct) {
                                          handleOfferClick(selectedProduct);
                                        }
                                      }}
                                      disabled={!isSingleSelection}
                                      className={`px-4 py-2 border rounded-lg transition-colors flex items-center gap-2 ${
                                        !isSingleSelection
                                          ? 'bg-gray-100 dark:bg-slate-700/30 border-gray-300 dark:border-slate-600/30 text-gray-500 dark:text-slate-500 cursor-not-allowed'
                                          : 'bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/50 text-orange-600 dark:text-orange-300'
                                      }`}
                                    >
                                      <OffersIcon />
                                      Offer
                                    </button>
                                  )}
                                  {nextAction === 'source' && (
                                    <button
                                      onClick={() => {
                                        if (isSingleSelection && selectedProduct) {
                                          handleSourcingClick(selectedProduct);
                                        }
                                      }}
                                      disabled={!isSingleSelection}
                                      className={`px-4 py-2 border rounded-lg transition-colors flex items-center gap-2 ${
                                        !isSingleSelection
                                          ? 'bg-gray-100 dark:bg-slate-700/30 border-gray-300 dark:border-slate-600/30 text-gray-500 dark:text-slate-500 cursor-not-allowed'
                                          : 'bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/50 text-blue-600 dark:text-blue-300'
                                      }`}
                                    >
                                      <SourcedIcon />
                                      Source
                                    </button>
                                  )}
                                  {!isSingleSelection && (
                                    <div className="action-disabled-tooltip absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1 px-4 py-2.5 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-lg shadow-2xl text-gray-900 dark:text-white text-xs leading-relaxed w-[350px] opacity-0 invisible transition-all duration-200 pointer-events-none z-[10000] whitespace-normal">
                                      <div className="font-medium mb-1 text-gray-900 dark:text-white">Cannot process multiple products</div>
                                      <div className="text-gray-600 dark:text-slate-300">You can only process one product at a time. Select a single product to continue.</div>
                                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-px border-4 border-transparent border-t-white dark:border-t-slate-900"></div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            <button
                              onClick={() => setIsDeleteConfirmOpen(true)}
                              className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-400 transition-colors flex items-center gap-2"
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete ({selectedSubmissions.length})
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                    
                    {/* Modern Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-200 dark:border-slate-700/50">
                            <th className="text-left p-4">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                                checked={getPaginatedSubmissions().every(sub => selectedSubmissions.includes(sub.id)) && getPaginatedSubmissions().length > 0}
                                onChange={selectAllCurrentPage}
                              />
                            </th>
                            <th 
                              className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                              onClick={() => handleSortChange('date')}
                            >
                              <div className="flex items-center gap-1">
                                Date
                                {sortField === 'date' && (
                                  <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            <th className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider">
                              Product
                            </th>
                            <th 
                              className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                              onClick={() => handleSortChange('score')}
                            >
                              <div className="flex items-center gap-1">
                                Score
                                {sortField === 'score' && (
                                  <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            <th 
                              className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                              onClick={() => handleSortChange('status')}
                            >
                              <div className="flex items-center gap-1">
                                Status
                                {sortField === 'status' && (
                                  <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            <th 
                              className="text-left p-4 text-xs font-medium text-gray-600 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-gray-900 dark:hover:text-white transition-colors"
                              onClick={() => handleSortChange('progress')}
                            >
                              <div className="flex items-center gap-1">
                                Progress
                                {sortField === 'progress' && (
                                  <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700/30">
                          {getPaginatedSubmissions().map((submission: any) => (
                            <tr 
                              key={submission.id} 
                              className="hover:bg-gray-100 dark:hover:bg-slate-700/20 transition-colors cursor-pointer"
                              onClick={(e) => {
                                // Don't navigate if clicking on checkbox, buttons, or other interactive elements
                                const target = e.target as HTMLElement;
                                if (target.tagName === 'INPUT' || target.tagName === 'BUTTON' || target.closest('button') || target.closest('input')) {
                                  return;
                                }
                                // Navigate to submission page
                                router.push(`/vetting/${submission.asin}`);
                              }}
                            >
                              <td className="p-4">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 rounded border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                                  checked={selectedSubmissions.includes(submission.id)}
                                  onChange={() => toggleSubmissionSelection(submission.id)}
                                />
                              </td>
                              <td className="p-4 text-sm text-gray-700 dark:text-slate-300">
                                {formatDate(submission.createdAt)}
                              </td>
                              <td className="p-4">
                                <div>
                                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {submission.productName || submission.title || 'Untitled'}
                                  </p>
                                  <p className="text-xs text-gray-600 dark:text-slate-400 mt-1">
                                    {submission.productData?.competitors?.length || 0} competitors analyzed
                                  </p>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-full max-w-[100px] bg-gray-300 dark:bg-slate-700/50 rounded-full h-2 overflow-hidden">
                                    <div 
                                      className={`h-full transition-all ${
                                        submission.score >= 70 ? 'bg-emerald-500' :
                                        submission.score >= 40 ? 'bg-amber-500' :
                                        'bg-red-500'
                                      }`}
                                      style={{ width: `${Math.min(100, submission.score || 0)}%` }}
                                    />
                                  </div>
                                  <span className={`text-sm font-medium ${getScoreColor(submission.score)}`}>
                                    {typeof submission.score === 'number' ? submission.score.toFixed(1) : '0'}%
                                  </span>
                                </div>
                              </td>
                              <td className="p-4">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(submission.status)}`}>
                                  {submission.status || 'N/A'}
                                </span>
                              </td>
                              <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center gap-2">
                                  <VettedIcon />
                                  <button 
                                    className="cursor-pointer hover:opacity-80 transition-opacity"
                                    title={!submission.is_offered ? 'Move to Offer Builder' : 'Go to Offer Builder'}
                                    onClick={() => handleOfferClick(submission)}
                                  >
                                    <OffersIcon isDisabled={!submission.is_offered} />
                                  </button>
                                  <button 
                                    className={`${!submission.is_offered ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'} transition-opacity`}
                                    title={!submission.is_offered ? 'Product must be offered first' : (!submission.is_sourced ? 'Move to Sourcing' : 'Go to Sourcing')}
                                    onClick={() => handleSourcingClick(submission)}
                                    disabled={!submission.is_offered}
                                  >
                                    <SourcedIcon isDisabled={!submission.is_sourced} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="flex justify-between items-center pt-4">
                        <p className="text-sm text-gray-600 dark:text-slate-400">
                          Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, getFilteredSubmissions().length)} of {getFilteredSubmissions().length} results
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg bg-gray-200 dark:bg-slate-700/50 hover:bg-gray-300 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                          </button>
                          <span className="px-3 py-1 text-sm text-gray-700 dark:text-slate-300">
                            {currentPage} / {totalPages}
                          </span>
                          <button
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-lg bg-gray-200 dark:bg-slate-700/50 hover:bg-gray-300 dark:hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-slate-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-700/50 mb-4">
                      <Package className="w-8 h-8 text-gray-400 dark:text-slate-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Your Brand Starts with One Winning Product 🌱</h3>
                    <p className="text-gray-600 dark:text-slate-400 mb-6">
                    Instantly validate your first product idea with AI-powered competitor insights.</p>
                    <button
                      onClick={() => setActiveTab('new')}
                      className="px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 rounded-lg text-white font-medium transition-all transform hover:scale-105 shadow-md hover:shadow-lg"
                    >
                      <span className="flex items-center gap-2">
                        Validate My First Product
                        <ArrowRight className="w-5 h-5" />
                      </span>
                    </button>
                  </div>
                )}
              </>
            )}

            {activeTab === 'new' && (
              <div className="space-y-8">
                {/* Header Section */}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-2xl mb-6">
                    <TrendingUp className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">Keep Building — Your Next Winning Product Awaits 🚀</h3>
                  <p className="text-xl text-gray-700 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
                    Upload competitor data to instantly see if your next FBA product is launch-ready with AI-powered insights.
                  </p>
                  
                  {/* Feature Pills */}
                  <div className="flex flex-wrap justify-center gap-3 mb-8">
                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-full">
                      <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-blue-700 dark:text-blue-300 text-sm font-medium">Market Analysis</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-full">
                      <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-300 text-sm font-medium">Revenue Insights</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-full">
                      <ShoppingCart className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-purple-700 dark:text-purple-300 text-sm font-medium">Competitor Intelligence</span>
                    </div>
                  </div>
                </div>

                {/* Upload Component */}
                <div className="mx-auto">
                  <CsvUpload onSubmit={fetchSubmissions} userId={user.id} initialProductName={initialProductName} researchProductId={researchProductId} asin={asin} />
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Confirm Deletion</h3>
            <p className="text-gray-700 dark:text-slate-300 mb-6">
              Are you sure you want to delete {selectedSubmissions.length} selected {selectedSubmissions.length === 1 ? 'product' : 'products'}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
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

      {/* Individual Delete Confirmation Modal */}
      {deleteConfirmSubmission && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Delete Submission</h3>
                <p className="text-gray-600 dark:text-slate-400 text-sm">This action cannot be undone</p>
              </div>
            </div>
            
            <div className="bg-gray-100 dark:bg-slate-700/30 rounded-lg p-4 mb-6">
              <p className="text-gray-700 dark:text-slate-300 text-sm mb-2">You are about to delete:</p>
              <p className="text-gray-900 dark:text-white font-medium">{deleteConfirmSubmission.name}</p>
            </div>
            
            <p className="text-gray-700 dark:text-slate-300 mb-6">
              Are you sure you want to delete this product analysis? All data including competitor analysis, scores, and insights will be permanently removed.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmSubmission(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteIndividualSubmission}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Product
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share Success Notification */}
      {shareUrl && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="bg-emerald-600 text-white px-6 py-4 rounded-xl shadow-lg flex items-center gap-3 animate-in slide-in-from-bottom-2 duration-300">
            <CheckCircle className="w-5 h-5" />
            <div>
              <p className="font-medium">Link copied to clipboard!</p>
              <p className="text-emerald-100 text-sm">Anyone with this link can view the submission</p>
            </div>
          </div>
        </div>
      )}

      {/* Learn Modal */}
      {isLearnModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-gray-200 dark:border-slate-700/50 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-slate-700/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
                  <PlayCircle className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">Learn How to Use Grow With FBA AI</h3>
                  <p className="text-gray-600 dark:text-slate-400 text-sm">Complete platform walkthrough and tutorial</p>
                </div>
              </div>
              <button
                onClick={() => setIsLearnModalOpen(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              <div className="bg-gray-100 dark:bg-slate-900/50 rounded-xl p-4 mb-4">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                    <HelpCircle className="w-4 h-4 text-blue-400" />
                  </div>
                  <div>
                    <h4 className="text-gray-900 dark:text-white font-medium mb-2">What you'll learn:</h4>
                    <ul className="text-gray-700 dark:text-slate-300 text-sm space-y-1">
                      <li>• How to upload and analyze competitor data</li>
                      <li>• Understanding product vetting scores and insights</li>
                      <li>• Interpreting market analysis and competitor intelligence</li>
                      <li>• Making data-driven decisions for your FBA business</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Embedded Loom Video */}
              <div className="relative w-full" style={{ paddingBottom: '56.25%' /* 16:9 aspect ratio */ }}>
                <iframe
                  src="https://www.loom.com/embed/018f2b3c96de4f4e8f0fa0ec6c557ae5?sid=352565bc-5d64-41ac-a659-daa91f6259bf"
                  frameBorder="0"
                  allowFullScreen
                  className="absolute top-0 left-0 w-full h-full rounded-lg"
                  title="Grow With FBA AI Tutorial"
                ></iframe>
              </div>

              {/* Call to Action */}
              <div className="mt-6 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-900 dark:text-white font-medium">Ready to analyze your first product?</p>
                    <p className="text-gray-600 dark:text-slate-400 text-sm">Upload competitor data and get instant insights</p>
                  </div>
                  <button
                    onClick={() => {
                      setIsLearnModalOpen(false);
                      setActiveTab('new');
                      // Smooth scroll to the upload section after a short delay
                      setTimeout(() => {
                        const element = document.getElementById('keep-building-section');
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }, 100);
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 rounded-lg text-white font-medium transition-all transform hover:scale-105 flex items-center gap-2"
                  >
                    Get Started
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offer Confirmation Modal */}
      {isOfferConfirmOpen && offerConfirmProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-orange-500/20 rounded-xl flex items-center justify-center">
                <Package className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Go to Offer Builder</h3>
                <p className="text-gray-600 dark:text-slate-400 text-sm">Build your product offer</p>
              </div>
            </div>
            <p className="text-gray-700 dark:text-slate-300 mb-6">
              You are about to open the Offer Builder for <span className="font-semibold text-gray-900 dark:text-white">{offerConfirmProduct.title}</span>. This will allow you to analyze reviews and create your SSP.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsOfferConfirmOpen(false);
                  setOfferConfirmProduct(null);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmOfferNavigation}
                className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                Open Offer Builder
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sourcing Confirmation Modal */}
      {isSourcingConfirmOpen && sourcingConfirmProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <ShoppingCart className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Go to Sourcing</h3>
                <p className="text-gray-600 dark:text-slate-400 text-sm">Find suppliers for your product</p>
              </div>
            </div>
            <p className="text-gray-700 dark:text-slate-300 mb-6">
              You are about to open the Sourcing page for <span className="font-semibold text-gray-900 dark:text-white">{sourcingConfirmProduct.title}</span>. This will allow you to find and manage suppliers.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setIsSourcingConfirmOpen(false);
                  setSourcingConfirmProduct(null);
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmSourcingNavigation}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <ArrowRight className="w-4 h-4" />
                Open Sourcing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}