import { PhaseType, PHASES, getPhaseKey, progressBadgeGlowStyle, PROGRESS_BADGE_GLOW_CLASS } from '@/utils/phaseStyles';

export type IconShape = 'hex' | 'rounded';

interface CustomIconProps {
  color?: string;
  icon: React.ReactNode;
  borderColor?: string;
  glowClass?: string;
  phase?: PhaseType;
  reached?: boolean;
  shape?: IconShape;
}

const CustomIcon = ({ color, icon, borderColor, glowClass, phase, reached, shape = 'hex' }: CustomIconProps) => {
    // If phase and reached are provided, use new phase system
    let glowStyle: React.CSSProperties = {};
    let finalColor = color || 'bg-slate-700/30';
    let finalBorderColor = borderColor || 'border border-slate-600/30';
    let glowClasses = '';
    
    if (phase !== undefined && reached !== undefined) {
      const phaseKey = getPhaseKey(phase);
      const tokens = PHASES[phaseKey];
      
      if (reached) {
        // Reached: use phase colors
        finalColor = tokens.bg;
        finalBorderColor = `${tokens.border} border-2`;
        glowStyle = progressBadgeGlowStyle(phase, reached);
        glowClasses = PROGRESS_BADGE_GLOW_CLASS;
      } else {
        // Unreached: greyed out
        // On white, a white/4 fill and a white/8 border are invisible — the
        // badge became an empty circle. A faint navy well reads in both modes.
        finalColor = 'bg-slate-900/[0.04] dark:bg-white/4';
        finalBorderColor = 'border border-slate-900/10 dark:border-white/8';
        // No glow for unreached
      }
    } else if (borderColor) {
      // Legacy glow system (for backward compatibility)
      if (borderColor.includes('teal') || borderColor.includes('lime')) {
          // 'lime' branch kept as a fallback in case any legacy caller
          // still passes the old class name. Both paint teal now.
          glowStyle = {
              boxShadow: '0 0 0 1.5px rgba(20, 184, 166, 0.6), 0 0 8px rgba(20, 184, 166, 0.4), 0 0 12px rgba(20, 184, 166, 0.3)'
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
      ? 'opacity-80 dark:opacity-55 dark:grayscale' 
      : '';
    const iconOpacity = (phase !== undefined && !reached) ? 'opacity-60' : '';
    
    const shapeClasses = shape === 'rounded' ? 'rounded-xl' : '';
    const shapeStyle = shape === 'hex'
      ? { clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)' }
      : {};

    return (
      <div className={`flex justify-center items-center ${glowClass || ''} ${wrapperClasses}`}>
        <div 
          className={`w-8 h-8 ${finalColor} ${finalBorderColor} ${shapeClasses} ${glowClasses} flex justify-center items-center ${iconOpacity}`}
          style={{
            ...shapeStyle,
            ...glowStyle,
          }}
        >
          {icon}
        </div>
      </div>
    );
  };

  export default CustomIcon;