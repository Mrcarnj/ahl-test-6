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
API_BASE_URL = "https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&view=roster&team_id={}&season_id=94&key=ccb91f29d6744675&client_code=ahl&fmt=json"

ROSTER_STATS_TABLE = "teamRosters"
TEAMS_TABLE = "teams"

# Coaching staff comes out of the same roster feed but only changes at the season
# rollover, so it is off by default. Set to True to refresh it once, then back.
UPDATE_COACHING_STAFF = False

# Standings feed, read only to map HockeyTech team_id -> teams.abbreviation for
# the coaching-staff update (the roster feed carries no team code).
STANDINGS_API_URL = "https://lscluster.hockeytech.com/feed/index.php?feed=modulekit&view=statviewtype&stat=division&type=standings&season_id=94&league_id=4&key=ccb91f29d6744675&client_code=ahl&callback=myCallback"

# API code -> database abbreviation
TEAM_CODE_MAPPING = {
    'LV': 'LHV',  # Lehigh Valley Phantoms
}

# All AHL team IDs
# (BRI/Bridgeport 317 left the league after 2025-26; HAM/Hamilton 457 joined for 2026-27.)
TEAM_IDS = [
    440, 402, 413, 444, 384, 330, 373, 445, 419, 328, 307, 437, 319,
    389, 415, 313, 321, 327, 403, 309, 323, 372, 404, 405, 411, 324, 380,
    335, 412, 390, 316, 457
]

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)


def build_team_id_to_abbrev() -> Dict[int, str]:
    """HockeyTech numeric team_id -> teams.abbreviation, from the standings feed."""
    mapping: Dict[int, str] = {}
    try:
        with urllib.request.urlopen(STANDINGS_API_URL) as response:
            raw_data = response.read().decode('utf-8').strip()
        # Strip JSONP callback wrapper: "myCallback(" ... ")"
        if raw_data.startswith("myCallback("):
            raw_data = raw_data[len("myCallback("):]
            if raw_data.endswith(")"):
                raw_data = raw_data[:-1]
        data = json.loads(raw_data)
    except Exception as e:
        print(f"  ❌ Error fetching standings for team map: {str(e)}")
        return mapping

    for team in data.get('SiteKit', {}).get('Statviewtype', []):
        if not isinstance(team, dict) or 'repeatheader' in team or not team.get('team_code'):
            continue
        try:
            team_id = int(str(team.get('team_id')))
        except (TypeError, ValueError):
            continue
        code = str(team['team_code'])
        mapping[team_id] = TEAM_CODE_MAPPING.get(code, code)

    return mapping


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
        # The feed ends with a nested array holding the team's coaching staff
        # (GM, coaches, video coordinator) — those entries carry role/person_id
        # instead of player fields. Skip them; they are not players.
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


def extract_coaching_staff(api_data: Dict) -> Dict[str, Optional[str]]:
    """Pull head coach + first two assistant coaches from the feed's staff block.

    The staff sits in a nested array at the end of SiteKit.Roster; entries carry
    role/person_id instead of player fields. Fewer than two assistants leaves the
    remaining column(s) None; more than two keeps the first two in feed order.
    """
    staff = {'headcoachname': None, 'assistantcoach1': None, 'assistantcoach2': None}

    roster = (api_data or {}).get('SiteKit', {}).get('Roster')
    if not isinstance(roster, list):
        return staff

    entries = []
    for item in roster:
        if isinstance(item, list):
            entries.extend(item)
        elif isinstance(item, dict) and item.get('role'):
            entries.append(item)

    assistants = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        role = str(entry.get('role') or '').strip().lower()
        role_id = str(entry.get('role_id') or '').strip()
        name = str(entry.get('name') or '').strip()
        if not name:
            name = f"{str(entry.get('first_name') or '').strip()} {str(entry.get('last_name') or '').strip()}".strip()
        if not name:
            continue

        if not staff['headcoachname'] and (role_id == '2' or role == 'head coach'):
            staff['headcoachname'] = name
        elif role_id == '3' or role == 'assistant coach':
            if len(assistants) < 2 and name not in assistants:
                assistants.append(name)

    staff['assistantcoach1'] = assistants[0] if len(assistants) > 0 else None
    staff['assistantcoach2'] = assistants[1] if len(assistants) > 1 else None
    return staff


def update_coaching_staff(team_abbrev: str, staff: Dict[str, Optional[str]]) -> bool:
    """Write a team's coaching staff to `teams`, skipping the write when unchanged.

    headcoachname is NOT NULL, so it is only written when the feed has one.
    """
    update = {
        'assistantcoach1': staff['assistantcoach1'],
        'assistantcoach2': staff['assistantcoach2'],
    }
    if staff['headcoachname']:
        update['headcoachname'] = staff['headcoachname']

    try:
        response = (
            supabase.table(TEAMS_TABLE)
            .select('headcoachname, assistantcoach1, assistantcoach2')
            .eq('abbreviation', team_abbrev)
            .execute()
        )
    except Exception as e:
        print(f"  ❌ Error reading coaching staff for {team_abbrev}: {str(e)}")
        return False

    if not response.data:
        print(f"  ⚠️  No teams row for {team_abbrev} - skipping coaching staff")
        return False

    existing = response.data[0]
    changed = [k for k, v in update.items() if v != existing.get(k)]
    if not changed:
        return False

    try:
        supabase.table(TEAMS_TABLE).update(update).eq('abbreviation', team_abbrev).execute()
    except Exception as e:
        print(f"  ❌ Error updating coaching staff for {team_abbrev}: {str(e)}")
        return False

    summary = ', '.join(f'{k}: "{existing.get(k)}" -> "{update[k]}"' for k in changed)
    print(f"  🔄 {team_abbrev} coaching staff - {summary}")
    return True


def update_players(players: List[Dict]) -> tuple:
    """Update players in database, only writing changes"""
    if not players:
        return 0, 0, 0
    
    # Fetch existing players from database
    try:
        # Get all player IDs we're updating
        player_ids = [str(p['id']) for p in players]
        
        # Fetch existing data for these players
        response = supabase.table(ROSTER_STATS_TABLE).select('id, number, rookie, veteran').in_('id', player_ids).execute()
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
            
            supabase.table(ROSTER_STATS_TABLE).update(update_data).eq('id', player['id']).execute()
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
    staff_updated = 0

    team_id_to_abbrev = build_team_id_to_abbrev() if UPDATE_COACHING_STAFF else {}

    print(f"\n🔄 Processing {len(TEAM_IDS)} teams...\n")
    
    for team_id in TEAM_IDS:
        print(f"📋 Processing team {team_id}...")
        
        # Fetch roster data
        api_data = fetch_team_roster(team_id)
        if not api_data:
            teams_failed += 1
            continue
        
        # Coaching staff first: same payload, and it has to land even for a team
        # whose player list comes back empty.
        if UPDATE_COACHING_STAFF:
            team_abbrev = team_id_to_abbrev.get(team_id)
            if team_abbrev:
                if update_coaching_staff(team_abbrev, extract_coaching_staff(api_data)):
                    staff_updated += 1
            else:
                print(f"  ⚠️  No abbreviation mapping for team_id={team_id} - skipping coaching staff")
        
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
    if UPDATE_COACHING_STAFF:
        print(f"🔄 Coaching staffs updated: {staff_updated}")
    if total_errors > 0:
        print(f"❌ Errors: {total_errors}")
    print("=" * 60)
    print("\n✅ Process complete!")


if __name__ == "__main__":
    main()

