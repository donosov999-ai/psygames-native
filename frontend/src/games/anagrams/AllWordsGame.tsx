/* psygames-anagrams-all-words-screen · VER 1 · 06.09.2026 */
/**
 * 🔴 «НАЙДИ ВСЕ СЛОВА»: КЛЕТКИ ПОКАЗЫВАЮТ ДЛИНУ, КРУГ ДАЁТ БУКВЫ.
 *
 * 📍 Вопрос Дениса 06.09.2026 со скриншотами «Моря слов» и Zen Word. Устройство
 * и наборы — в `core/allWords.ts`, там же пробы и ссылки на замеры лицензий.
 *
 * ⚠️ ПУСТЫЕ КЛЕТКИ — ЭТО УСЛОВИЕ ЗАДАЧИ, А НЕ УКРАШЕНИЕ. Длина слова —
 * единственная подсказка, которая есть у человека с самого начала: по ней он
 * понимает, сколько букв искать. Прятать её значило бы поменять игру.
 */
import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LetterWheel } from '@/src/components/letterWheel/LetterWheel';
import { минимальныйРазмерКруга } from '@/src/components/letterWheel/geometry';
import {
  allWordsLetters, сдатьСлово, всёНайдено, allWordsНачат, подсказкаAllWords, type AllWordsPack,
} from './core/allWords';

export interface AllWordsProps {
  pack: AllWordsPack;
  seed: number;
  size: number;
  theme: { surface: string; text: string; textSecondary: string; border: string; primary: string; success: string; danger: string };
  now: () => number;
  /** Все слова найдены: сколько взято подсказок и сколько ушло времени. */
  onComplete: (подсказок: number, мс: number) => void;
  onProgress?: (начат: boolean) => void;
  labels: { найдено: string; подсказки: string; банк: string; сдать: string; сброс: string; подсказка: string };
}

export function AllWordsGame({ pack, seed, size, theme, now, onComplete, onProgress, labels }: AllWordsProps) {
  const [найдены, setНайдены] = React.useState<string[]>([]);
  const [линия, setЛиния] = React.useState<number[]>([]);
  /**
   * 🔴 СЧЁТЧИКА ОШИБОК ЗДЕСЬ НЕТ, И ЭТО НЕ УПУЩЕНИЕ.
   *
   * 📍 ОТЧЁТ ДЕНИСА 06.09.2026: «я ввожу любое слово, что можно составить, оно
   * не фиксируется, то есть ждёт определённых — а как догадаться?». Он прав по
   * устройству: с круга физически НЕЛЬЗЯ набрать слово, которое не собирается
   * из этих букв. Значит каждая попытка честная, и наказывать за неё нечем —
   * список целей человеку не показан и показан быть не может.
   *
   * Считаем найденное, а не ошибки. Так же устроены образцы жанра: в Zen Word
   * нет ни таймера, ни штрафа — только сколько слов открыто.
   */
  const [подсказок, setПодсказок] = React.useState(0);
  const [открытые, setОткрытые] = React.useState<Record<string, number>>({});
  const [мигание, setМигание] = React.useState<'нет' | 'верно' | 'повтор' | 'мимо'>('нет');

  const буквы = React.useMemo(() => allWordsLetters(pack, seed), [pack, seed]);
  const кругРазмер = Math.max(минимальныйРазмерКруга(буквы.length), Math.min(size, 300));
  const готово = всёНайдено(pack, найдены);

  const начало = React.useRef(0);
  const подсказокRef = React.useRef(0);
  React.useEffect(() => { подсказокRef.current = подсказок; }, [подсказок]);
  const готовоRef = React.useRef(false);
  React.useEffect(() => { готовоRef.current = готово; }, [готово]);

  React.useEffect(() => {
    const начат = allWordsНачат(найдены);
    if (начат && начало.current === 0) начало.current = now();
    onProgress?.(начат);
  }, [найдены, onProgress, now]);

  const сдать = React.useCallback((слово: string) => {
    if (готовоRef.current || слово.length < 3) { setЛиния([]); return; }
    setЛиния([]);
    setНайдены((текущие) => {
      const исход = сдатьСлово(pack, слово, текущие);
      setМигание(исход === 'цель' ? 'верно' : исход === 'повтор' ? 'повтор' : 'мимо');
      setTimeout(() => setМигание('нет'), 340);
      if (исход !== 'цель') return текущие;
      const дальше = [...текущие, слово.toLowerCase()];
      if (всёНайдено(pack, дальше)) {
        const мс = начало.current ? now() - начало.current : 0;
        setTimeout(() => onComplete(подсказокRef.current, мс), 420);
      }
      return дальше;
    });
  }, [pack, onComplete, now]);

  /**
   * 🔴 ПОДСКАЗКА ОТКРЫВАЕТ ОЧЕРЕДНУЮ БУКВУ САМОГО КОРОТКОГО НЕНАЙДЕННОГО СЛОВА.
   *
   * 📍 ОТЧЁТ ДЕНИСА 06.09.2026: «подсказки в новых анаграммах нет, ни первых
   * букв, ни смысла». Без неё режим упирается в тупик: список целей закрыт, и
   * если слово не приходит в голову, делать нечего.
   *
   * Короткое, а не длинное: подсказка обязана СДВИНУТЬ с мёртвой точки, а не
   * решить уровень. Урок филвордов того же дня — подсказка, не окупающая цену,
   * читается как «не работает», но и подсказка, решающая всё, убивает игру.
   */
  const взятьПодсказку = React.useCallback(() => {
    const h = подсказкаAllWords(pack, найдены, открытые);
    if (!h) return;   // открывать больше нечего — подсказку не списываем
    setОткрытые((было) => ({ ...было, [h.слово]: h.открыто }));
    setПодсказок((n) => n + 1);
  }, [pack, найдены, открытые]);

  const набрано = линия.map((i) => (буквы[i] ?? '').toUpperCase()).join('');
  const цветНабора = мигание === 'мимо' ? theme.danger
    : мигание === 'верно' ? theme.success
      : мигание === 'повтор' ? theme.textSecondary : theme.text;

  /** Клетка слова: ширина от длины самого длинного, чтобы столбцы не прыгали. */
  const самоеДлинное = Math.max(...pack.words.map((w) => w.length));
  const клетка = Math.max(16, Math.min(28, Math.floor((size - 24) / самоеДлинное) - 4));

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <View style={стили.список}>
        {pack.words.map((слово) => {
          const открыто = найдены.indexOf(слово) >= 0;
          const подсказано = открыто ? слово.length : (открытые[слово] ?? 0);
          return (
            /**
             * ⚠️ КАЖДОЕ СЛОВО — СВОЯ ГРУППА С ЗАМЕТНЫМ ЗАЗОРОМ. Найдено игрой:
             * при одинаковых отступах двенадцать слов сливались в одну ленту
             * клеток, и понять, где кончается одно слово и начинается другое,
             * было нельзя — а длина слова здесь и есть условие задачи.
             */
            <View key={слово} style={[стили.строкаСлова, { backgroundColor: theme.surface }]}
              accessible accessibilityLabel={открыто ? слово : `${слово.length}`}>
              {[...слово].map((ch, i) => (
                <View key={i} style={[стили.клетка, {
                  width: клетка, height: клетка + 4,
                  backgroundColor: открыто ? theme.primary : i < подсказано ? theme.border : theme.surface,
                  borderColor: открыто ? theme.primary : theme.border,
                }]}>
                  <Text style={[стили.букваСлова, {
                    fontSize: клетка * 0.6,
                    color: открыто ? '#fff' : i < подсказано ? theme.text : 'transparent',
                  }]}>
                    {ch.toUpperCase()}
                  </Text>
                </View>
              ))}
            </View>
          );
        })}
      </View>

      <Text style={[стили.набор, { color: цветНабора }]}>{набрано || '·'}</Text>

      <LetterWheel
        /** Буквы заглавные: на игровом поле так читается быстрее, и так же в классике. */
        letters={буквы.map((б) => б.toUpperCase())}
        size={кругРазмер}
        trace={линия}
        onTrace={(next) => setЛиния([...next])}
        onSubmit={(слово) => сдать(слово)}
        colors={{ surface: theme.surface, text: theme.text, primary: theme.primary, border: theme.border }}
        label={labels.банк}
        disabled={готово}
      />

      {/*
        🔴 ЯВНАЯ СДАЧА — ДЛЯ ТЕХ, КТО ИГРАЕТ ТАПОМ.
        
        📍 Найдено игрой, второй раз за день: ведение пальцем сдаёт слово по
        ОТПУСКАНИЮ, а тапающий палец не отпускают вовсе. В «Слове-квадрате» это
        закрылось длиной (все слова там пятибуквенные), здесь длины разные — от
        трёх до восьми, — и по длине не сдать. Значит нужна кнопка.
      */}
      <View style={стили.действия}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.сброс}
          accessibilityState={{ disabled: линия.length === 0 }}
          disabled={линия.length === 0}
          onPress={() => setЛиния([])}
          style={[стили.кнопка, { backgroundColor: theme.surface, borderColor: theme.border, opacity: линия.length ? 1 : 0.4 }]}
        >
          <Text style={[стили.кнопкаТекст, { color: theme.text }]}>{labels.сброс}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.подсказка}
          accessibilityState={{ disabled: готово }}
          disabled={готово}
          onPress={взятьПодсказку}
          style={[стили.кнопка, { backgroundColor: theme.surface, borderColor: theme.primary, opacity: готово ? 0.4 : 1 }]}
        >
          <Text style={[стили.кнопкаТекст, { color: theme.primary }]}>{labels.подсказка}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={labels.сдать}
          accessibilityState={{ disabled: линия.length < 3 }}
          disabled={линия.length < 3}
          onPress={() => сдать(набрано)}
          style={[стили.кнопка, { backgroundColor: theme.primary, borderColor: theme.primary, opacity: линия.length >= 3 ? 1 : 0.4 }]}
        >
          <Text style={[стили.кнопкаТекст, { color: '#fff' }]}>{labels.сдать}</Text>
        </Pressable>
      </View>

      <Text style={[стили.счёт, { color: theme.textSecondary }]}>
        {labels.найдено} {найдены.length}/{pack.words.length}{подсказок ? ` · ${labels.подсказки} ${подсказок}` : ''}
      </Text>
    </View>
  );
}

const стили = StyleSheet.create({
  // Зазор между СЛОВАМИ втрое больше, чем между клетками одного слова.
  список: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  строкаСлова: { flexDirection: 'row', gap: 2, padding: 3, borderRadius: 7 },
  клетка: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 4 },
  букваСлова: { fontWeight: '800' },
  набор: { fontSize: 22, fontWeight: '800', letterSpacing: 3, minHeight: 28 },
  счёт: { fontSize: 13 },
  действия: { flexDirection: 'row', gap: 10 },
  // 44 — норма цели нажатия: сдачу и сброс жмут пальцем.
  кнопка: { minHeight: 44, minWidth: 110, paddingHorizontal: 18, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  кнопкаТекст: { fontSize: 15, fontWeight: '700' },
});

export default AllWordsGame;
