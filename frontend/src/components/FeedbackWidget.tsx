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
  ActivityIndicator, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { useProfile } from '@/src/contexts/ProfileContext';
import {
  FEEDBACK_ENABLED, getDevChatVisible, captureScreenshot, sendFeedback, type FeedbackKind,
} from '@/src/services/appFeedback';

const KINDS: { key: FeedbackKind; emoji: string; ru: string; en: string }[] = [
  { key: 'confusion', emoji: '🤷', ru: 'Непонятно',  en: 'Confusing' },
  { key: 'bug',       emoji: '🐞', ru: 'Не работает', en: 'Broken' },
  { key: 'idea',      emoji: '💡', ru: 'Идея',        en: 'Idea' },
];

export default function FeedbackWidget() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { profile } = useProfile();
  const pathname = usePathname() || '';
  const ru = language === 'ru';

  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<FeedbackKind>('confusion');
  const [text, setText] = React.useState('');
  const [shot, setShot] = React.useState<Blob | null>(null);
  const [attachShot, setAttachShot] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  // html2canvas снимает 1-3 сек. Без индикации тестировщик решит, что кнопка
  // не сработала, и натыкает ещё (проверено вживую) → спиннер + защита от дабл-тапа.
  const [capturing, setCapturing] = React.useState(false);
  // Уровень запущенной игры для контекста репорта. Приближение: читаем сам
  // ключ прогресса usePersistentLevel (`psygames_<gameId>_level_<profileId>`),
  // а не живое состояние экрана — обычно совпадает. null = не игра/нет прогресса.
  const [level, setLevel] = React.useState<number | null>(null);
  // v1.125.0: пользователь может скрыть кнопку галочкой в настройках («кнопка мешается
  // в игре»). Перечитываем при навигации — после выхода из настроек кнопка обновится.
  const [hidden, setHidden] = React.useState(false);
  React.useEffect(() => {
    getDevChatVisible().then((on) => setHidden(!on)).catch(() => {});
  }, [pathname]);

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
    setText('');
    setAttachShot(true);
    setSent(false);
    setOpen(true);
  };

  const submit = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    const ok = await sendFeedback({
      kind,
      message: text.trim(),
      screen: pathname,
      gameId,
      shot: attachShot ? shot : null,
      // profile/level — чтобы в репорте было видно, под каким профилем и на
      // каком уровне игры это словили (не гадать по скриншоту).
      context: {
        language, theme: colors.background,
        profile: profile.id, profileName: profile.display_name,
        level,
      },
    });
    setSending(false);
    if (ok) {
      setSent(true);
      setTimeout(() => { setOpen(false); setShot(null); }, 1300);
    } else {
      setText((t) => t);   // оставляем текст, чтобы не потерять написанное
      alert(ru ? 'Не удалось отправить. Проверь интернет и попробуй ещё раз.'
               : 'Failed to send. Check your connection and try again.');
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={openSheet}
        activeOpacity={0.85}
        accessibilityLabel={ru ? 'Сообщить о проблеме' : 'Send feedback'}
        style={[styles.fab, { bottom: insets.bottom + 92, backgroundColor: '#ef4444' }]}
      >
        {capturing
          ? <ActivityIndicator size="small" color="#fff" />
          : <Ionicons name="chatbubble-ellipses" size={19} color="#fff" />}
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
            <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
              <View style={styles.header}>
                <Text style={[styles.title, { color: colors.text }]}>
                  {ru ? '💬 Что не так?' : '💬 What’s wrong?'}
                </Text>
                <TouchableOpacity onPress={() => setOpen(false)} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={28} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              {sent ? (
                <View style={styles.thanks}>
                  <Text style={{ fontSize: 44 }}>🙏</Text>
                  <Text style={[styles.title, { color: colors.text, textAlign: 'center' }]}>
                    {ru ? 'Спасибо! Отправлено.' : 'Thanks! Sent.'}
                  </Text>
                </View>
              ) : (
                <>
                  {/* Контекст репорта: профиль · игра · уровень — тестировщику
                      видно, что уедет вместе с текстом (и это же летит в context). */}
                  <Text numberOfLines={1} style={[styles.ctx, { color: colors.textSecondary }]}>
                    {[
                      `👤 ${profile.display_name}`,
                      gameId ? `🎮 ${gameId}` : null,
                      gameId && level != null ? `${ru ? 'ур.' : 'lv'} ${level}` : null,
                    ].filter(Boolean).join('  ·  ')}
                  </Text>
                  <Text style={[styles.hint, { color: colors.textSecondary }]}>
                    {ru ? 'Пиши как есть, даже коротко' : 'Write it as is, even briefly'}
                  </Text>

                  <View style={styles.kinds}>
                    {KINDS.map((k) => {
                      const on = kind === k.key;
                      return (
                        <TouchableOpacity
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
                            {ru ? k.ru : k.en}
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
                    placeholder={ru
                      ? 'Например: открыл игру и не понял, что делать — нужна кнопка со справкой'
                      : 'E.g.: opened the game and had no idea what to do — need a help button'}
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, { color: colors.text, borderColor: colors.border, backgroundColor: colors.card }]}
                  />

                  {shot && (
                    <TouchableOpacity
                      onPress={() => setAttachShot((v) => !v)}
                      style={[styles.shotRow, { borderColor: colors.border }]}
                    >
                      <Ionicons
                        name={attachShot ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={attachShot ? '#22c55e' : colors.textSecondary}
                      />
                      <Text style={{ color: colors.text, fontSize: 13, flex: 1 }}>
                        {ru ? '📷 Приложить скриншот этого экрана' : '📷 Attach a screenshot of this screen'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={submit}
                    disabled={!text.trim() || sending}
                    style={[styles.send, { backgroundColor: text.trim() ? '#ef4444' : colors.border }]}
                  >
                    {sending
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.sendText}>{ru ? 'Отправить' : 'Send'}</Text>}
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
  // Слева и ПОДНЯТА над нижними CTA («Справка»/«Начать» на интро-экранах игр —
  // проверено вживую: на bottom+16 кнопка налезала на «Справку»). Справа сверху
  // висит «?»-оверлей — туда не лезем.
  fab: {
    position: 'absolute',
    left: 14,
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
  kindBtn: {
    flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 10, borderWidth: 1.5,
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
});
