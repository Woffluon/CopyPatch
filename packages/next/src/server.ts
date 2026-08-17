import { ContentSnapshot, API_BASE_PATH } from '@copypatch/core';

export interface FetchServerSnapshotOptions {
  apiBaseUrl?: string;
  revalidate?: number | false;
}

interface NextFetchRequestInit extends RequestInit {
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
}

/**
 * Helper for Next.js Server Components / RSC to fetch published snapshot at render time for SSR without hydration mismatch.
 */
export async function fetchServerSnapshot(
  locale: string,
  options: FetchServerSnapshotOptions = {}
): Promise<ContentSnapshot> {
  const hasCustomUrl = Boolean(options.apiBaseUrl || process.env.COPYPATCH_API_URL);
  const apiBaseUrl = options.apiBaseUrl || process.env.COPYPATCH_API_URL || 'http://localhost:4040';

  if (!hasCustomUrl && process.env.NODE_ENV === 'production') {
    console.warn(
      '[copypatch/next] Warning: COPYPATCH_API_URL is not defined in production environment. Falling back to http://localhost:4040.'
    );
  }

  const url = `${apiBaseUrl}${API_BASE_PATH}/content/${encodeURIComponent(locale)}`;

  try {
    const fetchOptions: NextFetchRequestInit = {
      headers: {
        Accept: 'application/json',
      },
    };

    if (options.revalidate !== undefined) {
      fetchOptions.next = { revalidate: options.revalidate };
    }

    const res = await fetch(url, fetchOptions);
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[CopyPatch SSR] Failed to fetch server snapshot from ${url}:`, err);
    }
  }

  return { revision: 1, content: {} };
}
