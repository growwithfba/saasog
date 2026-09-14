/** `wide` matches the page body's width, so the footer lines up with the nav
 *  and content above it on the full-window app pages. Marketing pages keep
 *  the 1280px column. */
export function Footer({ wide = false, tone = 'auto' }: { wide?: boolean; tone?: 'auto' | 'dark' }) {
  const currentYear = new Date().getFullYear();
  // The auth pages are always dark whatever the member's theme, so their
  // footer must be too — otherwise a light footer sits under a dark page.
  const dark = tone === 'dark';
  const shell = dark
    ? 'border-slate-800 bg-slate-900/50'
    : 'border-[#1e3a8a]/[0.12] dark:border-slate-800 bg-white/50 dark:bg-slate-900/50';
  const link = dark
    ? 'text-slate-400 hover:text-slate-200'
    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200';
  const copy = dark ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400';

  return (
    <footer className={`mt-auto border-t backdrop-blur-sm ${shell}`}>
      <div className={`mx-auto px-4 sm:px-6 lg:px-8 py-6 ${wide ? 'max-w-none' : 'max-w-7xl'}`}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left side - Copyright */}
          <div className={`text-sm ${copy}`}>
            © {currentYear} BloomEngine AI. All rights reserved.
          </div>

          {/* Right side - Links */}
          <div className="flex items-center gap-6">
            <a
              href="/terms"
              className={`text-sm transition-colors ${link}`}
            >
              Terms
            </a>
            <a
              href="/privacy"
              className={`text-sm transition-colors ${link}`}
            >
              Privacy
            </a>
            <a
              href="/support"
              className={`text-sm transition-colors ${link}`}
            >
              Support
            </a>
            <a
              href="https://www.skool.com/growwithfba/about"
              target="_blank"
              rel="noopener noreferrer"
              className={`text-sm transition-colors ${link}`}
            >
              Community
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
