import { PhaseType, headerNumberClass, headerNumberGlowStyle } from '@/utils/phaseStyles';
import { PANEL } from '@/components/ui/surfaces';

export interface StatCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  colorValue?: string;
  phase?: PhaseType;
  reached?: boolean; // Whether this phase is reached/unlocked
}

const StatCard = ({ title, value, icon, colorValue, phase, reached = true }: StatCardProps) => {
  // Part E: Use phase colors when phase is provided, otherwise use legacy colorValue
  const numberClasses = phase 
    ? headerNumberClass(phase, reached)
    : (colorValue || 'text-gray-900 dark:text-white');
  
  const numberStyle = phase 
    ? headerNumberGlowStyle(phase, reached)
    : {};

  return (
    <div className={`${PANEL.replace('rounded-2xl', 'rounded-xl')} p-3`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 dark:text-slate-400 text-sm">{title}</p>
          <p 
            className={`text-2xl font-bold ${numberClasses} mt-1`}
            style={numberStyle}
          >
            {value}
          </p>
        </div>
        {icon}
      </div>
    </div>
  );
};

export default StatCard;