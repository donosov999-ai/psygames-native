import { SUPABASE_PUBLISHABLE_KEY } from '@/src/services/supabase';

type Route = 'direct' | 'relay';
type Host = {
  __psyNativeFeedbackShot?: boolean;
  __psyFeedbackShotResult?: (id: string, outcome: string) => void;
  PsyBridge?: { postMessage: (message: string) => void };
};

export function feedbackUploadId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const pending = new Map<string, (result: string | null) => void>();

/** null means no native request was started; the legacy upload may proceed. */
export function uploadNativeFeedbackShot(
  route: Route, path: string, blob: Blob, timeoutMs: number,
): Promise<string | null> {
  const host = typeof window === 'undefined' ? undefined : window as unknown as Host;
  if (!host?.__psyNativeFeedbackShot || !host.PsyBridge ||
      !/^[A-Za-z0-9_-]+$/.test(SUPABASE_PUBLISHABLE_KEY ?? '') ||
      !blob.size || blob.size > 4 * 1024 * 1024 || typeof FileReader === 'undefined') {
    return Promise.resolve(null);
  }
  const id = feedbackUploadId();
  host.__psyFeedbackShotResult = (requestId, result) => pending.get(requestId)?.(result);
  return new Promise((resolve) => {
    const reader = new FileReader();
    let posted = false;
    const settle = (outcome: string | null) => {
      if (!pending.delete(id)) return;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      settle(posted ? 'timeout' : null);
      if (reader.readyState === FileReader.LOADING) reader.abort();
    }, timeoutMs + 1500);
    pending.set(id, settle);
    reader.onload = () => {
      if (!pending.has(id)) return;
      const data = typeof reader.result === 'string' ? reader.result : '';
      const separator = data.indexOf(';base64,');
      if (separator < 0) { settle(null); return; }
      try {
        host.PsyBridge!.postMessage(JSON.stringify({
          op: 'feedbackShotUpload', id, path, bytes: data.slice(separator + 8),
          base: route, key: SUPABASE_PUBLISHABLE_KEY, timeoutMs,
        }));
        posted = true;
      } catch {
        settle(null);
      }
    };
    reader.onerror = reader.onabort = () => settle(null);
    try { reader.readAsDataURL(blob); } catch { settle(null); }
  });
}
