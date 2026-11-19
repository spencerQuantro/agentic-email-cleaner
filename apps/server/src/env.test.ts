import { describe, expect, it } from "vitest";
import { allowedHosts, allowedOrigins, loadEnv, missingLiveConfig } from "./env";

describe("env", () => {
  it("binds to localhost by default", () => {
    expect(loadEnv({}).HOST).toBe("127.0.0.1");
  });

  it("requires APP_PASSWORD in live mode", () => {
    expect(missingLiveConfig(loadEnv({}))).toContain("APP_PASSWORD");
    expect(missingLiveConfig(loadEnv({ APP_PASSWORD: "hunter2" }))).not.toContain("APP_PASSWORD");
  });

  it("allows the web app and the server's own origins by default", () => {
    expect(allowedOrigins(loadEnv({}))).toEqual([
      "http://localhost:5173",
      "http://localhost:8787",
      "http://127.0.0.1:8787",
    ]);
  });

  it("allows the web, redirect and loopback hosts by default", () => {
    expect(allowedHosts(loadEnv({}))).toEqual([
      "localhost:5173",
      "localhost:8787",
      "localhost:8787",
      "127.0.0.1:8787",
    ]);
  });

  it("omits default ports and normalizes a trailing slash", () => {
    const env = loadEnv({ WEB_ORIGIN: "https://Sweep.example/" });
    expect(allowedOrigins(env)[0]).toBe("https://sweep.example");
    expect(allowedHosts(env)[0]).toBe("sweep.example");
  });

  it("appends trimmed, lowercased ALLOWED_HOSTS entries", () => {
    const hosts = allowedHosts(loadEnv({ ALLOWED_HOSTS: " a.lan:8787 , ,B.lan " }));
    expect(hosts.slice(-2)).toEqual(["a.lan:8787", "b.lan"]);
    expect(hosts).toHaveLength(6);
  });

  it("defaults WEB_ORIGIN from WEB_PORT, but an explicit WEB_ORIGIN wins", () => {
    expect(loadEnv({ WEB_PORT: "5200" }).WEB_ORIGIN).toBe("http://localhost:5200");
    expect(loadEnv({ WEB_PORT: "5200", WEB_ORIGIN: "https://sweep.example" }).WEB_ORIGIN).toBe(
      "https://sweep.example",
    );
  });
});
