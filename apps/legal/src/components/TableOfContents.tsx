export interface TocItem {
  id: string;
  title: string;
}

export function TableOfContents({ items }: { items: TocItem[] }) {
  return (
    <nav
      className="no-print sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block"
      aria-label="Table of contents"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
        On this page
      </p>
      <ol className="space-y-1.5 border-l border-slate-200 text-sm">
        {items.map((item, i) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="block border-l-2 border-transparent py-0.5 pl-3 text-slate-600 transition-colors hover:border-seafoam-400 hover:text-seafoam-700 focus-visible:border-seafoam-600 focus-visible:text-seafoam-700 focus-visible:outline-none"
            >
              {i + 1}. {item.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
