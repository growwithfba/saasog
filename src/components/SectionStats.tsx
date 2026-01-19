import StatCard, { StatCardProps } from "@/components/StatCard";
import { LightsaberUnderline } from './LightsaberUnderline';

interface SectionStatsProps {
  description: string;
  stats: StatCardProps[];
  learnButton?: React.ReactNode;
}

const SectionStats = ({ description, stats, learnButton }: SectionStatsProps) => {

  const renderStats = () => {
    return stats.map((statItem, index) => (
      <StatCard key={`stat-${index}-${statItem.title}`} {...statItem} />
    ));
  };

  return (
    <div>
      {/* Welcome Section with Stats */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white relative mb-2 pb-2">
            Research Funnel
            {/* Part F: Lightsaber underline */}
            <div className="absolute bottom-0 left-0">
              <LightsaberUnderline phase="research" width="320px" />
            </div>
          </h2>
          {learnButton && <div>{learnButton}</div>}
        </div>
        <p className="text-gray-700 dark:text-slate-400">{description}</p>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          {renderStats()}
        </div>
      </div>
    </div>
  );
};

export default SectionStats;