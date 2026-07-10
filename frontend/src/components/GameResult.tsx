import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/src/contexts/ThemeContext';
import { useLanguage } from '@/src/contexts/LanguageContext';
import { sndWin } from '@/src/services/feedback';
import { tokenDelta } from '@/src/services/tokens';
import { shareResult } from '@/src/services/share';
import ResultSparkline from '@/src/components/ResultSparkline';

interface GameResultProps {
  time?: number;
  score?: number;
  errors?: number;
  stars?: number;   // 1–3 звезды за прохождение; не передан → выводится из errors
  gradient: string[];
  onPlayAgain: () => void;
  onGoHome: () => void;
  shareText?: string;   // v1.116.0: если передан — показать кнопку «Поделиться» с этим текстом
  sparkline?: { history: number[]; current: number; lowerIsBetter?: boolean };   // v1.116.0: спарклайн последних сессий
}

// Перцептивная яркость градиента → на СВЕТЛОМ берём тёмный текст, на тёмном белый.
// Фикс «белый шрифт на светлом градиенте не читается» (Корректура и пр. светлые игры).
function gradientIsLight(grad: string[]): boolean {
  const lum = (hex: string) => {
    const h = (hex || '').replace('#', '');
    if (h.length < 6) return 0.5;
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  };
  const avg = grad.reduce((s, c) => s + lum(c), 0) / Math.max(1, grad.length);
  return avg > 0.62;
}

export default function GameResult({
  time,
  score,
  errors,
  stars,
  gradient,
  onPlayAgain,
  onGoHome,
  shareText,
  sparkline,
}: GameResultProps) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const [shareNote, setShareNote] = useState<string | null>(null);
  const light = gradientIsLight(gradient);
  const fg = light ? '#1a1a1a' : '#FFFFFF';
  const fgSoft = light ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.8)';

  const handleShare = async () => {
    if (!shareText) return;
    const outcome = await shareResult(shareText);
    if (outcome === 'copied') { setShareNote(t('shareCopied')); setTimeout(() => setShareNote(null), 2500); }
  };
  // T1: видимый заработок токенов — ТОТ ЖЕ tokenDelta, что начисляет saveSession (совпадает 1:1)
  const earned = score !== undefined ? tokenDelta(score, errors ?? 0) : 0;
  // Звёзды за прохождение (1–3): передан stars — рисуем его, иначе выводим из ошибок (0=3, ≤2=2, иначе 1).
  const shownStars = stars ?? (errors !== undefined ? (errors === 0 ? 3 : errors <= 2 ? 2 : 1) : undefined);
  useEffect(() => { sndWin(); }, []);   // фанфары при показе экрана результата (завершение)

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
    }
    return `${secs}.${ms} ${t('seconds')}`;
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={gradient as [string, string]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.resultCard}
      >
        <Ionicons name="trophy" size={64} color={fg} />
        <Text style={[styles.title, { color: fg }]}>{t('complete')}</Text>

        {shownStars !== undefined && (
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {[1, 2, 3].map((i) => (
              <Ionicons key={i} name={i <= shownStars ? 'star' : 'star-outline'} size={40} color={i <= shownStars ? '#FFD93B' : fgSoft} />
            ))}
          </View>
        )}

        <View style={styles.statsContainer}>
          {time !== undefined && (
            <View style={styles.statItem}>
              <Ionicons name="time-outline" size={24} color={fg} />
              <Text style={[styles.statLabel, { color: fgSoft }]}>{t('yourTime')}</Text>
              <Text style={[styles.statValue, { color: fg }]}>{formatTime(time)}</Text>
            </View>
          )}

          {score !== undefined && (
            <View style={styles.statItem}>
              <Ionicons name="star" size={24} color={fg} />
              <Text style={[styles.statLabel, { color: fgSoft }]}>{t('yourScore')}</Text>
              <Text style={[styles.statValue, { color: fg }]}>{score}</Text>
            </View>
          )}

          {errors !== undefined && (
            <View style={styles.statItem}>
              <Ionicons name="close-circle-outline" size={24} color={fg} />
              <Text style={[styles.statLabel, { color: fgSoft }]}>{t('errors')}</Text>
              <Text style={[styles.statValue, { color: fg }]}>{errors}</Text>
            </View>
          )}
        </View>

        {earned > 0 && (
          <View style={{ marginTop: 20, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: light ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.18)', paddingVertical: 10, paddingHorizontal: 18, borderRadius: 999 }}>
            <Text style={{ fontSize: 22 }}>⭐</Text>
            <Text style={{ color: fg, fontSize: 20, fontWeight: '900' }}>+{earned}</Text>
            <Text style={{ color: fgSoft, fontSize: 13, fontWeight: '600' }}>{language === 'ru' ? 'заработано' : 'earned'}</Text>
          </View>
        )}
        {sparkline && (
          <ResultSparkline
            history={sparkline.history}
            current={sparkline.current}
            lowerIsBetter={sparkline.lowerIsBetter}
            language={language}
            color={fg}
          />
        )}
      </LinearGradient>

      <View style={styles.buttonsContainer}>
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={onPlayAgain}
        >
          <Ionicons name="refresh" size={20} color="#FFFFFF" />
          <Text style={styles.buttonText}>{t('playAgain')}</Text>
        </TouchableOpacity>

        {shareText && (
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
            onPress={handleShare}
          >
            <Ionicons name="share-social-outline" size={20} color={colors.text} />
            <Text style={[styles.buttonText, { color: colors.text }]}>{shareNote ?? t('shareResult')}</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
          onPress={onGoHome}
        >
          <Ionicons name="home" size={20} color={colors.text} />
          <Text style={[styles.buttonText, { color: colors.text }]}>{t('goHome')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  resultCard: {
    width: '100%',
    borderRadius: 24,
    padding: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 24,
  },
  statsContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  statItem: {
    alignItems: 'center',
    minWidth: 80,
    marginVertical: 8,
  },
  statLabel: {
    fontSize: 12,
    marginTop: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  buttonsContainer: {
    width: '100%',
    marginTop: 24,
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
