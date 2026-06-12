# Sentinel Integration Plan

## 1. Role

Sentinel observes the BDS website asynchronously.

```text
Edge + Bun + CSSA + Supabase + ForgeCustomer + Intake + Deployment
→ canonical events
→ DataForge
→ Sentinel nodes
→ Sentinel Prime
→ Forge_Command
```

Sentinel never authorizes a live request.

## 2. Evidence producers

### Edge

- request volume
- WAF rule match
- challenge result
- bot class/score
- rate-limit action
- country and ASN
- edge request ID
- origin status
- DDoS summary

### Bun server

- route decision
- Host and edge-token failure
- malformed request
- method denial
- size/time-limit rejection
- same-origin failure
- CSP report
- status and duration
- release version

### CSSA

- decision
- authorization
- outcome
- replay attempt
- reservation lifecycle
- data classification
- signed-control application
- recorder backlog

### Identity/Supabase

- login success/failure
- magic-link request/redemption
- MFA result
- password reset
- session creation/revocation
- device/region novelty

### ForgeCustomer

- checkout
- subscription state
- entitlement decision
- device activation/deactivation
- usage/quota
- suspension/deletion
- Stripe reconciliation result

### Intake

- Turnstile result
- spam classification
- rate-limit result
- submission outcome
- payload size and class

### Deployment/GitHub

- commit
- dependency change
- security-test result
- deployment and rollback
- configuration hash
- WAF/policy change

## 3. Node mapping

| Evidence | Sentinel node |
|---|---|
| WAF, auth, origin, replay | Sentinel-Cloud |
| traffic, cost, quota, retry | Sentinel-Cost |
| classification, CSP, input/output | Sentinel-Data |
| executor, bypass, release behavior | Sentinel-Agent |
| entitlement and devices | Sentinel-License |
| Supabase, ForgeCustomer, intake health | Sentinel-Provider |
| compound patterns | Sentinel Prime |

A separate Sentinel-Web service is not needed initially. Use a BDS website profile across the established nodes.

## 4. Initial features and baselines

- requests per IP/device/account/route
- 401/403/404/429 ratios
- unique paths per client
- login-failure velocity
- magic-link request/redemption ratio
- new device/region
- checkout attempts per account
- idempotency-key reuse
- contact attempts per IP/email hash
- WAF challenge failures
- origin-token failures
- request/response sizes
- upstream latency/failure
- CSSA deny rate
- CSP violation family
- release-to-error change
- dependency/network-surface change
- device deactivation and deletion frequency

## 5. Incident families

### Credential stuffing

Signals:

- many accounts from one client
- many clients against one account
- failure burst
- Turnstile failure
- successful login from a new device after failures

Bounded response:

- challenge
- progressive delay
- require MFA
- revoke one suspicious session
- notify account owner

### Direct-origin bypass

Signals:

- invalid edge token
- unknown Host
- Render-origin requests
- repeated API probing

Bounded response:

- origin rejection
- investigate DNS and edge configuration
- rotate edge token if leakage is suspected

### BFF route probing

Signals:

- `/v1/admin/*`
- method mismatch
- route enumeration
- encoded traversal
- malformed IDs

Bounded response:

- challenge/block exact client
- preserve evidence
- do not impact unrelated customers

### Checkout abuse

Signals:

- rapid checkout creation
- idempotency replay
- new device/region
- payment failure/dispute
- entitlement divergence

Bounded response:

- hold checkout only
- require reauthentication or Turnstile
- preserve noncommercial account functions

### Contact abuse

Signals:

- repeated submissions
- duplicate content
- malicious URL/payload patterns
- Turnstile failure
- unusual email-domain behavior

Bounded response:

- throttle/challenge
- quarantine as plain text
- never automatically execute links or attachments

### Session theft

Signals:

- impossible travel
- concurrent distant sessions
- new device plus sensitive action
- token replay

Bounded response:

- revoke affected session
- require reauthentication/MFA
- do not permanently close the account automatically

### Deployment regression

Signals:

- CSP violation spike
- 5xx increase
- route/allowlist change
- new outbound host
- security-test failure

Bounded response:

- pause deployment
- governed rollback
- Sentinel supplies evidence but never patches code directly

## 6. Compound correlation example

```text
New region/device
+ 18 failed logins
+ successful login
+ checkout creation
+ device deactivation
+ CSSA route anomaly
--------------------------------
Possible account takeover
```

Track independent evidence roots. Do not count transformed copies of one event as separate proof.

## 7. Control path

```text
Sentinel incident
→ policy evaluation
→ Forge_Command approval when required
→ signed control directive
→ CSSA / edge / identity authority
→ action receipt
→ Sentinel monitoring
```

## 8. Initial bounded controls

- require Turnstile for one account/client
- reduce one route limit
- hold checkout for one account
- require reauthentication
- revoke one session
- temporarily block one client fingerprint
- increase logging for 15 minutes
- request governed deployment rollback

Never automate permanent account closure, permanent license revocation, subscription cancellation, customer-data deletion, source-code mutation, or broad geographic blocking without owning-authority review.

## 9. Feedback-loop prevention

A denial caused by a Sentinel-originated control carries:

```text
control_id
incident_id
policy_decision_id
policy_generated_effect=true
```

Sentinel tracks whether enforcement worked separately from whether the original hypothesis was confirmed.
