import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, DeviceEventEmitter } from 'react-native';
import { SYNC_TOAST_EVENT } from '@/src/lib/events';
import type { SyncToastPayload, SyncToastType } from '@/src/lib/syncToast';

type ToastState = {
  visible: boolean;
  type: SyncToastType;
  message: string;
  detail?: string;
  durationMs: number;
};

export default function SyncToastHost() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colors = useMemo(() => {
    const type = toast?.type ?? 'info';
    if (type === 'success') return { bg: '#12361f', border: '#22c55e', text: '#eafff1' };
    if (type === 'error') return { bg: '#3b0f12', border: '#ef4444', text: '#ffecef' };
    return { bg: '#0b2239', border: '#3b82f6', text: '#eaf4ff' };
  }, [toast?.type]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SYNC_TOAST_EVENT, (payload: SyncToastPayload) => {
      const durationMs = payload.durationMs ?? (payload.type === 'error' ? 6000 : 2500);

      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }

      setToast({
        visible: true,
        type: payload.type,
        message: payload.message,
        detail: payload.detail,
        durationMs,
      });

      (opacity as any).stopAnimation?.();
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();

      // Auto-hide
      hideTimerRef.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
          setToast(null);
        });
      }, durationMs);
    });

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      sub.remove();
    };
  }, [opacity]);

  if (!toast?.visible) return null;

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={[styles.toast, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <Text style={[styles.message, { color: colors.text }]} numberOfLines={2}>
          {toast.message}
        </Text>
        {!!toast.detail && (
          <Text style={[styles.detail, { color: colors.text }]} numberOfLines={3}>
            {toast.detail}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 18,
    zIndex: 9999,
  },
  toast: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  message: {
    fontSize: 13,
    fontWeight: '700',
  },
  detail: {
    marginTop: 6,
    fontSize: 12,
    opacity: 0.95,
  },
});



