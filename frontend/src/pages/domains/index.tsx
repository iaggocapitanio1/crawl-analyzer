import useSWR from 'swr';
import Link from 'next/link';
import Layout from '@/components/Layout';
import DataTable from '@/components/DataTable';
import type { Paginated, Domain } from '@/types/api';

export default function DomainsList() {
  const { data, error, isLoading } = useSWR<Paginated<Domain>>('/api/domains/');

  return (
    <Layout>
      <h2 className="text-xl font-semibold mb-4">Domains</h2>
      {isLoading && <div className="text-gray-500">Loading…</div>}
      {error && <div className="text-red-600">{error.message}</div>}
      {data && (
        <DataTable
          rowKey={(d) => d.id}
          rows={data.results}
          columns={[
            {
              key: 'host',
              header: 'Host',
              render: (d) => (
                <Link href={`/domains/${d.id}`} className="text-blue-600 hover:underline">
                  {d.host}
                </Link>
              ),
            },
            { key: 'tld', header: 'TLD', render: (d) => d.tld },
            { key: 'pages', header: 'Pages tracked', render: (d) => d.page_count },
            {
              key: 'first',
              header: 'First seen',
              render: (d) => new Date(d.first_seen_at).toLocaleDateString(),
            },
          ]}
        />
      )}
    </Layout>
  );
}
