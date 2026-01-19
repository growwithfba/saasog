'use client';

import { useState } from 'react';
import { PlayCircle } from 'lucide-react';
import MainTemplate from "@/components/MainTemplate";
import SectionStats from "@/components/SectionStats";
import Table from "@/components/Table";
import LearnModal from "@/components/LearnModal";
import ResearchIcon from "@/components/Icons/ResearchIcon";
import VettedIcon from "@/components/Icons/VettedIcon";
import OfferIcon from "@/components/Icons/OfferIcon";
import SourcedIcon from "@/components/Icons/SourcedIcon";
import { useProductFunnelStats } from "@/hooks/useProductFunnelStats";


const ResearchPage = () => {
  const [isLearnModalOpen, setIsLearnModalOpen] = useState(false);
  const { productsInFunnel, productsVetted, productsOffered, productsSourced, setUpdateProducts } = useProductFunnelStats();

  const handleLearnModalAction = () => {
    setIsLearnModalOpen(false);
  };

  // Part E: Header cards with phase colors and reached states
  // Part G: "Offers" → "Offerings"
  const stats = [
    {
      title: 'Products in Funnel',
      value: productsInFunnel,
      icon: <ResearchIcon />,
      phase: 'research' as const,
      reached: productsInFunnel > 0, // Research is reached if there are any products
    },
    {
      title: 'Products Vetted',
      value: productsVetted,
      icon: <VettedIcon isDisabled={productsVetted === 0} />,
      phase: 'vetting' as const,
      reached: productsVetted > 0,
    },
    {
      title: 'Products Offerings Built',
      value: productsOffered,
      icon: <OfferIcon isDisabled={productsOffered === 0} />,
      phase: 'offer' as const,
      reached: productsOffered > 0,
    },
    {
      title: 'Products Sourced',
      value: productsSourced,
      icon: <SourcedIcon isDisabled={productsSourced === 0} />,
      phase: 'sourcing' as const,
      reached: productsSourced > 0,
    },
  ];

  return (
    <MainTemplate>
      <SectionStats 
        description="Every product in your funnel is a seed - the more you plant, the more you will Grow..." 
        stats={stats}
        learnButton={
          <button
            onClick={() => setIsLearnModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/30 rounded-lg text-purple-600 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-200 transition-all duration-200 transform hover:scale-105"
          >
            <PlayCircle className="w-4 h-4" />
            <span className="font-medium">Learn</span>
          </button>
        }
      />
      <Table setUpdateProducts={setUpdateProducts} />
      <LearnModal 
        isOpen={isLearnModalOpen} 
        onClose={() => setIsLearnModalOpen(false)} 
        onAction={handleLearnModalAction} 
      />
    </MainTemplate>
  );
};

export default ResearchPage;