import { SearchIcon } from "lucide-react";
import CustomIcon from "./CustomIcon";

const VettedIcon = ({ isDisabled = false }: { isDisabled?: boolean }) => {
    const color = isDisabled ? 'bg-yellow-500/20' : 'bg-yellow-500';
  return (
    <CustomIcon color={color} icon={<SearchIcon className="w-4 h-4 text-[#1d2739]" strokeWidth={3} />} />
  );
};

export default VettedIcon;