import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { simpleAuth } from "@/lib/db/simple-auth";

const savedPassword = process.env.ADMIN_PASSWORD;
const savedEmail = process.env.ADMIN_EMAIL;

beforeEach(() => {
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_EMAIL;
});

afterEach(() => {
  if (savedPassword === undefined) delete process.env.ADMIN_PASSWORD;
  else process.env.ADMIN_PASSWORD = savedPassword;
  if (savedEmail === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = savedEmail;
});

describe("simpleAuth", () => {
  it("exposes a boolean `configured` flag", () => {
    expect(typeof simpleAuth.configured).toBe("boolean");
  });

  it("rejects sign-in when no password is configured", async () => {
    const res = await simpleAuth.signIn("admin", "anything");
    expect(res.error).toBe("Authentication not configured");
  });

  it("rejects sign-in with an incorrect password", async () => {
    process.env.ADMIN_PASSWORD = "correct-horse";
    const res = await simpleAuth.signIn("admin", "wrong");
    expect(res.error).toBe("Invalid password");
  });

  it("accepts sign-in with the correct password", async () => {
    process.env.ADMIN_PASSWORD = "correct-horse";
    const res = await simpleAuth.signIn("admin", "correct-horse");
    expect(res.error).toBeUndefined();
  });

  it("returns the default 'admin' user when no ADMIN_EMAIL is set", async () => {
    const user = await simpleAuth.getUser();
    expect(user).toEqual({ email: "admin" });
  });

  it("returns the configured ADMIN_EMAIL", async () => {
    process.env.ADMIN_EMAIL = "bheng@example.com";
    const user = await simpleAuth.getUser();
    expect(user).toEqual({ email: "bheng@example.com" });
  });

  it("signOut resolves without throwing", async () => {
    await expect(simpleAuth.signOut()).resolves.toBeUndefined();
  });
});
