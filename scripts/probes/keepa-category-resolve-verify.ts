/**
 * Verify the new category-resolution path for B0095UVKRI.
 * Should output: Automotive (not Health & Household).
 */
import * as fs from 'fs';
import * as path from 'path';

try {
  const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch {}

const KEEPA_BASE_URL = 'https://api.keepa.com';

async function resolveCategoryNameForBsr(apiKey: string, domain: number, catId: number) {
  const url = `${KEEPA_BASE_URL}/category?key=${apiKey}&domain=${domain}&category=${catId}&parents=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Keepa /category ${res.status}`);
  const data = await res.json();
  const cats = data.categories || {};
  const path: string[] = [];
  const visited = new Set<number>();
  let currentId: number | null = catId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const node: any = cats[String(currentId)];
    if (!node) break;
    if (typeof node.name === 'string' && node.name) path.unshift(node.name);
    currentId = typeof node.parent === 'number' && node.parent !== 0 ? node.parent : null;
  }
  return { rootName: path[0] || null, path };
}

async function main() {
  const apiKey = process.env.KEEPA_API_KEY!;
  // From earlier probe: salesRankReference for B0095UVKRI = 15684181
  const resolved = await resolveCategoryNameForBsr(apiKey, 1, 15684181);
  console.log('B0095UVKRI (Bacon Air Freshener) BSR-category resolution:');
  console.log('  Root name:', resolved.rootName);
  console.log('  Full path:', resolved.path.join(' > '));
  console.log('');
  console.log('Expected: Root="Automotive" (matches Amazon BSR breakdown)');
  console.log('Was previously: "Health & Household" (incorrect, from categoryTree[0])');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
