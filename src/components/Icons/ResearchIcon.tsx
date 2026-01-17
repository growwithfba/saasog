import { FunnelIcon } from "lucide-react";
import CustomIcon from "./CustomIcon";
import { PHASES } from "@/utils/phaseStyles";

const ResearchIcon = ({ isDisabled = false }: { isDisabled?: boolean }) => {
  // Research is always completed (product exists)
  const reached = !isDisabled;
  
  return (
    <CustomIcon 
      phase="research"
      reached={reached}
      icon={<FunnelIcon className={`w-4 h-4 ${reached ? 'text-blue-400' : 'text-white/22'} strokeWidth={3}`} />} 
    />
  );
};

export default ResearchIcon;