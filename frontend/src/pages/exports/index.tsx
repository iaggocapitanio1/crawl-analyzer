import { useState } from 'react';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import DataTable from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { SkeletonTable } from '@/components/Skeleton';
import type { Paginated, ExportJob } from '@/types/api';

const PAGE_SIZE = 50;

const STATUS_STYLES: Record<ExportJob['status'], string> = {
  pending: 'text-gray-600',
  running: 'text-blue-600',
  completed: 'text-green-700',
  failed: 'text-red-600',
};

export default function ExportsList() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useSWR<Paginated<ExportJob>>(
    `/api/exports/?page=${page}&page_size=${PAGE_SIZE}`,
    {
      refreshInterval: (latest) => {
        const active = latest?.results.some((j) => j.status === 'pending' || j.status === 'running');
        return active ? 2000 : 0;
      },
    },
  );

  return (
    <Layout>
      <h2 className="text-xl font-semibold mb-4">Exports</h2>
      <p className="text-sm text-gray-600 mb-4">
        Exports are triggered from the Pages view. This page lists completed exports for re-download.
      </p>
      <ExportsResult data={data} isLoading={isLoading} error={error} />
      <Pagination page={page} pageSize={PAGE_SIZE} data={data} onChange={setPage} />
    </Layout>
  );
}

function ExportsResult({
  data,
  isLoading,
  error,
}: Readonly<{
  data: Paginated<ExportJob> | undefined;
  isLoading: boolean;
  error: Error | undefined;
}>) {
  if (error) return <div className="text-red-600 text-sm">Failed to load: {error.message}</div>;
  if (isLoading && !data) return <SkeletonTable rows={5} cols={5} />;
  if (!data) return null;
  if (data.results.length === 0) {
    return <div className="text-gray-500">No exports yet.</div>;
  }

  return (
    <DataTable
      rowKey={(j) => j.id}
      rows={data.results}
      columns={[
        { key: 'id', header: 'ID', render: (j) => j.id },
        {
          key: 'status',
          header: 'Status',
          render: (j) => <span className={STATUS_STYLES[j.status]}>{j.status}</span>,
        },
        { key: 'rows', header: 'Rows', render: (j) => j.row_count ?? '—' },
        {
          key: 'created',
          header: 'Created',
          render: (j) => new Date(j.created_at).toLocaleString(),
        },
        {
          key: 'download',
          header: '',
          render: (j) =>
            j.download_url ? (
              <a className="text-blue-600 hover:underline" href={j.download_url}>
                Download
              </a>
            ) : null,
        },
      ]}
    />
  );
}
