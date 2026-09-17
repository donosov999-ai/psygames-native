/* psygames-dropdown-select · VER 1 · 17.09.2026 */
/**
 * ВЫПАДАЮЩИЙ СПИСОК ВЫБОРА — ОДИН НА ВСЁ ПРИЛОЖЕНИЕ.
 *
 * 🔴 РЕШЕНИЕ ДЕНИСА 17.09.2026. По кадру настройки «Мысленного вращения»: «лучше бы
 * выбор выпадающим списком сделать» — двенадцать кнопок «Вида заданий» занимали пять
 * рядов. На вопрос, делать ли для этого общий компонент или каждому свой: «да делать».
 *
 * ПОЧЕМУ КОМПОНЕНТ, А НЕ «СДЕЛАЙ У СЕБЯ ТАК ЖЕ». В один день на подходе оказались ТРИ
 * независимые копии одного и того же выбора: «Вид заданий» во «Вращении» (ветка
 * spatial/tester-0917, коммит 9e2fdce6), «Алфавит» в «Корректуре» (задача 6552ffb5,
 * семь кнопок в четыре ряда) и язык перевода в «Парах слов» (одиннадцать кнопок в
 * четыре ряда, 216 px). Словами передаётся схема, а получается три разных списка —
 * ровно так уже разъехались справка и крестовина стрелок (см. `ArrowPad`).
 *
 * ⚠️ НЕ ДЛЯ СПИСКА ЗАПУСКА. «Выбрать узор» в «Детском мате» похож с виду, но там
 * нажатие строки СРАЗУ начинает партию. Здесь строка выбирает ЗНАЧЕНИЕ, а начинает
 * партию отдельная кнопка «Начать». Смешивать нельзя: у списка запуска нет «текущего
 * выбора», который показывала бы закрытая строка.
 *
 * КАК ПОЛЬЗОВАТЬСЯ:
 *   <DropdownSelect
 *     подпись="Вид заданий"
 *     значение={вид}
 *     варианты={[{ значение: null, текст: 'Вперемешку' }, { значение: 'section', текст: 'Сечение', справа: 'Уровень 24' }]}
 *     onChange={setВид}
 *     акцент={GRADIENT[0]}
 *     цвета={colors}
 *   />
 * Закрытая строка показывает подпись и текущий выбор; нажатие раскрывает список ПОД
 * строкой, в потоке настройки, а не поверх — ничего не накрывает «Начать» и кнопку
 * отзыва. Выбор закрывает список. Нужно знать, раскрыт ли список (например, спрятать
 * пояснение под ним), — передай `открыт` и `наОткрытие`, иначе состояние внутреннее.
 *
 * ⚠️ `aria-expanded` СТАВИТСЯ ПРЯМЫМ ПРОПОМ. react-native-web 0.21 не переносит
 * `accessibilityState.expanded` в DOM: замер «Вращения» 17.09.2026 в WebKit дал
 * `aria-expanded = null` и в закрытом, и в раскрытом виде, а проба в jest была зелёной,
 * потому что читала проп, а не атрибут.
 *
 * ⚠️ СТРОКИ СПИСКА — `role="button"`, А НЕ `radio`. `tap-target-audit` считает кнопками
 * только `[role="button"], button, [tabindex]`: строка с другой ролью молча выпала бы из
 * аудита размера нажатия.
 *
 * ⚠️ ВЫСОТЫ — ПОЛ НАЖАТИЯ, НЕ «ПОКРУГЛЕЕ»: закрытая строка ≥ 56, строка списка ≥ 48
 * (`tap-target-audit`, 48×48).
 *
 * ⚠️ ВЫРАВНИВАНИЕ ТЕКСТА — ПО НАПРАВЛЕНИЮ ИНТЕРФЕЙСА, А НЕ ПО СЛОВУ. react-native-web
 * ставит тексту `dir="auto"`, и браузер выравнивает каждое слово по его собственному
 * письму. Замер 17.09.2026, «Пары слов», 375×812: в русском интерфейсе строка «العربية»
 * одна из одиннадцати прижалась к правому краю, под столбец галочки — строка читалась
 * пустой. Поэтому выравнивание задаётся явно от `isRTL()` (атрибут `dir` корня документа,
 * см. `services/rtl.ts`: физический `textAlign` сам не зеркалится).
 *
 * Сторожит `dropdown-select-one-choice`.
 */
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isRTL } from '@/src/services/rtl';

export type ВариантВыбора<V extends string | number | null> = {
  значение: V;
  текст: string;
  /** Мелкая приписка справа в строке списка — например, с какого уровня вид строится. */
  справа?: string;
};

/** Текст закрытой строки, когда значения нет среди вариантов: честный прочерк, а не первая строка. */
export const НЕТ_ВЫБОРА = '—';

export default function DropdownSelect<V extends string | number | null>({
  подпись, значение, варианты, onChange, акцент, цвета, testID, открыт, наОткрытие,
}: {
  подпись: string;
  значение: V;
  варианты: readonly ВариантВыбора<V>[];
  onChange: (значение: V) => void;
  /** Цвет выбранной строки, галочки и рамки раскрытого списка — обычно `GRADIENT[0]` игры. */
  акцент?: string;
  цвета?: { text: string; textSecondary: string; border: string };
  testID?: string;
  /** Управляемый режим: раскрыт ли список. Не передан — состояние внутреннее. */
  открыт?: boolean;
  наОткрытие?: (открыт: boolean) => void;
}) {
  const [своёОткрыт, setСвоёОткрыт] = useState(false);
  const раскрыт = открыт ?? своёОткрыт;
  const задать = (v: boolean) => {
    if (открыт === undefined) setСвоёОткрыт(v);
    наОткрытие?.(v);
  };
  const знак = цвета?.text ?? '#1C1C1E';
  const тихий = цвета?.textSecondary ?? '#6B6B73';
  const обводка = цвета?.border ?? '#D0D0D5';
  const цветВыбора = акцент ?? '#4F7CFF';
  const id = testID ?? 'dropdown-select';
  const текущий = варианты.find((в) => в.значение === значение);
  const показ = текущий ? текущий.текст : НЕТ_ВЫБОРА;
  // Не реактивно, но компонент перерисовывается вместе с экраном настройки при смене языка.
  const край = { textAlign: isRTL() ? 'right' : 'left' } as const;

  return (
    <View style={styles.обёртка} testID={`${id}-box`}>
      <Pressable
        testID={id}
        accessibilityRole="button"
        accessibilityState={{ expanded: раскрыт }}
        aria-expanded={раскрыт}
        accessibilityLabel={`${подпись}: ${показ}`}
        onPress={() => задать(!раскрыт)}
        style={[styles.строкаВыбора, { borderColor: раскрыт ? цветВыбора : обводка }]}
      >
        <View style={styles.текстВыбора}>
          <Text style={[styles.подпись, край, { color: тихий }]} numberOfLines={1}>{подпись}</Text>
          <Text style={[styles.значение, край, { color: знак }]} numberOfLines={1} testID={`${id}-value`}>{показ}</Text>
        </View>
        <Ionicons name={раскрыт ? 'chevron-up' : 'chevron-down'} size={22} color={тихий} />
      </Pressable>
      {раскрыт && (
        <View testID={`${id}-list`} style={[styles.список, { borderColor: обводка }]}>
          {варианты.map((в, i) => {
            const выбран = в.значение === значение;
            return (
              <Pressable
                key={String(в.значение)}
                testID={`${id}-${String(в.значение)}`}
                accessibilityRole="button"
                accessibilityState={{ selected: выбран }}
                aria-selected={выбран}
                accessibilityLabel={в.справа ? `${в.текст}, ${в.справа}` : в.текст}
                onPress={() => { onChange(в.значение); задать(false); }}
                style={[styles.строкаСписка, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: обводка }]}
              >
                <Text
                  style={[styles.текстСтроки, край, { color: выбран ? цветВыбора : знак, fontWeight: выбран ? '800' : '600' }]}
                  testID={`${id}-${String(в.значение)}-text`}
                  numberOfLines={1}
                >
                  {в.текст}
                </Text>
                {в.справа ? <Text style={[styles.приписка, { color: тихий }]}>{в.справа}</Text> : null}
                <Ionicons name="checkmark" size={20} color={выбран ? цветВыбора : 'transparent'} testID={`${id}-${String(в.значение)}-mark`} />
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  обёртка: { gap: 8 },
  строкаВыбора: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 },
  текстВыбора: { flex: 1, minWidth: 0 },
  подпись: { fontSize: 12, fontWeight: '600' },
  значение: { fontSize: 16, fontWeight: '800' },
  список: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  строкаСписка: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  текстСтроки: { flex: 1, minWidth: 0, fontSize: 15 },
  приписка: { fontSize: 12 },
});
