import type { Schedule } from '@/src/providers/ScheduleProvider';

// AHL officials' Formstack report forms. Formstack fills fields from
// `field<ID>` query params server-side, so the official still submits on the
// league's own page. Field IDs come from the form definition embedded in each
// page; if the league rebuilds a form they will change.

interface ReportForm {
  url: string;
  fields: {
    name: string; // name field: -first / -last sub-fields
    email: string;
    gameNumber: string;
    gameDate: string; // accepts YYYY-MM-DD
    homeTeam: string;
    visitingTeam: string;
  };
}

const INCIDENT_REPORT: ReportForm = {
  url: 'https://americanhockeyleague.formstack.com/forms/ahl_incident_report',
  fields: {
    name: 'field150820412',
    email: 'field150820415',
    gameNumber: 'field150820419',
    gameDate: 'field150820474',
    homeTeam: 'field150820478',
    visitingTeam: 'field150820544',
  },
};

const VIDEO_REVIEW_REPORT: ReportForm = {
  url: 'https://americanhockeyleague.formstack.com/forms/ahl_video_review_report',
  fields: {
    name: 'field149586317',
    email: 'field149586386',
    gameNumber: 'field149586531',
    gameDate: 'field149586500',
    homeTeam: 'field149586534',
    visitingTeam: 'field149586540',
  },
};

// `teams.abbreviation` → the team's option label in the form's dropdowns
// (HockeyTech full names, the same in both forms; LV is stored as LHV).
const FORM_TEAM_NAMES: Record<string, string> = {
  ABB: 'Abbotsford Canucks',
  BAK: 'Bakersfield Condors',
  BEL: 'Belleville Senators',
  CGY: 'Calgary Wranglers',
  CLT: 'Charlotte Checkers',
  CHI: 'Chicago Wolves',
  CLE: 'Cleveland Monsters',
  CV: 'Coachella Valley Firebirds',
  COL: 'Colorado Eagles',
  GR: 'Grand Rapids Griffins',
  HAM: 'Hamilton Hammers',
  HFD: 'Hartford Wolf Pack',
  HSK: 'Henderson Silver Knights',
  HER: 'Hershey Bears',
  IA: 'Iowa Wild',
  LAV: 'Laval Rocket',
  LHV: 'Lehigh Valley Phantoms',
  LV: 'Lehigh Valley Phantoms',
  MB: 'Manitoba Moose',
  MIL: 'Milwaukee Admirals',
  ONT: 'Ontario Reign',
  PRO: 'Providence Bruins',
  ROC: 'Rochester Americans',
  RFD: 'Rockford IceHogs',
  SD: 'San Diego Gulls',
  SJ: 'San Jose Barracuda',
  SPR: 'Springfield Thunderbirds',
  SYR: 'Syracuse Crunch',
  TEX: 'Texas Stars',
  TOR: 'Toronto Marlies',
  TUC: 'Tucson Roadrunners',
  UTC: 'Utica Comets',
  WBS: 'Wilkes-Barre/Scranton Penguins',
};

interface Official {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
}

/** What the incident report builder picked out of the game summary. */
export interface IncidentDetails {
  playerNumber?: string | null;
  playerName?: string | null;
  period?: string | null; // one of the form's radio labels: 1st / 2nd / 3rd / Overtime
  clock?: string | null; // time left on the clock, e.g. "6:43"
  score?: string | null; // visitor-home
  reason?: string | null;
}

const INCIDENT_FIELDS = {
  playerNumber: 'field153048112',
  playerName: 'field153048113',
  period: 'field150820631',
  clock: 'field150820643',
  score: 'field150821662',
  reason: 'field150820688',
};

function buildReportUrl(
  form: ReportForm,
  game: Schedule,
  official: Official,
  extra: [string, string | null | undefined][] = [],
): string {
  const f = form.fields;
  const params: [string, string | null | undefined][] = [
    [`${f.name}-first`, official.firstName],
    [`${f.name}-last`, official.lastName],
    [f.email, official.email],
    [f.gameNumber, game.gameid != null ? String(game.gameid) : null],
    [f.gameDate, game.gamedate],
    [f.homeTeam, FORM_TEAM_NAMES[game.homeTeamData?.abbreviation ?? '']],
    [f.visitingTeam, FORM_TEAM_NAMES[game.awayTeamData?.abbreviation ?? '']],
    ...extra,
  ];
  const query = params
    .filter((p): p is [string, string] => !!p[1])
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return query ? `${form.url}?${query}` : form.url;
}

/** Incident report URL with everything the app knows already filled in. */
export function buildIncidentReportUrl(
  game: Schedule,
  official: Official,
  incident: IncidentDetails = {},
): string {
  return buildReportUrl(INCIDENT_REPORT, game, official, [
    [INCIDENT_FIELDS.playerNumber, incident.playerNumber],
    [INCIDENT_FIELDS.playerName, incident.playerName],
    [INCIDENT_FIELDS.period, incident.period],
    [INCIDENT_FIELDS.clock, incident.clock],
    [INCIDENT_FIELDS.score, incident.score],
    [INCIDENT_FIELDS.reason, incident.reason],
  ]);
}

/** Video review report URL with everything the app knows already filled in. */
export function buildVideoReviewUrl(game: Schedule, official: Official): string {
  return buildReportUrl(VIDEO_REVIEW_REPORT, game, official);
}
