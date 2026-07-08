/**
 * G1 — Assessment Result Screen
 *
 * Renders:
 *  1. Radar chart (12 axes, one per cognitive domain) showing z-scores
 *  2. Per-domain breakdown with weak/avg/strong tags
 *  3. Recommendations: which games to focus on
 *  4. "Apply to playlist" button — saves user profile + (future) modulates warmup playlist
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import Svg, { Polygon, Line, Circle, Text as SvgText, G } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useWarmup, StepResult } from '@/src/contexts/WarmupContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import { GAMES } from '@/src/constants/games';
import {
  scoreSessions, buildRecommendations, saveAssessmentResult, saveUserProfile,
  AssessmentResult, DOMAINS, Domain, UserProfile,
} from '@/src/services/assessment';
import { getAiInsight, toneForProfile } from '@/src/services/aiInsight';
import type { GameSession } from '@/src/services/api';

const GRADIENT = ['#7c3aed', '#ec4899'];

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
      // Convert warmup results to fake GameSession-like objects for scoring
      const sessions: GameSession[] = warmup.results.map((r: StepResult) => ({
        game_type: r.game_type,
        score: r.score,
        time_seconds: r.time_seconds,
        errors: r.errors,
        details: r.details,
      }));
      const res = scoreSessions(sessions);
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

  if (!result) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.empty}>
          <Text style={{ color: colors.text }}>{language === 'ru' ? 'Считаем результаты...' : 'Calculating results...'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient colors={GRADIENT as [string, string]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.hero}>
          <Text style={styles.heroEmoji}>🎯</Text>
          <Text style={styles.heroTitle}>{language === 'ru' ? 'ТВОЙ КОГНИТИВНЫЙ ПРОФИЛЬ' : 'YOUR COGNITIVE PROFILE'}</Text>
          <Text style={styles.heroSubtitle}>{result.date} · {language === 'ru' ? '12 доменов' : '12 domains'}</Text>
        </LinearGradient>

        {/* Radar chart */}
        <View style={[styles.section, { alignItems: 'center' }]}>
          <RadarChart scores={result.scores} language={language} />
        </View>

        {/* Per-domain list */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{language === 'ru' ? 'По доменам' : 'By domain'}</Text>
          {result.scores.map((s) => {
            const dom = DOMAINS.find(d => d.id === s.domain)!;
            const color = s.level === 'weak' ? '#f43f5e' : s.level === 'strong' ? '#22c55e' : '#fbbf24';
            return (
              <View key={s.domain} style={[styles.row, { backgroundColor: colors.surface }]}>
                <View style={[styles.rowDot, { backgroundColor: color }]} />
                <View style={styles.rowMain}>
                  <Text style={[styles.rowDomain, { color: colors.text }]}>
                    {language === 'en' ? dom.label_en : dom.label_ru}
                  </Text>
                  <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                    z = {s.z_score >= 0 ? '+' : ''}{s.z_score.toFixed(1)} · {language === 'ru' ? `${s.percentile}-й перцентиль` : `${s.percentile}th percentile`}
                  </Text>
                </View>
                <View style={[styles.levelBadge, { backgroundColor: color }]}>
                  <Text style={styles.levelText}>
                    {language === 'ru'
                      ? (s.level === 'weak' ? 'СЛАБО' : s.level === 'strong' ? 'СИЛЬНО' : 'СРЕД')
                      : (s.level === 'weak' ? 'WEAK' : s.level === 'strong' ? 'STRONG' : 'AVG')}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ИИ-разбор — связный текст поверх статичного списка доменов, аддитивно */}
        {aiText && (
          <View style={[styles.aiCard, { backgroundColor: colors.surface, borderColor: GRADIENT[0] }]}>
            <Text style={[styles.aiTitle, { color: GRADIENT[0] }]}>✨ {language === 'ru' ? 'РАЗБОР' : 'INSIGHT'}</Text>
            <Text style={[styles.aiText, { color: colors.text }]}>{aiText}</Text>
          </View>
        )}

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              💡 {language === 'ru' ? 'Рекомендованные игры (для слабых доменов)' : 'Recommended games (for weak domains)'}
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
            <TouchableOpacity style={styles.btn} onPress={applyToProfile}>
              <LinearGradient colors={GRADIENT as [string, string]} style={styles.btnGrad}>
                <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                <Text style={styles.btnText}>{language === 'ru' ? 'СОХРАНИТЬ ПРОФИЛЬ' : 'SAVE PROFILE'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={[styles.btn, { backgroundColor: '#22c55e' }]}>
              <View style={styles.btnGrad}>
                <Ionicons name="checkmark" size={20} color="#FFF" />
                <Text style={styles.btnText}>{language === 'ru' ? 'ПРОФИЛЬ СОХРАНЁН ✓' : 'PROFILE SAVED ✓'}</Text>
              </View>
            </View>
          )}
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={goHome}>
            <Text style={[styles.btnTextSecondary, { color: colors.text }]}>{language === 'ru' ? 'На главную' : 'Home'}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.footnote, { color: colors.textSecondary }]}>
          {language === 'ru'
            ? 'Повторный прогон через 3 месяца покажет реальный прогресс по каждому домену.'
            : 'A repeat run in 3 months will show real progress in each domain.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Radar chart component ────────────────────────────────────────────────

function RadarChart({ scores, language }: { scores: any[]; language: string }) {
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

  // Polygon points for actual scores
  const dataPts = scores.map((s, i) => {
    const r = zToR(s.z_score);
    return `${cx + r * Math.cos(angle(i))},${cy + r * Math.sin(angle(i))}`;
  }).join(' ');

  // Reference rings: z=-2, -1, 0, +1, +2
  const ringZs = [-2, -1, 0, 1, 2];

  return (
    <Svg width={SIZE} height={SIZE}>
      <G>
        {/* concentric reference circles */}
        {ringZs.map((z, i) => (
          <Circle key={i} cx={cx} cy={cy} r={zToR(z)} fill="none"
            stroke={z === 0 ? '#fbbf24' : '#1e1e3a'} strokeWidth={z === 0 ? 1.5 : 0.5} strokeDasharray={z === 0 ? '' : '3,3'} />
        ))}
        {/* axis lines */}
        {scores.map((_, i) => (
          <Line key={'a'+i} x1={cx} y1={cy}
            x2={cx + maxR * Math.cos(angle(i))} y2={cy + maxR * Math.sin(angle(i))}
            stroke="#1e1e3a" strokeWidth={0.5} />
        ))}
        {/* data polygon */}
        <Polygon points={dataPts} fill="rgba(124,58,237,0.25)" stroke="#7c3aed" strokeWidth={2} />
        {/* data points */}
        {scores.map((s, i) => {
          const r = zToR(s.z_score);
          const x = cx + r * Math.cos(angle(i));
          const y = cy + r * Math.sin(angle(i));
          const c = s.level === 'weak' ? '#f43f5e' : s.level === 'strong' ? '#22c55e' : '#fbbf24';
          return <Circle key={'p'+i} cx={x} cy={y} r={4} fill={c} stroke="#fff" strokeWidth={1} />;
        })}
        {/* labels */}
        {scores.map((s, i) => {
          const dom = DOMAINS.find(d => d.id === s.domain)!;
          const lblR = maxR + 18;
          const x = cx + lblR * Math.cos(angle(i));
          const y = cy + lblR * Math.sin(angle(i));
          return (
            <SvgText key={'l'+i} x={x} y={y} fontSize="9" fill="#94a3b8" textAnchor="middle" alignmentBaseline="middle">
              {(language === 'en' ? dom.label_en : dom.label_ru).slice(0, 12)}
            </SvgText>
          );
        })}
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
  recChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1.5 },
  recText: { fontSize: 12, fontWeight: '700' },
  actions: { gap: 10, marginTop: 8 },
  btn: { borderRadius: 12, overflow: 'hidden' },
  btnGrad: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  btnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  btnTextSecondary: { fontSize: 14, fontWeight: '700', textAlign: 'center', paddingVertical: 14 },
  footnote: { fontSize: 11, textAlign: 'center', fontStyle: 'italic', marginTop: 8 },
});
