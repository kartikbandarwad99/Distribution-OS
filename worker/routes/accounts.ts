/* GET /api/accounts — safe fields only.
 *
 * `access_token_enc` is enumerated out rather than deleted from a `SELECT *`,
 * so a column added later cannot leak by default. Nothing in this response
 * would let a reader post as the user. */

import type { Env } from "../lib/env.js";
import { json } from "../lib/http.js";
import { query } from "../lib/db.js";

interface SafeAccount {
  id: string;
  project_id: string | null;
  platform: string;
  external_id: string;
  handle: string | null;
  avatar_url: string | null;
  expires_at: string | null;
  scopes: string;
  status: string;
  connected_at: string;
}

export async function list(_request: Request, env: Env): Promise<Response> {
  const rows = await query<SafeAccount>(
    env,
    `SELECT id, project_id, platform, external_id, handle, avatar_url,
            expires_at, scopes, status, connected_at
       FROM accounts
      ORDER BY connected_at DESC`,
  );

  return json({
    accounts: rows.map((row) => ({
      ...row,
      scopes: JSON.parse(row.scopes || "[]") as string[],
    })),
  });
}
