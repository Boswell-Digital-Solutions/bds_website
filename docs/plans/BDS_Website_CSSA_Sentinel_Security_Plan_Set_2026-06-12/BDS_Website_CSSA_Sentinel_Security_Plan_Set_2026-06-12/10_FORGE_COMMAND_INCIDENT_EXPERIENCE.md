# Forge_Command BDS Website Incident Experience

## 1. Goal

Forge_Command displays one coherent case even when evidence comes from the edge, Render, Bun, CSSA, Supabase, ForgeCustomer, and Sentinel.

## 2. Active list

| Column | Example |
|---|---|
| Priority | High |
| Incident | Possible account takeover followed by checkout |
| Surface | BDS Website / customer account |
| Source | Edge + Identity + CSSA |
| Recommendation | Hold checkout, revoke one session, require MFA |
| Authority | Identity + CSSA + Operator |
| Age | 8 minutes |
| State | Review required |

## 3. Detail view

### Header

```text
Incident #BDS-443
Possible account takeover

Likelihood: 84%
Impact: 78%
Confidence: 81%
Evidence quality: 95%
Status: Review Required
```

### Evidence groups

#### Original behavior

- login failure burst
- new device/region
- successful session
- checkout initiation
- device deactivation

#### Edge decisions

- challenge results
- rate-limit actions
- WAF matches

#### CSSA decisions

- route authorization
- data classification
- idempotency
- reservation
- outcome

#### Sentinel interpretation

- baseline deviation
- evidence independence
- conflicts
- uncertainties

#### Proposed actions

- revoke session `...91af`
- hold checkout for 15 minutes
- require MFA/reauthentication
- notify account owner

## 4. Action cards

Every action card shows:

- exact target
- exact scope
- owning authority
- approval level
- duration
- reversibility
- expected effect
- action risk
- rollback
- policy version
- control ID after approval

There is no “Block Everything” or “Fix All” button.

## 5. Website security dashboard

Display:

- edge health
- origin-token failures
- WAF actions
- request rates
- auth failures
- CSSA decision rates
- recorder/outbox backlog
- upstream health
- CSP violations
- current release
- security-policy version
- Sentinel coverage

Service health and security risk are separate statuses.

## 6. Completed stub

```text
RESOLVED · BDS-443

Actions:
- Revoked one session
- Held checkout for 15 minutes
- Required MFA

Outcome:
No further unauthorized activity during 24-hour monitoring.

Receipts:
edge_rcpt_...
cssa_rcpt_...
identity_rcpt_...

Resolved by:
Operator + Identity + CSSA
```

## 7. Roles

```text
bds_security_viewer
bds_security_operator
bds_policy_admin
bds_identity_admin
bds_commerce_admin
bds_auditor
```

No role silently changes policy, signs a broad control, and executes a permanent business action.
