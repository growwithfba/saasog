'use client';

import { useState, useEffect, useRef } from 'react';
import { Sparkles, Loader2, CheckCircle, AlertCircle, Package, Zap, Award, Palette, Gift, Brain, FileSearch, Lightbulb, PenTool, Trash2, Wand2, Plus, ChevronDown, ChevronUp, MessageSquare, Lock, Unlock, Check } from 'lucide-react';
import { supabase } from '@/utils/supabaseClient';
import { Checkbox } from '@/components/ui/Checkbox';
import type { SspCategories, SSPItem, FixType, SspAiNote, SspDetails } from '../types';

interface ReviewInsights {
  topLikes: string;
  topDislikes: string;
  importantInsights: string;
  importantQuestions: string;
  strengthsTakeaway?: string;
  painPointsTakeaway?: string;
  insightsTakeaway?: string;
  questionsTakeaway?: string;
  totalReviewCount?: number;
  positiveReviewCount?: number;
  neutralReviewCount?: number;
  negativeReviewCount?: number;
}

interface SspBuilderHubTabProps {
  productId: string | null;
  data?: {
    quantity: SSPItem[] | string;
    functionality: SSPItem[] | string;
    quality: SSPItem[] | string;
    aesthetic: SSPItem[] | string;
    bundle: SSPItem[] | string;
  };
  asin: string;
  reviewInsights?: ReviewInsights;
  onChange: (data: SspCategories) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  hasStoredInsights?: boolean;
  hasStoredImprovements?: boolean;
  onImprovementsSaved?: () => void;
}

const progressSteps = [
  { icon: FileSearch, label: 'Analyzing review insights...', duration: 2000 },
  { icon: Brain, label: 'Processing customer feedback...', duration: 3000 },
  { icon: Lightbulb, label: 'Generating SSP ideas...', duration: 4000 },
  { icon: PenTool, label: 'Crafting compelling selling points...', duration: 3000 },
];

export function SspBuilderHubTab({ productId, data, reviewInsights, onChange, onDirtyChange, hasStoredInsights = false, hasStoredImprovements = false, onImprovementsSaved }: SspBuilderHubTabProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [inlineStatus, setInlineStatus] = useState<{ category: keyof SspCategories; index: number; message: string } | null>(null);
  const [notesOpenById, setNotesOpenById] = useState<Record<string, boolean>>({});
  const [selectedForDelete, setSelectedForDelete] = useState<{ category: keyof SspCategories; index: number } | null>(null);
  const [deleteConfirmPending, setDeleteConfirmPending] = useState<{ category: keyof SspCategories; index: number } | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [activeModeById, setActiveModeById] = useState<Record<string, 'edit' | 'refine' | 'ask'>>({});
  const [editDraftById, setEditDraftById] = useState<Record<string, { title: string; body: string }>>({});
  const [refinePromptById, setRefinePromptById] = useState<Record<string, string>>({});
  const [askPromptById, setAskPromptById] = useState<Record<string, string>>({});
  const [refineLoadingById, setRefineLoadingById] = useState<Record<string, boolean>>({});
  const [askLoadingById, setAskLoadingById] = useState<Record<string, boolean>>({});
  const [refineDraftById, setRefineDraftById] = useState<Record<string, { title: string; body: string; details?: SspDetails }>>({});
  const [askAnswerById, setAskAnswerById] = useState<Record<string, { question: string; answer: string; supplierSpecs?: string[]; risks?: string[] }>>({});
  const [newItemIds, setNewItemIds] = useState<Record<string, boolean>>({});
  const generatedItemIds = useRef<Record<string, string>>({});
  const generatedNoteIds = useRef<Record<string, string>>({});
  // Progress step animation
  useEffect(() => {
    if (!loading) {
      setCurrentStep(0);
      setElapsedTime(0);
      return;
    }

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => (prev < progressSteps.length - 1 ? prev + 1 : prev));
    }, 3000);

    const timeInterval = setInterval(() => {
      setElapsedTime((prev) => prev + 1);
    }, 1000);

    return () => {
      clearInterval(stepInterval);
      clearInterval(timeInterval);
    };
  }, [loading]);

  useEffect(() => {
    if (!inlineStatus) return;
    const timer = window.setTimeout(() => setInlineStatus(null), 2000);
    return () => window.clearTimeout(timer);
  }, [inlineStatus]);

  const createEmptySsp = (): SspCategories => ({
    quantity: [],
    functionality: [],
    quality: [],
    aesthetic: [],
    bundle: []
  });

  const normalizeLegacyLines = (value: unknown, category: keyof SspCategories): SSPItem[] => {
    if (typeof value !== 'string') return [];
    const lines = value.split('\n').map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) return [];
    const defaultFixType: FixType = category === 'quantity'
      ? 'PACKAGING_INSTRUCTIONS'
      : category === 'quality'
        ? 'MATERIAL_UPGRADE'
        : category === 'bundle'
          ? 'PACKAGING_INSTRUCTIONS'
          : 'MINOR_FUNCTIONAL';
    return lines.map(line => ({
      recommendation: line.replace(/^-+\s*/, ''),
      why_it_matters: '',
      grounded_in: { insight_bucket: 'Legacy SSP', insight_signal: 'Migrated from text' },
      fix_type: defaultFixType,
      impact: 'LOW',
      effort: 'LOW',
      confidence: 'LOW',
      ...(category === 'bundle' ? { fba_safe: false, fba_notes: 'Manual entry - confirm FBA-safe' } : {})
    }));
  };

  const bundleClassifierPhrases = [
    'fits better as a bundle',
    'fits better as bundle',
    'better as a bundle',
    'better as bundle',
    'this is a bundle',
    'this is bundle',
    'this is not quantity'
  ];

  const accessoryKeywords = [
    'replacement',
    'replacement parts',
    'accessory',
    'accessories',
    'add-on',
    'add on',
    'addon',
    'spare',
    'attachment',
    'attachments',
    'extra',
    'brush',
    'pouch',
    'sisal',
    'mat',
    'mats'
  ];

  const isEmptySspItem = (item: SSPItem) => {
    const hasTitle = item.recommendation?.toString().trim();
    const hasBody = item.why_it_matters?.toString().trim();
    return !hasTitle && !hasBody;
  };

  const stripEmptySspItems = (categories: SspCategories) => {
    const cleaned: SspCategories = { ...categories };
    (Object.keys(cleaned) as Array<keyof SspCategories>).forEach((key) => {
      cleaned[key] = (cleaned[key] || []).filter(item => !isEmptySspItem(item));
    });
    return cleaned;
  };

  const reframeQuantityItem = (item: SSPItem): SSPItem => ({
    ...item,
    recommendation: 'Offer a multipack or case pack of the exact same product (e.g., 2-pack, 3-pack).',
    why_it_matters: 'Gives customers better value per unit and supports stock-up behavior without changing the core product.',
    details: undefined
  });

  const stripBundleCallout = (value?: string) => {
    if (!value) return value;
    const sentencePattern = /[^.!?\n]*\b(fits better as (a )?bundle|better as (a )?bundle|this is (a )?bundle|this is not quantity)\b[^.!?\n]*[.!?]*/gi;
    const cleanedLines = value
      .split('\n')
      .map(line => line.replace(sentencePattern, '').trim())
      .filter(Boolean);
    return cleanedLines.join('\n').trim();
  };

  const stripBundleCalloutFromDetails = (details?: SSPItem['details']) => {
    if (!details) return details;
    if (typeof details === 'string') return stripBundleCallout(details);
    const sanitizeList = (items?: string[]) =>
      items?.map(entry => stripBundleCallout(entry) || '').filter(Boolean);
    const sanitizedCostImpact = stripBundleCallout(details.costImpact || '');
    return {
      ...details,
      supplierSpecs: sanitizeList(details.supplierSpecs),
      risks: sanitizeList(details.risks),
      fbaNotes: sanitizeList(details.fbaNotes),
      qaChecklist: sanitizeList(details.qaChecklist),
      costImpact: sanitizedCostImpact || undefined
    };
  };

  const shouldRouteToBundle = (text: string) => {
    const normalized = text.toLowerCase();
    const hasPhrase = bundleClassifierPhrases.some(phrase => normalized.includes(phrase));
    const hasAccessoryKeyword = accessoryKeywords.some(keyword => normalized.includes(keyword));
    return hasPhrase || hasAccessoryKeyword;
  };

  const normalizeAndRouteSspItem = (item: SSPItem, category: keyof SspCategories) => {
    const combined = [
      item.recommendation,
      item.why_it_matters,
      ...(typeof item.details === 'string' ? [item.details] : []),
      ...(item.details && typeof item.details !== 'string' ? [
        ...(item.details.supplierSpecs || []),
        ...(item.details.risks || []),
        ...(item.details.fbaNotes || []),
        ...(item.details.qaChecklist || []),
        item.details.costImpact || ''
      ] : [])
    ].filter(Boolean).join(' ');
    const isBundleLike = shouldRouteToBundle(combined);
    if (category === 'quantity' && isBundleLike) {
      return {
        item: reframeQuantityItem({
          ...item,
          recommendation: stripBundleCallout(item.recommendation) || '',
          why_it_matters: stripBundleCallout(item.why_it_matters || '') || ''
        }),
        category
      };
    }
    const targetCategory = isBundleLike ? 'bundle' : category;
    return {
      item: {
        ...item,
        recommendation: stripBundleCallout(item.recommendation) || '',
        why_it_matters: stripBundleCallout(item.why_it_matters || '') || '',
        details: stripBundleCalloutFromDetails(item.details)
      },
      category: targetCategory
    };
  };

  const normalizeSspData = (value?: SspBuilderHubTabProps['data']): SspCategories => {
    if (!value) return createEmptySsp();
    const coerceList = (key: keyof SspCategories) => {
      const raw = value[key];
      if (Array.isArray(raw)) return raw;
      return normalizeLegacyLines(raw, key);
    };
    const normalized = createEmptySsp();
    (Object.keys(normalized) as Array<keyof SspCategories>).forEach((key) => {
      const items = coerceList(key);
      items.forEach((item) => {
        const { item: routedItem, category } = normalizeAndRouteSspItem(item, key);
        normalized[category].push(routedItem);
      });
    });
    return normalized;
  };

  const ssp = normalizeSspData(data);

  const updateCategoryImprovements = (category: keyof SspCategories, items: SSPItem[]) => {
    onChange({
      ...ssp,
      [category]: items
    });
  };

  const handleSelectForDelete = (category: keyof SspCategories, index: number, checked: boolean) => {
    if (checked) {
      setSelectedForDelete({ category, index });
    } else if (selectedForDelete && selectedForDelete.category === category && selectedForDelete.index === index) {
      setSelectedForDelete(null);
    }
  };

  const handleAddBlankSsp = (category: keyof SspCategories) => {
    const defaultFixType: FixType = category === 'quantity'
      ? 'PACKAGING_INSTRUCTIONS'
      : category === 'quality'
        ? 'MATERIAL_UPGRADE'
        : category === 'bundle'
          ? 'PACKAGING_INSTRUCTIONS'
          : 'MINOR_FUNCTIONAL';

    const newItem: SSPItem = {
      recommendation: '',
      why_it_matters: '',
      grounded_in: { insight_bucket: 'Manual entry', insight_signal: 'User added' },
      fix_type: defaultFixType,
      impact: 'LOW',
      effort: 'LOW',
      confidence: 'LOW',
      source: 'manual',
      ...(category === 'bundle' ? { fba_safe: false, fba_notes: 'Manual entry - confirm FBA-safe' } : {})
    };

    const currentImprovements = Array.isArray(ssp[category]) ? ssp[category] : [];
    const nextIndex = currentImprovements.length;
    const updatedImprovements = [...currentImprovements, newItem];
    updateCategoryImprovements(category, updatedImprovements);
    onDirtyChange?.(true);

    const newItemId = getStableItemId(category, nextIndex, newItem);
    setNewItemIds(prev => ({ ...prev, [newItemId]: true }));
    setExpandedRowId(newItemId);
    setActiveModeById(prev => ({ ...prev, [newItemId]: 'edit' }));
    setEditDraftById(prev => ({
      ...prev,
      [newItemId]: { title: '', body: '' }
    }));
    setRefineDraftById(prev => {
      const next = { ...prev };
      delete next[newItemId];
      return next;
    });
    setAskAnswerById(prev => {
      const next = { ...prev };
      delete next[newItemId];
      return next;
    });
  };

  const persistImprovementsToSupabase = async (updatedSsp: typeof ssp) => {
    if (!productId) return;
    const sanitizedSsp = stripEmptySspItems(updatedSsp);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      const { error: upsertError } = await supabase
        .from('offer_products')
        .upsert(
          {
            product_id: productId,
            improvements: sanitizedSsp,
            user_id: userId || null
          },
          { onConflict: 'product_id' }
        );
      if (upsertError) {
        console.error('Error persisting improvements to Supabase:', upsertError);
      } else {
        console.log('Improvements persisted to Supabase');
        onImprovementsSaved?.();
      }
    } catch (err) {
      console.error('Error persisting improvements:', err);
    }
  };

  const handleDeleteImprovement = async (category: keyof SspCategories, index: number) => {
    const items = Array.isArray(ssp[category]) ? ssp[category] : [];
    const removedItem = items[index];
    const next = items.filter((_, i) => i !== index);
    const updatedSsp = { ...ssp, [category]: next };
    updateCategoryImprovements(category, next);
    setSelectedForDelete(null);
    if (removedItem) {
      const removedItemId = getStableItemId(category, index, removedItem);
      setNewItemIds(prev => {
        if (!prev[removedItemId]) return prev;
        const nextIds = { ...prev };
        delete nextIds[removedItemId];
        return nextIds;
      });
    }
    await persistImprovementsToSupabase(updatedSsp);
  };

  const setRowMode = (itemId: string, mode: 'edit' | 'refine' | 'ask', item: SSPItem) => {
    if (mode !== 'edit' && !item.recommendation?.toString().trim()) {
      return;
    }
    const previousMode = activeModeById[itemId];
    setExpandedRowId(itemId);
    setActiveModeById(prev => ({ ...prev, [itemId]: mode }));
    setRefineLoadingById(prev => ({ ...prev, [itemId]: false }));
    setAskLoadingById(prev => ({ ...prev, [itemId]: false }));
    if (mode === 'edit') {
      setEditDraftById(prev => ({
        ...prev,
        [itemId]: {
          title: item.recommendation?.toString().trim() || '',
          body: item.why_it_matters?.toString().trim() || ''
        }
      }));
    }
    if (previousMode && previousMode !== mode) {
      setRefineDraftById(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setAskAnswerById(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  };

  const closeRowWorkshop = (itemId: string) => {
    setExpandedRowId(prev => (prev === itemId ? null : prev));
    setActiveModeById(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setRefineDraftById(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setAskAnswerById(prev => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  };

  const handleCancelEdit = (category: keyof SspCategories, index: number, itemId: string) => {
    const items = Array.isArray(ssp[category]) ? ssp[category] : [];
    const target = items[index];
    if (target && isEmptySspItem(target) && newItemIds[itemId]) {
      const nextItems = items.filter((_, i) => i !== index);
      updateCategoryImprovements(category, nextItems);
      setNewItemIds(prev => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
    closeRowWorkshop(itemId);
  };

  const handleInlineEditSave = async (
    category: keyof SspCategories,
    index: number,
    itemId: string
  ) => {
    const draft = editDraftById[itemId];
    if (!draft) return;
    if (!draft.title.trim()) {
      handleCancelEdit(category, index, itemId);
      return;
    }
    const items = Array.isArray(ssp[category]) ? ssp[category] : [];
    const next = items.map((existing, i) =>
      i === index
        ? {
            ...existing,
            recommendation: draft.title.trim(),
            why_it_matters: draft.body.trim(),
            status: existing.status
          }
        : existing
    );
    const updatedSsp = { ...ssp, [category]: next };
    updateCategoryImprovements(category, next);
    await persistImprovementsToSupabase(updatedSsp);
    setNewItemIds(prev => {
      const nextIds = { ...prev };
      delete nextIds[itemId];
      return nextIds;
    });
    setInlineStatus({ category, index, message: 'Saved ✓' });
    closeRowWorkshop(itemId);
  };

  const handleInlineRefineSubmit = async (
    category: keyof SspCategories,
    index: number,
    item: SSPItem,
    itemId: string
  ) => {
    const instruction = refinePromptById[itemId]?.trim();
    if (!instruction || !productId || !item.recommendation?.toString().trim()) return;
    setRefineLoadingById(prev => ({ ...prev, [itemId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/offer/refine-ssp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({
          productId,
          mode: 'refine',
          category,
          instruction,
          item
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Failed to refine SSP');
      }
      const refinedItem = result?.data?.item;
      if (!refinedItem?.recommendation) {
        throw new Error('Refined SSP payload missing recommendation');
      }
      setRefineDraftById(prev => ({
        ...prev,
        [itemId]: {
          title: refinedItem.recommendation,
          body: refinedItem.why_it_matters,
          details: refinedItem.details
        }
      }));
      onDirtyChange?.(true);
    } catch (err) {
      console.error('Error refining SSP:', err);
    } finally {
      setRefineLoadingById(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleApplyRefineDraft = async (
    category: keyof SspCategories,
    index: number,
    itemId: string
  ) => {
    const draft = refineDraftById[itemId];
    if (!draft) return;
    const items = Array.isArray(ssp[category]) ? ssp[category] : [];
    const targetItem = items[index];
    if (!targetItem) return;
    const updated = linebreakNormalize({
      ...targetItem,
      recommendation: draft.title,
      why_it_matters: draft.body,
      details: draft.details
    });
    if (!updated) return;
    const guardedUpdate = category === 'quantity' && shouldRouteToBundle(`${updated.recommendation} ${updated.why_it_matters || ''}`)
      ? reframeQuantityItem(updated)
      : updated;
    guardedUpdate.recommendation = dedupeTitleForCategory(guardedUpdate.recommendation, guardedUpdate, items, index);
    const next = items.map((existing, i) =>
      i === index
        ? { ...existing, ...guardedUpdate, status: existing.status, source: 'ai' }
        : existing
    );
    const updatedSsp = { ...ssp, [category]: next };
    updateCategoryImprovements(category, next as SSPItem[]);
    await persistImprovementsToSupabase(updatedSsp);
    setInlineStatus({ category, index, message: 'Applied ✓' });
    closeRowWorkshop(itemId);
  };

  const handleInlineAskSubmit = async (
    category: keyof SspCategories,
    index: number,
    item: SSPItem,
    itemId: string
  ) => {
    const question = askPromptById[itemId]?.trim();
    if (!question || !productId || !item.recommendation?.toString().trim()) return;
    setAskLoadingById(prev => ({ ...prev, [itemId]: true }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const existingNotes = normalizeNotes(item, itemId);
      const lastNoteAnswer = existingNotes.length ? existingNotes[existingNotes.length - 1].answer : undefined;
      const response = await fetch('/api/offer/refine-ssp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
        body: JSON.stringify({
          productId,
          mode: 'side_question',
          category,
          instruction: question,
          item,
          aiNotes: existingNotes,
          lastNoteAnswer
        })
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || 'Failed to ask question');
      }
      const answerPayload = result?.data?.answer;
      const answerText = answerPayload?.answer?.toString().trim();
      if (answerText) {
        setAskAnswerById(prev => ({
          ...prev,
          [itemId]: {
            question,
            answer: answerText,
            supplierSpecs: answerPayload?.ifApplicable_supplierSpecs,
            risks: answerPayload?.ifApplicable_risks
          }
        }));
      }
      onDirtyChange?.(true);
    } catch (err) {
      console.error('Error asking AI:', err);
    } finally {
      setAskLoadingById(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleSaveAskNote = async (
    category: keyof SspCategories,
    index: number,
    item: SSPItem,
    itemId: string
  ) => {
    const answer = askAnswerById[itemId];
    if (!answer) return;
    const note = buildNoteFromAnswer(answer.question, {
      answer: answer.answer,
      supplierSpecs: answer.supplierSpecs,
      risks: answer.risks
    });
    if (!note) return;
    try {
      await appendNoteToItem(category, index, item, note);
      setInlineStatus({ category, index, message: 'Note saved ✓' });
      closeRowWorkshop(itemId);
    } catch (err) {
      console.error('Error adding AI note:', err);
    }
  };

  const handleGenerateWithAI = async () => {
    if (!productId) {
      setError('Please select a product');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const hasLiveInsights = Boolean(
        reviewInsights?.topLikes ||
        reviewInsights?.topDislikes ||
        reviewInsights?.importantInsights ||
        reviewInsights?.importantQuestions
      );
      if (!hasLiveInsights) {
        setError('Run Review Aggregator first.');
        setLoading(false);
        return;
      }

      const deepContext = false;

      if (process.env.NODE_ENV !== 'production') {
        const sourceLabel = hasLiveInsights ? 'LIVE' : 'DB';
        console.log(`SSP generate insights source: ${sourceLabel}${deepContext ? ' + deepContext' : ''}`);
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (hasLiveInsights) {
        try {
          const saveResponse = await fetch('/api/offer/save-insights', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
            },
            body: JSON.stringify({
              productId,
              insights: reviewInsights,
              user_id: session?.user?.id
            })
          });

          if (!saveResponse.ok) {
            const saveResult = await saveResponse.json();
            console.error('Error saving review insights:', saveResult);
          }
        } catch (saveError) {
          console.error('Error saving review insights:', saveError);
        }
      }

      const response = await fetch('/api/offer/analyze-reviews', {
        method: 'POST',
        body: JSON.stringify({ 
          productId, 
          generateSSP: true,
          reviewInsights: reviewInsights || null,
          deepContext
        }),
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` })
        },
      });

      if (!response.ok) {
        const result = await response.json().catch(() => null);
        const apiMessage = result?.error || result?.message || 'Failed to generate SSP ideas';
        if (apiMessage.toLowerCase().includes('review aggregator')) {
          throw new Error('Run Review Aggregator first.');
        }
        throw new Error(apiMessage);
      }

      const result = await response.json();

      if (result.success && result.data) {
        const normalized = normalizeSspData(result.data.ssp || undefined);
        onChange(normalized);
        setSuccess(true);
        // Persist SSP improvements to offer_products
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const userId = session?.user?.id;
          const { error: upsertError } = await supabase
            .from('offer_products')
            .upsert(
              {
                product_id: productId,
                improvements: normalized,
                user_id: userId || null
              },
              { onConflict: 'product_id' }
            );
          if (upsertError) {
            console.error('Error saving improvements to offer_products:', upsertError);
          } else {
            console.log('Improvements saved to offer_products');
            onImprovementsSaved?.();
          }
        } catch (persistError) {
          console.error('Error persisting improvements:', persistError);
        }
        setTimeout(() => setSuccess(false), 3000);
      } else {
        throw new Error(result.error || 'Failed to generate SSP ideas');
      }
    } catch (error) {
      console.error('Error generating SSP:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate SSP ideas');
    } finally {
      setLoading(false);
    }
  };

  const refineSuggestionLines = [
    'make this 2x more detailed',
    'how would I explain this to my supplier?',
    'how does this impact the cost of the product?'
  ];

  const getStableItemId = (category: keyof SspCategories, index: number, item: SSPItem) => {
    if (item.id) return item.id;
    const key = `${category}-${index}`;
    if (!generatedItemIds.current[key]) {
      generatedItemIds.current[key] = crypto.randomUUID();
    }
    return generatedItemIds.current[key];
  };

  const normalizeNotes = (item: SSPItem, itemId: string): SspAiNote[] => {
    if (Array.isArray(item.aiNotes)) return item.aiNotes;
    if (typeof item.aiNotes === 'string' && item.aiNotes.trim()) {
      const key = `${itemId}-note-0`;
      if (!generatedNoteIds.current[key]) {
        generatedNoteIds.current[key] = crypto.randomUUID();
      }
      return [{
        id: generatedNoteIds.current[key],
        mode: 'sideQuestion',
        answer: item.aiNotes.trim(),
        createdAt: new Date().toISOString()
      }];
    }
    return [];
  };

  const formatNoteAnswer = (note: { answer: string; supplierSpecs?: string[]; risks?: string[] }) => {
    const sections: string[] = [];
    if (note.answer) sections.push(note.answer.trim());
    if (note.supplierSpecs?.length) {
      sections.push(`Supplier specs:\n- ${note.supplierSpecs.join('\n- ')}`);
    }
    if (note.risks?.length) {
      sections.push(`Risks:\n- ${note.risks.join('\n- ')}`);
    }
    return sections.join('\n\n').trim();
  };

  const buildNoteFromAnswer = (
    questionText: string,
    answerPayload: { answer?: string; supplierSpecs?: string[]; risks?: string[] }
  ): SspAiNote | null => {
    const answerText = answerPayload?.answer?.toString().trim();
    if (!answerText) return null;
    return {
      id: crypto.randomUUID(),
      mode: 'sideQuestion',
      question: questionText.trim(),
      answer: formatNoteAnswer({
        answer: answerText,
        supplierSpecs: answerPayload?.supplierSpecs,
        risks: answerPayload?.risks
      }),
      createdAt: new Date().toISOString(),
      promoted: false
    };
  };

  const appendNoteToItem = async (
    category: keyof SspCategories,
    index: number,
    item: SSPItem,
    note: SspAiNote
  ) => {
    const itemId = getStableItemId(category, index, item);
    const existingNotes = normalizeNotes(item, itemId);
    const alreadyAdded = existingNotes.some(
      existing =>
        existing.answer?.trim() === note.answer?.trim() &&
        (existing.question || '').trim() === (note.question || '').trim()
    );
    if (alreadyAdded) {
      return;
    }
    const items = Array.isArray(ssp[category]) ? ssp[category] : [];
    const next = items.map((existing, i) =>
      i === index
        ? { ...existing, aiNotes: [...existingNotes, note] }
        : existing
    );
    const updatedSsp = { ...ssp, [category]: next };
    updateCategoryImprovements(category, next);
    await persistImprovementsToSupabase(updatedSsp);
    setInlineStatus({ category, index, message: 'AI note added ✓' });
    onDirtyChange?.(true);
  };

  const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'for', 'in', 'on', 'with',
    'is', 'are', 'was', 'were', 'be', 'being', 'been', 'this', 'that', 'these',
    'those', 'it', 'its', 'as', 'at', 'by', 'from', 'into', 'over', 'under', 'up'
  ]);

  const normalizeDetailsValue = (details?: SSPItem['details']): SspDetails | undefined => {
    if (!details) return undefined;
    if (typeof details === 'string') {
      const trimmed = details.trim();
      return trimmed ? { supplierSpecs: [trimmed] } : undefined;
    }
    return details;
  };

  const normalizeForCompare = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter(word => !STOPWORDS.has(word))
      .join(' ');
  };

  const jaccardSimilarity = (a: string, b: string) => {
    const setA = new Set(a.split(' ').filter(Boolean));
    const setB = new Set(b.split(' ').filter(Boolean));
    if (!setA.size || !setB.size) return 0;
    const intersection = [...setA].filter(word => setB.has(word)).length;
    const union = new Set([...setA, ...setB]).size;
    return union === 0 ? 0 : intersection / union;
  };

  const similarityScore = (candidate: string, other: string) => {
    const normalized = normalizeForCompare(candidate);
    const normalizedOther = normalizeForCompare(other);
    if (!normalized || !normalizedOther) return 0;
    const overlap = jaccardSimilarity(normalized, normalizedOther);
    const tokensA = new Set(normalized.split(' ').filter(Boolean));
    const tokensB = new Set(normalizedOther.split(' ').filter(Boolean));
    const intersection = [...tokensA].filter(word => tokensB.has(word)).length;
    const minSize = Math.min(tokensA.size, tokensB.size) || 1;
    const containment = intersection / minSize;
    const lengthRatio = Math.min(normalized.length, normalizedOther.length) / Math.max(normalized.length, normalizedOther.length);
    return 0.6 * overlap + 0.3 * containment + 0.1 * lengthRatio;
  };

  const titleCase = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

  const extractKeywords = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter(word => word.length > 3 && !STOPWORDS.has(word));
  };

  const buildDedupeSuffix = (item: SSPItem) => {
    const detailText = Object.values(normalizeDetailsValue(item.details) || {})
      .flat()
      .filter(Boolean)
      .join(' ');
    const source = [item.why_it_matters, item.recommendation, detailText].filter(Boolean).join(' ');
    const keywords = Array.from(new Set(extractKeywords(source))).slice(0, 2);
    if (!keywords.length) return 'Variant';
    return keywords.map(titleCase).join(' + ');
  };

  const dedupeTitleForCategory = (
    candidateTitle: string,
    item: SSPItem,
    items: SSPItem[],
    index: number,
    threshold = 0.6
  ) => {
    const baseTitle = candidateTitle.replace(/\s*\([^)]+\)\s*$/, '').trim();
    const otherTitles = items
      .filter((_, i) => i !== index)
      .map(existing => existing.recommendation)
      .filter(Boolean);
    const conflict = findDuplicateConflict(baseTitle, otherTitles.map((text, i) => ({ text, index: i })), threshold);
    if (!conflict) return candidateTitle;
    const suffix = buildDedupeSuffix(item);
    const withSuffix = `${baseTitle} (${suffix})`;
    if (!isLikelyDuplicate(withSuffix, otherTitles)) return withSuffix;
    return `${withSuffix} ${index + 1}`;
  };

  const findDuplicateConflict = (candidate: string, others: { text: string; index: number }[], threshold = 0.55) => {
    let best: { index: number; similarity: number } | null = null;
    others.forEach(({ text, index }) => {
      const score = similarityScore(candidate, text);
      if (score > threshold && (!best || score > best.similarity)) {
        best = { index, similarity: score };
      }
    });
    return best;
  };

  const isLikelyDuplicate = (candidate: string, others: string[]) =>
    Boolean(findDuplicateConflict(candidate, others.map((text, index) => ({ text, index }))));

  const linebreakNormalize = (item?: SSPItem) => {
    if (!item) return null;
    return {
      ...item,
      recommendation: item.recommendation?.toString().trim() || '',
      why_it_matters: item.why_it_matters?.toString().trim() || '',
      details: normalizeDetailsValue(item.details)
    };
  };

  const handleToggleLock = async (category: keyof SspCategories, index: number, item: SSPItem) => {
    if (!item.recommendation?.toString().trim()) return;
    const items = Array.isArray(ssp[category]) ? ssp[category] : [];
    const isLocked = item.status === 'locked';
    const dedupedTitle = isLocked
      ? item.recommendation
      : dedupeTitleForCategory(item.recommendation, item, items, index);
    const next = items.map((existing, i) =>
      i === index
        ? {
            ...existing,
            recommendation: dedupedTitle,
            status: isLocked ? 'draft' : 'locked'
          }
        : existing
    );
    const updatedSsp = { ...ssp, [category]: next };
    updateCategoryImprovements(category, next as SSPItem[]);
    await persistImprovementsToSupabase(updatedSsp);
    setInlineStatus({ category, index, message: isLocked ? 'Unlocked ✓' : 'Locked ✓' });
  };

  const categoryWeights: Record<keyof SspCategories, number> = {
    functionality: 50,
    quality: 40,
    bundle: 30,
    aesthetic: 20,
    quantity: 10
  };

  const categoryPriority: Record<keyof SspCategories, number> = {
    functionality: 0,
    quality: 1,
    bundle: 2,
    aesthetic: 3,
    quantity: 4
  };

  const baseCategories = [
    {
      key: 'quantity' as const,
      title: 'Quantity',
      subtitle: 'Case pack, multi pack',
      icon: Package,
      color: 'purple',
      borderColor: 'border-purple-500/50',
      iconBg: 'bg-purple-500/20',
      iconColor: 'text-purple-400'
    },
    {
      key: 'functionality' as const,
      title: 'Functionality',
      subtitle: 'Ease of use, different uses, added features, size and shape',
      icon: Zap,
      color: 'red',
      borderColor: 'border-red-500/50',
      iconBg: 'bg-red-500/20',
      iconColor: 'text-red-400'
    },
    {
      key: 'quality' as const,
      title: 'Quality',
      subtitle: 'Materials used, construction',
      icon: Award,
      color: 'green',
      borderColor: 'border-emerald-500/50',
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400'
    },
    {
      key: 'aesthetic' as const,
      title: 'Aesthetic',
      subtitle: 'Design, pattern, color, style',
      icon: Palette,
      color: 'blue',
      borderColor: 'border-blue-500/50',
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-400'
    },
    {
      key: 'bundle' as const,
      title: 'Bundle',
      subtitle: 'Accessories, relevant items to add',
      icon: Gift,
      color: 'pink',
      borderColor: 'border-pink-500/50',
      iconBg: 'bg-pink-500/20',
      iconColor: 'text-pink-400'
    }
  ];

  const lockedSsps: Array<{
    categoryKey: keyof SspCategories;
    item: SSPItem;
    index: number;
    icon: typeof Package;
    title: string;
    iconBg: string;
    iconColor: string;
  }> = [];

  const sspCategories = baseCategories
    .map((category) => {
      const items = Array.isArray(ssp[category.key]) ? ssp[category.key] : [];
      let lockedCount = 0;
      let unlockedCount = 0;
      items.forEach((item, index) => {
        const isLocked = item.status === 'locked';
        const hasContent = !isEmptySspItem(item);
        if (isLocked && hasContent) {
          lockedCount += 1;
          lockedSsps.push({
            categoryKey: category.key,
            item,
            index,
            icon: category.icon,
            title: category.title,
            iconBg: category.iconBg,
            iconColor: category.iconColor
          });
          return;
        }
        if (!isLocked && hasContent) {
          unlockedCount += 1;
        }
      });
      const hasSuggestions = unlockedCount > 0;
      const urgencyScore = lockedCount * 1000 + unlockedCount * 50 + categoryWeights[category.key];
      return {
        ...category,
        value: items,
        hasSuggestions,
        urgencyScore
      };
    })
    .sort((a, b) => {
      if (a.hasSuggestions !== b.hasSuggestions) {
        return a.hasSuggestions ? -1 : 1;
      }
      if (a.hasSuggestions && b.hasSuggestions && a.urgencyScore !== b.urgencyScore) {
        return b.urgencyScore - a.urgencyScore;
      }
      return categoryPriority[a.key] - categoryPriority[b.key];
    });

  return (
    <>
    <div className="space-y-6">
      {/* Header - WOW Factor */}
      <div className="bg-gradient-to-br from-purple-900/30 via-blue-900/20 to-slate-800/50 rounded-2xl border-2 border-purple-500/70 shadow-2xl shadow-purple-500/20 p-8 relative overflow-hidden">
        {/* Decorative background elements */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl"></div>
        
        <div className="flex items-start justify-between mb-2 relative z-10">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/50">
                <Sparkles className="w-6 h-6 text-white" strokeWidth={2.5} fill="white" />
              </div>
              <div>
                <h3 className="text-4xl font-bold bg-gradient-to-r from-purple-400 via-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
                  AI SUPER SELLING POINTS (SSPs)
                </h3>
                <p className="text-slate-300 text-base font-medium">Builder Hub</p>
              </div>
            </div>
            <p className="text-slate-400 text-lg max-w-2xl">Create compelling selling points across five key dimensions that will make your product stand out and dominate the market</p>
          </div>
          <div className="hidden md:block">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500/20 to-blue-500/20 rounded-2xl flex items-center justify-center backdrop-blur-sm border border-purple-500/30">
              <Sparkles className="w-10 h-10 text-purple-400" strokeWidth={1.5} />
            </div>
          </div>
        </div>
      </div>

      {lockedSsps.length > 0 && (
        <div className="bg-slate-800/50 rounded-2xl border-2 border-emerald-400 p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-2">
              <div className="mt-0.5">
                <Lock className="w-4 h-4 text-emerald-300/70" />
              </div>
              <div>
                <h4 className="text-xl font-semibold text-slate-100">Finalized SSPs</h4>
                <p className="text-xs text-slate-400">Locked-in wins ready to use.</p>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            {lockedSsps.map(({ categoryKey, item, index, icon: IconComponent, title, iconBg, iconColor }) => (
              <div
                key={`${categoryKey}-${index}`}
                className="flex items-start gap-4 border border-slate-700/60 rounded-xl p-3 bg-slate-900/40 hover:bg-slate-900/60 transition-colors"
              >
                <div className={`w-10 h-10 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                  <IconComponent className={`w-5 h-5 ${iconColor}`} strokeWidth={1.6} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-slate-100">{item.recommendation}</p>
                  {item.why_it_matters && (
                    <p className="text-xs text-slate-400 mt-1">{item.why_it_matters}</p>
                  )}
                  {!item.why_it_matters && (
                    <p className="text-xs text-slate-500 mt-1">{title} SSP</p>
                  )}
                </div>
                <div>
                  <button
                    onClick={() => handleToggleLock(categoryKey, index, item)}
                    className="px-2.5 py-1 rounded-full text-xs border border-slate-600/60 text-slate-300 bg-transparent hover:border-slate-500/70 hover:text-slate-100 flex items-center gap-1.5"
                  >
                    <Unlock className="w-3 h-3" />
                    Unlock
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate With AI Button - Only show when insights exist but no improvements yet */}
      {hasStoredInsights && !hasStoredImprovements && (
        <div className="w-full">
          <button
            onClick={handleGenerateWithAI}
            disabled={loading}
            className="w-full px-8 py-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-all flex items-center gap-2 justify-center"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                GENERATE SSPs WITH AI
              </>
            )}
          </button>
        </div>
      )}

      {/* Loading Progress Overlay */}
      {loading && (
        <div className="bg-gradient-to-br from-slate-900/95 via-purple-900/30 to-slate-900/95 rounded-2xl border-2 border-purple-500/50 p-8 relative overflow-hidden">
          {/* Animated background effect */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-purple-500/10 to-transparent rounded-full animate-pulse"></div>
            <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-blue-500/10 to-transparent rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
          </div>

          <div className="relative z-10">
            {/* Main loading indicator */}
            <div className="flex flex-col items-center mb-8">
              <div className="relative">
                {/* Spinning outer ring */}
                <div className="w-24 h-24 rounded-full border-4 border-purple-500/20 border-t-purple-500 animate-spin"></div>
                {/* Inner icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/50">
                    <Brain className="w-8 h-8 text-white animate-pulse" />
                  </div>
                </div>
              </div>
              <h4 className="text-2xl font-bold text-white mt-6 mb-2">AI Analysis in Progress</h4>
              <p className="text-slate-400 text-sm">Please wait while we generate your Super Selling Points</p>
            </div>

            {/* Progress steps */}
            <div className="max-w-md mx-auto space-y-3">
              {progressSteps.map((step, index) => {
                const StepIcon = step.icon;
                const isActive = index === currentStep;
                const isCompleted = index < currentStep;
                
                return (
                  <div 
                    key={index}
                    className={`flex items-center gap-4 p-3 rounded-xl transition-all duration-500 ${
                      isActive 
                        ? 'bg-purple-500/20 border border-purple-500/50' 
                        : isCompleted 
                          ? 'bg-emerald-500/10 border border-emerald-500/30' 
                          : 'bg-slate-800/30 border border-slate-700/30'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                      isActive 
                        ? 'bg-purple-500/30' 
                        : isCompleted 
                          ? 'bg-emerald-500/20' 
                          : 'bg-slate-700/30'
                    }`}>
                      {isCompleted ? (
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                      ) : isActive ? (
                        <StepIcon className="w-5 h-5 text-purple-400 animate-pulse" />
                      ) : (
                        <StepIcon className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <span className={`text-sm font-medium transition-all duration-500 ${
                      isActive 
                        ? 'text-purple-300' 
                        : isCompleted 
                          ? 'text-emerald-400' 
                          : 'text-slate-500'
                    }`}>
                      {step.label}
                    </span>
                    {isActive && (
                      <Loader2 className="w-4 h-4 text-purple-400 animate-spin ml-auto" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Elapsed time */}
            <div className="text-center mt-6">
              <span className="text-slate-500 text-sm">
                Elapsed time: <span className="text-purple-400 font-mono">{elapsedTime}s</span>
              </span>
            </div>

            {/* Tip message */}
            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
              <div className="flex items-start gap-3">
                <Lightbulb className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-300">
                  <span className="font-semibold">Pro Tip:</span> The AI analyzes customer reviews to identify pain points and opportunities, then generates tailored selling point suggestions for each category.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SSP Cards - Stacked Container */}
      <div className="flex flex-col gap-4">
        {sspCategories.map((category) => {
          const IconComponent = category.icon;
          const improvements = Array.isArray(category.value) ? category.value : [];
          const hasRenderableItems = improvements.some((item, idx) => {
            if (item.status === 'locked') return false;
            const itemId = getStableItemId(category.key, idx, item);
            return !isEmptySspItem(item) || newItemIds[itemId];
          });
          const isEmptyCategory = !hasRenderableItems;
          return (
            <div 
              key={category.key}
              className={`rounded-2xl border-2 p-6 w-full ${
                isEmptyCategory
                  ? 'bg-slate-900/70 border-slate-700/60'
                  : `bg-slate-800/50 ${category.borderColor}`
              }`}
            >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-14 h-14 ${isEmptyCategory ? 'bg-slate-700/40' : category.iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
                      <IconComponent className={`w-7 h-7 ${isEmptyCategory ? 'text-slate-400' : category.iconColor}`} strokeWidth={1.5} />
                    </div>
                    <div>
                      <h4 className={`text-xl font-bold mb-0.5 ${isEmptyCategory ? 'text-slate-300' : 'text-white'}`}>{category.title}</h4>
                      <p className={`text-xs mt-0.5 mb-3 ${isEmptyCategory ? 'text-slate-500/80' : 'text-slate-400/80'}`}>{category.subtitle}</p>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  {!hasRenderableItems && (
                    <p className="text-xs text-slate-500/80">No SSPs generated yet. Add one to get started.</p>
                  )}
                  {improvements.map((item, idx) => {
                    if (item.status === 'locked') {
                      return null;
                    }
                    const isSelectedForDelete = selectedForDelete && selectedForDelete.category === category.key && selectedForDelete.index === idx;
                    const itemId = getStableItemId(category.key, idx, item);
                    const isNewItem = newItemIds[itemId];
                    if (isEmptySspItem(item) && !isNewItem) {
                      return null;
                    }
                    const notes = normalizeNotes(item, itemId);
                    const notesExpanded = notesOpenById[itemId] ?? false;
                    const isLocked = item.status as string === 'locked';
                    const hasTitle = Boolean(item.recommendation?.toString().trim());
                    const statusMessage = inlineStatus && inlineStatus.category === category.key && inlineStatus.index === idx
                      ? inlineStatus.message
                      : null;
                    const isExpanded = expandedRowId === itemId;
                    const activeMode = activeModeById[itemId];
                    const editDraft = editDraftById[itemId];
                    const refineDraft = refineDraftById[itemId];
                    const askAnswer = askAnswerById[itemId];
                    const refinePrompt = refinePromptById[itemId] ?? '';
                    const askPrompt = askPromptById[itemId] ?? '';
                    const refineLoading = refineLoadingById[itemId] ?? false;
                    const askLoading = askLoadingById[itemId] ?? false;
                    const refineDisabled = !hasTitle;
                    const askDisabled = !hasTitle;
                    const lockDisabled = !hasTitle;
                    return (
                      <div
                        key={`${category.key}-${idx}`}
                        className={`flex items-start gap-4 border rounded-lg p-2.5 bg-slate-900/40 ${
                          isLocked ? 'border-emerald-500/40 bg-emerald-500/5 shadow-[0_0_12px_rgba(16,185,129,0.15)]' : 'border-slate-700/50'
                        }`}
                      >
                        <div className="mt-1">
                          <Checkbox
                            checked={isSelectedForDelete}
                            onChange={(e) => handleSelectForDelete(category.key, idx, e.target.checked)}
                            disabled={isLocked}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between gap-5">
                            <div className="flex-1 max-w-[32rem]">
                              {item.recommendation?.trim() ? (
                                <p className="text-base font-semibold text-slate-200 whitespace-pre-wrap leading-snug">{item.recommendation}</p>
                              ) : (
                                <p className="text-base font-medium text-slate-500 italic">New SSP</p>
                              )}
                              {item.why_it_matters && (
                                <p className="text-xs text-slate-400/80 mt-1.5">{item.why_it_matters}</p>
                              )}
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <div className="flex flex-wrap justify-end gap-2">
                                <button
                                  onClick={() => setRowMode(itemId, 'refine', item)}
                                  className="px-2.5 py-1 rounded-full text-xs font-medium text-indigo-50 bg-gradient-to-r from-indigo-500/30 via-purple-500/25 to-blue-500/30 hover:from-indigo-500/40 hover:via-purple-500/35 hover:to-blue-500/40 border border-indigo-400/40 hover:border-indigo-300/60 hover:shadow-[0_0_12px_rgba(99,102,241,0.35)] transition-shadow flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                  disabled={refineDisabled}
                                  title={refineDisabled ? 'Add an SSP before refining.' : undefined}
                                >
                                  <Wand2 className="w-3 h-3" />
                                  Refine
                                </button>
                                <button
                                  onClick={() => handleToggleLock(category.key, idx, item)}
                                  className={`px-2.5 py-1 rounded-full text-xs border flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                                    isLocked
                                      ? 'bg-emerald-500/15 text-emerald-200 border-emerald-400/50'
                                      : 'bg-transparent text-slate-200 border-slate-600/60 hover:border-slate-500/60'
                                  }`}
                                  disabled={lockDisabled}
                                  title={lockDisabled ? 'Add an SSP title before locking.' : undefined}
                                >
                                  {isLocked ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                                  {isLocked ? 'Locked' : 'Lock'}
                                </button>
                                {isSelectedForDelete && (
                                  <button
                                    onClick={() => setDeleteConfirmPending({ category: category.key, index: idx })}
                                    className="p-2 rounded-md bg-red-600/80 text-white hover:bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.35)]"
                                    aria-label="Delete SSP"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-900/50 p-3 space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => setRowMode(itemId, 'edit', item)}
                                  className={`px-3 py-1 rounded-full text-xs border ${
                                    activeMode === 'edit'
                                      ? 'bg-slate-200 text-slate-900 border-slate-200'
                                      : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:border-slate-500/70'
                                  }`}
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => setRowMode(itemId, 'refine', item)}
                                  className={`px-3 py-1 rounded-full text-xs border disabled:opacity-50 disabled:cursor-not-allowed ${
                                    activeMode === 'refine'
                                      ? 'bg-indigo-500/20 text-indigo-200 border-indigo-400/50'
                                      : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:border-slate-500/70'
                                  }`}
                                  disabled={refineDisabled}
                                  title={refineDisabled ? 'Add an SSP before refining.' : undefined}
                                >
                                  Refine
                                </button>
                                <button
                                  onClick={() => setRowMode(itemId, 'ask', item)}
                                  className={`px-3 py-1 rounded-full text-xs border disabled:opacity-50 disabled:cursor-not-allowed ${
                                    activeMode === 'ask'
                                      ? 'bg-blue-500/20 text-blue-200 border-blue-400/50'
                                      : 'bg-slate-800/70 text-slate-300 border-slate-700/60 hover:border-slate-500/70'
                                  }`}
                                  disabled={askDisabled}
                                  title={askDisabled ? 'Add an SSP before refining.' : undefined}
                                >
                                  Ask AI
                                </button>
                              </div>
                              {activeMode === 'edit' && (
                                <div className="space-y-2">
                                  <input
                                    type="text"
                                    value={editDraft?.title ?? ''}
                                    onChange={(e) =>
                                      setEditDraftById(prev => ({
                                        ...prev,
                                        [itemId]: { title: e.target.value, body: prev[itemId]?.body ?? '' }
                                      }))
                                    }
                                    placeholder="SSP title"
                                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/70"
                                  />
                                  <textarea
                                    rows={3}
                                    value={editDraft?.body ?? ''}
                                    onChange={(e) =>
                                      setEditDraftById(prev => ({
                                        ...prev,
                                        [itemId]: { title: prev[itemId]?.title ?? '', body: e.target.value }
                                      }))
                                    }
                                    placeholder="Description / reasoning"
                                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/70"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <button
                                      onClick={() => handleCancelEdit(category.key, idx, itemId)}
                                      className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-300 text-xs border border-slate-700/60 hover:border-slate-500/60"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleInlineEditSave(category.key, idx, itemId)}
                                      className="px-3 py-1.5 rounded-md bg-emerald-600/80 text-white text-xs hover:bg-emerald-500 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                                      disabled={!editDraft?.title?.trim()}
                                      title={!editDraft?.title?.trim() ? 'Enter an SSP title to save.' : undefined}
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                      Save
                                    </button>
                                  </div>
                                </div>
                              )}
                              {activeMode === 'refine' && (
                                <div className="space-y-2">
                                  <textarea
                                    rows={3}
                                    value={refinePrompt}
                                    onChange={(e) =>
                                      setRefinePromptById(prev => ({ ...prev, [itemId]: e.target.value }))
                                    }
                                    maxLength={400}
                                    placeholder="Refine prompt"
                                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/70"
                                  />
                                  <div className="text-xs text-slate-500 whitespace-pre-wrap">
                                    {refineSuggestionLines.join('\n')}
                                  </div>
                                  <div className="flex items-center justify-end gap-3">
                                    {refineLoading && (
                                      <span className="text-xs text-slate-400 flex items-center gap-1">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Generating...
                                      </span>
                                    )}
                                    <button
                                      onClick={() => closeRowWorkshop(itemId)}
                                      className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-300 text-xs border border-slate-700/60 hover:border-slate-500/60 disabled:opacity-50 disabled:cursor-not-allowed"
                                      disabled={refineLoading}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleInlineRefineSubmit(category.key, idx, item, itemId)}
                                      className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-xs hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                      disabled={!refinePrompt.trim() || refineLoading}
                                      title={!refinePrompt.trim() ? 'Enter a prompt to continue.' : undefined}
                                    >
                                      Send to AI
                                    </button>
                                  </div>
                                  {refineDraft && (
                                    <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3 space-y-2">
                                      <p className="text-xs text-slate-400">Draft preview</p>
                                      <p className="text-sm text-slate-100 whitespace-pre-wrap">{refineDraft.title}</p>
                                      {refineDraft.body && (
                                        <p className="text-xs text-slate-300 whitespace-pre-wrap">{refineDraft.body}</p>
                                      )}
                                      <div className="flex justify-end">
                                        <button
                                          onClick={() => handleApplyRefineDraft(category.key, idx, itemId)}
                                          className="px-3 py-1.5 rounded-md bg-emerald-600/80 text-white text-xs hover:bg-emerald-500"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {activeMode === 'ask' && (
                                <div className="space-y-2">
                                  <textarea
                                    rows={3}
                                    value={askPrompt}
                                    onChange={(e) =>
                                      setAskPromptById(prev => ({ ...prev, [itemId]: e.target.value }))
                                    }
                                    maxLength={400}
                                    placeholder="Ask a question"
                                    className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-md text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/70"
                                  />
                                  <div className="flex items-center justify-end gap-3">
                                    {askLoading && (
                                      <span className="text-xs text-slate-400 flex items-center gap-1">
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Generating...
                                      </span>
                                    )}
                                    <button
                                      onClick={() => closeRowWorkshop(itemId)}
                                      className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-300 text-xs border border-slate-700/60 hover:border-slate-500/60 disabled:opacity-50 disabled:cursor-not-allowed"
                                      disabled={askLoading}
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      onClick={() => handleInlineAskSubmit(category.key, idx, item, itemId)}
                                      className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                                      disabled={!askPrompt.trim() || askLoading}
                                      title={!askPrompt.trim() ? 'Enter a prompt to continue.' : undefined}
                                    >
                                      Send to AI
                                    </button>
                                  </div>
                                  {askAnswer && (
                                    <div className="rounded-lg border border-slate-700/60 bg-slate-950/40 p-3 space-y-2">
                                      <p className="text-xs text-slate-400">AI Note</p>
                                      <p className="text-xs text-slate-300 whitespace-pre-wrap">
                                        {formatNoteAnswer({
                                          answer: askAnswer.answer,
                                          supplierSpecs: askAnswer.supplierSpecs,
                                          risks: askAnswer.risks
                                        })}
                                      </p>
                                      <div className="flex justify-end">
                                        <button
                                          onClick={() => handleSaveAskNote(category.key, idx, item, itemId)}
                                          className="px-3 py-1.5 rounded-md bg-emerald-600/80 text-white text-xs hover:bg-emerald-500"
                                        >
                                          Save Note
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                          {notes.length > 0 && (
                            <div className="mt-2 rounded-lg border border-slate-700/60 bg-slate-900/50">
                              <button
                                onClick={() => setNotesOpenById(prev => ({ ...prev, [itemId]: !notesExpanded }))}
                                className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-300 hover:text-white transition-colors"
                              >
                                <span className="flex items-center gap-2">
                                  <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                                  AI Notes ({notes.length})
                                </span>
                                {notesExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </button>
                              {notesExpanded && (
                                <div className="px-3 pb-3 space-y-2">
                                  {notes.map((note) => (
                                    <div key={note.id} className="rounded-md border border-slate-700/50 bg-slate-900/40 p-2">
                                      {note.question && (
                                        <p className="text-[11px] text-slate-400 mb-1">Q: {note.question}</p>
                                      )}
                                      <p className="text-xs text-slate-300 whitespace-pre-wrap">{note.answer}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                          {statusMessage && (
                            <p className="text-xs text-emerald-400 mt-2">{statusMessage}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div className="mt-4">
                    <button
                      onClick={() => handleAddBlankSsp(category.key)}
                      className="px-3 py-1.5 rounded-full bg-slate-800/50 text-slate-300/90 text-[11px] border border-slate-700/40 hover:border-slate-500/50 hover:bg-slate-800/70 transition-colors flex items-center gap-2"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add SSP
                    </button>
                  </div>
                </div>
            </div>
          );
        })}
      </div>

      {/* Success Message */}
      {success && (
        <div className="p-4 bg-emerald-500/10 border-2 border-emerald-500/20 rounded-xl flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">
            SSP ideas generated successfully! Review and edit the suggestions above.
          </span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/10 border-2 border-red-500/20 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <span className="text-sm text-red-400 font-medium">{error}</span>
        </div>
      )}

    </div>

      {/* Delete SSP Confirmation Modal */}
      {deleteConfirmPending && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl p-6 max-w-md w-full border border-gray-200 dark:border-slate-700/50">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Delete SSP</h3>
                <p className="text-gray-600 dark:text-slate-400 text-sm">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-gray-700 dark:text-slate-300 mb-6">
              Are you sure you want to delete this Super Selling Point?
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmPending(null)}
                className="px-4 py-2 bg-gray-200 dark:bg-slate-700 hover:bg-gray-300 dark:hover:bg-slate-600 rounded-lg text-gray-900 dark:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDeleteImprovement(deleteConfirmPending.category, deleteConfirmPending.index);
                  setDeleteConfirmPending(null);
                }}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 rounded-lg text-white transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete SSP
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
