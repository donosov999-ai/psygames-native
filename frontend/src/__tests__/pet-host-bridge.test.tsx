/* eslint-disable @typescript-eslint/no-require-imports -- компонент и сервисы берутся ПОСЛЕ
 * подмен и сброса модулей, как в pet-greeting-reaches-screen. */
/**
 * 🔴 НАТИВНЫЙ ГУЛЯКА СПРАШИВАЕТ ВЕБ, А НЕ ДЕРЖИТ ВТОРУЮ КОПИЮ (задачи 99628ecf, 5136754e).
 *
 * С 07.10.2026 вкладку «Игры» рисует Flutter, страница со своим питомцем скрыта под ней.
 * Оболочка ходит и листает кадры сама, а облик, реплики и встречу берёт мостом `__psyPet`.
 * Здесь проверяется, что мост отдаёт ТО ЖЕ, что рисует и говорит веб:
 *   · описание кадров совпадает с тем, что рисует `PetSprite`, вплоть до места вещи;
 *   · `config` несёт все состояния, которые гуляка зовёт (ходьба, покой, сон, мелочи);
 *   · на вкладке, которую рисует оболочка, веб-гуляка молчит и встречу не тратит —
 *     её показывает нативный, спросив `first`.
 */
jest.mock('expo-router', () => ({
  usePathname: () => (globalThis as any).__probePath ?? '/',
  router: { push: () => {}, canGoBack: () => false, back: () => {}, replace: () => {} },
}));

const МЕТРИК = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

const назад = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

describe('описание кадров для оболочки — то же, что рисует PetSprite', () => {
  it('🔴 кадры, такт и место вещи совпадают с отрисованным', () => {
    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { Image } = require('react-native');
    const sprite = require('@/src/components/pet/PetSprite');
    const SIZE = 100;
    for (const state of ['idle', 'walk', 'wave', 'sleepcurl']) {
      const spec = sprite.petRenderSpec('cat', state, 'party_hat', null);
      let r: any;
      TestRenderer.act(() => {
        r = TestRenderer.create(React.createElement(sprite.default, { state, size: SIZE, skin: 'cat', accessory: 'party_hat' }));
      });
      const imgs = r.root.findAllByType(Image);
      // Кадры питомца + одна картинка вещи на кадре 0 (если вещь там есть).
      const вещь0 = spec.accessory?.boxes[0];
      const кадры = imgs.slice(0, imgs.length - (вещь0 ? 1 : 0));
      expect([state, spec.kind, spec.frames, spec.uris.length]).toEqual([state, 'frames', кадры.length, кадры.length]);
      expect(spec.uris.every((u: string) => u.length > 0)).toBe(true);
      expect(spec.uris).toEqual(кадры.map((i: any) => i.props.source.testUri));
      expect(spec.tickMs).toBeGreaterThanOrEqual(60);
      expect(spec.accessory?.boxes.length).toBe(spec.frames);
      if (вещь0) {
        const обёртка = imgs[imgs.length - 1].parent;
        const st = [].concat(обёртка.props.style).reduce((a: any, b: any) => ({ ...a, ...b }), {});
        expect([Math.round(st.left), Math.round(st.top), Math.round(st.width)])
          .toEqual([Math.round(вещь0.left * SIZE), Math.round(вещь0.top * SIZE), Math.round(вещь0.size * SIZE)]);
      }
      TestRenderer.act(() => r.unmount());
    }
  });

  it('на кадре, где якорь мимо силуэта, вещи нет и в описании', () => {
    const sprite = require('@/src/components/pet/PetSprite');
    let нашлось = 0;
    for (const state of sprite.PET_SLEEP_POSES) {
      const spec = sprite.petRenderSpec('cat', state, 'party_hat', null);
      spec.accessory.boxes.forEach((b: any, i: number) => {
        const off = sprite.petAnchorOff('cat', state, i).includes('head_top');
        expect([state, i, b === null]).toEqual([state, i, off]);
        if (off) нашлось += 1;
      });
    }
    expect(нашлось).toBeGreaterThan(0); // иначе проба не проверяет ветку «вещи нет»
  });
});

describe('мост __psyPet', () => {
  it('🔴 config несёт все состояния гуляки и его числа', async () => {
    jest.resetModules();
    const { petHostAnswer, PET_WALK } = require('@/src/components/pet/WalkingPet');
    const { PET_SLEEP_POSES } = require('@/src/components/pet/PetSprite');
    const c: any = await petHostAnswer('config');
    for (const st of ['walk', 'idle', 'wave', 'jump', 'celebrate', ...PET_SLEEP_POSES, ...c.fidgets]) {
      expect([st, c.specs[st]?.frames > 0, c.cycles[st] > 0]).toEqual([st, true, true]);
    }
    expect(c.fidgets.length).toBeGreaterThan(0);
    expect(c.walk).toEqual(PET_WALK);
    expect(c.size).toBe(PET_WALK.size);
    expect(c.visible).toBe(true);
  });

  it('ответ уходит в оболочку сообщением petAnswer с тем же id', async () => {
    jest.resetModules();
    const sent: any[] = [];
    (globalThis as any).PsyBridge = { postMessage(s: string) { sent.push(JSON.parse(s)); } };
    try {
      const React = require('react');
      const TestRenderer = require('react-test-renderer');
      const { SafeAreaProvider } = require('react-native-safe-area-context');
      const { ThemeProvider } = require('@/src/contexts/ThemeContext');
      const { LanguageProvider } = require('@/src/contexts/LanguageContext');
      const { ProfileProvider } = require('@/src/contexts/ProfileContext');
      const WalkingPet = require('@/src/components/pet/WalkingPet').default;
      let r: any;
      await TestRenderer.act(async () => {
        r = TestRenderer.create(React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
          React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
            React.createElement(LanguageProvider, null, React.createElement(WalkingPet))))));
      });
      expect(typeof (globalThis as any).__psyPet?.ask).toBe('function');
      await TestRenderer.act(async () => { (globalThis as any).__psyPet.ask('q1', 'petted'); });
      await TestRenderer.act(async () => { await new Promise((ok) => setTimeout(ok, 0)); });
      const ответ = sent.find((m) => m.op === 'petAnswer' && m.id === 'q1');
      expect(typeof ответ?.data?.text).toBe('string');
      expect(ответ.data.text.length).toBeGreaterThan(0);
      await TestRenderer.act(async () => { r.unmount(); });
    } finally {
      delete (globalThis as any).PsyBridge;
    }
  });
});

describe('на вкладке, которую рисует оболочка, веб-гуляка молчит', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as any).__psyNativeTabRoutes;
    delete (globalThis as any).__probePath;
  });

  async function засеять() {
    const хранилище = require('@react-native-async-storage/async-storage');
    const storage = хранилище.default ?? хранилище;
    await storage.clear();
    const earn = require('@/src/services/earn');
    const goal = require('@/src/services/streakGoal');
    for (const n of [3, 2, 1, 0]) {
      await earn.recordRound({ profileId: 'free', game: 'schulte', score: 10, errors: 0, warmupStep: false, now: назад(n) });
    }
    await goal.saveStreakGoal('free', goal.startGoal(30));
  }

  it('🔴 встреча не тратится невидимо: веб молчит, нативный спрашивает first и получает её', async () => {
    jest.resetModules();
    (globalThis as any).__psyNativeTabRoutes = ['/games'];
    (globalThis as any).__probePath = '/games';
    await засеять();
    const React = require('react');
    const TestRenderer = require('react-test-renderer');
    const { SafeAreaProvider } = require('react-native-safe-area-context');
    const { ThemeProvider } = require('@/src/contexts/ThemeContext');
    const { LanguageProvider } = require('@/src/contexts/LanguageContext');
    const { ProfileProvider } = require('@/src/contexts/ProfileContext');
    const pet = require('@/src/components/pet/WalkingPet');
    let r: any;
    await TestRenderer.act(async () => {
      r = TestRenderer.create(React.createElement(SafeAreaProvider, { initialMetrics: МЕТРИК },
        React.createElement(ProfileProvider, null, React.createElement(ThemeProvider, null,
          React.createElement(LanguageProvider, null, React.createElement(pet.default))))));
    });
    const кадры: string[] = [];
    for (let i = 0; i < 5; i++) {
      await TestRenderer.act(async () => { jest.advanceTimersByTime(1000); });
      кадры.push(JSON.stringify(r.toJSON() ?? {}));
    }
    // Пузыря нет ни секунды — на этой вкладке веб-гуляка не говорит.
    expect(кадры.some((k) => k.includes('"numberOfLines":2'))).toBe(false);
    jest.useRealTimers();
    const слово: any = await pet.petHostAnswer('first');
    expect(слово?.text && слово.text.includes('4') && слово.text.includes('26')).toBe(true);
    expect(слово.showMs).toBeGreaterThan(0);
    // Второй раз за день — молчит: встреча одна, кто бы её ни показал.
    expect(await pet.petHostAnswer('first')).toBeNull();
    await TestRenderer.act(async () => { r.unmount(); });
  });
});
