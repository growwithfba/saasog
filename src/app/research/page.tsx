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

  const stats = [
    {
      title: 'Products in Funnel',
      value: productsInFunnel,
      icon: <ResearchIcon />,
      colorValue: "text-lime-700 dark:text-lime-500",
    },
    {
      title: 'Products Vetted',
      value: productsVetted,
      icon: <VettedIcon />,
      colorValue: "text-yellow-600 dark:text-yellow-400",
    },
    {
      title: 'Products Offers Built',
      value: productsOffered,
      icon: <OfferIcon />,
      colorValue: "text-orange-600 dark:text-orange-400",
    },
    {
      title: 'Products Sourced',
      value: productsSourced,
      icon: <SourcedIcon />,
      colorValue: "text-blue-700 dark:text-blue-500",
    },
  ];

  return (
    <MainTemplate>
      <div className="flex items-center justify-between mb-4">
        <div />
        <button
          onClick={() => setIsLearnModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500/20 to-blue-500/20 hover:from-purple-500/30 hover:to-blue-500/30 border border-purple-500/30 rounded-lg text-purple-600 dark:text-purple-300 hover:text-purple-700 dark:hover:text-purple-200 transition-all duration-200 transform hover:scale-105"
        >
          <PlayCircle className="w-4 h-4" />
          <span className="font-medium">Learn</span>
        </button>
      </div>
      <SectionStats description="Every product in your funnel is a seed - the more you plant, the more you will Grow..." stats={stats} />
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