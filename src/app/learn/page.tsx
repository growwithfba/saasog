'use client';

import { PageShell } from '@/components/layout/PageShell';
import { useState } from 'react';
import { Play, Search, BookOpen } from 'lucide-react';
import { PHASES, type PhaseKey } from '@/utils/phaseStyles';

type Category = 'research' | 'vetting' | 'offering' | 'sourcing';

interface Video {
  id: string;
  title: string;
  description: string;
  duration: string;
  thumbnail: string;
  videoUrl: string;
  category: Category;
}

// Demo videos data - Replace with actual video data
const videosData: Video[] = [
  // Research Videos
  {
    id: 'research-1',
    title: 'Introduction to Product Research',
    description: 'Learn the fundamentals of product research and how to identify profitable opportunities.',
    duration: '12:30',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'research'
  },
  {
    id: 'research-2',
    title: 'Advanced Research Techniques',
    description: 'Deep dive into advanced strategies for market analysis and competitor research.',
    duration: '18:45',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'research'
  },
  {
    id: 'research-3',
    title: 'Using Data Analytics for Research',
    description: 'How to leverage data analytics tools to make informed research decisions.',
    duration: '15:20',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'research'
  },
  // Vetting Videos
  {
    id: 'vetting-1',
    title: 'Product Vetting Essentials',
    description: 'Understanding the key criteria for vetting potential products.',
    duration: '14:15',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'vetting'
  },
  {
    id: 'vetting-2',
    title: 'Supplier Verification Process',
    description: 'Step-by-step guide to verifying and validating supplier credentials.',
    duration: '16:30',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'vetting'
  },
  {
    id: 'vetting-3',
    title: 'Quality Control & Testing',
    description: 'Learn about quality control measures and product testing protocols.',
    duration: '13:45',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'vetting'
  },
  // Offering Videos
  {
    id: 'offering-1',
    title: 'Creating Compelling Product Listings',
    description: 'Master the art of creating product listings that convert.',
    duration: '17:20',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'offering'
  },
  {
    id: 'offering-2',
    title: 'Pricing Strategies That Work',
    description: 'Discover effective pricing strategies to maximize profits.',
    duration: '19:10',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'offering'
  },
  {
    id: 'offering-3',
    title: 'Optimizing Product Images',
    description: 'Best practices for product photography and image optimization.',
    duration: '11:55',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'offering'
  },
  // Sourcing Videos
  {
    id: 'sourcing-1',
    title: 'Finding Reliable Suppliers',
    description: 'How to identify and connect with reliable product suppliers.',
    duration: '20:30',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'sourcing'
  },
  {
    id: 'sourcing-2',
    title: 'Negotiating with Suppliers',
    description: 'Effective negotiation tactics to get the best deals.',
    duration: '16:45',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'sourcing'
  },
  {
    id: 'sourcing-3',
    title: 'International Sourcing Guide',
    description: 'Navigate the complexities of international product sourcing.',
    duration: '22:15',
    thumbnail: '/api/placeholder/400/225',
    videoUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    category: 'sourcing'
  }
];

const categoryInfo = {
  research: {
    title: 'Research',
    description: 'Master product research techniques to identify profitable opportunities',
    gradient: 'from-blue-500/90 via-blue-400/60 to-blue-500/90',
    buttonGradient: 'from-blue-900/30 via-blue-800/20 to-slate-800/50',
  },
  vetting: {
    title: 'Vetting',
    description: 'Learn how to properly vet products and suppliers',
    gradient: 'from-cyan-500/90 via-teal-400/60 to-cyan-500/90',
    buttonGradient: 'from-cyan-900/30 via-teal-800/20 to-slate-800/50',
  },
  offering: {
    title: 'Offering',
    description: 'Create compelling product offerings that convert',
    gradient: 'from-emerald-500/90 via-emerald-400/60 to-emerald-500/90',
    buttonGradient: 'from-emerald-900/30 via-emerald-800/20 to-slate-800/50',
  },
  sourcing: {
    title: 'Sourcing',
    description: 'Find and negotiate with reliable product suppliers',
    gradient: 'from-lime-500/90 via-lime-400/60 to-lime-500/90',
    buttonGradient: 'from-lime-900/30 via-lime-800/20 to-slate-800/50',
  }
};

export default function LearnPage() {
  const [activeCategory, setActiveCategory] = useState<Category>('research');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);

  const filteredVideos = videosData.filter(video => {
    const matchesCategory = video.category === activeCategory;
    const matchesSearch = video.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         video.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <PageShell 
      title="Learning Center"
      subtitle="Master every phase of your product journey with our comprehensive video tutorials"
    >
      <div className="space-y-8">
        {/* Category Tabs */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(Object.keys(categoryInfo) as Category[]).map((category) => {
              const phaseKey = category as PhaseKey;
              const tokens = PHASES[phaseKey];
              
              return (
                <button
                  key={category}
                  onClick={() => {
                    setActiveCategory(category);
                    setSelectedVideo(null);
                  }}
                  className={`
                    px-6 py-3 rounded-xl font-semibold transition-all duration-300
                    backdrop-blur-sm
                    ${activeCategory === category
                      ? `bg-gradient-to-br ${categoryInfo[category].buttonGradient} ${tokens.border} border-2 ${tokens.text} shadow-xl`
                      : `bg-gray-50 dark:bg-slate-900/50 text-gray-700 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700`
                    }
                  `}
                  style={activeCategory === category ? {
                    boxShadow: `0 0 18px ${tokens.glow}`,
                  } : undefined}
                >
                  {categoryInfo[category].title}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search videos..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Category Info Banner */}
        {(() => {
          const phaseKey = activeCategory as PhaseKey;
          const tokens = PHASES[phaseKey];
          
          return (
            <div 
              className={`
                p-6 rounded-xl border backdrop-blur-sm
                ${tokens.bg} ${tokens.border}
              `}
              style={{
                boxShadow: `0 0 18px ${tokens.glow}`,
              }}
            >
              <div className="flex items-start space-x-4">
                <div className={`
                  p-3 rounded-lg
                  ${tokens.bg}
                `}>
                  <BookOpen className={`w-6 h-6 ${tokens.text}`} />
                </div>
                <div>
                  <h2 className={`text-2xl font-bold mb-2 ${tokens.text}`}>
                    {categoryInfo[activeCategory].title} Tutorials
                  </h2>
                  <p className="text-gray-700 dark:text-slate-300">
                    {categoryInfo[activeCategory].description}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
                    {filteredVideos.length} {filteredVideos.length === 1 ? 'video' : 'videos'} available
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Video Player Modal */}
        {selectedVideo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {selectedVideo.title}
                    </h3>
                    <p className="text-gray-600 dark:text-slate-400">
                      {selectedVideo.description}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedVideo(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl font-bold"
                  >
                    ×
                  </button>
                </div>
                <div className="aspect-video bg-gray-900 rounded-lg overflow-hidden">
                  <iframe
                    src={selectedVideo.videoUrl}
                    className="w-full h-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Videos Grid */}
        {filteredVideos.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVideos.map((video) => {
              const phaseKey = video.category as PhaseKey;
              const tokens = PHASES[phaseKey];
              
              return (
                <div
                  key={video.id}
                  className={`
                    bg-white dark:bg-slate-800 rounded-xl border overflow-hidden 
                    transition-all duration-300 cursor-pointer group
                    hover:scale-[1.02] backdrop-blur-sm
                    ${tokens.border}
                  `}
                  onClick={() => setSelectedVideo(video)}
                  style={{
                    boxShadow: `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 0 12px ${tokens.glow}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 0 24px ${tokens.glow}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = `0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 0 12px ${tokens.glow}`;
                  }}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-video bg-gray-200 dark:bg-slate-700 overflow-hidden">
                    <img
                      src={video.thumbnail}
                      alt={video.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                    {/* Play Button Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 group-hover:bg-black/50 transition-colors">
                      <div 
                        className={`w-16 h-16 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform ${tokens.bg}`}
                        style={{
                          backgroundColor: `${tokens.glow}`,
                        }}
                      >
                        <Play className={`w-8 h-8 ml-1 ${tokens.text}`} fill="currentColor" />
                      </div>
                    </div>
                    {/* Duration Badge */}
                    <div className={`absolute bottom-2 right-2 px-2 py-1 ${tokens.bg} ${tokens.text} text-xs font-medium rounded border ${tokens.border}`}>
                      {video.duration}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <h3 className={`text-lg font-semibold text-gray-900 dark:text-white mb-2 group-hover:${tokens.text} transition-colors`}>
                      {video.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-slate-400 line-clamp-2">
                      {video.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 dark:bg-slate-800 mb-4">
              <Search className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No videos found
            </h3>
            <p className="text-gray-600 dark:text-slate-400">
              Try adjusting your search query or selecting a different category
            </p>
          </div>
        )}
      </div>
    </PageShell>
  );
}
