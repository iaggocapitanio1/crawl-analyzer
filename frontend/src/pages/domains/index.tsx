import { useEffect, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import Layout from '@/components/Layout';
import DataTable from '@/components/DataTable';
import Pagination from '@/components/Pagination';
import { SkeletonTable } from '@/components/Skeleton';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import type { Paginated, Domain } from '@/types/api';

const PAGE_SIZE = 50;

export default function DomainsList() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const params = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
  if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());

  const { data, error, isLoading } = useSWR<Paginated<Domain>>(
    `/api/domains/?${params.toString()}`,
  );

  return (
    <Layout>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Domains</h2>
        <input
          className="border border-gray-300 rounded px-3 py-1.5 w-64 text-sm"
          placeholder="Filter by host"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <DomainsResult data={data} isLoading={isLoading} error={error} search={debouncedSearch} />
      <Pagination page={page} pageSize={PAGE_SIZE} data={data} onChange={setPage} />
    </Layout>
  );
}

function DomainsResult({
  data,
  isLoading,
  error,
  search,
}: Readonly<{
  data: Paginated<Domain> | undefined;
  isLoading: boolean;
  error: Error | undefined;
  search: string;
}>) {
  if (error) return <div className="text-red-600 text-sm">Failed to load: {error.message}</div>;
  if (isLoading && !data) return <SkeletonTable rows={8} cols={4} />;
  if (!data) return null;

  if (data.results.length === 0) {
    const msg = search ? `No domains matching "${search}".` : 'No domains tracked yet.';
    return <div className="text-gray-500 py-8 text-center">{msg}</div>;
  }

  return (
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
  );
}
