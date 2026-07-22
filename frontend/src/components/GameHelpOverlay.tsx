import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { HELP_MAP } from '@/src/constants/helpMap';

/**
 * Глобальная кнопка-«?» справки для всех экранов игр.
 * Справка = НАШЕ описание (режимы/уровни, ключ introKey из переводов)
 * + ОБЩЕЕ описание с сайта (gamesDeep.json: что за тренажёр, польза, история,
 * методы, доказательная база, FAQ, разновидности) — сворачиваемыми секциями.
 * Общие описания (1.1 МБ, 48 игр × 7 языков) грузятся лениво, только при открытии.
 *
 * ЗАЧЕМ подпись + одноразовая подсказка (репорты тестировщиков по set-game и
 * n-back: «не понимаю как играть, справка где?»): справка ЕСТЬ, но голая
 * «?»-иконка в углу читается как декор и её просто не замечают. Поэтому:
 *   1) под кружком — подпись «Правила» (кнопка называет себя словами);
 *   2) при ПЕРВОМ заходе в любую игру — облачко-указатель на «?» (один раз
 *      на установку, флаг HELP_COACH_KEY в AsyncStorage).
 */
/** Одноразовый флаг на всё приложение: подсказку-указатель показали. */
const HELP_COACH_KEY = 'psygames_help_coach_seen';
const DEEP_LABELS: Record<string, Record<string, string>> = {
  en: { about: 'About this trainer', benefit: 'What it develops', history: 'History', creator: 'Who created it — and when', methods: 'How to train', duration: 'How long to practise', research: 'Evidence base', rec: 'Recommendations', faq: 'FAQ', variants: 'Variants' },
  ru: { about: 'О тренажёре', benefit: 'Что развивает', history: 'История появления', creator: 'Кто и когда создал', methods: 'Методы тренировки', duration: 'Сколько заниматься', research: 'Доказательная база', rec: 'Рекомендации', faq: 'Частые вопросы', variants: 'Разновидности' },
  es: { about: 'Sobre el ejercicio', benefit: 'Qué desarrolla', history: 'Historia', creator: 'Quién lo creó y cuándo', methods: 'Cómo entrenar', duration: 'Cuánto practicar', research: 'Base de evidencia', rec: 'Recomendaciones', faq: 'Preguntas frecuentes', variants: 'Variantes' },
  pt: { about: 'Sobre o exercício', benefit: 'O que desenvolve', history: 'História', creator: 'Quem criou e quando', methods: 'Como treinar', duration: 'Quanto praticar', research: 'Base de evidências', rec: 'Recomendações', faq: 'Perguntas frequentes', variants: 'Variações' },
  de: { about: 'Über den Trainer', benefit: 'Was es entwickelt', history: 'Geschichte', creator: 'Wer es erfunden hat und wann', methods: 'So trainierst du', duration: 'Wie lange üben', research: 'Studienlage', rec: 'Empfehlungen', faq: 'Häufige Fragen', variants: 'Varianten' },
  zh: { about: '关于这个训练', benefit: '锻炼什么', history: '历史', creator: '由谁、何时创建', methods: '如何训练', duration: '练习多久', research: '研究依据', rec: '建议', faq: '常见问题', variants: '变体' },
  hi: { about: 'इस ट्रेनर के बारे में', benefit: 'क्या विकसित करता है', history: 'इतिहास', creator: 'किसने और कब बनाया', methods: 'कैसे अभ्यास करें', duration: 'कितनी देर अभ्यास', research: 'प्रमाण आधार', rec: 'सुझाव', faq: 'सामान्य प्रश्न', variants: 'प्रकार' },
};
const PROSE_KEYS = ['about', 'benefit', 'history', 'creator', 'methods', 'duration', 'research', 'rec'] as const;

export default function GameHelpOverlay() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const HELP_LABEL: Record<string, string> = { ru: 'Справка', en: 'Help', es: 'Ayuda', pt: 'Ajuda', hi: 'मदद', zh: '帮助', de: 'Hilfe' };
  const helpLabel = HELP_LABEL[language] || 'Help';
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  const [coach, setCoach] = useState(false);           // одноразовое облачко-указатель
  const [deep, setDeep] = useState<Record<string, any> | null>(null);
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({});

  const clean = pathname.replace(/\/+$/, '');          // убрать хвостовой слэш
  const gi = clean.indexOf('/games/');                 // устойчиво к baseUrl-префиксу (/app-test, /play)
  const key = gi >= 0 ? clean.slice(gi) : clean;
  const entry = HELP_MAP[key];
  const hasHelp = !!(entry && entry.introKey);

  // Ленивая подгрузка общих описаний — грузим 1.1 МБ только когда открыли справку.
  useEffect(() => {
    if (open && !deep) import('@/src/constants/gamesDeep.json').then((m: any) => setDeep(m.default || m)).catch(() => {});
  }, [open, deep]);

  // Одноразовая подсказка-указатель на «?». Флаг ставим сразу при показе —
  // иначе выход/вход в игру покажет облачко второй раз.
  useEffect(() => {
    if (!hasHelp) return;
    let alive = true;
    AsyncStorage.getItem(HELP_COACH_KEY)
      .then((seen) => {
        if (seen || !alive) return;
        AsyncStorage.setItem(HELP_COACH_KEY, '1').catch(() => {});
        setCoach(true);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [hasHelp]);

  // Само-скрытие: облачко висит над игровым полем, вечно держать его нельзя.
  useEffect(() => {
    if (!coach) return;
    const tm = setTimeout(() => setCoach(false), 12000);
    return () => clearTimeout(tm);
  }, [coach]);

  if (!hasHelp) return null;                           // нет справки — нет кнопки

  const gameId = key.replace('/games/', '');
  const L = DEEP_LABELS[language] || DEEP_LABELS.en;
  const gd: any = deep ? (deep[gameId]?.[language] || deep[gameId]?.en) : null;
  const sub = colors.textSecondary || colors.text;
  const toggle = (k: string) => setOpenSecs((s) => ({ ...s, [k]: !s[k] }));

  // плоская функция-рендер (не компонент) — без ремонтов при каждом рендере
  const renderSec = (k: string, title: string, body: React.ReactNode) => (
    <View key={k} style={[styles.sec, { borderTopColor: colors.border }]}>
      <TouchableOpacity style={styles.secHead} onPress={() => toggle(k)} activeOpacity={0.7}>
        <Text style={[styles.secTitle, { color: colors.primary || '#a855f7' }]}>{title}</Text>
        <Ionicons name={openSecs[k] ? 'chevron-up' : 'chevron-down'} size={18} color={sub} />
      </TouchableOpacity>
      {openSecs[k] ? <View style={{ paddingBottom: 12 }}>{body}</View> : null}
    </View>
  );

  const accent = colors.primary || '#a855f7';
  const openHelp = () => { setCoach(false); setOpen(true); };

  return (
    <>
      {/* Кнопка = кружок «?» + подпись словом. Голая иконка не читалась как справка. */}
      <TouchableOpacity
        accessibilityLabel={helpLabel}
        accessibilityRole="button"
        onPress={openHelp}
        activeOpacity={0.85}
        style={[styles.fabWrap, { top: insets.top + 10 }]}
      >
        <View style={[styles.fabCircle, { backgroundColor: accent }]}>
          <Ionicons name="help-circle" size={26} color="#fff" />
        </View>
        <Text style={[styles.fabLabel, { backgroundColor: accent }]} numberOfLines={1}>
          {t('btn_rules')}
        </Text>
      </TouchableOpacity>

      {coach ? (
        <View style={[styles.coachWrap, { top: insets.top + 10 + 44 + 20 }]} pointerEvents="box-none">
          <View style={[styles.coachArrow, { borderBottomColor: accent }]} />
          <View style={[styles.coachBubble, { backgroundColor: accent }]}>
            {/* тап по тексту = сразу открыть справку, не заставляя целиться в «?» */}
            <TouchableOpacity activeOpacity={0.85} onPress={openHelp} accessibilityRole="button">
              <Text style={styles.coachText}>{t('helpCoachText')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setCoach(false)} style={styles.coachOk} accessibilityRole="button">
              <Text style={styles.coachOkText}>{t('btn_got_it')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.background, borderColor: colors.border }]}>
            <View style={styles.sheetHead}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>{t(entry.nameKey)}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} style={[styles.close, { backgroundColor: colors.surface }]}>
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={[styles.skillChip, { backgroundColor: (colors.primary || '#a855f7') + '22' }]}>
              <Ionicons name="fitness-outline" size={14} color={colors.primary || '#a855f7'} />
              <Text style={[styles.skillText, { color: colors.primary || '#a855f7' }]}>{t(entry.skillKey)}</Text>
            </View>

            <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
              <Text style={[styles.intro, { color: colors.text }]}>{t(entry.introKey)}</Text>

              {gd ? (
                <View style={{ marginTop: 18 }}>
                  {PROSE_KEYS.map((k) => gd[k]
                    ? renderSec(k, L[k], String(gd[k]).split('\n\n').map((p, i) => <Text key={i} style={[styles.para, { color: colors.text }]}>{p}</Text>))
                    : null)}
                  {gd.faq && gd.faq.length > 0
                    ? renderSec('faq', L.faq, gd.faq.map(([q, a]: [string, string], i: number) => (
                        <View key={i} style={{ marginBottom: 12 }}>
                          <Text style={[styles.faqQ, { color: colors.text }]}>{q}</Text>
                          <Text style={[styles.para, { color: sub }]}>{a}</Text>
                        </View>
                      )))
                    : null}
                  {gd.variants
                    ? renderSec('variants', L.variants, String(gd.variants).split('\n\n').map((p, i) => <Text key={i} style={[styles.para, { color: colors.text }]}>{p}</Text>))
                    : null}
                </View>
              ) : null}
            </ScrollView>

            <TouchableOpacity onPress={() => setOpen(false)} style={[styles.okBtn, { backgroundColor: colors.primary || '#a855f7' }]}>
              <Text style={styles.okText}>{t('close') !== 'close' ? t('close') : 'OK'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Ширина колонки фиксирована (50) и почти равна старой кнопке (40): шапки игр
  // центрируют длинный заголовок («Стоп-сигнал: торможение» ~235 px из 360), лишние
  // пиксели справа съели бы зазор. Подпись под кружком в эти 50 укладывается.
  fabWrap: {
    position: 'absolute',
    right: 10,
    width: 50,
    alignItems: 'center',
    zIndex: 100,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  },
  fabCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',   // белое кольцо — кнопка видна на любом фоне игры
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabLabel: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 10,
    marginTop: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 7,
    overflow: 'hidden',
  },
  coachWrap: { position: 'absolute', right: 12, maxWidth: 270, zIndex: 101, alignItems: 'flex-end' },
  coachArrow: {
    marginRight: 16,
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  coachBubble: {
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  coachText: { color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '600' },
  coachOk: { alignSelf: 'flex-end', marginTop: 8, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.22)' },
  coachOkText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 18 },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '82%', borderRadius: 20, borderWidth: 1, padding: 20 },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  close: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  skillChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 12 },
  skillText: { fontSize: 14, fontWeight: '700' },
  body: { marginTop: 14 },
  intro: { fontSize: 16.5, lineHeight: 25 },
  sec: { borderTopWidth: 1, paddingTop: 2 },
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11, gap: 10 },
  secTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4, flex: 1 },
  para: { fontSize: 15.5, lineHeight: 23, marginBottom: 8 },
  faqQ: { fontSize: 15.5, fontWeight: '700', marginBottom: 2 },
  okBtn: { marginTop: 14, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  okText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
