'use client';

import { PageShell } from '@/components/layout/PageShell';
import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, BookOpen, X, Play } from 'lucide-react';
import { PHASES, type PhaseKey } from '@/utils/phaseStyles';
import { LEARN_VIDEOS, type LearnSection, type LearnVideo } from '@/utils/learnVideos';

type Category = 'research' | 'vetting' | 'offering' | 'sourcing';

const categoryInfo: Record<Category, { title: string; description: string; phaseKey: PhaseKey }> = {
  research: {
    title: 'Research',
    description: 'Master product research techniques to identify profitable opportunities',
    phaseKey: 'research',
  },
  vetting: {
    title: 'Vetting',
    description: 'Navigate the vetting page, isolate true competitors, and deep dive into results, market signals and competitor analysis',
    phaseKey: 'vetting',
  },
  offering: {
    title: 'Offering',
    description: 'Create compelling product offerings, aggregate reviews and use the SSP Builder',
    phaseKey: 'offering',
  },
  sourcing: {
    title: 'Sourcing',
    description: 'Navigate sourcing, supplier quotes, profit overview and place orders',
    phaseKey: 'sourcing',
  },
};

const CATEGORIES: Category[] = ['research', 'vetting', 'offering', 'sourcing'];

const VALID_CATEGORIES = new Set<Category>(CATEGORIES);

function LearnPageContent() {
  const searchParams = useSearchParams();
  const sectionParam = searchParams.get('section') as Category | null;
  const initialCategory: Category =
    sectionParam && VALID_CATEGORIES.has(sectionParam) ? sectionParam : 'research';

  const [activeCategory, setActiveCategory] = useState<Category>(initialCategory);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVideo, setSelectedVideo] = useState<LearnVideo | null>(null);

  const videos =
    activeCategory === 'vetting'
      ? [...LEARN_VIDEOS['vetting'], ...LEARN_VIDEOS['vetting-detail']]
      : LEARN_VIDEOS[activeCategory as LearnSection];

  const filteredVideos = videos.filter(
    (video) =>
      video.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      video.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const { title, description, phaseKey } = categoryInfo[activeCategory];
  const tokens = PHASES[phaseKey];

  return (
    <PageShell
      title="Learning Center"
      subtitle="Master every phase of your product journey with our comprehensive video tutorials"
    >
      <div className="space-y-8">
        {/* Category Tabs */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-slate-700 p-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {CATEGORIES.map((category) => {
              const info = categoryInfo[category];
              const catTokens = PHASES[info.phaseKey];
              const isActive = activeCategory === category;

              return (
                <button
                  key={category}
                  onClick={() => {
                    setActiveCategory(category);
                    setSelectedVideo(null);
                    setSearchQuery('');
                  }}
                  className={`
                    px-4 py-3 rounded-xl font-semibold transition-all duration-300 text-sm
                    backdrop-blur-sm
                    ${isActive
                      ? `bg-gradient-to-br ${catTokens.bg} ${catTokens.border} border-2 ${catTokens.text} shadow-xl`
                      : `bg-gray-50 dark:bg-slate-900/50 text-gray-700 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 border border-gray-200 dark:border-slate-700`
                    }
                  `}
                  style={isActive ? { boxShadow: `0 0 18px ${catTokens.glow}` } : undefined}
                >
                  {info.title}
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
        <div
          className={`p-6 rounded-xl border backdrop-blur-sm ${tokens.bg} ${tokens.border}`}
          style={{ boxShadow: `0 0 18px ${tokens.glow}` }}
        >
          <div className="flex items-start space-x-4">
            <div className={`p-3 rounded-lg ${tokens.bg}`}>
              <BookOpen className={`w-6 h-6 ${tokens.text}`} />
            </div>
            <div>
              <h2 className={`text-2xl font-bold mb-2 ${tokens.text}`}>{title} Tutorials</h2>
              <p className="text-gray-700 dark:text-slate-300">{description}</p>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
                {filteredVideos.length} {filteredVideos.length === 1 ? 'video' : 'videos'} available
              </p>
            </div>
          </div>
        </div>

        {/* Video Player Modal */}
        {selectedVideo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                      {selectedVideo.label}
                    </h3>
                    <p className="text-gray-600 dark:text-slate-400">{selectedVideo.description}</p>
                  </div>
                  <button
                    onClick={() => setSelectedVideo(null)}
                    className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors ml-4 flex-shrink-0"
                  >
                    <X className="w-5 h-5 text-gray-400 hover:text-white" />
                  </button>
                </div>
                <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                  <iframe
                    key={selectedVideo.embedId}
                    src={`https://www.loom.com/embed/${selectedVideo.embedId}`}
                    frameBorder="0"
                    allowFullScreen
                    className="absolute top-0 left-0 w-full h-full rounded-lg bg-gray-900"
                    title={selectedVideo.label}
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
              const Icon = video.icon;

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
                  style={{ boxShadow: `0 4px 6px -1px rgba(0,0,0,0.1), 0 0 12px ${tokens.glow}` }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.boxShadow = `0 20px 25px -5px rgba(0,0,0,0.1), 0 0 24px ${tokens.glow}`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.boxShadow = `0 4px 6px -1px rgba(0,0,0,0.1), 0 0 12px ${tokens.glow}`;
                  }}
                >
                  {/* Thumbnail placeholder with icon */}
                  <div className="relative aspect-video bg-slate-900 overflow-hidden flex items-center justify-center">
                    <div className={`absolute inset-0 opacity-10 ${tokens.bg}`} />
                    <Icon className={`w-16 h-16 ${tokens.text} opacity-30`} />
                    {/* Play Button Overlay */}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform bg-white/10 backdrop-blur-sm border border-white/20"
                      >
                        <Play className={`w-8 h-8 ml-1 ${tokens.text}`} fill="currentColor" />
                      </div>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <div className={`inline-flex items-center gap-1.5 mb-2 px-2 py-0.5 rounded-full text-xs font-medium ${tokens.bg} ${tokens.text} border ${tokens.border}`}>
                      <Icon className="w-3 h-3" />
                      {title}
                    </div>
                    <h3 className={`text-lg font-semibold text-gray-900 dark:text-white mb-2 group-hover:${tokens.text} transition-colors`}>
                      {video.label}
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
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No videos found</h3>
            <p className="text-gray-600 dark:text-slate-400">
              Try adjusting your search query or selecting a different category
            </p>
          </div>
        )}
      </div>
    </PageShell>
  );
}

export default function LearnPage() {
  return (
    <Suspense fallback={<PageShell title="Learning Center" subtitle="Master every phase of your product journey with our comprehensive video tutorials"><div className="animate-pulse h-96 bg-slate-800 rounded-xl" /></PageShell>}>
      <LearnPageContent />
    </Suspense>
  );
}
