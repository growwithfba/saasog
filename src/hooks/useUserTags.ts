'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/utils/supabaseClient';
import type { TagShape } from '@/components/Tags/TagChip';

interface UserTag extends TagShape {
  usage_count: number;
  created_at?: string;
}

/**
 * Hook that loads the authenticated user's tags once and exposes a
 * `refresh` fn for when tags are added / removed elsewhere.
 * Returns an empty list + null error while loading.
 */
export function useUserTags(): {
  tags: UserTag[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [tags, setTags] = useState<UserTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/tags', {
        headers: {
          ...(session?.access_token && { Authorization: `Bearer ${session.access_token}` }),
        },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `Failed to load tags (HTTP ${res.status})`);
      }
      setTags(data.tags || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tags');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { tags, loading, error, refresh };
}
