import { Handshake } from "lucide-react";
import CustomIcon from "./CustomIcon";

const SourcedIcon = ({ isDisabled = false }: { isDisabled?: boolean }) => {
    const color = isDisabled ? 'bg-blue-600/20' : 'bg-blue-600';
    return (
        <CustomIcon color={color} icon={<Handshake className="w-4 h-4 text-[#1d2739]" strokeWidth={3} />} />
    );
};

export default SourcedIcon;