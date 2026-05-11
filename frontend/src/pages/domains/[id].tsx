import { useRouter } from 'next/router';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import { Skeleton } from '@/components/Skeleton';
import type { Domain, DomainInsights } from '@/types/api';

function DomainHeader({ domain }: Readonly<{ domain: Domain | undefined }>) {
  if (!domain) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8" width="40%" />
        <Skeleton className="h-4" width="25%" />
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-2xl font-semibold">{domain.host}</h2>
      {/* page_count is denormalized on Domain; relies on backend invalidation after Page writes. */}
      <div className="text-sm text-gray-500">{domain.page_count} pages tracked</div>
    </div>
  );
}

function InsightsPanel({
  data,
  error,
  loading,
}: Readonly<{ data: DomainInsights | undefined; error: Error | undefined; loading: boolean }>) {
  if (loading && !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10" width="30%" />
        <Skeleton className="h-3" width="50%" />
      </div>
    );
  }
  if (error) return <div className="text-red-600">{error.message}</div>;
  if (!data) return null;
  return (
    <div>
      <div className="text-4xl font-semibold">{data.authority_score ?? '—'}</div>
      <div className="text-xs text-gray-500 mt-1">Domain Authority Score</div>
      <div className="text-xs text-gray-400 mt-2">
        Last updated: {data.fetched_at ? new Date(data.fetched_at).toLocaleString() : '—'}
      </div>
    </div>
  );
}

export default function DomainDetail() {
  const router = useRouter();
  const { id } = router.query;
  const idStr = typeof id === 'string' ? id : null;

  const { data: domain } = useSWR<Domain>(idStr ? `/api/domains/${idStr}/` : null);
  const { data: insights, error: insightsError, isLoading: insightsLoading } = useSWR<DomainInsights>(
    idStr ? `/api/domains/${idStr}/insights/` : null,
  );

  return (
    <Layout>
      <div className="space-y-6">
        <DomainHeader domain={domain} />
        {domain && (
          <section className="bg-white rounded-md shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold mb-3">Domain Insights</h3>
            <InsightsPanel data={insights} error={insightsError} loading={insightsLoading} />
          </section>
        )}
      </div>
    </Layout>
  );
}
