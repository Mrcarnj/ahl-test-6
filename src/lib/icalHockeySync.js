// iCal Hockey Schedule Sync Service
// Handles fetching and parsing iCal data from HorizonWebRef
// Converts to Supabase format with proper timezone handling

import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendGameChangeNotification } from './notificationService';
import { supabase } from './supabase';

// ------------------------------------------------------------
// Cache/versioning
// ------------------------------------------------------------
// NOTE: Do NOT clear auth/session storage here. Only clear hockey-sync specific keys.
const HOCKEY_SYNC_CACHE_VERSION = 1;
const HOCKEY_SYNC_CACHE_VERSION_KEY = 'hockey_sync_cache_version';
const SCHEDULE_SYNC_PAST_DAYS = 14; // Only process games from the last N days onward (speeds up sync)
let hockeySyncCacheVersionEnsured = false;
let hockeySyncInFlight = null;

async function ensureHockeySyncCacheVersion() {
  if (hockeySyncCacheVersionEnsured) return;

  try {
    const storedVersion = await AsyncStorage.getItem(HOCKEY_SYNC_CACHE_VERSION_KEY);
    const expected = String(HOCKEY_SYNC_CACHE_VERSION);

    if (storedVersion !== expected) {
      console.log(
        `🧹 HOCKEY SYNC: Cache version mismatch (stored=${storedVersion}, expected=${expected}) - clearing hockey sync storage keys`
      );

      const keysToRemove = [
        HOCKEY_SYNC_CACHE_VERSION_KEY,
        SYNC_STORAGE_KEYS.LAST_SYNC,
        SYNC_STORAGE_KEYS.SYNC_COUNT,
        SYNC_STORAGE_KEYS.LAST_ERROR,
        'hockey_sync_log',
      ];

      if (AsyncStorage.multiRemove) {
        await AsyncStorage.multiRemove(keysToRemove);
      } else {
        // Fallback for older AsyncStorage implementations
        for (const k of keysToRemove) {
          try {
            await AsyncStorage.removeItem(k);
          } catch (e) {
            // swallow
          }
        }
      }

      await AsyncStorage.setItem(HOCKEY_SYNC_CACHE_VERSION_KEY, expected);
    }

    hockeySyncCacheVersionEnsured = true;
  } catch (error) {
    console.error('HOCKEY SYNC: Error ensuring cache version:', error);
    // Don't throw; syncing should still work without cache/version metadata.
  }
}

// Exact parsing code based on HorizonWebRef iCal format
export async function fetchAndParseHockeySchedule(testMode = false, userId = null) {
  // Deduplicate normal sync runs so we don't accidentally run multiple heavy syncs at once.
  if (!testMode && hockeySyncInFlight) {
    return hockeySyncInFlight;
  }

  const run = (async () => {
  try {
    await ensureHockeySyncCacheVersion();

    // Get the user's iCal URL from the roster table
    if (!userId || userId === undefined) {
      // If no userId provided, try to get current user from session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No user session found');
      }
      userId = user.id;
    }

    console.log(`🔍 Fetching iCal URL for user: ${userId}`);
    const { data: rosterData, error: rosterError } = await supabase
      .from('roster')
      .select('ical_url')
      .eq('auth_id', userId)
      .single();

    if (rosterError || !rosterData) {
      throw new Error(`Could not find roster data for user: ${rosterError?.message || 'User not found'}`);
    }

    if (!rosterData.ical_url) {
      throw new Error('User has not set up their iCal URL yet');
    }

    const icalUrl = rosterData.ical_url;
    console.log(`🌐 Using user's iCal URL: ${icalUrl}`);
    
    console.log('🌐 Fetching iCal data from HorizonWebRef...');
    const controller = new AbortController();
    const fetchTimeout = setTimeout(() => controller.abort(), 20000);
    const response = await fetch(icalUrl, {
      headers: {
        'User-Agent': 'DietrichApp/v1.0.1'
      },
      signal: controller.signal,
    }).finally(() => clearTimeout(fetchTimeout));
    const icalText = await response.text();
    
    console.log(`📄 iCal data received: ${icalText.length} characters`);
    console.log('🔄 Parsing iCal events and converting timezones...');
    
    const games = await parseIcalToGames(icalText);
    
    if (testMode) {
      console.log('🏒 Hockey Schedule Parsing Complete!');
      console.log(`📊 Total games parsed: ${games.length}`);
      console.log('📅 Parsed Games:', games);
      return { success: true, testOutput: games };
    }
    
    // Filter games by organizer BEFORE processing - only process games with Stephen Thomson or Riley Yerkovich (after 11/9/2025)
    const filteredGames = [];
    const cutoffDate = new Date('2025-11-10'); // 11/10/2025 (day after 11/9/2025)
    
    for (const game of games) {
      if (game.organizer === "Stephen Thomson") {
        filteredGames.push(game);
        console.log(`✅ Including game ${game.gameId} - organizer: ${game.organizer}`);
      } else if (game.organizer === "Riley Yerkovich") {
        // Parse the game date from the start time
        if (!game.startTime || typeof game.startTime !== 'string' || !game.startTime.includes('T')) {
          console.warn(`⏭️ ICAL: Skipping game ${game.gameId || 'unknown'} - invalid startTime`, {
            reason: 'invalid_startTime',
            gameId: game.gameId || null,
            organizer: game.organizer || null,
            startTime: game.startTime ?? null,
          });
          continue;
        }
        const gameDate = new Date(game.startTime.split('T')[0]);
        
        if (gameDate >= cutoffDate) {
          filteredGames.push(game);
          console.log(`✅ Including game ${game.gameId} - organizer: ${game.organizer} (date: ${gameDate.toISOString().split('T')[0]})`);
        } else {
          console.log(`⏭️ Skipping game ${game.gameId || 'unknown'} - organizer: ${game.organizer} (date: ${gameDate.toISOString().split('T')[0]} is before cutoff)`);
        }
      } else {
        console.log(`⏭️ Skipping game ${game.gameId || 'unknown'} - organizer: ${game.organizer || 'not found'}`);
      }
    }

    // Further reduce work: only process games from the last N days onward.
    // This keeps the schedule current without re-processing old completed games.
    const minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    minDate.setDate(minDate.getDate() - SCHEDULE_SYNC_PAST_DAYS);

    const windowedGames = filteredGames.filter((g) => {
      try {
        const dateStr = (g.startTime || '').split('T')[0];
        if (!dateStr) return false;
        const gameDate = new Date(`${dateStr}T00:00:00`);
        return gameDate >= minDate;
      } catch {
        return false;
      }
    });
    console.log(`🗓️ Windowed games: ${windowedGames.length}/${filteredGames.length} (from ${minDate.toISOString().split('T')[0]} onward)`);
    
    // Process only the filtered games for database
    const processedGames = [];
    for (const game of windowedGames) {
      const dbGame = await convertToDbFormat(game);
      if (dbGame) {
        processedGames.push(dbGame);
      }
    }
    
    // Debug: Show all processed games
    console.log('📊 === PROCESSED GAMES FOR DATABASE ===');
    processedGames.forEach((game, index) => {
      console.log(`Game ${index + 1}:`);
      console.log(`  Game ID: ${game.gameid}`);
      console.log(`  Teams: ${game.awayteam} @ ${game.hometeam}`);
      console.log(`  Date: ${game.gamedate}`);
      console.log(`  Time: ${game.gametime}`);
      console.log('---');
    });
    console.log('📊 === END PROCESSED GAMES ===');
    
    // Upload to database
    const results = await upsertGamesToDatabase(processedGames);

    // Persist last sync time for ALL successful manual syncs (not just auto sync).
    // This is used across screens to consistently display "Last sync".
    await setLastSyncTime();
    
    return {
      success: true,
      gamesProcessed: processedGames.length,
      newGames: results.newCount,
      updatedGames: results.updateCount,
      skippedGames: results.skippedCount,
      debugInfo: processedGames.map(game => ({
        gameid: game.gameid,
        teams: `${game.awayteam} @ ${game.hometeam}`,
        date: game.gamedate,
        time: game.gametime
      }))
    };
    
  } catch (error) {
    console.error('Hockey schedule sync error:', error);

    // Best-effort persist last error for debugging/UI.
    try {
      await ensureHockeySyncCacheVersion();
      await AsyncStorage.setItem(
        SYNC_STORAGE_KEYS.LAST_ERROR,
        (error && error.message) ? String(error.message) : String(error)
      );
    } catch (e) {
      // swallow
    }

    return { success: false, error: error.message };
  }
  })();

  if (!testMode) {
    hockeySyncInFlight = run.finally(() => {
      hockeySyncInFlight = null;
    });
    return hockeySyncInFlight;
  }

  return run;
}

async function parseIcalToGames(icalText) {
  const games = [];
  const events = icalText.split('BEGIN:VEVENT');
  
  // Skip first element (before first event)
  for (let i = 1; i < events.length; i++) {
    const eventText = events[i];
    const game = await parseEvent(eventText);
    if (game) {
      games.push(game);
    }
  }
  
  return games;
}

async function parseEvent(eventText) {
  try {
    // Debug: Show raw ORGANIZER lines
    const organizerLines = eventText.match(/ORGANIZER.*$/gm);
    if (organizerLines) {
      console.log('🔍 Found ORGANIZER lines:', organizerLines);
    }
    
    // Extract basic fields using regex
    const uid = extractField(eventText, 'UID');
    const dtstart = extractField(eventText, 'DTSTART');
    const dtend = extractField(eventText, 'DTEND');
    const location = extractField(eventText, 'LOCATION');
    const description = extractField(eventText, 'DESCRIPTION');
    const summary = extractField(eventText, 'SUMMARY');
    // Try multiple organizer patterns
    let organizer = extractField(eventText, 'ORGANIZER;CN="(.+?)"');
    if (!organizer) {
      organizer = extractField(eventText, 'ORGANIZER:mailto:(.+?)@');
    }
    if (!organizer) {
      organizer = extractField(eventText, 'ORGANIZER:(.+?)$');
    }
    if (!organizer) {
      // Try to extract from ORGANIZER field without CN parameter
      const organizerMatch = eventText.match(/ORGANIZER:(.+?)(?:\n|$)/);
      if (organizerMatch) {
        organizer = organizerMatch[1].trim();
      }
    }
    
    console.log('📋 Extracted organizer:', organizer);
    
    if (!uid || !dtstart || !description) {
      return null; // Skip incomplete events
    }
    
    // Parse description for game details
    const gameDetails = parseDescription(description);
    if ((!gameDetails?.homeTeam || !gameDetails?.awayTeam) && summary) {
      const teamsFromSummary = parseTeamsFromSummary(summary);
      if (teamsFromSummary) {
        gameDetails.homeTeam = gameDetails.homeTeam || teamsFromSummary.homeTeam;
        gameDetails.awayTeam = gameDetails.awayTeam || teamsFromSummary.awayTeam;
      }
    }

    // If we can't extract essential game info, skip this VEVENT.
    // This prevents invalid inserts (e.g. awayteam/hometeam NOT NULL in DB).
    if (!gameDetails?.gameId || !gameDetails?.homeTeam || !gameDetails?.awayTeam) {
      console.warn('⚠️ ICAL: Skipping VEVENT due to missing required game details', {
        reason: 'missing_game_details',
        uid,
        organizer,
        dtstart,
        dtend,
        summary: summary ?? null,
        descriptionPreview: typeof description === 'string' ? description.slice(0, 180) : null,
        gameId: gameDetails?.gameId ?? null,
        homeTeam: gameDetails?.homeTeam ?? null,
        awayTeam: gameDetails?.awayTeam ?? null,
      });
      return null;
    }
    
    // Convert times to home team's timezone
    const startTime = await convertIcalTimeToTeamTimezone(dtstart, gameDetails.homeTeam);
    const endTime = await convertIcalTimeToTeamTimezone(dtend, gameDetails.homeTeam);

    // If we can't derive a usable time (bad/malformed event), skip it.
    if (!startTime) {
      console.warn('⚠️ ICAL: Skipping VEVENT due to missing/invalid startTime', {
        reason: 'invalid_startTime',
        uid,
        organizer,
        dtstart,
        dtend,
        summary: summary ?? null,
        gameId: gameDetails.gameId,
        homeTeam: gameDetails.homeTeam,
        awayTeam: gameDetails.awayTeam,
      });
      return null;
    }
    
    return {
      uid: uid,
      gameId: gameDetails.gameId,
      homeTeam: gameDetails.homeTeam,
      awayTeam: gameDetails.awayTeam,
      startTime: startTime,
      endTime: endTime,
      venue: cleanLocation(location),
      summary: summary || null,
      gameCode: gameDetails.gameCode,
      referees: gameDetails.referees,
      linespeople: gameDetails.linespeople,
      organizer: organizer || 'Unknown'
    };
    
  } catch (error) {
    console.error('Error parsing event:', error);
    return null;
  }
}

function extractField(text, fieldName) {
  let regex;
  
  if (fieldName.includes('(')) {
    // Custom regex for ORGANIZER field
    regex = new RegExp(fieldName + ':MAILTO:(.+?)(?:\\r?\\n|$)', 'i');
  } else {
    // Standard field extraction - handle multi-line fields
    // Look for field name followed by colon, then capture everything until next field or end
    const nextFieldPattern = '\\r?\\n[A-Z][A-Z0-9-]*[:;]';
    regex = new RegExp(fieldName + ':(.+?)(?=' + nextFieldPattern + '|\\r?\\nEND:VEVENT|$)', 'is');
  }
  
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function parseDescription(description) {
  // Clean up the description (remove escaped characters and normalize whitespace)
  const cleanDesc = description
    .replace(/\\n/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .trim();
  
  // Extract teams from lines like "San Jose @ Bakersfield" (handle line breaks)
  // Look for the pattern after the synchronizer text
  const teamMatch = cleanDesc.match(/Schedule Synchronizer\s+([A-Za-z\s.'&-]+?)\s@\s([A-Za-z\s.'&-]+?)\s+Game Code/i);
  let awayTeam = null, homeTeam = null;
  
  if (teamMatch) {
    awayTeam = teamMatch[1].trim();
    homeTeam = teamMatch[2].trim();
  } else {
    // Fallback: sometimes the iCal description doesn't include the "Schedule Synchronizer" prefix
    const fallbackMatch = cleanDesc.match(/([A-Za-z\s.'&-]+?)\s@\s([A-Za-z\s.'&-]+?)\s+Game Code/i);
    if (fallbackMatch) {
      awayTeam = fallbackMatch[1].trim();
      homeTeam = fallbackMatch[2].trim();
    }
  }
  
  // Extract Game Code (e.g., "Game Code: Preseason")
  const gameCodeMatch = cleanDesc.match(/Game Code:\s*([A-Za-z\s]+?)(?:\s+[A-Za-z]|$)/i);
  const gameCode = gameCodeMatch ? gameCodeMatch[1].trim() : null;
  
  // Extract Game ID (e.g., "Game ID #: EX13")
  const gameIdMatch = cleanDesc.match(/Game ID #:\s*([A-Za-z0-9\s]+?)(?:\s+Last|$)/i);
  const gameId = gameIdMatch ? gameIdMatch[1].trim() : null;
  
  // Extract officials - look for pattern "Name (Role)" (handle line breaks in names)
  const referees = [];
  const linespeople = [];
  
  // Extract the officials section between Game Code and Game ID
  const officialsSection = cleanDesc.match(/Game Code:\s*[A-Za-z]+\s+(.*?)Game ID #:/s);
  
  if (officialsSection) {
    const officialsText = officialsSection[1];
    
    // Match all officials with their roles - more precise pattern
    // Exclude "Season" from the name capture
    // Updated regex to include hyphens and apostrophes in names
    const officialMatches = officialsText.matchAll(/(?:(?:Season\s+)?)([A-Z][a-z]+(?:[\s'-][A-Za-z]+)*)\s\((Referee|Linesperson)\)/gi);
    
    for (const match of officialMatches) {
      const name = match[1].trim();
      const role = match[2];
      
      // Additional cleanup: remove "Season" if it somehow got through
      const cleanName = name.replace(/^Season\s+/i, '');
      
      console.log(`🔍 Extracted official: "${cleanName}" (${role})`);
      
      if (role.toLowerCase() === 'referee') {
        referees.push(cleanName);
      } else if (role.toLowerCase() === 'linesperson') {
        linespeople.push(cleanName);
      }
    }
  }
  
  return {
    awayTeam,
    homeTeam,
    gameCode,
    gameId,
    referees,
    linespeople
  };
}

function parseTeamsFromSummary(summary) {
  try {
    if (!summary || typeof summary !== 'string') return null;
    // Find the first "Away @ Home" pattern in SUMMARY
    const match = summary.match(/([A-Za-z\s.'&-]+?)\s@\s([A-Za-z\s.'&-]+?)(?:\s|$)/i);
    if (!match) return null;
    return {
      awayTeam: match[1].trim(),
      homeTeam: match[2].trim(),
    };
  } catch {
    return null;
  }
}

async function convertIcalTimeToTeamTimezone(icalTime, homeTeam) {
  // Input format: "20251004T200000Z" (UTC)
  // Convert to team's local timezone dynamically
  
  if (!icalTime) return null;
  
  try {
    // Parse the iCal time format - handle both UTC (Z) and timezone offset formats
    const timeMatch = icalTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2})$/);
    if (!timeMatch) {
      console.warn(`Invalid iCal time format: ${icalTime}`);
      return null;
    }
    
    const [, year, month, day, hour, minute, second, offsetStr] = timeMatch;

    // Determine if DST is in effect for this date
    const gameDate = new Date(`${year}-${month}-${day}T12:00:00Z`);
    const isDST = isDaylightSavingTime(gameDate);
    const timeCorrection = isDST ? 4 : 5;

    // Apply the iCal time correction (feed appears ahead by 4/5 hours)
    let correctedHour = parseInt(hour, 10) - timeCorrection;
    let correctedDay = parseInt(day, 10);
    let correctedMonth = parseInt(month, 10);
    let correctedYear = parseInt(year, 10);

    // Handle day rollover when hour goes negative
    if (correctedHour < 0) {
      correctedHour += 24;
      correctedDay -= 1; // Move to previous day

      // Handle month rollover
      if (correctedDay < 1) {
        correctedMonth -= 1;

        // Handle year rollover
        if (correctedMonth < 1) {
          correctedMonth = 12;
          correctedYear -= 1;
        }

        // Get the last day of the previous month
        const lastDayOfMonth = new Date(correctedYear, correctedMonth, 0).getDate();
        correctedDay = lastDayOfMonth;
      }
    }

    const correctedTime = {
      year: correctedYear.toString(),
      month: correctedMonth.toString().padStart(2, '0'),
      day: correctedDay.toString().padStart(2, '0'),
      hour: correctedHour.toString().padStart(2, '0'),
      minute,
      second
    };

    // Default offset when we can't resolve a team timezone (keeps downstream formatting stable)
    let offset = '-08:00';

    if (homeTeam) {
      console.log(`🔍 Looking up timezone for team: "${homeTeam}"`);
    
      // Look up the home team's timezone from the teams table
      // Try multiple lookup strategies since iCal might use different naming
      let teamData = null;
    
      // Strategy 1: Try exact match with city
      const { data: cityMatch } = await supabase
        .from('teams')
        .select('timezone, city')
        .eq('city', homeTeam)
        .single();
    
      if (cityMatch) {
        teamData = cityMatch;
        console.log(`✅ Found exact city match: "${cityMatch.city}"`);
      } else {
        // Strategy 2: Try partial match (e.g., "Bakersfield" might match "Bakersfield Condors")
        const { data: partialMatch } = await supabase
          .from('teams')
          .select('timezone, city')
          .ilike('city', `%${homeTeam}%`)
          .single();
      
        if (partialMatch) {
          teamData = partialMatch;
          console.log(`✅ Found partial city match: "${partialMatch.city}"`);
        } else {
          console.log(`❌ No city match found for: "${homeTeam}"`);
        }
      }
    
      if (!teamData || !teamData.timezone) {
        console.warn(`No timezone found for team: ${homeTeam}, using default offset fallback`);
      } else {
        const teamTimezone = teamData.timezone;
        const date = new Date(`${correctedTime.year}-${correctedTime.month}-${correctedTime.day}T${correctedTime.hour}:${minute}:${second}`);
        offset = getTimezoneOffset(date, teamTimezone);
      }
    } else {
      console.warn('No homeTeam found in event description; using default offset fallback');
    }
    
    // For UTC times (Z), use the computed/fallback offset.
    // For offset times, keep the same offset but with corrected time.
    const finalOffset = offsetStr === 'Z' ? offset : offsetStr;
    
    const convertedTime = `${correctedTime.year}-${correctedTime.month}-${correctedTime.day}T${correctedTime.hour}:${correctedTime.minute}:${correctedTime.second}${finalOffset}`;
    
    console.log(`   Final Time: ${convertedTime}`);
    
    return convertedTime;
    
  } catch (error) {
    console.error(`Error converting time for team ${homeTeam}:`, error);
    return null;
  }
}


function getTimezoneOffset(date, timezone) {
  // Get the timezone offset for a specific timezone and date
  try {
    // Handle different timezone formats and return appropriate offsets
    const month = date.getMonth() + 1; // 1-based month
    
    // Determine if it's daylight saving time (rough approximation)
    // DST typically runs from March (3) to November (11)
    const isDST = month >= 3 && month <= 11;
    
    let offset;
    
    if (timezone === 'PST' || timezone === 'PDT') {
      // Pacific: Always store as -08:00 (PST) regardless of DST
      offset = '-08:00';
    } else if (timezone === 'EST' || timezone === 'EDT') {
      // Eastern: Always store as -04:00 (EDT) regardless of DST
      offset = '-04:00';
    } else if (timezone === 'CST' || timezone === 'CDT') {
      // Central: Always store as -06:00 (CST) regardless of DST
      offset = '-06:00';
    } else if (timezone === 'MST' || timezone === 'MDT') {
      // Mountain: Always store as -07:00 (MST) regardless of DST
      offset = '-07:00';
    } else {
      // Default to PST
      offset = '-08:00';
    }
    
    console.log(`   Timezone offset calculation: ${timezone} (month ${month}, DST: ${isDST}) = ${offset} (standardized)`);
    
    return offset;
  } catch (error) {
    console.error(`Error calculating timezone offset for ${timezone}:`, error);
    return '-08:00'; // Default to PST
  }
}

function cleanLocation(location) {
  if (!location) return null;
  
  // Remove encoding artifacts and clean up
  return location
    .replace(/\\,/g, ',')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDaylightSavingTime(date) {
  // DST in the US typically runs from the second Sunday in March to the first Sunday in November
  // This is a simplified calculation that should work for most cases
  
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-based month
  const day = date.getDate();
  
  // DST typically ends on the first Sunday in November (clocks fall back)
  // DST typically starts on the second Sunday in March (clocks spring forward)
  
  // If we're in November or later in the year, check if we're before the first Sunday
  if (month >= 11) {
    const firstSundayNov = getFirstSundayOfMonth(year, 11);
    return day < firstSundayNov;
  }
  
  // If we're in March or later but before November, check if we're after the second Sunday in March
  if (month >= 3 && month < 11) {
    const secondSundayMar = getSecondSundayOfMonth(year, 3);
    const marchDate = month === 3 ? day : 32; // 32 will always be > any March date
    return marchDate >= secondSundayMar;
  }
  
  // January and February are definitely standard time
  return false;
}

function getFirstSundayOfMonth(year, month) {
  // Get the first day of the month and find the first Sunday
  const firstDay = new Date(year, month - 1, 1);
  const dayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const daysUntilSunday = (7 - dayOfWeek) % 7;
  return daysUntilSunday === 0 ? 1 : 1 + daysUntilSunday;
}

function getSecondSundayOfMonth(year, month) {
  const firstSunday = getFirstSundayOfMonth(year, month);
  return firstSunday + 7;
}

function determineSeasonFromDate(gameDate) {
  const date = new Date(gameDate);
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-based month
  
  // AHL season runs roughly Oct-June
  if (month >= 10) {
    return `${year}-${(year + 1).toString().slice(2)}`;
  } else {
    return `${year - 1}-${year.toString().slice(2)}`;
  }
}

async function convertToDbFormat(game) {
  // Convert official names from "First Last" to "Last, First" format
  const referee1 = await convertOfficialName(game.referees[0]);
  const referee2 = await convertOfficialName(game.referees[1]);
  const linesperson1 = await convertOfficialName(game.linespeople[0]);
  const linesperson2 = await convertOfficialName(game.linespeople[1]);
  
  const gameDate = game.startTime.split('T')[0];
  const gameTime = game.startTime.split('T')[1];
  
  return {
    gameid: game.gameId,
    season: determineSeasonFromDate(gameDate),
    awayteam: game.awayTeam,
    hometeam: game.homeTeam,
    gamedate: gameDate,
    gametime: gameTime,
    gamecode: game.gameCode,
    referee1,
    referee2,
    linesperson1,
    linesperson2
  };
}

async function convertOfficialName(firstLastName) {
  if (!firstLastName) return null;
  
  console.log(`🔍 Converting official name: "${firstLastName}"`);
  
  try {
    const normalizeForCompare = (value) => {
      if (!value) return '';
      return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ') // keep word boundaries
        .trim()
        .replace(/\s+/g, ''); // then remove spaces
    };

    const stripTrailingSuffixTokens = (value) => {
      if (!value) return value;
      const suffixToken = /^(jr|sr|ii|iii|iv|v|vi|vii|viii|ix|x|2nd|3rd|4th)$/i;
      const tokens = String(value).trim().split(/\s+/);
      while (tokens.length > 1 && suffixToken.test(tokens[tokens.length - 1])) {
        tokens.pop();
      }
      return tokens.join(' ');
    };

    const stripSuffixFromFullName = (full) => {
      if (!full) return full;
      // Remove trailing suffix tokens from the END of the full name ("Steve Walsh III" -> "Steve Walsh")
      const tokens = String(full).trim().split(/\s+/);
      const suffixToken = /^(jr|sr|ii|iii|iv|v|vi|vii|viii|ix|x|2nd|3rd|4th)$/i;
      while (tokens.length > 2 && suffixToken.test(tokens[tokens.length - 1])) {
        tokens.pop();
      }
      return tokens.join(' ');
    };

    const normalizeNameToken = (value) => {
      if (!value) return '';
      return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .trim();
    };

    // Lightweight nickname map for common first-name variants in officiating feeds.
    // Keep this small and safe; we only use it as an extra candidate, not as a blind replacement.
    const FIRST_NAME_NICKNAMES = {
      steve: ['steven', 'stephen'],
      mike: ['michael'],
      bob: ['robert'],
      rob: ['robert'],
      bill: ['william'],
      jim: ['james'],
      tom: ['thomas'],
      tommy: ['thomas'],
      pat: ['patrick'],
      rick: ['richard'],
      rich: ['richard'],
      dave: ['david'],
      alex: ['alexander'],
      ben: ['benjamin'],
      chris: ['christopher'],
      matt: ['matthew'],
    };

    const getFirstNameCandidates = (first) => {
      const base = normalizeNameToken(first);
      const candidates = new Set([base]);
      const mapped = FIRST_NAME_NICKNAMES[base];
      if (mapped) mapped.forEach(n => candidates.add(normalizeNameToken(n)));
      return Array.from(candidates).filter(Boolean);
    };

    // Strategy 1: Try exact match with firstlast column
    const { data: exactMatch } = await supabase
      .from('roster')
      .select('lastfirstfullname')
      .eq('firstlast', firstLastName)
      .single();
      
    if (exactMatch) {
      console.log(`✅ Exact match found: "${firstLastName}" -> "${exactMatch.lastfirstfullname}"`);
      return exactMatch.lastfirstfullname;
    }
    
    // Strategy 2: Normalized matching
    const normalizedInput = normalizeForCompare(firstLastName);
    const normalizedInputCore = normalizeForCompare(stripSuffixFromFullName(firstLastName));
    console.log(`🔍 Trying normalized match: "${normalizedInput}"`);
    
    const { data: allRoster } = await supabase
      .from('roster')
      .select('firstname, lastname, lastfirstfullname');
    
    if (allRoster) {
      const [inputFirstRaw, ...inputLastParts] = stripSuffixFromFullName(firstLastName).split(' ');
      const inputLastRaw = inputLastParts.join(' ').trim();
      const inputFirstCandidates = getFirstNameCandidates(inputFirstRaw);
      const inputLastCoreNorm = normalizeNameToken(stripTrailingSuffixTokens(inputLastRaw));

      for (const person of allRoster) {
        const rosterFull = `${person.firstname || ''} ${person.lastname || ''}`.trim();
        const normalizedRoster = normalizeForCompare(rosterFull);
        const normalizedRosterCore = normalizeForCompare(
          `${person.firstname || ''} ${stripTrailingSuffixTokens(person.lastname || '')}`.trim()
        );

        if (
          normalizedRoster === normalizedInput ||
          normalizedRosterCore === normalizedInput ||
          normalizedRoster === normalizedInputCore ||
          normalizedRosterCore === normalizedInputCore
        ) {
          const usedCore = normalizedRoster !== normalizedInput;
          console.log(
            `✅ ${usedCore ? 'Fuzzy' : 'Normalized'} match found: "${firstLastName}" -> "${person.lastfirstfullname}"` +
              (usedCore ? ` (matched against "${rosterFull}")` : '')
          );
          return person.lastfirstfullname;
        }

        // Extra fuzzy: match last name core + first name prefix/nickname variants
        const rosterFirstNorm = normalizeNameToken(person.firstname);
        const rosterLastCoreNorm = normalizeNameToken(stripTrailingSuffixTokens(person.lastname || ''));
        if (rosterLastCoreNorm && rosterLastCoreNorm === inputLastCoreNorm) {
          const firstMatches =
            inputFirstCandidates.includes(rosterFirstNorm) ||
            inputFirstCandidates.some(c => rosterFirstNorm.startsWith(c) || c.startsWith(rosterFirstNorm));

          if (firstMatches) {
            console.log(
              `✅ Fuzzy match found (first-name variant): "${firstLastName}" -> "${person.lastfirstfullname}" (roster="${rosterFull}")`
            );
            return person.lastfirstfullname;
          }
        }
      }
    }
    
    // Strategy 3: Simple split
    const [firstName, ...lastNameParts] = firstLastName.split(' ');
    const lastName = lastNameParts.join(' ');
    console.log(`🔍 Trying split match: firstName="${firstName}", lastName="${lastName}"`);
    
    const { data: splitMatch } = await supabase
      .from('roster')
      .select('lastfirstfullname')
      .ilike('firstname', firstName)
      .ilike('lastname', lastName)
      .single();
      
    if (splitMatch) {
      console.log(`✅ Split match found: "${firstLastName}" -> "${splitMatch.lastfirstfullname}"`);
      return splitMatch.lastfirstfullname;
    }

    // Strategy 3b: First-name prefix match (e.g., "Steve" -> "Steven"), last-name core match (e.g., "Walsh" -> "Walsh II")
    const firstNameNorm = normalizeNameToken(firstName);
    const firstNameCandidates = getFirstNameCandidates(firstNameNorm);
    for (const candidate of firstNameCandidates) {
      const { data: prefixMatch } = await supabase
        .from('roster')
        .select('lastfirstfullname')
        .ilike('firstname', `${candidate}%`)
        .ilike('lastname', `%${stripTrailingSuffixTokens(lastName)}%`)
        .single();

      if (prefixMatch) {
        console.log(`✅ Fuzzy match found (firstname prefix): "${firstLastName}" -> "${prefixMatch.lastfirstfullname}" (candidate="${candidate}")`);
        return prefixMatch.lastfirstfullname;
      }
    }
    
    // Strategy 4: Try partial last name match (for hyphenated names)
    console.log(`🔍 Trying partial last name match for: "${lastName}"`);
    const lastNameCore = stripTrailingSuffixTokens(lastName);
    const { data: partialMatch } = await supabase
      .from('roster')
      .select('lastfirstfullname')
      .ilike('firstname', firstName)
      .ilike('lastname', `%${lastNameCore}%`)
      .single();
      
    if (partialMatch) {
      console.log(`✅ Partial match found: "${firstLastName}" -> "${partialMatch.lastfirstfullname}" (lastNameCore="${lastNameCore}")`);
      return partialMatch.lastfirstfullname;
    }
    
    console.warn(`❌ Official not found in roster: "${firstLastName}"`);
    return null;
    
  } catch (error) {
    console.error(`Error converting official name "${firstLastName}":`, error);
    return null;
  }
}

async function upsertGamesToDatabase(games) {
  let newCount = 0;
  let updateCount = 0;
  let skippedCount = 0;
  // IMPORTANT:
  // Push notifications should be sent ONLY by the realtime listener in ScheduleProvider.
  // If we also send pushes during this iCal sync/upsert, users will get duplicate notifications
  // (one from upsert + one from realtime change).
  const ENABLE_PUSH_NOTIFICATIONS_DURING_ICAL_SYNC = false;
  
  for (const game of games) {
    try {
      // Get existing game data for comparison
      const { data: existing, error: fetchError } = await supabase
        .from('schedule')
        .select('*')
        .eq('gameid', game.gameid)
        .eq('season', game.season)
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid errors
      
      if (fetchError) {
        console.error(`Error fetching existing game ${game.gameid}:`, fetchError);
        continue;
      }
      
      if (existing) {
        // Compare fields to see if anything actually changed
        const hasChanges = compareGameFields(game, existing);
        
        if (hasChanges) {
          // Only update if there are actual changes
          const { error: updateError } = await supabase
            .from('schedule')
            .update(game)
            .eq('gameid', game.gameid)
            .eq('season', game.season);
            
          if (updateError) {
            console.error(`Update error for game ${game.gameid}:`, updateError);
            continue;
          }
          
          updateCount++;
          const changedFields = getChangedFields(game, existing);
          console.log(`🔄 Updated game ${game.gameid}: ${changedFields.join(', ')}`);
          
          // Send notifications to affected users (disabled; handled by realtime listener)
          if (ENABLE_PUSH_NOTIFICATIONS_DURING_ICAL_SYNC) {
            await sendNotificationsForGameChange(game, existing, changedFields);
          }
        } else {
          skippedCount++;
          console.log(`⏭️ Skipped game ${game.gameid}: no changes detected`);
        }
      } else {
        // New game - insert it
        const { error: insertError } = await supabase
          .from('schedule')
          .insert(game);
          
        if (insertError) {
          // Check if it's a duplicate key error - this shouldn't happen with proper logic
          if (insertError.code === '23505') {
            console.warn(`⚠️ Duplicate key error for game ${game.gameid} - this suggests a race condition or logic error`);
            skippedCount++;
          } else {
            console.error(`Insert error for game ${game.gameid}:`, insertError);
          }
          continue;
        }
        
        newCount++;
        console.log(`➕ Added new game ${game.gameid}`);
      }
      
    } catch (error) {
      console.error(`Unexpected error processing game ${game.gameid}:`, error);
    }
  }
  
  console.log(`📊 Sync Summary: ${newCount} new, ${updateCount} updated, ${skippedCount} skipped`);
  return { newCount, updateCount, skippedCount };
}

// Field comparison utilities
function compareGameFields(newGame, existingGame) {
  // Define the fields we want to compare (excluding auto-generated fields)
  const fieldsToCompare = [
    'awayteam',
    'hometeam', 
    'gamedate',
    'gametime',
    'linesperson1',
    'linesperson2',
    'referee1',
    'referee2',
    'gamecode'
  ];
  
  for (const field of fieldsToCompare) {
    const newValue = normalizeFieldValue(newGame[field]);
    const existingValue = normalizeFieldValue(existingGame[field]);
    
    if (newValue !== existingValue) {
      return true; // Found a difference
    }
  }
  
  return false; // No differences found
}

function getChangedFields(newGame, existingGame) {
  const fieldsToCompare = [
    'awayteam',
    'hometeam',
    'gamedate', 
    'gametime',
    'linesperson1',
    'linesperson2',
    'referee1',
    'referee2',
    'gamecode'
  ];
  
  const changedFields = [];
  
  for (const field of fieldsToCompare) {
    const newValue = normalizeFieldValue(newGame[field]);
    const existingValue = normalizeFieldValue(existingGame[field]);
    
    if (newValue !== existingValue) {
      changedFields.push(`${field}: "${existingValue}" → "${newValue}"`);
    }
  }
  
  return changedFields;
}

function normalizeFieldValue(value) {
  // Normalize values for comparison
  if (value === null || value === undefined) {
    return null;
  }
  
  // Convert to string and trim whitespace
  let normalized = String(value).trim();
  
  // Normalize timezone formats for gametime field
  // Convert -08:00 to -08 and +05:00 to +05 for consistent comparison
  normalized = normalized.replace(/([+-]\d{2}):(\d{2})$/, '$1');
  
  return normalized;
}

// Notification helper for game changes
async function sendNotificationsForGameChange(newGame, existingGame, changedFields) {
  try {
    // Send notifications for official assignment changes AND game time changes
    const notificationFields = ['referee1', 'referee2', 'linesperson1', 'linesperson2', 'gametime'];
    const notificationChanges = changedFields.filter(field => 
      notificationFields.some(notificationField => field.startsWith(notificationField))
    );
    
    if (notificationChanges.length === 0) {
      console.log(`📱 No notification-worthy changes for game ${newGame.gameid}, skipping notifications`);
      return;
    }
    
    // Determine who was replaced (if any) - only for official changes
    const officialFields = ['referee1', 'referee2', 'linesperson1', 'linesperson2'];
    const officialChanges = notificationChanges.filter(field => 
      officialFields.some(official => field.startsWith(official))
    );
    
    let replacedPerson = null;
    for (const change of officialChanges) {
      const field = change.split(':')[0];
      const oldValue = change.split('"')[1]; // Extract old value
      if (oldValue && oldValue !== 'null') {
        replacedPerson = oldValue;
        break; // Take the first replaced person
      }
    }
    
    console.log(`📱 Sending notifications for game ${newGame.gameid} changes: ${notificationChanges.join(', ')}`);
    
    // Send notification
    await sendGameChangeNotification(
      newGame.gameid,
      newGame.season,
      {
        awayteam: newGame.awayteam,
        hometeam: newGame.hometeam,
        gamedate: newGame.gamedate,
        gametime: newGame.gametime
      },
      notificationChanges,
      replacedPerson
    );
    
  } catch (error) {
    console.error(`Error sending notifications for game ${newGame.gameid}:`, error);
  }
}

// Background sync utilities
export const SYNC_STORAGE_KEYS = {
  LAST_SYNC: 'hockey_sync_last_sync',
  SYNC_COUNT: 'hockey_sync_count',
  LAST_ERROR: 'hockey_sync_last_error'
};

export async function getLastSyncTime() {
  try {
    await ensureHockeySyncCacheVersion();
    const lastSync = await AsyncStorage.getItem(SYNC_STORAGE_KEYS.LAST_SYNC);
    return lastSync ? new Date(lastSync) : null;
  } catch (error) {
    console.error('Error getting last sync time:', error);
    return null;
  }
}

export async function setLastSyncTime() {
  try {
    await ensureHockeySyncCacheVersion();
    await AsyncStorage.setItem(SYNC_STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
  } catch (error) {
    console.error('Error setting last sync time:', error);
  }
}

export async function shouldAutoSync() {
  try {
    await ensureHockeySyncCacheVersion();
    const lastSync = await getLastSyncTime();
    if (!lastSync) return true;
    
    const now = new Date();
    const hoursSinceLastSync = (now - lastSync) / (1000 * 60 * 60);
    
    // Auto sync if more than 24 hours have passed
    return hoursSinceLastSync >= 24;
  } catch (error) {
    console.error('Error checking auto sync:', error);
    return false;
  }
}

export async function performAutoSync() {
  try {
    await ensureHockeySyncCacheVersion();
    const shouldSync = await shouldAutoSync();
    if (!shouldSync) {
      console.log('Auto sync skipped - last sync was recent');
      return { success: true, skipped: true };
    }
    
    console.log('Performing automatic hockey schedule sync...');
    const result = await fetchAndParseHockeySchedule(false);
    
    if (result.success) {
      await setLastSyncTime();
      console.log(`Auto sync completed: ${result.newGames} new, ${result.updatedGames} updated`);
    } else {
      console.error('Auto sync failed:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Auto sync error:', error);
    return { success: false, error: error.message };
  }
}
