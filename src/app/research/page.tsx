'use client';

import MainTemplate from "@/components/MainTemplate";
import SectionStats from "@/components/SectionStats";
import Table from "@/components/Table";
import ResearchIcon from "@/components/Icons/ResearchIcon";
import VettedIcon from "@/components/Icons/VettedIcon";
import OfferIcon from "@/components/Icons/OfferIcon";
import SourcedIcon from "@/components/Icons/SourcedIcon";
import { useProductFunnelStats } from "@/hooks/useProductFunnelStats";


const ResearchPage = () => {

  const { productsInFunnel, productsVetted, productsOffered, productsSourced, setUpdateProducts } = useProductFunnelStats();


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
      <SectionStats description="Every product in your funnel is a seed - the more you plant, the more you will Grow..." stats={stats} />
      <Table setUpdateProducts={setUpdateProducts} />
    </MainTemplate>
  );
};

export default ResearchPage;