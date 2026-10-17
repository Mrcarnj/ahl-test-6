// app/(protected)/incident-report/[id].tsx
//
// Builds the incident report before opening it: the official picks what the
// report is for, then the team, the player (or coach) and the penalty from the
// game's HockeyTech summary, and the period, clock, score and reason are
// worked out from that. "Finish Form" opens the league's Formstack form with
// everything filled in.
import {
  clockRemaining,
  fetchGameSummary,
  GameSummary,
  reportPeriodLabel,
  scoreAtPenalty,
  SummaryPenalty,
  SummaryPlayer,
} from "@/src/lib/gameSummary";
import {
  INCIDENT_TYPES,
  IncidentType,
  reasonForPenalty,
} from "@/src/lib/incidentTypes";
import { buildIncidentReportUrl } from "@/src/lib/reportForms";
import { currentSeasonLabel } from "@/src/lib/season";
import { useAuth } from "@/src/providers/AuthProvider";
import { useRoster } from "@/src/providers/RosterProvider";
import { getTeamLogo, useSchedule } from "@/src/providers/ScheduleProvider";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  LayoutChangeEvent,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type Side = "visitor" | "home";
/** "na" is the no-team choice offered for fan interaction / other reports. */
type TeamChoice = Side | "na";
type Section = "team" | "player" | "penalty" | "summary";

const NA = "N/A";

const IncidentReportBuilder = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { myGames } = useSchedule();
  const { roster } = useRoster();
  const { user } = useAuth();

  const [summary, setSummary] = useState<GameSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [type, setType] = useState<IncidentType | null>(null);
  const [side, setSide] = useState<TeamChoice | null>(null);
  const [player, setPlayer] = useState<SummaryPlayer | null>(null);
  const [penalty, setPenalty] = useState<SummaryPenalty | null>(null);

  // After a pick, the list collapses to that row and the screen scrolls to
  // the next section. The scroll waits for that section's onLayout, since its
  // position only settles once the list above it has collapsed.
  const scrollRef = useRef<ScrollView>(null);
  const scrollTarget = useRef<Section | null>(null);
  const scrollIfTarget = (section: Section) => (e: LayoutChangeEvent) => {
    if (scrollTarget.current !== section) return;
    scrollTarget.current = null;
    scrollRef.current?.scrollTo({ y: e.nativeEvent.layout.y - 8, animated: true });
  };

  // Every pick clears the picks after it, which depend on it.
  const pickType = (t: IncidentType) => {
    setSide(null);
    setPlayer(null);
    setPenalty(null);
    if (type?.key === t.key) {
      setType(null);
      return;
    }
    setType(t);
    scrollTarget.current = "team";
  };

  const pickSide = (next: TeamChoice) => {
    if (next === side) return;
    setSide(next);
    setPlayer(null);
    setPenalty(null);
    scrollTarget.current = next === "na" ? "summary" : "player";
  };

  const pickPlayer = (p: SummaryPlayer) => {
    if (player?.playerId === p.playerId) {
      setPlayer(null);
      return;
    }
    setPlayer(p);
    scrollTarget.current = "penalty";
  };

  const pickPenalty = (p: SummaryPenalty) => {
    if (penalty?.key === p.key) {
      setPenalty(null);
      return;
    }
    setPenalty(p);
    scrollTarget.current = "summary";
  };

  const game = myGames.find(
    (g) => g.gameid === id && g.season === currentSeasonLabel(),
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchGameSummary(id)
      .then((s) => !cancelled && setSummary(s))
      .catch((e) => {
        console.error("Incident report: game summary failed", e);
        if (!cancelled) setLoadError("Couldn't load this game's roster and penalties.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!game) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Game not found</Text>
      </View>
    );
  }

  const noTeam = side === "na";
  const isCoach = !!type?.coach;
  const team = summary && side && side !== "na" ? summary[side] : null;
  const people =
    summary && team
      ? isCoach
        ? side === "home" ? summary.homeCoaches : summary.visitorCoaches
        : side === "home" ? summary.homeRoster : summary.visitorRoster
      : [];
  const penalties = summary && team
    ? summary.penalties.filter((p) => p.teamId === team.id)
    : [];
  const score = summary && penalty ? scoreAtPenalty(summary, penalty) : null;
  const scoreText =
    summary && score
      ? `${summary.visitor.code} ${score.visitor} - ${summary.home.code} ${score.home}`
      : null;
  const reason = type?.reason ?? (penalty ? reasonForPenalty(penalty) : null);

  const finishForm = () => {
    const url = buildIncidentReportUrl(
      game,
      {
        firstName: roster?.firstname,
        lastName: roster?.lastname,
        email: user?.email ?? roster?.email,
      },
      {
        playerNumber: noTeam || isCoach ? NA : player?.number,
        playerName: noTeam ? NA : player?.name,
        period: noTeam ? "Other" : penalty ? reportPeriodLabel(penalty.period) : null,
        clock: summary && penalty ? clockRemaining(summary, penalty) : null,
        score: scoreText,
        reason,
      },
    );
    Linking.openURL(url);
  };

  const teamButton = (which: TeamChoice) => {
    const selected = side === which;
    const teamData =
      which === "home" ? game.homeTeamData : which === "visitor" ? game.awayTeamData : null;
    return (
      <TouchableOpacity
        key={which}
        style={[styles.teamButton, selected && styles.teamButtonSelected]}
        onPress={() => pickSide(which)}
        disabled={which !== "na" && !summary}
      >
        {teamData ? (
          <Image source={{ uri: getTeamLogo(teamData) }} style={styles.teamLogo} />
        ) : (
          <View style={styles.teamLogo} />
        )}
        <Text style={[styles.teamCode, selected && styles.accentText]}>
          {which === "na"
            ? NA
            : teamData?.abbreviation ?? (which === "home" ? "Home" : "Away")}
        </Text>
      </TouchableOpacity>
    );
  };

  const teamChoices: TeamChoice[] = type?.allowNoTeam
    ? ["visitor", "home", "na"]
    : ["visitor", "home"];

  return (
    <View style={styles.container}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={styles.title}>What Is This Report For?</Text>
        <View style={styles.typeGrid}>
          {(type ? [type] : INCIDENT_TYPES).map((t) => {
            const selected = type?.key === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeTile, selected && styles.typeTileSelected]}
                onPress={() => pickType(t)}
              >
                <Text style={[styles.typeText, selected && styles.accentText]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {type && <Text style={styles.muted}>Tap to change.</Text>}

        {type && (
          <>
            <Text style={styles.sectionTitle} onLayout={scrollIfTarget("team")}>
              {isCoach ? "Select Team of Coach" : "Select Team of Player"}
            </Text>
            <View style={styles.teamsRow}>{teamChoices.map(teamButton)}</View>

            {!summary && !loadError && (
              <ActivityIndicator color="#ff6600" style={{ marginTop: 20 }} />
            )}
            {loadError && (
              <Text style={styles.error}>
                {loadError} You can still open the form with the game details filled in.
              </Text>
            )}
          </>
        )}

        {team && (
          <>
            <Text style={styles.sectionTitle} onLayout={scrollIfTarget("player")}>
              {isCoach ? "Coach Who Committed the Act" : "Player Who Committed the Act"}
            </Text>
            <View style={styles.headerRow}>
              <Text style={[styles.headerText, styles.numCol]}>{isCoach ? "" : "#"}</Text>
              <Text style={[styles.headerText, styles.nameCol]}>Name</Text>
            </View>
            {(player ? [player] : people).map((p) => {
              const selected = player?.playerId === p.playerId;
              return (
                <TouchableOpacity
                  key={p.playerId}
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => pickPlayer(p)}
                >
                  <Text style={[styles.cell, styles.numCol]}>{p.number}</Text>
                  <Text style={[styles.cell, styles.nameCol]}>
                    {p.name}
                    {isCoach && p.position ? (
                      <Text style={styles.roleText}>{`  ${p.position}`}</Text>
                    ) : null}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {people.length === 0 && (
              <Text style={styles.muted}>
                {isCoach ? "No coaches listed." : "No roster listed."}
              </Text>
            )}
            {player && <Text style={styles.muted}>Tap to change.</Text>}

            <Text style={styles.sectionTitle} onLayout={scrollIfTarget("penalty")}>
              Penalty
            </Text>
            <View style={styles.headerRow}>
              <Text style={[styles.headerText, styles.smallCol]}>Per</Text>
              <Text style={[styles.headerText, styles.smallCol]}>Team</Text>
              <Text style={[styles.headerText, styles.smallCol]}>Min</Text>
              <Text style={[styles.headerText, styles.offenceCol]}>Offense</Text>
              <Text style={[styles.headerText, styles.smallCol]}>Time</Text>
            </View>
            {(penalty ? [penalty] : penalties).map((p) => {
              const selected = penalty?.key === p.key;
              // The picked player's own penalties stand out, since that's
              // usually the one being reported.
              const byPlayer = !!player && p.playerId === player.playerId;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => pickPenalty(p)}
                >
                  <Text style={[styles.cell, styles.smallCol]}>{p.periodLabel}</Text>
                  <Text style={[styles.cell, styles.smallCol]}>{team.code}</Text>
                  <Text style={[styles.cell, styles.smallCol]}>{p.minutes}</Text>
                  <Text
                    style={[styles.cell, styles.offenceCol, byPlayer && styles.accentText]}
                  >
                    {p.offence}
                    {p.playerNumber ? ` (#${p.playerNumber})` : ""}
                  </Text>
                  <Text style={[styles.cell, styles.smallCol]}>{p.time}</Text>
                </TouchableOpacity>
              );
            })}
            {penalties.length === 0 && (
              <Text style={styles.muted}>No penalties for {team.code}.</Text>
            )}
            {penalty && <Text style={styles.muted}>Tap to change.</Text>}
          </>
        )}

        {((penalty && summary) || noTeam) && (
          <View style={styles.scoreBox} onLayout={scrollIfTarget("summary")}>
            {penalty && summary && (
              <>
                <Text style={styles.scoreLabel}>Score When Incident Occurred</Text>
                <Text style={styles.scoreValue}>{scoreText}</Text>
                <Text style={styles.muted}>
                  {reportPeriodLabel(penalty.period)} period,{" "}
                  {clockRemaining(summary, penalty)} on the clock
                </Text>
              </>
            )}
            {noTeam && (
              <Text style={styles.muted}>
                Period: Other · Player #: {NA} · Player: {NA}
              </Text>
            )}
            {reason && (
              <>
                <Text style={[styles.scoreLabel, styles.reasonLabel]}>Reason For Report</Text>
                <Text style={styles.reasonText}>{reason}</Text>
              </>
            )}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.finishButton} onPress={finishForm}>
        <Text style={styles.finishText}>Finish Form</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000000",
  },
  content: {
    padding: 16,
    paddingBottom: 30,
  },
  center: {
    flex: 1,
    backgroundColor: "#000000",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ffffff",
    textAlign: "center",
    marginBottom: 12,
  },
  teamsRow: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    gap: 8,
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
  },
  typeTile: {
    width: "48.5%",
    minHeight: 70,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#333",
    backgroundColor: "#111",
    justifyContent: "center",
    alignItems: "center",
  },
  typeTileSelected: {
    width: "100%",
    borderColor: "#ff6600",
  },
  typeText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "bold",
    textAlign: "center",
  },
  roleText: {
    color: "#888",
    fontSize: 12,
  },
  reasonLabel: {
    marginTop: 14,
  },
  reasonText: {
    color: "#ffffff",
    fontSize: 16,
    textAlign: "center",
  },
  teamButton: {
    alignItems: "center",
    padding: 10,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#333",
    flex: 1,
    maxWidth: 130,
  },
  teamButtonSelected: {
    borderColor: "#ff6600",
  },
  teamLogo: {
    width: 80,
    height: 80,
    resizeMode: "contain",
    marginBottom: 6,
  },
  teamCode: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "bold",
  },
  accentText: {
    color: "#ff6600",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#ff6600",
    textAlign: "center",
    marginTop: 24,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#333",
  },
  headerText: {
    color: "#ff6600",
    fontSize: 12,
    fontWeight: "bold",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#222",
  },
  rowSelected: {
    backgroundColor: "#331a00",
  },
  cell: {
    color: "#ffffff",
    fontSize: 14,
  },
  numCol: {
    width: 50,
    textAlign: "center",
  },
  nameCol: {
    flex: 1,
  },
  smallCol: {
    width: 50,
    textAlign: "center",
  },
  offenceCol: {
    flex: 1,
    paddingHorizontal: 4,
  },
  muted: {
    color: "#888",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
  },
  error: {
    color: "#ff6666",
    fontSize: 14,
    textAlign: "center",
    marginTop: 20,
  },
  scoreBox: {
    marginTop: 24,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  scoreLabel: {
    color: "#ff6600",
    fontSize: 14,
    fontWeight: "bold",
    marginBottom: 6,
  },
  scoreValue: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "bold",
  },
  finishButton: {
    backgroundColor: "#ff6600",
    margin: 16,
    marginBottom: 30,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  finishText: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "bold",
  },
});

export default IncidentReportBuilder;
