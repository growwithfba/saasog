import { SearchIcon } from "lucide-react";
import CustomIcon from "./CustomIcon";
import { PHASES } from "@/utils/phaseStyles";

const VettedIcon = ({ isDisabled = false }: { isDisabled?: boolean }) => {
    const reached = !isDisabled;
    
    return (
        <CustomIcon 
            phase="vetting"
            reached={reached}
            icon={<SearchIcon className={`w-4 h-4 ${reached ? 'text-cyan-400' : 'text-white/22'} strokeWidth={3}`} />} 
        />
    );
};

export default VettedIcon;