import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import Papa from 'papaparse';
import generateReviewAnalysisJSON, { generateSSPRecommendations } from '@/services/analyzeOpenAI';

// Interface for parsed review from CSV
interface Review {
  title: string;
  comment: string;
  stars: number | string;
}

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
    let dataResponse: any = null;

    if (contentType.includes('multipart/form-data')) {
      // Handle file upload
      const formData = await request.formData();
      file = formData.get('file') as File;
      productId = formData.get('productId') as string;

      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No file provided' },
          { status: 400 }
        );
      }

      // Parse CSV file and extract reviews using PapaParse
      const fileText = await file.text();
      console.log('Received CSV file:', file.name, 'Size:', file.size, 'bytes');

      const parseResult = Papa.parse<Review>(fileText, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim().toLowerCase(),
      });

      // Map parsed data to Review objects with expected headers: title, comment, stars
      reviews = parseResult.data.map((row: any) => ({
        title: row.title || '',
        comment: row.comment || '',
        stars: row.stars ? (isNaN(Number(row.stars)) ? row.stars : Number(row.stars)) : 0,
      }));

      console.log(`Parsed ${reviews.length} reviews from CSV`);
    } else {
      // Handle JSON request (for AI generation)
      const body = await request.json();
      productId = body.productId;
      generateOnly = body.generateOnly || false;
      generateSSP = body.generateSSP || false;
      reviewInsights = body.reviewInsights || null;
    }

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'No product ID provided' },
        { status: 400 }
      );
    }

  try {
    const analysis = await generateReviewAnalysisJSON(reviews);
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

    dataResponse = {
      reviewInsights: {
        topLikes: analysis.praise_points.map((point, index: any) => `${index + 1}. ${point.summary}`).join('\n'),
        topDislikes: analysis.pain_points.slice(0, 5).map((point: any, index: number) => `${index + 1}. ${point.complaint}`).join('\n'),
        importantInsights: analysis.additional_insights.map((insight: any) => insight.pattern).join('\n'),
        importantQuestions: analysis.unasked_questions.map((question: any) => question.question).join('\n')
      }
    };


  } catch (e) {
    console.log("Error ejecutando el script.");
  }

    // Return data based on request type
    if (generateSSP) {
      // Generate SSP using AI with review insights context
      try {
        // Build context from review insights
        const reviewContext = reviewInsights ? {
          praise_points: reviewInsights.topLikes ? reviewInsights.topLikes.split('\n').map((line: string) => ({
            summary: line.replace(/^\d+\.\s*/, '').trim(),
            quote: '',
            source_star_rating: 5
          })).filter((p: any) => p.summary) : [],
          pain_points: reviewInsights.topDislikes ? reviewInsights.topDislikes.split('\n').map((line: string, index: number) => ({
            complaint: line.replace(/^\d+\.\s*/, '').trim(),
            quote: '',
            severity_score: 3,
            priority_rank: index + 1
          })).filter((p: any) => p.complaint) : [],
          additional_insights: reviewInsights.importantInsights ? reviewInsights.importantInsights.split('\n').map((line: string) => ({
            pattern: line.trim(),
            leverage_strategy: ''
          })).filter((i: any) => i.pattern) : [],
          unasked_questions: reviewInsights.importantQuestions ? reviewInsights.importantQuestions.split('\n').map((line: string) => ({
            question: line.trim(),
            reasoning: ''
          })).filter((q: any) => q.question) : []
        } : null;

        if (reviewContext && (reviewContext.praise_points.length > 0 || reviewContext.pain_points.length > 0)) {
          // Use AI to generate SSP recommendations based on review context
          console.log('🚀 Generating SSP with AI using review insights...');
          const sspResult = await generateSSPRecommendations(reviewContext);
          
          // Format the SSP result to match expected structure
          const formattedSSP = {
            quantity: sspResult.quantity_improvements?.map((item: any) => 
              `- ${item.recommendation}${item.justification ? ` (${item.justification})` : ''}`
            ).join('\n') || '',
            functionality: sspResult.functional_enhancements?.map((item: any) => 
              `- ${item.recommendation}${item.pain_point_addressed ? ` (Addresses: ${item.pain_point_addressed})` : ''}`
            ).join('\n') || '',
            quality: sspResult.quality_upgrades?.map((item: any) => 
              `- ${item.recommendation}${item.complaint_addressed ? ` (Addresses: ${item.complaint_addressed})` : ''}`
            ).join('\n') || '',
            aesthetic: sspResult.aesthetic_innovations?.map((item: any) => 
              `- ${item.recommendation}${item.market_trend_or_preference ? ` (Trend: ${item.market_trend_or_preference})` : ''}`
            ).join('\n') || '',
            bundle: sspResult.strategic_bundling?.map((item: any) => 
              `- ${item.bundle_item}${item.justification ? ` (${item.justification})` : ''}`
            ).join('\n') || ''
          };
          console.log('SSP result:', formattedSSP);

          return NextResponse.json({
            success: true,
            data: { ssp: formattedSSP },
            message: 'SSP ideas generated with AI based on review insights'
          });
        }
      } catch (sspError) {
        console.error('Error generating SSP with AI:', sspError);
        // Fall through to mock data if AI fails
        return NextResponse.json({
          success: false,
          error: 'Error generating SSP with AI',
          message: 'SSP ideas generated with AI based on review insights'
        }, { status: 500 });
      }
    } else {

      return NextResponse.json({
        success: true,
        data: dataResponse,
        reviewsCount: reviews.length,
        message: file ? `Review analysis completed - ${reviews.length} reviews parsed (mock data)` : 'Review insights generated (mock data)'
      });
    }

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

