/**
 * Text list parsing and formatting utilities
 * Used for parsing review insights into structured lists
 */

/**
 * Parse text into lines, removing empty lines and normalizing
 */
export function parseLines(value: string): string[] {
  if (!value || !value.trim()) return [];
  
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Normalize a line by removing numbering or bullet prefixes
 */
export function normalizeLine(line: string): string {
  // Remove numbered prefix (1. 2. 3. etc.)
  line = line.replace(/^\d+\.\s*/, '');
  // Remove bullet prefix (-, *, •, etc.)
  line = line.replace(/^[-*•]\s*/, '');
  return line.trim();
}

/**
 * Check if lines appear to be a numbered list
 */
export function isNumberedList(lines: string[]): boolean {
  if (lines.length === 0) return false;
  
  // Check if at least 50% of lines start with numbers
  const numberedCount = lines.filter(line => /^\d+\.\s*/.test(line)).length;
  return numberedCount >= Math.ceil(lines.length * 0.5);
}

/**
 * Extract keywords/tags from a line (simple heuristic)
 */
export function extractKeywords(line: string, maxKeywords: number = 2): string[] {
  // Remove common stopwords and short words
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'must', 'can', 'this',
    'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their'
  ]);
  
  // Extract words (3+ characters, not stopwords)
  const words = line
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 3 && !stopwords.has(word));
  
  // Return longest words up to maxKeywords
  return words
    .sort((a, b) => b.length - a.length)
    .slice(0, maxKeywords)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1));
}

/**
 * Format lines as a numbered list
 */
export function formatAsNumbered(lines: string[]): string {
  return lines
    .map((line, index) => {
      const normalized = normalizeLine(line);
      return `${index + 1}. ${normalized}`;
    })
    .join('\n');
}

/**
 * Format lines as a bullet list
 */
export function formatAsBullets(lines: string[]): string {
  return lines
    .map(line => {
      const normalized = normalizeLine(line);
      return `- ${normalized}`;
    })
    .join('\n');
}

/**
 * Format text into consistent bullets (conservative - doesn't rewrite meaning)
 */
export function formatText(text: string): string {
  if (!text || !text.trim()) return text;
  
  const lines = parseLines(text);
  if (lines.length === 0) return text;
  
  // If it's already a numbered list, keep it numbered
  if (isNumberedList(lines)) {
    return formatAsNumbered(lines);
  }
  
  // Otherwise, format as bullets
  return formatAsBullets(lines);
}

/**
 * Split a line into theme fragment and detail explanation
 * Theme: first 1-3 words (typically 2 words)
 * Detail: remaining words
 * Returns { theme, detail } where detail may be empty for short lines
 */
export function splitTheme(line: string): { theme: string; detail: string } {
  const normalized = normalizeLine(line);
  const words = normalized.split(/\s+/).filter(w => w.length > 0);
  
  // If line is very short (<= 3 words), treat entire line as theme
  if (words.length <= 3) {
    return { theme: normalized, detail: '' };
  }
  
  // Use 2 words for theme (or 1 if only 2 words total)
  const themeWordsCount = words.length === 2 ? 1 : 2;
  const theme = words.slice(0, themeWordsCount).join(' ');
  const detail = words.slice(themeWordsCount).join(' ');
  
  return { theme, detail };
}
