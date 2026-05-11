import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import useSWR, { mutate } from 'swr';
import Layout from '@/components/Layout';
import DataTable from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { SkeletonTable } from '@/components/Skeleton';
import { useToast } from '@/components/Toast';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { ApiError } from '@/lib/api';
import { API_URL } from '@/utils/config';
import type { Paginated, PageSummary, ExportJob } from '@/types/api';

const PAGE_SIZE = 50;

const FILTER_KEYS = ['search', 'http_status', 'domain'] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

function buildQuery(filters: Partial<Record<FilterKey, string>>, page?: number) {
  const params = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = filters[k];
    if (v) params.set(k, v);
  }
  if (page && page > 1) params.set('page', String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

function readFiltersFromQuery(query: Record<string, string | string[] | undefined>): Record<FilterKey, string> {
  const out: Record<FilterKey, string> = { search: '', http_status: '', domain: '' };
  for (const k of FILTER_KEYS) {
    const raw = query[k];
    if (typeof raw === 'string') out[k] = raw;
  }
  return out;
}

function readPageFromQuery(query: Record<string, string | string[] | undefined>): number {
  const raw = query.page;
  if (typeof raw !== 'string') return 1;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

function triggerDownload(href: string, filename: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  triggerDownload(href, filename);
  URL.revokeObjectURL(href);
}

function buildExportFilename(suffix: string | number) {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `pages-export-${suffix}-${ts}.csv`;
}

function collectFilterParams(filters: Record<FilterKey, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = filters[k];
    if (v) out[k] = v;
  }
  return out;
}

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body.detail || body.error || res.statusText;
  } catch {
    return res.statusText;
  }
}

function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  // Prefer RFC 5987 filename* if present.
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].replace(/^"|"$/g, ''));
    } catch {
      // fall through
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

export default function PagesList() {
  const router = useRouter();
  const initial = readFiltersFromQuery(router.query as Record<string, string | string[] | undefined>);

  const [search, setSearch] = useState(initial.search);
  const [httpStatus, setHttpStatus] = useState(initial.http_status);
  const [domainId, setDomainId] = useState(initial.domain);
  const [page, setPage] = useState(() =>
    readPageFromQuery(router.query as Record<string, string | string[] | undefined>),
  );

  // Re-sync state when router becomes ready (Pages Router populates query async).
  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query as Record<string, string | string[] | undefined>;
    const fromUrl = readFiltersFromQuery(q);
    setSearch(fromUrl.search);
    setHttpStatus(fromUrl.http_status);
    setDomainId(fromUrl.domain);
    setPage(readPageFromQuery(q));
  }, [router.isReady, router.query]);

  const debouncedSearch = useDebouncedValue(search, 300);

  const filters = { search: debouncedSearch, http_status: httpStatus, domain: domainId };
  const hasAnyFilter = Boolean(debouncedSearch || httpStatus || domainId);
  const userInteracted = Boolean(search || httpStatus || domainId);

  // Reset to first page whenever filters change.
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, httpStatus, domainId]);

  // Reflect filters + page in URL (shallow, no navigation). Skip until router is ready.
  useEffect(() => {
    if (!router.isReady) return;
    const next = buildQuery(filters, page);
    const q = router.query as Record<string, string | string[] | undefined>;
    const current = buildQuery(readFiltersFromQuery(q), readPageFromQuery(q));
    if (next === current) return;
    router.replace({ pathname: router.pathname, search: next }, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, httpStatus, domainId, page, router.isReady]);

  const apiParams = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = filters[k];
    if (v) apiParams.set(k, v);
  }
  apiParams.set('page', String(page));
  apiParams.set('page_size', String(PAGE_SIZE));
  const key = `/api/pages/?${apiParams.toString()}`;
  const { data, isLoading, error } = useSWR<Paginated<PageSummary>>(key);

  const toast = useToast();
  const [exportJobId, setExportJobId] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  // Poll the active export job until it terminates. SWR handles cleanup on unmount.
  const { data: jobStatus } = useSWR<ExportJob>(
    exportJobId !== null ? `/api/exports/${exportJobId}/` : null,
    {
      refreshInterval: (latest) => {
        if (!latest) return 2000;
        return latest.status === 'completed' || latest.status === 'failed' ? 0 : 2000;
      },
    },
  );

  const handleJobTerminal = useCallback(
    (job: ExportJob) => {
      if (job.status === 'completed' && job.download_url) {
        const downloadHref = job.download_url.startsWith('http')
          ? job.download_url
          : `${API_URL}${job.download_url}`;
        toast.show({
          message: `Export ready (${job.row_count ?? '?'} rows)`,
          variant: 'success',
          action: {
            label: 'Download',
            onClick: () => triggerDownload(downloadHref, buildExportFilename(job.id)),
          },
          durationMs: 10000,
        });
      } else if (job.status === 'failed') {
        const detail = typeof job.error === 'string' ? job.error : 'Export failed';
        toast.show({ message: detail, variant: 'error' });
      }
      setExportJobId(null);
      mutate('/api/exports/');
    },
    [toast],
  );

  useEffect(() => {
    if (!jobStatus) return;
    if (jobStatus.status === 'completed' || jobStatus.status === 'failed') {
      handleJobTerminal(jobStatus);
    }
  }, [jobStatus, handleJobTerminal]);

  const handleExportJobResponse = useCallback(
    (job: ExportJob) => {
      mutate('/api/exports/');
      if (job.status === 'completed' && job.download_url) {
        const href = job.download_url.startsWith('http')
          ? job.download_url
          : `${API_URL}${job.download_url}`;
        triggerDownload(href, buildExportFilename(job.id));
        toast.show({ message: `Export ready (${job.row_count ?? '?'} rows)`, variant: 'success' });
        return;
      }
      if (job.status === 'failed') {
        const detail = typeof job.error === 'string' ? job.error : 'Export failed';
        toast.show({ message: detail, variant: 'error' });
        return;
      }
      toast.show({ message: 'Preparing export… you can keep using the app.', variant: 'info' });
      setExportJobId(job.id);
    },
    [toast],
  );

  const handleExportBlobResponse = useCallback(
    async (res: Response) => {
      const blob = await res.blob();
      const filename =
        filenameFromContentDisposition(res.headers.get('Content-Disposition')) ??
        buildExportFilename(Date.now());
      downloadBlob(blob, filename);
      toast.show({ message: 'Export downloaded.', variant: 'success' });
      mutate('/api/exports/');
    },
    [toast],
  );

  async function onExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const filterParams = collectFilterParams(filters);
      // The export endpoint has two shapes:
      //   1) text/csv body (small/sync datasets) → download directly
      //   2) application/json ExportJob (async/large) → start polling
      const res = await fetch(`${API_URL}/api/exports/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter_params: filterParams }),
      });
      if (!res.ok) throw new ApiError(res.status, await readErrorDetail(res));

      const contentType = res.headers.get('Content-Type') ?? '';
      if (contentType.includes('application/json')) {
        handleExportJobResponse(await res.json());
      } else {
        await handleExportBlobResponse(res);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.show({ message: `Export failed: ${msg}`, variant: 'error' });
    } finally {
      setExporting(false);
    }
  }

  const isPolling = exportJobId !== null;
  const exportBusy = exporting || isPolling;

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Pages</h2>
        <button
          disabled={exportBusy}
          onClick={onExport}
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded disabled:opacity-50"
        >
          {(() => {
            if (exporting) return 'Starting…';
            if (isPolling) return 'Preparing…';
            return 'Export CSV';
          })()}
        </button>
      </div>
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
      <PagesResult
        data={data}
        isLoading={isLoading}
        error={error}
        hasAnyFilter={hasAnyFilter}
        userInteracted={userInteracted}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} data={data} onChange={setPage} />
    </Layout>
  );
}

function PagesResult({
  data,
  isLoading,
  error,
  hasAnyFilter,
  userInteracted,
}: Readonly<{
  data: Paginated<PageSummary> | undefined;
  isLoading: boolean;
  error: Error | undefined;
  hasAnyFilter: boolean;
  userInteracted: boolean;
}>) {
  if (error) return <div className="text-red-600 text-sm">Failed to load: {error.message}</div>;
  if (isLoading && !data) return <SkeletonTable rows={8} cols={5} />;
  if (!data) return null;

  if (data.results.length === 0) {
    // Distinguish initial state from a search/filter that returned nothing.
    const empty = hasAnyFilter || userInteracted
      ? 'No pages match these filters.'
      : 'No pages yet. Adjust filters or wait for the crawler to populate this view.';
    return <div className="text-gray-500 py-8 text-center">{empty}</div>;
  }

  return (
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
  );
}
