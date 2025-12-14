'use client';

interface ReviewInsightsPanelProps {
  data?: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
  };
  onChange: (data: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
  }) => void;
}

export function ReviewInsightsPanel({ data, onChange }: ReviewInsightsPanelProps) {
  const reviewInsights = data || {
    topLikes: '',
    topDislikes: '',
    importantInsights: '',
    importantQuestions: ''
  };

  const handleChange = (field: keyof typeof reviewInsights, value: string) => {
    onChange({
      ...reviewInsights,
      [field]: value
    });
  };

  return (
    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Review Insights</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top 5 Customer Likes */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Top 5 Customer Likes
          </label>
          <textarea
            value={reviewInsights.topLikes}
            onChange={(e) => handleChange('topLikes', e.target.value)}
            rows={6}
            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 resize-none"
            placeholder="Enter the top 5 things customers like about this product..."
          />
        </div>

        {/* Top 5 Customer Dislikes */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Top 5 Customer Dislikes
          </label>
          <textarea
            value={reviewInsights.topDislikes}
            onChange={(e) => handleChange('topDislikes', e.target.value)}
            rows={6}
            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 resize-none"
            placeholder="Enter the top 5 things customers dislike about this product..."
          />
        </div>

        {/* Important Insights */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Important Insights
          </label>
          <textarea
            value={reviewInsights.importantInsights}
            onChange={(e) => handleChange('importantInsights', e.target.value)}
            rows={6}
            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 resize-none"
            placeholder="Enter important insights from customer reviews..."
          />
        </div>

        {/* Important Questions */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Important Questions
          </label>
          <textarea
            value={reviewInsights.importantQuestions}
            onChange={(e) => handleChange('importantQuestions', e.target.value)}
            rows={6}
            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 resize-none"
            placeholder="Enter important questions customers ask about this product..."
          />
        </div>
      </div>
    </div>
  );
}

