/**
 * US root category id -> name.
 *
 * The sales-rank curve's multiplier is keyed by category NAME, but filters
 * carry category IDs, so revenue-to-rank translation needs this map. Ids were
 * resolved from the provider's own category tree, not hand-written — two of
 * them (Electronics, Baby Products) do not resolve via name search and were
 * taken from its root dump.
 *
 * Only roots appear here. A subcategory selection falls back to the
 * uncalibrated base curve, which widens the derived window rather than
 * narrowing it — the safe direction.
 */
export const ROOT_CATEGORY_NAMES: Record<string, string> = {
  '2617941011': 'Arts, Crafts & Sewing',
  '15684181': 'Automotive',
  '165796011': 'Baby Products',
  '3760911': 'Beauty & Personal Care',
  '2335752011': 'Cell Phones & Accessories',
  '7141123011': 'Clothing, Shoes & Jewelry',
  '172282': 'Electronics',
  '16310101': 'Grocery & Gourmet Food',
  '3760901': 'Health & Household',
  '1055398': 'Home & Kitchen',
  '16310091': 'Industrial & Scientific',
  '11091801': 'Musical Instruments',
  '1064954': 'Office Products',
  '2972638011': 'Patio, Lawn & Garden',
  '2619533011': 'Pet Supplies',
  '3375251': 'Sports & Outdoors',
  '228013': 'Tools & Home Improvement',
  '165793011': 'Toys & Games',
};
