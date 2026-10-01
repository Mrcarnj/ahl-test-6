// iCal Hockey Schedule Sync Service
// Handles fetching and parsing iCal data from HorizonWebRef
// Converts to Supabase format with proper timezone handling

import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendGameChangeNotification } from './notificationService';
import { supabase } from './supabase';
import { buildIcalRequest } from './icalFeed';
import { seasonLabelForGameDate } from './season';
import { fetchMyIcalUrl } from './rosterColumns';

// Exact parsing code based on HorizonWebRef iCal format
export async function fetchAndParseHockeySchedule(testMode = false, userId = null) {
  try {
    // Get the user's iCal URL from the roster table
    if (!userId || userId === undefined) {
      // If no userId provided, try to get current user from session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('No user session found');
      }
      userId = user.id;
    }

    // userId only matters for the session check above: the feed link is
    // read for the signed-in official, never through the roster table.
    console.log(`🔍 Fetching iCal URL for user: ${userId}`);
    const icalUrl = await fetchMyIcalUrl();

    if (!icalUrl) {
      throw new Error('User has not set up their iCal URL yet');
    }

    console.log(`🌐 Using user's iCal URL: ${icalUrl}`);
    
    console.log('🌐 Fetching iCal data from HorizonWebRef...');
    // On web this routes through the Cloudflare Worker proxy; native fetches direct.
    const icalRequest = buildIcalRequest(icalUrl);
    const response = await fetch(icalRequest.url, { headers: icalRequest.headers });
    if (!response.ok) {
      throw new Error(`iCal fetch failed with status ${response.status}`);
    }
    const icalText = await response.text();
    
    console.log(`📄 iCal data received: ${icalText.length} characters`);
    console.log('🔄 Parsing iCal events and converting timezones...');
    
    // Team timezones and official names come from two small tables. Load
    // them once here instead of querying per event: the per-event version
    // made hundreds of sequential round-trips per sync, which kept the JS
    // thread busy enough to make the app stutter while it ran. If either
    // load fails the sync stops here, before anything is written.
    const lookups = await loadSyncLookups();

    const games = await parseIcalToGames(icalText, lookups);
    
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
        // Check if startTime is valid before parsing
        if (!game.startTime) {
          console.error('🚨 ========== MISSING STARTTIME DIAGNOSTIC DATA ==========');
          console.error(`Game ID: ${game.gameId || 'unknown'}`);
          console.error(`Organizer: ${game.organizer || 'unknown'}`);
          console.error(`Home Team: ${game.homeTeam || 'null'}`);
          console.error(`Away Team: ${game.awayTeam || 'null'}`);
          console.error(`Raw DTSTART: ${game._rawDtstart || 'null'}`);
          console.error(`Raw DTEND: ${game._rawDtend || 'null'}`);
          console.error(`Raw Description: ${game._rawDescription || 'null'}`);
          console.error(`Game Code: ${game.gameCode || 'null'}`);
          console.error(`Venue: ${game.venue || 'null'}`);
          console.error(`UID: ${game.uid || 'null'}`);
          console.error(`End Time: ${game.endTime || 'null'}`);
          console.error(`Referees: ${JSON.stringify(game.referees || [])}`);
          console.error(`Linespeople: ${JSON.stringify(game.linespeople || [])}`);
          console.error('🚨 ========== END DIAGNOSTIC DATA ==========');
          // Still skip to prevent crash, but now we have all the data
          continue;
        }
        
        // Parse the game date from the start time
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
    
    // Process only the filtered games for database
    const processedGames = [];
    for (const game of filteredGames) {
      const dbGame = await convertToDbFormat(game, lookups);
      if (dbGame) {
        processedGames.push(dbGame);
      }
    }
    
    console.log(`📊 ${processedGames.length} games ready for the database`);

    // Upload to database
    const results = await upsertGamesToDatabase(processedGames);
    
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
    return { success: false, error: error.message };
  }
}

async function loadSyncLookups() {
  const [teamsRes, rosterRes] = await Promise.all([
    supabase.from('teams').select('timezone, city'),
    supabase.from('roster').select('firstname, lastname, lastfirstfullname, firstlast'),
  ]);
  if (teamsRes.error) throw new Error(`Could not load teams: ${teamsRes.error.message}`);
  if (rosterRes.error) throw new Error(`Could not load roster: ${rosterRes.error.message}`);
  return {
    teams: teamsRes.data || [],
    roster: rosterRes.data || [],
    officialNames: new Map(), // "First Last" -> resolved lastfirstfullname (or null)
  };
}

// Mirrors `.single()`: a lookup only counts when exactly one row matches.
function onlyMatch(rows) {
  return rows.length === 1 ? rows[0] : null;
}

async function parseIcalToGames(icalText, lookups) {
  const games = [];
  const events = icalText.split('BEGIN:VEVENT');
  
  // Skip first element (before first event)
  for (let i = 1; i < events.length; i++) {
    const eventText = events[i];
    const game = await parseEvent(eventText, lookups);
    if (game) {
      games.push(game);
    }
  }
  
  return games;
}

async function parseEvent(eventText, lookups) {
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
    
    // Convert times to home team's timezone
    const startTime = await convertIcalTimeToTeamTimezone(dtstart, gameDetails.homeTeam, lookups);
    const endTime = await convertIcalTimeToTeamTimezone(dtend, gameDetails.homeTeam, lookups);
    
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
      organizer: organizer || 'Unknown',
      // Store raw iCal data for debugging
      _rawDtstart: dtstart,
      _rawDtend: dtend,
      _rawDescription: description
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
    // Look for field name followed by colon, then capture everything until next field or end.
    // The field name may carry iCal parameters before the colon
    // (e.g. `DTSTART;TZID=America/New_York:20261003T180000`), so allow and skip them.
    const nextFieldPattern = '\\r?\\n[A-Z][A-Z0-9-]*[:;]';
    const params = '(?:;[^:\\r\\n]*)?';
    regex = new RegExp(fieldName + params + ':(.+?)(?=' + nextFieldPattern + '|\\r?\\nEND:VEVENT|$)', 'is');
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
  
  // Extract teams from lines like "San Jose @ Bakersfield" or "Wilkes-Barre @ Lehigh Valley"
  // Look for the pattern after the synchronizer text
  // Pattern: "Schedule Synchronizer" followed by teams "Away @ Home" followed by "Game Code"
  // Team names can include hyphens, spaces, and apostrophes
  // Make the regex more flexible - allow for "Game Code:" or just "Game Code"
  const teamMatch = cleanDesc.match(/Schedule Synchronizer\s+([A-Za-z\s'-]+?)\s@\s([A-Za-z\s'-]+?)\s+Game Code:?/i);
  let awayTeam = null, homeTeam = null;
  
  if (teamMatch) {
    awayTeam = teamMatch[1].trim();
    homeTeam = teamMatch[2].trim();
    console.log(`✅ Extracted teams: "${awayTeam}" @ "${homeTeam}"`);
  } else {
    // Debug: log what we're trying to match
    console.error('❌ Failed to extract teams from description. Pattern not found.');
    console.error('Raw description:', description);
    console.error('Cleaned description:', cleanDesc);
    console.error('Looking for pattern: /Schedule Synchronizer\\s+([A-Za-z\\s\'-]+?)\\s@\\s([A-Za-z\\s\'-]+?)\\s+Game Code:?/i');
    
    // Try alternative patterns
    const altMatch1 = cleanDesc.match(/([A-Za-z\s'-]+?)\s@\s([A-Za-z\s'-]+?)\s+Game Code:?/i);
    if (altMatch1) {
      console.error('Alternative match found (without "Schedule Synchronizer"):', altMatch1);
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

async function convertIcalTimeToTeamTimezone(icalTime, homeTeam, lookups) {
  // Input format: "20251004T200000Z" (UTC)
  // Convert to team's local timezone dynamically
  
  if (!icalTime || !homeTeam) {
    console.error('🚨 convertIcalTimeToTeamTimezone returning null:');
    console.error(`  icalTime: ${icalTime === null ? 'null' : icalTime === undefined ? 'undefined' : `"${icalTime}"`}`);
    console.error(`  homeTeam: ${homeTeam === null ? 'null' : homeTeam === undefined ? 'undefined' : `"${homeTeam}"`}`);
    return null;
  }
  
  try {
    console.log(`🔍 Looking up timezone for team: "${homeTeam}"`);
    
    // Look up the home team's timezone from the teams table
    // Try multiple lookup strategies since iCal might use different naming
    let teamData = null;
    
    // Strategy 1: Try exact match with city
    const cityMatch = onlyMatch(lookups.teams.filter((t) => t.city === homeTeam));
    
    if (cityMatch) {
      teamData = cityMatch;
      console.log(`✅ Found exact city match: "${cityMatch.city}"`);
    } else {
      // Strategy 2: Try partial match (e.g., "Bakersfield" might match "Bakersfield Condors")
      const needle = homeTeam.toLowerCase();
      const partialMatch = onlyMatch(
        lookups.teams.filter((t) => (t.city || '').toLowerCase().includes(needle))
      );
      
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
    
    // HorizonWebRef now sends local wall-clock times carrying a TZID parameter
    // (`DTSTART;TZID=America/New_York:20261003T180000`) in place of the old
    // fake-UTC `20261003T220000Z`. That TZID is the league's own zone, not the
    // arena's -- the description says `Time mode: org`, and Central/Mountain
    // venues get tagged `America/New_York` too -- so it is ignored. The digits
    // are already the home arena's wall clock, which is exactly what `gametime`
    // stores, so no shifting is done: just stamp the home team's offset on.
    const localMatch = icalTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
    if (localMatch) {
      const [, lYear, lMonth, lDay, lHour, lMinute, lSecond] = localMatch;
      const localOffset = getTimezoneOffset(
        new Date(`${lYear}-${lMonth}-${lDay}T${lHour}:${lMinute}:${lSecond}`),
        teamTimezone
      );
      const localTime = `${lYear}-${lMonth}-${lDay}T${lHour}:${lMinute}:${lSecond}${localOffset}`;
      console.log(`   Wall-clock iCal time: ${icalTime} (${teamTimezone}) -> ${localTime}`);
      return localTime;
    }
    
    // Legacy fake-UTC path, kept in case the feed reverts.
    // Parse the iCal time format - handle both UTC (Z) and timezone offset formats
    const timeMatch = icalTime.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2})$/);
    if (!timeMatch) {
      console.warn(`Invalid iCal time format: ${icalTime}`);
      return icalTime;
    }
    
    const [, year, month, day, hour, minute, second, offsetStr] = timeMatch;
    
    console.log(`🕐 Timezone Conversion for ${homeTeam}:`);
    console.log(`   iCal Time: ${icalTime} (${offsetStr === 'Z' ? 'UTC' : `UTC${offsetStr}`})`);
    console.log(`   Team Timezone: ${teamTimezone}`);
    
    // CORRECTION: iCal times appear to be ahead of actual game times
    // The offset varies based on daylight saving time:
    // - During DST (roughly March-November): 4 hours ahead
    // - During standard time (roughly November-March): 5 hours ahead
    // For example: 20:00:00Z should be 16:00:00Z (4pm UTC, not 8pm UTC) during DST
    //             20:00:00Z should be 15:00:00Z (3pm UTC, not 8pm UTC) during standard time
    
    // First, calculate what the local date would be using standard time (5 hour correction)
    // This helps us determine the actual game date, which we then use to check DST
    const yearNum = parseInt(year, 10);
    const monthNum = parseInt(month, 10);
    const dayNum = parseInt(day, 10);
    const hourNum = parseInt(hour, 10);
    
    // Calculate local date/time assuming standard time first
    let tempHour = hourNum - 5; // Assume standard time (5 hour correction)
    let tempDay = dayNum;
    let tempMonth = monthNum;
    let tempYear = yearNum;
    
    // Handle day rollover
    if (tempHour < 0) {
      tempHour += 24;
      tempDay -= 1;
      if (tempDay < 1) {
        tempMonth -= 1;
        if (tempMonth < 1) {
          tempMonth = 12;
          tempYear -= 1;
        }
        const lastDayOfMonth = new Date(tempYear, tempMonth, 0).getDate();
        tempDay = lastDayOfMonth;
      }
    }
    
    // Now check DST based on the LOCAL game date (not the iCal UTC date)
    // DST starts at 2:00 AM on the second Sunday of March
    const isDST = isDaylightSavingTime(tempYear, tempMonth, tempDay, tempHour);
    const timeCorrection = isDST ? 4 : 5;
    
    // Enhanced logging for debugging DST issues
    const secondSundayMar = getSecondSundayOfMonth(tempYear, 3);
    const firstSundayMar = getFirstSundayOfMonth(tempYear, 3);
    console.log(`   iCal UTC Date: ${year}-${month}-${day} ${hour}:${minute}`);
    console.log(`   Local Game Date (after std time calc): ${tempYear}-${String(tempMonth).padStart(2, '0')}-${String(tempDay).padStart(2, '0')} at ${String(tempHour).padStart(2, '0')}:${minute}`);
    console.log(`   DST Calculation based on LOCAL date:`);
    console.log(`     First Sunday in March ${tempYear}: ${firstSundayMar}`);
    console.log(`     Second Sunday in March ${tempYear}: ${secondSundayMar}`);
    console.log(`     Local day of month: ${tempDay}`);
    console.log(`     Local hour: ${tempHour}`);
    if (tempMonth === 3 && tempDay === secondSundayMar) {
      console.log(`     On second Sunday - checking if hour >= 2: ${tempHour >= 2 ? 'Yes (DST)' : 'No (Standard time)'}`);
    }
    console.log(`     DST Status: ${isDST ? 'DST active (4hr correction)' : 'Standard time (5hr correction)'}`);
    console.log(`     Time correction applied: ${timeCorrection} hours`);
    
    // Now apply the correct time correction
    let correctedHour = hourNum - timeCorrection;
    let correctedDay = dayNum;
    let correctedMonth = monthNum;
    let correctedYear = yearNum;
    
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
    
    console.log(`   Time Correction: ${year}-${month}-${day} ${hour}:${minute} -> ${correctedTime.year}-${correctedTime.month}-${correctedTime.day} ${correctedTime.hour}:${minute} (subtracted ${timeCorrection} hours)`);
    
    // Get the timezone offset for the team's timezone
    const date = new Date(`${correctedTime.year}-${correctedTime.month}-${correctedTime.day}T${correctedTime.hour}:${minute}:${second}`);
    const offset = getTimezoneOffset(date, teamTimezone);
    
    // For UTC times (Z), we need to convert to the team's timezone
    // For offset times, we keep the same offset but with corrected time
    const finalOffset = offsetStr === 'Z' ? offset : offsetStr;
    
    const convertedTime = `${correctedTime.year}-${correctedTime.month}-${correctedTime.day}T${correctedTime.hour}:${correctedTime.minute}:${correctedTime.second}${finalOffset}`;
    
    console.log(`   Final Time: ${convertedTime}`);
    
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

function isDaylightSavingTime(year, month, day, hour = null) {
  // DST in the US typically runs from the second Sunday in March to the first Sunday in November
  // This function now accepts year, month, day directly to avoid timezone issues with Date objects
  // month and day are expected to be 1-based (e.g., March = 3, not 2)
  // hour is optional and should be 0-23 (local time)
  
  // DST typically ends on the first Sunday in November at 2:00 AM (clocks fall back)
  // DST typically starts on the second Sunday in March at 2:00 AM (clocks spring forward)
  // Note: DST starts at 2:00 AM, so times before 2:00 AM on the second Sunday are still standard time
  
  // If we're in November or later in the year, check if we're before the first Sunday
  if (month >= 11) {
    const firstSundayNov = getFirstSundayOfMonth(year, 11);
    // If it's the first Sunday but before 2:00 AM, still in DST (clocks fall back at 2 AM)
    if (day === firstSundayNov && hour !== null && hour < 2) {
      return true; // Still DST before 2 AM
    }
    return day < firstSundayNov;
  }
  
  // If we're in March or later but before November, check if we're on or after the second Sunday in March
  if (month >= 3 && month < 11) {
    const secondSundayMar = getSecondSundayOfMonth(year, 3);
    // For March, check if the day is on or after the second Sunday
    if (month === 3) {
      // March: day must be > secondSundayMar, or == secondSundayMar and hour >= 2
      if (day > secondSundayMar) {
        return true; // After the second Sunday
      } else if (day === secondSundayMar) {
        // On the second Sunday: DST starts at 2:00 AM
        if (hour !== null) {
          return hour >= 2; // DST if 2 AM or later
        }
        // If hour not provided, assume DST for the whole day (conservative)
        return true;
      } else {
        return false; // Before the second Sunday
      }
    } else {
      // April through October: always in DST
      return true;
    }
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

async function convertToDbFormat(game, lookups) {
  // Validate that startTime exists before processing
  if (!game.startTime) {
    console.error('🚨 ========== MISSING STARTTIME IN convertToDbFormat ==========');
    console.error(`Game ID: ${game.gameId || 'unknown'}`);
    console.error(`Organizer: ${game.organizer || 'unknown'}`);
    console.error(`Home Team: ${game.homeTeam || 'null'}`);
    console.error(`Away Team: ${game.awayTeam || 'null'}`);
    console.error(`Raw DTSTART: ${game._rawDtstart || 'null'}`);
    console.error(`Raw DTEND: ${game._rawDtend || 'null'}`);
    console.error(`Raw Description: ${game._rawDescription || 'null'}`);
    console.error(`Game Code: ${game.gameCode || 'null'}`);
    console.error(`Venue: ${game.venue || 'null'}`);
    console.error(`UID: ${game.uid || 'null'}`);
    console.error(`End Time: ${game.endTime || 'null'}`);
    console.error(`Referees: ${JSON.stringify(game.referees || [])}`);
    console.error(`Linespeople: ${JSON.stringify(game.linespeople || [])}`);
    console.error('🚨 ========== END DIAGNOSTIC DATA ==========');
    return null;
  }
  
  // Convert official names from "First Last" to "Last, First" format
  const referee1 = convertOfficialName(game.referees[0], lookups);
  const referee2 = convertOfficialName(game.referees[1], lookups);
  const linesperson1 = convertOfficialName(game.linespeople[0], lookups);
  const linesperson2 = convertOfficialName(game.linespeople[1], lookups);
  
  const gameDate = game.startTime.split('T')[0];
  const gameTime = game.startTime.split('T')[1];
  
  return {
    gameid: game.gameId,
    season: seasonLabelForGameDate(gameDate),
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

function convertOfficialName(firstLastName, lookups) {
  if (!firstLastName) return null;
  if (lookups.officialNames.has(firstLastName)) {
    return lookups.officialNames.get(firstLastName);
  }
  const resolved = resolveOfficialName(firstLastName, lookups.roster);
  lookups.officialNames.set(firstLastName, resolved);
  return resolved;
}

// Same strategies, in the same order, as the per-name queries this replaced.
function resolveOfficialName(firstLastName, roster) {
  // Strategy 1: exact match on the firstlast column
  const exactMatch = onlyMatch(roster.filter((p) => p.firstlast === firstLastName));
  if (exactMatch) return exactMatch.lastfirstfullname;

  // Strategy 2: names compared with whitespace removed, case-insensitive
  const normalizedInput = firstLastName.replace(/\s+/g, '').toLowerCase();
  for (const person of roster) {
    const normalizedRoster = `${person.firstname}${person.lastname}`.replace(/\s+/g, '').toLowerCase();
    if (normalizedRoster === normalizedInput) return person.lastfirstfullname;
  }

  // Strategy 3: first word = first name, the rest = last name (case-insensitive)
  const [firstName, ...lastNameParts] = firstLastName.split(' ');
  const lastName = lastNameParts.join(' ');
  const first = firstName.toLowerCase();
  const last = lastName.toLowerCase();
  const sameFirst = roster.filter((p) => (p.firstname || '').toLowerCase() === first);

  const splitMatch = onlyMatch(sameFirst.filter((p) => (p.lastname || '').toLowerCase() === last));
  if (splitMatch) return splitMatch.lastfirstfullname;

  // Strategy 4: last name contained in the roster's (hyphenated names)
  const partialMatch = onlyMatch(sameFirst.filter((p) => (p.lastname || '').toLowerCase().includes(last)));
  if (partialMatch) return partialMatch.lastfirstfullname;

  console.warn(`❌ Official not found in roster: "${firstLastName}"`);
  return null;
}

async function upsertGamesToDatabase(games) {
  let newCount = 0;
  let updateCount = 0;
  let skippedCount = 0;
  
  // Read every existing row for these games up front (in chunks to keep the
  // URL short) rather than one query per game. A failed read stops the sync
  // before anything is written.
  const existingByKey = new Map();
  const gameIds = [...new Set(games.map((g) => g.gameid).filter(Boolean))];
  for (let i = 0; i < gameIds.length; i += 100) {
    const { data: rows, error: fetchError } = await supabase
      .from('schedule')
      .select('*')
      .in('gameid', gameIds.slice(i, i + 100));
    if (fetchError) {
      throw new Error(`Could not read existing games: ${fetchError.message}`);
    }
    for (const row of rows || []) {
      existingByKey.set(`${row.gameid}|${row.season}`, row);
    }
  }

  for (const game of games) {
    try {
      const existing = existingByKey.get(`${game.gameid}|${game.season}`) ?? null;
      
      if (existing) {
        alignOfficialsToExisting(game, existing);

        // Compare fields to see if anything actually changed
        const hasChanges = compareGameFields(game, existing);
        
        if (hasChanges) {
          // Only update if there are actual changes. The update is conditional
          // on the row still holding what we just read, so when several crew
          // members sync the same change at once only one write lands -- and
          // only that device goes on to send the notification.
          let updateQuery = supabase
            .from('schedule')
            .update(game)
            .eq('gameid', game.gameid)
            .eq('season', game.season);
          for (const field of GAME_COMPARE_FIELDS) {
            updateQuery = existing[field] === null || existing[field] === undefined
              ? updateQuery.is(field, null)
              : updateQuery.eq(field, existing[field]);
          }
          const { data: updatedRows, error: updateError } = await updateQuery.select('gameid');

          if (updateError) {
            console.error(`Update error for game ${game.gameid}:`, updateError);
            continue;
          }

          if (!updatedRows || updatedRows.length === 0) {
            skippedCount++;
            console.log(`⏭️ Skipped game ${game.gameid}: another device already applied this change`);
            continue;
          }

          updateCount++;
          const changedFields = getChangedFields(game, existing);
          console.log(`🔄 Updated game ${game.gameid}: ${changedFields.join(', ')}`);
          
          // Send notifications to affected users
          await sendNotificationsForGameChange(game, existing, changedFields);
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

// HorizonWebRef lists a game's referees (and linespeople) in a different order
// on every fetch, so slot 1/slot 2 from the feed is meaningless. Without this,
// a reshuffled crew compared slot-by-slot as two changed officials: every sync
// "updated" every game and fired change notifications.
//
// Keep each official already on the row in the slot they hold, and put anyone
// new into whichever slot was vacated. A real swap then reads as one slot
// changing, which is also what the notification's "replaced" logic expects.
function alignOfficialsToExisting(game, existing) {
  const roles = [
    ['referee1', 'referee2'],
    ['linesperson1', 'linesperson2'],
  ];

  for (const slots of roles) {
    const incoming = slots.map(slot => game[slot] ?? null);
    const aligned = slots.map(slot => {
      const current = existing[slot] ?? null;
      const idx = current === null ? -1 : incoming.indexOf(current);
      if (idx === -1) return undefined;
      incoming.splice(idx, 1);
      return current;
    });
    slots.forEach((slot, i) => {
      game[slot] = aligned[i] !== undefined ? aligned[i] : incoming.shift() ?? null;
    });
  }
}

// Field comparison utilities

// The synced columns (everything but auto-generated ones). Used both to decide
// whether a game changed and to guard the update against concurrent syncs.
const GAME_COMPARE_FIELDS = [
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

function compareGameFields(newGame, existingGame) {
  for (const field of GAME_COMPARE_FIELDS) {
    const newValue = normalizeFieldValue(newGame[field]);
    const existingValue = normalizeFieldValue(existingGame[field]);
    
    if (newValue !== existingValue) {
      return true; // Found a difference
    }
  }
  
  return false; // No differences found
}

function getChangedFields(newGame, existingGame) {
  const changedFields = [];
  
  for (const field of GAME_COMPARE_FIELDS) {
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