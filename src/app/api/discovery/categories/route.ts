import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const KEEPA_BASE_URL = 'https://api.keepa.com';

/**
 * US root categories (domain=1), ids resolved from the provider's own
 * `category=0` root listing (see this task's Step 1) rather than
 * hand-written. Two of the eighteen course-relevant names did not
 * round-trip through provider name search (`Baby` and `Electronics`
 * returned no exact `parent === 0` hit — the search endpoint's term match
 * surfaces child/promotional nodes with the same words, not the root), so
 * the full root list was pulled directly via `category=0` and matched by
 * name instead. All 18 ids below were confirmed unique against that
 * authoritative root list.
 *
 * `avoid` carries the course's Module 02.3 guidance. It is a warning, not a
 * block — the provider silently ignores category exclusion, so it cannot be
 * enforced server-side even if we wanted to.
 */
const ROOTS: { id: string; name: string; avoid?: string }[] = [
  { id: '2617941011', name: 'Arts, Crafts & Sewing' },
  { id: '15684181', name: 'Automotive' },
  { id: '165796011', name: 'Baby Products' },
  { id: '3760911', name: 'Beauty & Personal Care' },
  { id: '2335752011', name: 'Cell Phones & Accessories' },
  { id: '7141123011', name: 'Clothing, Shoes & Jewelry' },
  { id: '172282', name: 'Electronics' },
  { id: '16310101', name: 'Grocery & Gourmet Food' },
  { id: '3760901', name: 'Health & Household' },
  { id: '1055398', name: 'Home & Kitchen' },
  { id: '16310091', name: 'Industrial & Scientific' },
  { id: '11091801', name: 'Musical Instruments' },
  { id: '1064954', name: 'Office Products' },
  { id: '2972638011', name: 'Patio, Lawn & Garden' },
  { id: '2619533011', name: 'Pet Supplies' },
  { id: '3375251', name: 'Sports & Outdoors' },
  { id: '228013', name: 'Tools & Home Improvement' },
  { id: '165793011', name: 'Toys & Games' },
];

const AVOID_NOTES: Record<string, string> = {
  'Grocery & Gourmet Food': 'Edible products carry liability risk and are often gated.',
  'Beauty & Personal Care': 'Topical products carry liability risk for new sellers.',
  Electronics: 'Electronics date quickly and carry high return rates.',
  'Cell Phones & Accessories': 'Accessory markets are trademark-heavy and often gated.',
};

// Keepa category ids are plain numeric strings. Validating against this
// before interpolation matters: `encodeURIComponent` round-trips a comma
// (`%2C` decodes back to `,`), and the provider treats `category=` as a
// comma-separated LIST — the child-fetch call below relies on exactly that
// behaviour. An unvalidated `parent` could therefore smuggle in N category
// ids in a single authenticated call.
const CATEGORY_ID_REGEX = /^\d{1,12}$/;

// Cap how many child ids we ever hand to the provider in one call. A wide
// root can have hundreds of children; the provider's per-call /category
// token cost for a batch this size has NOT been probed, so this cap is a
// safety margin, not a measured limit.
const MAX_CHILD_CATEGORIES = 100;

export async function GET(request: NextRequest) {
  const parent = request.nextUrl.searchParams.get('parent');

  // No parent => the root list, served locally from a static array. Cheap,
  // stable, and costs no provider tokens, so — unlike the branch below —
  // it does not need a logged-in user.
  if (!parent) {
    return NextResponse.json({
      success: true,
      categories: ROOTS.map((r) => ({
        id: r.id,
        name: r.name,
        hasChildren: true,
        avoid: AVOID_NOTES[r.name] ?? null,
      })),
    });
  }

  if (!CATEGORY_ID_REGEX.test(parent)) {
    return NextResponse.json({ success: false, error: 'Invalid category id.' }, { status: 400 });
  }

  // Every level below the root calls the provider and spends tokens, so —
  // matching the sibling /api/discovery/search and /api/discovery/hydrate
  // routes — it requires a logged-in user.
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');
  const supabase = token
    ? createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      )
    : createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ success: false, error: 'Unauthorized. Please log in.' }, { status: 401 });
  }

  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Categories unavailable.' }, { status: 500 });
  }

  const url = `${KEEPA_BASE_URL}/category?key=${apiKey}&domain=1&category=${encodeURIComponent(parent)}&parents=0`;
  const res = await fetch(url);
  const data = await res.json();

  if (data?.error) {
    console.error('[discovery/categories] provider error', data.error);
    return NextResponse.json({ success: false, error: 'Categories unavailable.' }, { status: 502 });
  }

  const node = data?.categories?.[parent];
  const childIds: number[] = node?.children ?? [];

  let categories: { id: string; name: string; hasChildren: boolean }[] = [];
  if (childIds.length > 0) {
    const cappedChildIds = childIds.slice(0, MAX_CHILD_CATEGORIES);
    const childUrl =
      `${KEEPA_BASE_URL}/category?key=${apiKey}&domain=1` +
      `&category=${cappedChildIds.join(',')}&parents=0`;
    const childRes = await fetch(childUrl);
    const childData = await childRes.json();
    categories = Object.entries(childData?.categories ?? {}).map(([id, value]: [string, any]) => ({
      id,
      name: value?.name ?? id,
      hasChildren: Array.isArray(value?.children) && value.children.length > 0,
    }));
  }

  return NextResponse.json({ success: true, categories });
}
