import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Theme } from '../lib/theme';

const { width } = Dimensions.get('window');

export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const logoScale = useRef(new Animated.Value(0.5)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
        Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
      ]),
      Animated.timing(textOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
    ]).start();

    // M3 linear progress indicator
    Animated.timing(progress, { toValue: 1, duration: 1200, useNativeDriver: false }).start();

    const timer = setTimeout(onFinish, 1400);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <View style={st.container} onTouchEnd={onFinish}>
      {/* Centered logo */}
      <Animated.View style={[st.logoWrap, { transform: [{ scale: logoScale }], opacity: logoOpacity }]}>
        <LinearGradient
          colors={Theme.gradientPrimary}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={st.shieldOuter}
        >
          <View style={st.shieldInner}>
            <Ionicons name="shield-checkmark" size={48} color={Theme.primary} />
          </View>
        </LinearGradient>
      </Animated.View>

      <Animated.View style={{ opacity: textOpacity, alignItems: 'center', marginTop: 24 }}>
        <Text style={st.brand}>AK-LOGIC</Text>
        <View style={st.aiBadge}>
          <LinearGradient colors={Theme.gradientPrimary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.aiBadgeGrad}>
            <Text style={st.aiText}>AI GST</Text>
          </LinearGradient>
        </View>
        <Text style={st.tagline}>Smart Billing for Smart Businesses</Text>
      </Animated.View>

      {/* M3 Linear Progress Indicator */}
      <View style={st.progressTrack}>
        <Animated.View style={[st.progressBar, {
          width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Theme.bg },
  logoWrap: { alignItems: 'center' },
  shieldOuter: { width: 96, height: 96, borderRadius: 24, alignItems: 'center', justifyContent: 'center', padding: 3 },
  shieldInner: { width: 90, height: 90, borderRadius: 21, backgroundColor: Theme.bg, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 28, fontWeight: '700', color: Theme.onSurface, letterSpacing: 2 },
  aiBadge: { marginTop: 8 },
  aiBadgeGrad: { paddingHorizontal: 14, paddingVertical: 4, borderRadius: 16 },
  aiText: { color: '#fff', fontSize: 13, fontWeight: '700', letterSpacing: 1.5 },
  tagline: { color: Theme.onSurfaceVariant, fontSize: Theme.bodyMedium, marginTop: 12 },
  progressTrack: {
    position: 'absolute', bottom: 72,
    width: width * 0.4, height: 4,
    backgroundColor: Theme.outline, borderRadius: 2, overflow: 'hidden',
  },
  progressBar: { height: 4, backgroundColor: Theme.primary, borderRadius: 2 },
});
