import { Handshake } from "lucide-react";
import CustomIcon, { IconShape } from "./CustomIcon";

const SourcedIcon = ({ isDisabled = false, shape = 'hex' }: { isDisabled?: boolean; shape?: IconShape }) => {
    const reached = !isDisabled;
    
    return (
        <CustomIcon 
            phase="sourcing"
            reached={reached}
            shape={shape}
            icon={<Handshake className={`w-4 h-4 ${reached ? 'text-lime-400' : 'text-white/22'} strokeWidth={3}`} />} 
        />
    );
};

export default SourcedIcon;