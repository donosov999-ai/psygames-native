import { sendFeedback } from '@/src/services/appFeedback';
import { uploadNativeFeedbackShot } from '@/src/services/nativeFeedbackShot';

const mockInsert = jest.fn().mockResolvedValue({ error: null });
const mockUpload = jest.fn();
const mockAltUpload = jest.fn();
const mockClient = {
  storage: { from: () => ({ upload: mockUpload }) },
  from: () => ({ insert: mockInsert }),
};
const mockAltClient = { storage: { from: () => ({ upload: mockAltUpload }) } };

jest.mock('@/src/services/supabase', () => ({
  getSupabase: () => mockClient,
  altSupabase: () => mockAltClient,
  altBaseName: () => 'relay',
  supabaseNetInfo: () => ({ base: 'direct', how: 'direct' }),
}));
jest.mock('@/src/services/nativeFeedbackShot', () => ({
  uploadNativeFeedbackShot: jest.fn(),
  feedbackUploadId: () => 'a'.repeat(32),
}));
jest.mock('@/src/services/crumbs', () => ({ readCrumbs: async () => [], readConsoleErrors: async () => [] }));

const native = jest.mocked(uploadNativeFeedbackShot);
const shot = new Blob(['shot'], { type: 'image/jpeg' });
const send = () => sendFeedback({ kind: 'bug', message: 'Скриншот при отправке', shot });

beforeEach(() => {
  jest.clearAllMocks();
  native.mockReset();
  mockUpload.mockReset();
  mockAltUpload.mockReset();
});

it('iOS: native acknowledgement attaches the screenshot without WebView upload or duplicate insert', async () => {
  native.mockResolvedValueOnce('ok');
  expect((await send()).ok).toBe(true);
  const [, path] = native.mock.calls[0];
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockAltUpload).not.toHaveBeenCalled();
  expect(native).toHaveBeenCalledTimes(1);
  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(mockInsert.mock.calls[0][0]).toMatchObject({ shot_path: path, context: { shot_up: 'ok', shot_transport: 'native' } });
});

it('a lost acknowledgement and exact storage conflict yield one report with the original screenshot', async () => {
  native.mockResolvedValueOnce('timeout').mockResolvedValueOnce('err:KeyAlreadyExists');
  expect((await send()).ok).toBe(true);
  const [, path] = native.mock.calls[0];
  expect(native.mock.calls.map(([route, name]) => [route, name])).toEqual([['direct', path], ['relay', path]]);
  expect(mockUpload).not.toHaveBeenCalled();
  expect(mockAltUpload).not.toHaveBeenCalled();
  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(mockInsert.mock.calls[0][0]).toMatchObject({
    shot_path: path, context: { shot_up: 'ok-relay-exists', shot_transport: 'native' },
  });
});

it('without the iOS bridge the SDK accepts the structured duplicate code, not the message text', async () => {
  native.mockResolvedValue(null);
  mockUpload.mockResolvedValueOnce({ error: { message: 'Load failed' } });
  mockAltUpload.mockResolvedValueOnce({ error: { statusCode: 'KeyAlreadyExists', message: 'storage conflict' } });
  expect((await send()).ok).toBe(true);
  const [path] = mockUpload.mock.calls[0];
  expect(mockAltUpload.mock.calls[0][0]).toBe(path);
  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(mockInsert.mock.calls[0][0]).toMatchObject({
    shot_path: path, context: { shot_up: 'ok-relay-exists', shot_transport: 'web' },
  });
});

it.each(['err:http-409', 'timeout'])('does not attach an unconfirmed file (%s)', async (outcome) => {
  native.mockResolvedValueOnce('timeout').mockResolvedValueOnce(outcome);
  expect((await send()).ok).toBe(true);
  expect(mockInsert).toHaveBeenCalledTimes(1);
  expect(mockInsert.mock.calls[0][0]).toMatchObject({
    shot_path: null, context: { shot_up: `timeout → relay:${outcome}` },
  });
});
