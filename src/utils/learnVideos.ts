import { FileText, Plus, BookOpen, CheckCircle, BarChart2, TrendingUp, Star, MessageSquare, Package, DollarSign, ShoppingCart } from 'lucide-react';
import type { ElementType } from 'react';

export type LearnSection = 'research' | 'vetting' | 'vetting-detail' | 'offering' | 'sourcing';

export interface LearnVideo {
  id: string;
  label: string;
  icon: ElementType;
  embedId: string;
  description: string;
}

export const LEARN_VIDEOS: Record<LearnSection, LearnVideo[]> = {
  research: [
    {
      id: 'overview',
      label: 'Navigating Bloom Engine',
      icon: BookOpen,
      embedId: '0b724bb5c2a5468485e66985b3f24a8e',
      description: 'Full platform walkthrough — available anytime.',
    },
    {
      id: 'submissions',
      label: 'Navigating The Research Page',
      icon: FileText,
      embedId: '0e3851ed69bf4e55952e4e9ced552ad8',
      description: 'Learn how to manage and analyze products in your research funnel.',
    },
    {
      id: 'new',
      label: 'Filling Your Funnel',
      icon: Plus,
      embedId: '3f05af44a8ef4a7d9c6bd24cccfd4fa0',
      description: 'Discover how to find and add new products to your funnel.',
    },
  ],
  vetting: [
    {
      id: 'submissions',
      label: 'Navigating the Vetting Page',
      icon: CheckCircle,
      embedId: 'ca1cd736f02f42a1b00e36bf751dccd9',
      description: 'Navigating the Vetting Page',
    },
    {
      id: 'overview',
      label: 'Vetting Page Isolating True Competitors',
      icon: BookOpen,
      embedId: '1457a5aba3234d3bb51cf815ce1c5aea',
      description: 'Vetting Page Isolating True Competitors',
    },
  ],
  'vetting-detail': [
    {
      id: 'understanding',
      label: 'Understanding The Vetting Results Page',
      icon: CheckCircle,
      embedId: '11728f2aef7b4e82a40cd21efd75d4ad',
      description: 'Understanding The Vetting Results Page',
    },
    {
      id: 'competitors',
      label: 'Detailed Competitor Analysis Section',
      icon: BarChart2,
      embedId: '9413df68fbc84a26ac18974337af1fbb',
      description: 'Detailed Competitor Analysis Section',
    },
    {
      id: 'market',
      label: 'Market Signals Section',
      icon: TrendingUp,
      embedId: '665929d4f9d44cd9b7792ad398c8d6d7',
      description: 'Market Signals Section',
    },
  ],
  offering: [
    {
      id: 'navigating',
      label: 'Navigating the Offering Page',
      icon: FileText,
      embedId: 'ab40103a9b484537a3ac1e5fc77f37e9',
      description: 'Navigating the Offering Page',
    },
    {
      id: 'aggregate-reviews',
      label: 'How to Aggregate Reviews',
      icon: MessageSquare,
      embedId: 'bf064a0cdbb34c80917a328f55ea7bf3',
      description: 'How to Aggregate Reviews',
    },
    {
      id: 'ai-insights',
      label: 'Reading Your AI Review Insights',
      icon: Star,
      embedId: 'f43fc0aeef6f48688f4594a5429b7e04',
      description: 'Reading Your AI Review Insights',
    },
    {
      id: 'ssp-builder',
      label: 'Using the SSP Builder Hub',
      icon: Package,
      embedId: '9cd03891ed84432eb8bc757d5367506e',
      description: 'Using the SSP Builder Hub',
    },
  ],
  sourcing: [
    {
      id: 'navigating',
      label: 'Navigating the Sourcing Page',
      icon: FileText,
      embedId: '39fb6e21c6184965962e6f8ebb5dd65d',
      description: 'Navigating the Sourcing Page',
    },
    {
      id: 'supplier-quotes',
      label: 'Supplier Quotes Tab',
      icon: Package,
      embedId: '61ae039ba1dd46df9531dce3d192ab31',
      description: 'Supplier Quotes Tab',
    },
    {
      id: 'profit-overview',
      label: 'Profit Overview Tab',
      icon: DollarSign,
      embedId: 'fd10140a1cfa44cea7469c5a06034a5a',
      description: 'Profit Overview Tab',
    },
    {
      id: 'place-order',
      label: 'Place Order Tab',
      icon: ShoppingCart,
      embedId: 'b4d2db8cde9544cab058bb3ca11eca1d',
      description: 'Place Order Tab',
    },
  ],
};
