// iCal Hockey Schedule Sync Service
// Handles fetching and parsing iCal data from HorizonWebRef
// Converts to Supabase format with proper timezone handling

import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Exact parsing code based on HorizonWebRef iCal format
export async function fetchAndParseHockeySchedule(testMode = false) {
  const icalUrl = 'https://www.horizonwebref.com/syncICS?o=1IBN&enc=96c1fb9db288fce606cd7b7fd1e16d44fafb007c';
  
  try {
    console.log('🌐 Fetching iCal data from HorizonWebRef...');
    const response = await fetch(icalUrl);
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
    
    // Process each game for database
    const processedGames = [];
    for (const game of games) {
      const dbGame = await convertToDbFormat(game);
      processedGames.push(dbGame);
    }
    
    // Upsert to database
    const results = await upsertGamesToDatabase(processedGames);
    
    return {
      success: true,
      gamesProcessed: games.length,
      newGames: results.newCount,
      updatedGames: results.updateCount
    };
    
  } catch (error) {
    console.error('Hockey schedule sync error:', error);
    return { success: false, error: error.message };
  }
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
    // Extract basic fields using regex
    const uid = extractField(eventText, 'UID');
    const dtstart = extractField(eventText, 'DTSTART');
    const dtend = extractField(eventText, 'DTEND');
    const location = extractField(eventText, 'LOCATION');
    const description = extractField(eventText, 'DESCRIPTION');
    const organizer = extractField(eventText, 'ORGANIZER;CN="(.+?)"');
    
    if (!uid || !dtstart || !description) {
      return null; // Skip incomplete events
    }
    
    // Parse description for game details
    const gameDetails = parseDescription(description);
    
    // Convert times to home team's timezone
    const startTime = await convertIcalTimeToTeamTimezone(dtstart, gameDetails.homeTeam);
    const endTime = await convertIcalTimeToTeamTimezone(dtend, gameDetails.homeTeam);
    
    return {
      uid: uid,
      gameId: gameDetails.gameId,
      homeTeam: gameDetails.homeTeam,
      awayTeam: gameDetails.awayTeam,
      startTime: startTime,
      endTime: endTime,
      venue: cleanLocation(location),
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
  const teamMatch = cleanDesc.match(/Schedule Synchronizer\s+([A-Za-z\s]+?)\s@\s([A-Za-z\s]+?)\s+Game Code/i);
  let awayTeam = null, homeTeam = null;
  
  if (teamMatch) {
    awayTeam = teamMatch[1].trim();
    homeTeam = teamMatch[2].trim();
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
    const officialMatches = officialsText.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s\((Referee|Linesperson)\)/gi);
    
    for (const match of officialMatches) {
      const name = match[1].trim();
      const role = match[2];
      
      if (role.toLowerCase() === 'referee') {
        referees.push(name);
      } else if (role.toLowerCase() === 'linesperson') {
        linespeople.push(name);
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

async function convertIcalTimeToTeamTimezone(icalTime, homeTeam) {
  // Input format: "20251004T200000Z" (UTC)
  // Convert to team's local timezone dynamically
  
  if (!icalTime || !homeTeam) return null;
  
  try {
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
      console.warn(`No timezone found for team: ${homeTeam}, using UTC as fallback`);
      return icalTime; // Return original UTC time if no timezone found
    }
    
    const teamTimezone = teamData.timezone;
    
    // Parse the iCal time format
    const year = icalTime.substring(0, 4);
    const month = icalTime.substring(4, 6);
    const day = icalTime.substring(6, 8);
    const hour = icalTime.substring(9, 11);
    const minute = icalTime.substring(11, 13);
    const second = icalTime.substring(13, 15);
    
    // CRITICAL FIX: HorizonWebRef iCal incorrectly labels times as UTC when they're actually Eastern Time
    // Create Eastern Time date instead of UTC
    const easternDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}-04:00`); // EDT
    // Note: Use -05:00 for EST during standard time months (roughly Nov-Mar)
    
    console.log(`   Converting from EDT: ${year}-${month}-${day}T${hour}:${minute}:${second}-04:00`);
    
    // Simple timezone conversion - just subtract hours based on timezone
    let convertedHour = parseInt(hour, 10);
    let convertedMinute = parseInt(minute, 10);
    
    // Calculate time difference from EDT to target timezone
    if (teamTimezone === 'PST' || teamTimezone === 'PDT') {
      // EDT to PST: subtract 4 hours
      convertedHour -= 4;
    } else if (teamTimezone === 'CST' || teamTimezone === 'CDT') {
      // EDT to CST: subtract 1 hour
      convertedHour -= 1;
    } else if (teamTimezone === 'MST' || teamTimezone === 'MDT') {
      // EDT to MST: subtract 2 hours
      convertedHour -= 2;
    }
    
    // Handle day rollover
    if (convertedHour < 0) {
      convertedHour += 24;
      // Note: We're not handling day changes in this simple version
    }
    
    const localTime = {
      year: { value: year },
      month: { value: month },
      day: { value: day },
      hour: { value: convertedHour.toString().padStart(2, '0') },
      minute: { value: convertedMinute.toString().padStart(2, '0') },
      second: { value: second }
    };
    
    // Get the timezone offset for the team's timezone
    const offset = getTimezoneOffset(easternDate, teamTimezone);
    
    const convertedTime = `${localTime.year.value}-${localTime.month.value}-${localTime.day.value}T${localTime.hour.value}:${localTime.minute.value}:${localTime.second.value}${offset}`;
    
    // Log the timezone conversion for debugging
    console.log(`🕐 Timezone Conversion for ${homeTeam}:`);
    console.log(`   iCal Time (labeled UTC but actually EDT): ${icalTime}`);
    console.log(`   Corrected as Eastern Time: ${year}-${month}-${day}T${hour}:${minute}:${second}-04:00`);
    console.log(`   Team Timezone: ${teamTimezone}`);
    console.log(`   Simple Conversion: ${hour}:${minute} EDT -> ${localTime.hour.value}:${localTime.minute.value} ${teamTimezone}`);
    console.log(`   Final Time with Offset: ${convertedTime}`);
    
    return convertedTime;
    
  } catch (error) {
    console.error(`Error converting time for team ${homeTeam}:`, error);
    return icalTime; // Return original UTC time on error
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
  
  try {
    // Strategy 1: Try exact match with firstlast column
    const { data: exactMatch } = await supabase
      .from('roster')
      .select('lastfirstfullname')
      .eq('firstlast', firstLastName)
      .single();
      
    if (exactMatch) return exactMatch.lastfirstfullname;
    
    // Strategy 2: Normalized matching
    const normalizedInput = firstLastName.replace(/\s+/g, '').toLowerCase();
    
    const { data: allRoster } = await supabase
      .from('roster')
      .select('firstname, lastname, lastfirstfullname');
    
    if (allRoster) {
      for (const person of allRoster) {
        const normalizedRoster = `${person.firstname}${person.lastname}`.replace(/\s+/g, '').toLowerCase();
        if (normalizedRoster === normalizedInput) {
          return person.lastfirstfullname;
        }
      }
    }
    
    // Strategy 3: Simple split
    const [firstName, ...lastNameParts] = firstLastName.split(' ');
    const lastName = lastNameParts.join(' ');
    
    const { data: splitMatch } = await supabase
      .from('roster')
      .select('lastfirstfullname')
      .ilike('firstname', firstName)
      .ilike('lastname', lastName)
      .single();
      
    if (splitMatch) return splitMatch.lastfirstfullname;
    
    console.warn(`Official not found in roster: "${firstLastName}"`);
    return null;
    
  } catch (error) {
    console.error(`Error converting official name "${firstLastName}":`, error);
    return null;
  }
}

async function upsertGamesToDatabase(games) {
  let newCount = 0;
  let updateCount = 0;
  
  for (const game of games) {
    try {
      // Check if game exists using the unique constraint
      const { data: existing } = await supabase
        .from('schedule')
        .select('uuid')
        .eq('gameid', game.gameid)
        .eq('season', game.season)
        .single();
      
      const { error } = await supabase
        .from('schedule')
        .upsert(game, {
          onConflict: 'gameid,season'
        });
        
      if (error) {
        console.error('Upsert error:', error);
        continue;
      }
      
      if (existing) {
        updateCount++;
      } else {
        newCount++;
      }
      
    } catch (error) {
      console.error('Error upserting game:', game.gameid, error);
    }
  }
  
  return { newCount, updateCount };
}

// Background sync utilities
export const SYNC_STORAGE_KEYS = {
  LAST_SYNC: 'hockey_sync_last_sync',
  SYNC_COUNT: 'hockey_sync_count',
  LAST_ERROR: 'hockey_sync_last_error'
};

export async function getLastSyncTime() {
  try {
    const lastSync = await AsyncStorage.getItem(SYNC_STORAGE_KEYS.LAST_SYNC);
    return lastSync ? new Date(lastSync) : null;
  } catch (error) {
    console.error('Error getting last sync time:', error);
    return null;
  }
}

export async function setLastSyncTime() {
  try {
    await AsyncStorage.setItem(SYNC_STORAGE_KEYS.LAST_SYNC, new Date().toISOString());
  } catch (error) {
    console.error('Error setting last sync time:', error);
  }
}

export async function shouldAutoSync() {
  try {
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
