import React, { useState, useEffect } from 'react';
import CompetitorTable from './CompetitorTable';
import Papa from 'papaparse';

interface Competitor {
  No: number;
  ASIN: string;
  Brand: string;
  'Product Title': string;
  Category: string;
  Price: number;
  BSR: number;
  'Listing Score': number;
  'Monthly Sales': number;
  'Monthly Revenue': number;
  Rating: number;
  Reviews: number;
  'Fulfilled By': string;
  'Product Type': string;
  'Seller Country': string;
  'Gross Profit': number;
  'Date First Available': string;
  heroLaunchpadScore?: number;
  score?: number;
}

const ProductAnalysis: React.FC = () => {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);

  useEffect(() => {
    if (csvFile) {
      Papa.parse(csvFile, {
        header: true,
        complete: (results) => {
          // Transform the parsed data to match the Competitor interface
          const parsedCompetitors = results.data.map((item: any) => ({
            No: Number(item.No || 0),
            ASIN: item.ASIN || '',
            Brand: item.Brand || '',
            'Product Title': item['Product Details'] || '',
            Category: item.Category || '',
            Price: Number(item.Price || 0),
            BSR: Number(item.BSR || 0),
            'Listing Score': Number(item['Listing Score'] || 0),
            'Monthly Sales': Number(item['Monthly Sales'] || 0),
            'Monthly Revenue': Number(item['Monthly Revenue'] || 0),
            Rating: Number(item.Rating || 0),
            Reviews: Number(item.Reviews || 0),
            'Fulfilled By': item['Fulfilled By'] || '',
            'Product Type': item['Product Type'] || '',
            'Seller Country': item['Seller Country'] || '',
            'Gross Profit': Number(item['Gross Profit'] || 0),
            'Date First Available': item['Date First Available'] || '',
            score: Number(item.score || 0)
          }));
          setCompetitors(parsedCompetitors);
        },
        error: (error) => {
          console.error('Error parsing CSV:', error);
        }
      });
    }
  }, [csvFile]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setCsvFile(file);
    }
  };

  return (
    <div>
      <input type="file" onChange={handleFileUpload} accept=".csv" />
      {competitors.length > 0 && <CompetitorTable competitors={competitors} />}
    </div>
  );
};

export default ProductAnalysis; 