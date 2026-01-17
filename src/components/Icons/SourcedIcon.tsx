import { Handshake } from "lucide-react";
import CustomIcon from "./CustomIcon";

const SourcedIcon = ({ isDisabled = false }: { isDisabled?: boolean }) => {
    const reached = !isDisabled;
    
    return (
        <CustomIcon 
            phase="sourcing"
            reached={reached}
            icon={<Handshake className={`w-4 h-4 ${reached ? 'text-lime-400' : 'text-white/22'} strokeWidth={3}`} />} 
        />
    );
};

export default SourcedIcon;