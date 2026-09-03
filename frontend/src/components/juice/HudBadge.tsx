import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet, ViewStyle, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useReducedMotion } from '@/src/hooks/useReducedMotion';

interface Props {
  icon?: keyof typeof Ionicons.glyphMap;
  label?: string;
  value: string | number;
  colors?: [string, string];   // верх (светлее) → низ (темнее)
  tint?: string;               // цвет текста/иконки
  pop?: boolean;               // дёрнуть масштаб при изменении value
  style?: ViewStyle;
  /**
   * Пояснение по тапу: что это за счётчик. Решение Дениса 03.09.2026 — «сделать
   * по тапу по иконке, чтобы всплывало, что за окно и за цифры».
   *
   * Нужно ровно потому, что слово с пилюли убрано ради места: значок экономит
   * ширину, но первый раз его надо прочитать. Подсказка возвращает слово в тот
   * момент, когда оно требуется, и не занимает места, пока не требуется.
   */
  hint?: string;
}

// Объёмный бейдж-пилюля для HUD (уровень/таймер/счёт/цель):
// градиент-грань + верхний блик + тень = глубина. Не сухой текст.
export default function HudBadge({ icon, label, value, colors = ['#3b82f6', '#1d4ed8'], tint = '#fff', pop, style, hint }: Props) {
  const reduced = useReducedMotion();
  // Пояснение: своё, если дали, иначе слово с пилюли — оно как раз и уехало в значок.
  const подпись = hint ?? label;
  const [открыто, setОткрыто] = React.useState(false);
  // Закрываем сами: подсказка — не режим, а взгляд. Держать её до второго тапа
  // значит заставить человека убирать за собой.
  useEffect(() => {
    if (!открыто) return undefined;
    const t = setTimeout(() => setОткрыто(false), 2600);
    return () => clearTimeout(t);
  }, [открыто]);
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);
  useEffect(() => {
    /**
     * Щадящий режим: подпрыгивание гасим целиком. Здесь, в отличие от кнопки,
     * терять нечего — новое значение уже написано в самом бейдже цифрами, и
     * человек его видит. Скачок на 16% с последующим качанием пружины ничего
     * не сообщает, он только тянет взгляд, а прыгающий у края экрана HUD —
     * классический источник тошноты.
     */
    if (reduced) { scale.stopAnimation(); scale.setValue(1); first.current = false; return; }
    if (first.current) { first.current = false; return; }
    if (!pop) return;
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.16, duration: 110, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  }, [value, pop, reduced, scale]);
  const пилюля = (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.pill}>
      <View style={styles.highlight} pointerEvents="none" />
      {icon ? <Ionicons name={icon} size={14} color={tint} style={{ marginRight: 4 }} /> : null}
      {!icon && label ? <Text numberOfLines={1} style={[styles.label, { color: tint }]}>{label} </Text> : null}
      <Text numberOfLines={1} style={[styles.value, { color: tint }]}>{value}</Text>
    </LinearGradient>
  );

  return (
    /**
     * 🔴 ЕСТЬ ЗНАЧОК — СЛОВО НЕ ПИШЕМ. Решение Дениса 03.09.2026: «сократить слова
     * или заменить на иконки, если речь про верхний тулбар».
     *
     * Так шапка перестаёт спорить сама с собой. Замер по кадру из отчёта: в судоку
     * шесть счётчиков — уровень, ошибки, серия, время, подсказки, — и со словами
     * они занимают вдвое больше места, чем даёт экран 360. Слово при этом ничего
     * не сообщает, чего не сообщает значок рядом с числом: часы и «295 с» читаются
     * как время без подписи «Время».
     *
     * ⚠️ Слово НЕ ПРОПАДАЕТ, оно уходит в подпись для скринридера: там оно и было
     * единственным носителем смысла. Поэтому это не «убрали текст», а «перенесли
     * в тот слой, где он нужен».
     */
    <Animated.View
      // Когда пилюля нажимаемая, доступность живёт на кнопке внутри: два узла
      // подряд с одной подписью скринридер читает дважды.
      accessible={!подпись}
      accessibilityLabel={подпись ? undefined : (label ? `${label}: ${value}` : String(value))}
      style={[styles.shadow, { transform: [{ scale }] }, style]}
    >
      {/**
        * 🔴 ЦЕЛЬ НАЖАТИЯ 48, ПИЛЮЛЯ — КОМПАКТНАЯ; А БЕЗ ПОЯСНЕНИЯ КНОПКИ НЕТ ВОВСЕ.
        *
        * Две правки сошлись: пилюлю ужали (значок вместо слова), и по тапу она
        * стала объяснять себя — то есть превратилась в кнопку. Кнопка ростом 29
        * ловится аудитом нажатий как мелкая, и справедливо: норма Material 48.
        * Поэтому видимая пилюля остаётся маленькой, а прозрачная область вокруг
        * добирает до 48: глазу компактно, пальцу норма.
        *
        * ⚠️ И ветка БЕЗ пояснения обязана быть обычным `View`, а не `Pressable`
        * без обработчика. Замер показал почему: `Pressable` в вебе всё равно
        * получает `tabindex`, то есть становится точкой обхода с клавиатуры и
        * попадает в аудит нажатий как мелкая кнопка — при том, что нажимать её
        * незачем. Ложная кнопка хуже отсутствующей.
        */}
      {подпись ? (
        /*
          ⚠️ ПОДПИСЬ — НА САМОЙ КНОПКЕ, А НЕ НА ОБЁРТКЕ. Первая редакция держала её
          на внешнем `Animated.View`, и гейт доступности честно упал: «нажимаемый
          элемент без подписи». Он прав не по форме — скринридер объявляет ТО, ЧТО
          фокусируется, а фокусируется кнопка; подпись на родителе до неё не доходит.

          ⚠️ И комментарий стоит ВЫШЕ элемента, а не среди его свойств: разбор
          аудита ищет конец открывающего тега по первому `>`, и знак внутри
          комментария обрывал ему чтение — подпись за ним переставала находиться.
        */
        <Pressable
          style={styles.tapTarget}
          onPress={() => setОткрыто((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={label ? `${label}: ${value}` : String(value)}
          accessibilityHint={подпись}
          hitSlop={6}
        >
          {пилюля}
        </Pressable>
      ) : пилюля}
      {открыто && подпись ? (
        <View pointerEvents="none" style={styles.tip}>
          <Text style={styles.tipText} numberOfLines={2}>{подпись}</Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /** Пузырь-пояснение висит НАД пилюлей, поэтому у обёртки своя система координат. */
  tip: {
    position: 'absolute', top: '100%', marginTop: 4, left: 0, minWidth: 90, maxWidth: 190,
    paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10,
    backgroundColor: 'rgba(17,24,39,0.94)', zIndex: 50,
  },
  tipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tapTarget: { minHeight: 48, minWidth: 48, justifyContent: 'center', alignItems: 'center' },
  shadow: { flexShrink: 1, minWidth: 0, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  /**
   * 🔴 БЕЙДЖ УЖИМАЕТСЯ, А НЕ ВЫТАЛКИВАЕТ СОСЕДЕЙ ЗА КРАЙ.
   *
   * Два отчёта от 02.09.2026 на v2.32.0: «поехали кнопки верх тулбара» и «с меню
   * пиздец сверху». На кадрах видно: «Счёт 472» упирается в правый край, кнопка
   * «Правила» наполовину за экраном, а в маджонге пять бейджей растянули плашку
   * шире телефона.
   *
   * Причина — у пилюли не было ни `flexShrink`, ни ограничения ширины: она всегда
   * занимала столько, сколько просит текст, и вся строка вылезала за экран.
   * `minWidth: 0` обязателен вместе с `flexShrink`: без него потомок с текстом не
   * даёт себя сжать (правило флексбокса, из-за которого «просто flexShrink» не работает).
   */
  pill: {
    flexDirection: 'row', alignItems: 'center',
    // Отступы ужаты 13→9 и 7→5 вместе с отказом от слова: пилюля со значком и
    // числом должна быть размером с то, что в ней есть, а не с бывшую подпись.
    paddingVertical: 5, paddingHorizontal: 9,
    borderRadius: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    flexShrink: 1, minWidth: 0,
  },
  highlight: { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: 'rgba(255,255,255,0.16)' },
  label: { fontSize: 12, fontWeight: '700', opacity: 0.85 },
  /**
   * 🔴 ЦИФРЫ РАВНОЙ ШИРИНЫ — ИНАЧЕ ШАПКА ДЁРГАЕТСЯ (отчёт Дениса 03.09.2026 двумя
   * кадрами подряд: «дёргается верхний тулбар, надо чтобы не дёргался»).
   *
   * ПРИЧИНА, а не симптом. Значки лежат в ряду с переносом. Пока значение растёт
   * («17.6с» → «23.3с»), ширина пилюли МЕНЯЕТСЯ вместе с начертанием цифр: в
   * пропорциональном шрифте «1» уже «3». Сумма ширин ползает вокруг точки
   * переноса, ряд то влезает в два ряда, то в три — и всё поле под шапкой
   * прыгает вниз-вверх на высоту ряда, по нескольку раз за партию.
   *
   * `tabular-nums` даёт всем цифрам одну ширину: значение меняется, ширина нет.
   * ⚠️ Одного этого мало — при переходе через разряд («9.9с» → «10.1с») прибавляется
   * ЗНАК. Поэтому ещё и `minWidth`: место под четыре цифровых знака занято всегда,
   * и короткое значение просто не прижимается вплотную.
   */
  value: {
    fontSize: 14, fontWeight: '900',
    fontVariant: ['tabular-nums'],
    minWidth: 30, textAlign: 'center',
  },
});
