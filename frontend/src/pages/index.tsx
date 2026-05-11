import { useState, useMemo } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import { Skeleton } from '@/components/Skeleton';
import type { Stats, Paginated, Domain } from '@/types/api';

function Kpi({ label, value, loading }: Readonly<{ label: string; value: string | number; loading: boolean }>) {
  return (
    <div className="bg-white rounded-md shadow-sm p-5 border border-gray-200">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="mt-2">
        {loading ? <Skeleton className="h-9" width="60%" /> : <div className="text-3xl font-semibold">{value}</div>}
      </div>
    </div>
  );
}

function BacklinkPanel({
  domain,
  data,
  loading,
}: Readonly<{
  domain: Domain | null;
  data: { backlink_count: number } | undefined;
  loading: boolean;
}>) {
  if (!domain) {
    return <div className="text-gray-500">No domains yet — add one to see backlinks.</div>;
  }
  if (loading && !data) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10" width="40%" />
        <Skeleton className="h-3" width="60%" />
      </div>
    );
  }
  if (!data) return null;
  return (
    <div>
      <div className="text-4xl font-semibold">{data.backlink_count.toLocaleString()}</div>
      <div className="text-xs text-gray-500 mt-1">inbound links to {domain.host}</div>
      <Link
        href={`/domains/${domain.id}`}
        className="text-blue-600 hover:underline text-sm mt-3 inline-block"
      >
        Open domain →
      </Link>
    </div>
  );
}

export default function Home() {
  const { data: stats, error: statsError, isLoading: statsLoading } = useSWR<Stats>(
    '/api/stats/',
    { refreshInterval: 30000 },
  );
  // Home is a dashboard, not a domain browser — show the top domains by page
  // volume so the default selection is meaningful. For full browsing the user
  // navigates to /domains.
  const { data: domainsPage } = useSWR<Paginated<Domain>>(
    '/api/domains/?ordering=-page_count&page_size=100',
  );
  const domains = useMemo(() => domainsPage?.results ?? [], [domainsPage]);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selectedDomain = useMemo(() => {
    if (selectedId !== null) return domains.find((d) => d.id === selectedId) ?? null;
    return domains[0] ?? null;
  }, [domains, selectedId]);

  const { data: backlinks, isLoading: backlinksLoading } = useSWR<{ backlink_count: number }>(
    selectedDomain ? `/api/domains/${selectedDomain.id}/backlinks/` : null,
  );

  return (
    <Layout>
      <div className="space-y-8">
        {statsError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">
            Stats failed to load: {statsError.message}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi label="Domains tracked" value={stats?.total_domains ?? '—'} loading={statsLoading && !stats} />
          <Kpi label="Pages indexed" value={stats?.total_pages ?? '—'} loading={statsLoading && !stats} />
          <Kpi label="Backlinks" value={stats?.total_backlinks ?? '—'} loading={statsLoading && !stats} />
          <Kpi
            label="4xx / 5xx"
            value={stats ? `${stats.pages_4xx} / ${stats.pages_5xx}` : '—'}
            loading={statsLoading && !stats}
          />
        </div>

        <section className="bg-white rounded-md shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Backlink Overview</h2>
            {domains.length > 0 && (
              <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={selectedDomain?.id ?? ''}
                onChange={(e) => setSelectedId(Number(e.target.value))}
              >
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>{d.host}</option>
                ))}
              </select>
            )}
          </div>
          <BacklinkPanel domain={selectedDomain} data={backlinks} loading={backlinksLoading} />
        </section>
      </div>
    </Layout>
  );
}
