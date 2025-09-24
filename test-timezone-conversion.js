// Test script to demonstrate timezone conversion logging
// This shows the original UTC time vs converted team timezone

const { fetchAndParseHockeySchedule } = require('./src/lib/icalHockeySync.js');

async function testTimezoneConversion() {
  console.log('🧪 Testing Dynamic Timezone Conversion...\n');
  
  try {
    // Test in test mode to see the conversion logs
    const result = await fetchAndParseHockeySchedule(true);
    
    if (result.success) {
      console.log('\n✅ Test completed successfully!');
      console.log('\n📋 What to look for in the logs above:');
      console.log('   🕐 Timezone Conversion logs showing:');
      console.log('      - Original UTC time from iCal');
      console.log('      - Team timezone from database');
      console.log('      - Converted local time with offset');
      console.log('\n📊 Example conversion:');
      console.log('   Original UTC: 20251004T200000Z');
      console.log('   Team Timezone: America/Los_Angeles');
      console.log('   Converted Time: 2025-10-04T13:00:00-07:00');
    } else {
      console.log('❌ Test failed:', result.error);
    }
    
  } catch (error) {
    console.error('💥 Test error:', error);
  }
}

// Run the test
testTimezoneConversion();
