import StatCard, { StatCardProps } from "@/components/StatCard";

interface SectionStatsProps {
  description: string;
  stats: StatCardProps[];
}

const SectionStats = ({ description, stats }: SectionStatsProps) => {

  const renderStats = () => {
    return stats.map((statItem, index) => (
      <StatCard key={`stat-${index}-${statItem.title}`} {...statItem} />
    ));
  };

  return (
    <div>
        {/* Welcome Section with Stats */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2 border-b border-lime-600 pb-2">
            Research Funnel
          </h2>
          <p className="text-slate-400">{description}</p>
          
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
            {renderStats()}
          </div>
        </div>
      </div>
  );
};

export default SectionStats;