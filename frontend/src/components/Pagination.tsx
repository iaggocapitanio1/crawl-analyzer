import type { Paginated } from '@/types/api';

interface Props {
  page: number;
  pageSize: number;
  data: Pick<Paginated<unknown>, 'count' | 'next' | 'previous'> | undefined;
  onChange: (page: number) => void;
}

export default function Pagination({ page, pageSize, data, onChange }: Readonly<Props>) {
  if (!data || data.count === 0) return null;

  const totalPages = Math.max(1, Math.ceil(data.count / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, data.count);

  return (
    <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
      <div>
        {from}–{to} of {data.count.toLocaleString()}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={!data.previous}
          className="border border-gray-300 rounded px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Previous
        </button>
        <span className="tabular-nums">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={!data.next}
          className="border border-gray-300 rounded px-3 py-1 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
