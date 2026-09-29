#!/usr/bin/env python3
"""
Fetch AHL Player Stats from HockeyTech API and insert into Supabase
"""

import json
import re
from supabase import create_client, Client
from typing import Dict, List, Optional

# Supabase configuration
SUPABASE_URL = "https://zxjzdtepjpnunjkqrsjy.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4anpkdGVwanBudW5qa3Fyc2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk2MzI0NzEsImV4cCI6MjA0NTIwODQ3MX0.Q38eMfnthqid-0eo3yyLSFhRWMIv85yhWDmVXmxNwDw"

# API endpoint with high limit to get all players (set to 2000 to cover all possible skaters)
API_URL = "https://lscluster.hockeytech.com/feed/index.php?feed=statviewfeed&view=players&season=94&team=all&position=skaters&rookies=0&statsType=standard&league_id=4&limit=2000&sort=points&lang=en&key=ccb91f29d6744675&client_code=ahl&callback=myCallback"

ROSTER_STATS_TABLE = "teamRosters"
# 2026-27 regular season (HockeyTech season_id 94)
ROSTER_SEASON_ID = 94

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def map_team_code(api_team_code: str) -> str:
    """Map API team codes to database abbreviations"""
    team_code_mapping = {
        'LV': 'LAV',  # Laval Rocket
        # Add more mappings here as needed
    }
    return team_code_mapping.get(api_team_code, api_team_code)


def fetch_api_data():
    """Fetch data from the HockeyTech API and parse JSONP response"""
    import urllib.request
    
    print("🌐 Fetching data from HockeyTech API (limit: 2000 to get all skaters)...")
    try:
        with urllib.request.urlopen(API_URL) as response:
            raw_data = response.read().decode('utf-8')
            
        # Strip JSONP callback wrapper: "myCallback(" at start and ")" at end
        print("🔄 Parsing JSONP response...")
        if raw_data.startswith("myCallback("):
            json_data = raw_data[11:]  # Remove "myCallback("
            if json_data.endswith(")"):
                json_data = json_data[:-1]  # Remove trailing ")"
        
        data = json.loads(json_data)
        print(f"✅ Successfully fetched and parsed API data")
        
        # API returns a list with one dict: [{"sections":[...]}]
        # Extract the dict from the list
        if isinstance(data, list) and len(data) > 0:
            data = data[0]
        
        return data
        
    except Exception as e:
        print(f"❌ Error fetching API data: {str(e)}")
        return None


def transform_player_data(api_data) -> List[Dict]:
    """Transform API data to match database schema"""
    print("🔄 Transforming data to match database schema...")
    
    players = []
    
    if not api_data:
        print("❌ API data is None or empty")
        return players
    
    if 'sections' not in api_data:
        print("❌ 'sections' key not found in API data")
        print(f"🔍 Available keys: {list(api_data.keys()) if isinstance(api_data, dict) else type(api_data)}")
        return players
    
    if len(api_data['sections']) == 0:
        print("❌ 'sections' array is empty")
        return players
    
    section = api_data['sections'][0]
    if 'data' not in section:
        print("❌ No player data found in API response")
        return players
    
    for item in section['data']:
        if 'row' not in item or 'prop' not in item:
            continue
            
        row = item['row']
        prop = item['prop']
        
        # Extract seoName from prop.name
        seo_name = None
        if 'name' in prop and 'seoName' in prop['name']:
            seo_name = prop['name']['seoName']
        elif 'name' in row:
            seo_name = row['name']
        
        # Extract team_code from prop or row
        team_code = None
        if 'team_code' in prop and 'teamLink' in prop['team_code']:
            # If we only have teamLink, we need to use row's team_code
            team_code = row.get('team_code')
        elif 'team_code' in row:
            team_code = row['team_code']
        
        # Map API team code to database abbreviation
        if team_code:
            team_code = map_team_code(team_code)
        
        # Helper function to safely convert to int/smallint
        def to_int(value, default=None):
            if value is None or value == '':
                return default
            try:
                return int(value)
            except (ValueError, TypeError):
                return default
        
        player = {
            'id': to_int(row.get('player_id')),
            'team': team_code,
            'player_name': seo_name,
            'position': row.get('position'),
            'games_played': to_int(row.get('games_played')),
            'goals': to_int(row.get('goals')),
            'assists': to_int(row.get('assists')),
            'points': to_int(row.get('points')),
            'plusMinus': to_int(row.get('plus_minus')),
            'penalty_minutes': to_int(row.get('penalty_minutes')),
            'power_play_goals': to_int(row.get('power_play_goals')),
        }
        
        # Only add if we have required fields
        if player['id'] and player['team'] and player['player_name']:
            players.append(player)
        else:
            print(f"⚠️  Skipping player with missing required fields: {player}")
    
    print(f"✅ Transformed {len(players)} players")
    return players


def insert_players(players: List[Dict]) -> None:
    """Insert/update players into Supabase, only writing changes"""
    if not players:
        print("⚠️  No players to insert")
        return
    
    print(f"\n📊 Processing {len(players)} players from API...")
    
    # Fetch existing players from database to compare
    print("🔍 Fetching existing players from database for comparison...")
    try:
        response = supabase.table(ROSTER_STATS_TABLE).select('*').execute()
        existing_players = {str(p['id']): p for p in response.data} if response.data else {}
        print(f"   Found {len(existing_players)} existing players in database")
    except Exception as e:
        print(f"   ⚠️  Could not fetch existing players: {str(e)}")
        print("   Will insert/update all players")
        existing_players = {}
    
    # Compare and filter to only changed or new players
    players_to_write = []
    new_players = []
    updated_players = []
    unchanged_count = 0
    
    print("🔄 Comparing API data with database...")
    for player in players:
        player_id = str(player['id'])
        
        if player_id not in existing_players:
            # New player - add to insert list
            new_players.append(player)
            players_to_write.append(player)
        else:
            # Existing player - check if any fields changed
            existing = existing_players[player_id]
            has_changes = False
            
            # Compare all fields (excluding updated_at which will be auto-updated)
            fields_to_compare = ['team', 'player_name', 'position', 'games_played', 'goals', 
                               'assists', 'points', 'plusMinus', 'penalty_minutes', 
                               'power_play_goals', 'number']
            
            for field in fields_to_compare:
                if player.get(field) != existing.get(field):
                    has_changes = True
                    break
            
            if has_changes:
                updated_players.append(player)
                players_to_write.append(player)
            else:
                unchanged_count += 1
    
    print(f"   ✅ New players: {len(new_players)}")
    print(f"   🔄 Updated players: {len(updated_players)}")
    print(f"   ⊘ Unchanged players: {unchanged_count}")
    
    if not players_to_write:
        print("\n✅ No changes detected - database is up to date!")
        return
    
    # Write only changed/new players in batches
    print(f"\n📝 Writing {len(players_to_write)} players to database...")
    batch_size = 100
    total_written = 0
    errors = 0
    
    for i in range(0, len(players_to_write), batch_size):
        batch = players_to_write[i:i + batch_size]
        batch_num = (i // batch_size) + 1
        total_batches = (len(players_to_write) + batch_size - 1) // batch_size
        
        print(f"  Processing batch {batch_num}/{total_batches} ({len(batch)} players)...")
        
        try:
            # Upsert: insert if new, update if exists (based on id primary key)
            batch_rows = [{**player, "season_id": ROSTER_SEASON_ID} for player in batch]
            response = supabase.table(ROSTER_STATS_TABLE).upsert(
                batch_rows,
                on_conflict='id'
            ).execute()
            
            total_written += len(batch)
            print(f"  ✅ Batch {batch_num} processed successfully")
            
        except Exception as e:
            print(f"  ❌ Error processing batch {batch_num}: {str(e)}")
            errors += len(batch)
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total players from API: {len(players)}")
    print(f"✅ New players inserted: {len(new_players)}")
    print(f"🔄 Players updated: {len(updated_players)}")
    print(f"⊘ Unchanged (skipped): {unchanged_count}")
    print(f"📝 Total written to database: {total_written}")
    if errors > 0:
        print(f"❌ Errors: {errors}")
    print("=" * 60)


def main():
    """Main function"""
    print("=" * 60)
    print("AHL Player Stats Fetcher")
    print("=" * 60)
    
    # Fetch data from API
    api_data = fetch_api_data()
    if not api_data:
        print("❌ Failed to fetch API data. Exiting.")
        return
    
    # Transform data
    players = transform_player_data(api_data)
    if not players:
        print("❌ No players to insert. Exiting.")
        return
    
    # Show sample of first few players for verification
    print(f"\n📋 Sample of first 5 players:")
    for i, player in enumerate(players[:5], 1):
        print(f"  {i}. {player['player_name']} ({player['team']}) - {player['points']} pts")
    
    # Insert into database
    insert_players(players)
    
    print("\n✅ Process complete!")


if __name__ == "__main__":
    main()

