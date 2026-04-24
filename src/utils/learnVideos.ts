import { FileText, Plus, BookOpen, CheckCircle, BarChart2, TrendingUp, Star, MessageSquare, Package, DollarSign, ShoppingCart } from 'lucide-react';
import type { ElementType } from 'react';

export type LearnSection = 'research' | 'vetting' | 'vetting-detail' | 'offering' | 'sourcing';

export interface LearnVideo {
  id: string;
  label: string;
  title?: string;
  icon: ElementType;
  embedId: string;
  description: string;
  thumbnail: string;
}

export const LEARN_VIDEOS: Record<LearnSection, LearnVideo[]> = {
  research: [
    {
      id: 'overview',
      label: 'Navigating Bloom Engine',
      icon: BookOpen,
      embedId: '0b724bb5c2a5468485e66985b3f24a8e',
      title: 'BloomEngine Platform Walkthrough',
      description: 'A complete walkthrough of the BloomEngine platform. In this video you\u2019ll learn how each section works, how the workflow is structured, and how to start building your brand using BloomEngine\u2019s research and validation tools.',
      thumbnail: '/thumbnail/1.png',
    },
    {
      id: 'submissions',
      label: 'Navigating The Research Page',
      icon: FileText,
      embedId: '0e3851ed69bf4e55952e4e9ced552ad8',
      title: 'Navigating The Research Page',
      description: 'The Research Page is where every potential product idea begins. In this lesson you\u2019ll learn how the research dashboard is organized, how to review product data, and how to manage and evaluate ideas as they move through your research funnel.',
      thumbnail: '/thumbnail/2.png',
    },
    {
      id: 'new',
      label: 'Filling Your Funnel',
      icon: Plus,
      embedId: '3f05af44a8ef4a7d9c6bd24cccfd4fa0',
      title: 'How to Fill Your Research Funnel',
      description: 'Your research funnel is the foundation of your product discovery process. In this video you\u2019ll learn where to gather the right files, and how to import those opportunities inside BloomEngine so you can start validating them efficiently.',
      thumbnail: '/thumbnail/3.png',
    },
  ],
  vetting: [
    {
      id: 'submissions',
      label: 'Navigating the Vetting Page',
      icon: CheckCircle,
      embedId: 'ca1cd736f02f42a1b00e36bf751dccd9',
      title: 'Navigating The Vetting Page',
      description: 'The Vetting Page is where product ideas begin to prove themselves \u2014 or get eliminated. In this walkthrough, you\u2019ll learn how the vetting dashboard works and how to quickly identify which markets are worth pursuing for your brand.',
      thumbnail: '/thumbnail/4.png',
    },
    {
      id: 'overview',
      label: 'Isolating Your True Competitors (Getting Market CSVs)',
      icon: BookOpen,
      embedId: '1457a5aba3234d3bb51cf815ce1c5aea',
      title: 'How to Import Your True Competitors',
      description: 'Accurate market analysis starts with identifying the right competitors. In this video you\u2019ll learn how to isolate and import only your true competitors into BloomEngine so your market data reflects the real competitive landscape.',
      thumbnail: '/thumbnail/5.png',
    },
  ],
  'vetting-detail': [
    {
      id: 'understanding',
      label: 'Understanding Vetting Results',
      icon: CheckCircle,
      embedId: '11728f2aef7b4e82a40cd21efd75d4ad',
      title: 'Vetting Results Page Overview',
      description: 'Once your competitors are loaded, BloomEngine analyzes the market and organizes the results for you. In this video we\u2019ll walk through the Vetting Results Page and explain how to interpret each section of the data.',
      thumbnail: '/thumbnail/6.png',
    },
    {
      id: 'competitors',
      label: 'Detailed Competitor Analysis Section',
      icon: BarChart2,
      embedId: '9413df68fbc84a26ac18974337af1fbb',
      title: 'Detailed Competitor Analysis',
      description: 'Dive deeper into your competitive landscape. This section visualizes the last 30 days of competitor performance, helping you understand sales patterns, pricing behavior, and market dynamics through easy-to-read charts.',
      thumbnail: '/thumbnail/7.png',
    },
    {
      id: 'market',
      label: 'Market Climate Section',
      icon: TrendingUp,
      embedId: '665929d4f9d44cd9b7792ad398c8d6d7',
      title: 'Market Climate',
      description: 'Market Climate gives you a deeper view of long-term competitor behavior. In this video you\u2019ll learn how BloomEngine analyzes your top competitors\u2019 sales and pricing trends over the past two years to help you evaluate market stability and opportunity.',
      thumbnail: '/thumbnail/8.png',
    },
  ],
  offering: [
    {
      id: 'navigating',
      label: 'Navigating the Offering Page',
      icon: FileText,
      embedId: 'ab40103a9b484537a3ac1e5fc77f37e9',
      title: 'Navigating The Offering Page',
      description: 'The Offering Page is where strong product opportunities turn into powerful offers. In this walkthrough, you\u2019ll learn how the Offering workspace is structured and how to start transforming validated product ideas into differentiated, market-winning offers.',
      thumbnail: '/thumbnail/9.png',
    },
    {
      id: 'aggregate-reviews',
      label: 'How to Aggregate Reviews',
      icon: MessageSquare,
      embedId: 'bf064a0cdbb34c80917a328f55ea7bf3',
      title: 'Gathering Key Market Insights via Customer Reviews',
      description: 'Customer reviews are one of the most valuable sources of market intelligence. In this video you\u2019ll learn how to import competitor reviews into BloomEngine so you can extract the most important insights about what customers love, hate, and wish existed.',
      thumbnail: '/thumbnail/10.png',
    },
    {
      id: 'ai-insights',
      label: 'Reading Your AI Review Insights',
      icon: Star,
      embedId: 'f43fc0aeef6f48688f4594a5429b7e04',
      title: 'Reading Your AI Review Insights',
      description: 'BloomEngine analyzes hundreds of customer reviews to uncover hidden market opportunities. In this lesson you\u2019ll learn how to interpret your AI-generated review insights so you can clearly understand customer frustrations, feature requests, and unmet expectations in your niche.',
      thumbnail: '/thumbnail/11.png',
    },
    {
      id: 'ssp-builder',
      label: 'Using the SSP Builder Hub',
      icon: Package,
      embedId: '9cd03891ed84432eb8bc757d5367506e',
      title: 'Using the SSP Builder Hub',
      description: 'Now that you understand the market gaps, it\u2019s time to turn them into real competitive advantages. In this video you\u2019ll learn how to use the SSP Builder Hub to create powerful Super Selling Points (SSPs) that differentiate your product and position your offer to win in the marketplace',
      thumbnail: '/thumbnail/12.png',
    },
  ],
  sourcing: [
    {
      id: 'navigating',
      label: 'Navigating the Sourcing Page',
      icon: FileText,
      embedId: '39fb6e21c6184965962e6f8ebb5dd65d',
      title: 'Navigating the Sourcing Page',
      description: 'You\u2019re almost ready to move your winning product into production. In this walkthrough, you\u2019ll learn how the Sourcing Page is structured and how BloomEngine helps you organize supplier information, evaluate quotes, and prepare for ordering.',
      thumbnail: '/thumbnail/13.png',
    },
    {
      id: 'supplier-quotes',
      label: 'Supplier Quotes Tab',
      icon: Package,
      embedId: '61ae039ba1dd46df9531dce3d192ab31',
      title: 'How To Add Your Supplier Quotes to BloomEngine',
      description: 'Suppliers provide a lot of important details during the sourcing process. In this video you\u2019ll learn how to log supplier quotes inside BloomEngine so you can organize everything all in one place.',
      thumbnail: '/thumbnail/14.png',
    },
    {
      id: 'profit-overview',
      label: 'Profit Overview Tab',
      icon: DollarSign,
      embedId: 'fd10140a1cfa44cea7469c5a06034a5a',
      title: 'Profit Overview',
      description: 'Compare your supplier options side by side using BloomEngine\u2019s profit overview matrix. This section helps you evaluate margins, pricing scenarios, and total costs so you can clearly identify which supplier offers the strongest opportunity.',
      thumbnail: '/thumbnail/15.png',
    },
    {
      id: 'place-order',
      label: 'Place Order Tab',
      icon: ShoppingCart,
      embedId: 'b4d2db8cde9544cab058bb3ca11eca1d',
      title: 'Getting Ready to Place Your Order',
      description: 'Before placing your first deposit, there are several critical details you need to confirm with your supplier. In this video we\u2019ll walk through the final sourcing checklist so you can move forward with confidence and avoid costly mistakes.',
      thumbnail: '/thumbnail/16.png',
    },
  ],
};
