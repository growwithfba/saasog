import { BicepsFlexed } from "lucide-react";
import CustomIcon from "./CustomIcon";

const OfferIcon = ({ isDisabled = false }: { isDisabled?: boolean }) => {
    const color = isDisabled ? 'bg-orange-400/20' : 'bg-orange-400';
    return (
        <CustomIcon color={color} icon={<BicepsFlexed className="w-4 h-4 text-[#1d2739]" strokeWidth={3} />} />
    );
};

export default OfferIcon;