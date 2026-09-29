#!/usr/bin/env python3
"""
Fetch AHL Team Standings from HockeyTech API and update Supabase
"""

import json
import urllib.request
from supabase import create_client, Client
from typing import Dict, List, Optional

# Supabase configuration
SUPABASE_URL = "https://zxjzdtepjpnunjkqrsjy.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4anpkdGVwanBudW5qa3Fyc2p5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mjk2MzI0NzEsImV4cCI6MjA0NTIwODQ3MX0.Q38eMfnthqid-0eo3yyLSFhRWMIv85yhWDmVXmxNwDw"

# API endpoint
API_URL = "https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&view=statviewtype&stat=division&type=standings&season_id=93&league_id=4&key=ccb91f29d6744675&client_code=ahl&callback=myCallback"

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def map_team_code(api_team_code: str) -> str:
    """Map API team codes to database abbreviations"""
    team_code_mapping = {
        'LV': 'LHV',  # Lehigh Valley Phantoms
        # Add more mappings here as needed
    }
    return team_code_mapping.get(api_team_code, api_team_code)


def fetch_api_data() -> Optional[Dict]:
    """Fetch data from the HockeyTech API and parse JSONP response"""
    print("🌐 Fetching data from HockeyTech API...")
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
        return data
        
    except Exception as e:
        print(f"❌ Error fetching API data: {str(e)}")
        return None


def transform_standings_data(api_data: Dict) -> List[Dict]:
    """Transform API data to match database schema"""
    print("🔄 Transforming data to match database schema...")
    
    teams = []
    
    if not api_data or 'SiteKit' not in api_data:
        print("❌ Invalid API data structure - missing SiteKit")
        return teams
    
    site_kit = api_data['SiteKit']
    if 'Statviewtype' not in site_kit:
        print("❌ No Statviewtype data found in API response")
        return teams
    
    standings = site_kit['Statviewtype']
    
    for team in standings:
        # Skip header rows (they have repeatheader property)
        if 'repeatheader' in team or not team.get('team_code'):
            continue
        
        # Map team code (LV → LAV)
        team_code = team.get('team_code')
        if team_code:
            team_code = map_team_code(team_code)
        
        # Transform the data
        # Remove " Division" from division name (e.g., "North Division" -> "North")
        divisname = team.get('divisname')
        if divisname and divisname.endswith(' Division'):
            divisname = divisname[:-9]  # Remove " Division" (9 characters)
        
        team_data = {
            'abbreviation': team_code,
            'division': divisname,
            'games_played': str(team.get('games_played')) if team.get('games_played') else None,
            'wins': str(team.get('wins')) if team.get('wins') else None,
            'losses': str(team.get('losses')) if team.get('losses') else None,
            'otl': str(team.get('ot_losses')) if team.get('ot_losses') else None,
            'sol': str(team.get('shootout_losses')) if team.get('shootout_losses') else None,
            'points': str(team.get('points')) if team.get('points') else None,
            'division_rank': str(team.get('rank')) if team.get('rank') is not None else None,
            'overall_rank': str(team.get('overall_rank')) if team.get('overall_rank') is not None else None,
        }
        
        if team_data['abbreviation']:
            teams.append(team_data)
        else:
            print(f"⚠️  Skipping team with missing abbreviation: {team.get('name', 'Unknown')}")
    
    print(f"✅ Transformed {len(teams)} teams")
    return teams


def update_teams(teams: List[Dict]) -> None:
    """Update teams in database, only writing changes"""
    if not teams:
        print("⚠️  No teams to update")
        return
    
    print(f"\n📊 Processing {len(teams)} teams from API...")
    
    # Fetch existing teams from database
    print("🔍 Fetching existing teams from database for comparison...")
    try:
        response = supabase.table('teams').select('id, abbreviation, division, games_played, wins, losses, otl, sol, points, division_rank, overall_rank').execute()
        existing_teams = {t['abbreviation']: t for t in response.data} if response.data else {}
        print(f"   Found {len(existing_teams)} existing teams in database")
    except Exception as e:
        print(f"   ⚠️  Could not fetch existing teams: {str(e)}")
        print("   Will update all teams")
        existing_teams = {}
    
    # Compare and filter to only changed teams
    teams_to_update = []
    updated_count = 0
    unchanged_count = 0
    not_found_count = 0
    
    print("🔄 Comparing API data with database...")
    for team in teams:
        abbreviation = team['abbreviation']
        
        if abbreviation not in existing_teams:
            print(f"  ⚠️  Team {abbreviation} not found in database - skipping")
            not_found_count += 1
            continue
        
        existing = existing_teams[abbreviation]
        has_changes = False
        
        # Compare the standings fields we're updating
        fields_to_compare = ['division', 'games_played', 'wins', 'losses', 'otl', 'sol', 'points', 'division_rank', 'overall_rank']
        
        for field in fields_to_compare:
            if team.get(field) != existing.get(field):
                has_changes = True
                break
        
        if has_changes:
            # Add the team ID for the update
            team['id'] = existing['id']
            teams_to_update.append(team)
            updated_count += 1
        else:
            unchanged_count += 1
    
    print(f"   ✅ Teams to update: {updated_count}")
    print(f"   ⊘ Unchanged teams: {unchanged_count}")
    print(f"   ⚠️  Teams not found: {not_found_count}")
    
    if not teams_to_update:
        print("\n✅ No changes detected - database is up to date!")
        return
    
    # Update teams
    print(f"\n📝 Updating {len(teams_to_update)} teams in database...")
    errors = 0
    successful_updates = 0
    
    for team in teams_to_update:
        try:
            update_data = {
                'division': team.get('division'),
                'games_played': team.get('games_played'),
                'wins': team.get('wins'),
                'losses': team.get('losses'),
                'otl': team.get('otl'),
                'sol': team.get('sol'),
                'points': team.get('points'),
                'division_rank': team.get('division_rank'),
                'overall_rank': team.get('overall_rank'),
            }
            
            response = supabase.table('teams').update(update_data).eq('id', team['id']).execute()
            successful_updates += 1
            print(f"  ✅ Updated {team['abbreviation']}: {update_data}")
        except Exception as e:
            print(f"  ❌ Error updating team {team['abbreviation']}: {str(e)}")
            errors += 1
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total teams from API: {len(teams)}")
    print(f"🔄 Teams updated: {successful_updates}")
    print(f"⊘ Unchanged (skipped): {unchanged_count}")
    print(f"⚠️  Teams not found: {not_found_count}")
    if errors > 0:
        print(f"❌ Errors: {errors}")
    print("=" * 60)


def main():
    """Main function"""
    print("=" * 60)
    print("AHL Team Standings Fetcher")
    print("=" * 60)
    
    # Fetch data from API
    api_data = fetch_api_data()
    if not api_data:
        print("❌ Failed to fetch API data. Exiting.")
        return
    
    # Transform data
    teams = transform_standings_data(api_data)
    if not teams:
        print("❌ No teams to update. Exiting.")
        return
    
    # Show sample of first few teams for verification
    print(f"\n📋 Sample of first 5 teams:")
    for i, team in enumerate(teams[:5], 1):
        print(f"  {i}. {team['abbreviation']} - {team['wins']}W-{team['losses']}L-{team.get('otl', '0')}OTL - {team['points']} pts")
    
    # Update database
    update_teams(teams)
    
    print("\n✅ Process complete!")


if __name__ == "__main__":
    main()

