/**
 * AppErrorBoundary — глобальный предохранитель: краш JS в любом экране раньше
 * значил белый экран без следов. Теперь — fallback с «Перезапустить» и
 * fire-and-forget репорт в Supabase client_errors (см. crashReport.ts).
 *
 * Стоит СНАРУЖИ всех провайдеров (ловит и их падения), поэтому цвета
 * захардкожены под тёмную тему, без useTheme.
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { reportCrash } from '@/src/services/crashReport';
import { translateFor } from '@/src/contexts/LanguageContext';

interface State { error: Error | null }

export default class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportCrash(error, `boundary:${(info.componentStack || '').split('\n')[1]?.trim() || 'unknown'}`);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    // Вне LanguageProvider (границей ловим и его падение) → язык берём из системного
    // navigator.language + standalone-резолвер translateFor (crash* в словаре, все 12 языков;
    // неизвестный код языка падает на EN, отказ navigator — на RU как раньше).
    const lang = (() => {
      try { return (((globalThis as any).navigator?.language || 'ru') as string).slice(0, 2).toLowerCase(); } catch { return 'ru'; }
    })();
    return (
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.emoji}>🛠️</Text>
          <Text style={styles.title}>{translateFor(lang, 'crashTitle')}</Text>
          <Text style={styles.msg} numberOfLines={3}>{this.state.error.message}</Text>
          <Text style={styles.hint}>{translateFor(lang, 'crashHint')}</Text>
          <TouchableOpacity style={styles.btn} onPress={this.reset} activeOpacity={0.85}>
            <Text style={styles.btnText}>{translateFor(lang, 'crashRestart')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#0f1115', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, backgroundColor: '#1a1d24', borderRadius: 20, padding: 28, alignItems: 'center', gap: 10, borderWidth: 1, borderColor: '#2a2e38' },
  emoji: { fontSize: 52 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  msg: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  hint: { color: '#9ca3af', fontSize: 13, textAlign: 'center', lineHeight: 19 },
  btn: { marginTop: 10, alignSelf: 'stretch', backgroundColor: '#fbbf24', borderRadius: 12, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: '#000', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
});
