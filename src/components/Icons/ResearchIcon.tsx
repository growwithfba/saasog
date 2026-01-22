import { FunnelIcon } from "lucide-react";
import CustomIcon, { IconShape } from "./CustomIcon";
import { PHASES } from "@/utils/phaseStyles";

const ResearchIcon = ({ isDisabled = false, shape = 'hex' }: { isDisabled?: boolean; shape?: IconShape }) => {
    // Research is always completed (product exists)
    const tokens = PHASES.research;
    const reached = !isDisabled;
    
    return (
      <CustomIcon 
        phase="research"
        reached={reached}
        shape={shape}
        icon={<FunnelIcon className={`w-4 h-4 ${reached ? 'text-blue-400' : 'text-white/22'} strokeWidth={3}`} />} 
      />
    );
};

export default ResearchIcon;