'use client';

interface SspBuilderPanelProps {
  data?: {
    quantity: string;
    functionality: string;
    quality: string;
    aesthetic: string;
    bundle: string;
  };
  onChange: (data: {
    quantity: string;
    functionality: string;
    quality: string;
    aesthetic: string;
    bundle: string;
  }) => void;
}

export function SspBuilderPanel({ data, onChange }: SspBuilderPanelProps) {
  const ssp = data || {
    quantity: '',
    functionality: '',
    quality: '',
    aesthetic: '',
    bundle: ''
  };

  const handleChange = (field: keyof typeof ssp, value: string) => {
    onChange({
      ...ssp,
      [field]: value
    });
  };

  const sspCategories = [
    {
      key: 'quantity' as const,
      title: 'Quantity',
      hint: 'Case pack, multi pack',
      value: ssp.quantity
    },
    {
      key: 'functionality' as const,
      title: 'Functionality',
      hint: 'Ease of use, different uses, added features, size and shape',
      value: ssp.functionality
    },
    {
      key: 'quality' as const,
      title: 'Quality',
      hint: 'Materials used, construction',
      value: ssp.quality
    },
    {
      key: 'aesthetic' as const,
      title: 'Aesthetic',
      hint: 'Design, pattern, color, style',
      value: ssp.aesthetic
    },
    {
      key: 'bundle' as const,
      title: 'Bundle',
      hint: 'Accessories, relevant items to add',
      value: ssp.bundle
    }
  ];

  return (
    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Super Selling Point Ideas</h3>
      
      <div className="space-y-4">
        {sspCategories.map((category) => (
          <div key={category.key}>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              {category.title}
            </label>
            <p className="text-xs text-slate-500 mb-2">{category.hint}</p>
            <textarea
              value={category.value}
              onChange={(e) => handleChange(category.key, e.target.value)}
              rows={4}
              className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 resize-none"
              placeholder={`Enter ${category.title.toLowerCase()} ideas...`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

