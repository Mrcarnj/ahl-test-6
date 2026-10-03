// What an incident report is for, picked first in the report builder. The
// type decides who can be picked (players or coaches, or nobody) and, for
// some types, the report's "Reason For Report".
import type { SummaryPenalty } from '@/src/lib/gameSummary';

export interface IncidentType {
  key: string;
  label: string;
  /** Fixed "Reason For Report"; otherwise it comes from the picked penalty. */
  reason?: string;
  /** Pick from the team's coaches instead of its players. */
  coach?: boolean;
  /** Offer an "N/A" team, for incidents that aren't tied to one player. */
  allowNoTeam?: boolean;
}

export const INCIDENT_TYPES: IncidentType[] = [
  { key: 'playerPenalty', label: 'Player Penalty' },
  {
    key: 'coachGameMisconduct',
    label: 'Coach Game Misconduct',
    reason: 'Coach Assessed Game Misconduct',
    coach: true,
  },
  {
    key: 'physicalAbuse',
    label: 'Physical Abuse of Official',
    reason: 'Physical Abuse of Official Assessed',
  },
  { key: 'fanInteraction', label: 'Player/Fan Interaction', allowNoTeam: true },
  {
    key: 'offIceAbuse',
    label: 'Abuse of Official Off Ice Surface',
    reason: 'Abuse of Official Off the Ice Surface Assessed',
  },
  { key: 'other', label: 'Other', allowNoTeam: true },
];

/**
 * "Reason For Report" for a picked penalty. The league's usual report reasons
 * are matched on HockeyTech's class + description; anything else falls back
 * to the penalty's own name.
 */
export function reasonForPenalty(penalty: SummaryPenalty): string {
  const text = `${penalty.penaltyClass} ${penalty.offence}`.toLowerCase();
  if (text.includes('match')) {
    // Name the infraction: "Match Penalty for Spearing Assessed". HockeyTech
    // may put it in the description alone ("Spearing", class "Match") or
    // prefix it ("Match - Spearing"), so strip any leading "Match".
    const infraction = penalty.offence
      .replace(/^\s*match(\s+penalty)?\s*[-–:]?\s*/i, '')
      .trim();
    return infraction
      ? `Match Penalty for ${infraction} Assessed`
      : 'Match Penalty Assessed';
  }
  if (text.includes('instigat')) return 'Instigator Assessed';
  if (text.includes('diving') || text.includes('embellish')) {
    return 'Diving Infraction Assessed';
  }
  // Not just "head": that would also catch head-butting.
  if (/check.*head|head.*(check|contact)/.test(text)) {
    return 'Illegal Check to the Head Minor Penalty Assessed';
  }
  if (text.includes('game misconduct')) return 'Game Misconduct Penalty Assessed';
  return `${penalty.offence} Assessed`;
}
