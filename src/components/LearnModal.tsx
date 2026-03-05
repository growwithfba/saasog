import { PlayCircle, HelpCircle, ArrowRight, X, LayoutGrid } from 'lucide-react';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { LEARN_VIDEOS, type LearnSection as Section } from '@/utils/learnVideos';

// vetting-detail maps to vetting in the learn page (they are merged there)
const LEARN_PAGE_SECTION: Record<Section, string> = {
  research: 'research',
  vetting: 'vetting',
  'vetting-detail': 'vetting',
  offering: 'offering',
  sourcing: 'sourcing',
};

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


type SectionColors = {
  gradient: string;
  gradientHover: string;
  iconBg: string;
  iconText: string;
  iconShadow: string;
  containerBorder: string;
  containerShadow: string;
  headerDivider: string;
  glowBlob: string;
  tabActiveShadow: string;
  tabActiveBorder: string;
  ctaBg: string;
  ctaBorder: string;
};

const SECTION_COLORS: Record<Section, SectionColors> = {
  research: {
    gradient: 'from-blue-500 to-blue-400',
    gradientHover: 'hover:from-blue-600 hover:to-blue-500',
    iconBg: 'bg-blue-500/20',
    iconText: 'text-blue-400',
    iconShadow: 'shadow-lg shadow-blue-500/40',
    containerBorder: 'border-blue-500/40',
    containerShadow: 'shadow-2xl shadow-blue-500/20',
    headerDivider: 'border-blue-500/20',
    glowBlob: 'bg-blue-500',
    tabActiveShadow: 'shadow-md shadow-blue-500/40',
    tabActiveBorder: 'border border-blue-400/60',
    ctaBg: 'from-blue-500/10 to-blue-400/10',
    ctaBorder: 'border-blue-500/30',
  },
  vetting: {
    gradient: 'from-cyan-500 to-cyan-400',
    gradientHover: 'hover:from-cyan-600 hover:to-cyan-500',
    iconBg: 'bg-cyan-500/20',
    iconText: 'text-cyan-400',
    iconShadow: 'shadow-lg shadow-cyan-500/40',
    containerBorder: 'border-cyan-500/40',
    containerShadow: 'shadow-2xl shadow-cyan-500/20',
    headerDivider: 'border-cyan-500/20',
    glowBlob: 'bg-cyan-500',
    tabActiveShadow: 'shadow-md shadow-cyan-500/40',
    tabActiveBorder: 'border border-cyan-400/60',
    ctaBg: 'from-cyan-500/10 to-cyan-400/10',
    ctaBorder: 'border-cyan-500/30',
  },
  'vetting-detail': {
    gradient: 'from-cyan-500 to-cyan-400',
    gradientHover: 'hover:from-cyan-600 hover:to-cyan-500',
    iconBg: 'bg-cyan-500/20',
    iconText: 'text-cyan-400',
    iconShadow: 'shadow-lg shadow-cyan-500/40',
    containerBorder: 'border-cyan-500/40',
    containerShadow: 'shadow-2xl shadow-cyan-500/20',
    headerDivider: 'border-cyan-500/20',
    glowBlob: 'bg-cyan-500',
    tabActiveShadow: 'shadow-md shadow-cyan-500/40',
    tabActiveBorder: 'border border-cyan-400/60',
    ctaBg: 'from-cyan-500/10 to-cyan-400/10',
    ctaBorder: 'border-cyan-500/30',
  },
  offering: {
    gradient: 'from-emerald-500 to-emerald-400',
    gradientHover: 'hover:from-emerald-600 hover:to-emerald-500',
    iconBg: 'bg-emerald-500/20',
    iconText: 'text-emerald-400',
    iconShadow: 'shadow-lg shadow-emerald-500/40',
    containerBorder: 'border-emerald-500/40',
    containerShadow: 'shadow-2xl shadow-emerald-500/20',
    headerDivider: 'border-emerald-500/20',
    glowBlob: 'bg-emerald-500',
    tabActiveShadow: 'shadow-md shadow-emerald-500/40',
    tabActiveBorder: 'border border-emerald-400/60',
    ctaBg: 'from-emerald-500/10 to-emerald-400/10',
    ctaBorder: 'border-emerald-500/30',
  },
  sourcing: {
    gradient: 'from-lime-700 to-lime-600',
    gradientHover: 'hover:from-lime-800 hover:to-lime-700',
    iconBg: 'bg-lime-600/15',
    iconText: 'text-lime-500',
    iconShadow: 'shadow-lg shadow-lime-600/25',
    containerBorder: 'border-lime-600/30',
    containerShadow: 'shadow-2xl shadow-lime-600/10',
    headerDivider: 'border-lime-600/15',
    glowBlob: 'bg-lime-700',
    tabActiveShadow: 'shadow-md shadow-lime-600/25',
    tabActiveBorder: 'border border-lime-600/40',
    ctaBg: 'from-lime-700/10 to-lime-600/10',
    ctaBorder: 'border-lime-600/20',
  },
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
  const videos = LEARN_VIDEOS[section];
  const colors = SECTION_COLORS[section];

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
      <div className={`bg-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border ${colors.containerBorder} ${colors.containerShadow} relative`}>
        {/* Neon glow blobs */}
        <div className={`absolute top-0 right-0 w-48 h-48 ${colors.glowBlob} rounded-full blur-3xl opacity-10 pointer-events-none`} />
        <div className={`absolute bottom-0 left-0 w-36 h-36 ${colors.glowBlob} rounded-full blur-3xl opacity-8 pointer-events-none`} />

        {/* Modal Header */}
        <div className={`flex items-center justify-between p-6 border-b ${colors.headerDivider} relative`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 bg-gradient-to-r ${colors.gradient} ${colors.iconShadow} rounded-xl flex items-center justify-center`}>
              <PlayCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Learn How to Use BloomEngine</h3>
              <p className="text-slate-400 text-sm">Complete platform walkthrough and tutorial</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/learn?section=${LEARN_PAGE_SECTION[section]}`}
              onClick={onClose}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-gradient-to-r ${colors.gradient} text-white opacity-80 hover:opacity-100 transition-opacity`}
            >
              <LayoutGrid className="w-4 h-4" />
              Learning Hub
            </Link>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-slate-400 hover:text-white" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="p-6 relative">
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
                      ? `bg-gradient-to-r ${colors.gradient} text-white ${colors.tabActiveShadow} ${colors.tabActiveBorder}`
                      : 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-white border border-transparent'
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
              <div className={`w-8 h-8 ${colors.iconBg} rounded-lg flex items-center justify-center flex-shrink-0 mt-1`}>
                <HelpCircle className={`w-4 h-4 ${colors.iconText}`} />
              </div>
              <div>
                <h4 className="text-white font-medium mb-1">{activeVideo.title ?? activeVideo.label}</h4>
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
          <div className={`mt-6 p-4 bg-gradient-to-r ${colors.ctaBg} border ${colors.ctaBorder} rounded-xl`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-white font-medium">Ready to analyze your first product?</p>
                <p className="text-slate-400 text-sm">Upload competitor data and get instant insights</p>
              </div>
              <a
                href="https://www.skool.com/growwithfba/about"
                target="_blank"
                rel="noopener noreferrer"
                className={`px-4 py-2 bg-gradient-to-r ${colors.gradient} ${colors.gradientHover} rounded-lg text-white font-medium transition-all transform hover:scale-105 flex items-center gap-2`}
              >
                Get Started
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LearnModal;
