# Forge_Command — HUD Support Operator Inbox (handoff brief)

> **For:** a new Claude Code session working in the **Forge_Command** repository.
> **Goal:** build the operator side of the BDS website support chat — read
> visitor conversation threads and reply to them — so visitors get real answers.
> This brief is self-contained; you do not need the originating conversation.

---

## 1. Background — what already exists

The marketing site **bds_website** has a support HUD (a chat widget, bottom-right).
A **signed-in visitor** can open it and send messages. Those messages persist in
**Supabase** and are scoped per-user by row-level security. This is live and
working today (call it "Tier 2 phase 2a").

What's **missing** is the operator side: there is currently **no way for BDS to
read a visitor's thread or reply**. Operator replies today only happen by hand in
the Supabase SQL editor. **That is what you are building in Forge_Command.**

Architecture (already decided, do not change):
- The **visitor side** (bds_website) talks to Supabase with the **anon key + the
  visitor's JWT**, so RLS limits them to their own thread. It never holds the
  service-role key.
- The **operator side** (Forge_Command — you) uses the **service-role key**,
  which bypasses RLS, to see every thread and to write `operator` replies.
- Visitors see operator replies because the widget re-reads the thread every
  ~20s (polling). You do not need to push anything to the website; just write
  the reply row into Supabase and it appears.

```
 Visitor (browser)                Operator (Forge_Command)
        │                                  │
   anon key + user JWT              service-role key
        │                                  │
        ▼                                  ▼
            ┌─────────────────────────────┐
            │  Supabase (the ForgeCustomer │
            │  project — see §2)           │
            │  tables: hud_thread,         │
            │          hud_message         │
            └─────────────────────────────┘
```

---

## 2. Which Supabase project / how to connect

There is **one** Supabase project in play and it is the **ForgeCustomer Supabase
project** — the same one that provides the website's login (`auth.users`). The
support tables live there alongside auth. Project ref: **`sffgcltrwewnjzvrzjak`**
(base URL `https://sffgcltrwewnjzvrzjak.supabase.co`). Confirm against the live
value, don't hardcode blindly.

You will need these secrets in Forge_Command's environment (NOT in bds_website):
- `SUPABASE_URL` = `https://sffgcltrwewnjzvrzjak.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = the **service_role** key
  (Supabase → Project Settings → API → `service_role`). **Server-side only.**
  Never ship it to any browser or to bds_website.

You can reach the data two ways — pick what fits Forge_Command's stack:
- **PostgREST/REST**: `${SUPABASE_URL}/rest/v1/...` with headers
  `apikey: <service_role>` and `Authorization: Bearer <service_role>`.
- **Direct Postgres**: the connection string from
  Supabase → Project Settings → Database (service-role equivalent). Good if
  Forge_Command already has a DB layer.

---

## 3. Data model (already deployed — do not recreate)

These objects already exist in the Supabase project. You read/write them; you do
**not** need to run the migration (it's owned by bds_website).

```sql
-- Conversation, one per visitor (the latest non-closed one is "current").
hud_thread (
  id         uuid pk,
  owner_uid  uuid -> auth.users(id),   -- the visitor
  status     text check in ('open','answered','closed') default 'open',
  created_at timestamptz,
  last_at    timestamptz               -- bumped on each new message
)

-- Messages within a thread.
hud_message (
  id         uuid pk,
  thread_id  uuid -> hud_thread(id),
  author     text check in ('visitor','operator'),
  body       text (1..5000 chars),
  created_at timestamptz
)
```

RLS is **on**. Visitors can only see/insert their own `visitor` rows. The
**service role bypasses RLS**, so as the operator you can read all threads and
insert `operator` rows directly. (`SECURITY INVOKER` RPCs `hud_current_thread()`
and `hud_post_message(text)` exist for the visitor side — you don't need them.)

---

## 4. What to build (operator inbox)

A small authenticated operator UI/service inside Forge_Command:

1. **Thread list** — all threads, newest activity first. Show: visitor email (see
   §6), status, last message preview, last_at, unread indicator.
2. **Thread view** — open a thread, show all `hud_message` rows in order
   (visitor vs operator styling), newest at bottom.
3. **Reply** — insert an `operator` message into the thread, then bump the thread:
   ```sql
   insert into public.hud_message (thread_id, author, body)
   values ($thread_id, 'operator', $body);
   update public.hud_thread
     set last_at = now(), status = 'answered'
     where id = $thread_id;
   ```
   The visitor's widget polls every ~20s and the reply appears as a left-side
   "BDS" bubble. (No website call needed.)
4. **Status controls** — mark a thread `answered` / `closed` / reopen to `open`.
5. **New-message awareness** — operators need to know when a visitor writes. Pick
   one (in order of effort):
   - Poll `hud_thread` ordered by `last_at` every N seconds; flag rows where the
     newest message is `author='visitor'` and newer than the newest `operator`.
   - **Supabase Realtime**: subscribe to inserts on `public.hud_message` (service
     role) and surface a notification.
   - **Database webhook / Edge Function** on insert → notify Forge_Command.

---

## 5. Security requirements (non-negotiable)

- The **service-role key lives only in Forge_Command's server-side environment**.
  Never expose it to a browser, never put it in bds_website, never log it.
- The operator UI must sit behind **Forge_Command's existing operator auth**
  (this is the privileged control surface — treat thread contents as customer
  data, R2/R3).
- Only ever write `author='operator'` rows. Never write `visitor` rows on a
  visitor's behalf.
- Validate reply bodies the same way the visitor side does: non-empty, ≤5000
  chars, reject control characters except tab/newline/CR.
- Audit: log who replied to which thread (operator identity + timestamp), since
  the service role is unattributed at the DB level.

---

## 6. Showing who the visitor is

`hud_thread.owner_uid` is the Supabase `auth.users.id`. With the service role you
can join `auth.users` to display the visitor's email/identity:
```sql
select t.id, t.status, t.last_at, u.email
from public.hud_thread t
join auth.users u on u.id = t.owner_uid
order by t.last_at desc;
```
(Anonymous visitors are **not** in scope yet — see §8.)

---

## 7. Acceptance test (end-to-end with the live site)

1. On the live website, sign in and send a message via the HUD chat.
2. In the Forge_Command operator inbox, that thread appears with the visitor's
   email and the new message.
3. Reply from the operator inbox.
4. Back on the website, within ~20s the reply appears in the chat as a "BDS"
   bubble. ✅

---

## 8. Out of scope (tracked elsewhere, do not build here)

- **Anonymous visitor threads** (logged-out users) — future bds_website phase
  (2b). For now only signed-in visitors have threads.
- **Realtime on the visitor side** (replacing the 20s poll) — bds_website phase
  2c.
- Changing the visitor-side schema/RLS — owned by bds_website. If you need a new
  column/index, coordinate; don't weaken RLS.

---

## 9. Reference — visitor side (in the bds_website repo, for context only)

- `db/migrations/0001_hud_threads.sql` — the schema + RLS + RPCs above.
- `server/hud.ts` — visitor BFF: `GET /api/hud/thread`, `POST /api/hud/messages`
  (forwards the visitor JWT to the RPCs).
- `src/js/hud-thread.js` — the widget thread UI; polls `/api/hud/thread` every
  20s and renders `visitor`/`operator` bubbles.
- `docs/plans/hud-tier-2-conversation-threads.md` — the overall Tier 2 plan
  (phases 2a–2d). This operator inbox is **phase 2d**.

---

### First steps for the new session
1. Confirm Forge_Command's stack and where a new authenticated operator view/route belongs.
2. Add `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` to its server-side env.
3. Build the read path (thread list + thread view joining `auth.users` for email).
4. Build the reply path (insert `operator` message + bump thread).
5. Run the §7 acceptance test against the live site.
6. Add new-message awareness (§4.5), starting with polling.
