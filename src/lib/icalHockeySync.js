// iCal Hockey Schedule Sync Service
// Handles fetching and parsing iCal data from HorizonWebRef
// Converts to Supabase format with proper timezone handling

import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendGameChangeNotification } from './notificationService';
import { supabase } from './supabase';

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
    const response = await fetch(icalUrl, {
      headers: {
        'User-Agent': 'DietrichApp/v1.0.1'
      }
    });
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

async function convertIcalTimeToTeamTimezone(icalTime, homeTeam) {
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
    const normalizedInput = firstLastName.replace(/\s+/g, '').toLowerCase();
    console.log(`🔍 Trying normalized match: "${normalizedInput}"`);
    
    const { data: allRoster } = await supabase
      .from('roster')
      .select('firstname, lastname, lastfirstfullname');
    
    if (allRoster) {
      for (const person of allRoster) {
        const normalizedRoster = `${person.firstname}${person.lastname}`.replace(/\s+/g, '').toLowerCase();
        if (normalizedRoster === normalizedInput) {
          console.log(`✅ Normalized match found: "${firstLastName}" -> "${person.lastfirstfullname}"`);
          return person.lastfirstfullname;
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
    
    // Strategy 4: Try partial last name match (for hyphenated names)
    console.log(`🔍 Trying partial last name match for: "${lastName}"`);
    const { data: partialMatch } = await supabase
      .from('roster')
      .select('lastfirstfullname')
      .ilike('firstname', firstName)
      .ilike('lastname', `%${lastName}%`)
      .single();
      
    if (partialMatch) {
      console.log(`✅ Partial match found: "${firstLastName}" -> "${partialMatch.lastfirstfullname}"`);
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