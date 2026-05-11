import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import { apiFetch } from '@/lib/api';
import type { PageDetail, PageSeoScore } from '@/types/api';

export default function PageDetailView() {
  const router = useRouter();
  const { id } = router.query;
  const key = typeof id === 'string' ? `/api/pages/${id}/` : null;
  const { data: page } = useSWR<PageDetail>(key);

  const [seoScore, setSeoScore] = useState<PageSeoScore | null>(null);
  const [seoLoading, setSeoLoading] = useState(false);
  const [seoError, setSeoError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof id !== 'string') return;
    setSeoLoading(true);
    setSeoError(null);
    apiFetch<PageSeoScore>(`/api/pages/${id}/seo-score/`)
      .then(setSeoScore)
      .catch((e) => setSeoError(e.message))
      .finally(() => setSeoLoading(false));
  }, [id]);

  return (
    <Layout>
      {!page ? (
        <div className="text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold">{page.title || page.url}</h2>
            <div className="text-sm text-gray-500 break-all">{page.url}</div>
            <div className="text-xs text-gray-500 mt-1">
              {page.host} · {page.http_status} · {page.language || 'unknown language'}
            </div>
          </div>

          <section className="bg-white rounded-md shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-3">SEO Score</h3>
            {seoLoading && <div className="text-gray-500">Loading…</div>}
            {seoError && <div className="text-red-600">{seoError}</div>}
            {seoScore && (
              <div>
                <div className="text-4xl font-semibold">{seoScore.seo_score ?? '—'}</div>
                <div className="text-xs text-gray-500 mt-1">out of 100</div>
                <div className="text-xs text-gray-400 mt-2">
                  Last updated: {seoScore.fetched_at ? new Date(seoScore.fetched_at).toLocaleString() : '—'}
                </div>
              </div>
            )}
          </section>

          {page.description && (
            <section className="bg-white rounded-md shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-2">Description</h3>
              <p className="text-sm text-gray-700">{page.description}</p>
            </section>
          )}
        </div>
      )}
    </Layout>
  );
}
