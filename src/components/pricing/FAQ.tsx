'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { FAQ_ITEMS } from '@/lib/pricing/faq';

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="mb-12 max-w-3xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Frequently asked questions</h2>
        <p className="text-slate-400">
          Still curious? Email{' '}
          <a
            href="mailto:support@bloomengine.ai"
            className="text-blue-400 hover:text-blue-300 transition-colors"
          >
            support@bloomengine.ai
          </a>
          .
        </p>
      </div>

      <div className="space-y-3">
        {FAQ_ITEMS.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div
              key={item.question}
              className="bg-slate-800/40 backdrop-blur-xl rounded-xl border border-slate-700/50 overflow-hidden transition-all"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-800/60 transition-colors"
                aria-expanded={isOpen}
              >
                <span className="text-white font-medium pr-4">{item.question}</span>
                <ChevronDown
                  className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-5 text-slate-300 text-sm leading-relaxed">
                  {item.answer}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
