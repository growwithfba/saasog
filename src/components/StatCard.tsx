export interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  colorValue?: string;
}

const StatCard = ({ title, value, icon, colorValue = 'text-white dark:text-white' }: StatCardProps) => {
  return (
    <div className="bg-white/90 dark:bg-slate-800/50 backdrop-blur-xl rounded-xl p-3 border border-gray-200 dark:border-slate-700/50 shadow-md">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 dark:text-slate-400 text-sm">{title}</p>
          <p className={`text-2xl font-bold ${colorValue} mt-1`}>{value}</p>
        </div>
        {icon}
      </div>
    </div>
  );
};

export default StatCard;