/** Keep the original native screen when opening the shared feedback form. */
export function feedbackSource(pathname: string, source: unknown) {
  if (pathname !== '/feedback' || typeof source !== 'string' || !source.startsWith('/games/')) {
    return { screen: pathname, params: {} as Record<string, string> };
  }
  const url = new URL(source, 'https://local.invalid');
  return { screen: url.pathname, params: Object.fromEntries(url.searchParams.entries()) };
}
