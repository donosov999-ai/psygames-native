/**
 * LevelRules (v1.112.0) — универсальная справка «что за правило на этом уровне».
 * Родилась из судоку-кейса Вали (анти-конь включался молча): аудит нашёл 18 механик
 * в 14 играх, которые появляются с уровнем без объяснения (обратный ввод, лимит
 * ходов, новые операторы, dual n-back, тройки в парах, слои маджонга...).
 *
 * Использование в игре:
 *   const RULES: LevelRule[] = [
 *     { key: 'reverse', fromLevel: 10, ru: {title:'Обратный порядок', rule:'…', example:'…'}, en: {...} },
 *   ];
 *   const lr = useLevelRules('corsi', level, RULES, phase === 'playing');
 *   …в статус-бар: <LevelRuleBadge lr={lr} color={...} />
 *   …в корень:     <LevelRuleModal lr={lr} colors={colors} ru={language==='ru'} />
 *
 * Авто-показ: при первом входе на уровень ≥ fromLevel правила (AsyncStorage-флаг
 * psygames_rulehint_<gameId>_<key>), дальше — тап по бейджу «ⓘ».
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface LevelRuleText { title: string; rule: string; example?: string }
export interface LevelRule {
  key: string;               // стабильный ключ для «уже видел»-флага
  fromLevel: number;         // с какого уровня действует
  toLevel?: number;          // включительно (по умолчанию — до конца)
  ru: LevelRuleText;
  en: LevelRuleText;
}

export interface LevelRulesState {
  active: LevelRule | null;  // правило текущего уровня (последнее подошедшее)
  open: boolean;
  setOpen: (v: boolean) => void;
}

export function useLevelRules(gameId: string, level: number, rules: LevelRule[], enabled: boolean): LevelRulesState {
  const [open, setOpen] = useState(false);
  const active = [...rules].reverse().find((r) => level >= r.fromLevel && (r.toLevel === undefined || level <= r.toLevel)) ?? null;

  useEffect(() => {
    if (!enabled || !active) return;
    const flag = `psygames_rulehint_${gameId}_${active.key}`;
    AsyncStorage.getItem(flag).then((seen) => {
      if (!seen) { setOpen(true); AsyncStorage.setItem(flag, '1').catch(() => {}); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, active?.key, gameId]);

  return { active, open, setOpen };
}

/** Бейдж «⚡ ⓘ» в статус-бар игры — виден только когда на уровне есть спец-правило. */
export function LevelRuleBadge({ lr, color, ru }: { lr: LevelRulesState; color: string; ru: boolean }) {
  if (!lr.active) return null;
  const title = ru ? lr.active.ru.title : lr.active.en.title;
  return (
    <TouchableOpacity onPress={() => lr.setOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
      <Text style={{ fontSize: 14, fontWeight: '700', color }} numberOfLines={1}>⚡ {title} ⓘ</Text>
    </TouchableOpacity>
  );
}

export function LevelRuleModal({ lr, colors, ru }: { lr: LevelRulesState; colors: any; ru: boolean }) {
  if (!lr.open || !lr.active) return null;
  const t = ru ? lr.active.ru : lr.active.en;
  return (
    <View style={st.backdrop}>
      <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={st.emoji}>⚡</Text>
        <Text style={[st.title, { color: colors.text }]}>{t.title}</Text>
        <Text style={[st.rule, { color: colors.text }]}>{t.rule}</Text>
        {t.example ? <Text style={[st.example, { color: colors.textSecondary }]}>{t.example}</Text> : null}
        <TouchableOpacity style={st.okBtn} onPress={() => lr.setOpen(false)} activeOpacity={0.85}>
          <Text style={st.okText}>{ru ? 'ПОНЯТНО' : 'GOT IT'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', zIndex: 300, padding: 20 },
  card: { width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 22, alignItems: 'center', gap: 10 },
  emoji: { fontSize: 40 },
  title: { fontSize: 20, fontWeight: '900', textAlign: 'center' },
  rule: { fontSize: 15, fontWeight: '600', textAlign: 'center', lineHeight: 22 },
  example: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
  okBtn: { marginTop: 6, alignSelf: 'stretch', backgroundColor: '#7f7fd5', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  okText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
});
