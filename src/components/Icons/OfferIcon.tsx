import { BicepsFlexed } from "lucide-react";
import CustomIcon, { IconShape } from "./CustomIcon";

const OfferIcon = ({ isDisabled = false, shape = 'hex' }: { isDisabled?: boolean; shape?: IconShape }) => {
    const reached = !isDisabled;
    
    return (
        <CustomIcon 
            phase="offer"
            reached={reached}
            shape={shape}
            icon={<BicepsFlexed className={`w-4 h-4 ${reached ? 'text-emerald-400' : 'text-white/22'} strokeWidth={3}`} />} 
        />
    );
};

export default OfferIcon;