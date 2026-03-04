import { PlayCircle, HelpCircle, ArrowRight, X, FileText, Plus, BookOpen, CheckCircle, BarChart2, TrendingUp, Star, MessageSquare, Package, DollarSign, ShoppingCart } from 'lucide-react';
import { useState, useEffect } from 'react';

type Section = 'research' | 'vetting' | 'vetting-detail' | 'offering' | 'sourcing';

interface LearnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAction: () => void;
  section?: Section;
  activeTab?: string;
  // Legacy props kept for backward compatibility
  researchTab?: string;
  vettingTab?: string;
  // Offer detail props
  offerTab?: string;
  offerHasInsights?: boolean;
  // Sourcing detail props
  sourcingTab?: string;
}

const VIDEOS: Record<Section, { id: string; label: string; icon: React.ElementType; embedId: string; description: string }[]> = {
  research: [
    {
      id: 'submissions',
      label: 'My Research Funnel',
      icon: FileText,
      embedId: '0e3851ed69bf4e55952e4e9ced552ad8',
      description: 'Learn how to manage and analyze products in your research funnel.',
    },
    {
      id: 'new',
      label: 'Fill My Funnel',
      icon: Plus,
      embedId: '3f05af44a8ef4a7d9c6bd24cccfd4fa0',
      description: 'Discover how to find and add new products to your funnel.',
    },
    {
      id: 'overview',
      label: 'Platform Overview',
      icon: BookOpen,
      embedId: '0b724bb5c2a5468485e66985b3f24a8e',
      description: 'Full platform walkthrough — available anytime.',
    },
  ],
  vetting: [
    {
      id: 'submissions',
      label: 'Navigating the Vetting Page',
      icon: CheckCircle,
      embedId: 'ca1cd736f02f42a1b00e36bf751dccd9',
      description: 'Navigating the Vetting Page',
    },
    {
      id: 'overview',
      label: 'Vetting Page Isolating True Competitors',
      icon: BookOpen,
      embedId: '1457a5aba3234d3bb51cf815ce1c5aea',
      description: 'Vetting Page Isolating True Competitors',
    },
  ],
  offering: [
    {
      id: 'navigating',
      label: 'Navigating the Offering Page',
      icon: FileText,
      embedId: 'ab40103a9b484537a3ac1e5fc77f37e9',
      description: 'Navigating the Offering Page',
    },
    {
      id: 'aggregate-reviews',
      label: 'How to Aggregate Reviews',
      icon: MessageSquare,
      embedId: 'bf064a0cdbb34c80917a328f55ea7bf3',
      description: 'How to Aggregate Reviews',
    },
    {
      id: 'ai-insights',
      label: 'Reading Your AI Review Insights',
      icon: Star,
      embedId: 'f43fc0aeef6f48688f4594a5429b7e04',
      description: 'Reading Your AI Review Insights',
    },
    {
      id: 'ssp-builder',
      label: 'Using the SSP Builder Hub',
      icon: Package,
      embedId: '9cd03891ed84432eb8bc757d5367506e',
      description: 'Using the SSP Builder Hub',
    },
  ],
  sourcing: [
    {
      id: 'navigating',
      label: 'Navigating the Sourcing Page',
      icon: FileText,
      embedId: '39fb6e21c6184965962e6f8ebb5dd65d',
      description: 'Navigating the Sourcing Page',
    },
    {
      id: 'supplier-quotes',
      label: 'Supplier Quotes Tab',
      icon: Package,
      embedId: '61ae039ba1dd46df9531dce3d192ab31',
      description: 'Supplier Quotes Tab',
    },
    {
      id: 'profit-overview',
      label: 'Profit Overview Tab',
      icon: DollarSign,
      embedId: 'fd10140a1cfa44cea7469c5a06034a5a',
      description: 'Profit Overview Tab',
    },
    {
      id: 'place-order',
      label: 'Place Order Tab',
      icon: ShoppingCart,
      embedId: 'b4d2db8cde9544cab058bb3ca11eca1d',
      description: 'Place Order Tab',
    },
  ],
  'vetting-detail': [
    {
      id: 'understanding',
      label: 'Understanding Vetting Results',
      icon: CheckCircle,
      embedId: '11728f2aef7b4e82a40cd21efd75d4ad',
      description: 'Understanding Vetting Results',
    },
    {
      id: 'competitors',
      label: 'Detailed Competitor Analysis Section',
      icon: BarChart2,
      embedId: '9413df68fbc84a26ac18974337af1fbb',
      description: 'Detailed Competitor Analysis Section',
    },
    {
      id: 'market',
      label: 'Market Signals Section',
      icon: TrendingUp,
      embedId: '665929d4f9d44cd9b7792ad398c8d6d7',
      description: 'Market Signals Section',
    },
  ],
};

const resolveSection = (props: LearnModalProps): Section => {
  if (props.section) return props.section;
  if (props.vettingTab !== undefined) return 'vetting';
  return 'research';
};

const resolveDefaultVideo = (
  section: Section,
  activeTab?: string,
  researchTab?: string,
  vettingTab?: string,
  offerTab?: string,
  offerHasInsights?: boolean,
  sourcingTab?: string,
): string => {
  const tab = activeTab ?? researchTab ?? vettingTab;
  if (section === 'research') return tab === 'new' ? 'new' : 'submissions';
  if (section === 'vetting') return 'submissions';
  if (section === 'offering') {
    if (offerTab === 'review-aggregator') return offerHasInsights ? 'ai-insights' : 'aggregate-reviews';
    if (offerTab === 'ssp-builder') return 'ssp-builder';
    return 'navigating';
  }
  if (section === 'sourcing') {
    if (sourcingTab === 'profit') return 'profit-overview';
    if (sourcingTab === 'placeOrder') return 'place-order';
    return 'navigating';
  }
  return 'understanding';
};

const LearnModal = (props: LearnModalProps) => {
  const { isOpen, onClose, onAction, section: sectionProp, activeTab, researchTab, vettingTab, offerTab, offerHasInsights, sourcingTab } = props;

  const section = resolveSection(props);
  const videos = VIDEOS[section];

  const getDefaultVideo = () => resolveDefaultVideo(section, activeTab, researchTab, vettingTab, offerTab, offerHasInsights, sourcingTab);

  const [selectedVideo, setSelectedVideo] = useState(getDefaultVideo);

  useEffect(() => {
    if (isOpen) setSelectedVideo(getDefaultVideo());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sectionProp, activeTab, researchTab, vettingTab, offerTab, offerHasInsights, sourcingTab]);

  if (!isOpen) return null;

  const activeVideo = videos.find((v) => v.id === selectedVideo) ?? videos[0];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-slate-700/50 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
              <PlayCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Learn How to Use Grow with BloomEngine AI</h3>
              <p className="text-slate-400 text-sm">Complete platform walkthrough and tutorial</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400 hover:text-white" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          {/* Video Selector Tabs */}
          <div className="flex flex-wrap gap-2 mb-5">
            {videos.map((video) => {
              const Icon = video.icon;
              const isActive = selectedVideo === video.id;
              return (
                <button
                  key={video.id}
                  onClick={() => setSelectedVideo(video.id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-md'
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {video.label}
                </button>
              );
            })}
          </div>

          {/* Video description */}
          <div className="bg-slate-900/50 rounded-xl p-4 mb-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                <HelpCircle className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h4 className="text-white font-medium mb-1">{activeVideo.label}</h4>
                <p className="text-slate-300 text-sm">{activeVideo.description}</p>
              </div>
            </div>
          </div>

          {/* Embedded Loom Video */}
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              key={activeVideo.embedId}
              src={`https://www.loom.com/embed/${activeVideo.embedId}`}
              frameBorder="0"
              allowFullScreen
              className="absolute top-0 left-0 w-full h-full rounded-lg"
              title={activeVideo.label}
            />
          </div>

          {/* Call to Action */}
          <div className="mt-6 p-4 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Ready to analyze your first product?</p>
                <p className="text-slate-400 text-sm">Upload competitor data and get instant insights</p>
              </div>
              <button
                onClick={onAction}
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
  );
};

export default LearnModal;
