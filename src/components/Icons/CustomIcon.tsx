import { PhaseType, PHASES, getPhaseKey, progressBadgeGlowStyle } from '@/utils/phaseStyles';

interface CustomIconProps {
  color?: string;
  icon: React.ReactNode;
  borderColor?: string;
  glowClass?: string;
  phase?: PhaseType;
  reached?: boolean;
}

const CustomIcon = ({ color, icon, borderColor, glowClass, phase, reached }: CustomIconProps) => {
    // If phase and reached are provided, use new phase system
    let glowStyle: React.CSSProperties = {};
    let finalColor = color || 'bg-slate-700/30';
    
    if (phase !== undefined && reached !== undefined) {
      const phaseKey = getPhaseKey(phase);
      const tokens = PHASES[phaseKey];
      
      if (reached) {
        // Reached: use phase colors
        finalColor = tokens.bg;
        glowStyle = progressBadgeGlowStyle(phase, reached);
      } else {
        // Unreached: greyed out
        finalColor = 'bg-white/4';
        // No glow for unreached
      }
    } else if (borderColor) {
      // Legacy glow system (for backward compatibility)
      if (borderColor.includes('lime')) {
          glowStyle = {
              boxShadow: '0 0 0 1.5px rgba(132, 204, 22, 0.6), 0 0 8px rgba(132, 204, 22, 0.4), 0 0 12px rgba(132, 204, 22, 0.3)'
          };
      } else if (borderColor.includes('amber')) {
          glowStyle = {
              boxShadow: '0 0 0 1.5px rgba(245, 158, 11, 0.6), 0 0 8px rgba(245, 158, 11, 0.4), 0 0 12px rgba(245, 158, 11, 0.3)'
          };
      } else if (borderColor.includes('orange')) {
          glowStyle = {
              boxShadow: '0 0 0 1.5px rgba(249, 115, 22, 0.6), 0 0 8px rgba(249, 115, 22, 0.4), 0 0 12px rgba(249, 115, 22, 0.3)'
          };
      } else if (borderColor.includes('blue')) {
          glowStyle = {
              boxShadow: '0 0 0 1.5px rgba(59, 130, 246, 0.6), 0 0 8px rgba(59, 130, 246, 0.4), 0 0 12px rgba(59, 130, 246, 0.3)'
          };
      }
    }
    
    const wrapperClasses = phase !== undefined && !reached 
      ? 'opacity-55 grayscale' 
      : '';
    const iconOpacity = (phase !== undefined && !reached) ? 'opacity-60' : '';
    
    return (
      <div className={`flex justify-center items-center ${glowClass || ''} ${wrapperClasses}`}>
        <div 
          className={`w-8 h-8 ${finalColor} flex justify-center items-center ${iconOpacity}`}
          style={{
            clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
            ...glowStyle
          }}
        >
          {icon}
        </div>
      </div>
    );
  };

  export default CustomIcon;