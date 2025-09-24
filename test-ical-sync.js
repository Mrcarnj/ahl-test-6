// Test script for iCal Hockey Schedule Sync
// Run this to test the parsing and database integration

const { fetchAndParseHockeySchedule } = require('./src/lib/icalHockeySync.js');

async function testHockeySync() {
  console.log('🏒 Testing Hockey Schedule iCal Sync...\n');
  
  try {
    // Test 1: Parse iCal data (test mode)
    console.log('📋 Test 1: Parsing iCal data...');
    const testResult = await fetchAndParseHockeySchedule(true);
    
    if (testResult.success) {
      console.log('✅ iCal parsing successful!');
      console.log(`📊 Found ${testResult.testOutput.length} games`);
      
      // Show first few games as examples
      if (testResult.testOutput.length > 0) {
        console.log('\n📅 Sample games:');
        testResult.testOutput.slice(0, 3).forEach((game, index) => {
          console.log(`\nGame ${index + 1}:`);
          console.log(`  ID: ${game.gameId}`);
          console.log(`  Teams: ${game.awayTeam} @ ${game.homeTeam}`);
          console.log(`  Date: ${game.startTime}`);
          console.log(`  Code: ${game.gameCode}`);
          console.log(`  Referees: ${game.referees.join(', ')}`);
          console.log(`  Linespeople: ${game.linespeople.join(', ')}`);
        });
      }
    } else {
      console.log('❌ iCal parsing failed:', testResult.error);
      return;
    }
    
    // Test 2: Full sync to database
    console.log('\n🔄 Test 2: Full database sync...');
    const syncResult = await fetchAndParseHockeySchedule(false);
    
    if (syncResult.success) {
      console.log('✅ Database sync successful!');
      console.log(`📊 Games processed: ${syncResult.gamesProcessed}`);
      console.log(`🆕 New games: ${syncResult.newGames}`);
      console.log(`🔄 Updated games: ${syncResult.updatedGames}`);
    } else {
      console.log('❌ Database sync failed:', syncResult.error);
    }
    
  } catch (error) {
    console.error('💥 Test failed with error:', error);
  }
}

// Run the test
testHockeySync();
