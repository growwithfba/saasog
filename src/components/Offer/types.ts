/**
 * Offer Data Model
 * 
 * This interface defines the structure for Offer data that will eventually
 * be stored in Supabase. For now, it's stored in localStorage.
 */
export interface OfferData {
  productId: string;
  reviewInsights: {
    topLikes: string;
    topDislikes: string;
    importantInsights: string;
    importantQuestions: string;
  };
  ssp: {
    quantity: string;
    functionality: string;
    quality: string;
    aesthetic: string;
    bundle: string;
  };
  supplierInfo: {
    supplierName: string;
    contact: string;
    fobPrice: string;
    landedCost: string;
    moq: string;
    leadTime: string;
    notes: string;
  };
  status: 'none' | 'working' | 'completed';
  createdAt: string;
  updatedAt: string;
}

