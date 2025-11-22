// Get status badge color
export const getStatusColor = (status: string) => {
    switch(status) {
      case 'PASS': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'RISKY': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'FAIL': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };
  
  // Get score color
export const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-500';
    if (score >= 40) return 'text-amber-500';
    return 'text-red-500';
  };