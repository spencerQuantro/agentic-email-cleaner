import { describe, expect, it } from "vitest";
import { loadEnv, missingLiveConfig } from "./env";

describe("env", () => {
  it("binds to localhost by default", () => {
    expect(loadEnv({}).HOST).toBe("127.0.0.1");
  });

  it("requires APP_PASSWORD in live mode", () => {
    expect(missingLiveConfig(loadEnv({}))).toContain("APP_PASSWORD");
    expect(missingLiveConfig(loadEnv({ APP_PASSWORD: "hunter2" }))).not.toContain("APP_PASSWORD");
  });
});
