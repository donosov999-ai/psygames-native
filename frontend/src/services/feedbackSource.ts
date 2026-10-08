/** Экран и его параметры по адресу (`/games/x?mode=y` → `/games/x` и `{ mode: 'y' }`). */
export function sourceOfRoute(route: string) {
  const url = new URL(route, 'https://local.invalid');
  return { screen: url.pathname, params: Object.fromEntries(url.searchParams.entries()) as Record<string, string> };
}

/** Keep the original native screen when opening the shared feedback form. */
export function feedbackSource(pathname: string, source: unknown) {
  if (pathname !== '/feedback' || typeof source !== 'string' || !source.startsWith('/games/')) {
    return { screen: pathname, params: {} as Record<string, string> };
  }
  return sourceOfRoute(source);
}
