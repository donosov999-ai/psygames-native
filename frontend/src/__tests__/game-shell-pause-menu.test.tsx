/**
 * Меню паузы в каркасе GameShell — ТЗ чата судоку (задача 475ece36, отчёт 5be4998f),
 * решение Дениса 09.09.2026: отдельной кнопки ⏸ нет — меню открывает САМА стрелка «назад».
 *
 * Что сторожим ПОВЕДЕНИЕМ, а не чтением исходника:
 *   1. игра дала `pauseActions` → стрелка не спрашивает про выход, а держит партию
 *      (`isGameHeld()` — по нему стоят часы всех игр) и показывает меню на весь экран;
 *   2. пункт меню снимает задержку ДО своего действия («Заново»/«На главную» уводят с
 *      экрана, повисшая пауза остановила бы часы навсегда);
 *   3. `leave: true` уходит тем же путём, что стрелка без меню — через подтверждение
 *      выхода каркаса (сохранение партии в «продолжить»), а не через голый `onBack`;
 *   4. игра БЕЗ `pauseActions` (61 экран) ведёт себя как прежде: стрелка → вопрос о выходе,
 *      партия не держится, меню не появляется;
 *   5. стрелка ≥ 48 pt — пальцем, а не курсором;
 *   6. подписи — существующие ключи словаря на всех языках, новых ключей ТЗ не заводило.
 *
 * Мутации, на которых проба обязана краснеть: стрелка зовёт requestExit при наличии меню
 * (п. 1); пункт не снимает holdGame (п. 2); `leave` заменён на `onBack()` (п. 3); меню
 * показывается и без `pauseActions` (п. 4).
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { Text, StyleSheet } from 'react-native';
import GameShell from '@/src/components/GameShell';
import { isGameHeld, __resetGameClock } from '@/src/services/gamePause';

declare const __dirname: string;
declare function require(id: string): any;

const mockGuard = { asking: false, requestExit: jest.fn(), stay: jest.fn(), confirmExit: jest.fn() };
jest.mock('@/src/hooks/useExitGuard', () => ({ useExitGuard: () => mockGuard }));
jest.mock('expo-router', () => ({ usePathname: () => '/games/sudoku', useRouter: () => ({ push: () => {}, back: () => {} }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: {
    background: '#fff', surface: '#fff', card: '#eee', border: '#ccc',
    text: '#000', textSecondary: '#666', primary: '#07c',
  } }),
}));
jest.mock('@/src/contexts/WarmupContext', () => ({ useWarmupSafe: () => null }));
jest.mock('@/src/contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => `${k}·т`, language: 'ru' }),
}));
jest.mock('@/src/services/edgeBack', () => ({ attachEdgeBack: () => () => {} }));
jest.mock('@/src/services/a11y', () => ({ announce: () => {} }));
/**
 * ⚠️ ПОДМЕНА ОБЯЗАНА ОТДАВАТЬ ВСЁ, ЧТО КАРКАС ЗОВЁТ. С появлением пункта «тихий
 * режим» (10.09.2026) `GameShell` читает `soundOn`/`hapticEnabledNow` и пишет
 * `setSoundEnabled`/`setHapticEnabled`. Неполная подмена валила ВЕСЬ набор с
 * `soundOn is not a function` — семь проб разом, и ни одна из них не про звук.
 */
jest.mock('@/src/services/feedback', () => {
  // ⚠️ Состояние держим ВНУТРИ фабрики: jest не пускает в неё внешние переменные.
  let звук = true;
  return {
    sndCorrect: () => {}, sndWrong: () => {}, sndMatch: () => {}, sndLose: () => {},
    soundOn: () => звук, hapticEnabledNow: () => звук,
    setSoundEnabled: (v: boolean) => { звук = v; }, setHapticEnabled: () => {},
  };
});
jest.mock('@/src/services/petMood', () => ({ setGameMood: () => {} }));
jest.mock('@/src/components/GameHelpOverlay', () => ({ __esModule: true, HELP_CORNER_SPACE: 0, default: () => null }));

const mounted: TestRenderer.ReactTestRenderer[] = [];
afterEach(() => {
  act(() => { mounted.forEach((t) => { try { t.unmount(); } catch { /* снят */ } }); });
  mounted.length = 0;
  mockGuard.requestExit.mockClear(); mockGuard.confirmExit.mockClear();
  __resetGameClock();
});

function смонтировать(props: Record<string, unknown>) {
  let tr!: TestRenderer.ReactTestRenderer;
  act(() => {
    tr = TestRenderer.create(
      <GameShell title="Судоку" onBack={() => {}} {...(props as any)}>
        <Text testID="поле">поле</Text>
      </GameShell>,
    );
  });
  mounted.push(tr);
  return tr;
}
/** Первый узел с таким testID — композит (у него есть onPress), не хост-View. */
const узел = (tr: TestRenderer.ReactTestRenderer, id: string) => tr.root.findAllByProps({ testID: id })[0];
const есть = (tr: TestRenderer.ReactTestRenderer, id: string) => tr.root.findAllByProps({ testID: id }).length > 0;
const нажать = (tr: TestRenderer.ReactTestRenderer, id: string) => act(() => { узел(tr, id).props.onPress(); });

const меню = (доп: Partial<Record<'restart' | 'rules', () => void>> = {}) => [
  { id: 'resume', label: 'Продолжить', icon: 'play', primary: true },
  { id: 'restart', label: 'Заново', icon: 'refresh', onPress: доп.restart ?? (() => {}) },
  { id: 'rules', label: 'Правила', icon: 'help-circle-outline', onPress: доп.rules ?? (() => {}) },
  { id: 'home', label: 'На главную', icon: 'home', leave: true },
];

describe('меню паузы GameShell — стрелка «назад» открывает меню', () => {
  /**
   * 🔴 ДОГОВОР ИЗМЕНЁН 10.09.2026, И ЭТОТ НАБОР ПЕРЕПИСАН ПОД НОВЫЙ.
   *
   * Раньше здесь было записано: «нет `pauseActions` — стрелка спрашивает про выход,
   * меню нет». Замер показал, во что это обошлось: меню было у 18 игровых экранов
   * из 81, и на остальных 63 человек, нажав «назад», получал карточку «Игра на
   * паузе» БЕЗ ЕДИНОЙ КНОПКИ. Денис: «пауза походу опять не доехала до всех».
   *
   * Теперь набор по умолчанию даёт КАРКАС, а игра лишь дополняет его своим.
   * Пробы ниже сверяют новый договор; старые ожидания сохранены рядом в тексте
   * пробы, чтобы было видно, что именно поменялось и почему.
   */
  it('1. с pauseActions стрелка держит партию и показывает пункты игры, выхода не спрашивает', () => {
    const tr = смонтировать({ pauseActions: меню() });
    expect(`до нажатия: держится ${isGameHeld()}, меню ${есть(tr, 'game-pause-menu')}`).toBe('до нажатия: держится false, меню false');
    нажать(tr, 'game-back');
    expect(`после: держится ${isGameHeld()}, меню ${есть(tr, 'game-pause-menu')}, requestExit ${mockGuard.requestExit.mock.calls.length}`)
      .toBe('после: держится true, меню true, requestExit 0');
    // Пункты игры на месте. Общие пункты каркаса (тишина, отчёт) приходят сверх них
    // и здесь не перечисляются: их сторожит `pause-menu-everywhere`.
    const пункты = ['resume', 'restart', 'rules', 'home'].map((id) => `${id}:${есть(tr, `pause-action:${id}`)}`).join(' ');
    expect(пункты).toBe('resume:true restart:true rules:true home:true');
  });

  it('1а. повторное нажатие стрелки не наслаивает вторую задержку', () => {
    const tr = смонтировать({ pauseActions: меню() });
    нажать(tr, 'game-back'); нажать(tr, 'game-back');
    нажать(tr, 'pause-action:resume');
    expect(`после «Продолжить»: держится ${isGameHeld()}`).toBe('после «Продолжить»: держится false');
  });

  it('2. «Продолжить» снимает задержку и убирает меню; «Заново» снимает задержку ДО своего действия', () => {
    const журнал: string[] = [];
    const tr = смонтировать({ pauseActions: меню({ restart: () => журнал.push(`restart при held=${isGameHeld()}`) }) });
    нажать(tr, 'game-back');
    нажать(tr, 'pause-action:resume');
    expect(`держится ${isGameHeld()}, меню ${есть(tr, 'game-pause-menu')}`).toBe('держится false, меню false');
    нажать(tr, 'game-back');
    нажать(tr, 'pause-action:restart');
    expect(журнал).toEqual(['restart при held=false']);
    expect(isGameHeld()).toBe(false);
  });

  it('3. «На главную» (leave) идёт через подтверждение выхода каркаса — с сохранением, без второго вопроса', () => {
    const tr = смонтировать({ pauseActions: меню() });
    нажать(tr, 'game-back');
    нажать(tr, 'pause-action:home');
    expect(`confirmExit ${mockGuard.confirmExit.mock.calls.length}, requestExit ${mockGuard.requestExit.mock.calls.length}, держится ${isGameHeld()}`)
      .toBe('confirmExit 1, requestExit 0, держится false');
  });

  it('4. 🔴 без pauseActions меню ЕСТЬ — его даёт каркас (было: «вопрос о выходе, меню нет»)', () => {
    const tr = смонтировать({});
    нажать(tr, 'game-back');
    // Вопроса про выход больше нет: выход стал пунктом внутри меню.
    expect(`requestExit ${mockGuard.requestExit.mock.calls.length}, держится ${isGameHeld()}, меню ${есть(tr, 'game-pause-menu')}`)
      .toBe('requestExit 0, держится true, меню true');
    const пункты = ['resume', 'home'].map((id) => `${id}:${есть(tr, `pause-action:${id}`)}`).join(' ');
    expect(пункты).toBe('resume:true home:true');
  });

  it('4а. 🔴 пустой список pauseActions — то же самое: молчание игры не оставляет человека без кнопок', () => {
    const tr = смонтировать({ pauseActions: [] });
    нажать(tr, 'game-back');
    expect(`requestExit ${mockGuard.requestExit.mock.calls.length}, держится ${isGameHeld()}, меню ${есть(tr, 'game-pause-menu')}`)
      .toBe('requestExit 0, держится true, меню true');
  });

  it('5. стрелка «назад» — не меньше 48 pt в обе стороны', () => {
    const tr = смонтировать({ pauseActions: меню() });
    const s = StyleSheet.flatten(узел(tr, 'game-back').props.style) as { width?: number; height?: number };
    expect(`${s.width}×${s.height} ≥ 48`).toBe(`${Math.max(48, s.width ?? 0)}×${Math.max(48, s.height ?? 0)} ≥ 48`);
  });

  it('6. подписи меню — существующие ключи словаря на ru/en и во всех 10 переводах, новых ключей нет', () => {
    const fs = require('fs'); const path = require('path');
    const ключи = ['exitConfirmStay', 'restart', 'btn_rules', 'goHome'];
    const база = path.join(__dirname, '..', 'contexts');
    const файлы = [path.join(база, 'LanguageContext.tsx'), ...fs.readdirSync(path.join(база, 'translations')).filter((f: string) => f.endsWith('.ts')).map((f: string) => path.join(база, 'translations', f))];
    expect(файлы.length).toBeGreaterThanOrEqual(11);
    const дыры: string[] = [];
    for (const f of файлы) {
      const src: string = fs.readFileSync(f, 'utf8');
      for (const k of ключи) if (!new RegExp(`^\\s*['"]?${k}['"]?\\s*:`, 'm').test(src)) дыры.push(`${path.basename(f)}:${k}`);
    }
    expect(дыры).toEqual([]);
  });
});

describe('судоку подключил меню паузы на живой партии (ТЗ 475ece36)', () => {
  const fs = require('fs'); const path = require('path');
  const src: string = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'games', 'sudoku.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('pauseActions стоит на GameShell живой партии (том, что сохраняет перед выходом)', () => {
    // Открывающий тег GameShell: от `<GameShell` до первого `>`, который НЕ хвост стрелки `=>`
    // (в пропсах стоят `onBack={() => …}` — простой `[\s\S]*?>` обрывался на них).
    const теги = src.split(/<GameShell\b/).slice(1).map((chunk) => chunk.match(/^([\s\S]*?)(?<!=)>/)?.[1] ?? '');
    const живой = теги.filter((t) => /onSaveBeforeExit=/.test(t));
    expect(`GameShell с onSaveBeforeExit: ${живой.length}`).toBe('GameShell с onSaveBeforeExit: 1');
    expect(`pauseActions на живой партии: ${/pauseActions=\{\[/.test(живой[0])}`).toBe('pauseActions на живой партии: true');
    const блок = живой[0].match(/pauseActions=\{\[([\s\S]*?)\]\}/)![1];
    const ids = [...блок.matchAll(/id:\s*'([a-z]+)'/g)].map((m) => m[1]);
    expect(ids).toEqual(['resume', 'restart', 'rules', 'home']);
    expect(`home через leave: ${/id:\s*'home'[^}]*leave:\s*true/.test(блок)}`).toBe('home через leave: true');
    expect(`«Заново» = новая доска: ${/id:\s*'restart'[^}]*startGame\(\)/.test(блок)}`).toBe('«Заново» = новая доска: true');
    expect(`подписи из словаря: ${['exitConfirmStay', 'restart', 'btn_rules', 'goHome'].every((k) => блок.includes(`t('${k}')`))}`).toBe('подписи из словаря: true');
  });
});
