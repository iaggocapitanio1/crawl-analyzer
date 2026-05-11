import { useRouter } from 'next/router';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import { Skeleton } from '@/components/Skeleton';
import type { PageDetail, PageSeoScore } from '@/types/api';

function PageHeader({ page }: Readonly<{ page: PageDetail | undefined }>) {
  if (!page) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-8" width="60%" />
        <Skeleton className="h-4" width="80%" />
      </div>
    );
  }
  return (
    <div>
      <h2 className="text-2xl font-semibold">{page.title || page.url}</h2>
      <div className="text-sm text-gray-500 break-all">{page.url}</div>
      <div className="text-xs text-gray-500 mt-1">
        {page.host} · {page.http_status} · {page.language || 'unknown language'}
      </div>
    </div>
  );
}

function SeoPanel({
  data,
  error,
  loading,
}: Readonly<{ data: PageSeoScore | undefined; error: Error | undefined; loading: boolean }>) {
  if (loading && !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10" width="25%" />
        <Skeleton className="h-3" width="40%" />
      </div>
    );
  }
  if (error) return <div className="text-red-600">{error.message}</div>;
  if (!data) return null;
  return (
    <div>
      <div className="text-4xl font-semibold">{data.seo_score ?? '—'}</div>
      <div className="text-xs text-gray-500 mt-1">out of 100</div>
      <div className="text-xs text-gray-400 mt-2">
        Last updated: {data.fetched_at ? new Date(data.fetched_at).toLocaleString() : '—'}
      </div>
    </div>
  );
}

export default function PageDetailView() {
  const router = useRouter();
  const { id } = router.query;
  const idStr = typeof id === 'string' ? id : null;

  const { data: page } = useSWR<PageDetail>(idStr ? `/api/pages/${idStr}/` : null);
  const { data: seoScore, error: seoError, isLoading: seoLoading } = useSWR<PageSeoScore>(
    idStr ? `/api/pages/${idStr}/seo-score/` : null,
  );

  return (
    <Layout>
      <div className="space-y-6">
        <PageHeader page={page} />
        {page && (
          <>
            <section className="bg-white rounded-md shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-3">SEO Score</h3>
              <SeoPanel data={seoScore} error={seoError} loading={seoLoading} />
            </section>

            {page.description && (
              <section className="bg-white rounded-md shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-2">Description</h3>
                <p className="text-sm text-gray-700">{page.description}</p>
              </section>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
