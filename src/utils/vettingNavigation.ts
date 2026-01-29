type VettingNavigationParams = {
  productName?: string | null;
  researchProductId?: string | null;
  asin?: string | null;
};

const buildQueryParam = (key: string, value: string | null | undefined) => {
  if (!value) return "";
  return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
};

export const buildVettingEngineUrl = ({ productName, researchProductId, asin }: VettingNavigationParams) => {
  const params = [
    "tab=new",
    buildQueryParam("productName", productName),
    buildQueryParam("researchProductId", researchProductId),
    buildQueryParam("asin", asin),
  ].filter(Boolean);

  return `/vetting?${params.join("&")}`;
};
