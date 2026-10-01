// Centralized event names to avoid string mismatches across the app.

export const APP_REFRESH_EVENT = 'app_refresh_event';
export const SYNC_TOAST_EVENT = 'sync_toast_event';
// Emitted by ScheduleProvider with a ScheduleChanges payload when a schedule
// load finds games added, updated or removed since the official last looked.
export const SCHEDULE_CHANGES_EVENT = 'schedule_changes_event';
