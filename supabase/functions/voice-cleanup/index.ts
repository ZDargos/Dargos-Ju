// Deletes the audio files of trashed voice recordings (voted down or removed by an admin), so the
// free storage only holds recordings that are in use. Called by the app right after a vote trashes
// a recording, and from the admin page. Safe to call any time: it only touches trashed recordings.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: auth } = await caller.auth.getUser();
    if (!auth.user) return json({ error: 'Not signed in' }, 401);

    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: rows, error } = await admin
      .from('voice_recordings')
      .select('id, storage_path')
      .eq('status', 'trashed')
      .eq('file_deleted', false)
      .limit(200);
    if (error) throw error;
    if (!rows?.length) return json({ deleted: 0 });
    const { error: rmError } = await admin.storage.from('voices').remove(rows.map((r) => r.storage_path));
    if (rmError) throw rmError;
    await admin.from('voice_recordings').update({ file_deleted: true }).in('id', rows.map((r) => r.id));
    return json({ deleted: rows.length });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
