import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabaseServer';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import {
  refineSSPItem,
  answerSSPSideQuestion,
  promoteAnswerToSSPItem
} from '@/services/analyzeOpenAI';

type RefineMode = 'refine' | 'side_question' | 'promote_answer';

type RefineRequest = {
  productId?: string | null;
  category?: string;
  mode?: RefineMode;
  instruction?: string;
  item?: any;
  answer?: string;
  noteId?: string;
  noteText?: string;
  notePromoted?: boolean;
  promotedSspId?: string;
  existingSspText?: string[];
  sspItemId?: string;
  noteMode?: 'sideQuestion' | 'refine';
  noteQuestion?: string;
  aiNotes?: any[];
  lastNoteAnswer?: string;
};

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    const serverSupabase = token
      ? createSupabaseClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            global: {
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          }
        )
      : createClient();

    const { data: { user }, error: authError } = await serverSupabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized. Please log in.' },
        { status: 401 }
      );
    }

    const body = (await request.json()) as RefineRequest;
    const productId = body?.productId || null;
    const category = body?.category || 'general';
    const mode = body?.mode || 'refine';

    if (!productId) {
      return NextResponse.json(
        { success: false, error: 'No product ID provided' },
        { status: 400 }
      );
    }

    if (!body?.item) {
      return NextResponse.json(
        { success: false, error: 'Missing SSP item' },
        { status: 400 }
      );
    }

    const { data: offerProduct, error: fetchError } = await serverSupabase
      .from('offer_products')
      .select('insights')
      .eq('product_id', productId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      console.error('Error fetching insights for SSP refinement:', fetchError);
    }

    const storedInsights = offerProduct?.insights || {};

    if (mode === 'side_question') {
      const question = (body.instruction || '').trim();
      if (!question) {
        return NextResponse.json(
          { success: false, error: 'Missing question' },
          { status: 400 }
        );
      }

      const answer = await answerSSPSideQuestion({
        item: body.item,
        question,
        category,
        insights: storedInsights,
        aiNotes: Array.isArray(body.aiNotes) ? body.aiNotes : [],
        lastNoteAnswer: body.lastNoteAnswer || undefined
      });

      return NextResponse.json({
        success: true,
        data: { answer }
      });
    }

    if (mode === 'promote_answer') {
      if (body.notePromoted || body.promotedSspId) {
        return NextResponse.json(
          { success: false, error: 'Note already promoted.' },
          { status: 409 }
        );
      }

      const noteText = (body.noteText || '').trim();
      if (!noteText || !body.noteId) {
        return NextResponse.json(
          { success: false, error: 'Missing note data to promote' },
          { status: 400 }
        );
      }

      const newItem = await promoteAnswerToSSPItem({
        item: body.item,
        note: {
          id: body.noteId,
          mode: body.noteMode || 'sideQuestion',
          answer: noteText,
          question: body.noteQuestion || undefined
        },
        category,
        insights: storedInsights,
        existingSspText: Array.isArray(body.existingSspText) ? body.existingSspText : [],
        instruction: body.instruction || undefined
      });

      return NextResponse.json({
        success: true,
        data: {
          item: newItem
        }
      });
    }

    const instruction = (body.instruction || '').trim();
    if (!instruction) {
      return NextResponse.json(
        { success: false, error: 'Missing refinement instruction' },
        { status: 400 }
      );
    }

    const refinedItem = await refineSSPItem({
      item: body.item,
      instruction,
      category,
      insights: storedInsights
    });

    return NextResponse.json({
      success: true,
      data: { item: refinedItem }
    });
  } catch (error) {
    console.error('Error refining SSP:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to refine SSP'
      },
      { status: 500 }
    );
  }
}
