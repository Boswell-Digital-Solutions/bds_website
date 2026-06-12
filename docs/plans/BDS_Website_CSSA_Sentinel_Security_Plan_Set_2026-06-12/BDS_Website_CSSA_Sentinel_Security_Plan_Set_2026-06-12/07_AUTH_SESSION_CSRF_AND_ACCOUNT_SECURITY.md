# Authentication, Session, CSRF, and Account Security

## 1. Current risk

The current Supabase browser client persists sessions in JavaScript-accessible storage. A successful XSS can therefore become account takeover. The third-party ESM import also expands the script supply chain.

## 2. Immediate containment

Before session redesign:

- Self-host the Supabase bundle.
- Enforce strict CSP.
- Remove inline scripts.
- Use short access-token lifetime and refresh-token rotation.
- Enable MFA/passkeys where supported.
- Add Turnstile/CAPTCHA to sign-up, repeated sign-in, magic link, and recovery.
- Restrict redirect URLs exactly.
- Keep `next` same-origin and root-relative.
- Use generic authentication errors to reduce account enumeration.

## 3. Target server-managed session

### Cookie

```text
Set-Cookie:
__Host-bds-session=<opaque-random-id>;
Path=/;
Secure;
HttpOnly;
SameSite=Lax;
Max-Age=<bounded>;
Priority=High
```

Use Lax for email/OAuth callback compatibility unless tests prove Strict works.

### Session record

- Opaque random ID.
- Encrypted server-side session record or dedicated store.
- Session ID rotation at login, reauthentication, and privilege change.
- Idle and absolute expiry.
- Device/session inventory.
- Immediate revocation.
- No access or refresh token in browser-readable storage.

The BFF refreshes and forwards Supabase access tokens server-side only.

## 4. Auth endpoints

```text
GET  /auth/session
POST /auth/sign-in
POST /auth/sign-up
POST /auth/magic-link
GET  /auth/callback
POST /auth/refresh
POST /auth/sign-out
POST /auth/reauth
POST /auth/mfa/challenge
POST /auth/mfa/verify
```

All writes use CSSA and route-specific abuse controls.

## 5. CSRF

After cookie migration:

- SameSite cookie.
- Exact Origin for state-changing requests.
- Cryptographically random CSRF token bound to session.
- Custom request header.
- Rotation with session.
- Reject mismatch before processing body.
- Never mutate on GET.

## 6. Step-up authentication

Require recent authentication for:

- checkout when risk is elevated
- installation/device deactivation
- deletion request
- deletion cancellation near deadline
- email/password change
- MFA/passkey change
- session revocation
- sensitive support operations

Use a 5–15 minute recent-auth window by action.

## 7. Credential-abuse controls

- Per-IP, per-account, and per-device limits.
- Progressive delay.
- Generic login error.
- Turnstile after threshold.
- Breached-password protection where supported.
- Alert on new device/region plus sensitive action.
- Notify users of major account changes.
- Session/device management.
- Revoke all sessions after confirmed compromise or password reset.

## 8. Magic-link rules

- One-time use.
- Short TTL.
- Exact redirect allowlist.
- IP and normalized-email-hash rate limits.
- No account-existence disclosure.
- Request and redemption recorded separately.
- High-risk redemption can require additional verification.

## 9. JWT validation

Verify:

- issuer
- audience
- signature
- expiration
- not-before
- algorithm allowlist
- subject
- session ID when available
- revocation/security state
- account scope

Never trust decoded claims before cryptographic verification.
