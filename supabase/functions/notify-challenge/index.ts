// Sends a push notification to the friend you just challenged.
// Called by the challenger's app right after it creates the challenge. Checks that the caller
// really created that challenge, respects the recipient's notification settings, and delivers to
// every device they enabled with Web Push (browsers and the iPhone home-screen app).

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Game names in the recipient's interface language (keep in sync with src/i18n/zh.ts).
const GAME_TITLES: Record<string, { en: string; zh: string }> = {
  'word-order': { en: 'Word order', zh: '词序' },
  'sentence-builder': { en: 'Sentence builder', zh: '造句' },
  'spot-error': { en: 'Spot the error', zh: '找错误' },
  'close-call': { en: 'Close call', zh: '辨一辨' },
  dictation: { en: 'Dictation', zh: '听写' },
  'speed-meaning': { en: 'Speed round', zh: '快速赛' },
  'speed-word': { en: 'Reverse speed round', zh: '反向快速赛' },
  'word-duel': { en: 'Pinyin duel', zh: '拼音对决' },
};
// The duel is a spelling duel for people learning English.
const SPELLING_DUEL = { en: 'Spelling duel', zh: '拼写对决' };

/** The recipient's interface language: their choice, else Chinese when they learn English. */
function uiLang(settings: { uiLang?: string; learning?: string } | null | undefined): 'en' | 'zh' {
  if (settings?.uiLang === 'en' || settings?.uiLang === 'zh') return settings.uiLang;
  return settings?.learning === 'en' ? 'zh' : 'en';
}

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

    const { match_id } = await req.json();
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: match } = await admin.from('matches').select('*').eq('id', match_id).maybeSingle();
    if (!match || match.player_a !== auth.user.id || match.is_public || match.status !== 'waiting' || !match.player_b) {
      return json({ error: 'Not a pending challenge from you' }, 400);
    }
    const recipient = match.player_b as string;

    const { data: prefs } = await admin.from('notification_prefs').select('enabled, challenges').eq('user_id', recipient).maybeSingle();
    if (prefs && (!prefs.enabled || !prefs.challenges)) return json({ sent: 0, reason: 'muted' });

    const [{ data: profile }, { data: subs }, { data: config }, { data: recipientSettings }] = await Promise.all([
      admin.from('profiles').select('display_name').eq('user_id', auth.user.id).maybeSingle(),
      admin.from('push_subscriptions').select('*').eq('user_id', recipient),
      admin.from('server_config').select('key, value'),
      admin.from('user_settings').select('settings').eq('user_id', recipient).maybeSingle(),
    ]);
    const cfg = Object.fromEntries((config ?? []).map((r: { key: string; value: string }) => [r.key, r.value]));
    const lang = uiLang(recipientSettings?.settings);
    const from = profile?.display_name ?? (lang === 'zh' ? '一位好友' : 'A friend');
    const learning = recipientSettings?.settings?.learning === 'en' ? 'en' : 'zh';
    const titles = match.game === 'word-duel' && learning === 'en' ? SPELLING_DUEL : GAME_TITLES[match.game];
    const game = titles?.[lang] ?? (lang === 'zh' ? '一个游戏' : 'a game');
    const message = {
      title: lang === 'zh' ? `${from}向你发起了挑战！` : `${from} challenged you!`,
      body: lang === 'zh' ? `点一下，和${from}玩${game}。` : `Tap to play ${game} against ${from}.`,
      url: `#/challenge/${match.id}`,
      tag: `challenge-${match.id}`,
    };

    webpush.setVapidDetails(cfg.vapid_subject, cfg.vapid_public, cfg.vapid_private);

    let sent = 0;
    const gone: string[] = [];
    await Promise.all(
      (subs ?? []).map(async (s: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), {
            TTL: 120,
            urgency: 'high',
          });
          sent++;
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) gone.push(s.endpoint);
          else console.error('push failed', status, (e as Error).message);
        }
      }),
    );
    if (gone.length) await admin.from('push_subscriptions').delete().in('endpoint', gone);
    return json({ sent, devices: subs?.length ?? 0 });
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
