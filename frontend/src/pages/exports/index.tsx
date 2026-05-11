import useSWR from 'swr';
import Layout from '@/components/Layout';
import DataTable from '@/components/DataTable';
import type { Paginated, ExportJob } from '@/types/api';

export default function ExportsList() {
  const { data, isLoading } = useSWR<Paginated<ExportJob>>('/api/exports/');

  return (
    <Layout>
      <h2 className="text-xl font-semibold mb-4">Exports</h2>
      <p className="text-sm text-gray-600 mb-4">
        Exports are triggered from the Pages view. This page lists completed exports for re-download.
      </p>
      {isLoading && <div className="text-gray-500">Loading…</div>}
      {data && data.results.length === 0 && (
        <div className="text-gray-500">No exports yet.</div>
      )}
      {data && data.results.length > 0 && (
        <DataTable
          rowKey={(j) => j.id}
          rows={data.results}
          columns={[
            { key: 'id', header: 'ID', render: (j) => j.id },
            { key: 'status', header: 'Status', render: (j) => j.status },
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
      )}
    </Layout>
  );
}
