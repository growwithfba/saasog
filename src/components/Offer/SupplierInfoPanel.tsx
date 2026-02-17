'use client';

interface SupplierInfoPanelProps {
  data?: {
    supplierName: string;
    contact: string;
    fobPrice: string;
    landedCost: string;
    moq: string;
    leadTime: string;
    notes: string;
  };
  onChange: (data: {
    supplierName: string;
    contact: string;
    fobPrice: string;
    landedCost: string;
    moq: string;
    leadTime: string;
    notes: string;
  }) => void;
}

export function SupplierInfoPanel({ data, onChange }: SupplierInfoPanelProps) {
  const supplierInfo = data || {
    supplierName: '',
    contact: '',
    fobPrice: '',
    landedCost: '',
    moq: '',
    leadTime: '',
    notes: ''
  };

  const handleChange = (field: keyof typeof supplierInfo, value: string) => {
    onChange({
      ...supplierInfo,
      [field]: value
    });
  };

  return (
    <div className="bg-slate-800/30 backdrop-blur-xl rounded-2xl border border-slate-700/50 p-6">
      <h3 className="text-lg font-semibold text-white mb-4">Supplier Info</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Preferred Supplier Name */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Preferred Supplier Name
          </label>
          <input
            type="text"
            value={supplierInfo.supplierName}
            onChange={(e) => handleChange('supplierName', e.target.value)}
            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50"
            placeholder="Enter supplier name"
          />
        </div>

        {/* Contact Info */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Contact Info
          </label>
          <input
            type="text"
            value={supplierInfo.contact}
            onChange={(e) => handleChange('contact', e.target.value)}
            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50"
            placeholder="Email, phone, or contact details"
          />
        </div>

        {/* Target FOB Price */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Target FOB Price
          </label>
          <input
            type="text"
            value={supplierInfo.fobPrice}
            onChange={(e) => handleChange('fobPrice', e.target.value)}
            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50"
            placeholder="Enter FOB price"
          />
        </div>

        {/* Target Landed Cost per Unit */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Target Landed Cost per Unit
          </label>
          <input
            type="text"
            value={supplierInfo.landedCost}
            onChange={(e) => handleChange('landedCost', e.target.value)}
            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50"
            placeholder="Enter landed cost"
          />
        </div>

        {/* Minimum Order Quantity */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Minimum Order Quantity (MOQ)
          </label>
          <input
            type="text"
            value={supplierInfo.moq}
            onChange={(e) => handleChange('moq', e.target.value)}
            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50"
            placeholder="Enter MOQ"
          />
        </div>

        {/* Target Lead Time */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Target Lead Time
          </label>
          <input
            type="text"
            value={supplierInfo.leadTime}
            onChange={(e) => handleChange('leadTime', e.target.value)}
            className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50"
            placeholder="e.g., 30 days"
          />
        </div>
      </div>

      {/* Sample Notes / Extra Notes */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">
          Sample Notes / Extra Notes
        </label>
        <textarea
          value={supplierInfo.notes}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={4}
          className="w-full px-4 py-2 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/50 resize-none"
          placeholder="Enter any additional notes about the supplier..."
        />
      </div>
    </div>
  );
}

