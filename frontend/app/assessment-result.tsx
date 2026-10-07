/**
 * G1 — Assessment Result Screen
 *
 * Renders:
 *  1. Radar chart (12 axes, one per cognitive domain) showing z-scores
 *  2. Per-domain breakdown with weak/avg/strong tags
 *  3. Recommendations: which games to focus on
 *  4. "Apply to playlist" button — saves user profile + (future) modulates warmup playlist
 */

import GradientSurface from '@/src/components/GradientSurface';
import { textOn, onGradientText, onGradientTextMuted, withAlpha } from '@/src/services/onGradientText';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useWarmup } from '@/src/contexts/WarmupContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { GAMES } from '@/src/constants/games';
import {
  scoreSessions, sessionsFromStepResults, buildRecommendations, saveAssessmentResult, saveUserProfile,
  AssessmentResult, DOMAINS, Domain, UserProfile,
} from '@/src/services/assessment';
import { getAiInsight, toneForProfile } from '@/src/services/aiInsight';
import { postScreenModel, registerScreenActions } from '@/src/services/hostScreens';

const GRADIENT = ['#7c3aed', '#ec4899'];
// Текст на плашке итога считаем по ОБОИМ концам: зашитый белый давал 3.53.
const ON_GRAD = onGradientText(GRADIENT[0], GRADIENT[1]);
const ON_GRAD_SOFT = onGradientTextMuted(ON_GRAD);

/** Цвет уровня домена — один для строки списка и точки радара. */
export function levelColor(level: string): string {
  return level === 'weak' ? '#f43f5e' : level === 'strong' ? '#22c55e' : '#fbbf24';
}

export default function AssessmentResultScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, language } = useLanguage() as any;
  const warmup = useWarmup();
  const { profile } = useProfile();

  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [recommendations, setRecommendations] = useState<string[]>([]);
  const [persisted, setPersisted] = useState(false);
  const [applied, setApplied] = useState(false);
  // v1.115.0: связный ИИ-разбор — раз в ассессмент (кэш на result.date, следующий
  // прогон через 3 мес естественно генерит заново). Молчаливый null = держим
  // существующий статичный список доменов+рекомендаций как есть, ничего не ломаем.
  const [aiText, setAiText] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      // Результаты шагов → партии для подсчёта, ВМЕСТЕ с настройками партии: без них
      // оценка не узнавала свою партию, и 7 доменов из 12 выходили «средними» у всех.
      const res = scoreSessions(sessionsFromStepResults(warmup.results));
      const recs = buildRecommendations(res);
      setResult(res);
      setRecommendations(recs);
      if (!persisted) {
        await saveAssessmentResult(res);
        await warmup.stopWarmup(true);
        setPersisted(true);
      }
      if (profile?.id) {
        getAiInsight(
          'assessment', profile.id, res.date, language, toneForProfile(profile.id),
          { domains: res.scores.map((s) => ({ domain: s.domain, zScore: Math.round(s.z_score * 10) / 10, percentile: s.percentile, level: s.level })) },
        ).then((text) => { if (text) setAiText(text); }).catch(() => {});
      }
    })();
  }, []);

  const applyToProfile = async () => {
    if (!result) return;
    const profile: UserProfile = {
      assessment_date: result.date,
      domain_scores: result.scores.reduce((acc, s) => {
        acc[s.domain] = s.z_score;
        return acc;
      }, {} as Record<Domain, number>),
      weak_domains: result.weak,
      strong_domains: result.strong,
      recommended_focus: recommendations,
      applied_to_playlist: false,  // future: F3 adaptive playlist will read this
    };
    await saveUserProfile(profile);
    setApplied(true);
    setTimeout(() => router.replace('/' as any), 1500);
  };

  const goHome = () => router.replace('/' as any);
  const replay = () => warmup.startAssessment();

  /**
   * 🔴 ПОД ОБОЛОЧКОЙ ИТОГ ОЦЕНКИ РИСУЕТ FLUTTER (задача 455d71b1, `services/hostScreens.ts`).
   * Расчёт, сохранение итога и остановка батареи остаются здесь (эффект выше) — натив только
   * рисует модель: тексты, цвета уровней, геометрию радара (`radarGeometry` — та же, что у SVG).
   */
  const resultModel = useMemo(() => {
    if (!result) return { v: 1, loading: t('calcResults') };
    return {
      v: 1,
      loading: null,
      hero: {
        emoji: '🎯', title: t('cogProfileTitle'), subtitle: `${result.date} · ${t('domains12')}`,
        gradient: GRADIENT, color: ON_GRAD.color, soft: ON_GRAD_SOFT,
        // Вуаль контраста `GradientSurface` (плашка и кнопка «Сохранить» — на том же градиенте).
        veil: ON_GRAD.veil ? withAlpha(ON_GRAD.veil, ON_GRAD.veilAlpha) : null,
      },
      radar: radarGeometry(result.scores, language),
      domainsTitle: t('byDomain'),
      domains: result.scores.map((s) => {
        const dom = DOMAINS.find(d => d.id === s.domain)!;
        return {
          id: s.domain,
          label: language === 'ru' ? dom.label_ru : dom.label_en,
          meta: `z = ${s.z_score >= 0 ? '+' : ''}${s.z_score.toFixed(1)} · ${t('percentileN').replace('{n}', String(s.percentile))}`,
          color: levelColor(s.level),
          badge: s.level === 'weak' ? t('domainWeak') : s.level === 'strong' ? t('domainStrong') : t('domainAvg'),
        };
      }),
      ai: aiText ? { title: `✨ ${t('insightTitle')}`, text: aiText, color: GRADIENT[0] } : null,
      recsTitle: `💡 ${t('recommendedGames')}`,
      recs: recommendations.flatMap((gameId) => {
        const g = GAMES.find(x => x.id === gameId);
        return g ? [{ id: gameId, name: t(g.nameKey), icon: g.icon, color: g.gradient[0] }] : [];
      }),
      applied,
      save: { label: t('saveProfileBtn'), color: ON_GRAD.color },
      saved: { label: t('profileSavedBtn'), bg: '#22c55e', color: textOn('#22c55e') },
      home: t('goHome'),
      footnote: t('assessRepeatNote'),
    };
  }, [result, recommendations, aiText, applied, language, t]);
  useEffect(() => { postScreenModel('/assessment-result', resultModel); }, [resultModel]);
  // Свежие обработчики для действий оболочки (пересоздаются рендером; действия регистрируются один раз).
  const resultActs = useRef({ applyToProfile, goHome });
  useEffect(() => { resultActs.current = { applyToProfile, goHome }; });
  useEffect(() => registerScreenActions('/assessment-result', {
    apply: () => { void resultActs.current.applyToProfile(); },
    home: () => resultActs.current.goHome(),
  }), []);

  if (!result) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.empty}>
          <Text style={{ color: colors.text }}>{t('calcResults')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <GradientSurface colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.hero}>
          <Text style={styles.heroEmoji}>🎯</Text>
          <Text style={[styles.heroTitle, { color: ON_GRAD.color }]}>{t('cogProfileTitle')}</Text>
          <Text style={[styles.heroSubtitle, { color: ON_GRAD_SOFT }]}>{result.date} · {t('domains12')}</Text>
        </GradientSurface>

        {/* Radar chart */}
        <View style={[styles.section, { alignItems: 'center' }]}>
          <RadarChart scores={result.scores} language={language} />
        </View>

        {/* Per-domain list */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('byDomain')}</Text>
          {result.scores.map((s) => {
            const dom = DOMAINS.find(d => d.id === s.domain)!;
            const color = levelColor(s.level);
            return (
              <View key={s.domain} style={[styles.row, { backgroundColor: colors.surface }]}>
                <View style={[styles.rowDot, { backgroundColor: color }]} />
                <View style={styles.rowMain}>
                  <Text style={[styles.rowDomain, { color: colors.text }]}>
                    {language === 'ru' ? dom.label_ru : dom.label_en}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                    z = {s.z_score >= 0 ? '+' : ''}{s.z_score.toFixed(1)} · {t('percentileN').replace('{n}', String(s.percentile))}
                  </Text>
                </View>
                <View style={[styles.levelBadge, { backgroundColor: color }]}>
                  <Text style={styles.levelText}>
                    {s.level === 'weak' ? t('domainWeak') : s.level === 'strong' ? t('domainStrong') : t('domainAvg')}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ИИ-разбор — связный текст поверх статичного списка доменов, аддитивно */}
        {aiText && (
          <View style={[styles.aiCard, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
            <Text style={[styles.aiTitle, { color: GRADIENT[0] }]}>✨ {t('insightTitle')}</Text>
            <Text style={[styles.aiText, { color: colors.text }]}>{aiText}</Text>
          </View>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              💡 {t('recommendedGames')}
            </Text>
            <View style={styles.recsRow}>
              {recommendations.map((gameId) => {
                const g = GAMES.find(x => x.id === gameId);
                if (!g) return null;
                return (
                  <View key={gameId} style={[styles.recChip, { backgroundColor: colors.surface, borderColor: g.gradient[0] }]}>
                    <Ionicons name={g.icon as any} size={16} color={g.gradient[0]} />
                    <Text style={[styles.recText, { color: colors.text }]}>{t(g.nameKey)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Apply / actions */}
        <View style={styles.actions}>
          {!applied ? (
            <TouchableOpacity
              accessibilityRole="button" style={styles.btn} onPress={applyToProfile}>
              <GradientSurface colors={GRADIENT as [string, string]} style={styles.btnGrad}>
                <Ionicons name="checkmark-circle" size={20} color={ON_GRAD.color} />
                <Text style={[styles.btnText, { color: ON_GRAD.color }]}>{t('saveProfileBtn')}</Text>
              </GradientSurface>
            </TouchableOpacity>
          ) : (
            <View style={[styles.btn, { backgroundColor: '#22c55e' }]}>
              <View style={styles.btnGrad}>
                <Ionicons name="checkmark" size={20} color={textOn('#22c55e')} />
                <Text style={[styles.btnText, { color: textOn('#22c55e') }]}>{t('profileSavedBtn')}</Text>
              </View>
            </View>
          )}
          <TouchableOpacity
            accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={goHome}>
            <Text style={[styles.btnTextSecondary, { color: colors.text }]}>{t('goHome')}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          {t('assessRepeatNote')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Radar chart component ────────────────────────────────────────────────

/**
 * Геометрия радара: кольца, оси, многоугольник, точки и подписи — числами. Одна для SVG ниже и
 * для нативной оболочки (модель экрана): у Flutter своего расчёта нет. Вынесено 07.10.2026.
 */
export function radarGeometry(scores: readonly { domain: string; z_score: number; level: string }[], language: string) {
  const SIZE = 320;
  const cx = SIZE / 2;
  const cy = SIZE / 2;
  const maxR = SIZE / 2 - 50;
  const n = scores.length;

  // z-scores in [-3, 3] → r in [0, maxR]; z=0 maps to maxR/2 (avg)
  const zToR = (z: number) => {
    const t = Math.max(0, Math.min(1, (z + 2) / 4));  // -2..2 maps to 0..1
    return t * maxR;
  };

  const angle = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;

  // Reference rings: z=-2, -1, 0, +1, +2
  const ringZs = [-2, -1, 0, 1, 2];
  const lblR = maxR + 18;
  return {
    size: SIZE, cx, cy,
    rings: ringZs.map((z) => ({
      r: zToR(z), color: z === 0 ? '#fbbf24' : '#1e1e3a', width: z === 0 ? 1.5 : 0.5, dashed: z !== 0,
    })),
    axes: scores.map((_, i) => ({ x: cx + maxR * Math.cos(angle(i)), y: cy + maxR * Math.sin(angle(i)) })),
    poly: scores.map((s, i) => {
      const r = zToR(s.z_score);
      return { x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) };
    }),
    points: scores.map((s, i) => {
      const r = zToR(s.z_score);
      return { x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)), color: levelColor(s.level) };
    }),
    labels: scores.map((s, i) => {
      const dom = DOMAINS.find(d => d.id === s.domain)!;
      return {
        x: cx + lblR * Math.cos(angle(i)), y: cy + lblR * Math.sin(angle(i)),
        text: (language === 'ru' ? dom.label_ru : dom.label_en).slice(0, 12),
      };
    }),
  };
}

function RadarChart({ scores, language }: { scores: any[]; language: string }) {
  const g = radarGeometry(scores, language);
  return (
    <Svg width={g.size} height={g.size}>
      <G>
        {/* concentric reference circles */}
        {g.rings.map((ring, i) => (
          <Circle key={i} cx={g.cx} cy={g.cy} r={ring.r} fill="none"
            stroke={ring.color} strokeWidth={ring.width} strokeDasharray={ring.dashed ? '3,3' : ''} />
        ))}
        {/* axis lines */}
        {g.axes.map((a, i) => (
          <Line key={'a'+i} x1={g.cx} y1={g.cy} x2={a.x} y2={a.y} stroke="#1e1e3a" strokeWidth={0.5} />
        ))}
        {/* data polygon */}
        <Polygon points={g.poly.map((p) => `${p.x},${p.y}`).join(' ')} fill="rgba(124,58,237,0.25)" stroke="#7c3aed" strokeWidth={2} />
        {/* data points */}
        {g.points.map((p, i) => <Circle key={'p'+i} cx={p.x} cy={p.y} r={4} fill={p.color} stroke="#fff" strokeWidth={1} />)}
        {/* labels */}
        {g.labels.map((l, i) => (
          <SvgText key={'l'+i} x={l.x} y={l.y} fontSize="9" fill="#94a3b8" textAnchor="middle" alignmentBaseline="middle">
            {l.text}
          </SvgText>
        ))}
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 18, gap: 14, maxWidth: 540, alignSelf: 'center', width: '100%' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  hero: { padding: 22, borderRadius: 16, alignItems: 'center', gap: 6 },
  heroEmoji: { fontSize: 44 },
  heroTitle: { color: '#FFF', fontSize: 18, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  heroSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '700' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginLeft: 4, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 10, gap: 10 },
  rowDot: { width: 4, height: 36, borderRadius: 2 },
  rowMain: { flex: 1 },
  rowDomain: { fontSize: 14, fontWeight: '700' },
  rowMeta: { fontSize: 11, marginTop: 2 },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  levelText: { color: '#000', fontSize: 10, fontWeight: '900' },
  aiCard: { padding: 14, borderRadius: 12, borderWidth: 1.5, gap: 6 },
  aiTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  aiText: { fontSize: 14, lineHeight: 21 },
  recsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  recChip: { minHeight: 48, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5 },
  recText: { fontSize: 12, fontWeight: '700' },
  actions: { gap: 10, marginTop: 8 },
  btn: { minHeight: 48, justifyContent: 'center', borderRadius: 16, overflow: 'hidden' },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  btnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  btnTextSecondary: { fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
  footnote: { fontSize: 11, textAlign: 'center', fontStyle: 'italic', marginTop: 8 },
});
