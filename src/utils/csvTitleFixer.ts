/**
 * Utility functions to fix competitor titles by extracting proper titles from original CSV data
 */

interface CsvRow {
  [key: string]: string;
}

interface TitleMapping {
  [asin: string]: string;
}

/**
 * Standardizes column names for consistent mapping
 */
function standardizeColumnName(name: string): string {
  return name.toLowerCase()
    .replace(/[\s_-]+/g, '') // Remove spaces, underscores, hyphens
    .replace(/[^\w]/g, '');   // Remove any non-alphanumeric chars
}

/**
 * Parses CSV content and extracts proper product titles
 * @param csvContent - Raw CSV content string
 * @returns Mapping of ASIN to proper product title
 */
export function extractTitlesFromOriginalCsv(csvContent: string): TitleMapping {
  const titleMapping: TitleMapping = {};
  
  try {
    // Split CSV into lines
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) return titleMapping;
    
    // Parse header row
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const standardizedHeaders = headers.map(standardizeColumnName);
    
    // Find relevant column indices
    let asinIndex = -1;
    let titleIndex = -1;
    let productDetailsIndex = -1;
    
    standardizedHeaders.forEach((header, index) => {
      if (header === 'asin') {
        asinIndex = index;
      } else if (header === 'producttitle' || header === 'title') {
        titleIndex = index;
      } else if (header === 'productdetails') {
        productDetailsIndex = index;
      }
    });
    
    // If we don't have ASIN column, we can't create the mapping
    if (asinIndex === -1) {
      console.warn('No ASIN column found in original CSV');
      return titleMapping;
    }
    
    // Prefer Product Details over Product Title if available
    const preferredTitleIndex = productDetailsIndex !== -1 ? productDetailsIndex : titleIndex;
    
    if (preferredTitleIndex === -1) {
      console.warn('No title column found in original CSV');
      return titleMapping;
    }
    
    console.log(`Using column index ${preferredTitleIndex} (${headers[preferredTitleIndex]}) for titles`);
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',').map(cell => cell.replace(/"/g, '').trim());
      
      if (row.length <= Math.max(asinIndex, preferredTitleIndex)) {
        continue; // Skip incomplete rows
      }
      
      const asin = extractAsinFromValue(row[asinIndex]);
      const title = cleanTitle(row[preferredTitleIndex]);
      
      if (asin && title && title !== 'N/A' && title !== 'Amazon Product') {
        titleMapping[asin] = title;
      }
    }
    
    console.log(`Extracted ${Object.keys(titleMapping).length} title mappings from original CSV`);
    return titleMapping;
    
  } catch (error) {
    console.error('Error parsing original CSV for titles:', error);
    return titleMapping;
  }
}

/**
 * Extracts ASIN from various formats (plain ASIN, URL, hyperlink)
 */
function extractAsinFromValue(value: string): string {
  if (!value) return '';
  
  // If it's already a clean ASIN (10 characters, alphanumeric)
  if (value.length === 10 && /^[A-Z0-9]{10}$/.test(value)) {
    return value;
  }
  
  // Try to extract from URL or hyperlink
  const asinMatch = value.match(/(?:dp\/|product\/|ASIN[\/=])([A-Z0-9]{10})/i);
  if (asinMatch) {
    return asinMatch[1];
  }
  
  // Try to extract from HYPERLINK formula
  const hyperlinkMatch = value.match(/HYPERLINK\s*\([^,]*,\s*"([A-Z0-9]{10})"/i);
  if (hyperlinkMatch) {
    return hyperlinkMatch[1];
  }
  
  return '';
}

/**
 * Cleans and formats product title
 */
function cleanTitle(title: string): string {
  if (!title || title === 'N/A') return '';
  
  // If it's a HYPERLINK Excel formula, try to extract the display text
  const hyperlinkMatch = title.match(/HYPERLINK\s*\(\s*"[^"]*"\s*,\s*"([^"]*)"\s*\)/i);
  if (hyperlinkMatch && hyperlinkMatch[1]) {
    return hyperlinkMatch[1].trim().substring(0, 200);
  }
  
  // Remove Excel formula artifacts
  let cleanTitle = title.replace(/=HYPERLINK\([^)]*\)/gi, '')
                       .replace(/^[='"]+|['"]+$/g, '')
                       .trim();
  
  // If it looks like a URL, skip it (we want the actual product title)
  if (cleanTitle.includes('http') || cleanTitle.includes('amazon.com') || cleanTitle.includes('dp/')) {
    if (cleanTitle.startsWith('http') || cleanTitle.startsWith('www.')) {
      return ''; // Skip pure URLs
    }
    // Try to extract non-URL parts
    cleanTitle = cleanTitle.replace(/https?:\/\/[^\s]+/g, '').trim();
    if (cleanTitle.length <= 3) {
      return ''; // Skip if nothing meaningful left
    }
  }
  
  // Clean up and limit length
  return cleanTitle.replace(/\s+/g, ' ').substring(0, 200);
}

/**
 * Applies title corrections to competitor data using original CSV mapping
 */
export function applyTitleCorrections(competitors: any[], titleMapping: TitleMapping): any[] {
  if (!titleMapping || Object.keys(titleMapping).length === 0) {
    return competitors;
  }
  
  return competitors.map(competitor => {
    const asin = extractAsinFromValue(competitor.asin);
    const correctedTitle = titleMapping[asin];
    
    if (correctedTitle) {
      return {
        ...competitor,
        title: correctedTitle,
        originalTitle: competitor.title // Preserve original for debugging
      };
    }
    
    return competitor;
  });
}
