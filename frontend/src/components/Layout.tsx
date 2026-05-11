import React, { ReactNode } from 'react';
import Link from 'next/link';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-gray-800 text-white p-6">
        <h2 className="text-2xl font-bold mb-8">SearchAtlas</h2>
        <nav>
          <ul>
            <li className="mb-4">
              <Link href="/" className="hover:text-gray-300">Dashboard</Link>
            </li>
            <li className="mb-4">
              <Link href="/domains" className="hover:text-gray-300">Domains</Link>
            </li>
            <li className="mb-4">
              <Link href="/pages" className="hover:text-gray-300">Pages</Link>
            </li>
            <li className="mb-4">
              <Link href="/exports" className="hover:text-gray-300">Exports</Link>
            </li>
          </ul>
        </nav>
      </aside>
      <main className="flex-1 bg-gray-100 p-8 text-gray-900">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">Crawl Analyzer</h1>
        </header>
        <section>{children}</section>
      </main>
    </div>
  );
}
