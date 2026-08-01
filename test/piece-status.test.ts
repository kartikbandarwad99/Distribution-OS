import { describe, it, expect } from "vitest";
import { statusOf } from "../src/lib/targets.js";
import { agoLabel } from "../src/lib/dates.js";
import type { ServerTarget } from "../src/lib/server.js";

/* The two pure pieces of the reconcile. Both decide what a card says, and both
 * are easier to get subtly wrong than they look — particularly the multi-
 * account cases, where "the piece" and "one of its targets" are not the same
 * thing. */

const target = (patch: Partial<ServerTarget> = {}): ServerTarget => ({
  id: "t1",
  post_id: "p1",
  account_id: "a1",
  scheduled_at: "2026-08-01T10:00:00.000Z",
  state: "published",
  attempts: 0,
  error_reason: null,
  published_at: "2026-08-01T10:00:05.000Z",
  platform_post_id: "ig1",
  removed_at: null,
  handle: "someone",
  ...patch,
});

describe("statusOf", () => {
  it("is null for a piece the server has never seen", () => {
    expect(statusOf(undefined)).toBeNull();
    expect(statusOf([])).toBeNull();
  });

  it("reports a published piece", () => {
    const status = statusOf([target()])!;
    expect(status.published).toBe(true);
    expect(status.removed).toBe(false);
    expect(status.inFlight).toBe(false);
  });

  it("reports in-flight while the scheduler is working", () => {
    const status = statusOf([target({ state: "creating", published_at: null })])!;
    expect(status.inFlight).toBe(true);
    expect(status.published).toBe(false);
  });

  it("carries the failure reason for a tooltip", () => {
    const status = statusOf([
      target({ state: "failed", error_reason: "Instagram said no" }),
    ])!;
    expect(status.failed).toBe(true);
    expect(status.reason).toBe("Instagram said no");
  });

  it("treats needs_review as failed, since a human must look", () => {
    expect(statusOf([target({ state: "needs_review" })])!.failed).toBe(true);
  });

  /* The case worth being careful about: with two accounts, the piece is only
     gone from the world once BOTH copies are gone. Marking it removed while
     one is still up would be a lie on the card. */
  it("is removed only when every published target is gone", () => {
    const half = statusOf([
      target({ id: "t1", removed_at: "2026-08-02T00:00:00.000Z" }),
      target({ id: "t2", account_id: "a2" }),
    ])!;
    expect(half.removed).toBe(false);
    expect(half.published).toBe(true);

    const both = statusOf([
      target({ id: "t1", removed_at: "2026-08-02T00:00:00.000Z" }),
      target({
        id: "t2",
        account_id: "a2",
        removed_at: "2026-08-02T00:00:00.000Z",
      }),
    ])!;
    expect(both.removed).toBe(true);
  });

  it("is not removed just because an unpublished target exists", () => {
    const status = statusOf([
      target({ id: "t1", removed_at: "2026-08-02T00:00:00.000Z" }),
      target({ id: "t2", account_id: "a2", state: "queued", published_at: null }),
    ])!;
    expect(status.removed).toBe(true);
    expect(status.inFlight).toBe(true);
  });
});

describe("agoLabel", () => {
  const from = new Date("2026-08-01T12:19:00");

  it("names the distance for the incident that prompted it", () => {
    // 12:22 AM chosen at 12:19 PM — the AM/PM slip, twelve hours behind.
    expect(agoLabel("2026-08-01T00:22:00", from)).toBe("12 hours ago");
  });

  it("uses minutes below the hour, singular where it should", () => {
    expect(agoLabel("2026-08-01T12:18:00", from)).toBe("1 minute ago");
    expect(agoLabel("2026-08-01T11:45:00", from)).toBe("34 minutes ago");
  });

  it("uses days past a day", () => {
    expect(agoLabel("2026-07-30T12:19:00", from)).toBe("2 days ago");
  });

  it("does not claim a future time is in the past", () => {
    expect(agoLabel("2026-08-01T18:00:00", from)).toBe("just now");
  });
});
