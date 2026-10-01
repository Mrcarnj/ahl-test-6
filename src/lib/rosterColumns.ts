import { supabase } from './supabase';

// Every roster column an official may read. `ical_url` is deliberately absent:
// it is a personal feed link, and once sql/2026-10-01_hide_ical_url.sql runs
// the database refuses to return it -- so select('*') on roster fails too.
// Read your own feed link with fetchMyIcalUrl() instead.
export const ROSTER_COLUMNS =
  'id, email, firstname, lastname, lastfirstfullname, photo, phonenumber, ' +
  '"isAdmin", changedpassword, auth_id, "ahlAdmin", accepted_tos, ' +
  'tos_accepted_at, alt_name, ical_entered, firstlast, updated_at';

export async function fetchMyIcalUrl(): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_my_ical_url');
  if (error) throw error;
  return (data as string | null) ?? null;
}
