import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "../worker/lib/crypto.js";
import { config, ConfigError, type Env } from "../worker/lib/env.js";
import { mintToken, readToken } from "../worker/lib/signing.js";

/* The token encryption is unchanged from the Vercel version apart from taking
 * its key as an argument. These tests exist because that file holds sixty-day
 * account tokens: anything that decrypts to garbage instead of failing loudly
 * would be a silent account compromise. */
describe("token encryption", () => {
  const key = () => config(env as unknown as Env).tokenEncKey;

  it("round-trips a token", () => {
    const token = "IGQVJXa-long-looking-meta-token";
    expect(decryptToken(encryptToken(token, key()), key())).toBe(token);
  });

  it("produces a different ciphertext each time", () => {
    // A fresh IV per encryption, so two encryptions of the same token are not
    // recognisably the same in a database dump.
    expect(encryptToken("same", key())).not.toBe(encryptToken("same", key()));
  });

  it("rejects a tampered ciphertext rather than returning garbage", () => {
    const encoded = encryptToken("secret", key());
    const [iv, ciphertext, tag] = encoded.split(".");
    const flipped = `${iv}.${ciphertext.slice(0, -2)}AA.${tag}`;
    expect(() => decryptToken(flipped, key())).toThrow();
  });

  it("rejects a malformed token with a message that says what to do", () => {
    expect(() => decryptToken("not-a-token", key())).toThrow(/reconnect/i);
  });

  it("refuses a key that is not 32 bytes, naming the fix", () => {
    const bad = { ...env, TOKEN_ENC_KEY: "c2hvcnQ=" } as unknown as Env;
    expect(() => config(bad).tokenEncKey).toThrow(ConfigError);
    expect(() => config(bad).tokenEncKey).toThrow(/openssl rand -base64 32/);
  });

  it("names the missing variable when one is unset", () => {
    const bare = { ...env, INSTAGRAM_APP_ID: undefined } as unknown as Env;
    expect(() => config(bare).instagram).toThrow(/INSTAGRAM_APP_ID/);
  });
});

describe("signed tokens", () => {
  const secret = "a-secret";

  it("round-trips a payload", () => {
    expect(readToken(secret, mintToken(secret, "session", 60))).toBe("session");
  });

  it("rejects a token signed with a different secret", () => {
    expect(readToken("other", mintToken(secret, "session", 60))).toBeNull();
  });

  it("rejects an expired token", () => {
    expect(readToken(secret, mintToken(secret, "session", -1))).toBeNull();
  });

  it("rejects a token whose payload was edited", () => {
    const token = mintToken(secret, "get:posts/mine.jpg", 60);
    const [, expiry, signature] = token.split(".");
    expect(
      readToken(secret, `${encodeURIComponent("get:posts/yours.jpg")}.${expiry}.${signature}`),
    ).toBeNull();
  });
});
