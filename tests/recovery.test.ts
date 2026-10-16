import { describe, expect, mock, test } from "bun:test";
import { recoverAccountRequest } from "../src/js/forge/recovery.js";

function sequence(statuses: number[]) {
  let index = 0;
  return mock(async () => Response.json({ attempt: ++index }, { status: statuses[Math.min(index - 1, statuses.length - 1)] }));
}

describe("account service startup recovery", () => {
  test("healthy requests return immediately", async () => {
    const request = sequence([200]);
    const wait = mock(async () => {});
    const onRetry = mock(() => {});
    const response = await recoverAccountRequest("/v1/account", "GET", request, { wait, onRetry });
    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
    expect(onRetry).not.toHaveBeenCalled();
  });

  test("idempotent provisioning recovers from timeout and startup unavailability", async () => {
    const request = sequence([504, 503, 200]);
    const delays: number[] = [];
    const attempts: number[] = [];
    const response = await recoverAccountRequest("/v1/account/provision", "POST", request, {
      wait: async (ms: number) => { delays.push(ms); },
      onRetry: ({ attempt }: { attempt: number }) => { attempts.push(attempt); },
    });
    expect(request).toHaveBeenCalledTimes(3);
    expect(await response.json()).toEqual({ attempt: 3 });
    expect(delays).toEqual([2000, 4000]);
    expect(attempts).toEqual([1, 2]);
  });

  test("account reads recover when the transport returns an unavailable gateway", async () => {
    const request = sequence([502, 200]);
    const response = await recoverAccountRequest("/v1/licenses", "GET", request, { wait: async () => {} });
    expect(response.status).toBe(200);
    expect(request).toHaveBeenCalledTimes(2);
  });

  test("persistent outages stop and preserve the last error response", async () => {
    const request = sequence([503]);
    const delays: number[] = [];
    const response = await recoverAccountRequest("/v1/account", "GET", request, {
      wait: async (ms: number) => { delays.push(ms); },
    });
    expect(request).toHaveBeenCalledTimes(5);
    expect(delays).toEqual([2000, 4000, 8000, 8000]);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ attempt: 5 });
  });

  test("auth, policy, rate-limit and application failures are not retried", async () => {
    for (const status of [400, 401, 402, 403, 404, 409, 422, 429, 500]) {
      const request = sequence([status]);
      const wait = mock(async () => {});
      expect((await recoverAccountRequest("/v1/account", "GET", request, { wait })).status).toBe(status);
      expect(request).toHaveBeenCalledTimes(1);
      expect(wait).not.toHaveBeenCalled();
    }
  });

  test("checkout, portal, MFA, deletion and device mutations are never replayed", async () => {
    for (const path of ["/v1/checkout", "/v1/billing-portal", "/v1/account/mfa-status", "/v1/account/deletion-request", "/v1/installations/fixture/deactivate", "/v1/account/provision?extra=true"]) {
      const request = sequence([503]);
      const wait = mock(async () => {});
      await recoverAccountRequest(path, "POST", request, { wait });
      expect(request).toHaveBeenCalledTimes(1);
      expect(wait).not.toHaveBeenCalled();
    }
    const request = sequence([504]);
    await recoverAccountRequest("/v1/account/provision", "DELETE", request, { wait: async () => {} });
    expect(request).toHaveBeenCalledTimes(1);
  });

  test("ambiguous network failures remain errors", async () => {
    const request = mock(async () => { throw new TypeError("Synthetic network failure"); });
    const wait = mock(async () => {});
    await expect(recoverAccountRequest("/v1/account", "GET", request, { wait })).rejects.toThrow("Synthetic network failure");
    expect(request).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
