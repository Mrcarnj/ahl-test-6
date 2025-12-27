import { DeviceEventEmitter } from 'react-native';
import { SYNC_TOAST_EVENT } from './events';

export type SyncToastType = 'info' | 'success' | 'error';

export type SyncToastPayload = {
  type: SyncToastType;
  message: string;
  detail?: string;
  durationMs?: number;
};

export function emitSyncToast(payload: SyncToastPayload) {
  DeviceEventEmitter.emit(SYNC_TOAST_EVENT, payload);
}




