// src/lib/scheduleChangeAlerts.ts
//
// Turns a ScheduleChanges diff into the pop-ups shown by GameChangeAlert.
// One game of a kind gets its own pop-up with a "View Crew" button; several
// are summarised in one pop-up so a new-season import doesn't queue dozens.

import { format, parse } from 'date-fns';
import type { GameChangeAlertData } from '../components/GameChangeAlert';
import { formatGameTime } from '../providers/ScheduleProvider';
import type { ScheduleChanges, SnapshotGame, UpdatedGame } from './scheduleChanges';
import { currentSeasonLabel } from './season';

const MAX_LIST_LINES = 8;

function formatDate(gamedate: string | null, pattern: string): string {
  if (!gamedate) return 'TBD';
  try {
    return format(parse(gamedate, 'yyyy-MM-dd', new Date()), pattern);
  } catch {
    return gamedate;
  }
}

function formatTime(game: SnapshotGame): string {
  if (!game.gametime || !game.gamedate) return 'TBD';
  try {
    return formatGameTime(game.gametime, game.gamedate);
  } catch {
    return game.gametime;
  }
}

const longDate = (g: SnapshotGame) => formatDate(g.gamedate, 'EEE. MMM d');
const shortDate = (g: SnapshotGame) => formatDate(g.gamedate, 'M/d');
const matchup = (g: SnapshotGame) => `${g.awayteam} @ ${g.hometeam}`;

// "Dietrich, Mike" -> "Mike Dietrich"
function displayName(lastFirst: string): string {
  const [last, first] = lastFirst.split(',').map(s => s.trim());
  return first ? `${first} ${last}` : lastFirst;
}

function crew(names: (string | null)[]): string {
  const present = names.filter((n): n is string => !!n && !!n.trim());
  return present.length ? present.map(displayName).join(' & ') : 'none';
}

// The game screen only resolves current-season games, so only offer the
// "View Crew" jump for those.
function viewableGameId(game: SnapshotGame): string | undefined {
  return game.season === currentSeasonLabel() ? String(game.gameid) : undefined;
}

function describeUpdate(u: UpdatedGame): string[] {
  const { before, after } = u;
  return u.fields.map(field => {
    switch (field) {
      case 'date':
        return `Date: ${longDate(before)} → ${longDate(after)}`;
      case 'time':
        return `Time: ${formatTime(before)} → ${formatTime(after)}`;
      case 'teams':
        return `Teams: ${matchup(before)} → ${matchup(after)}`;
      case 'referees':
        return `Referees: ${crew([before.referee1, before.referee2])} → ${crew([after.referee1, after.referee2])}`;
      case 'linespersons':
        return `Linespersons: ${crew([before.linesperson1, before.linesperson2])} → ${crew([after.linesperson1, after.linesperson2])}`;
      case 'gamecode':
        return `Game code: ${before.gamecode ?? '—'} → ${after.gamecode ?? '—'}`;
    }
  });
}

function listBody(lines: string[]): string {
  if (lines.length <= MAX_LIST_LINES) return lines.join('\n');
  const shown = lines.slice(0, MAX_LIST_LINES - 1);
  return [...shown, `…and ${lines.length - shown.length} more`].join('\n');
}

export function buildScheduleChangeAlerts(changes: ScheduleChanges): GameChangeAlertData[] {
  const alerts: GameChangeAlertData[] = [];
  const { added, updated, removed } = changes;

  if (added.length === 1) {
    const g = added[0];
    alerts.push({
      title: '🏒 New Game Added',
      body: `${matchup(g)}\n${longDate(g)} · ${formatTime(g)}\nGame ${g.gameid}`,
      gameId: viewableGameId(g),
    });
  } else if (added.length > 1) {
    alerts.push({
      title: `🏒 ${added.length} New Games Added`,
      body: listBody(added.map(g => `${shortDate(g)}  ${matchup(g)}`)),
    });
  }

  if (updated.length === 1) {
    const u = updated[0];
    alerts.push({
      title: '🚨 Game Updated',
      body: `${matchup(u.after)} · ${longDate(u.after)}\n\n${describeUpdate(u).join('\n')}`,
      gameId: viewableGameId(u.after),
    });
  } else if (updated.length > 1) {
    alerts.push({
      title: `🚨 ${updated.length} Games Updated`,
      body: listBody(
        updated.map(u => {
          const what = u.fields.map(f => (f === 'gamecode' ? 'game code' : f)).join(', ');
          return `${shortDate(u.after)}  ${matchup(u.after)} — ${what}`;
        }),
      ),
    });
  }

  if (removed.length === 1) {
    const g = removed[0];
    alerts.push({
      title: 'Removed From Game',
      body: `You are no longer assigned to ${matchup(g)} on ${longDate(g)} (Game ${g.gameid}).`,
    });
  } else if (removed.length > 1) {
    alerts.push({
      title: `Removed From ${removed.length} Games`,
      body: listBody(removed.map(g => `${shortDate(g)}  ${matchup(g)}`)),
    });
  }

  return alerts;
}
