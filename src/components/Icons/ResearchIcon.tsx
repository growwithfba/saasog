import { FunnelIcon } from "lucide-react";
import CustomIcon from "./CustomIcon";

const ResearchIcon = ({ isDisabled = false }: { isDisabled?: boolean }) => {
    const color = isDisabled ? 'bg-lime-600/20' : 'bg-lime-600';
    return (
        <CustomIcon color={color} icon={<FunnelIcon className="w-4 h-4 text-[#1d2739]" strokeWidth={3} />} />
    );
};

export default ResearchIcon;