// iCal Hockey Schedule Sync Service
// Handles fetching and parsing iCal data from HorizonWebRef
// Converts to Supabase format with proper timezone handling

import { supabase } from './supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Exact parsing code based on HorizonWebRef iCal format
export async function fetchAndParseHockeySchedule(testMode = false) {
  const icalUrl = 'https://www.horizonwebref.com/syncICS?o=1IBN&enc=96c1fb9db288fce606cd7b7fd1e16d44fafb007c';
  
  try {
    const response = await fetch(icalUrl);
    const icalText = await response.text();
    
    const games = parseIcalToGames(icalText);
    
    if (testMode) {
      console.log('Parsed Games:', games);
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

function parseIcalToGames(icalText) {
  const games = [];
  const events = icalText.split('BEGIN:VEVENT');
  
  // Skip first element (before first event)
  for (let i = 1; i < events.length; i++) {
    const eventText = events[i];
    const game = parseEvent(eventText);
    if (game) {
      games.push(game);
    }
  }
  
  return games;
}

function parseEvent(eventText) {
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
    
    // Convert times
    const startTime = convertIcalTimeToLocal(dtstart);
    const endTime = convertIcalTimeToLocal(dtend);
    
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

function convertIcalTimeToLocal(icalTime) {
  // Input format: "20251004T200000Z"
  // Convert to: "2025-10-04T13:00:00-07:00" (Pacific time)
  
  if (!icalTime) return null;
  
  // Parse the iCal time format
  const year = icalTime.substring(0, 4);
  const month = icalTime.substring(4, 6);
  const day = icalTime.substring(6, 8);
  const hour = icalTime.substring(9, 11);
  const minute = icalTime.substring(11, 13);
  const second = icalTime.substring(13, 15);
  
  // Create UTC date
  const utcDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`);
  
  // Convert to Pacific time
  const pacificTime = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(utcDate);
  
  // Build ISO string with Pacific timezone
  const parts = {};
  pacificTime.forEach(part => {
    parts[part.type] = part.value;
  });
  
  // Determine if DST (rough approximation)
  const isDST = utcDate.getMonth() >= 2 && utcDate.getMonth() <= 10;
  const offset = isDST ? '-07:00' : '-08:00';
  
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
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
      // Check if game exists
      const { data: existing } = await supabase
        .from('schedule')
        .select('id')
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
