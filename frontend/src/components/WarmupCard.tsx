/* psygames-warmup-card · VER 1 · 06.09.2026 */
/**
 * 🔴 КАРТОЧКА ТЕМАТИЧЕСКОЙ ЗАРЯДКИ — ОДНА НА ВСЕ РАЗВИЛКИ.
 *
 * 📍 ПРОСЬБА ДЕНИСА 06.09.2026: «надо зарядку по словам собрать на 5–10 минут;
 * надо по идее выбор сделать в зарядках по времени, чтобы понять, какую серию
 * запускают». Второе — про то, что человек ДО запуска должен видеть, из чего
 * состоит серия и сколько она займёт; отсюда строка плана под кнопками времени.
 *
 * Компонент общий, а не копия шахматного: две карточки разошлись бы при первой
 * же правке — в этом проекте так уже случалось с высотой полки и правилом
 * уровня.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { GAMES } from '@/src/constants/games';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { ДЛИТЕЛЬНОСТИ, собратьТемуЗарядки, темаШаги, type ТемаЗарядки, type WarmupMinutes } from '@/src/services/chessWarmup';

export interface WarmupCardProps {
  /** Упражнения темы по порядку чередования. */
  темы: readonly ТемаЗарядки[];
  titleKey: string;
  descKey: string;
  /** Подпись серии в статистике зарядок. */
  ярлык: string;
  accent: string;
  /** Уровни ещё читаются из хранилища — кнопка ждёт. */
  loading?: boolean;
  /**
   * Строка под подписью — то, что зависит от состояния и не может жить в
   * словаре. У языковой зарядки это ПАРА ЯЗЫКОВ: она считается от интерфейса
   * (`языкиДляИнтерфейса`), и написать её в переводе значило бы соврать на тех
   * локалях, где пара другая.
   */
  подЗаголовком?: string;
  /**
   * 🔴 ИМЯ МОСТА ДЛЯ НАТИВНОЙ РАЗВИЛКИ (латиницей: `words`, `languages`).
   *
   * В приложении развилка рисуется Flutter-экраном ПОВЕРХ этой страницы, и
   * запустить зарядку оттуда было нечем — поэтому «Слова» и «Языки» оставались
   * в вебе целиком (30.09.2026). С именем карточка регистрирует в окне
   * `__psyWarmups[имя] = { info(), start(минут) }`: нативная шапка берёт отсюда
   * подписи и число подходов и зовёт ТОТ ЖЕ `startPlaylist`. Состав серии
   * по-прежнему считается только здесь — второй копии правил нет.
   */
  bridgeId?: string;
}

/** Что карточка отдаёт нативной шапке (`flutter/lib/shell/warmup_bridge.dart`). */
export interface WarmupBridgeInfo {
  title: string;
  desc: string;
  sub: string;
  unit: string;
  startLabel: string;
  options: { min: number; count: number; label: string; names: string[] }[];
  ready: boolean;
}

/**
 * 🔴 ИМЯ ИГРЫ БЕРЁТСЯ ИЗ КАТАЛОГА, А НЕ ИЗ ЕЁ ИДЕНТИФИКАТОРА.
 *
 * 📍 Здесь стояло `t(game_id)`, и это работало ровно у тех игр, где `id`
 * случайно совпал с ключом словаря. Замер 08.09.2026 — у пяти из девяти игр,
 * названных в трёх зарядках, они РАЗНЫЕ: `vocab_srs`→`vocabSrs`,
 * `semantic_sort`→`semanticSort`, `lexical_decision`→`lexicalDecision`,
 * `chess_blind`→`chessBlind`, `scholars_mate`→`scholarsMate`,
 * `phonemic_fluency`→`phonemic`. Строка состава показывала человеку сырые
 * идентификаторы с подчёркиваниями — в шахматной и словесной карточках это
 * висело с 06.09.2026 и заметили только сейчас, на третьей.
 *
 * ⚠️ Фолбэк на сам `id` оставлен: игра могла уехать из каталога, и пустая
 * строка состава хуже некрасивой.
 */
export function имяИгры(gameId: string, t: (k: string) => string): string {
  const g = GAMES.find((x) => x.id === gameId);
  return g ? (t(g.nameKey) || gameId) : gameId;
}

export function WarmupCard({ темы, titleKey, descKey, ярлык, accent, loading, подЗаголовком, bridgeId }: WarmupCardProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { startPlaylist } = useWarmup();
  const [минут, setМинут] = React.useState<WarmupMinutes>(10);

  const шаги = темаШаги(темы, минут);
  const готово = !loading && шаги.length > 0;

  // Мост читает СВЕЖИЕ значения при каждом вызове: регистрация одна на жизнь
  // карточки, а уровни и язык приезжают позже первой отрисовки.
  const свежее = React.useRef({ темы, titleKey, descKey, ярлык, loading, подЗаголовком, t, startPlaylist });
  свежее.current = { темы, titleKey, descKey, ярлык, loading, подЗаголовком, t, startPlaylist };
  React.useEffect(() => {
    if (!bridgeId || typeof window === 'undefined') return undefined;
    const w = window as unknown as { __psyWarmups?: Record<string, unknown> };
    const реестр = (w.__psyWarmups ??= {});
    const мост = {
      info: (): WarmupBridgeInfo => {
        const с = свежее.current;
        const options = ДЛИТЕЛЬНОСТИ.map((м) => {
          const ш = темаШаги(с.темы, м);
          const names = ш.reduce<string[]>((acc, x) => {
            const имя = имяИгры(x.game_id, с.t);
            if (acc.indexOf(имя) < 0) acc.push(имя);
            return acc;
          }, []);
          return { min: м, count: ш.length, label: с.t('warmupPlanCount').replace('{n}', String(ш.length)), names };
        });
        return {
          title: с.t(с.titleKey), desc: с.t(с.descKey), sub: с.подЗаголовком ?? '',
          unit: с.t('unitMin'), startLabel: с.t('start'), options,
          ready: !с.loading && options.some((o) => o.count > 0),
        };
      },
      start: (м: number): boolean => {
        const с = свежее.current;
        if (с.loading || !(ДЛИТЕЛЬНОСТИ as readonly number[]).includes(м)) return false;
        if (темаШаги(с.темы, м as WarmupMinutes).length === 0) return false;
        с.startPlaylist(собратьТемуЗарядки(с.темы, м as WarmupMinutes, с.ярлык));
        return true;
      },
    };
    реестр[bridgeId] = мост;
    return () => { if (реестр[bridgeId] === мост) delete реестр[bridgeId]; };
  }, [bridgeId]);

  /**
   * 🔴 ЧТО ИМЕННО ЗАПУСКАЕТСЯ — ВИДНО ДО НАЖАТИЯ. Это и есть просьба «чтобы
   * понять, какую серию запускают»: не только сколько минут, но и из чего.
   */
  const состав = шаги.reduce<string[]>((acc, ш) => {
    const имя = имяИгры(ш.game_id, t);
    if (acc.indexOf(имя) < 0) acc.push(имя);
    return acc;
  }, []);

  return (
    <View style={[стили.карточка, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={стили.строка}>
        <Ionicons name="flash" size={20} color={accent} />
        <Text style={[стили.заголовок, { color: colors.text }]}>{t(titleKey)}</Text>
      </View>
      <Text style={[стили.подпись, { color: colors.textSecondary }]}>{t(descKey)}</Text>
      {!!подЗаголовком && (
        <Text style={[стили.подпись, { color: accent, fontWeight: '700' }]}>{подЗаголовком}</Text>
      )}

      <View style={стили.кнопки}>
        {ДЛИТЕЛЬНОСТИ.map((м) => {
          const подходов = темаШаги(темы, м).length;
          const выбрана = минут === м;
          const счёт = t('warmupPlanCount').replace('{n}', String(подходов));
          return (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ selected: выбрана }}
              accessibilityLabel={`${счёт}, ≈ ${м} ${t('unitMin')}`}
              key={м}
              onPress={() => setМинут(м)}
              style={[стили.минута, выбрана
                ? { backgroundColor: accent }
                : { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }]}
            >
              <Text style={[стили.минутаТекст, { color: выбрана ? '#fff' : colors.text }]}>{счёт}</Text>
              <Text style={[стили.минутаМелко, { color: выбрана ? '#fff' : colors.textSecondary }]}>≈ {м} {t('unitMin')}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {состав.length > 0 && (
        <Text style={[стили.мелко, { color: colors.textSecondary }]}>{состав.join(' · ')}</Text>
      )}

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={t('start')}
        accessibilityState={{ disabled: !готово }}
        disabled={!готово}
        onPress={() => startPlaylist(собратьТемуЗарядки(темы, минут, ярлык))}
        style={[стили.старт, { backgroundColor: accent, opacity: готово ? 1 : 0.5 }]}
      >
        <Ionicons name="play" size={18} color="#fff" />
        <Text style={стили.стартТекст}>{t('start')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const стили = StyleSheet.create({
  карточка: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 8, marginBottom: 4 },
  строка: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  заголовок: { fontSize: 17, fontWeight: '700' },
  подпись: { fontSize: 13, lineHeight: 18 },
  кнопки: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  /**
   * Две кнопки в ряд — решение Дениса 09.09.2026. Четыре варианта (5/10/15/20)
   * с подписью «Подходов: N» в одну строку не помещаются на 360 px.
   * `flexBasis` вместо ширины: тянется под любой экран, `flexWrap` у ряда
   * переносит на вторую строку сам.
   * 44 — норма цели нажатия: выбор длительности жмут пальцем.
   */
  минута: { flexBasis: '47%', flexGrow: 1, minHeight: 52, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  минутаТекст: { fontSize: 14, fontWeight: '700' },
  минутаМелко: { fontSize: 11, marginTop: 1 },
  мелко: { fontSize: 12 },
  старт: { minHeight: 48, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  стартТекст: { color: '#fff', fontSize: 16, fontWeight: '700' },
});

export default WarmupCard;
