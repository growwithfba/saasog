'use client';

interface PageTitleBlockProps {
  title: string;
  subtitle?: string;
}

export function PageTitleBlock({ title, subtitle }: PageTitleBlockProps) {
  return (
    <div className="mb-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white leading-tight">{title}</h1>
      {subtitle ? <p className="text-gray-600 dark:text-slate-400 mt-2">{subtitle}</p> : null}
      <div className="mt-4 h-0.5 w-24 bg-gradient-to-r from-blue-500 to-emerald-500 rounded-full" />
    </div>
  );
}


