// Player Stats Sync Service
// Fetches player stats and roster data from HockeyTech API and updates Supabase

import { fetchAllTeamRosterRows } from './fetchAllTeamRosterRows';
import { PLAYER_ROSTER_STATS_TABLE, PLAYER_ROSTER_SYNC_SEASON_ID } from './rosterStatsTable';
import { supabase } from './supabase';

const SYNC_INTERVAL_HOURS = 24; // Sync once per day

// API endpoints (2026-27 regular season, HockeyTech season_id 93)
const PLAYER_STATS_API_URL = "https://lscluster.hockeytech.com/feed/index.php?feed=statviewfeed&view=players&season=93&team=all&position=skaters&rookies=0&statsType=standard&league_id=4&limit=2000&sort=points&lang=en&key=ccb91f29d6744675&client_code=ahl&callback=myCallback";
const ROSTER_API_BASE_URL = "https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&view=roster&team_id={}&season_id=93&key=ccb91f29d6744675&client_code=ahl&fmt=json";
const TEAM_STANDINGS_API_URL = "https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&view=statviewtype&stat=division&type=standings&season_id=93&league_id=4&key=ccb91f29d6744675&client_code=ahl&callback=myCallback";

// All AHL team IDs
// (BRI/Bridgeport 317 left the league after 2025-26; HAM/Hamilton 457 joined for 2026-27.)
const TEAM_IDS = [
  440, 402, 413, 444, 384, 330, 373, 445, 419, 328, 307, 437, 319,
  389, 415, 313, 321, 327, 403, 309, 323, 372, 404, 405, 411, 324, 380,
  335, 412, 390, 316, 457
];

// Team code mapping (API code -> database abbreviation)
const TEAM_CODE_MAPPING: Record<string, string> = {
  'LV': 'LHV',  // Lehigh Valley Phantoms
};

function mapTeamCode(apiTeamCode: string): string {
  return TEAM_CODE_MAPPING[apiTeamCode] || apiTeamCode;
}

/** HockeyTech numeric team_id → DB `teams.abbreviation` (same codes as standings sync). */
function buildTeamIdToAbbrevMap(apiData: any): Map<number, string> {
  const map = new Map<number, string>();
  if (!apiData?.SiteKit?.Statviewtype) {
    return map;
  }
  for (const team of apiData.SiteKit.Statviewtype) {
    if (team.repeatheader || !team.team_code || team.team_id == null || team.team_id === '') {
      continue;
    }
    const tid = toInt(team.team_id);
    if (tid === null) {
      continue;
    }
    map.set(tid, mapTeamCode(team.team_code));
  }
  return map;
}

function toInt(value: any, defaultValue: number | null = null): number | null {
  if (value === null || value === undefined || value === '') {
    return defaultValue;
  }
  try {
    return parseInt(String(value), 10);
  } catch {
    return defaultValue;
  }
}

/**
 * Check if player stats sync is needed (24 hours since last sync)
 * Checks the lastSynced column in the active roster stats table
 */
export async function shouldSyncPlayerStats(): Promise<boolean> {
  try {
    // Get the most recent lastSynced timestamp from any player
    // If all lastSynced are NULL, this will return no rows and we'll sync
    const { data, error } = await supabase
      .from(PLAYER_ROSTER_STATS_TABLE)
      .select('lastSynced')
      .not('lastSynced', 'is', null)
      .order('lastSynced', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // If error, no data, or all lastSynced are NULL, sync now
    if (error || !data || !data.lastSynced) {
      return true;
    }

    const lastSync = new Date(data.lastSynced);
    const now = new Date();
    const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

    return hoursSinceSync >= SYNC_INTERVAL_HOURS;
  } catch (error) {
    console.error('Error checking player stats sync status:', error);
    return true; // On error, sync to be safe
  }
}

/**
 * Check if player roster sync is needed (24 hours since last sync)
 * Checks the lastSynced column in the active roster stats table
 */
export async function shouldSyncPlayerRoster(): Promise<boolean> {
  try {
    // Get the most recent lastSynced timestamp from any player
    // If all lastSynced are NULL, this will return no rows and we'll sync
    const { data, error } = await supabase
      .from(PLAYER_ROSTER_STATS_TABLE)
      .select('lastSynced')
      .not('lastSynced', 'is', null)
      .order('lastSynced', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // If error, no data, or all lastSynced are NULL, sync now
    if (error || !data || !data.lastSynced) {
      return true;
    }

    const lastSync = new Date(data.lastSynced);
    const now = new Date();
    const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

    return hoursSinceSync >= SYNC_INTERVAL_HOURS;
  } catch (error) {
    console.error('Error checking player roster sync status:', error);
    return true; // On error, sync to be safe
  }
}

/**
 * Fetch and parse player stats from HockeyTech API
 */
async function fetchPlayerStats(): Promise<any> {
  console.log('🌐 PLAYER STATS: Fetching from API...');
  
  try {
    const response = await fetch(PLAYER_STATS_API_URL);
    const rawData = await response.text();
    
    // Strip JSONP callback wrapper
    let jsonData = rawData;
    if (rawData.startsWith('myCallback(')) {
      jsonData = rawData.slice(11); // Remove "myCallback("
      if (jsonData.endsWith(')')) {
        jsonData = jsonData.slice(0, -1); // Remove trailing ")"
      }
    }
    
    const data = JSON.parse(jsonData);
    
    // API returns a list with one dict: [{"sections":[...]}]
    if (Array.isArray(data) && data.length > 0) {
      return data[0];
    }
    
    return data;
  } catch (error) {
    console.error('❌ PLAYER STATS: Error fetching API data:', error);
    throw error;
  }
}

/**
 * Transform player stats API data to database format
 */
function transformPlayerStats(apiData: any): any[] {
  const players: any[] = [];
  
  if (!apiData?.sections || apiData.sections.length === 0) {
    return players;
  }
  
  const section = apiData.sections[0];
  if (!section?.data) {
    return players;
  }
  
  for (const item of section.data) {
    if (!item.row || !item.prop) continue;
    
    const row = item.row;
    const prop = item.prop;
    
    // Extract seoName
    let seoName = null;
    if (prop.name?.seoName) {
      seoName = prop.name.seoName;
    } else if (row.name) {
      seoName = row.name;
    }
    
    // Extract team_code
    let teamCode = row.team_code;
    if (teamCode) {
      teamCode = mapTeamCode(teamCode);
    }
    
    const player = {
      id: toInt(row.player_id),
      team: teamCode,
      player_name: seoName,
      position: row.position || null,
      games_played: toInt(row.games_played),
      goals: toInt(row.goals),
      assists: toInt(row.assists),
      points: toInt(row.points),
      plusMinus: toInt(row.plus_minus),
      penalty_minutes: toInt(row.penalty_minutes),
      power_play_goals: toInt(row.power_play_goals),
      // Note: number, rookie, and veteran are NOT updated here - they come from roster sync
    };
    
    if (player.id && player.team && player.player_name) {
      players.push(player);
    }
  }
  
  return players;
}

/**
 * Sync player stats to database (only updates changed records)
 */
export async function syncPlayerStats(): Promise<{ success: boolean; error?: string; updated?: number; inserted?: number }> {
  try {
    console.log('🔄 PLAYER STATS: Starting sync...');
    
    // Fetch data from API
    const apiData = await fetchPlayerStats();
    const players = transformPlayerStats(apiData);
    
    if (players.length === 0) {
      console.log('⚠️ PLAYER STATS: No players to sync');
      return { success: true, updated: 0, inserted: 0 };
    }
    
    console.log(`📊 PLAYER STATS: Processing ${players.length} players...`);
    
    // Fetch existing players from database (paginate — PostgREST max ~1000 rows per request)
    const existingPlayers = await fetchAllTeamRosterRows();
    
    const existingMap = new Map<string, any>(
      (existingPlayers || []).map((p: any) => [String(p.id), p])
    );
    
    // Compare and find changes
    const playersToWrite: any[] = [];
    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    
    for (const player of players) {
      const playerId = String(player.id);
      const existing = existingMap.get(playerId);
      
      if (!existing) {
        playersToWrite.push(player);
        newCount++;
      } else {
        // Check if any fields changed (exclude number, rookie, veteran - those come from roster sync)
        const fieldsToCompare = ['team', 'player_name', 'position', 'games_played', 'goals', 
                                 'assists', 'points', 'plusMinus', 'penalty_minutes', 
                                 'power_play_goals'];
        
        const changedFields: string[] = [];
        fieldsToCompare.forEach(field => {
          if (player[field] !== existing[field]) {
            changedFields.push(`${field}: "${existing[field]}" → "${player[field]}"`);
          }
        });
        
        if (changedFields.length > 0) {
          console.log(`  🔄 PLAYER STATS: ${player.player_name} (${player.id}) - Changes: ${changedFields.join(', ')}`);
          playersToWrite.push(player);
          updatedCount++;
        } else {
          unchangedCount++;
        }
      }
    }
    
    console.log(`✅ PLAYER STATS: New: ${newCount}, Updated: ${updatedCount}, Unchanged: ${unchangedCount}`);
    
    const currentTime = new Date().toISOString();
    
    if (playersToWrite.length === 0) {
      console.log('✅ PLAYER STATS: No changes detected');
      // Still update lastSynced timestamp even if no changes
      const { error: updateError } = await supabase
        .from(PLAYER_ROSTER_STATS_TABLE)
        .update({ lastSynced: currentTime })
        .not('id', 'is', null)
        .limit(1);
      
      if (updateError) {
        console.error('⚠️ PLAYER STATS: Error updating lastSynced:', updateError);
      }
      return { success: true, updated: 0, inserted: 0 };
    }
    
    // Write in batches and update lastSynced
    const batchSize = 100;
    let totalWritten = 0;
    
    for (let i = 0; i < playersToWrite.length; i += batchSize) {
      const batch = playersToWrite.slice(i, i + batchSize);
      
      // Add lastSynced timestamp to each player
      const batchWithTimestamp = batch.map(player => ({
        ...player,
        lastSynced: currentTime,
        season_id: PLAYER_ROSTER_SYNC_SEASON_ID,
      }));
      
      const { error: upsertError } = await supabase
        .from(PLAYER_ROSTER_STATS_TABLE)
        .upsert(batchWithTimestamp, { onConflict: 'id' });
      
      if (upsertError) {
        throw upsertError;
      }
      
      totalWritten += batch.length;
    }
    
    // Also update lastSynced for unchanged players (so we know when the sync ran)
    if (unchangedCount > 0) {
      const unchangedPlayerIds = players
        .filter(p => {
          const existing = existingMap.get(String(p.id));
          if (!existing) return false;
          const fieldsToCompare = ['team', 'player_name', 'position', 'games_played', 'goals', 
                                   'assists', 'points', 'plusMinus', 'penalty_minutes', 
                                   'power_play_goals'];
          return !fieldsToCompare.some(field => p[field] !== existing[field]);
        })
        .map(p => p.id);
      
      if (unchangedPlayerIds.length > 0) {
        // Update in batches to avoid query size limits
        for (let i = 0; i < unchangedPlayerIds.length; i += batchSize) {
          const batch = unchangedPlayerIds.slice(i, i + batchSize);
          await supabase
            .from(PLAYER_ROSTER_STATS_TABLE)
            .update({ lastSynced: currentTime })
            .in('id', batch);
        }
      }
    }
    
    console.log(`✅ PLAYER STATS: Sync complete - ${totalWritten} players written`);
    
    return { success: true, updated: updatedCount, inserted: newCount };
  } catch (error) {
    console.error('❌ PLAYER STATS: Sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Fetch roster data for a specific team
 */
async function fetchTeamRoster(teamId: number): Promise<any> {
  const url = ROSTER_API_BASE_URL.replace('{}', String(teamId));
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`❌ PLAYER ROSTER: Error fetching team ${teamId}:`, error);
    return null;
  }
}

/**
 * Transform roster data to database format (includes team + name for inserts).
 */
function transformRosterData(apiData: any, teamAbbrev: string): any[] {
  const players: any[] = [];
  
  if (!apiData?.SiteKit?.Roster) {
    return players;
  }
  
  const roster = apiData.SiteKit.Roster;
  
  for (const item of roster) {
    // The feed ends with a nested array holding the team's coaching staff
    // (GM, coaches, video coordinator) — those entries carry `role`/`person_id`
    // instead of player fields. Skip them; they are not players.
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    
    const playerId = item.player_id || item.id;
    if (!playerId) continue;

    let playerName: string | null = null;
    const rawName = item.name != null ? String(item.name).trim() : '';
    if (rawName) {
      playerName = rawName;
    } else {
      const fn = item.first_name != null ? String(item.first_name).trim() : '';
      const ln = item.last_name != null ? String(item.last_name).trim() : '';
      const combined = `${fn} ${ln}`.trim();
      playerName = combined || null;
    }
    
    // Transform rookie: 1 = TRUE, anything else = NULL
    let rookieValue: boolean | null = null;
    const rookieRaw = item.rookie;
    if (rookieRaw === '1' || rookieRaw === 1) {
      rookieValue = true;
    }
    
    // Transform veteran_status: 1 = TRUE, anything else = NULL
    let veteranValue: boolean | null = null;
    const veteranRaw = item.veteran_status;
    if (veteranRaw === '1' || veteranRaw === 1) {
      veteranValue = true;
    }
    
    // Extract jersey number
    let jerseyNumber: string | null = null;
    const jerseyRaw = item.tp_jersey_number;
    if (jerseyRaw) {
      const jerseyStr = String(jerseyRaw).trim();
      if (jerseyStr && jerseyStr !== '0') {
        jerseyNumber = jerseyStr;
      }
    }

    const position = item.position != null && String(item.position).trim()
      ? String(item.position).trim()
      : null;
    
    players.push({
      id: parseInt(String(playerId), 10),
      team: teamAbbrev,
      player_name: playerName,
      position,
      number: jerseyNumber,
      rookie: rookieValue,
      veteran: veteranValue,
    });
  }
  
  return players;
}

/**
 * Sync player roster data (jersey numbers, rookie status, veteran status).
 * Inserts rows for anyone on the API roster who is not yet in the roster stats table (stats sync can fill in later).
 */
export async function syncPlayerRoster(): Promise<{ success: boolean; error?: string; updated?: number; inserted?: number }> {
  try {
    console.log('🔄 PLAYER ROSTER: Starting sync...');
    
    let totalUpdated = 0;
    let totalInserted = 0;
    let totalProcessed = 0;
    let teamsProcessed = 0;
    const allProcessedPlayerIds: number[] = [];
    const currentTime = new Date().toISOString();

    const normalizeValue = (value: any): any => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      if (typeof value === 'boolean') {
        return value;
      }
      if (typeof value === 'string') {
        return value.trim() || null;
      }
      return value;
    };

    let teamIdToAbbrev: Map<number, string>;
    try {
      const standingsData = await fetchTeamStandings(true);
      teamIdToAbbrev = buildTeamIdToAbbrevMap(standingsData);
    } catch (e) {
      console.error('❌ PLAYER ROSTER: Could not load team id → abbreviation map (standings feed):', e);
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
    
    for (const teamId of TEAM_IDS) {
      console.log(`📋 PLAYER ROSTER: Processing team ${teamId}...`);

      const teamAbbrev = teamIdToAbbrev.get(teamId);
      if (!teamAbbrev) {
        console.error(`  ❌ PLAYER ROSTER: No abbreviation mapping for HockeyTech team_id=${teamId}`);
        continue;
      }

      const apiData = await fetchTeamRoster(teamId);
      if (!apiData) {
        continue;
      }

      const players = transformRosterData(apiData, teamAbbrev);
      if (players.length === 0) {
        console.log(`  ⚠️ PLAYER ROSTER: No players found for team ${teamId}`);
        continue;
      }
      
      totalProcessed += players.length;
      
      const playerIds = players.map(p => p.id);
      const { data: existingPlayers, error: fetchError } = await supabase
        .from(PLAYER_ROSTER_STATS_TABLE)
        .select('id, player_name, number, rookie, veteran')
        .in('id', playerIds);
      
      if (fetchError) {
        console.error(`  ❌ PLAYER ROSTER: Error fetching existing players for team ${teamId}:`, fetchError);
        continue;
      }
      
      const existingMap = new Map(
        (existingPlayers || []).map((p: any) => [p.id, p])
      );

      const newPlayers: typeof players = [];
      
      let teamUpdated = 0;
      let teamUnchanged = 0;
      let teamInserted = 0;
      
      for (const player of players) {
        const existing = existingMap.get(player.id);
        if (!existing) {
          newPlayers.push(player);
          continue;
        }

        if (!allProcessedPlayerIds.includes(player.id)) {
          allProcessedPlayerIds.push(player.id);
        }

        const playerNumber = normalizeValue(player.number);
        const playerRookie = normalizeValue(player.rookie);
        const playerVeteran = normalizeValue(player.veteran);
        
        const existingNumber = normalizeValue(existing.number);
        const existingRookie = normalizeValue(existing.rookie);
        const existingVeteran = normalizeValue(existing.veteran);
        
        const changedFields: string[] = [];
        if (playerNumber !== existingNumber) {
          changedFields.push(`number: "${existingNumber}" → "${playerNumber}"`);
        }
        if (playerRookie !== existingRookie) {
          changedFields.push(`rookie: ${existingRookie} → ${playerRookie}`);
        }
        if (playerVeteran !== existingVeteran) {
          changedFields.push(`veteran: ${existingVeteran} → ${playerVeteran}`);
        }
        
        const hasChanges = changedFields.length > 0;
        
        if (hasChanges) {
          const playerName = existing.player_name || `Player ${player.id}`;
          console.log(`  🔄 PLAYER ROSTER: ${playerName} (${player.id}) - Changes: ${changedFields.join(', ')}`);
          
          const { error: updateError } = await supabase
            .from(PLAYER_ROSTER_STATS_TABLE)
            .update({
              number: playerNumber,
              rookie: playerRookie,
              veteran: playerVeteran,
              lastSynced: currentTime,
            })
            .eq('id', player.id);
          
          if (updateError) {
            console.error(`  ❌ PLAYER ROSTER: Error updating player ${player.id}:`, updateError);
          } else {
            teamUpdated++;
            totalUpdated++;
          }
        } else {
          teamUnchanged++;
        }
      }

      const validNewPlayers = newPlayers.filter((p) => {
        if (!p.player_name) {
          console.warn(`  ⚠️ PLAYER ROSTER: Cannot insert player id=${p.id} — no name in API row`);
          return false;
        }
        return true;
      });

      if (validNewPlayers.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < validNewPlayers.length; i += batchSize) {
          const slice = validNewPlayers.slice(i, i + batchSize);
          const batch = slice.map((p) => ({
            id: p.id,
            team: p.team,
            player_name: p.player_name,
            position: p.position,
            number: normalizeValue(p.number),
            rookie: normalizeValue(p.rookie),
            veteran: normalizeValue(p.veteran),
            games_played: null,
            goals: null,
            assists: null,
            points: null,
            plusMinus: null,
            penalty_minutes: null,
            power_play_goals: null,
            lastSynced: currentTime,
            season_id: PLAYER_ROSTER_SYNC_SEASON_ID,
          }));

          const { error: insertError } = await supabase
            .from(PLAYER_ROSTER_STATS_TABLE)
            .upsert(batch, { onConflict: 'id' });

          if (insertError) {
            console.error(`  ❌ PLAYER ROSTER: Error inserting players for team ${teamId}:`, insertError);
          } else {
            for (const p of slice) {
              console.log(`  ➕ PLAYER ROSTER: Inserted ${p.player_name} (${p.id}) team=${p.team}`);
            }
            teamInserted += slice.length;
            totalInserted += slice.length;
            for (const p of slice) {
              if (!allProcessedPlayerIds.includes(p.id)) {
                allProcessedPlayerIds.push(p.id);
              }
            }
          }
        }
      }

      if (teamInserted > 0 || teamUpdated > 0) {
        console.log(
          `  ✅ PLAYER ROSTER: Team ${teamId} (${teamAbbrev}) — inserted: ${teamInserted}, updated: ${teamUpdated}, unchanged: ${teamUnchanged}`
        );
      } else {
        console.log(`  ⊘ PLAYER ROSTER: Team ${teamId} (${teamAbbrev}) — All ${teamUnchanged} players unchanged`);
      }
      
      teamsProcessed++;
    }
    
    // Refresh lastSynced for everyone seen on a roster this run (insert/update already set it; this aligns unchanged rows)
    if (allProcessedPlayerIds.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < allProcessedPlayerIds.length; i += batchSize) {
        const batch = allProcessedPlayerIds.slice(i, i + batchSize);
        await supabase
          .from(PLAYER_ROSTER_STATS_TABLE)
          .update({ lastSynced: currentTime })
          .in('id', batch);
      }
    }
    
    console.log(
      `✅ PLAYER ROSTER: Sync complete — inserted: ${totalInserted}, updated: ${totalUpdated}, roster rows seen: ${totalProcessed}, teams: ${teamsProcessed}`
    );
    
    return { success: true, updated: totalUpdated, inserted: totalInserted };
  } catch (error) {
    console.error('❌ PLAYER ROSTER: Sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Check if team standings sync is needed (24 hours since last sync)
 * Checks the lastSynced column in teams table
 */
export async function shouldSyncTeamStandings(): Promise<boolean> {
  try {
    // Get the most recent lastSynced timestamp from any team
    // If all lastSynced are NULL, this will return no rows and we'll sync
    const { data, error } = await supabase
      .from('teams')
      .select('lastSynced')
      .not('lastSynced', 'is', null)
      .order('lastSynced', { ascending: false })
      .limit(1)
      .maybeSingle();
    
    // If error, no data, or all lastSynced are NULL, sync now
    if (error || !data || !data.lastSynced) {
      return true;
    }

    const lastSync = new Date(data.lastSynced);
    const now = new Date();
    const hoursSinceSync = (now.getTime() - lastSync.getTime()) / (1000 * 60 * 60);

    return hoursSinceSync >= SYNC_INTERVAL_HOURS;
  } catch (error) {
    console.error('Error checking team standings sync status:', error);
    return true; // On error, sync to be safe
  }
}

/**
 * Fetch and parse team standings from HockeyTech API
 */
async function fetchTeamStandings(quiet = false): Promise<any> {
  if (!quiet) {
    console.log('🌐 TEAM STANDINGS: Fetching from API...');
  }

  try {
    const response = await fetch(TEAM_STANDINGS_API_URL);
    const rawData = await response.text();
    
    // Strip JSONP callback wrapper
    let jsonData = rawData;
    if (rawData.startsWith('myCallback(')) {
      jsonData = rawData.slice(11); // Remove "myCallback("
      if (jsonData.endsWith(')')) {
        jsonData = jsonData.slice(0, -1); // Remove trailing ")"
      }
    }
    
    const data = JSON.parse(jsonData);
    return data;
  } catch (error) {
    console.error('❌ TEAM STANDINGS: Error fetching API data:', error);
    throw error;
  }
}

/**
 * Transform team standings API data to database format
 */
function transformTeamStandings(apiData: any): any[] {
  const teams: any[] = [];
  
  if (!apiData?.SiteKit?.Statviewtype) {
    return teams;
  }
  
  const standings = apiData.SiteKit.Statviewtype;
  
  for (const team of standings) {
    // Skip header rows (they have repeatheader property)
    if (team.repeatheader || !team.team_code) {
      continue;
    }
    
    // Map team code (LV → LAV)
    let teamCode = team.team_code;
    teamCode = mapTeamCode(teamCode);
    
    // Remove " Division" from division name (e.g., "North Division" -> "North")
    let division = team.divisname || null;
    if (division && division.endsWith(' Division')) {
      division = division.slice(0, -9); // Remove " Division" (9 characters)
    }
    
    // Transform the data
    const teamData = {
      abbreviation: teamCode,
      division: division,
      games_played: team.games_played ? String(team.games_played) : null,
      wins: team.wins ? String(team.wins) : null,
      losses: team.losses ? String(team.losses) : null,
      otl: team.ot_losses ? String(team.ot_losses) : null,
      sol: team.shootout_losses ? String(team.shootout_losses) : null,
      points: team.points ? String(team.points) : null,
      division_rank: team.rank !== undefined && team.rank !== null ? String(team.rank) : null,
      overall_rank: team.overall_rank !== undefined && team.overall_rank !== null ? String(team.overall_rank) : null,
    };
    
    teams.push(teamData);
  }
  
  return teams;
}

/**
 * Sync team standings to database (only updates changed records)
 */
export async function syncTeamStandings(): Promise<{ success: boolean; error?: string; updated?: number }> {
  try {
    console.log('🔄 TEAM STANDINGS: Starting sync...');
    
    // Fetch data from API
    const apiData = await fetchTeamStandings();
    const teams = transformTeamStandings(apiData);
    
    if (teams.length === 0) {
      console.log('⚠️ TEAM STANDINGS: No teams to sync');
      return { success: true, updated: 0 };
    }
    
    console.log(`📊 TEAM STANDINGS: Processing ${teams.length} teams...`);
    
    // Fetch existing teams from database
    const { data: existingTeams, error: fetchError } = await supabase
      .from('teams')
      .select('id, abbreviation, division, games_played, wins, losses, otl, sol, points, division_rank, overall_rank');
    
    if (fetchError) {
      throw fetchError;
    }
    
    const existingMap = new Map(
      (existingTeams || []).map((t: any) => [t.abbreviation, t])
    );
    
    // Compare and find changes
    let updatedCount = 0;
    let unchangedCount = 0;
    let notFoundCount = 0;
    
    for (const team of teams) {
      const existing = existingMap.get(team.abbreviation);
      
      if (!existing) {
        console.log(`  ⚠️ TEAM STANDINGS: Team ${team.abbreviation} not found in database`);
        notFoundCount++;
        continue;
      }
      
      // Check if any of the standings fields changed
      const fieldsToCompare = ['division', 'games_played', 'wins', 'losses', 'otl', 'sol', 'points', 'division_rank', 'overall_rank'];
      const hasChanges = fieldsToCompare.some(field => team[field] !== existing[field]);
      
      if (hasChanges) {
        const currentTime = new Date().toISOString();
        const { error: updateError } = await supabase
          .from('teams')
          .update({
            division: team.division,
            games_played: team.games_played,
            wins: team.wins,
            losses: team.losses,
            otl: team.otl,
            sol: team.sol,
            points: team.points,
            division_rank: team.division_rank,
            overall_rank: team.overall_rank,
            lastSynced: currentTime,
          })
          .eq('id', existing.id);
        
        if (updateError) {
          console.error(`  ❌ TEAM STANDINGS: Error updating team ${team.abbreviation}:`, updateError);
        } else {
          updatedCount++;
        }
      } else {
        unchangedCount++;
      }
    }
    
    if (updatedCount > 0) {
      console.log(`✅ TEAM STANDINGS: Updated: ${updatedCount}, Unchanged: ${unchangedCount}, Not found: ${notFoundCount}`);
    } else {
      console.log(`⊘ TEAM STANDINGS: All ${unchangedCount} teams unchanged, Not found: ${notFoundCount}`);
    }
    
    // Update lastSynced timestamp for all teams (both updated and unchanged)
    const currentTime = new Date().toISOString();
    const allTeamIds = teams.map(t => existingMap.get(t.abbreviation)?.id).filter(Boolean);
    
    if (allTeamIds.length > 0) {
      // Update in batches
      const batchSize = 100;
      for (let i = 0; i < allTeamIds.length; i += batchSize) {
        const batch = allTeamIds.slice(i, i + batchSize);
        await supabase
          .from('teams')
          .update({ lastSynced: currentTime })
          .in('id', batch);
      }
    }
    
    if (updatedCount > 0) {
      console.log(`✅ TEAM STANDINGS: Sync complete - ${updatedCount} teams updated`);
    } else {
      console.log(`✅ TEAM STANDINGS: Sync complete - No changes detected`);
    }
    
    return { success: true, updated: updatedCount };
  } catch (error) {
    console.error('❌ TEAM STANDINGS: Sync error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}


