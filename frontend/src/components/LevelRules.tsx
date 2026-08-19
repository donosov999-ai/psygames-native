/**
 * LevelRules (v1.130.0) — универсальная справка «что за правило на этом уровне».
 * Родилась из судоку-кейса Вали (анти-конь включался молча): аудит нашёл 18 механик
 * в 14 играх, которые появляются с уровнем без объяснения (обратный ввод, лимит
 * ходов, новые операторы, dual n-back, тройки в парах, слои маджонга...).
 *
 * 🔴 ПОЧЕМУ ТЕКСТ ПРАВИЛ ЖИВЁТ В СЛОВАРЕ, А НЕ РЯДОМ С ИГРОЙ (v1.130.0).
 * До этой правки тип был `{ ru: LevelRuleText; en: LevelRuleText }`, а окно выбирало
 * `ru ? .ru : .en`. В приложении ДВЕНАДЦАТЬ языков — значит десять из них читали
 * объяснение новой механики по-английски. Это не подпись кнопки: правило говорит,
 * во что человек играет, и без него игра молча меняет условия.
 *
 * Рассматривали три пути:
 *   1) расширить тип до карты всех 12 языков прямо в играх — 43 правила × 12 языков
 *      инлайном раздувают игровые экраны на ~40 строк каждое правило, и каждое новое
 *      правило платит ту же цену. Плюс четыре экрана сейчас правят другие — их файлы
 *      не тронуть, а тип обязателен для всех;
 *   2) ключи словаря + общий t() — правило переводится ровно тем же механизмом, что и
 *      весь остальной интерфейс, и попадает под УЖЕ СУЩЕСТВУЮЩИЙ гейт i18n-coverage
 *      (он требует ноль пропусков во всех десяти локалях). Цена следующего правила
 *      равна цене любой другой строки приложения;
 *   3) отдельный файл-словарь только для правил — то же самое, но со своим механизмом
 *      загрузки, своим гейтом и своим списком локалей, то есть второй i18n рядом с первым.
 * Взяли (2): ноль нового механизма, чужие файлы не нужны, будущие правила закрыты
 * бесплатно. Ключ собирается из gameId и key правила: lr_<game>_<rule>_<title|rule|example>.
 *
 * Использование в игре:
 *   const RULES: LevelRule[] = [{ key: 'reverse', fromLevel: 10 }];
 *   // тексты: lr_<gameId>_reverse_title / _rule / _example в LanguageContext + translations/*
 *   const lr = useLevelRules('corsi', level, RULES, phase === 'playing');
 *   …в статус-бар: <LevelRuleBadge lr={lr} color={...} />
 *   …в корень:     <LevelRuleModal lr={lr} colors={colors} />
 *
 * Авто-показ: при первом входе на уровень ≥ fromLevel правила (AsyncStorage-флаг
 * psygames_rulehint_<gameId>_<key>), дальше — тап по бейджу «ⓘ».
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage, translateFor } from '@/src/contexts/LanguageContext';

export interface LevelRuleText { title: string; rule: string; example?: string }
export interface LevelRule {
  key: string;               // стабильный ключ для «уже видел»-флага И для ключей словаря
  fromLevel: number;         // с какого уровня действует
  toLevel?: number;          // включительно (по умолчанию — до конца)
  /**
   * ⚠️ УСТАРЕЛО, НЕ ЗАВОДИТЬ В НОВЫХ ПРАВИЛАХ. Инлайн-текст на двух языках — то самое,
   * ради чего затевалась правка: он знает ru/en и не знает остальные десять. Поля
   * оставлены временно, пока четыре экрана (mahjong, goods-sort, picture-pairs,
   * set-game) заняты другими правками и их нельзя тронуть. Тексты этих правил УЖЕ
   * лежат в словаре и берутся оттуда — инлайн ниже мёртв и ждёт удаления.
   * Гейт level-rules-i18n сторожит, чтобы список таких экранов только сокращался
   * и чтобы инлайн не разъезжался со словарём.
   */
  ru?: LevelRuleText;
  en?: LevelRuleText;
}

export interface LevelRulesState {
  gameId: string;            // нужен окну и бейджу, чтобы собрать ключ словаря
  active: LevelRule | null;  // правило текущего уровня (последнее подошедшее)
  open: boolean;
  setOpen: (v: boolean) => void;
}

/** Ключ словаря для поля правила. Единственное место, где он собирается, — на него
 *  же смотрит гейт, иначе «ключ есть, но не тот» проходит незамеченным. */
export function levelRuleKey(gameId: string, ruleKey: string, field: 'title' | 'rule' | 'example'): string {
  return `lr_${gameId}_${ruleKey}_${field}`;
}

/**
 * Текст правила на текущем языке. Порядок: словарь → инлайн-остаток (ru/en) → пусто.
 * translateFor на неизвестном ключе возвращает САМ КЛЮЧ — по этому и отличаем «нет в
 * словаре» от «переведено»; показать игроку `lr_corsi_reverse_title` было бы хуже,
 * чем показать английский.
 */
export function levelRuleText(language: string, gameId: string, rule: LevelRule): LevelRuleText {
  const fromDict = (field: 'title' | 'rule' | 'example'): string | undefined => {
    const k = levelRuleKey(gameId, rule.key, field);
    const v = translateFor(language, k);
    return v === k ? undefined : v;
  };
  const legacy = language === 'ru' ? (rule.ru ?? rule.en) : (rule.en ?? rule.ru);
  return {
    title: fromDict('title') ?? legacy?.title ?? '',
    rule: fromDict('rule') ?? legacy?.rule ?? '',
    example: fromDict('example') ?? legacy?.example,
  };
}

/**
 * Какое правило действует на уровне. Вынесено из хука отдельной функцией, чтобы гейт
 * проверял НАСТОЯЩИЙ выбор, а не свою копию его логики: правило, спрятанное чужим
 * диапазоном, не показывается никогда, и заметить это можно только прогнав выбор.
 * Побеждает ПОСЛЕДНЕЕ подошедшее — правила пишутся по возрастанию fromLevel.
 */
export function activeLevelRule(rules: LevelRule[], level: number): LevelRule | null {
  return [...rules].reverse().find((r) => level >= r.fromLevel && (r.toLevel === undefined || level <= r.toLevel)) ?? null;
}

export function useLevelRules(gameId: string, level: number, rules: LevelRule[], enabled: boolean): LevelRulesState {
  const [open, setOpen] = useState(false);
  const active = activeLevelRule(rules, level);

  useEffect(() => {
    if (!enabled || !active) return;
    const flag = `psygames_rulehint_${gameId}_${active.key}`;
    AsyncStorage.getItem(flag).then((seen) => {
      if (!seen) { setOpen(true); AsyncStorage.setItem(flag, '1').catch(() => {}); }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, active?.key, gameId]);

  return { gameId, active, open, setOpen };
}

/** Бейдж «⚡ ⓘ» в статус-бар игры — виден только когда на уровне есть спец-правило.
 *  ⚠️ `ru` больше ни на что не влияет (язык берётся из словаря) — проп оставлен, чтобы
 *  не трогать вызовы в экранах, которые сейчас правят другие. Новые вызовы его не пишут. */
export function LevelRuleBadge({ lr, color }: { lr: LevelRulesState; color: string; ru?: boolean }) {
  const { language } = useLanguage();
  if (!lr.active) return null;
  const { title } = levelRuleText(language, lr.gameId, lr.active);
  return (
    <TouchableOpacity
      accessibilityRole="button" onPress={() => lr.setOpen(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} activeOpacity={0.7}>
      <Text style={{ fontSize: 14, fontWeight: '700', color }} numberOfLines={1}>⚡ {title} ⓘ</Text>
    </TouchableOpacity>
  );
}

export function LevelRuleModal({ lr, colors }: { lr: LevelRulesState; colors: any; ru?: boolean }) {
  const { language, t } = useLanguage();
  if (!lr.open || !lr.active) return null;
  const txt = levelRuleText(language, lr.gameId, lr.active);
  return (
    <View style={st.backdrop}>
      <View style={[st.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={st.emoji}>⚡</Text>
        <Text style={[st.title, { color: colors.text }]}>{txt.title}</Text>
        <Text style={[st.rule, { color: colors.text }]}>{txt.rule}</Text>
        {txt.example ? <Text style={[st.example, { color: colors.textSecondary }]}>{txt.example}</Text> : null}
        <TouchableOpacity
          accessibilityRole="button" style={st.okBtn} onPress={() => lr.setOpen(false)} activeOpacity={0.85}>
          <Text style={st.okText}>{t('ctaGotIt')}</Text>
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
  okBtn: { minHeight: 48, justifyContent: 'center', marginTop: 6, alignSelf: 'stretch', backgroundColor: '#7f7fd5', borderRadius: 16, paddingVertical: 13, alignItems: 'center' },
  okText: { color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 1 },
});
