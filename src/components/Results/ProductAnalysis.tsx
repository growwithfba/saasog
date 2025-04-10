import React, { useState } from 'react';
import CompetitorTable from './CompetitorTable';

const ProductAnalysis: React.FC = () => {
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setCsvFile(file);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileUpload} accept=".csv" />
      {csvFile && <CompetitorTable csvFile={csvFile} />}
    </div>
  );
};

export default ProductAnalysis; 