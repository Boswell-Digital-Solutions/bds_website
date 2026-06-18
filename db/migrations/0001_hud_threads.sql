-- HUD Tier 2 — support conversation threads (phase 2a: authenticated users).
--
-- ===========================================================================
-- WHICH DATABASE DOES THIS GO IN?
-- ---------------------------------------------------------------------------
-- The bds_website LOGIN Supabase project — the one whose URL is in SUPABASE_URL
-- on the bds-website Render service, and where Authentication -> Users lists the
-- site's accounts. This is REQUIRED: the objects below use auth.uid() and
-- reference auth.users, which only exist in the project that owns the site's
-- auth users.
--
--   NOT ForgeCustomer's database — that holds commercial/billing truth and the
--   website only reaches it through the /api/forge/* proxy, never directly.
--   NOT DataForge — unrelated service.
--
-- Forge_Command later connects to THIS SAME project with the service role to
-- write operator replies. All support-chat data lives in this one auth project.
-- ===========================================================================
--
-- Apply in the Supabase SQL editor or via `supabase db push`. Row-level
-- security scopes every row to its owner. Operator replies are written by
-- Forge_Command using the service role, which bypasses RLS — the website never
-- holds that key. The website only ever calls the SECURITY INVOKER RPCs below
-- with the signed-in user's JWT, so auth.uid() is the authenticated visitor.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.hud_thread (
  id         uuid primary key default gen_random_uuid(),
  owner_uid  uuid not null references auth.users (id) on delete cascade,
  status     text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  last_at    timestamptz not null default now()
);

create index if not exists hud_thread_owner_idx on public.hud_thread (owner_uid, status);

create table if not exists public.hud_message (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.hud_thread (id) on delete cascade,
  author     text not null check (author in ('visitor', 'operator')),
  body       text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists hud_message_thread_idx on public.hud_message (thread_id, created_at);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.hud_thread enable row level security;
alter table public.hud_message enable row level security;

-- A visitor may read, create, and touch only their own threads.
create policy hud_thread_select_own on public.hud_thread
  for select using (owner_uid = auth.uid());
create policy hud_thread_insert_own on public.hud_thread
  for insert with check (owner_uid = auth.uid());
create policy hud_thread_update_own on public.hud_thread
  for update using (owner_uid = auth.uid()) with check (owner_uid = auth.uid());

-- A visitor may read messages in their own threads, and insert only their own
-- 'visitor' messages. 'operator' rows are insert-only via the service role.
create policy hud_message_select_own on public.hud_message
  for select using (
    exists (select 1 from public.hud_thread t where t.id = thread_id and t.owner_uid = auth.uid())
  );
create policy hud_message_insert_own on public.hud_message
  for insert with check (
    author = 'visitor'
    and exists (select 1 from public.hud_thread t where t.id = thread_id and t.owner_uid = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- RPCs (SECURITY INVOKER — RLS applies as the calling user)
-- ---------------------------------------------------------------------------

-- Return the caller's current (non-closed) thread plus its messages as one
-- JSON document, or {thread:null, messages:[]} when none exists yet.
create or replace function public.hud_current_thread()
returns jsonb
language plpgsql
security invoker
stable
as $$
declare
  v_thread public.hud_thread;
  v_msgs   jsonb;
begin
  select * into v_thread
    from public.hud_thread
    where owner_uid = auth.uid() and status <> 'closed'
    order by last_at desc
    limit 1;

  if v_thread.id is null then
    return jsonb_build_object('thread', null, 'messages', '[]'::jsonb);
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', m.id, 'author', m.author, 'body', m.body, 'created_at', m.created_at
             ) order by m.created_at
           ),
           '[]'::jsonb
         )
    into v_msgs
    from public.hud_message m
    where m.thread_id = v_thread.id;

  return jsonb_build_object(
    'thread', jsonb_build_object('id', v_thread.id, 'status', v_thread.status, 'last_at', v_thread.last_at),
    'messages', v_msgs
  );
end;
$$;

-- Append a visitor message, creating the thread on first use. Returns the
-- updated thread document (same shape as hud_current_thread).
create or replace function public.hud_post_message(p_body text)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_uid    uuid := auth.uid();
  v_thread uuid;
  v_body   text := btrim(p_body);
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if char_length(v_body) < 1 or char_length(v_body) > 5000 then
    raise exception 'invalid message length' using errcode = '22023';
  end if;

  select id into v_thread
    from public.hud_thread
    where owner_uid = v_uid and status <> 'closed'
    order by last_at desc
    limit 1;

  if v_thread is null then
    insert into public.hud_thread (owner_uid) values (v_uid) returning id into v_thread;
  end if;

  insert into public.hud_message (thread_id, author, body) values (v_thread, 'visitor', v_body);
  update public.hud_thread set last_at = now(), status = 'open' where id = v_thread;

  return public.hud_current_thread();
end;
$$;

grant execute on function public.hud_current_thread() to authenticated;
grant execute on function public.hud_post_message(text) to authenticated;
