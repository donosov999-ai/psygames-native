/** Preserve a home query through the web → native catalog transition. */
export function catalogSearchRoute(query: string): string {
  const value = query.trim();
  return value ? `/games?search=${encodeURIComponent(value)}` : '/games';
}
