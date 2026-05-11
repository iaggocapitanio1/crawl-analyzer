import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import { apiFetch } from '@/lib/api';
import type { Domain, DomainInsights } from '@/types/api';

export default function DomainDetail() {
  const router = useRouter();
  const { id } = router.query;
  const domainKey = typeof id === 'string' ? `/api/domains/${id}/` : null;
  const { data: domain } = useSWR<Domain>(domainKey);

  const [insights, setInsights] = useState<DomainInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof id !== 'string') return;
    setInsightsLoading(true);
    setInsightsError(null);
    apiFetch<DomainInsights>(`/api/domains/${id}/insights/`)
      .then(setInsights)
      .catch((e) => setInsightsError(e.message))
      .finally(() => setInsightsLoading(false));
  }, [id]);

  return (
    <Layout>
      {!domain ? (
        <div className="text-gray-500">Loading…</div>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold">{domain.host}</h2>
            <div className="text-sm text-gray-500">{domain.page_count} pages tracked</div>
          </div>

          <section className="bg-white rounded-md shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-3">Domain Insights</h3>
            {insightsLoading && <div className="text-gray-500">Loading…</div>}
            {insightsError && <div className="text-red-600">{insightsError}</div>}
            {insights && (
              <div>
                <div className="text-4xl font-semibold">{insights.authority_score ?? '—'}</div>
                <div className="text-xs text-gray-500 mt-1">Domain Authority Score</div>
                <div className="text-xs text-gray-400 mt-2">
                  Last updated: {insights.fetched_at ? new Date(insights.fetched_at).toLocaleString() : '—'}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </Layout>
  );
}
