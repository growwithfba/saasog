import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import mammoth from 'mammoth';
import crypto from 'crypto';
import generateReviewAnalysisJSON, {
  generateReviewAnalysisFromBlocks,
  generateSSPRecommendationsFromInsights,
  improveSSPIdea
} from '@/services/analyzeOpenAI';

// Interface for parsed review from CSV
interface Review {
  title: string;
  body: string;
  rating: number | string;
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REVIEW_BLOCK_CAP = 200;

const isCsvFile = (file: File) => {
  const name = (file.name || '').toLowerCase();
  return name.endsWith('.csv') || file.type === 'text/csv';
};

const normalizeReviewText = (raw: string) => {
  let t = (raw || '').replace(/\r/g, '');

  // Remove common non-review noise lines (page headers / UI artifacts)
  t = t.replace(/^\s*From the United States\s*$/gim, '');
  t = t.replace(/^\s*Customer image\s*$/gim, '');
  t = t.replace(/^\s*(Helpful|Report)\s*$/gim, '');
  t = t.replace(/^\s*(Translate review to English)\s*$/gim, '');
  t = t.replace(/^\s*(Click to play video)\s*$/gim, '');
  t = t.replace(/^\s*(\d+|One|Two|Three|Four|Five)\s+people?\s+found\s+this\s+helpful\s*$/gim, '');
  t = t.replace(/^\s*Read more\s*$/gim, '');

  // Collapse whitespace
  t = t.replace(/[ \t]+\n/g, '\n');
  t = t.replace(/\n{3,}/g, '\n\n');
  return t.trim();
};

const makeReviewKey = (review: Review) => {
  return [
    (review.title || '').trim().toLowerCase(),
    (review.body || '').trim().toLowerCase(),
    String(review.rating ?? '').trim().toLowerCase()
  ].join('||');
};

const dedupeReviews = (reviews: Review[]) => {
  const seen = new Set<string>();
  const unique: Review[] = [];
  for (const review of reviews) {
    const key = makeReviewKey(review);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(review);
  }
  return unique;
};

const capReviews = (reviews: Review[], cap = REVIEW_BLOCK_CAP) => reviews.slice(0, cap);

const splitIntoReviewBlocks = (text: string) => {
  const t = text || '';
  const hasEor = /END OF REVIEW/i.test(t);

  // If user added END OF REVIEW markers, treat them as authoritative boundaries
  if (hasEor) {
    return t
      .split(/END OF REVIEW/gi)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // Otherwise split ONLY on rating header lines (NOT on "Reviewed in...")
  const lines = t.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];

  const isRatingHeader = (line: string) => {
    const l = line.trim();
    return /^\d(\.\d)?\s+out of 5 stars\b/i.test(l);
  };

  for (const line of lines) {
    if (isRatingHeader(line)) {
      if (current.length) {
        const block = current.join('\n').trim();
        if (block) blocks.push(block);
      }
      current = [line];
    } else {
      current.push(line);
    }
  }

  const tail = current.join('\n').trim();
  if (tail) blocks.push(tail);

  // Fallback: if split failed, treat paragraphs as blocks
  if (blocks.length <= 1) {
    const paras = t
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter(Boolean);
    return paras.length ? paras : [t.trim()];
  }

  return blocks;
};

const normalizeBlockForHash = (block: string) => (
  (block || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
);

const sha1 = (value: string) => (
  crypto.createHash('sha1').update(value).digest('hex')
);

const dedupeBlocks = (blocks: string[]) => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const block of blocks) {
    const hash = sha1(normalizeBlockForHash(block));
    if (seen.has(hash)) continue;
    seen.add(hash);
    unique.push(block);
  }
  return unique;
};

const finalizeReviewBlocks = (rawText: string, cap = REVIEW_BLOCK_CAP) => {
  console.log('[reviews] extracted_chars:', rawText?.length ?? 0);

  const normalized = normalizeReviewText(rawText);
  const split = splitIntoReviewBlocks(normalized);
  console.log('[reviews] blocks_split:', split.length);

  const filtered = split
    .map(b => b.trim())
    .filter(Boolean)
    .filter(b => b.replace(/\s+/g, ' ').length >= 30);
  console.log('[reviews] blocks_filtered:', filtered.length);

  const unique = dedupeBlocks(filtered);
  console.log('[reviews] blocks_deduped:', unique.length);

  const capped = unique.slice(0, cap);
  console.log('[reviews] blocks_capped:', capped.length);
  console.log('[reviews] sample_1:', capped[0]?.slice(0, 300));
  console.log('[reviews] sample_2:', capped[1]?.slice(0, 300));

  return capped;
};

const extractBlocksFromStoredReviews = (stored: any[]) => {
  return stored
    .map((review) => {
      if (!review) return '';
      const title = review.title ?? '';
      const body = review.body ?? review.comment ?? review.content ?? '';
      const rating = review.rating ?? review.stars ?? review.star ?? review.score ?? '';
      const ratingLine = rating ? `${rating} out of 5 stars` : '';
      return [ratingLine, title, body].filter(Boolean).join('\n').trim();
    })
    .filter(Boolean);
};

const fileToText = async (file: File) => {
  const name = (file.name || '').toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith('.docx')) {
    const res = await mammoth.extractRawText({ buffer: buf });
    return (res.value || '').trim();
  }

  if (name.endsWith('.pdf')) {
    try {
      const pdfModule = await import('pdf-parse/node');
      const pdfParse = (pdfModule as { default?: (data: Buffer) => Promise<{ text?: string }> }).default || (pdfModule as any);
      const res = await pdfParse(buf);
      return (res.text || '').trim();
    } catch (error) {
      console.error('Error parsing PDF:', error);
      throw new Error('Failed to extract text from PDF. Please try a different PDF or convert to DOCX/TXT.');
    }
  }

  return buf.toString('utf8').trim();
};

type SspResponse = {
  quantity_improvements?: any[];
  functional_enhancements?: any[];
  quality_upgrades?: any[];
  aesthetic_innovations?: any[];
  strategic_bundling?: any[];
};

const mapSspResponseToCategories = (ssp: SspResponse | null) => ({
  quantity: ssp?.quantity_improvements || [],
  functionality: ssp?.functional_enhancements || [],
  quality: ssp?.quality_upgrades || [],
  aesthetic: ssp?.aesthetic_innovations || [],
  bundle: ssp?.strategic_bundling || []
});

const hasInsightContent = (insights: any) => {
  if (!insights) return false;
  return Boolean(
    insights.topLikes?.toString().trim() ||
    insights.topDislikes?.toString().trim() ||
    insights.importantInsights?.toString().trim() ||
    insights.importantQuestions?.toString().trim()
  );
};

const countInsightItems = (value?: string) => {
  if (!value) return 0;
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean).length;
};

const countSignalLines = (value?: string) => {
  if (!value) return 0;
  const lines = value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
  const signalRegex = /(\d+%|\b\d+\b|\b\d+\s+in\s+\d+\b|around\s+\d+%)/i;
  return lines.filter(line => signalRegex.test(line)).length;
};

const isInsightsThin = (insights: any) => {
  if (!insights) return true;

  const strengthsCount = countInsightItems(insights.topLikes);
  const painsCount = countInsightItems(insights.topDislikes);
  const hasSentimentDistribution = Boolean(
    Number(insights.totalReviewCount) > 0 ||
    Number(insights.positiveReviewCount) > 0 ||
    Number(insights.neutralReviewCount) > 0 ||
    Number(insights.negativeReviewCount) > 0
  );

  const totalInsightLines =
    countInsightItems(insights.topLikes) +
    countInsightItems(insights.topDislikes) +
    countInsightItems(insights.importantInsights);
  const signalLines =
    countSignalLines(insights.topLikes) +
    countSignalLines(insights.topDislikes) +
    countSignalLines(insights.importantInsights);
  const signalRatio = totalInsightLines === 0 ? 0 : signalLines / totalInsightLines;
  const signalsThin = totalInsightLines > 0 && signalRatio < 0.4;

  return strengthsCount < 3 || painsCount < 3 || !hasSentimentDistribution || signalsThin;
};

const normalizeStoredReview = (review: any): Review | null => {
  if (!review) return null;
  const ratingRaw = review.rating ?? review.stars ?? review.star ?? review.score;
  const ratingValue = Number(ratingRaw);
  const rating = Number.isFinite(ratingValue) ? ratingValue : ratingRaw ?? 0;
  const title = review.title ?? '';
  const body = review.body ?? review.comment ?? review.content ?? '';
  return { title, body, rating };
};

const reviewFromBlock = (block: string): Review => {
  const lines = (block || '').split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return { title: '', body: '', rating: 0 };
  const ratingMatch = lines[0].match(/^(\d(?:\.\d)?)\s+out of 5 stars\b/i);
  let rating: number | string = 0;
  let bodyLines = lines;
  if (ratingMatch) {
    rating = Number(ratingMatch[1]);
    bodyLines = lines.slice(1);
  }
  const body = bodyLines.join('\n').trim();
  return { title: '', body, rating };
};

const sampleReviewsForSSP = (reviews: Review[], max = 16) => {
  if (!Array.isArray(reviews) || reviews.length === 0) return [];

  const shuffle = <T,>(items: T[]) => items
    .map(item => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);

  const normalized = reviews.map(normalizeStoredReview).filter(Boolean) as Review[];
  const fiveStar = normalized.filter(r => Number(r.rating) === 5);
  const threeStar = normalized.filter(r => Number(r.rating) === 3);
  const oneStar = normalized.filter(r => Number(r.rating) === 1);
  const other = normalized.filter(r => ![5, 3, 1].includes(Number(r.rating)));

  const pick = (items: Review[], count: number) => shuffle(items).slice(0, count);

  const picks = [
    ...pick(fiveStar, 6),
    ...pick(threeStar, 4),
    ...pick(oneStar, 4)
  ];

  const remaining = normalized.filter(r => !picks.includes(r));
  const needed = Math.max(0, max - picks.length);
  const filler = needed > 0 ? pick([...remaining, ...other], needed) : [];

  return [...picks, ...filler].slice(0, max);
};

/**
 * POST /api/offer/analyze-reviews
 * 
 * Analyzes customer reviews from a CSV file and generates:
 * - Top 5 customer likes
 * - Top 5 customer dislikes
 * - Important insights
 * - Important questions
 * - SSP ideas for all 5 categories
 * 
 * CURRENTLY: Returns mock data for frontend testing
 * 
 * TO HOOK UP REAL AI:
 * 1. Parse the uploaded CSV file to extract reviews
 * 2. Call OpenAI API with a prompt to analyze the reviews
 * 3. Structure the response to match the OfferData interface
 * 4. Return the generated insights
 * 
 * Example OpenAI prompt structure:
 * - "Analyze these customer reviews and provide: top 5 likes, top 5 dislikes, 
 *   important insights, important questions, and SSP ideas for quantity, functionality, 
 *   quality, aesthetic, and bundle categories."
 */
export async function POST(request: NextRequest) {
  try {
    // Get the authorization token from headers
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    // Create authenticated Supabase client if token exists
    let serverSupabase;
    if (token) {
      serverSupabase = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          global: {
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        }
      );
    } else {
      serverSupabase = createClient();
    }

    // Get the authenticated user
    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    // Check content type to determine if it's form data or JSON
    const contentType = request.headers.get('content-type') || '';
    let file: File | null = null;
    let productId: string | null = null;
    let generateOnly = false;
    let generateSSP = false;
    let reviewInsights: any = null;
    let reviews: Review[] = [];
    let rawReviewBlocks: string[] = [];
    let appendMode = false;
    let dataResponse: any = null;
    let capReached = false;

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      file = formData.get('file') as File;
      productId = formData.get('productId') as string;
      appendMode = formData.get('append')?.toString().toLowerCase() === 'true';

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No file provided' },
          { status: 400 }
        );
      }

      console.log('Received file:', file.name, 'Size:', file.size, 'bytes');

      let storedReviews: Review[] = [];
      if (appendMode && productId) {
        const { data: offerProduct, error: fetchError } = await serverSupabase
          .from('offer_products')
          .select('reviews')
          .eq('product_id', productId)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Error fetching stored reviews for append:', fetchError);
        }

        if (Array.isArray(offerProduct?.reviews)) {
          storedReviews = (offerProduct.reviews as Review[])
            .map(normalizeStoredReview)
            .filter(Boolean) as Review[];
        }
      }

      if (isCsvFile(file)) {
        // Parse CSV file and extract reviews using PapaParse
        const fileText = await file.text();

        const parseResult = Papa.parse<Review>(fileText, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (header: string) => header.trim().toLowerCase(),
        });

        // Map parsed data to Review objects with expected headers: title, body, rating
        const parsedReviews = parseResult.data.map((row: any) => ({
          title: row.title || '',
          body: row.body || '',
          rating: row.rating ? (isNaN(Number(row.rating)) ? row.rating : Number(row.rating)) : 0,
        }));

        const mergedReviews = appendMode ? [...storedReviews, ...parsedReviews] : parsedReviews;
        const deduped = dedupeReviews(mergedReviews);
        capReached = deduped.length > REVIEW_BLOCK_CAP;
        reviews = capReviews(deduped);

        console.log(`Parsed ${reviews.length} reviews from CSV`);
      } else {
        const rawText = await fileToText(file);
        const blocks = finalizeReviewBlocks(rawText, REVIEW_BLOCK_CAP);

        if (appendMode) {
          const existingBlocks = extractBlocksFromStoredReviews(storedReviews)
            .map(b => b.trim())
            .filter(Boolean)
            .filter(b => b.replace(/\s+/g, ' ').length >= 30);
          rawReviewBlocks = dedupeBlocks([...existingBlocks, ...blocks]).slice(0, REVIEW_BLOCK_CAP);
        } else {
          rawReviewBlocks = blocks;
        }

        const deduped = dedupeReviews(rawReviewBlocks.map(reviewFromBlock));
        capReached = deduped.length > REVIEW_BLOCK_CAP;
        reviews = capReviews(deduped);
        console.log('[reviews] blocks_final:', rawReviewBlocks.length);
        console.log('[reviews] sample_final_1:', rawReviewBlocks[0]?.slice(0, 300));
        console.log('[reviews] sample_final_2:', rawReviewBlocks[1]?.slice(0, 300));
      }
    } else {
      // Handle JSON request (for AI generation)
      const body = await request.json();
      productId = body.productId;
      generateOnly = body.generateOnly || false;
      generateSSP = body.generateSSP || false;
      reviewInsights = body.reviewInsights || null;

      // Handle SSP improvement request
      if (body.improveSSP && productId) {
        const { improvementText, instruction, category } = body;

        if (!improvementText || !instruction) {
          return NextResponse.json(
            { success: false, error: 'Missing improvementText or instruction' },
            { status: 400 }
          );
        }

        // Fetch insights from offer_products using productId
        const { data: offerProduct, error: fetchError } = await serverSupabase
          .from('offer_products')
          .select('insights')
          .eq('product_id', productId)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Error fetching insights for improvement:', fetchError);
        }

        const storedInsights = offerProduct?.insights || {};

        try {
          const improvedIdea = await improveSSPIdea(
            improvementText,
            instruction,
            category || 'general',
            {
              topLikes: storedInsights.topLikes || '',
              topDislikes: storedInsights.topDislikes || '',
              importantInsights: storedInsights.importantInsights || '',
              importantQuestions: storedInsights.importantQuestions || ''
            }
          );

          return NextResponse.json({
            success: true,
            data: { improved: improvedIdea },
            message: 'SSP idea improved successfully'
          });
        } catch (improveError) {
          console.error('Error improving SSP idea:', improveError);
          return NextResponse.json(
            { success: false, error: 'Failed to improve SSP idea' },
            { status: 500 }
          );
        }
      }

    }

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'No product ID provided' },
        { status: 400 }
      );
    }

    if (generateSSP) {
      console.log('SSP route branch: generateSSP');
      let insightsForSsp = hasInsightContent(reviewInsights) ? reviewInsights : null;
      let storedReviews: Review[] = [];

      if (!insightsForSsp) {
        const { data: offerProduct, error: fetchError } = await serverSupabase
          .from('offer_products')
          .select('insights,reviews')
          .eq('product_id', productId)
          .single();

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('Error fetching insights for SSP generation:', fetchError);
        }

        if (!insightsForSsp) {
          insightsForSsp = offerProduct?.insights || null;
        }

        if (Array.isArray(offerProduct?.reviews)) {
          storedReviews = offerProduct.reviews as Review[];
        }
      }

      if (!hasInsightContent(insightsForSsp)) {
        return NextResponse.json(
          { success: false, error: 'No review insights available. Run Review Aggregator first.' },
          { status: 400 }
        );
      }

      const shouldUseDeepContext = isInsightsThin(insightsForSsp);
      if (shouldUseDeepContext && storedReviews.length === 0) {
        const { data: offerProduct } = await serverSupabase
          .from('offer_products')
          .select('reviews')
          .eq('product_id', productId)
          .single();

        if (Array.isArray(offerProduct?.reviews)) {
          storedReviews = offerProduct.reviews as Review[];
        }
      }
      const reviewSamples = shouldUseDeepContext ? sampleReviewsForSSP(storedReviews, 16) : [];

      try {
        const reviewContext = {
          praise_points: insightsForSsp.topLikes ? insightsForSsp.topLikes.split('\n').map((line: string) => ({
            summary: line.replace(/^\d+\.\s*/, '').trim(),
            quote: '',
            source_star_rating: 5
          })).filter((p: any) => p.summary) : [],
          pain_points: insightsForSsp.topDislikes ? insightsForSsp.topDislikes.split('\n').map((line: string, index: number) => ({
            complaint: line.replace(/^\d+\.\s*/, '').trim(),
            quote: '',
            severity_score: 3,
            priority_rank: index + 1
          })).filter((p: any) => p.complaint) : [],
          additional_insights: insightsForSsp.importantInsights ? insightsForSsp.importantInsights.split('\n').map((line: string) => ({
            pattern: line.trim(),
            leverage_strategy: ''
          })).filter((i: any) => i.pattern) : [],
          unasked_questions: insightsForSsp.importantQuestions ? insightsForSsp.importantQuestions.split('\n').map((line: string) => ({
            question: line.trim(),
            reasoning: ''
          })).filter((q: any) => q.question) : []
        };

        console.log(`🚀 Generating SSP with AI using review insights${shouldUseDeepContext && reviewSamples.length ? ' + deep context' : ''}...`);
        const sspResult = await generateSSPRecommendationsFromInsights({
          insights: insightsForSsp,
          reviewAnalysisContext: reviewContext,
          reviewSamples
        });

        return NextResponse.json({
          success: true,
          data: { ssp: mapSspResponseToCategories(sspResult as SspResponse) },
          message: 'SSP ideas generated with AI based on review insights'
        });
      } catch (sspError) {
        console.error('Error generating SSP with AI:', sspError);
        return NextResponse.json({
          success: false,
          error: 'Error generating SSP with AI',
          message: 'SSP ideas generated with AI based on review insights'
        }, { status: 500 });
      }
    }

    console.log('SSP route branch: analyze');

    const hasRawBlocks = rawReviewBlocks.length > 0;
    if ((!reviews || reviews.length === 0) && !hasRawBlocks) {
      return NextResponse.json(
        { success: false, error: 'No reviews found in the uploaded file. Please ensure your file contains review text or CSV columns for title, body, and rating.' },
        { status: 400 }
      );
    }

    const normalizeRating = (rating: number | string) => {
      const numeric = Number(rating);
      return Number.isFinite(numeric) ? numeric : null;
    };

    let reviewCounts: { total: number; positive?: number; neutral?: number; negative?: number } = { total: 0 };

    if (!hasRawBlocks) {
      reviewCounts = reviews.reduce(
        (acc, review) => {
          const rating = normalizeRating(review.rating);
          if (rating === null) return acc;
          if (rating >= 4) {
            acc.positive += 1;
          } else if (rating === 3) {
            acc.neutral += 1;
          } else if (rating > 0) {
            acc.negative += 1;
          }
          return acc;
        },
        { total: reviews.length, positive: 0, neutral: 0, negative: 0 }
      );
    }

  try {
    const analysis = hasRawBlocks
      ? await generateReviewAnalysisFromBlocks(rawReviewBlocks)
      : await generateReviewAnalysisJSON(reviews);
    // const analysis = {
    //   "praise_points": [
    //     {
    //       "summary": "Easy to assemble and elegant appearance.",
    //       "quote": "Easy to assemble\nLooks elegant\nValue for money\nFunctionable",
    //       "source_star_rating": 5
    //     },
    //     {
    //       "summary": "Decent quality and functional.",
    //       "quote": "Decent quality and very functional",
    //       "source_star_rating": 5
    //     },
    //     {
    //       "summary": "Perfect for themed events, enhances ambiance.",
    //       "quote": "Amazing. Beautiful and does not look cheap. I used for a house movie night for my client.",
    //       "source_star_rating": 5
    //     },
    //     {
    //       "summary": "Good value for the price.",
    //       "quote": "Pretty good for the price\nLooks decent pretty sturdy.",
    //       "source_star_rating": 5
    //     }
    //   ],
    //   "pain_points": [
    //     {
    //       "complaint": "Product easily breaks and is not sturdy.",
    //       "quote": "They were perfect for our event, but one of them tumbled down and the piece that clipped the rope cracked.",
    //       "severity_score": 3,
    //       "priority_rank": 1
    //     },
    //     {
    //       "complaint": "Cheap materials and poor durability.",
    //       "quote": "Cheap plastic post with rubber bases. The ropes were terrible... Order for a event last minute and couldn't even use them...",
    //       "severity_score": 3,
    //       "priority_rank": 2
    //     },
    //     {
    //       "complaint": "Items not as described and missing parts.",
    //       "quote": "Came with one supposed to be 2 in the boxes",
    //       "severity_score": 2,
    //       "priority_rank": 3
    //     },
    //     {
    //       "complaint": "Product looks cheap and is not sturdy.",
    //       "quote": "Not sturdy enough. You get what you pay for.",
    //       "severity_score": 2,
    //       "priority_rank": 4
    //     },
    //     {
    //       "complaint": "Stanchions are plastic and appear cheap.",
    //       "quote": "FYI THE STANCHIONS ARE PLASTIC and slip apart easily. They are not round but square. Look cheap are cheap.",
    //       "severity_score": 3,
    //       "priority_rank": 5
    //     },
    //     {
    //       "complaint": "Cheap looking and feeling rope.",
    //       "quote": "Pretty cheap feeling and the rope came with big indents in it.",
    //       "severity_score": 2,
    //       "priority_rank": 6
    //     },
    //     {
    //       "complaint": "Product breaks easily and is not worth the price.",
    //       "quote": "Not worth $79 look cheaply made. Got these for a birthday party wish I hadn’t, waste of money.",
    //       "severity_score": 3,
    //       "priority_rank": 7
    //     },
    //     {
    //       "complaint": "Product is of poor construction and unsuitable for use.",
    //       "quote": "Cheap plastic, horrible bases, and extremely short.",
    //       "severity_score": 3,
    //       "priority_rank": 8
    //     },
    //     {
    //       "complaint": "Items received were used and not as described.",
    //       "quote": "So I ordered this and got used base weights that were all sticky and faded the so called velvet ropes are more like cheap micro fiber.",
    //       "severity_score": 3,
    //       "priority_rank": 9
    //     }
    //   ],
    //   "additional_insights": [
    //     {
    //       "pattern": "Product is often described as cheap and not sturdy.",
    //       "leverage_strategy": "Improve the material quality and construction to enhance durability and perception of value."
    //     },
    //     {
    //       "pattern": "Good value for casual or one-time events.",
    //       "leverage_strategy": "Market the product as a cost-effective solution for short-term or non-formal events."
    //     }
    //   ],
    //   "unasked_questions": [
    //     {
    //       "question": "Are there plans to improve the sturdiness of the product?",
    //       "reasoning": "Several reviews mention the lack of sturdiness as a significant flaw, affecting user satisfaction and usability."
    //     },
    //     {
    //       "question": "Is there a quality check process before shipping?",
    //       "reasoning": "Instances of missing or used parts indicate potential issues with quality control that could be addressed for better customer satisfaction."
    //     }
    //   ]
    // }
    // Mostramos el resultado
    console.log("📊 ANÁLISIS GENERADO (JSON):");
    // console.log(JSON.stringify(analysis, null, 2));

    const formatPercent = (value: any) => {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return null;
      return Math.round(numeric);
    };

    const percentClause = (percent: number | null) => {
      if (percent === null) return '';
      if (percent >= 80) {
        return `, showing up in most reviews (around ${percent}%)`;
      }
      if (percent >= 20) {
        const inTen = Math.max(1, Math.min(9, Math.round(percent / 10)));
        return `, with roughly ${inTen} in 10 reviewers mentioning it`;
      }
      return `, appearing in a smaller but meaningful share of reviews (around ${percent}%)`;
    };

    const splitSentences = (text: string) => {
      const matches = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
      return matches ? matches.map(sentence => sentence.trim()).filter(Boolean) : [];
    };

    const ensureSentence = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return '';
      return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
    };

    const frequencyLabel = (percent: number | null) => {
      if (percent === null) return '';
      if (percent >= 25) return 'Main complaint';
      if (percent >= 10) return 'Frequent complaint';
      if (percent >= 3) return 'Occasionally mentioned';
      return 'Rare mention';
    };

    const buildClusterLead = (theme: string, index: number, type: 'strength' | 'pain') => {
      if (type === 'strength') {
        if (index === 0) return `${theme} stands out as the most consistent strength`;
        if (index === 1) return `${theme} is another frequently praised strength`;
        if (index === 2) return `${theme} shows up as a recurring positive theme`;
        if (index === 3) return `${theme} appears as a secondary strength`;
        return `${theme} is a less common but still positive signal`;
      }

      if (index === 0) return `${theme} emerges as the most common pain point`;
      if (index === 1) return `${theme} is a frequent frustration`;
      if (index === 2) return `${theme} surfaces regularly in critical feedback`;
      if (index === 3) return `${theme} is an occasional but notable issue`;
      return `${theme} shows up in a smaller slice of complaints`;
    };

    const buildClusterLine = (
      cluster: any,
      index: number,
      type: 'strength' | 'pain'
    ) => {
      const percent = formatPercent(cluster?.mention_percentage);
      const theme = cluster?.theme ? cluster.theme.toString().trim() : 'This theme';
      const insightText = cluster?.insight ? cluster.insight.toString().trim() : '';
      const sentences = splitSentences(insightText);
      const baseSentence = sentences[0]?.replace(/[.!?]+$/, '');
      const lead = buildClusterLead(theme, index, type);
      const clause = percentClause(percent);
      let line = baseSentence ? `${lead}${clause}, ${baseSentence}.` : `${lead}${clause}.`;

      if (sentences.length > 1) {
        line = `${line} ${sentences[1]}`;
      }

      if (type === 'pain') {
        const fixabilityNote = cluster?.fixability?.note ? cluster.fixability.note.toString().trim() : '';
        const fixabilitySentence = ensureSentence(fixabilityNote);
        if (fixabilitySentence) {
          line = `${line} ${fixabilitySentence}`;
        }
        const label = frequencyLabel(percent);
        if (label) {
          line = `${line.replace(/[.!?]$/, '')} (${label}).`;
        }
      }

      return line;
    };

    const buildCrossCuttingLine = (insight: any) => {
      const percent = formatPercent(insight?.supporting_percentage);
      const insightText = insight?.insight ? insight.insight.toString().trim() : '';
      const sentences = splitSentences(insightText);
      const baseSentence = sentences[0]?.replace(/[.!?]+$/, '');
      let line = baseSentence ? `${baseSentence}.` : '';

      if (sentences.length > 1) {
        line = `${line} ${sentences[1]}`;
      }

      if (percent !== null) {
        if (line) {
          line = `${line.replace(/[.!?]$/, '')} (around ${percent}% of reviews).`;
        } else {
          line = `This pattern appears in around ${percent}% of reviews.`;
        }
      }

      return line;
    };

    const summaryStats = analysis?.summary_stats;
    const parseCount = (value: any) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : 0;
    };

    if (hasRawBlocks) {
      const positive = parseCount(summaryStats?.positive_review_count);
      const neutral = parseCount(summaryStats?.neutral_review_count);
      const negative = parseCount(summaryStats?.negative_review_count);
      const sum = positive + neutral + negative;
      const total = rawReviewBlocks.length;

      reviewCounts = {
        total,
        ...(sum === total ? { positive, neutral, negative } : {})
      };
    }
    const percentFromCount = (count: number, total: number) => {
      if (!total) return null;
      return Math.round((count / total) * 100);
    };
    const summaryLine = summaryStats ? (() => {
      const total = reviewCounts.total || Number(summaryStats.total_reviews) || 0;
      const positiveCount = typeof reviewCounts.positive === 'number' ? reviewCounts.positive : null;
      const neutralCount = typeof reviewCounts.neutral === 'number' ? reviewCounts.neutral : null;
      const negativeCount = typeof reviewCounts.negative === 'number' ? reviewCounts.negative : null;
      const positive = formatPercent(summaryStats.positive_percentage ?? (positiveCount !== null ? percentFromCount(positiveCount, total) : null));
      const neutral = formatPercent(summaryStats.neutral_percentage ?? (neutralCount !== null ? percentFromCount(neutralCount, total) : null));
      const negative = formatPercent(summaryStats.negative_percentage ?? (negativeCount !== null ? percentFromCount(negativeCount, total) : null));
      const parts = [
        positive !== null ? `${positive}% positive` : null,
        neutral !== null ? `${neutral}% neutral` : null,
        negative !== null ? `${negative}% negative` : null
      ].filter(Boolean);

      if (parts.length === 0) return '';

      return `Overall sentiment skews ${positive !== null && positive >= 60 ? 'positive' : 'mixed'}, with ${parts.join(', ')} across the review set.`;
    })() : '';

    const praiseClusters = Array.isArray(analysis?.praise_clusters) ? analysis.praise_clusters : [];
    const painClusters = Array.isArray(analysis?.pain_clusters) ? analysis.pain_clusters : [];
    const importantInsightsBlock = analysis?.important_insights || null;
    const sellerQuestions = Array.isArray(analysis?.seller_questions) ? analysis.seller_questions : [];

    const topLikes = praiseClusters.map((cluster: any, index: number) => (
      `${index + 1}. ${buildClusterLine(cluster, index, 'strength')}`
    )).join('\n');

    const topDislikes = painClusters.map((cluster: any, index: number) => (
      `${index + 1}. ${buildClusterLine(cluster, index, 'pain')}`
    )).join('\n');

    const sentimentSummary = importantInsightsBlock?.sentiment_summary
      ? importantInsightsBlock.sentiment_summary.toString().trim()
      : summaryLine;
    const opportunityFraming = importantInsightsBlock?.opportunity_framing
      ? importantInsightsBlock.opportunity_framing.toString().trim()
      : '';
    const additionalInsights = Array.isArray(importantInsightsBlock?.additional_insights)
      ? importantInsightsBlock.additional_insights
      : [];
    const fallbackCrossCutting = Array.isArray(analysis?.cross_cutting_insights)
      ? analysis.cross_cutting_insights.map((insight: any) => buildCrossCuttingLine(insight))
      : [];

    const importantInsights = [
      sentimentSummary,
      opportunityFraming,
      ...additionalInsights.map((insight: any) => insight?.toString().trim()).filter(Boolean),
      ...fallbackCrossCutting
    ].filter(Boolean).join('\n');

    const importantQuestions = sellerQuestions.map((question: any, index: number) => {
      const rawQuestion = question?.question ? question.question.toString().trim() : 'What product decision would most improve outcomes?';
      const questionText = rawQuestion.endsWith('?') ? rawQuestion : `${rawQuestion}?`;
      const whyText = question?.why_it_matters ? question.why_it_matters.toString().trim() : '';
      const whySentence = whyText ? ensureSentence(whyText).replace(/[.!?]+$/, '') : '';
      const whyDisplay = whySentence ? `Why it matters: ${whySentence}` : '';
      return `${index + 1}. ${questionText}${whyDisplay ? ` || ${whyDisplay}` : ''}`;
    }).join('\n');

    const totalReviewCount = hasRawBlocks ? rawReviewBlocks.length : reviewCounts.total;

    dataResponse = {
      reviewInsights: {
        topLikes,
        topDislikes,
        importantInsights,
        importantQuestions,
        strengthsTakeaway: analysis?.strengths_takeaway || '',
        painPointsTakeaway: analysis?.pain_points_takeaway || '',
        insightsTakeaway: analysis?.insights_takeaway || '',
        questionsTakeaway: analysis?.questions_takeaway || '',
        totalReviewCount,
        positiveReviewCount: reviewCounts.positive,
        neutralReviewCount: reviewCounts.neutral,
        negativeReviewCount: reviewCounts.negative
      }
    };


  } catch (e) {
    console.log("Error ejecutando el script.");
  }

    const storedReviewCount = Math.min(REVIEW_BLOCK_CAP, reviews.length);
    if (dataResponse?.reviewInsights) {
      dataResponse.reviewInsights.totalReviewCount = storedReviewCount;
    }

    let totalStoredCount = storedReviewCount;
    let persistedReviews = reviews;
    if (productId) {
      try {
        const updatePayload: Record<string, any> = {
          product_id: productId,
          reviews,
          user_id: user.id,
          updated_at: new Date().toISOString()
        };
        if (dataResponse?.reviewInsights) {
          updatePayload.insights = dataResponse.reviewInsights;
        }

        const { data: upserted, error: upsertError } = await serverSupabase
          .from('offer_products')
          .upsert(updatePayload, { onConflict: 'product_id' })
          .select('reviews')
          .single();

        if (upsertError) {
          console.error('Error storing reviews/insights:', upsertError);
        } else if (Array.isArray(upserted?.reviews)) {
          totalStoredCount = upserted.reviews.length;
          persistedReviews = upserted.reviews as Review[];
        }
      } catch (persistError) {
        console.error('Error persisting reviews:', persistError);
      }
    }

    if (dataResponse?.reviewInsights) {
      dataResponse.reviewInsights.totalReviewCount = totalStoredCount;
    }

    const responseData = {
      ...(dataResponse || {}),
      reviews: persistedReviews,
      reviewsStored: totalStoredCount,
      totalStoredCount,
      capReached
    };

    return NextResponse.json({
      success: true,
      data: responseData,
      reviewsCount: reviews.length,
      message: file ? `Review analysis completed - ${reviews.length} reviews parsed (mock data)` : 'Review insights generated (mock data)'
    });

  } catch (error) {
    console.error('Error analyzing reviews:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to analyze reviews'
      },
      { status: 500 }
    );
  }
}

