/**
 * FeedbackWidget — плавающая кнопка «сообщить» для тестировщиков.
 *
 * Зачем: закрытый тест Google Play (12 тестировщиков). Человек открыл игру,
 * не понял что делать → жмёт кнопку → пишет «непонятно, добавьте справку» →
 * фидбек + скриншот падают в Supabase (app_feedback + бакет feedback-shots).
 *
 * Гейт: FEEDBACK_ENABLED в src/services/appFeedback.ts — выключить перед
 * публичным релизом (или оставить только для тест-канала).
 *
 * Позиция: слева снизу — «?»-справка (GameHelpOverlay) висит справа сверху,
 * не конфликтуем.
 *
 * ВАЖНО: скриншот снимается ДО открытия шторки, иначе в кадр попадёт сама
 * шторка, а не экран, на который жалуется тестировщик.
 */
import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, ScrollView, DeviceEventEmitter,
} from 'react-native';
import { DEVCHAT_VISIBLE_EVENT } from '@/src/services/pet';
import { GAME_PAUSE_EVENT, FEEDBACK_OPEN_EVENT } from '@/src/services/appFeedback';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import {
  FEEDBACK_ENABLED, getDevChatVisible, captureScreenshot, sendFeedback,
  type FeedbackKind, type SendResult,
} from '@/src/services/appFeedback';
import { isRTLLang } from '@/src/services/rtl';
import { a11yModal } from '@/src/services/a11y';
import { canRecord, startRecording, SILENCE_PEAK, type Recorder, type VoiceNote } from '@/src/services/voiceNote';

const KINDS: { key: FeedbackKind; emoji: string; labelKey: string }[] = [
  { key: 'confusion', emoji: '🤷', labelKey: 'fbKindConfusion' },
  { key: 'bug',       emoji: '🐞', labelKey: 'fbKindBug' },
  { key: 'idea',      emoji: '💡', labelKey: 'fbKindIdea' },
];

export default function FeedbackWidget() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { profile } = useProfile();
  const pathname = usePathname() || '';
  // RTL: кнопка зеркалится к правому краю (а «?»-справка уходит влево) — не конфликтуем
  const rtl = isRTLLang(language);

  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<FeedbackKind>('confusion');
  const [text, setText] = React.useState('');
  const [shot, setShot] = React.useState<Blob | null>(null);
  // v1.166 (идея Дениса «нажал и записал: нихуя не понимаю что делать»):
  // голосовая заметка РЯДОМ с текстом. Валя диктует всё голосом, и до нас
  // доезжает распознавание её телефона — «глубоко запечатательное дыхание»
  // вместо «диафрагмальное». Оригинал звука снимает этот слой потерь.
  const [rec, setRec] = React.useState<Recorder | null>(null);
  const [recSec, setRecSec] = React.useState(0);
  const [note, setNote] = React.useState<VoiceNote | null>(null);
  const [micDenied, setMicDenied] = React.useState(false);
  /** Запись получилась, но звука в ней нет — микрофон не отдал сэмплы. */
  const [micSilent, setMicSilent] = React.useState(false);

  /** Проигрывание записи перед отправкой — единственная честная проверка, что голос попал. */
  const [playing, setPlaying] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  React.useEffect(() => () => {
    // URL блоба живёт до отзыва: не отзовём — утечёт память на каждой перезаписи.
    try { audioRef.current?.pause(); } catch { /* уже мёртв */ }
    if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src);
  }, []);

  const playNote = () => {
    if (!note) return;
    if (audioRef.current && playing) { try { audioRef.current.pause(); } catch { /* */ } setPlaying(false); return; }
    try {
      if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src);
      const a = audioRef.current ?? new Audio();
      a.src = URL.createObjectURL(note.blob);
      a.onended = () => setPlaying(false);
      a.onerror = () => setPlaying(false);
      audioRef.current = a;
      a.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } catch { setPlaying(false); }
  };

  const toggleRecord = async () => {
    if (rec) {
      const v = await rec.stop();
      setRec(null); setRecSec(0);
      if (v) setNote(v);
      // Немая запись — не молчим об этом. Две Валины заметки уехали полностью
      // немыми (замер: −91 дБ, цифровая тишина), и по интерфейсу это выглядело
      // как успешная отправка. Лучше сказать сразу, чем принять три минуты в пустоту.
      setMicSilent(!!v && v.peak < SILENCE_PEAK);
      return;
    }
    setMicDenied(false); setMicSilent(false);
    try {
      setNote(null);
      setRec(await startRecording(setRecSec));
    } catch {
      // Отказ в микрофоне — не ошибка: человек просто пишет текстом.
      setMicDenied(true);
    }
  };
  const [attachShot, setAttachShot] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  // Что именно уехало — показываем на экране «спасибо». Без этого голосовой
  // репорт уходил вслепую: значок 🙏 выглядел одинаково и когда запись дошла,
  // и когда потерялась (репорт Rulon, v1.170).
  const [outcome, setOutcome] = React.useState<SendResult | null>(null);
  // html2canvas снимает 1-3 сек. Без индикации тестировщик решит, что кнопка
  // не сработала, и натыкает ещё (проверено вживую) → спиннер + защита от дабл-тапа.
  const [capturing, setCapturing] = React.useState(false);
  // Уровень запущенной игры для контекста репорта. Приближение: читаем сам
  // ключ прогресса usePersistentLevel (`psygames_<gameId>_level_<profileId>`),
  // а не живое состояние экрана — обычно совпадает. null = не игра/нет прогресса.
  const [level, setLevel] = React.useState<number | null>(null);
  // v1.125.0: пользователь может скрыть кнопку галочкой в настройках («кнопка мешается
  // в игре»). Перечитываем при навигации; v1.148 — плюс живое событие из настроек
  // (репорт Rulon: тумблер «не работал», пока не уйдёшь с экрана).
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    getDevChatVisible().then((on) => setHidden(!on)).catch(() => {});
  }, [pathname]);
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(DEVCHAT_VISIBLE_EVENT, (on: boolean) => setHidden(!on));
    return () => sub.remove();
  }, []);

  /**
   * 🔴 Подписка на «открой виджет» ДОЛЖНА стоять ДО возврата ниже.
   *
   * Раньше она была под ним, и это роняло ВСЁ ПРИЛОЖЕНИЕ, стоило человеку выключить
   * кнопку отзыва в настройках: пока кнопка видна, хуков больше; скрыли — на два
   * меньше, число не сходится, и React валит экран «Rendered fewer hooks than
   * expected». Не только виджет — весь экран, на любом маршруте.
   *
   * Замер 12.08.2026: чистый браузер, единственное действие — psygames_devchat_on=0.
   * Главная падает сразу. Нашлось при съёмке скриншотов для магазина, когда кнопку
   * потребовалось убрать из кадра.
   *
   * Через ref, а не прямым захватом openSheet: подписка живёт одна на всё время жизни
   * виджета, а openSheet читает текущий экран, игру и уровень. Захвати мы его напрямую
   * с пустыми зависимостями — репорт уезжал бы с данными первого рендера, то есть
   * с чужой игрой и чужим уровнем.
   */
  const openSheetRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener(FEEDBACK_OPEN_EVENT, () => { openSheetRef.current(); });
    return () => sub.remove();
  }, []);

  if (!FEEDBACK_ENABLED || hidden) return null;

  const gameId = pathname.startsWith('/games/')
    ? pathname.replace('/games/', '').replace(/\/+$/, '') || undefined
    : undefined;

  const openSheet = async () => {
    if (capturing) return;                 // защита от дабл-тапа во время съёмки
    setCapturing(true);
    const s = await captureScreenshot();   // снимаем ДО показа шторки
    setCapturing(false);
    setShot(s);
    // Читаем сохранённый уровень запущенной игры по тому же ключу, что и
    // usePersistentLevel — чтобы в репорт попало «на каком уровне застряли».
    let lvl: number | null = null;
    if (gameId) {
      try {
        const raw = await AsyncStorage.getItem(`psygames_${gameId}_level_${profile.id}`);
        const n = parseInt(raw ?? '', 10);
        if (Number.isFinite(n)) lvl = n;
      } catch {}
    }
    setLevel(lvl);
    setKind('confusion');
    // Текст НЕ чистим при открытии — только после успешной отправки.
    // «Начал писать — решил посмотреть экран — вернулся, а поле пустое»: репорт
    // с v1.121. Человек закрывает окно именно чтобы свериться с тем, на что
    // жалуется, и терять из-за этого написанное — ровно то поведение, из-за
    // которого перестают писать вообще.
    setAttachShot(true);
    setSent(false);
    setOpen(true);
    DeviceEventEmitter.emit(GAME_PAUSE_EVENT, true);   // игра на паузу, пока пишут отзыв
  };

  /**
   * Открытие снаружи: из окна правил, которое накрывает плавающую кнопку собой.
   *
   * Через ref, а не прямым захватом openSheet: подписка живёт одна на всё время
   * жизни виджета, а openSheet читает текущий экран, игру и уровень. Захвати мы
   * его напрямую с пустыми зависимостями — репорт уезжал бы с данными первого
   * рендера, то есть с чужой игрой и чужим уровнем.
   */
  openSheetRef.current = openSheet;

  const submit = async () => {
    // Голосом БЕЗ текста — полноценный репорт: ради этого запись и делали.
    // Раньше здесь стояло `if (!text.trim())`, а кнопка при этом была активна,
    // если есть запись, — человек жал «Отправить», не происходило ничего, и он
    // решал, что отзывы не уходят (репорт Rulon, v1.170). Условие должно
    // совпадать с условием доступности кнопки, иначе кнопка врёт.
    if ((!text.trim() && !note) || sending) return;
    setSending(true);
    const res = await sendFeedback({
      kind,
      // Пустое сообщение читается в выгрузке как «потерялось»; ставим явную
      // пометку, чтобы было видно: смысл в записи, расшифровать её.
      message: text.trim() || '[голосом, без текста]',
      screen: pathname,
      gameId,
      shot: attachShot ? shot : null,
      audio: note ? { blob: note.blob, seconds: note.seconds, mime: note.mime } : null,
      // profile/level — чтобы в репорте было видно, под каким профилем и на
      // каком уровне игры это словили (не гадать по скриншоту).
      context: {
        language, theme: colors.background,
        profile: profile.id, profileName: profile.display_name,
        level,
      },
    });
    setSending(false);
    // Очередь — тоже успех для человека: написанное сохранено и уйдёт само.
    // Ошибкой считаем только случай, когда не сохранили вообще ничего.
    if (res.ok || res.queued) {
      setOutcome(res);
      setSent(true);
      setText('');   // единственное место, где черновик стирается — после доставки
      setNote(null);
      // Дольше 1.3 с: тут теперь есть что прочитать, а не один значок.
      // Закрыть можно и раньше — крестик остаётся на месте.
      setTimeout(() => { setOpen(false); setShot(null); DeviceEventEmitter.emit(GAME_PAUSE_EVENT, false); }, 3200);
    } else {
      setText((t) => t);   // оставляем текст, чтобы не потерять написанное
      alert(t('feedbackSendFailed'));
    }
  };

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        onPress={openSheet}
        activeOpacity={0.85}
        accessibilityLabel={t('feedbackFabLabel')}
        style={[styles.fab, rtl ? { right: 14 } : { left: 14 }, { bottom: insets.bottom + 92, backgroundColor: '#ef4444' }]}
      >
        {capturing
          ? <ActivityIndicator size="small" color="#fff" />
          : <Ionicons name="chatbubble-ellipses" size={19} color="#fff" />}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => { setOpen(false); DeviceEventEmitter.emit(GAME_PAUSE_EVENT, false); }}>
        <View {...a11yModal} style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {t('feedbackTitle')}
                </Text>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('a11yClose')}
                  onPress={() => { setOpen(false); DeviceEventEmitter.emit(GAME_PAUSE_EVENT, false); }} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {sent ? (
                <View style={styles.thanks}>
                  <Text style={{ fontSize: 44 }}>{outcome?.audioLost ? '⚠️' : '🙏'}</Text>
                  <Text style={[styles.title, { color: colors.text, textAlign: 'center' }]}>
                    {outcome?.queued ? t('feedbackQueued') : t('feedbackThanks')}
                  </Text>
                  {/* Судьба записи — отдельной строкой и словами. «Спасибо» само
                      по себе не отличает «голос у нас» от «голос потерялся». */}
                  {outcome?.audioSent && (
                    <Text style={[styles.outcomeLine, { color: colors.textSecondary }]}>
                      🎤 {t('feedbackAudioSent')}
                    </Text>
                  )}
                  {outcome?.audioLost && (
                    <Text style={[styles.outcomeLine, { color: '#e0574a' }]}>
                      {t('feedbackAudioLost')}
                    </Text>
                  )}
                </View>
              ) : (
                <>
                  {/* Контекст репорта: профиль · игра · уровень — тестировщику
                      видно, что уедет вместе с текстом (и это же летит в context). */}
                  <Text numberOfLines={1} style={[styles.ctx, { color: colors.textSecondary }]}>
                    {[
                      `👤 ${profile.display_name}`,
                      gameId ? `🎮 ${gameId}` : null,
                      gameId && level != null ? `${t('unitLevelShort')} ${level}` : null,
                    ].filter(Boolean).join('  ·  ')}
                  </Text>
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    {t('feedbackHint')}
                  </Text>

                  <View style={styles.kinds}>
                    {KINDS.map((k) => {
                      const on = kind === k.key;
                      return (
                        <TouchableOpacity
                          accessibilityRole="button"
                          key={k.key}
                          onPress={() => setKind(k.key)}
                          style={[
                            styles.kindBtn,
                            on ? { backgroundColor: '#ef4444', borderColor: '#ef4444' }
                               : { backgroundColor: colors.card, borderColor: colors.border },
                          ]}
                        >
                          <Text style={{ fontSize: 15 }}>{k.emoji}</Text>
                          {/* flexShrink+numberOfLines: при крупном шрифте подпись
                              усекается внутри трети-кнопки, а не ломает ряд */}
                          <Text numberOfLines={1} style={{ color: on ? '#fff' : colors.text, fontWeight: '700', fontSize: 12, flexShrink: 1 }}>
                            {t(k.labelKey)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <TextInput
                    value={text}
                    onChangeText={setText}
                    multiline
                    autoFocus
                    placeholder={t('feedbackPlaceholder')}
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                  />

                  {canRecord() && (
                    <View style={{ gap: 6 }}>
                      <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel={rec ? t('voiceStop') : t('voiceRecord')}
                        onPress={toggleRecord}
                        style={[styles.shotRow, { borderColor: rec ? '#ef4444' : colors.border }]}
                      >
                        <Ionicons
                          name={rec ? 'stop-circle' : note ? 'checkmark-circle' : 'mic-outline'}
                          size={20}
                          color={rec ? '#ef4444' : note ? '#22c55e' : colors.textSecondary}
                        />
                        <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                          {rec
                            ? `${t('voiceStop')} · ${Math.floor(recSec / 60)}:${String(recSec % 60).padStart(2, '0')}`
                            : note
                              ? `${t('voiceAttached')} · ${note.seconds} ${t('unitSecShort')}`
                              : t('voiceRecord')}
                        </Text>
                        {note && !rec && (
                          <Ionicons
                            name="close-circle-outline" size={19} color={colors.textSecondary}
                            onPress={() => setNote(null)}
                          />
                        )}
                      </TouchableOpacity>
                      {/* Прослушать ДО отправки. Пороги громкости отличают тишину от звука,
                          но не голос от шума: четыре заметки от 07.08 имели пик −1.2 дБ и не
                          содержали речи — щелчки и шорох рук. Человек говорил больше минуты
                          и получил «спасибо» за пустоту. Ухо решает это за секунду, никакой
                          порог не нужен. */}
                      {note && !rec && (
                        <TouchableOpacity
                          accessibilityRole="button"
                          accessibilityLabel={t('voicePlay')}
                          onPress={playNote}
                          style={[styles.shotRow, { borderColor: colors.border }]}
                        >
                          <Ionicons
                            name={playing ? 'pause-circle' : 'play-circle'}
                            size={20}
                            color={colors.textSecondary}
                          />
                          <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>{t('voicePlay')}</Text>
                        </TouchableOpacity>
                      )}
                      {micDenied && (
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('voiceDenied')}</Text>
                      )}
                      {micSilent && !micDenied && (
                        <Text style={{ color: '#b45309', fontSize: 12, fontWeight: '700' }}>{t('voiceSilent')}</Text>
                      )}
                      {note && !rec && !micSilent && (
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{t('voiceCheckHint')}</Text>
                      )}
                    </View>
                  )}

                  {shot && (
                    <TouchableOpacity
                      accessibilityRole="button"
                      onPress={() => setAttachShot((v) => !v)}
                      style={[styles.shotRow, { borderColor: colors.border }]}
                    >
                      <Ionicons
                        name={attachShot ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={attachShot ? '#22c55e' : colors.textSecondary}
                      />
                      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                        {t('feedbackAttachShot')}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    accessibilityRole="button"
                    onPress={submit}
                    disabled={(!text.trim() && !note) || sending}
                    style={[styles.send, { backgroundColor: (text.trim() || note) ? '#ef4444' : colors.border }]}
                  >
                    {sending
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.sendText}>{t('send')}</Text>}
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Слева (в RTL — справа, сторона задаётся в рендере) и ПОДНЯТА над нижними CTA
  // («Справка»/«Начать» на интро-экранах игр — проверено вживую: на bottom+16
  // кнопка налезала на «Справку»). «?»-оверлей висит с противоположной стороны
  // сверху — туда не лезем.
  fab: {
    position: 'absolute',
    width: 42,
    height: 42,
    borderRadius: 21,
    opacity: 0.92,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '88%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 19, fontWeight: '800' },
  ctx: { fontSize: 12, fontWeight: '700', marginBottom: 4 },   // строка контекста: профиль · игра · уровень
  hint: { fontSize: 12, marginBottom: 12, lineHeight: 17 },
  kinds: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kindBtn: { minHeight: 48,
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 16, borderWidth: 1.5,
  },
  input: {
    borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15,
    minHeight: 110, textAlignVertical: 'top', marginBottom: 12,
  },
  shotRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14,
  },
  send: { paddingVertical: 15, borderRadius: 12, alignItems: 'center' },
  sendText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  thanks: { alignItems: 'center', gap: 10, paddingVertical: 30 },
  outcomeLine: { fontSize: 13.5, fontWeight: '700', textAlign: 'center', paddingHorizontal: 16 },
});
