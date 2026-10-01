/**
 * 🔴 СООБЩЕНИЯ ВЕБА ДОХОДЯТ ДО ОБОЛОЧКИ И НА ANDROID (01.10.2026, Play 2.56.3 на эмуляторе).
 *
 * На Android мост `PsyBridge` — Java-объект WebView (`addJavascriptInterface`): его метод,
 * вынутый из объекта и вызванный отдельно, бросает исключение. `postToHost` так и звал —
 * и молча возвращал false. Нативный экран выбора зарядки ждал модель вечно (бесконечный
 * индикатор на вкладке «Workout»), переход между нативными шагами уходил в веб.
 * Подставной мост ниже ведёт себя как Android: без «своего» объекта — исключение.
 */
import { postToHost } from '@/src/services/hostWarmup';
import { postUiModel } from '@/src/services/warmupUi';

type Bridge = { postMessage: (s: string) => void };
const g = globalThis as unknown as { PsyBridge?: Bridge; __psyHostNativeRoutes?: unknown };

describe('мост в оболочку — вызов на самом объекте моста', () => {
  const sent: string[] = [];

  beforeEach(() => {
    sent.length = 0;
    const bridge: Bridge = {
      postMessage(this: unknown, s: string) {
        // Как Java-мост Android: метод работает только на своём объекте.
        if (this !== bridge) throw new TypeError("Java bridge method can't be invoked on a non-injected object");
        sent.push(s);
      },
    };
    g.PsyBridge = bridge;
    g.__psyHostNativeRoutes = ['/warmup-picker', '/warmup-complete', '/warmup-bridge'];
  });

  afterEach(() => {
    delete g.PsyBridge;
    delete g.__psyHostNativeRoutes;
  });

  it('🔴 postToHost доставляет сообщение мосту-«Java-объекту»', () => {
    expect(postToHost({ op: 'ping' })).toBe(true);
    expect(sent.map((s) => JSON.parse(s))).toEqual([{ op: 'ping' }]);
  });

  it('🔴 модель экрана выбора зарядки уходит в оболочку', () => {
    expect(postUiModel('picker', { title: 'Workout' })).toBe(true);
    expect(JSON.parse(sent[0]!)).toEqual({ op: 'warmupUi', screen: 'picker', model: { title: 'Workout' } });
  });

  it('моста нет — false, без исключения', () => {
    delete g.PsyBridge;
    expect(postToHost({ op: 'ping' })).toBe(false);
  });
});
