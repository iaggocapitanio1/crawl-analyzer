import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import DataTable from '@/components/DataTable';
import { apiFetch } from '@/lib/api';
import type { Paginated, PageSummary, ExportJob } from '@/types/api';

function buildQuery(filters: Record<string, string>) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function PagesList() {
  const [search, setSearch] = useState('');
  const [httpStatus, setHttpStatus] = useState('');
  const [domainId, setDomainId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const filters: Record<string, string> = {};
  if (search) filters.search = search;
  if (httpStatus) filters.http_status = httpStatus;
  if (domainId) filters.domain = domainId;

  const key = `/api/pages/${buildQuery(filters)}`;
  const { data, isLoading } = useSWR<Paginated<PageSummary>>(key);

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      const body = {
        filter_params: filters,
      };
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/exports/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(`export failed: ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'export.csv';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setExportError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Pages</h2>
        <button
          disabled={exporting}
          onClick={onExport}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
        >
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
      {exportError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded mb-4 text-sm">
          {exportError}
        </div>
      )}
      <div className="flex gap-3 mb-4">
        <input
          className="border border-gray-300 rounded px-3 py-1.5 flex-1"
          placeholder="Search title or URL"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          className="border border-gray-300 rounded px-3 py-1.5 w-32"
          placeholder="Status"
          value={httpStatus}
          onChange={(e) => setHttpStatus(e.target.value)}
        />
      </div>
      {isLoading && <div className="text-gray-500">Loading…</div>}
      {data && data.results.length === 0 && (
        <div className="text-gray-500 py-8 text-center">No results found</div>
      )}
      {data && data.results.length > 0 && (
        <DataTable
          rowKey={(p) => p.id}
          rows={data.results}
          columns={[
            {
              key: 'title',
              header: 'Title',
              render: (p) => (
                <Link href={`/pages/${p.id}`} className="text-blue-600 hover:underline">
                  {p.title || p.url}
                </Link>
              ),
            },
            { key: 'host', header: 'Host', render: (p) => p.host },
            { key: 'status', header: 'Status', render: (p) => p.http_status },
            { key: 'lang', header: 'Lang', render: (p) => p.language || '—' },
            {
              key: 'fetched',
              header: 'Fetched',
              render: (p) => new Date(p.fetched_at).toLocaleDateString(),
            },
          ]}
        />
      )}
    </Layout>
  );
}
