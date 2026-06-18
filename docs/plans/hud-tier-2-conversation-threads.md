# HUD Tier 2 — Persistent Two-Way Conversation Threads

**Status:** Plan (not started)
**Depends on:** Tier 1 support HUD (merged) — `src/js/hud.js`, `server/intake.ts`
**Primary operator surface:** Forge_Command (operator replies live there, not on the marketing site)

---

## 1. Goal

Tier 1 is a one-way "send us a message" composer: a visitor posts to the intake
lane and gets a local session receipt. Tier 2 makes the Messages tab a real
**two-way thread** — the visitor sees BDS's replies and the running history,
the way Render's (Intercom) widget does.

Non-goals: live agent presence/typing indicators, file attachments, multi-agent
routing. Those are later increments.

## 2. The core decision — where threads live

A two-way thread needs a durable store plus an operator reply path. Two
candidates already exist in the stack:

| Option | Fit | Cost |
| --- | --- | --- |
| **Supabase** (recommended) | Already the website's identity provider (`/api/public-config`, login). RLS gives per-user row isolation. Realtime channel for replies. | New tables + RLS policies + a service-role reply path |
| ForgeCustomer | Owns commercial truth; overkill for support chat and widens that surface | Heavier; couples support to billing |

**Recommendation: Supabase** for thread storage, with operator replies written
**only from Forge_Command** (service-role), never from the marketing server.
This keeps the doctrine intact: the website reads/writes a visitor's *own*
thread; Forge_Command is the operator authority.

## 3. Identity model

- **Logged-in customers** — thread keyed to their Supabase `auth.uid()`; RLS
  scopes reads/writes to the owner. Full history across devices/sessions.
- **Anonymous visitors** — a signed, HttpOnly `hud_thread` cookie carries an
  opaque thread id (random UUID, server-minted). The visitor sees only that
  thread. On later login, offer to claim/merge the anonymous thread into the
  account. Anonymous threads expire (e.g. 30 days).

## 4. Data model (Supabase)

```
hud_thread
  id            uuid pk
  owner_uid     uuid null            -- auth.uid() when logged in
  anon_key_hash text null            -- sha256 of the anonymous cookie secret
  email         text null            -- captured on first message
  status        text  default 'open' -- open | answered | closed
  created_at    timestamptz
  last_at       timestamptz

hud_message
  id          uuid pk
  thread_id   uuid fk -> hud_thread
  author      text                   -- 'visitor' | 'operator'
  body        text                   -- bounded length, server-validated
  created_at  timestamptz
```

RLS: a row is readable/insertable by the visitor only when
`owner_uid = auth.uid()` **or** the request proves the anonymous thread secret.
`author = 'operator'` rows are insert-only by the service role (Forge_Command).

## 5. Server surface (website BFF)

New governed routes in a `server/hud.ts`, modeled on `server/forge.ts`
(allowlist, same-origin, idempotency, `governedFetchText`/Supabase REST):

- `POST /api/hud/threads/messages` — append a visitor message. Reuses the
  existing intake validation, then persists to Supabase and (optionally) still
  notifies the intake lane so operators get paged.
- `GET  /api/hud/threads/current` — return the caller's thread + messages
  (scoped by `auth.uid()` or the anonymous cookie). `Cache-Control: no-store`.
- Anonymous thread id is minted server-side and set as a signed HttpOnly
  cookie; never trust a client-supplied thread id.

Fail-closed: if Supabase isn't configured → `503 INTEGRATION_UNCONFIGURED`, and
the HUD falls back to Tier 1 behavior (composer + local receipts).

## 6. Reply delivery (visitor side)

Start with **polling** (`GET …/current` every ~20s while the Messages tab is
open) — simplest, no new infra. Upgrade to **Supabase Realtime** (subscribe to
`hud_message` inserts for the thread) once the basics are proven. The client
already has the Supabase anon key via `/api/public-config`.

## 7. Operator reply path (Forge_Command)

Out of scope for this repo. Forge_Command:
- lists open `hud_thread`s, reads messages,
- writes `author = 'operator'` rows with the service-role key,
- flips `status` to `answered` / `closed`.

The marketing site never holds the service-role key and never renders the
operator inbox — consistent with `docs/.../02_SECURITY_DOCTRINE_AND_AUTHORITY.md`.

## 8. Client changes (`src/js/hud.js`)

- Replace the session-only receipts list with a rendered **thread** (visitor +
  operator bubbles, chronological).
- On open of Messages: `GET …/current`, render history, start the poll.
- Keep the composer; on send, optimistic-append then reconcile with the server
  response.
- Degrade to Tier 1 if `…/current` returns 503/unconfigured.

## 9. Security checklist

- Service-role key never reaches the browser or the website server (verified by
  `tools/qc/no-side-door.ts`).
- RLS enforces per-thread isolation; anonymous secret is hashed at rest.
- Bounded message length/rate; idempotency on sends; same-origin required.
- Signed HttpOnly + `SameSite=Lax` cookie for the anonymous thread id.
- `Cache-Control: no-store` on all thread responses.

## 10. Phasing

1. **2a — storage + read/write, polling, logged-in only.** Tables, RLS,
   `server/hud.ts`, thread rendering. Forge_Command reply path stubbed.
2. **2b — anonymous threads** via signed cookie + claim-on-login.
3. **2c — Supabase Realtime** replacing the poll.
4. **2d — Forge_Command operator inbox** (separate repo) closes the loop.

## 11. Open questions

- Operator notification: keep firing the existing intake lane on every visitor
  message, or have Forge_Command poll Supabase directly?
- Retention window for anonymous threads (default proposed: 30 days).
- Do we want email notification to the visitor when an operator replies?
