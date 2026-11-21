/** @jest-environment jsdom */

import { uploadNativeFeedbackShot } from '@/src/services/nativeFeedbackShot';

jest.mock('@/src/services/supabase', () => ({
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_unit_test_dummy_key_00',
}));

type Host = {
  __psyNativeFeedbackShot?: boolean;
  __psyFeedbackShotResult?: (id: string, outcome: string) => void;
  PsyBridge?: { postMessage: (raw: string) => void };
};

const host = window as unknown as Host;
const blob = new Blob(['1234'], { type: 'image/jpeg' });
const path = `2026-11-21/${'b'.repeat(32)}.jpg`;

afterEach(() => {
  delete host.__psyNativeFeedbackShot;
  delete host.__psyFeedbackShotResult;
  delete host.PsyBridge;
});

it('posts only with the iOS capability and joins the result on request ID', async () => {
  host.PsyBridge = { postMessage: jest.fn() };
  expect(await uploadNativeFeedbackShot('relay', path, blob, 1000)).toBeNull();
  expect(host.PsyBridge.postMessage).not.toHaveBeenCalled();
  host.__psyNativeFeedbackShot = true;
  const request = new Promise<Record<string, string>>((resolve) => {
    host.PsyBridge = { postMessage: (raw) => resolve(JSON.parse(raw)) };
  });
  let settled = false;
  const result = uploadNativeFeedbackShot('relay', path, blob, 1000).then((r) => {
    settled = true;
    return r;
  });
  const frame = await request;
  expect(frame).toMatchObject({ op: 'feedbackShotUpload', base: 'relay', path, bytes: 'MTIzNA==', timeoutMs: 1000 });
  expect(frame.id).toMatch(/^[0-9a-f]{32}$/);
  host.__psyFeedbackShotResult!('c'.repeat(32), 'ok');
  await Promise.resolve();
  expect(settled).toBe(false);
  host.__psyFeedbackShotResult!(frame.id, 'err:KeyAlreadyExists');
  expect(await result).toBe('err:KeyAlreadyExists');
});
