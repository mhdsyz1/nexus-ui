"use client";

import { BACKEND_URL } from "./constants";
import { useTerminalStore } from "./store";

export class AdminAuthError extends Error {
  constructor(msg = "Authorization required") {
    super(msg);
    this.name = "AdminAuthError";
  }
}

/**
 * Every command-plane call goes through here: acquires the admin key
 * (prompting via AdminKeyDialog when absent), sends X-Admin-Key, and
 * on 401/403 clears the stored key so the next action re-prompts —
 * exactly the auto-clear behaviour specced for the AuthVault.
 */
export async function adminFetch(
  path: string,
  body: unknown,
  method: "POST" | "GET" = "POST",
  opts: { tokenInBody?: boolean } = {},
): Promise<Response> {
  const { requestAdminKey, clearAdminKey } = useTerminalStore.getState();
  const key = await requestAdminKey();
  if (!key) throw new AdminAuthError("Action cancelled — no key provided");

  // /webhook validates payload.secret_token in the BODY (the X-Admin-Key
  // header only bypasses the IP whitelist), so the token is injected here
  // and never handled by calling components.
  const finalBody =
    opts.tokenInBody && body && typeof body === "object"
      ? { ...(body as Record<string, unknown>), secret_token: key }
      : body;

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Admin-Key": key },
    body: method === "GET" ? undefined : JSON.stringify(finalBody),
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    clearAdminKey();
    throw new AdminAuthError("Key rejected by the engine — it was cleared; retry to re-enter");
  }
  if (!res.ok) {
    let detail = `Engine returned ${res.status}`;
    try {
      const j = await res.json();
      if (j?.detail) detail = String(j.detail);
    } catch {}
    throw new Error(detail);
  }
  return res;
}
