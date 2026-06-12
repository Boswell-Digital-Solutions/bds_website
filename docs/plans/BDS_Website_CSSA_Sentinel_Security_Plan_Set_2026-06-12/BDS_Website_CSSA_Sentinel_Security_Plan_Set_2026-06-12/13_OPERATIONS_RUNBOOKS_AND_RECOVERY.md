# Operations, Runbooks, and Recovery

## 1. Operational telemetry

Monitor:

- edge request/challenge/block rates
- origin-token and Host failures
- Bun 4xx/5xx
- request-limit failures
- upstream latency/errors
- CSSA allow/deny/record latency
- recorder/outbox backlog
- authentication failures and new devices
- checkout attempts
- contact abuse
- CSP violations
- current release/security-policy version
- Sentinel coverage and incident lag

## 2. DDoS or bot flood

1. Verify edge is receiving the attack.
2. Identify target routes and client characteristics.
3. Increase challenge/rate controls at the smallest scope.
4. Keep informational pages available where possible.
5. Protect auth, checkout, and intake separately.
6. Confirm origin resource pressure.
7. Record control receipts.
8. Release gradually with hysteresis.
9. Review false positives.

## 3. Direct-origin attack

1. Confirm edge-token or Host failures.
2. Verify the Render subdomain is disabled.
3. Verify DNS does not expose origin.
4. Rotate the edge token if leakage is possible.
5. Block exact paths/clients at origin.
6. Check whether any bypass succeeded.
7. Re-run origin-bypass tests.

## 4. Credential stuffing

1. Confirm the failure pattern and evidence quality.
2. Challenge exact clients/accounts.
3. Require MFA/reauthentication for affected accounts.
4. Revoke suspicious successful sessions.
5. Notify the account owner when appropriate.
6. Review checkout, device, and deletion activity.
7. Avoid permanent account penalty without confirmation.

## 5. Session theft

1. Identify the exact session/device/region.
2. Revoke that session.
3. Require reauthentication and MFA.
4. Inspect sensitive actions.
5. Rotate session identifiers.
6. Preserve evidence without storing the token.
7. Restore verified access.

## 6. Checkout abuse

1. Hold checkout for the exact account.
2. Preserve noncommercial account access.
3. Inspect idempotency, device, region, and payment outcome.
4. Reauthenticate the customer.
5. Reconcile ForgeCustomer and Stripe.
6. Release gradually.
7. Never cancel a subscription from anomaly alone.

## 7. Contact abuse

1. Increase Turnstile/rate controls.
2. Quarantine suspicious text.
3. Do not follow links or open attachments automatically.
4. Block exact fingerprints.
5. Preserve pseudonymized identifiers and evidence.
6. Release legitimate submissions after review.

## 8. CSSA recorder failure

1. Mark evidence coverage degraded.
2. Activate durable outbox.
3. Block strict actions if durable authorization cannot be recorded.
4. Keep static pages available.
5. Repair storage.
6. Reconcile sequence and hashes.
7. Verify no duplicate side effects.
8. Clear degraded state with a receipt.

## 9. ForgeCustomer outage

1. Open a provider-health incident.
2. Stop retry amplification.
3. Return bounded 502/503 with correlation ID.
4. Keep public static pages available.
5. Pause checkout when state is uncertain.
6. Reconcile after recovery.
7. Verify no duplicated checkout or deletion.

## 10. CSP violation spike

1. Correlate with release and page.
2. Separate legitimate resource change from injection.
3. Contain session/release risk if injection is suspected.
4. Roll back through governed deployment.
5. Do not weaken CSP globally as a quick fix.
6. Add a regression test.

## 11. Compromised dependency

1. Freeze deployment.
2. Identify affected version and artifacts.
3. Remove exposure.
4. Rotate secrets if execution could access them.
5. Rebuild from known-good lock and provenance.
6. Verify SBOM and hashes.
7. Monitor Sentinel evidence.
8. Communicate when required.

## 12. Sentinel false positive

1. Preserve the original finding and action.
2. Separate policy-generated effects.
3. Roll back the bounded control.
4. Identify the feature/baseline/change-window cause.
5. Create a reviewed label.
6. Replay the correction.
7. Do not suppress related true incidents.

## 13. Rollback failure

1. Stop issuing similar controls.
2. Escalate immediately.
3. Preserve before/after state.
4. Use the owning authority for manual recovery.
5. Open a high-priority incident.
6. Disable automation until canary and rollback pass.

## 14. Key rotation

Exercise rotation for:

- edge-origin token
- CSSA policy signing key
- control-directive signing key
- session encryption/signing key
- pseudonymization HMAC key
- DataForge producer key
- Supabase keys under provider procedure

Every rotation defines overlap, revocation, rollback, and audit.
