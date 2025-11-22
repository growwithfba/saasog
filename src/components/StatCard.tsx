export interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  colorValue?: string;
}

const StatCard = ({ title, value, icon, colorValue = 'text-white' }: StatCardProps) => {
  return (
    <div className="bg-slate-800/50 backdrop-blur-xl rounded-xl p-3 border border-slate-700/50">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-sm">{title}</p>
          <p className={`text-2xl font-bold ${colorValue} mt-1`}>{value}</p>
        </div>
        {icon}
      </div>
    </div>
  );
};

export default StatCard;