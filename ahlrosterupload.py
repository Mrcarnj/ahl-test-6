import pandas as pd
from supabase import create_client, Client
import os
from typing import Optional

# Supabase configuration
SUPABASE_URL = 'null'
SUPABASE_ANON_KEY = 'null'
SUPABASE_SERVICE_KEY = 'null'
DEFAULT_PASSWORD = 'null'

# Initialize Supabase clients
supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
admin_supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_phone_number(row) -> Optional[str]:
    """Extract phone number from cell, home, or return None"""
    cell = str(row.get('Cell Phone', '')).strip()
    home = str(row.get('Home Phone', '')).strip()
    
    if cell and cell != 'nan' and cell != '':
        return cell
    elif home and home != 'nan' and home != '':
        return home
    return None

def process_csv_row(row) -> dict:
    """Process a CSV row into the format needed for roster table"""
    first_name = str(row['First Name']).strip()
    last_name = str(row['Last Name']).strip()
    email = str(row['Primary Email Address']).strip().lower()
    
    return {
        'email': email,
        'firstname': first_name,
        'lastname': last_name,
        'lastfirstfullname': f"{last_name}, {first_name}",
        'firstlast': f"{first_name} {last_name}",
        'phonenumber': get_phone_number(row)
    }

def create_auth_user(email: str, password: str) -> Optional[str]:
    """Create a user in Supabase Auth and return auth_id (UUID)"""
    try:
        response = admin_supabase.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True
        })
        
        if response.user:
            print(f"  ✓ Created auth user: {email}")
            return response.user.id
        else:
            print(f"  ✗ Failed to create auth user for {email}")
            return None
            
    except Exception as e:
        error_msg = str(e)
        if "already been registered" in error_msg or "User already registered" in error_msg:
            print(f"  ℹ️  Auth user already exists: {email}")
            try:
                auth_user = get_auth_user_by_email(email)
                if auth_user:
                    return auth_user
            except:
                pass
        print(f"  ✗ Error creating auth user for {email}: {error_msg}")
        return None

def get_auth_user_by_email(email: str) -> Optional[str]:
    """Get auth user ID by email using admin API"""
    try:
        response = admin_supabase.auth.admin.list_users()
        if response:
            for user in response:
                if user.email == email:
                    return user.id
        return None
    except Exception as e:
        print(f"  ✗ Error fetching auth user for {email}: {str(e)}")
        return None

def check_existing_user(email: str) -> Optional[dict]:
    """Check if user already exists in roster table"""
    try:
        response = supabase.table('roster').select('*').eq('email', email).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"  ✗ Error checking existing user {email}: {str(e)}")
        return None

def execute_sql(sql: str) -> bool:
    """Execute raw SQL using Supabase RPC or REST API"""
    try:
        # Use the Supabase REST API to execute SQL
        headers = {
            'apikey': SUPABASE_SERVICE_KEY,
            'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
            'Content-Type': 'application/json'
        }
        
        # Use the rpc endpoint if available, or postgrest
        response = requests.post(
            f'{SUPABASE_URL}/rest/v1/rpc/exec_sql',
            headers=headers,
            json={'query': sql}
        )
        
        return response.status_code == 200
    except Exception as e:
        print(f"  ✗ SQL execution error: {str(e)}")
        return False

def update_roster_with_schedule_fix(auth_id: str, user_data: dict, old_name: str, new_name: str):
    """Update roster and schedule in a way that handles foreign key constraints"""
    try:
        # Store schedule IDs that reference this person
        schedule_updates = []
        
        # Find all schedule entries that reference the old name
        for field in ['referee1', 'referee2', 'linesperson1', 'linesperson2']:
            response = supabase.table('schedule').select('uuid', field).eq(field, old_name).execute()
            if response.data:
                for item in response.data:
                    schedule_updates.append({
                        'uuid': item['uuid'],
                        'field': field
                    })
        
        if schedule_updates:
            print(f"    → Found {len(schedule_updates)} schedule references to update")
            
            # Step 1: Set all references to NULL
            for update in schedule_updates:
                supabase.table('schedule').update({update['field']: None}).eq('uuid', update['uuid']).execute()
            print(f"    → Cleared schedule references")
        
        # Step 2: Update roster
        response = supabase.table('roster').update(user_data).eq('auth_id', auth_id).execute()
        print(f"  ✓ Updated roster: {user_data['email']}")
        
        # Step 3: Restore schedule references with new name
        if schedule_updates:
            for update in schedule_updates:
                supabase.table('schedule').update({update['field']: new_name}).eq('uuid', update['uuid']).execute()
            print(f"    → Restored schedule references with new name: {new_name}")
        
        return response
    except Exception as e:
        print(f"  ✗ Error in update process: {str(e)}")
        return None

def update_roster_entry(auth_id: str, user_data: dict, old_user_data: dict):
    """Update existing roster entry"""
    try:
        old_name = old_user_data.get('lastfirstfullname')
        new_name = user_data.get('lastfirstfullname')
        
        if old_name and new_name and old_name != new_name:
            print(f"  ℹ️  Name change detected: {old_name} → {new_name}")
            return update_roster_with_schedule_fix(auth_id, user_data, old_name, new_name)
        else:
            # No name change, simple update
            response = supabase.table('roster').update(user_data).eq('auth_id', auth_id).execute()
            print(f"  ✓ Updated roster: {user_data['email']}")
            return response
            
    except Exception as e:
        print(f"  ✗ Error updating roster {user_data['email']}: {str(e)}")
        return None

def insert_roster_entry(auth_id: str, user_data: dict):
    """Insert new roster entry"""
    try:
        user_data['auth_id'] = auth_id
        response = supabase.table('roster').insert(user_data).execute()
        print(f"  ✓ Inserted roster: {user_data['email']}")
        return response
    except Exception as e:
        print(f"  ✗ Error inserting roster {user_data['email']}: {str(e)}")
        return None

def process_csv_file(csv_path: str, test_mode: bool = False, test_rows: int = 5):
    """Main function to process CSV and upload to Supabase"""
    print("=" * 60)
    print("CSV to Supabase Roster Uploader")
    if test_mode:
        print(f"🧪 TEST MODE - Processing first {test_rows} rows only")
    print("=" * 60)
    
    # Read CSV
    print(f"\n📄 Reading CSV file: {csv_path}")
    df = pd.read_csv(csv_path)
    print(f"   Found {len(df)} records")
    
    # Limit to test rows if in test mode
    if test_mode:
        df = df.head(test_rows)
        print(f"   🧪 Limited to first {test_rows} rows for testing")
    
    # Process each row
    success_count = 0
    update_count = 0
    skip_count = 0
    error_count = 0
    
    for index, row in df.iterrows():
        try:
            # Skip rows with missing email
            if pd.isna(row['Primary Email Address']) or str(row['Primary Email Address']).strip() == '':
                print(f"\n⊘ Skipping row {index + 1}: No email address")
                skip_count += 1
                continue
            
            user_data = process_csv_row(row)
            email = user_data['email']
            
            print(f"\n[{index + 1}/{len(df)}] Processing: {user_data['lastfirstfullname']} ({email})")
            
            # Check if user exists in roster
            existing_user = check_existing_user(email)
            
            if existing_user:
                # User exists - check if update is needed
                needs_update = False
                updates = []
                for key in ['firstname', 'lastname', 'lastfirstfullname', 'phonenumber', 'firstlast']:
                    if user_data.get(key) != existing_user.get(key):
                        needs_update = True
                        updates.append(f"{key}: {existing_user.get(key)} → {user_data.get(key)}")
                
                if needs_update:
                    print(f"  ℹ️  Changes detected: {', '.join(updates)}")
                    update_roster_entry(existing_user['auth_id'], user_data, existing_user)
                    update_count += 1
                else:
                    print(f"  → No changes needed")
                    skip_count += 1
            else:
                # New user - create auth user first
                print(f"  ℹ️  NEW USER detected")
                
                auth_id = get_auth_user_by_email(email)
                
                if not auth_id:
                    auth_id = create_auth_user(email, DEFAULT_PASSWORD)
                else:
                    print(f"  ℹ️  Found existing auth user")
                
                if auth_id:
                    insert_roster_entry(auth_id, user_data)
                    success_count += 1
                else:
                    print(f"  ✗ Could not create/find auth user for {email}")
                    error_count += 1
                
        except Exception as e:
            print(f"✗ Error processing row {index + 1}: {str(e)}")
            error_count += 1
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"Total records processed: {len(df)}")
    print(f"✓ New users created: {success_count}")
    print(f"✓ Existing users updated: {update_count}")
    print(f"⊘ Skipped (no changes): {skip_count}")
    print(f"✗ Errors: {error_count}")
    print("=" * 60)

if __name__ == "__main__":
    # Path to your CSV file
    csv_file_path = "/Users/mikedietrich/Downloads/HorizonWebRef_Directory_2025-09-30_18-27.csv"
    
    # Test mode settings
    TEST_MODE = False  # Set to False to process all rows
    TEST_ROWS = 5     # Number of rows to test with
    
    # Check if file exists
    if not os.path.exists(csv_file_path):
        print(f"Error: CSV file not found at {csv_file_path}")
        print("Please update the csv_file_path variable with the correct path")
    else:
        process_csv_file(csv_file_path, test_mode=TEST_MODE, test_rows=TEST_ROWS)