import type { AsinSnapshot } from './asinSnapshot';

/**
 * Shape of the insert payload expected by the research_products table.
 * Dedicated columns are at top level; everything else lives in
 * extra_data JSONB.
 */
export interface ResearchProductInsert {
  user_id: string;
  asin: string;
  title: string | null;
  category: string | null;
  brand: string | null;
  price: number | null;
  monthly_revenue: number | null;
  monthly_units_sold: number | null;
  extra_data: Record<string, unknown>;
  updated_at: string;
}

/**
 * Map an AsinSnapshot into the exact shape the existing
 * research_products PUT/POST API expects. Extra_data keys follow
 * the naming used by the Helium 10 CSV upload path
 * (see src/utils/researchFunnelTable.ts :: getResearchFunnelColumnValue
 * for the full list of aliases the UI understands).
 */
export function mapSnapshotToResearch(
  snapshot: AsinSnapshot,
  userId: string
): ResearchProductInsert {
  const pending_sources = snapshot.pending_sources;
  const extra_data: Record<string, unknown> = {
    // Map Keepa-populated fields to the snake_case keys the UI reads.
    bsr: snapshot.bsr,
    rating: snapshot.rating,
    review: snapshot.review,
    weight: snapshot.weight,
    number_of_images: snapshot.number_of_images,
    size_tier: snapshot.size_tier,
    price_trend: snapshot.price_trend,
    sales_trend: snapshot.sales_trend,
    last_year_sales: snapshot.last_year_sales,
    sales_year_over_year: snapshot.sales_year_over_year,
    sales_to_reviews: snapshot.sales_to_reviews,
    best_sales_period: snapshot.best_sales_period,
    date_first_available: snapshot.date_first_available,
    variation_count: snapshot.variation_count,

    // Fields Keepa can't give us today. Left null so the UI can show
    // "Pending" and the Chrome extension / SP-API / variations call
    // knows what it owes.
    net_price: null,
    parent_level_sales: null,
    parent_level_revenue: null,
    active_sellers: null,
    fulfilled_by: null,

    // Preserve the full category path (e.g. ["Toys & Games", "Games",
    // "Card Games"]). The top-level name goes in the dedicated `category`
    // column for the table's main view; the subcategory chain is kept here
    // for future filters / enrichment.
    category_path: snapshot.category_path,

    // Amazon's own "X+ bought in the past month" badge, as surfaced by
    // Keepa. Kept for reference — NOT used as a real sales estimate.
    amazon_bought_past_month_display: snapshot.amazon_bought_past_month_display,

    // Provenance + routing info for future enrichment steps.
    __source: 'keepa_asin_snapshot',
    __fetched_at: snapshot.fetchedAt,
    __pending_sources: pending_sources,
  };

  return {
    user_id: userId,
    asin: snapshot.asin,
    title: snapshot.title,
    category: snapshot.category,
    brand: snapshot.brand,
    price: snapshot.price,
    monthly_revenue: snapshot.monthly_revenue,
    monthly_units_sold: snapshot.monthly_units_sold,
    extra_data,
    updated_at: new Date().toISOString(),
  };
}
