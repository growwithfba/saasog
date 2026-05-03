// =============================================================================
// Lens preferences read helper
// =============================================================================
// Single source of truth for parsing profiles.preferences.lens into a
// typed shape. Used by /api/extension/me (to return prefs in the
// single hot-path round-trip) and by /api/extension/settings (to
// validate before writing). Keeping the read path here avoids
// importing one route from another, which Next.js handles in odd ways.

import { supabaseAdmin } from '@/utils/supabaseAdmin';

export type LensPrefs = {
  defaultUnit?: 'imperial' | 'metric';
};

export async function readLensPrefs(userId: string): Promise<LensPrefs> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle();
  const prefs = (data?.preferences as Record<string, unknown> | null) ?? {};
  const lens = (prefs.lens as Record<string, unknown> | undefined) ?? {};
  const out: LensPrefs = {};
  if (lens.defaultUnit === 'imperial' || lens.defaultUnit === 'metric') {
    out.defaultUnit = lens.defaultUnit;
  }
  return out;
}
