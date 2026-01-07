'use client';

interface PageTitleBlockProps {
  title: string;
  subtitle?: string;
  page?: 'offer' | 'sourcing';
}

export function PageTitleBlock({ title, subtitle, page }: PageTitleBlockProps) {
  const borderColor = page === 'offer' ? 'border-orange-500' : 'border-blue-500';
  return (
    <div className="mb-8">
      <h1 className={`text-3xl font-bold text-gray-900 dark:text-white mb-2 pb-2 leading-tight border-b-2 ${borderColor}`}>{title}</h1>
      {subtitle ? <p className="text-gray-700 dark:text-slate-400 mt-2">{subtitle}</p> : null}
    </div>
  );
}


