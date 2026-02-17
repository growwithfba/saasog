import {
  RESEARCH_FIELD_DEFINITIONS,
  formatResearchFieldValue,
  parseResearchFieldDate,
  parseResearchFieldNumeric,
  type ResearchFieldDataType,
  type ResearchFieldDefinition,
  type ResearchFieldId,
} from "@/utils/researchFieldDefinitions";
import { getProgressScoreFromState, getProgressStateFromRow } from "@/utils/progressState";

export type ResearchFunnelSorting = { id: ResearchFunnelColumnId; desc: boolean };

export type ResearchFunnelColumnDef = {
  id: ResearchFunnelColumnId;
  label: string;
  dataType: ResearchFunnelDataType;
  sortable: boolean;
  defaultVisible: boolean;
  toggleable: boolean;
};

export type ResearchFunnelDataType = ResearchFieldDataType;
export type ResearchFunnelColumnId = ResearchFieldId;

const mapFieldToColumn = (field: ResearchFieldDefinition): ResearchFunnelColumnDef => ({
  id: field.id,
  label: field.label,
  dataType: field.dataType,
  sortable: field.sortable,
  defaultVisible: field.defaultVisible,
  toggleable: field.toggleable,
});

export const RESEARCH_FUNNEL_COLUMNS: ResearchFunnelColumnDef[] = RESEARCH_FIELD_DEFINITIONS.map(mapFieldToColumn);

export const DEFAULT_VISIBLE_COLUMN_IDS = RESEARCH_FUNNEL_COLUMNS.filter((column) => column.defaultVisible).map(
  (column) => column.id
);

export const DEFAULT_SORTING: ResearchFunnelSorting[] = [{ id: "progress", desc: true }];

const getExtraDataValue = (extraData: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = extraData?.[key];
    if (value !== null && value !== undefined && value !== "") {
      return value;
    }
  }
  return null;
};

export const getProgressScore = (submission: any): number => {
  return getProgressScoreFromState(getProgressStateFromRow(submission));
};

export const getResearchFunnelColumnValue = (submission: any, columnId: ResearchFunnelColumnId) => {
  const extraData = submission?.extra_data || {};

  switch (columnId) {
    case "asin":
      return submission?.asin ?? null;
    case "title":
      return submission?.display_title || submission?.productName || submission?.title || null;
    case "category":
      return submission?.category ?? null;
    case "brand":
      return submission?.brand ?? null;
    case "price":
      return submission?.price ?? null;
    case "monthlyRevenue":
      return submission?.monthly_revenue ?? null;
    case "monthlyUnitsSold":
      return submission?.monthly_units_sold ?? null;
    case "bsr":
      return getExtraDataValue(extraData, ["bsr", "BSR", "Best Seller Rank"]);
    case "rating":
      return getExtraDataValue(extraData, ["rating", "Rating"]);
    case "review":
      return getExtraDataValue(extraData, [
        "review",
        "reviews",
        "Reviews",
        "review_count",
        "reviewCount",
        "Review Count",
        "Reviews Count",
      ]);
    case "weight":
      return getExtraDataValue(extraData, ["weight", "Weight", "Product Weight"]);
    case "netPrice":
      return getExtraDataValue(extraData, ["net_price", "Net Price"]);
    case "sizeTier":
      return getExtraDataValue(extraData, ["size_tier", "Size Tier"]);
    case "priceTrend":
      return getExtraDataValue(extraData, ["price_trend", "Price Trend"]);
    case "salesTrend":
      return getExtraDataValue(extraData, ["sales_trend", "Sales Trend"]);
    case "fulfilledBy":
      return getExtraDataValue(extraData, ["fulfilled_by", "Fulfilled By"]);
    case "activeSellers":
      return getExtraDataValue(extraData, ["active_sellers", "Active Sellers"]);
    case "lastYearSales":
      return getExtraDataValue(extraData, ["last_year_sales", "Last Year Sales"]);
    case "variationCount":
      return getExtraDataValue(extraData, ["variation_count", "Variation Count"]);
    case "numberOfImages":
      return getExtraDataValue(extraData, ["number_of_images", "Number of Images"]);
    case "salesToReviews":
      return getExtraDataValue(extraData, ["sales_to_reviews", "Sales to Reviews"]);
    case "bestSalesPeriod":
      return getExtraDataValue(extraData, ["best_sales_period", "Best Sales Period"]);
    case "parentLevelSales":
      return getExtraDataValue(extraData, ["parent_level_sales", "Parent Level Sales"]);
    case "parentLevelRevenue":
      return getExtraDataValue(extraData, ["parent_level_revenue", "Parent Level Revenue"]);
    case "salesYearOverYear":
      return getExtraDataValue(extraData, ["sales_year_over_year", "Sales Year Over Year"]);
    case "progress":
      return getProgressScore(submission);
    default:
      return null;
  }
};

export const getResearchFunnelColumnById = (columnId: ResearchFunnelColumnId) =>
  RESEARCH_FUNNEL_COLUMNS.find((column) => column.id === columnId) || null;

export const getToggleableColumns = () => RESEARCH_FUNNEL_COLUMNS.filter((column) => column.toggleable);

export const normalizeVisibleColumns = (value: unknown): ResearchFunnelColumnId[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_VISIBLE_COLUMN_IDS];
  }
  const allowed = new Set(RESEARCH_FUNNEL_COLUMNS.map((column) => column.id));
  const filtered = value.filter((id): id is ResearchFunnelColumnId => typeof id === "string" && allowed.has(id as any));
  if (filtered.length === 0) {
    return [...DEFAULT_VISIBLE_COLUMN_IDS];
  }
  const baseColumns = RESEARCH_FUNNEL_COLUMNS.filter((column) => column.defaultVisible && !column.toggleable).map(
    (column) => column.id
  );
  return Array.from(new Set([...baseColumns, ...filtered]));
};

export const normalizeSorting = (value: unknown): ResearchFunnelSorting[] => {
  if (!Array.isArray(value)) {
    return [...DEFAULT_SORTING];
  }
  const allowed = new Set(RESEARCH_FUNNEL_COLUMNS.map((column) => column.id));
  const filtered = value
    .filter(
      (sort): sort is ResearchFunnelSorting =>
        sort && typeof sort.id === "string" && allowed.has(sort.id as any)
    )
    .map((sort) => ({ id: sort.id as ResearchFunnelColumnId, desc: Boolean(sort.desc) }));
  return filtered.length > 0 ? filtered : [...DEFAULT_SORTING];
};

const parseNumeric = (value: unknown) => {
  return parseResearchFieldNumeric(value);
};

const parseDate = (value: unknown) => {
  return parseResearchFieldDate(value);
};

export const getSortableValue = (value: unknown, dataType: ResearchFunnelDataType) => {
  switch (dataType) {
    case "currency":
    case "number":
    case "percent":
    case "boolean":
    case "rating":
    case "weight":
      return parseNumeric(value);
    case "date":
      return parseDate(value);
    case "text":
    default:
      if (value === null || value === undefined) return null;
      return String(value).toLowerCase();
  }
};

export const compareResearchFunnelValues = (a: unknown, b: unknown, desc: boolean) => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;

  let comparison = 0;
  if (typeof a === "string" && typeof b === "string") {
    comparison = a.localeCompare(b, undefined, { sensitivity: "base" });
  } else if (typeof a === "number" && typeof b === "number") {
    comparison = a < b ? -1 : a > b ? 1 : 0;
  } else {
    const aText = String(a);
    const bText = String(b);
    comparison = aText.localeCompare(bText, undefined, { sensitivity: "base" });
  }

  return desc ? -comparison : comparison;
};

export const sortResearchFunnelRows = (rows: any[], sorting: ResearchFunnelSorting[]) => {
  if (!Array.isArray(rows) || rows.length <= 1) return rows || [];
  const activeSorting = normalizeSorting(sorting)[0];
  const column = activeSorting ? getResearchFunnelColumnById(activeSorting.id) : null;
  if (!column) return rows;

  return [...rows].sort((rowA, rowB) => {
    const rawA = getResearchFunnelColumnValue(rowA, column.id);
    const rawB = getResearchFunnelColumnValue(rowB, column.id);
    const valueA = getSortableValue(rawA, column.dataType);
    const valueB = getSortableValue(rawB, column.dataType);
    return compareResearchFunnelValues(valueA, valueB, activeSorting.desc);
  });
};

export const formatResearchFunnelValue = (value: unknown, dataType: ResearchFunnelDataType) => {
  return formatResearchFieldValue(value, dataType);
};
