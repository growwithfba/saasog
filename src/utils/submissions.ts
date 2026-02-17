// Get status badge color
export const getStatusColor = (status: string) => {
    switch(status) {
      case 'PASS': return 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-500 border-emerald-200 dark:border-emerald-500/20';
      case 'RISKY': return 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-500 border-amber-200 dark:border-amber-500/20';
      case 'FAIL': return 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-500 border-red-200 dark:border-red-500/20';
      default: return 'bg-gray-50 dark:bg-gray-500/10 text-gray-700 dark:text-gray-500 border-gray-200 dark:border-gray-500/20';
    }
  };
  
  // Get score color
export const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-600 dark:text-emerald-500';
    if (score >= 40) return 'text-amber-600 dark:text-amber-500';
    return 'text-red-600 dark:text-red-500';
  };