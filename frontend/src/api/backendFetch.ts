import { supabase } from '../lib/supabaseClient';

/** Call the Express API with the current, refreshable Supabase access token. */
export async function backendFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error('Please sign in again before using this feature.');
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  return fetch(url, { ...options, headers });
}
