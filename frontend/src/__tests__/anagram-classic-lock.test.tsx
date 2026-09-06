/**
 * ПОСЛЕ ЗАКРЫТИЯ СЛОВА КРУГ БУКВ ГАСНЕТ.
 *
 * 🔴 ЧЕСТНО О ТОМ, ЧТО ЭТА ПРОБА СТОРОЖИТ, А ЧТО НЕТ.
 *
 * Повод её завести: разметка читала РЕФ — `disabled={wordDoneRef.current}`, —
 * и линтер правил React звал это «Cannot access refs during render». Реф
 * меняется без перерисовки, поэтому в общем случае кнопка могла остаться живой
 * над мёртвым словом.
 *
 * ⚠️ НО МУТАЦИЯ ПОКАЗАЛА, ЧТО В ЭТОМ ЭКРАНЕ ДЕФЕКТ НЕДОСТИЖИМ. Вернул чтение
 * рефа — проба осталась ЗЕЛЁНОЙ. Разобрал оба места, где реф поднимается:
 *   · последняя буква слова (`handleLetterPress`) — рядом `setPicked(newPicked)`;
 *   · срабатывание дедлайна (`setTimeout`) — рядом `setErrors(...)`.
 * В обоих перерисовка приходит в том же такте, поэтому реф и состояние никогда
 * не расходятся на экране. Правка остаётся — опираться на случайное соседство
 * нельзя, — но называется тем, что она есть: укрепление, а не починка.
 *
 * Поэтому проба сторожит НЕ различие «реф против состояния» (его нечем показать),
 * а само свойство: собрал слово — круг погас. Свойство настоящее, и если кто-то
 * уберёт гашение вовсе, она покраснеет.
 */
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ProfileProvider } from '@/src/contexts/ProfileContext';
import { ThemeProvider } from '@/src/contexts/ThemeContext';
import { LanguageProvider } from '@/src/contexts/LanguageContext';
import { PlayerLevelProvider } from '@/src/contexts/PlayerLevelContext';
import { WarmupProvider } from '@/src/contexts/WarmupContext';

let mockКруг: { letters: string[]; disabled: boolean; onTrace: (n: number[]) => void } | null = null;
jest.mock('@/src/components/letterWheel/LetterWheel', () => ({
  LetterWheel: (props: { letters: string[]; disabled: boolean; onTrace: (n: number[]) => void }) => {
    mockКруг = props;
    return null;
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports -- загрузка ПОСЛЕ jest.mock
const TestRenderer = require('react-test-renderer');
const МЕТРИКИ = { frame: { x: 0, y: 0, width: 360, height: 740 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

it('собранное слово гасит круг букв (свойство, а не различие реф/состояние)', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- см. выше
  const Экран = require('@/app/games/anagrams').default;
  let root: any;
  await TestRenderer.act(async () => {
    root = TestRenderer.create(
      <SafeAreaProvider initialMetrics={МЕТРИКИ}>
        <ProfileProvider><ThemeProvider><LanguageProvider>
          <PlayerLevelProvider><WarmupProvider><Экран /></WarmupProvider></PlayerLevelProvider>
        </LanguageProvider></ThemeProvider></ProfileProvider>
      </SafeAreaProvider>);
  });
  const кнопки = () => root.root.findAll((n: any) => n.props
    && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function', { deep: true });
  const старт = кнопки().find((x: any) => String(x.props.accessibilityLabel) === 'Start');
  expect(старт).toBeTruthy();
  await TestRenderer.act(async () => { старт.props.onPress(); });

  expect(mockКруг).toBeTruthy();
  expect(mockКруг!.disabled).toBe(false);
  const буквы = mockКруг!.letters;
  expect(буквы.length).toBeGreaterThanOrEqual(4);

  /*
    Слово собирается «протягиванием» — тем же путём, каким его ведёт палец:
    круг отдаёт линию целиком, экран берёт последний шаг. Порядок букв здесь не
    важен: важно, что после ПОЛНОЙ длины слово закрывается в любом исходе —
    угадано оно или нет, — и круг обязан погаснуть.
  */
  for (let i = 0; i < буквы.length; i++) {
    const линия = Array.from({ length: i + 1 }, (_, k) => k);
    await TestRenderer.act(async () => { mockКруг!.onTrace(линия); });
  }
  expect(mockКруг!.disabled).toBe(true);
});
