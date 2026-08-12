import type { GameDefinition, GameResultData, PlatformId } from '../types';

const DOWNLOAD_PAGE_URL = 'https://psy-games.pro/download/';

export function detectPlatform(): PlatformId {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get('platform');
  if (forced === 'tg' || forced === 'telegram') return 'telegram';
  if (forced === 'vk') return 'vk';
  if (forced === 'ok') return 'ok';
  if (forced === 'fb' || forced === 'facebook') return 'facebook';
  if (window.Telegram?.WebApp) return 'telegram';
  return 'web';
}

export function initPlatform() {
  window.Telegram?.WebApp?.ready?.();
  window.Telegram?.WebApp?.expand?.();
}

export function buildChallengeUrl(game: GameDefinition, result: GameResultData, platform: PlatformId): string {
  const url = new URL(window.location.href);
  url.pathname = `/mini/${game.slug}/`;
  url.search = '';
  url.searchParams.set('challenge', String(result.challengeValue ?? result.score));
  url.searchParams.set('from', platform);
  return url.toString();
}

export async function shareResult(game: GameDefinition, result: GameResultData, platform: PlatformId): Promise<'shared' | 'copied'> {
  const url = buildChallengeUrl(game, result, platform);
  const text = `${result.shareText}\n${url}`;
  if (navigator.share) {
    await navigator.share({ title: game.name, text: result.shareText, url });
    return 'shared';
  }
  await navigator.clipboard.writeText(text);
  return 'copied';
}

export function buildPsyGamesUrl(game: GameDefinition, platform: PlatformId): string {
  const url = new URL(DOWNLOAD_PAGE_URL);
  url.searchParams.set('utm_source', platform);
  url.searchParams.set('utm_medium', 'miniapp');
  url.searchParams.set('utm_campaign', game.slug);
  return url.toString();
}

export function exitMiniApp() {
  if (window.Telegram?.WebApp?.close) window.Telegram.WebApp.close();
  else window.location.assign('/mini/');
}
