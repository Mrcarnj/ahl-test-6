// One game's penalties from HockeyTech, by period, with the clock as the
// scoreboard showed it. The first step toward clips tagged per penalty: each
// row can start an upload with the tag and title already filled in.
//
// The time is when play stopped. On a delayed penalty the infraction itself
// can be well before it.

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  clockRemaining,
  type GameSummary,
  scoreAtPenalty,
  type SummaryPenalty,
} from '@/src/lib/gameSummary';

type Props = {
  summary: GameSummary;
  /** Shown only when the official may upload to this game. */
  onAddClip?: (penalty: SummaryPenalty) => void;
};

function teamCode(summary: GameSummary, teamId: string): string {
  if (teamId === summary.home.id) return summary.home.code;
  if (teamId === summary.visitor.id) return summary.visitor.code;
  return '';
}

export function penaltyClipTitle(summary: GameSummary, p: SummaryPenalty): string {
  const who = p.playerName ? `#${p.playerNumber ?? ''} ${p.playerName}` : `${teamCode(summary, p.teamId)} Bench`;
  return `${p.periodLabel} ${clockRemaining(summary, p)} – ${who}, ${p.offence}`;
}

export default function GamePenaltyList({ summary, onAddClip }: Props) {
  const penalties = [...summary.penalties].sort((a, b) => a.period - b.period || a.seconds - b.seconds);

  if (penalties.length === 0) {
    return <Text style={styles.empty}>No penalties recorded yet.</Text>;
  }

  const periods: { label: string; items: SummaryPenalty[] }[] = [];
  for (const p of penalties) {
    const last = periods[periods.length - 1];
    if (last && last.items[0].period === p.period) last.items.push(p);
    else periods.push({ label: p.periodLabel, items: [p] });
  }

  return (
    <View>
      {periods.map((group) => (
        <View key={group.label}>
          <Text style={styles.period}>{/^\d/.test(group.label) ? `${group.label} Period` : group.label}</Text>
          {group.items.map((p) => {
            const score = scoreAtPenalty(summary, p);
            return (
              <View key={p.key} style={styles.row}>
                <View style={styles.clockCol}>
                  <Text style={styles.clock}>{clockRemaining(summary, p)}</Text>
                  <Text style={styles.elapsed}>{p.time} elapsed</Text>
                </View>
                <View style={styles.body}>
                  <Text style={styles.player} numberOfLines={1}>
                    <Text style={styles.team}>{teamCode(summary, p.teamId)} </Text>
                    {p.playerName ? `#${p.playerNumber ?? ''} ${p.playerName}` : 'Bench'}
                  </Text>
                  <Text style={styles.offence} numberOfLines={2}>
                    {[p.offence, p.minutes ? `${p.minutes} min` : '', p.penaltyClass].filter(Boolean).join(' · ')}
                  </Text>
                  <Text style={styles.score}>
                    {summary.visitor.code} {score.visitor} – {summary.home.code} {score.home}
                  </Text>
                </View>
                {onAddClip ? (
                  <Pressable
                    onPress={() => onAddClip(p)}
                    style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Add a clip for ${p.offence}`}
                  >
                    <Ionicons name="add" size={14} color="#ff6600" />
                    <Text style={styles.addText}>Clip</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  period: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1a1a1a',
  },
  clockCol: {
    width: 72,
  },
  clock: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  elapsed: {
    color: '#777',
    fontSize: 11,
    marginTop: 2,
  },
  body: {
    flex: 1,
  },
  team: {
    color: '#999',
    fontWeight: '700',
  },
  player: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  offence: {
    color: '#ccc',
    fontSize: 13,
    marginTop: 2,
  },
  score: {
    color: '#777',
    fontSize: 12,
    marginTop: 3,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: '#ff6600',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  pressed: {
    backgroundColor: '#1a1a1a',
  },
  addText: {
    color: '#ff6600',
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    color: '#888',
    textAlign: 'center',
    marginTop: 32,
  },
});
