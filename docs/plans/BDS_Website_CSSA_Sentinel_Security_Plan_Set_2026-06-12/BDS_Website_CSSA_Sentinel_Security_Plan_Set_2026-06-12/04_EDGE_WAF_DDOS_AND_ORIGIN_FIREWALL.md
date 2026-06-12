# Edge WAF, DDoS, Bot, and Origin Firewall

## 1. Recommended front door

Use Cloudflare or an equivalent managed reverse proxy in front of Render.

Required capabilities:

- Anycast DDoS protection
- managed WAF
- custom firewall rules
- route-specific rate limiting
- bot challenge
- Turnstile or equivalent proof
- DNSSEC
- security-event export
- custom origin headers

## 2. Prevent direct-origin bypass

1. Attach only approved production domains to Render.
2. Disable the default `onrender.com` subdomain after validation.
3. Validate the exact `Host` header in Bun.
4. Have the edge inject a rotating `X-BDS-Edge-Token`.
5. Reject production requests without the valid token, except a narrowly scoped health-probe path if Render requires it.
6. Compare token values in constant time.
7. Support current and next secrets during rotation.
8. Never expose the token to browser JavaScript, HTML, logs, or errors.

### Environment

```text
BDS_ENV=production
BDS_ALLOWED_HOSTS=boswelldigitalsolutions.com,www.boswelldigitalsolutions.com
BDS_REQUIRE_EDGE_TOKEN=true
BDS_EDGE_TOKEN_CURRENT=<secret>
BDS_EDGE_TOKEN_NEXT=<optional-overlap-secret>
```

## 3. DNS and transport

- Enable DNSSEC.
- Add CAA records for intended certificate authorities.
- Redirect HTTP to HTTPS at the edge.
- Require TLS 1.2 minimum and prefer TLS 1.3.
- Stage HSTS, then progress to:

```text
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

- Monitor certificate transparency for unexpected issuance.

## 4. Edge firewall rules

### Scanner and secret paths

Block or managed-challenge common probes:

```text
/.git
/.env
/.aws
/.ssh
/wp-admin
/wp-login.php
/xmlrpc.php
/phpmyadmin
/server-status
/vendor/phpunit
/cgi-bin
```

The origin must independently reject them.

### Methods by surface

| Path | Allowed methods |
|---|---|
| Static pages/assets | GET, HEAD |
| `/api/public-config` | GET |
| Public catalog | GET |
| Provision/checkout/deactivate/deletion | POST |
| Intake | POST |
| Health | GET, HEAD |

Block TRACE, CONNECT, and unneeded WebDAV methods globally.

### Suspicious automation

Managed challenge when:

- bot/scanner confidence is poor
- user agent is empty or malformed
- rapid route enumeration occurs
- repeated 401/403/404 responses occur
- a risky ASN/country combines with authentication abuse

Do not trust or block solely on a claimed user-agent string.

### JSON expectations

For JSON POST requests:

- Require `application/json`.
- Reject edge-level oversize bodies.
- Reject missing Host.
- Reject path traversal encodings.
- Reject ambiguous framing where supported.

## 5. Initial rate limits

Starting values require tuning with shadow evidence.

| Surface | Initial limit | Key |
|---|---:|---|
| Static pages | 120/min | IP |
| Static assets | 600/min | IP |
| Public config | 30/min | IP |
| Public catalog | 60/min | IP |
| Account reads | 120/5 min | account + IP |
| Provision | 5/10 min | account + IP |
| Checkout | 5/10 min | account + IP |
| Installation deactivate | 10/hour | account |
| Deletion request/cancel | 5/day | account |
| Contact intake | 5/hour | IP + email hash |
| Login | 10/10 min | IP + email hash |
| Magic link | 3/hour | IP + email hash |

Challenge before block for uncertain automation. Hard-block protocol abuse, replay, and known bypass attempts.

## 6. Turnstile placement

Required for:

- contact submission
- repeated sign-up/sign-in failures
- magic-link requests
- password recovery
- checkout after a risk threshold
- any anonymous write endpoint

Every token is verified server-side. A client widget alone grants no authority.

## 7. Rule governance

- Store custom rule definitions in version control.
- Give each rule an ID, purpose, owner, mode, expiry, and rollback.
- Deploy uncertain rules in log/challenge before block.
- Export edge events into DataForge/Sentinel.
- Sentinel cannot directly edit WAF policy.
- Sentinel may request a signed, scoped, expiring edge control.

## 8. Edge action classes

| Class | Example |
|---|---|
| Observe | Log a scanner pattern |
| Challenge | Challenge one client fingerprint |
| Throttle | Reduce one route/client rate |
| Temporary block | Block one client for 15 minutes |
| Route hold | Temporarily suspend checkout |
| Permanent rule | Security-owner review and replay required |
