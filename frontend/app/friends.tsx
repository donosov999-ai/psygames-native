/* psygames-friends-screen · VER 1 · 21.08.2026 */
/**
 * ЭКРАН «ДРУЗЬЯ» — ВИД НА УЖЕ ОПУБЛИКОВАННЫЕ ОЧКИ, И НИЧЕГО СВЕРХ ТОГО.
 *
 * 🔴 ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ ПО ЗАМЫСЛУ. Ни «друг тренировался сегодня», ни
 * стриков круга, ни «последний раз заходил вчера». Этих данных на сервере нет:
 * приложение отправляет ровно две вещи — отчёты о проблемах и очки зачётной
 * партии, которую человек сам положил в таблицу рекордов. История тренировок
 * целиком лежит на устройстве. Витрина со стриками потребовала бы вынести на
 * сервер ежедневную активность КАЖДОГО и переписать Data Safety в Play — это
 * отдельное решение владельца с отдельной ценой, а не побочный эффект дружбы.
 * Поэтому экран не знает про историю ничего и не импортирует её сервисы —
 * `friends-screen.test.ts` за этим следит.
 *
 * ⚠️ ПРАВИЛО «ЧТО РИСОВАТЬ» ЖИВЁТ В СЕРВИСЕ, А НЕ ЗДЕСЬ. `friendsView` различает
 * пять состояний (`loading` / `offline` / `no-friends` / `nobody-played` /
 * `rows`), и у каждого свой текст. Слепить три пустоты в одно «Пока пусто» —
 * это ровно та беда, от которой ушёл лидерборд: человек с пятью друзьями и без
 * связи читал бы то же самое, что новичок. Здесь только `switch` по `kind`;
 * своих `friends.length === 0` в разметке быть не должно.
 *
 * ⚠️ ПОЧЕМУ ШЕСТЬ ИГР ПОКАЗАНЫ РЯДОМ ЧИПАМИ, А НЕ ШЕСТЬЮ ТАБЛИЦАМИ И НЕ СПИСКОМ
 * ВЫБОРА. `friendsTop` спрашивает ОДНУ игру, и это не ограничение, а плата:
 *   · шесть таблиц сразу — это шесть запросов на открытие экрана, из которых
 *     сегодня минимум четыре вернут «в эту игру никто не играл» (в боевой
 *     таблице рекордов заполнены две игры из шести). Экран превратился бы в
 *     стену извинений, а в РФ, где домен режется, — в шесть таймаутов подряд;
 *   · выпадающий список прячет сам факт, что игр шесть: человек открывает
 *     экран, видит одну таблицу и про переключение не узнаёт никогда.
 * Ряд чипов показывает все шесть сразу, тратит один запрос за раз и честно
 * говорит, какая игра сейчас на экране.
 *
 * ⚠️ ПОЧЕМУ ОТКРЫВАЕТСЯ ПЕРВАЯ ИГРА СПИСКА, А НЕ «ТА, ГДЕ У МЕНЯ ЕСТЬ РЕКОРД».
 * Умный выбор по личному рекорду (он лежит в AsyncStorage, сети не требует) был
 * написан и ПРОВАЛИЛСЯ на живой сборке: подсветка вставала на пятый чип, а ряд
 * оставался прокручен в начало — на экране подсвечено НИЧЕГО, и таблица
 * читалась как неизвестно чья. Довести до конца мешала прокрутка: `scrollTo` из
 * `onLayout` и `onContentSizeChange` в вебе не срабатывал (замер 21.08:
 * `scrollLeft` оставался нулём при ряде в 1051 точку). Выбор был между умной
 * догадкой с невидимой подсветкой и честной первой игрой — взята вторая: она
 * всегда на виду, а остальные пять в одном касании. Сам случай «в эту игру круг
 * не играл» экран называет по имени и прямо зовёт выбрать другую.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { isRTLLang } from '@/src/services/rtl';
import { goBackOrHome } from '@/src/utils/nav';
import { a11yBtn, a11yHeader } from '@/src/services/a11y';
import { LEADERBOARD_GAMES, LeaderboardGameId } from '@/src/services/leaderboard';
import {
  addFriendByCode, friendsTop, friendsView, getMyInviteCode, isCodeComplete,
  listFriends, normalizeCode, removeFriend, CODE_LEN,
  type AddResult, type Friend, type FriendScore,
} from '@/src/services/friends';

const GAME_IDS = Object.keys(LEADERBOARD_GAMES) as LeaderboardGameId[];

/**
 * Подпись чипа — ключ словаря из каталога игр. Тип `Record<LeaderboardGameId, …>`
 * взят нарочно: седьмая зачётная игра, добавленная в `LEADERBOARD_GAMES`, уронит
 * сборку здесь, а не оставит на экране чип без названия.
 * `schulte_table_5x5` в каталоге зовётся `schulte_table` — размер вшит в имя
 * только у рекорда, чтобы 4×4 не попадало в одну таблицу с 5×5.
 */
const NAME_KEY: Record<LeaderboardGameId, string> = {
  schulte_table_5x5: 'schulteTable',
  n_back: 'nBack',
  digit_span: 'digitSpan',
  corsi: 'corsi',
  trail_making: 'trailMaking',
  choice_rt: 'choiceRt',
};

/**
 * 🔴 ЕДИНИЦЫ ОБЯЗАНЫ СОВПАДАТЬ С ТЕМИ, ЧТО ИГРА ПОКАЗЫВАЕТ В СВОЁМ ЛИДЕРБОРДЕ.
 * Каждая игра отдаёт `LeaderboardModal` свой `formatScore`; здесь те же шесть
 * записей. Копия опасна не тем, что копия, а тем, что расходится МОЛЧА: у
 * `choice_rt` очко — миллисекунды, и «1500.0s» вместо «1500 ms» человек прочтёт
 * как чужой мир, а не как ошибку. Гейт `friends-screen.test.ts` сверяет обе
 * стороны выражение в выражение.
 */
const FORMAT: Record<LeaderboardGameId, (s: number) => string> = {
  schulte_table_5x5: (s) => `${s.toFixed(1)}s`,
  n_back: (s) => `${s}-back`,
  digit_span: (s) => String(Math.round(s)),
  corsi: (s) => String(Math.round(s)),
  trail_making: (s) => `${s.toFixed(1)}s`,
  choice_rt: (s) => `${Math.round(s)} ms`,
};

/** Код диктуют голосом и переписывают с чужого экрана — читаем группами по три. */
function grouped(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

export default function FriendsScreen() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();

  // `undefined` — ещё не спрашивали, `null` — спросить не вышло. Разница
  // читается в friendsView и в тексте про свой код; схлопывать её нельзя.
  const [myCode, setMyCode] = useState<string | null | undefined>(undefined);
  const [friends, setFriends] = useState<Friend[] | null | undefined>(undefined);
  const [rows, setRows] = useState<FriendScore[] | null | undefined>(undefined);
  const [game, setGame] = useState<LeaderboardGameId>(GAME_IDS[0]);
  const [draft, setDraft] = useState('');
  const [added, setAdded] = useState<AddResult | null>(null);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState<'ok' | 'fail' | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [dropFailed, setDropFailed] = useState(false);

  const loadCircle = useCallback(() => {
    let alive = true;
    getMyInviteCode().then((c) => { if (alive) setMyCode(c); });
    listFriends().then((f) => { if (alive) setFriends(f); });
    return () => { alive = false; };
  }, []);

  useFocusEffect(loadCircle);

  // Таблица перезапрашивается и при смене игры, и после правки круга: круг
  // изменился — состав строк тоже.
  useEffect(() => {
    let alive = true;
    setRows(undefined);
    friendsTop(game).then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [game, friends]);

  const onCopy = useCallback(async () => {
    if (!myCode) return;
    // Alert.alert на web — пустышка (react-native-web/dist/exports/Alert: тело
    // метода пустое), поэтому подтверждение показываем строкой на экране.
    try {
      await (navigator as any)?.clipboard?.writeText(myCode);
      setCopied('ok');
    } catch {
      setCopied('fail');
    }
  }, [myCode]);

  const onAdd = useCallback(async () => {
    if (!isCodeComplete(draft) || sending) return;
    setSending(true);
    setAdded(null);
    const res = await addFriendByCode(draft);
    setAdded(res);
    setSending(false);
    if (res.kind === 'added') {
      setDraft('');
      listFriends().then(setFriends);
    }
  }, [draft, sending]);

  const onDrop = useCallback(async (id: string) => {
    setPending(null);
    setDropFailed(false);
    const ok = await removeFriend(id);
    if (ok) listFriends().then(setFriends);
    else setDropFailed(true);
  }, []);

  const view = friendsView(friends, rows);
  const back = isRTLLang(language) ? 'chevron-forward' : 'chevron-back';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <TouchableOpacity {...a11yBtn(t('a11yBack'))} onPress={() => goBackOrHome()} style={styles.backBtn}>
          <Ionicons name={back as any} size={24} color={colors.text} />
        </TouchableOpacity>
        <Text {...a11yHeader()} style={[styles.title, { color: colors.text }]}>{t('friendsTitle')}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* ── Мой код ─────────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('friendsMyCode')}</Text>
          {myCode === undefined ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
          ) : myCode === null ? (
            /* Пустое место человек прочтёт как «кода у меня нет». Говорим про связь. */
            <Text style={[styles.warn, { color: colors.error }]}>{t('friendsCodeOffline')}</Text>
          ) : (
            <>
              <Text selectable style={[styles.code, { color: colors.text }]}>{grouped(myCode)}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onCopy}
                style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="copy-outline" size={17} color="#fff" />
                <Text style={styles.primaryBtnText}>{t('copy')}</Text>
              </TouchableOpacity>
              {copied !== null && (
                <Text style={[styles.note, { color: copied === 'ok' ? colors.success : colors.textSecondary }]}>
                  {copied === 'ok' ? t('copied') : t('copyManually')}
                </Text>
              )}
              {/* «Продиктуйте этот код» имеет смысл, только когда код на экране;
                  рядом с сообщением о связи это была бы просьба показать пустоту. */}
              <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('friendsMyCodeHint')}</Text>
            </>
          )}
        </View>

        {/* ── Чужой код ───────────────────────────────────────────────────── */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>{t('friendsAddTitle')}</Text>
          <TextInput
            value={draft}
            /* Нормализует сервис — пробелы, дефисы и регистр это тот же код. */
            onChangeText={(v) => { setDraft(normalizeCode(v).slice(0, CODE_LEN)); setAdded(null); }}
            placeholder={t('friendsCodePlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoCapitalize="characters"
            autoCorrect={false}
            accessibilityLabel={t('friendsAddTitle')}
            style={[styles.input, {
              color: colors.text, backgroundColor: colors.background, borderColor: colors.border,
            }]}
          />
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityState={{ disabled: !isCodeComplete(draft) || sending }}
            disabled={!isCodeComplete(draft) || sending}
            onPress={onAdd}
            style={[styles.primaryBtn, {
              backgroundColor: colors.primary,
              opacity: isCodeComplete(draft) && !sending ? 1 : 0.4,
            }]}
          >
            {sending
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>{t('friendsAddBtn')}</Text>}
          </TouchableOpacity>
          {/* 🔴 Три исхода — три РАЗНЫХ сообщения. «Нет связи» ≠ «кода нет»: во
              втором случае человек ищет опечатку, в первом ждать нечего. */}
          {added?.kind === 'added' && (
            <Text style={[styles.note, { color: colors.success }]}>
              {t('friendsAdded').replace('{name}', added.friend.name)}
            </Text>
          )}
          {added?.kind === 'not-found' && (
            <Text style={[styles.note, { color: colors.error }]}>{t('friendsNotFound')}</Text>
          )}
          {added?.kind === 'offline' && (
            <Text style={[styles.note, { color: colors.error }]}>{t('friendsAddOffline')}</Text>
          )}
        </View>

        {/* ── Таблица круга по одной игре ─────────────────────────────────── */}
        <Text style={[styles.section, { color: colors.text }]}>{t('friendsTableTitle')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {GAME_IDS.map((id) => {
            const on = id === game;
            return (
              <TouchableOpacity
                key={id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setGame(id)}
                style={[styles.chip, {
                  backgroundColor: on ? colors.primary : colors.surface,
                  borderColor: on ? colors.primary : colors.border,
                }]}
              >
                <Text style={[styles.chipText, { color: on ? '#fff' : colors.text }]} numberOfLines={1}>
                  {t(NAME_KEY[id])}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {view.kind === 'loading' && <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} />}
          {view.kind === 'offline' && (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('friendsViewOffline')}</Text>
          )}
          {view.kind === 'no-friends' && (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>{t('friendsViewNoFriends')}</Text>
          )}
          {view.kind === 'nobody-played' && (
            <Text style={[styles.empty, { color: colors.textSecondary }]}>
              {t('friendsViewNobodyPlayed').replace('{game}', t(NAME_KEY[game]))}
            </Text>
          )}
          {view.kind === 'rows' && view.rows.map((r, i) => (
            <View
              key={r.id}
              style={[styles.row, {
                borderColor: colors.border,
                backgroundColor: r.isMe ? colors.primary + '18' : 'transparent',
              }]}
            >
              <Text style={[styles.rank, { color: colors.textSecondary }]}>{i + 1}</Text>
              <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                {r.isMe ? `${r.name} · ${t('friendsMe')}` : r.name}
              </Text>
              <Text style={[styles.score, { color: colors.primary }]}>{FORMAT[game](r.score)}</Text>
            </View>
          ))}
        </View>

        {/* Честная сноска: экран показывает опубликованные очки, и только их. */}
        <Text style={[styles.hint, { color: colors.textSecondary }]}>{t('friendsScoresOnly')}</Text>

        {/* ── Круг и разрыв ───────────────────────────────────────────────── */}
        {friends != null && friends.length > 0 && (
          <>
            <Text style={[styles.section, { color: colors.text }]}>
              {t('friendsCircle').replace('{n}', String(friends.length))}
            </Text>
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {friends.map((f) => (
                <View key={f.id} style={[styles.row, { borderColor: colors.border, flexWrap: 'wrap' }]}>
                  <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{f.name}</Text>
                  <TouchableOpacity
                    {...a11yBtn(t('friendsRemove'))}
                    onPress={() => { setPending(f.id); setDropFailed(false); }}
                    style={styles.dropBtn}
                  >
                    <Ionicons name="person-remove-outline" size={19} color={colors.error} />
                  </TouchableOpacity>
                  {/* 🔴 Подтверждение обязано сказать про ВЗАИМНОСТЬ: сервер сносит
                      обе строки связи, и человек, который «просто уберёт из своего
                      списка», исчезнет и из чужого. Разворачиваем прямо в строке —
                      Alert.alert в вебе не показывает ничего. */}
                  {pending === f.id && (
                    <View style={styles.confirm}>
                      <Text style={[styles.warn, { color: colors.text }]}>
                        {t('friendsRemoveMutual').replace('{name}', f.name)}
                      </Text>
                      <View style={styles.confirmBtns}>
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => onDrop(f.id)}
                          style={[styles.dangerBtn, { backgroundColor: colors.error }]}
                        >
                          <Text style={styles.primaryBtnText}>{t('friendsRemoveConfirm')}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          accessibilityRole="button"
                          onPress={() => setPending(null)}
                          style={[styles.ghostBtn, { borderColor: colors.border }]}
                        >
                          <Text style={{ color: colors.text, fontWeight: '700' }}>{t('btn_cancel')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              ))}
              {dropFailed && (
                <Text style={[styles.note, { color: colors.error }]}>{t('friendsRemoveFailed')}</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8 },
  backBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  body: { padding: 16, gap: 10, paddingBottom: 48 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  label: { fontSize: 12.5, letterSpacing: 0.4, textTransform: 'uppercase', fontWeight: '700' },
  // Моноширинный и разрядкой: код переписывают знак в знак, «слипшийся» ряд
  // из шести символов путают на первом же звонке.
  code: {
    fontSize: 32, fontWeight: '900', letterSpacing: 4, textAlign: 'center',
    fontVariant: ['tabular-nums'],
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  hint: { fontSize: 12.5, lineHeight: 18 },
  warn: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  note: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  input: {
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, minHeight: 48,
    fontSize: 20, letterSpacing: 3, fontWeight: '800', textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    minHeight: 48, borderRadius: 10, paddingHorizontal: 14,
  },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  section: { fontSize: 15, fontWeight: '800', marginTop: 8 },
  chips: { gap: 8, paddingVertical: 2, paddingRight: 8 },
  chip: { borderWidth: 1.5, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  chipText: { fontSize: 13, fontWeight: '700' },
  empty: { fontSize: 13.5, lineHeight: 20, paddingVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1 },
  rank: { width: 22, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  name: { flex: 1, fontSize: 14, fontWeight: '700', minWidth: 0 },
  score: { fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dropBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  confirm: { width: '100%', gap: 8, paddingTop: 4, paddingBottom: 6 },
  confirmBtns: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  dangerBtn: { minHeight: 44, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 16 },
  ghostBtn: { minHeight: 44, justifyContent: 'center', borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 16 },
});
