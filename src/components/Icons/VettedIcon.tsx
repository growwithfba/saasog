import { SearchIcon } from "lucide-react";
import CustomIcon, { IconShape } from "./CustomIcon";

const VettedIcon = ({ isDisabled = false, shape = 'hex' }: { isDisabled?: boolean; shape?: IconShape }) => {
  const reached = !isDisabled;
  
  return (
    <CustomIcon 
      phase="vetting"
      reached={reached}
      shape={shape}
      icon={<SearchIcon className={`w-4 h-4 ${reached ? 'text-cyan-600 dark:text-cyan-400' : 'text-slate-400 dark:text-white/22'} strokeWidth={3}`} />} 
    />
  );
};

export default VettedIcon;