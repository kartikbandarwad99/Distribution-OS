/* Environment access that fails loudly and early.
 *
 * Every value here is required for the feature that reads it, but not for the
 * app as a whole — an Instagram connect attempt should not fall over because
 * R2 is unconfigured. So nothing is validated at import time; each getter
 * throws its own readable message at the moment it is actually needed. */

export class ConfigError extends Error {}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ConfigError(
      `${name} is not set. Add it in the Vercel project's environment variables (see .env.example).`,
    );
  }
  return value;
}

export const env = {
  /** Deployed origin, no trailing slash. */
  get appUrl(): string {
    return required("APP_URL").replace(/\/+$/, "");
  },

  get instagram() {
    return {
      appId: required("INSTAGRAM_APP_ID"),
      appSecret: required("INSTAGRAM_APP_SECRET"),
    };
  },

  get tokenEncKey(): Uint8Array {
    const key = new Uint8Array(Buffer.from(required("TOKEN_ENC_KEY"), "base64"));
    if (key.length !== 32) {
      throw new ConfigError(
        `TOKEN_ENC_KEY must decode to exactly 32 bytes, got ${key.length}. Generate one with: openssl rand -base64 32`,
      );
    }
    return key;
  },

  get databaseUrl(): string {
    return required("DATABASE_URL");
  },

  get r2() {
    return {
      accountId: required("R2_ACCOUNT_ID"),
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
      bucket: required("R2_BUCKET"),
    };
  },

  get cronSecret(): string {
    return required("CRON_SECRET");
  },
};

/** The redirect URI registered with Meta. Derived so it can never drift. */
export const instagramRedirectUri = () =>
  `${env.appUrl}/api/auth/instagram/callback`;
