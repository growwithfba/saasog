/**
 * Amazon Referral Fee Mapping
 * 
 * Maps Amazon product categories to their referral fee percentages.
 * This is the single source of truth for referral fee calculations.
 * 
 * Reference: Amazon Seller Central Fee Structure
 */

export interface CategoryReferralFee {
  category: string;
  referralFeePct: number; // As decimal (e.g., 0.15 for 15%)
}

/**
 * Amazon category to referral fee percentage mapping
 * Default is 15% for most categories
 */
export const CATEGORY_REFERRAL_FEES: Record<string, number> = {
  // Electronics & Computers - 8%
  'Electronics': 0.08,
  'Computers & Accessories': 0.08,
  'Cell Phones & Accessories': 0.08,
  'Camera & Photo': 0.08,
  'TV & Video': 0.08,
  'Audio': 0.08,
  'Car Electronics': 0.08,
  'Patio, Lawn & Garden': 0.08,
  
  // Books, Music, Video - 15%
  'Books': 0.15,
  'Kindle Store': 0.15,
  'Music': 0.15,
  'Movies & TV': 0.15,
  'Video Games': 0.15,
  
  // Home & Kitchen - 15%
  'Home & Kitchen': 0.15,
  'Kitchen & Dining': 0.15,
  'Furniture': 0.15,
  'Bedding': 0.15,
  'Bath': 0.15,
  
  // Health & Personal Care - 15%
  'Health & Personal Care': 0.15,
  'Beauty & Personal Care': 0.15,
  'Personal Care Appliances': 0.15,
  
  // Sports & Outdoors - 15%
  'Sports & Outdoors': 0.15,
  'Outdoor Recreation': 0.15,
  'Exercise & Fitness': 0.15,
  
  // Clothing & Accessories - 17%
  'Clothing, Shoes & Jewelry': 0.17,
  'Apparel': 0.17,
  'Shoes': 0.17,
  'Jewelry': 0.17,
  'Watches': 0.17,
  
  // Baby Products - 15%
  'Baby Products': 0.15,
  'Baby': 0.15,
  
  // Pet Supplies - 15%
  'Pet Supplies': 0.15,
  'Pet Products': 0.15,
  
  // Automotive - 12%
  'Automotive': 0.12,
  'Automotive Parts & Accessories': 0.12,
  
  // Tools & Home Improvement - 12%
  'Tools & Home Improvement': 0.12,
  'Home Improvement': 0.12,
  
  // Industrial & Scientific - 12%
  'Industrial & Scientific': 0.12,
  
  // Office Products - 15%
  'Office Products': 0.15,
  
  // Toys & Games - 15%
  'Toys & Games': 0.15,
  'Toys': 0.15,
  
  // Grocery & Gourmet Food - 15%
  'Grocery & Gourmet Food': 0.15,
  'Grocery': 0.15,
  
  // Beauty - 8-15% (varies by subcategory, defaulting to 15%)
  'Beauty': 0.15,
  
  // Musical Instruments - 15%
  'Musical Instruments': 0.15,
  
  // Collectibles & Fine Art - 20%
  'Collectibles & Fine Art': 0.20,
  'Collectibles': 0.20,
  
  // Everything Else - 15%
  'Everything Else': 0.15,
};

/**
 * Default referral fee percentage (15%)
 */
export const DEFAULT_REFERRAL_FEE_PCT = 0.15;

/**
 * Get referral fee percentage for a given category
 * @param category - Product category name
 * @returns Referral fee as decimal (e.g., 0.15 for 15%)
 */
export function getReferralFeePct(category: string | null | undefined): number {
  if (!category) return DEFAULT_REFERRAL_FEE_PCT;
  
  // Try exact match first
  const exactMatch = CATEGORY_REFERRAL_FEES[category];
  if (exactMatch !== undefined) return exactMatch;
  
  // Try case-insensitive match
  const categoryLower = category.toLowerCase();
  for (const [key, value] of Object.entries(CATEGORY_REFERRAL_FEES)) {
    if (key.toLowerCase() === categoryLower) {
      return value;
    }
  }
  
  // Try partial match (e.g., "Electronics & Computers" matches "Electronics")
  for (const [key, value] of Object.entries(CATEGORY_REFERRAL_FEES)) {
    if (categoryLower.includes(key.toLowerCase()) || key.toLowerCase().includes(categoryLower)) {
      return value;
    }
  }
  
  return DEFAULT_REFERRAL_FEE_PCT;
}

/**
 * Get all available categories for dropdown
 * @returns Array of unique category names sorted alphabetically
 */
export function getAllCategories(): string[] {
  const categories = new Set<string>();
  
  // Add all categories from the mapping
  Object.keys(CATEGORY_REFERRAL_FEES).forEach(cat => categories.add(cat));
  
  // Add common Amazon categories
  const commonCategories = [
    'Arts, Crafts & Sewing',
    'Electronics',
    'Home & Kitchen',
    'Clothing, Shoes & Jewelry',
    'Health & Personal Care',
    'Sports & Outdoors',
    'Toys & Games',
    'Automotive',
    'Tools & Home Improvement',
    'Office Products',
    'Baby Products',
    'Pet Supplies',
    'Grocery & Gourmet Food',
    'Beauty & Personal Care',
    'Books',
    'Musical Instruments',
    'Industrial & Scientific',
    'Collectibles & Fine Art',
    'Everything Else',
  ];
  
  commonCategories.forEach(cat => categories.add(cat));
  
  return Array.from(categories).sort();
}











