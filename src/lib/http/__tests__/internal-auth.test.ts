import { afterEach, describe, expect, it } from "vitest";
import { getInternalAuthHeaders } from "../internal-auth";

describe("getInternalAuthHeaders", () => {
  afterEach(() => {
    delete process.env.RELAY_INTERNAL_AUTH_TOKEN;
    delete process.env.RELAY_API_TOKEN;
  });

  it("sends nothing when neither token is configured", () => {
    expect(getInternalAuthHeaders()).toEqual({});
  });

  it("sends the internal token and the API token when both are configured", () => {
    process.env.RELAY_INTERNAL_AUTH_TOKEN = "internal-secret";
    process.env.RELAY_API_TOKEN = "api-secret";
    expect(getInternalAuthHeaders()).toEqual({
      "x-relay-internal-auth": "internal-secret",
      authorization: "Bearer api-secret",
    });
  });
});
