import { formatDate } from "@/utils/formatDate";

export type ResearchFieldDataType =
  | "text"
  | "number"
  | "currency"
  | "percent"
  | "date"
  | "boolean"
  | "rating"
  | "weight";

export type ResearchFieldGroup = "Core" | "Market & Demand" | "Trends" | "Listing & Competition";

export type ResearchFieldId =
  | "asin"
  | "title"
  | "category"
  | "brand"
  | "price"
  | "monthlyRevenue"
  | "monthlyUnitsSold"
  | "bsr"
  | "rating"
  | "review"
  | "weight"
  | "netPrice"
  | "sizeTier"
  | "priceTrend"
  | "salesTrend"
  | "fulfilledBy"
  | "activeSellers"
  | "lastYearSales"
  | "variationCount"
  | "numberOfImages"
  | "salesToReviews"
  | "bestSalesPeriod"
  | "parentLevelSales"
  | "parentLevelRevenue"
  | "salesYearOverYear"
  | "progress";

export type ResearchFieldDefinition = {
  id: ResearchFieldId;
  label: string;
  group: ResearchFieldGroup;
  dataType: ResearchFieldDataType;
  sortable: boolean;
  defaultVisible: boolean;
  toggleable: boolean;
  summaryDefault?: boolean;
};

export const RESEARCH_FIELD_DEFINITIONS: ResearchFieldDefinition[] = [
  {
    id: "asin",
    label: "ASIN",
    group: "Core",
    dataType: "text",
    sortable: true,
    defaultVisible: true,
    toggleable: false,
  },
  {
    id: "title",
    label: "Title",
    group: "Core",
    dataType: "text",
    sortable: true,
    defaultVisible: true,
    toggleable: false,
  },
  {
    id: "category",
    label: "Category",
    group: "Core",
    dataType: "text",
    sortable: true,
    defaultVisible: true,
    toggleable: false,
  },
  {
    id: "brand",
    label: "Brand",
    group: "Core",
    dataType: "text",
    sortable: true,
    defaultVisible: true,
    toggleable: false,
  },
  {
    id: "price",
    label: "Price",
    group: "Core",
    dataType: "currency",
    sortable: true,
    defaultVisible: true,
    toggleable: true,
    summaryDefault: true,
  },
  {
    id: "monthlyRevenue",
    label: "Monthly Revenue",
    group: "Core",
    dataType: "currency",
    sortable: true,
    defaultVisible: true,
    toggleable: true,
    summaryDefault: true,
  },
  {
    id: "monthlyUnitsSold",
    label: "Monthly Units Sold",
    group: "Core",
    dataType: "number",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
    summaryDefault: true,
  },
  {
    id: "bsr",
    label: "BSR",
    group: "Market & Demand",
    dataType: "number",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
    summaryDefault: true,
  },
  {
    id: "rating",
    label: "Rating",
    group: "Market & Demand",
    dataType: "rating",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
    summaryDefault: true,
  },
  {
    id: "review",
    label: "Reviews",
    group: "Market & Demand",
    dataType: "number",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
    summaryDefault: true,
  },
  {
    id: "salesToReviews",
    label: "Sales to Reviews",
    group: "Market & Demand",
    dataType: "number",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "lastYearSales",
    label: "Last Year Sales",
    group: "Market & Demand",
    dataType: "currency",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "parentLevelSales",
    label: "Parent Level Sales",
    group: "Market & Demand",
    dataType: "number",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "parentLevelRevenue",
    label: "Parent Level Revenue",
    group: "Market & Demand",
    dataType: "currency",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "priceTrend",
    label: "Price Trend",
    group: "Trends",
    dataType: "percent",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "salesTrend",
    label: "Sales Trend",
    group: "Trends",
    dataType: "percent",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "salesYearOverYear",
    label: "Sales Year Over Year",
    group: "Trends",
    dataType: "percent",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "bestSalesPeriod",
    label: "Best Sales Period",
    group: "Trends",
    dataType: "text",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "fulfilledBy",
    label: "Fulfilled By",
    group: "Listing & Competition",
    dataType: "text",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "activeSellers",
    label: "Active Sellers",
    group: "Listing & Competition",
    dataType: "number",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
    summaryDefault: true,
  },
  {
    id: "variationCount",
    label: "Variation Count",
    group: "Listing & Competition",
    dataType: "number",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
    summaryDefault: true,
  },
  {
    id: "numberOfImages",
    label: "Number of Images",
    group: "Listing & Competition",
    dataType: "number",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "netPrice",
    label: "Net Price",
    group: "Listing & Competition",
    dataType: "currency",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "sizeTier",
    label: "Size Tier",
    group: "Listing & Competition",
    dataType: "text",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "weight",
    label: "Weight",
    group: "Listing & Competition",
    dataType: "weight",
    sortable: true,
    defaultVisible: false,
    toggleable: true,
  },
  {
    id: "progress",
    label: "Progress",
    group: "Core",
    dataType: "number",
    sortable: true,
    defaultVisible: true,
    toggleable: false,
  },
];

export const getResearchFieldDefinitionById = (fieldId: ResearchFieldId) =>
  RESEARCH_FIELD_DEFINITIONS.find((field) => field.id === fieldId) || null;

export const getResearchFieldDefinitionsByGroup = (group: ResearchFieldGroup) =>
  RESEARCH_FIELD_DEFINITIONS.filter((field) => field.group === group);

export const getSummaryFieldDefinitions = () =>
  RESEARCH_FIELD_DEFINITIONS.filter((field) => field.summaryDefault);

export const parseResearchFieldNumeric = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,%]/g, "").replace(/,/g, "").trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const parseResearchFieldDate = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const formatNumberValue = (value: number, maxFractionDigits = 2) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: maxFractionDigits }).format(value);

const formatCurrencyValue = (value: number) => {
  const hasCents = Math.abs(value % 1) > 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatPercentValue = (value: number) => {
  const hasFraction = Math.abs(value % 1) > 0;
  return `${formatNumberValue(hasFraction ? value : Math.round(value), hasFraction ? 2 : 0)}%`;
};

const formatRatingValue = (value: number) =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value);

const formatWeightValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "—";
    const hasUnit = /[a-zA-Z]/.test(trimmed);
    if (hasUnit) return trimmed;
    const parsed = parseResearchFieldNumeric(trimmed);
    return parsed === null ? trimmed : `${formatNumberValue(parsed)} lb`;
  }
  const parsed = parseResearchFieldNumeric(value);
  return parsed === null ? "—" : `${formatNumberValue(parsed)} lb`;
};

export const formatResearchFieldValue = (value: unknown, dataType: ResearchFieldDataType) => {
  if (value === null || value === undefined || value === "") return "—";

  switch (dataType) {
    case "currency": {
      const numeric = parseResearchFieldNumeric(value);
      return numeric === null ? "—" : formatCurrencyValue(numeric);
    }
    case "percent": {
      const numeric = parseResearchFieldNumeric(value);
      return numeric === null ? "—" : formatPercentValue(numeric);
    }
    case "number": {
      const numeric = parseResearchFieldNumeric(value);
      return numeric === null ? "—" : formatNumberValue(numeric);
    }
    case "rating": {
      const numeric = parseResearchFieldNumeric(value);
      return numeric === null ? "—" : formatRatingValue(numeric);
    }
    case "weight": {
      return formatWeightValue(value);
    }
    case "date": {
      const parsed = parseResearchFieldDate(value);
      return parsed === null ? "—" : formatDate(new Date(parsed).toISOString());
    }
    case "boolean": {
      return value ? "Yes" : "No";
    }
    case "text":
    default:
      return String(value);
  }
};
