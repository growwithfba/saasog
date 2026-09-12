/** `wide` matches the page body's width, so the footer lines up with the nav
 *  and content above it on the full-window app pages. Marketing pages keep
 *  the 1280px column. */
export function Footer({ wide = false }: { wide?: boolean }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-gray-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
      <div className={`mx-auto px-4 sm:px-6 lg:px-8 py-6 ${wide ? 'max-w-none' : 'max-w-7xl'}`}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Left side - Copyright */}
          <div className="text-sm text-gray-600 dark:text-slate-400">
            © {currentYear} BloomEngine AI. All rights reserved.
          </div>

          {/* Right side - Links */}
          <div className="flex items-center gap-6">
            <a
              href="/terms"
              className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 transition-colors"
            >
              Terms
            </a>
            <a
              href="/privacy"
              className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 transition-colors"
            >
              Privacy
            </a>
            <a
              href="/support"
              className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 transition-colors"
            >
              Support
            </a>
            <a
              href="https://www.skool.com/growwithfba/about"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 transition-colors"
            >
              Community
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
