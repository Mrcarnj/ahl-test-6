// src/lib/scheduleChanges.ts
//
// Detects what changed on an official's schedule between two loads, so the app
// can tell them "new game added" / "game updated" after a background sync
// instead of making them wait on a blocking sync screen.
//
// The last schedule the official saw is persisted per user. Diffing against it
// (rather than trusting the iCal sync's own new/updated counts) also catches
// changes a crewmate's device wrote first, and changes made while the app was
// closed.

import { format } from 'date-fns';
import { safeAsyncStorage } from './asyncStorageWrapper';
import type { Schedule } from '../providers/ScheduleProvider';

const SNAPSHOT_FIELDS = [
  'gameid',
  'season',
  'awayteam',
  'hometeam',
  'gamedate',
  'gametime',
  'gamecode',
  'referee1',
  'referee2',
  'linesperson1',
  'linesperson2',
] as const;

export type SnapshotGame = Pick<Schedule, (typeof SNAPSHOT_FIELDS)[number]>;

/** Games keyed by `season|gameid`, the same natural key the iCal sync upserts on. */
export type ScheduleSnapshot = Record<string, SnapshotGame>;

export type UpdatedGame = {
  before: SnapshotGame;
  after: SnapshotGame;
  /** Which aspects changed; the alert text is built from these. */
  fields: ('date' | 'time' | 'teams' | 'referees' | 'linespersons' | 'gamecode')[];
};

export type ScheduleChanges = {
  added: SnapshotGame[];
  updated: UpdatedGame[];
  removed: SnapshotGame[];
};

const snapshotKey = (userKey: string) => `scheduleSnapshot_v1_${userKey}`;
const gameKey = (g: Pick<Schedule, 'season' | 'gameid'>) => `${g.season}|${g.gameid}`;

export function snapshotFromGames(games: Schedule[]): ScheduleSnapshot {
  const snapshot: ScheduleSnapshot = {};
  for (const game of games) {
    const entry = {} as Record<string, unknown>;
    for (const field of SNAPSHOT_FIELDS) {
      entry[field] = game[field] ?? null;
    }
    snapshot[gameKey(game)] = entry as SnapshotGame;
  }
  return snapshot;
}

/** Returns null when nothing is stored yet (first launch, or a new device). */
export async function loadScheduleSnapshot(userKey: string): Promise<ScheduleSnapshot | null> {
  const raw = await safeAsyncStorage.getItem(snapshotKey(userKey));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as ScheduleSnapshot) : null;
  } catch {
    return null;
  }
}

export async function saveScheduleSnapshot(userKey: string, snapshot: ScheduleSnapshot): Promise<void> {
  await safeAsyncStorage.setItem(snapshotKey(userKey), JSON.stringify(snapshot));
}

// Postgres timetz can come back as "19:00:00-04" or "19:00:00-04:00"; treat
// those as the same time (mirrors normalizeFieldValue in icalHockeySync).
function normalize(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.replace(/([+-]\d{2}):(\d{2})$/, '$1');
}

// The feed lists a crew in any order, so compare officials as a set: a swap
// between slot 1 and slot 2 is not a change to the official.
function sameCrew(a: (string | null)[], b: (string | null)[]): boolean {
  const norm = (list: (string | null)[]) =>
    list.map(normalize).filter((v): v is string => v !== null).sort().join('\n');
  return norm(a) === norm(b);
}

function changedFields(before: SnapshotGame, after: SnapshotGame): UpdatedGame['fields'] {
  const fields: UpdatedGame['fields'] = [];
  if (normalize(before.gamedate) !== normalize(after.gamedate)) fields.push('date');
  if (normalize(before.gametime) !== normalize(after.gametime)) fields.push('time');
  if (
    normalize(before.awayteam) !== normalize(after.awayteam) ||
    normalize(before.hometeam) !== normalize(after.hometeam)
  ) {
    fields.push('teams');
  }
  if (!sameCrew([before.referee1, before.referee2], [after.referee1, after.referee2])) {
    fields.push('referees');
  }
  if (!sameCrew([before.linesperson1, before.linesperson2], [after.linesperson1, after.linesperson2])) {
    fields.push('linespersons');
  }
  if (normalize(before.gamecode) !== normalize(after.gamecode)) fields.push('gamecode');
  return fields;
}

/**
 * Diffs the previously seen schedule against the one just loaded. Only games
 * dated today or later are reported — a correction to a game already played
 * isn't worth interrupting anyone for.
 */
export function diffSchedule(
  previous: ScheduleSnapshot,
  current: ScheduleSnapshot,
  today: string = format(new Date(), 'yyyy-MM-dd'),
): ScheduleChanges {
  const isUpcoming = (g: SnapshotGame) => !!g.gamedate && g.gamedate >= today;
  const byDate = (a: SnapshotGame, b: SnapshotGame) =>
    `${a.gamedate} ${a.gametime}`.localeCompare(`${b.gamedate} ${b.gametime}`);

  const added: SnapshotGame[] = [];
  const updated: UpdatedGame[] = [];
  const removed: SnapshotGame[] = [];

  for (const [key, after] of Object.entries(current)) {
    const before = previous[key];
    if (!before) {
      if (isUpcoming(after)) added.push(after);
      continue;
    }
    if (!isUpcoming(before) && !isUpcoming(after)) continue;
    const fields = changedFields(before, after);
    if (fields.length > 0) updated.push({ before, after, fields });
  }

  for (const [key, before] of Object.entries(previous)) {
    if (!current[key] && isUpcoming(before)) removed.push(before);
  }

  added.sort(byDate);
  removed.sort(byDate);
  updated.sort((a, b) => byDate(a.after, b.after));
  return { added, updated, removed };
}

export const hasScheduleChanges = (c: ScheduleChanges) =>
  c.added.length > 0 || c.updated.length > 0 || c.removed.length > 0;
