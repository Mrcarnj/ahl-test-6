#!/usr/bin/env python3
"""
Fetch AHL Player Roster Data (jersey numbers, rookie status, veteran status)
from HockeyTech API and update Supabase
"""

import json
import urllib.request
from supabase import create_client, Client
from typing import Dict, List, Optional

# Supabase configuration
SUPABASE_URL = "https://zxjzdtepjpnunjkqrsjy.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4anpkdGVwanBudW5qa3Fyc2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk2MzI0NzEsImV4cCI6MjA0NTIwODQ3MX0.Q38eMfnthqid-0eo3yyLSFhRWMIv85yhWDmVXmxNwDw"

# API base URL (team_id will be inserted)
API_BASE_URL = "https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&view=roster&team_id={}&season_id=90&key=ccb91f29d6744675&client_code=ahl&fmt=json"

# All AHL team IDs
TEAM_IDS = [
    440, 402, 413, 317, 444, 384, 330, 373, 445, 419, 328, 307, 437, 319,
    389, 415, 313, 321, 327, 403, 309, 323, 372, 404, 405, 411, 324, 380,
    335, 412, 390, 316
]

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def fetch_team_roster(team_id: int) -> Optional[Dict]:
    """Fetch roster data for a specific team"""
    url = API_BASE_URL.format(team_id)
    
    try:
        with urllib.request.urlopen(url) as response:
            raw_data = response.read().decode('utf-8')
            data = json.loads(raw_data)
            return data
    except Exception as e:
        print(f"  ❌ Error fetching team {team_id}: {str(e)}")
        return None


def transform_roster_data(api_data: Dict) -> List[Dict]:
    """Transform API roster data to match database schema"""
    players = []
    
    if not api_data or 'SiteKit' not in api_data:
        return players
    
    site_kit = api_data['SiteKit']
    if 'Roster' not in site_kit:
        return players
    
    roster = site_kit['Roster']
    
    for item in roster:
        # Skip if item is not a dict (e.g., staff/coaches arrays)
        if not isinstance(item, dict):
            continue
        
        # Extract player_id (this matches the database id)
        player_id = item.get('player_id') or item.get('id')
        if not player_id:
            continue
        
        player = item
        
        # Transform rookie: 1 = TRUE, anything else = NULL
        # Handle both string '1' and integer 1
        rookie_value = None
        rookie_raw = player.get('rookie')
        if rookie_raw == '1' or rookie_raw == 1:
            rookie_value = True
        
        # Transform veteran_status: 1 = TRUE, anything else = NULL
        # Handle both string '1' and integer 1
        veteran_value = None
        veteran_raw = player.get('veteran_status')
        if veteran_raw == '1' or veteran_raw == 1:
            veteran_value = True
        
        # Extract jersey number
        jersey_number = player.get('tp_jersey_number')
        # Convert to string if it's a number, or None if empty
        if jersey_number:
            jersey_number = str(jersey_number).strip()
            if jersey_number == '' or jersey_number == '0':
                jersey_number = None
        else:
            jersey_number = None
        
        player_data = {
            'id': int(player_id),
            'number': jersey_number,
            'rookie': rookie_value,
            'veteran': veteran_value,
        }
        
        players.append(player_data)
    
    return players


def update_players(players: List[Dict]) -> tuple:
    """Update players in database, only writing changes"""
    if not players:
        return 0, 0, 0
    
    # Fetch existing players from database
    try:
        # Get all player IDs we're updating
        player_ids = [str(p['id']) for p in players]
        
        # Fetch existing data for these players
        response = supabase.table('teamRosters').select('id, number, rookie, veteran').in_('id', player_ids).execute()
        existing_players = {str(p['id']): p for p in response.data} if response.data else {}
    except Exception as e:
        print(f"  ⚠️  Could not fetch existing players: {str(e)}")
        existing_players = {}
    
    # Compare and filter to only changed players
    players_to_update = []
    updated_count = 0
    unchanged_count = 0
    
    for player in players:
        player_id = str(player['id'])
        
        if player_id not in existing_players:
            # Player doesn't exist in database - skip (shouldn't happen, but handle gracefully)
            continue
        
        existing = existing_players[player_id]
        has_changes = False
        
        # Compare the three fields we're updating
        if player.get('number') != existing.get('number'):
            has_changes = True
        if player.get('rookie') != existing.get('rookie'):
            has_changes = True
        if player.get('veteran') != existing.get('veteran'):
            has_changes = True
        
        if has_changes:
            players_to_update.append(player)
            updated_count += 1
        else:
            unchanged_count += 1
    
    if not players_to_update:
        return 0, 0, unchanged_count
    
    # Update players one by one (Supabase doesn't support bulk updates with different values)
    errors = 0
    successful_updates = 0
    
    for player in players_to_update:
        try:
            update_data = {
                'number': player.get('number'),
                'rookie': player.get('rookie'),
                'veteran': player.get('veteran'),
            }
            
            supabase.table('teamRosters').update(update_data).eq('id', player['id']).execute()
            successful_updates += 1
        except Exception as e:
            print(f"    ❌ Error updating player {player['id']}: {str(e)}")
            errors += 1
    
    return successful_updates, errors, unchanged_count


def main():
    """Main function"""
    print("=" * 60)
    print("AHL Player Roster Updater")
    print("(Updates: jersey number, rookie status, veteran status)")
    print("=" * 60)
    
    total_players_processed = 0
    total_updated = 0
    total_unchanged = 0
    total_errors = 0
    teams_processed = 0
    teams_failed = 0
    
    print(f"\n🔄 Processing {len(TEAM_IDS)} teams...\n")
    
    for team_id in TEAM_IDS:
        print(f"📋 Processing team {team_id}...")
        
        # Fetch roster data
        api_data = fetch_team_roster(team_id)
        if not api_data:
            teams_failed += 1
            continue
        
        # Transform data
        players = transform_roster_data(api_data)
        if not players:
            print(f"  ⚠️  No players found for team {team_id}")
            teams_failed += 1
            continue
        
        print(f"  ✅ Found {len(players)} players")
        total_players_processed += len(players)
        
        # Update database
        updated, errors, unchanged = update_players(players)
        total_updated += updated
        total_unchanged += unchanged
        total_errors += errors
        
        if updated > 0:
            print(f"  🔄 Updated: {updated}, ⊘ Unchanged: {unchanged}")
        else:
            print(f"  ⊘ All {unchanged} players unchanged")
        
        teams_processed += 1
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Teams processed: {teams_processed}/{len(TEAM_IDS)}")
    if teams_failed > 0:
        print(f"Teams failed: {teams_failed}")
    print(f"Total players processed: {total_players_processed}")
    print(f"🔄 Players updated: {total_updated}")
    print(f"⊘ Players unchanged: {total_unchanged}")
    if total_errors > 0:
        print(f"❌ Errors: {total_errors}")
    print("=" * 60)
    print("\n✅ Process complete!")


if __name__ == "__main__":
    main()

