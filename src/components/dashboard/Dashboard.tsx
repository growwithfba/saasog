'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CsvUpload } from '@/components/Upload/CsvUpload';
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle, 
  ChevronLeft, 
  ChevronRight,
  Plus,
  FileText,
  TrendingUp,
  Users,
  Calendar,
  Search,
  Filter,
  Download,
  Share2,
  Trash2,
  MoreVertical,
  User,
  Settings,
  LogOut,
  Package,
  BarChart3,
  DollarSign,
  ShoppingCart,
  Eye,
  HelpCircle
} from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';

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

  useEffect(() => {
    // Check URL parameters for tab selection
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam === 'new') {
      setActiveTab('new');
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
      
      // Fetch from API with authorization header
      const response = await fetch(`/api/analyze?userId=${user.id}`, {
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        credentials: 'include'
      });
      
      if (response.ok) {
        const apiData = await response.json();
        
        if (apiData.success && apiData.submissions) {
          setSubmissions(apiData.submissions);
        }
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
      case 'PASS': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'RISKY': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'FAIL': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };
  
  // Get score color
  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-500';
    if (score >= 40) return 'text-amber-500';
    return 'text-red-500';
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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Modern Navigation Bar */}
      <nav className="bg-slate-900/50 backdrop-blur-xl border-b border-slate-700/50 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <img
                src="/Grow5.png"
                alt="Grow Logo"
                className="h-10 w-auto object-contain"
              />
              <div className="hidden sm:block">
                <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                  GROW with FBA AI
                </h1>
              </div>
            </div>

            {/* Right Side - User Menu */}
            <div className="flex items-center gap-4">
              {/* Profile Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsProfileOpen(!isProfileOpen)}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 flex items-center justify-center">
                    <span className="text-white text-sm font-semibold">
                      {user.name?.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="hidden sm:block text-left">
                    <p className="text-sm font-medium text-white">{user.name}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </div>
                  <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${isProfileOpen ? 'rotate-90' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                {isProfileOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-800 rounded-xl shadow-xl border border-slate-700/50 overflow-hidden">
                    <div className="p-4 border-b border-slate-700/50">
                      <p className="text-sm font-medium text-white">{user.name}</p>
                      <p className="text-xs text-slate-400 mt-1">{user.email}</p>
                      <p className="text-xs text-slate-500 mt-2">Member since {formatDate(user.created_at)}</p>
                    </div>
                    
                    <div className="p-2">
                      <Link 
                        href="/profile"
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors text-left"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <User className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-300">Profile Settings</span>
                      </Link>
                      <Link 
                        href="/preferences"
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors text-left"
                        onClick={() => setIsProfileOpen(false)}
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-300">Preferences</span>
                      </Link>
                      <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors text-left">
                        <HelpCircle className="w-4 h-4 text-slate-400" />
                        <span className="text-sm text-slate-300">Help & Support</span>
                      </button>
                      <hr className="my-2 border-slate-700/50" />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-red-500/10 transition-colors text-left group"
                      >
                        <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-400" />
                        <span className="text-sm text-slate-300 group-hover:text-red-400">Sign Out</span>
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
          <h2 className="text-3xl font-bold text-white mb-2">
            Welcome back, {user.name}! 👋
          </h2>
          <p className="text-slate-400">Here's an overview of your product analysis</p>
          
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Total Products</p>
                  <p className="text-2xl font-bold text-white mt-1">{totalSubmissions}</p>
                </div>
                <Package className="w-8 h-8 text-blue-500/50" />
              </div>
            </div>
            
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Passed Products</p>
                  <p className="text-2xl font-bold text-emerald-500 mt-1">{passCount}</p>
                </div>
                <CheckCircle className="w-8 h-8 text-emerald-500/50" />
              </div>
            </div>
            
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Average Score</p>
                  <p className="text-2xl font-bold text-white mt-1">{avgScore}%</p>
                </div>
                <BarChart3 className="w-8 h-8 text-purple-500/50" />
              </div>
            </div>
            
            <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-4 border border-slate-700/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-400 text-sm">Success Rate</p>
                  <p className="text-2xl font-bold text-white mt-1">
                    {totalSubmissions > 0 ? Math.round((passCount / totalSubmissions) * 100) : 0}%
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-amber-500/50" />
              </div>
            </div>
          </div>
        </div>

        {/* Main Dashboard Content */}
        <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 overflow-hidden">
          {/* Modern Tab Navigation */}
          <div className="flex border-b border-slate-700/50 bg-slate-800/50">
            <button
              onClick={() => setActiveTab('submissions')}
              className={`px-6 py-4 font-medium transition-all relative ${
                activeTab === 'submissions'
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                My Products
              </span>
              {activeTab === 'submissions' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab('new')}
              className={`px-6 py-4 font-medium transition-all relative ${
                activeTab === 'new'
                  ? 'text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span className="flex items-center gap-2">
                <Plus className="w-4 h-4" />
                New Analysis
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
                    <p className="text-slate-400">Loading your products...</p>
                  </div>
                ) : error ? (
                  <div className="flex flex-col items-center justify-center py-16">
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
                    {/* Search and Filter Bar */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-6">
                      <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search products..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50"
                        />
                      </div>
                      <button className="px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-slate-300 hover:text-white transition-colors flex items-center gap-2">
                        <Filter className="w-4 h-4" />
                        Filters
                      </button>
                      {selectedSubmissions.length > 0 && (
                        <button
                          onClick={() => setIsDeleteConfirmOpen(true)}
                          className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-400 transition-colors flex items-center gap-2"
                        >
                          <Trash2 className="w-4 h-4" />
                          Delete ({selectedSubmissions.length})
                        </button>
                      )}
                    </div>
                    
                    {/* Modern Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-700/50">
                            <th className="text-left p-4">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                                checked={getPaginatedSubmissions().every(sub => selectedSubmissions.includes(sub.id)) && getPaginatedSubmissions().length > 0}
                                onChange={selectAllCurrentPage}
                              />
                            </th>
                            <th 
                              className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                              onClick={() => handleSortChange('date')}
                            >
                              <div className="flex items-center gap-1">
                                Date
                                {sortField === 'date' && (
                                  <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                              Product
                            </th>
                            <th 
                              className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
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
                              className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors"
                              onClick={() => handleSortChange('status')}
                            >
                              <div className="flex items-center gap-1">
                                Status
                                {sortField === 'status' && (
                                  <span className="text-blue-400">{sortDirection === 'desc' ? '↓' : '↑'}</span>
                                )}
                              </div>
                            </th>
                            <th className="text-left p-4 text-xs font-medium text-slate-400 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/30">
                          {getPaginatedSubmissions().map((submission: any) => (
                            <tr 
                              key={submission.id} 
                              className="hover:bg-slate-700/20 transition-colors"
                            >
                              <td className="p-4">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 rounded border-slate-600 bg-slate-700 text-blue-500 focus:ring-2 focus:ring-blue-500"
                                  checked={selectedSubmissions.includes(submission.id)}
                                  onChange={() => toggleSubmissionSelection(submission.id)}
                                />
                              </td>
                              <td className="p-4 text-sm text-slate-300">
                                {formatDate(submission.createdAt)}
                              </td>
                              <td className="p-4">
                                <div>
                                  <p className="text-sm font-medium text-white">
                                    {submission.productName || submission.title || 'Untitled'}
                                  </p>
                                  <p className="text-xs text-slate-400 mt-1">
                                    {submission.productData?.competitors?.length || 0} competitors analyzed
                                  </p>
                                </div>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-full max-w-[100px] bg-slate-700/50 rounded-full h-2 overflow-hidden">
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
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <Link
                                    href={`/submission/${submission.id}`}
                                    className="p-2 bg-blue-500/20 hover:bg-blue-500/30 rounded-lg text-blue-400 transition-colors"
                                    title="View Details"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </Link>
                                  <button
                                    onClick={() => shareSubmission(submission.id)}
                                    disabled={sharingSubmissionId === submission.id}
                                    className="p-2 bg-emerald-500/20 hover:bg-emerald-500/30 rounded-lg text-emerald-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Share Submission"
                                  >
                                    {sharingSubmissionId === submission.id ? (
                                      <div className="w-4 h-4 border-2 border-emerald-400/30 border-t-emerald-400 rounded-full animate-spin" />
                                    ) : (
                                      <Share2 className="w-4 h-4" />
                                    )}
                                  </button>
                                  <button
                                    onClick={() => showDeleteConfirmation(submission.id, submission.productName || submission.title || 'Untitled')}
                                    disabled={deletingSubmissionId === submission.id}
                                    className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Delete Submission"
                                  >
                                    {deletingSubmissionId === submission.id ? (
                                      <div className="w-4 h-4 border-2 border-red-400/30 border-t-red-400 rounded-full animate-spin" />
                                    ) : (
                                      <Trash2 className="w-4 h-4" />
                                    )}
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
                        <p className="text-sm text-slate-400">
                          Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, getFilteredSubmissions().length)} of {getFilteredSubmissions().length} results
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronLeft className="w-4 h-4 text-slate-400" />
                          </button>
                          <span className="px-3 py-1 text-sm text-slate-300">
                            {currentPage} / {totalPages}
                          </span>
                          <button
                            onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-700/50 mb-4">
                      <Package className="w-8 h-8 text-slate-500" />
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">No products analyzed yet</h3>
                    <p className="text-slate-400 mb-6">Start by analyzing your first product to see market insights</p>
                    <button
                      onClick={() => setActiveTab('new')}
                      className="px-6 py-3 bg-gradient-to-r from-blue-500 to-emerald-500 hover:from-blue-600 hover:to-emerald-600 rounded-lg text-white font-medium transition-all transform hover:scale-105"
                    >
                      <span className="flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        Analyze Your First Product
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
                  <h3 className="text-3xl font-bold text-white mb-4">Analyze Your Next Winning Product</h3>
                  <p className="text-xl text-slate-300 mb-8 max-w-2xl mx-auto">
                    Upload your competitor research data and get AI-powered insights to make informed decisions about your Amazon FBA product selection.
                  </p>
                  
                  {/* Feature Pills */}
                  <div className="flex flex-wrap justify-center gap-3 mb-8">
                    <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full">
                      <BarChart3 className="w-4 h-4 text-blue-400" />
                      <span className="text-blue-300 text-sm font-medium">Market Analysis</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                      <DollarSign className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-300 text-sm font-medium">Revenue Insights</span>
                    </div>
                    <div className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full">
                      <ShoppingCart className="w-4 h-4 text-purple-400" />
                      <span className="text-purple-300 text-sm font-medium">Competitor Intelligence</span>
                    </div>
                  </div>
                </div>

                {/* Upload Component */}
                <div className="mx-auto">
                  <CsvUpload onSubmit={fetchSubmissions} userId={user.id} />
                </div>

              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700/50">
            <h3 className="text-xl font-semibold text-white mb-2">Confirm Deletion</h3>
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete {selectedSubmissions.length} selected {selectedSubmissions.length === 1 ? 'product' : 'products'}? This action cannot be undone.
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

      {/* Individual Delete Confirmation Modal */}
      {deleteConfirmSubmission && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 max-w-md w-full border border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Delete Submission</h3>
                <p className="text-slate-400 text-sm">This action cannot be undone</p>
              </div>
            </div>
            
            <div className="bg-slate-700/30 rounded-lg p-4 mb-6">
              <p className="text-slate-300 text-sm mb-2">You are about to delete:</p>
              <p className="text-white font-medium">{deleteConfirmSubmission.name}</p>
            </div>
            
            <p className="text-slate-300 mb-6">
              Are you sure you want to delete this product analysis? All data including competitor analysis, scores, and insights will be permanently removed.
            </p>
            
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmSubmission(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white transition-colors"
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
    </div>
  );
}