import { BicepsFlexed } from "lucide-react";
import CustomIcon from "./CustomIcon";
import { PHASES } from "@/utils/phaseStyles";

const OfferIcon = ({ isDisabled = false }: { isDisabled?: boolean }) => {
    const reached = !isDisabled;
    
    return (
        <CustomIcon 
            phase="offer"
            reached={reached}
            icon={<BicepsFlexed className={`w-4 h-4 ${reached ? 'text-emerald-400' : 'text-white/22'} strokeWidth={3}`} />} 
        />
    );
};

export default OfferIcon;