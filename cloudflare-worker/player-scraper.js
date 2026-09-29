import { createClient } from '@supabase/supabase-js';

// Create Supabase client - we'll initialize this in the function with env variables
let supabase;

// All season IDs
// NOTE: these are theahl.com TEAM ids, not season ids (the variable name is legacy).
// BRI/Bridgeport 317 removed (left the league after 2025-26); HAM/Hamilton 457 added.
const SEASON_IDS = [
    440, 402, 413, 444, 384, 330, 373, 445, 419, 328, 307, 437, 319, 389,
    415, 313, 321, 327, 403, 309, 323, 372, 404, 405, 411, 324, 380, 335, 412,
    390, 316, 457
];

// theahl.com season slug used in the scrape URLs.
// TODO(2026-27): verify this is the slug for the current regular season before
// re-enabling this worker — it writes to the live `teamRosters` table and
// deletes each team's rows first, so a stale slug wipes current stats.
const SEASON_SLUG = 86;

const BASE_URL = 'https://theahl.com/stats/player-stats';
const URL_SUFFIX = '?playertype=skater&position=skaters&rookie=no&sort=points&statstype=standard&page=1&league=4';

async function updateTeamRoster(team, players, env) {
    console.log(`\nProcessing team: ${team}`);
    
    try {
        // 1. First, delete all existing players for this team
        const { error: deleteError } = await supabase
            .from('teamRosters')
            .delete()
            .eq('team', team);

        if (deleteError) {
            console.error('Error clearing existing team roster:', deleteError);
            return false;
        }

        console.log(`Cleared existing roster for ${team}`);

        // 2. Get the current players for this team from scraped data
        const teamPlayers = players.filter(p => p.team === team);
        console.log(`Found ${teamPlayers.length} players for ${team} in scraped data`);

        // 3. Insert new roster
        const mappedData = teamPlayers.map(player => ({
            team: player.team,
            player_name: player.name,
            position: player.position,
            games_played: player.gamesPlayed,
            goals: player.goals,
            assists: player.assists,
            points: player.points,
            plusMinus: player.plusMinus,
            penalty_minutes: player.pim,
            power_play_goals: player.ppg,
            updated_at: new Date().toISOString()
        }));

        // Insert new data
        const { data: insertData, error: insertError } = await supabase
            .from('teamRosters')
            .insert(mappedData);

        if (insertError) {
            console.error('Error inserting new roster:', insertError);
            return false;
        }

        console.log(`Successfully updated ${team} roster:`);
        console.log(`- Added ${mappedData.length} players`);

        return true;
    } catch (error) {
        console.error(`Error processing team ${team}:`, error);
        return false;
    }
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Fetching URL: ${url} (attempt ${i + 1})`);
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Cache-Control': 'max-age=0',
                    'Referer': 'https://theahl.com/'
                }
            });

            console.log(`Response status: ${response.status}`);
            
            if (!response.ok) {
                console.log(`Received ${response.status} status, attempt ${i + 1} of ${retries}`);
                if (i === retries - 1) {
                    throw new Error(`Failed with status ${response.status} after all retries`);
                }
                await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
                continue;
            }

            // Clone the response so we can use it multiple times
            return response.clone();
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error.message);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        }
    }
}

async function scrapePlayerStats(seasonId, currentSeasonIndex, totalSeasons, env) {
    const url = `${BASE_URL}/${seasonId}/${SEASON_SLUG}${URL_SUFFIX}`;
    console.log(`\nProcessing season ${currentSeasonIndex + 1}/${totalSeasons}`);
    console.log(`Season ID: ${seasonId}`);
    console.log(`URL: ${url}`);

    try {
        // Fetch the HTML content
        const response = await fetchWithRetry(url);
        
        // For debugging, let's log the first part of the HTML
        const debugHtml = await response.clone().text();
        console.log(`HTML preview (first 200 chars): ${debugHtml.substring(0, 200)}`);
        
        const playerData = [];
        let currentRow = [];
        let inNameCell = false;
        let rowHasNameCell = false;
        let tableFound = false;
        
        // Create an HTML rewriter to parse the table
        const rewriter = new HTMLRewriter()
            .on('table', {
                element() {
                    tableFound = true;
                    console.log("Found a table element");
                }
            })
            .on('table tr', {
                element(element) {
                    // Reset for new row
                    currentRow = [];
                    rowHasNameCell = false;
                    console.log("Found a table row");
                },
                end() {
                    // Process completed row if it has a name cell
                    if (rowHasNameCell && currentRow.length >= 13) {
                        const playerName = currentRow[3].replace(/\s*\+-\s*$/, '');
                        
                        playerData.push({
                            name: playerName,
                            position: currentRow[4],
                            team: currentRow[5],
                            gamesPlayed: parseInt(currentRow[6]) || 0,
                            goals: parseInt(currentRow[7]) || 0,
                            assists: parseInt(currentRow[8]) || 0,
                            points: parseInt(currentRow[9]) || 0,
                            plusMinus: parseInt(currentRow[10]) || 0,
                            pim: parseInt(currentRow[11]) || 0,
                            ppg: parseInt(currentRow[12]) || 0
                        });
                        console.log(`Added player: ${playerName}`);
                    }
                }
            })
            .on('td', {
                element(element) {
                    // Add an empty cell to the row
                    currentRow.push('');
                }
            })
            .on('td.name a', {
                element(element) {
                    inNameCell = true;
                    rowHasNameCell = true;
                    console.log("Found a name cell");
                },
                text(text) {
                    if (inNameCell && currentRow.length >= 4) {
                        currentRow[3] += text.text;
                        console.log(`Found player name: ${text.text}`);
                    }
                },
                end() {
                    inNameCell = false;
                }
            })
            .on('td', {
                text(text) {
                    // Add text to the current cell
                    const index = currentRow.length - 1;
                    if (index >= 0) {
                        currentRow[index] += text.text.trim();
                    }
                }
            });
            
        // Process the HTML
        await rewriter.transform(response).text();
        
        console.log(`Table found: ${tableFound}`);
        console.log(`Player data count: ${playerData.length}`);
        
        if (!tableFound) {
            console.error("No table element was found in the HTML");
            // Try a simpler approach - just check if we can find any content
            const html = await response.clone().text();
            if (html.includes("<table")) {
                console.log("Table tag found in HTML but not detected by HTMLRewriter");
            } else {
                console.log("No table tag found in HTML");
            }
        }
        
        if (!playerData || playerData.length === 0) {
            console.error("No player data found after parsing");
            throw new Error('No player data found after successful page load');
        }

        console.log(`Found ${playerData.length} players`);

        // Process each team
        const teams = [...new Set(playerData.map(p => p.team))];
        for (const team of teams) {
            await updateTeamRoster(team, playerData, env);
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return playerData;
    } catch (error) {
        console.error(`Error scraping season ${seasonId}:`, error);
        throw error; // Rethrow to trigger retry
    }
}

export async function runPlayerScraper(env) {
    console.log('Starting player scraper');
    console.log('Start time:', new Date().toLocaleString());
    
    // Initialize Supabase client with environment variables
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    
    try {
        // Only process the most recent season in Cloudflare Worker to stay within limits
        const recentSeasons = SEASON_IDS.slice(0, 1); // Just try one season for now
        
        // Process in very small chunks due to Cloudflare Worker limitations
        const CHUNK_SIZE = 1;
        
        for (let i = 0; i < recentSeasons.length; i += CHUNK_SIZE) {
            console.log(`\nProcessing chunk ${Math.floor(i/CHUNK_SIZE) + 1} of ${Math.ceil(recentSeasons.length/CHUNK_SIZE)}`);
            
            const chunk = recentSeasons.slice(i, i + CHUNK_SIZE);
            
            for (const seasonId of chunk) {
                await scrapePlayerStats(seasonId, i, recentSeasons.length, env);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            // Shorter break between chunks for Cloudflare Workers
            if (i + CHUNK_SIZE < recentSeasons.length) {
                console.log('Taking a break between chunks...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

    } catch (error) {
        console.error('Fatal error:', error);
        throw error;
    }
    
    console.log('Player scraping completed');
    console.log('End time:', new Date().toLocaleString());
} 