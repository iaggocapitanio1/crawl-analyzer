import React, { ReactNode } from 'react';

interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
}

export default function DataTable<T>({ columns, rows, rowKey }: DataTableProps<T>) {
  return (
    <table className="min-w-full bg-white border border-gray-200 rounded-md shadow-sm">
      <thead className="bg-gray-50 text-gray-700 text-sm">
        <tr>
          {columns.map((c) => (
            <th key={c.key} className={`text-left px-4 py-2 font-semibold border-b ${c.className || ''}`}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className="border-b last:border-0 hover:bg-gray-50 text-sm">
            {columns.map((c) => (
              <td key={c.key} className={`px-4 py-2 ${c.className || ''}`}>
                {c.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
