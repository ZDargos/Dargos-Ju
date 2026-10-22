-- Dargos Ju database schema (already applied to the dargos-ju Supabase project).
-- Private per-user progress, admin-managed shared content, invite-only sign-ups.

create table public.app_admins (
  user_id uuid primary key references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

create table public.invites (
  email text primary key,
  invited_at timestamptz not null default now(),
  invited_by uuid references auth.users on delete set null
);

create table public.card_states (
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  card_key text not null,            -- "<sentence id>|r" or "<sentence id>|p"
  card jsonb not null,               -- ts-fsrs card
  updated_at timestamptz not null,
  primary key (user_id, card_key)
);

create table public.review_logs (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  sentence_id text not null,
  direction text not null check (direction in ('r', 'p')),
  grade smallint not null check (grade between 1 and 3),
  mode text not null,
  reviewed_at timestamptz not null
);
create index review_logs_user_time on public.review_logs (user_id, reviewed_at);

create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create table public.custom_sentences (
  id text primary key,
  level integer not null,
  zh text not null,
  en text not null,
  tokens jsonb not null,
  lex jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users on delete set null
);
create index custom_sentences_level on public.custom_sentences (level);

create table public.segment_overrides (
  sentence_id text primary key,
  tokens jsonb not null,
  lex jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users on delete set null
);

create schema if not exists private;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;

alter table public.app_admins enable row level security;
alter table public.invites enable row level security;
alter table public.card_states enable row level security;
alter table public.review_logs enable row level security;
alter table public.user_settings enable row level security;
alter table public.custom_sentences enable row level security;
alter table public.segment_overrides enable row level security;

create policy "see own admin row" on public.app_admins for select to authenticated using (user_id = (select auth.uid()));
create policy "admins manage invites" on public.invites for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "own cards" on public.card_states for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own logs" on public.review_logs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own settings" on public.user_settings for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "read custom sentences" on public.custom_sentences for select to authenticated using (true);
create policy "admins insert custom sentences" on public.custom_sentences for insert to authenticated with check ((select private.is_admin()));
create policy "admins update custom sentences" on public.custom_sentences for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete custom sentences" on public.custom_sentences for delete to authenticated using ((select private.is_admin()));

create policy "read overrides" on public.segment_overrides for select to authenticated using (true);
create policy "admins insert overrides" on public.segment_overrides for insert to authenticated with check ((select private.is_admin()));
create policy "admins update overrides" on public.segment_overrides for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "admins delete overrides" on public.segment_overrides for delete to authenticated using ((select private.is_admin()));

-- Invite-only sign-ups: the very first account becomes the admin; after that an email must be invited.
create or replace function private.check_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.app_admins) then
    if not exists (select 1 from public.invites where lower(email) = lower(new.email)) then
      raise exception 'INVITE_ONLY: % has not been invited', new.email;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.bootstrap_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.app_admins) then
    insert into public.app_admins (user_id) values (new.id);
  end if;
  return new;
end;
$$;

create trigger check_invite before insert on auth.users for each row execute function private.check_invite();
create trigger bootstrap_admin after insert on auth.users for each row execute function private.bootstrap_admin();

grant usage on schema private to authenticated;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;
revoke all on function private.check_invite() from public, anon, authenticated;
revoke all on function private.bootstrap_admin() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Sign-up mode switch, email blocklist and admin user management (migration admin_user_management).

create table public.app_config (key text primary key, value jsonb not null, updated_at timestamptz not null default now());
insert into public.app_config (key, value) values ('signup_mode', '"invite"');   -- or '"open"'
alter table public.app_config enable row level security;
create policy "read signup mode" on public.app_config for select to anon, authenticated using (key = 'signup_mode');
create policy "admins read config" on public.app_config for select to authenticated using ((select private.is_admin()));
create policy "admins update config" on public.app_config for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create table public.blocked_emails (email text primary key, blocked_at timestamptz not null default now(), blocked_by uuid references auth.users on delete set null);
alter table public.blocked_emails enable row level security;
create policy "admins manage blocklist" on public.blocked_emails for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- check_invite() now: blocked emails are always refused; the first account is allowed (becomes admin);
-- signup_mode 'open' allows anyone; otherwise the email must be on the invite list.
-- Admin RPCs (security definer, each checks private.is_admin()): admin_list_users(),
-- admin_erase_user_data(target), admin_set_blocked(target, block), admin_delete_user(target, also_block).
-- Full definitions are in the Supabase migration history.

-- ---------------------------------------------------------------------------------------------
-- Social features (migrations social_and_matches, challenges_friends_only, find_match_older_than).
-- profiles(user_id, display_name): display names are readable by every signed-in user; nothing else is.
-- friendships(requester, addressee, status pending|accepted): only the two people involved can see a row;
--   only the addressee can accept.
-- friend_leaderboard(period, tz) and friend_summary(target, tz): security definer; return data only for
--   yourself and accepted friends. Raw review logs and cards stay private (RLS: own rows only).
-- matches: live head-to-head games. Public matches are joined via find_match(game, older_than);
--   challenges (player_b set) require an accepted friendship. Results go through submit_match_result.
--   Players can only see their own matches. matches and friendships are in the supabase_realtime publication.

-- ---------------------------------------------------------------------------------------------
-- Push notifications (migration push_notifications).
-- push_subscriptions(endpoint, user_id, p256dh, auth, platform): one row per device; own rows only.
-- notification_prefs(user_id, enabled, challenges): master switch plus one boolean column per type.
-- server_config(key, value): VAPID keys; RLS with no policies, readable only by the service role.
-- Edge Function supabase/functions/notify-challenge sends the challenge notification.

-- ---------------------------------------------------------------------------------------------
-- Game stats (migration game_rounds): game_rounds(id, user_id, game, mode solo|vs, correct, ms,
-- match_id, played_at, synced_at), own rows only. Vs results come from the matches table.

-- matches.progress_a/b and live_a/b track live progress; report_match_progress() and
-- submit_match_result() end a match early once the leader has finished and the other player
-- can no longer catch up (migration match_early_finish).

-- ---------------------------------------------------------------------------------------------
-- English-learning mode (migrations learning_language, custom_sentences_english, cross_mode_matches).
-- review_logs.lang and game_rounds.lang: 'zh' (learning Chinese, the default) or 'en' (learning
--   English). card_states keys are "sid|dir" for Chinese and "en:sid|dir" for English.
-- custom_sentences.en_clean (playable English) and en_lex (word -> {py: IPA, en: Chinese gloss}).
-- matches.lang_a / lang_b: the language each player answers in. find_match(game, older_than, my_lang)
--   and accept_match(match_id, my_lang) record it; players on different modes can play each other.
-- friend_leaderboard / friend_summary count answers in both languages together.
-- notify-challenge writes the notification in the recipient's interface language.
