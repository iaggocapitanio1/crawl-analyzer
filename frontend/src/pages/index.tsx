import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/Layout';
import { apiFetch } from '@/lib/api';
import type { Stats, Paginated, Domain } from '@/types/api';

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-white rounded-md shadow-sm p-5 border border-gray-200">
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-3xl font-semibold mt-2">{value}</div>
    </div>
  );
}

export default function Home() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
  const [backlinks, setBacklinks] = useState<number | null>(null);
  const [backlinksLoading, setBacklinksLoading] = useState(false);

  useEffect(() => {
    setInterval(() => {
      apiFetch<Stats>('/api/stats/')
        .then((s) => {
          setStats(s);
          setStatsError(null);
        })
        .catch((e) => setStatsError(e.message));
    }, 5000);
    apiFetch<Stats>('/api/stats/')
      .then((s) => setStats(s))
      .catch((e) => setStatsError(e.message));
  }, []);

  useEffect(() => {
    apiFetch<Paginated<Domain>>('/api/domains/').then((r) => {
      setDomains(r.results);
      if (r.results.length) setSelectedDomain(r.results[0]);
    });
  }, []);

  useEffect(() => {
    if (!selectedDomain) return;
    setBacklinks(null);
    setBacklinksLoading(true);
    apiFetch<{ backlink_count: number }>(`/api/domains/${selectedDomain.id}/backlinks/`)
      .then((r) => setBacklinks(r.backlink_count))
      .finally(() => setBacklinksLoading(false));
  }, [selectedDomain]);

  return (
    <Layout>
      <div className="space-y-8">
        {statsError && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded">
            Stats failed to load: {statsError}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Kpi label="Domains tracked" value={stats?.total_domains ?? '—'} />
          <Kpi label="Pages indexed" value={stats?.total_pages ?? '—'} />
          <Kpi label="Backlinks" value={stats?.total_backlinks ?? '—'} />
          <Kpi label="4xx / 5xx" value={stats ? `${stats.pages_4xx} / ${stats.pages_5xx}` : '—'} />
        </div>

        <section className="bg-white rounded-md shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Backlink Overview</h2>
            {domains.length > 0 && (
              <select
                className="border border-gray-300 rounded px-2 py-1 text-sm"
                value={selectedDomain?.id ?? ''}
                onChange={(e) => {
                  const d = domains.find((x) => x.id === Number(e.target.value)) || null;
                  setSelectedDomain(d);
                }}
              >
                {domains.map((d) => (
                  <option key={d.id} value={d.id}>{d.host}</option>
                ))}
              </select>
            )}
          </div>
          {backlinksLoading ? (
            <div className="text-gray-500">Loading…</div>
          ) : backlinks !== null ? (
            <div>
              <div className="text-4xl font-semibold">{backlinks.toLocaleString()}</div>
              <div className="text-xs text-gray-500 mt-1">inbound links to {selectedDomain?.host}</div>
              <Link href={`/domains/${selectedDomain?.id}`} className="text-blue-600 hover:underline text-sm mt-3 inline-block">
                Open domain →
              </Link>
            </div>
          ) : (
            <div className="text-gray-500">Pick a domain</div>
          )}
        </section>
      </div>
    </Layout>
  );
}
