import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
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
 */
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
  const [deep, setDeep] = useState<Record<string, any> | null>(null);
  const [openSecs, setOpenSecs] = useState<Record<string, boolean>>({});

  const clean = pathname.replace(/\/+$/, '');          // убрать хвостовой слэш
  const gi = clean.indexOf('/games/');                 // устойчиво к baseUrl-префиксу (/app-test, /play)
  const key = gi >= 0 ? clean.slice(gi) : clean;
  const entry = HELP_MAP[key];

  // Ленивая подгрузка общих описаний — грузим 1.1 МБ только когда открыли справку.
  useEffect(() => {
    if (open && !deep) import('@/src/constants/gamesDeep.json').then((m: any) => setDeep(m.default || m)).catch(() => {});
  }, [open, deep]);

  if (!entry || !entry.introKey) return null;          // нет справки — нет кнопки

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

  return (
    <>
      <TouchableOpacity
        accessibilityLabel={helpLabel}
        onPress={() => setOpen(true)}
        activeOpacity={0.85}
        style={[styles.fab, { top: insets.top + 12, backgroundColor: colors.primary || '#a855f7' }]}
      >
        <Ionicons name="help-circle" size={24} color="#fff" />
      </TouchableOpacity>

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
  fab: {
    position: 'absolute',
    right: 14,
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 40,
    borderRadius: 20,
    zIndex: 100,
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } as any : {}),
  },
  fabLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
