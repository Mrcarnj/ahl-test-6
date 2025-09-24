import { runPlayerScraper } from './player-scraper.js';
import { runNumbersScraper } from './numbers-scraper.js';

// Maximum execution time for Cloudflare Workers is 30 seconds
const MAX_EXECUTION_TIME = 28000; // 28 seconds in milliseconds

/**
 * Handle scheduled event
 * @param {ScheduledEvent} event
 * @param {Object} env - Environment variables
 * @param {Object} ctx - Execution context
 */
async function handleScheduled(event, env, ctx) {
  console.log("Scheduled worker started at", new Date().toISOString());
  
  try {
    // Create a promise that resolves after MAX_EXECUTION_TIME
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('Worker execution timed out'));
      }, MAX_EXECUTION_TIME);
    });

    // Run the player scraper first
    console.log("Starting player scraper...");
    await Promise.race([
      runPlayerScraper(env),
      timeoutPromise
    ]);
    
    // Then run the numbers scraper
    console.log("Starting numbers scraper...");
    await Promise.race([
      runNumbersScraper(env),
      timeoutPromise
    ]);
    
    console.log("Scheduled worker completed successfully at", new Date().toISOString());
    return new Response("Scraping completed successfully", { status: 200 });
  } catch (error) {
    console.error("Error in scheduled worker:", error);
    return new Response(`Scraping failed: ${error.message}`, { status: 500 });
  }
}

/**
 * Handle HTTP request (for manual triggering and testing)
 * @param {Request} request
 * @param {Object} env - Environment variables
 * @param {Object} ctx - Execution context
 */
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  
  // Public status endpoint that doesn't require authentication
  if (url.pathname === '/status') {
    return new Response(JSON.stringify({
      status: 'online',
      message: 'AHL Scraper Worker is running',
      time: new Date().toISOString(),
      endpoints: ['/run-all', '/run-player-scraper', '/run-numbers-scraper']
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Only allow GET requests
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }
  
  // Check for authorization header
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || authHeader !== `Bearer ${env.API_KEY}`) {
    return new Response('Unauthorized - API key required', { status: 401 });
  }
  
  // Handle different endpoints
  if (url.pathname === '/run-player-scraper') {
    try {
      await runPlayerScraper(env);
      return new Response('Player scraper completed successfully', { status: 200 });
    } catch (error) {
      console.error('Player scraper error:', error);
      return new Response(`Player scraper failed: ${error.message}`, { status: 500 });
    }
  } else if (url.pathname === '/run-numbers-scraper') {
    try {
      await runNumbersScraper(env);
      return new Response('Numbers scraper completed successfully', { status: 200 });
    } catch (error) {
      console.error('Numbers scraper error:', error);
      return new Response(`Numbers scraper failed: ${error.message}`, { status: 500 });
    }
  } else if (url.pathname === '/run-all') {
    try {
      await runPlayerScraper(env);
      await runNumbersScraper(env);
      return new Response('All scrapers completed successfully', { status: 200 });
    } catch (error) {
      console.error('Scraper error:', error);
      return new Response(`Scrapers failed: ${error.message}`, { status: 500 });
    }
  } else if (url.pathname === '/') {
    return new Response('AHL Scraper Worker - Use /status for more information', { status: 200 });
  } else {
    return new Response('Endpoint not found', { status: 404 });
  }
}

// Export the event handlers for Cloudflare Workers
export default {
  // Handle scheduled events (CRON)
  scheduled: handleScheduled,
  
  // Handle HTTP requests (for manual triggering)
  fetch: handleRequest
}; 