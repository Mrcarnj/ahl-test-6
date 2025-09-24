import { createClient } from '@supabase/supabase-js';

// Create Supabase client - we'll initialize this in the function with env variables
let supabase;

const SEASON_IDS = [
    440, 402, 413, 317, 444, 384, 330, 373, 445, 419, 328, 307, 437, 319, 389,
    415, 313, 321, 327, 403, 309, 323, 372, 404, 405, 411, 324, 380, 335, 412,
    390, 316
];

async function updatePlayerNumbers(seasonId, numbers, env) {
    if (!numbers || numbers.length === 0) return;

    console.log(`Updating numbers for ${numbers.length} players`);

    for (const player of numbers) {
        const { error } = await supabase
            .from('teamRosters')
            .update({ number: player.number })
            .eq('player_name', player.name);

        if (error) {
            console.error(`Error updating number for ${player.name}:`, error);
        }
    }
}

async function fetchWithRetry(url, retries = 3) {
    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                    'Cache-Control': 'max-age=0'
                }
            });

            if (!response.ok) {
                console.log(`Received ${response.status} status, attempt ${i + 1} of ${retries}`);
                if (i === retries - 1) {
                    throw new Error(`Failed with status ${response.status} after all retries`);
                }
                await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
                continue;
            }

            return response;
        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error.message);
            if (i === retries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
        }
    }
}

async function scrapeRosterNumbers(seasonId, env) {
    const url = `https://theahl.com/stats/roster/${seasonId}/86`;
    console.log(`\nScraping roster numbers from: ${seasonId}`);
    console.log(`URL: ${url}`);

    try {
        // Fetch the HTML content
        const response = await fetchWithRetry(url);
        
        const playerNumbers = [];
        let currentName = '';
        let currentNumber = '';
        let inNameCell = false;
        let inNumberCell = false;
        let currentRow = false;
        
        // Create an HTML rewriter to parse the table
        const rewriter = new HTMLRewriter()
            .on('table tr', {
                element() {
                    // Reset for new row
                    currentRow = true;
                    currentName = '';
                    currentNumber = '';
                },
                end() {
                    // Process completed row
                    if (currentName && currentNumber) {
                        playerNumbers.push({ 
                            name: currentName.trim(), 
                            number: currentNumber.trim() 
                        });
                    }
                    currentRow = false;
                }
            })
            .on('td.name a', {
                element() {
                    inNameCell = true;
                },
                text(text) {
                    if (inNameCell && currentRow) {
                        currentName += text.text;
                    }
                },
                end() {
                    inNameCell = false;
                }
            })
            .on('td.tp_jersey_number span', {
                element() {
                    inNumberCell = true;
                },
                text(text) {
                    if (inNumberCell && currentRow) {
                        currentNumber += text.text;
                    }
                },
                end() {
                    inNumberCell = false;
                }
            });
            
        // Process the HTML
        await rewriter.transform(response).text();

        console.log(`Found ${playerNumbers.length} numbers`);
        return playerNumbers;

    } catch (error) {
        console.error(`Error scraping roster numbers:`, error);
        return [];
    }
}

export async function runNumbersScraper(env) {
    console.log('Starting numbers scraper');
    console.log('Start time:', new Date().toLocaleString());
    
    // Initialize Supabase client with environment variables
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
    
    try {
        // Only process the most recent season in Cloudflare Worker to stay within limits
        const recentSeasons = SEASON_IDS.slice(0, 2);

        for (const seasonId of recentSeasons) {
            try {
                const numbers = await scrapeRosterNumbers(seasonId, env);
                if (numbers.length > 0) {
                    await updatePlayerNumbers(seasonId, numbers, env);
                }
            } catch (error) {
                console.error(`Error processing season ${seasonId}:`, error);
            }
            
            // Break between seasons
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

    } catch (error) {
        console.error('Fatal error:', error);
        throw error;
    }
    
    console.log('Numbers scraping completed');
    console.log('End time:', new Date().toLocaleString());
} 