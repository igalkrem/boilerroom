import { describe, it, expect } from "vitest";
import type { FeedProvider } from "@/types/feed-provider";
import { resolveProviderKey } from "./provider-key";

// Minimal fixtures. Only the three fields this resolver reads are set; casting keeps the
// test from restating the whole FeedProvider shape, which would make it fail on unrelated
// type changes rather than on a resolver regression.
function provider(over: {
  id: string;
  domains?: { baseDomain: string }[];
  snapAccounts?: string[];
  metaAccounts?: string[];
}): FeedProvider {
  return {
    id: over.id,
    domains: over.domains,
    snapConfig: over.snapAccounts ? { allowedAdAccountIds: over.snapAccounts } : undefined,
    metaConfig: over.metaAccounts ? { allowedAdAccountIds: over.metaAccounts } : undefined,
  } as unknown as FeedProvider;
}

function row(over: Partial<{ feed_provider_id: string; domain_name: string; ad_account_id: string }> = {}) {
  return { feed_provider_id: "", domain_name: "", ad_account_id: "", ...over };
}

const vizymo = provider({
  id: "vizymo",
  domains: [{ baseDomain: "vizymo.com" }],
  snapAccounts: ["snap-acct-1"],
});
const predicto = provider({
  id: "predicto",
  domains: [{ baseDomain: "predicto.ai" }],
  snapAccounts: ["snap-acct-2"],
  metaAccounts: ["act_meta_2"],
});
const providers = [vizymo, predicto];

describe("tier 1 — feed_provider_id from the DB", () => {
  it("wins outright when present", () => {
    expect(resolveProviderKey(row({ feed_provider_id: "predicto" }), providers)).toBe("predicto");
  });

  // Tier 1 is the authoritative channel link; the lower tiers are heuristics. If a row
  // carries a provider id, no amount of contradicting domain/account data may override it.
  it("outranks a conflicting domain and account", () => {
    const r = row({ feed_provider_id: "predicto", domain_name: "vizymo.com", ad_account_id: "snap-acct-1" });
    expect(resolveProviderKey(r, providers)).toBe("predicto");
  });

  it("is returned verbatim even if no loaded provider matches it", () => {
    expect(resolveProviderKey(row({ feed_provider_id: "deleted-provider" }), providers)).toBe("deleted-provider");
  });
});

describe("tier 2 — domain matching", () => {
  it("matches an exact domain", () => {
    expect(resolveProviderKey(row({ domain_name: "vizymo.com" }), providers)).toBe("vizymo");
  });

  it("matches a subdomain", () => {
    expect(resolveProviderKey(row({ domain_name: "news.vizymo.com" }), providers)).toBe("vizymo");
    expect(resolveProviderKey(row({ domain_name: "a.b.vizymo.com" }), providers)).toBe("vizymo");
  });

  it("is case-insensitive on both sides", () => {
    expect(resolveProviderKey(row({ domain_name: "VIZYMO.COM" }), providers)).toBe("vizymo");
    expect(resolveProviderKey(row({ domain_name: "News.Vizymo.Com" }), providers)).toBe("vizymo");
  });

  // The dot in `endsWith("." + base)` is load-bearing. A bare suffix test would attribute
  // an unrelated domain's revenue to this provider — silently wrong money, not an error.
  it("does not match a domain that merely ends with the base string", () => {
    expect(resolveProviderKey(row({ domain_name: "notvizymo.com" }), providers)).toBe("__unknown__");
    expect(resolveProviderKey(row({ domain_name: "evil-vizymo.com" }), providers)).toBe("__unknown__");
  });

  it("does not match a domain that merely starts with the base string", () => {
    expect(resolveProviderKey(row({ domain_name: "vizymo.com.evil.tld" }), providers)).toBe("__unknown__");
  });

  // Falling through matters: an unmatched domain must not short-circuit to unknown while
  // a perfectly good ad-account match is still available on the same row.
  it("falls through to tier 3 when the domain matches nothing", () => {
    const r = row({ domain_name: "unrelated.example", ad_account_id: "snap-acct-2" });
    expect(resolveProviderKey(r, providers)).toBe("predicto");
  });
});

describe("tier 3 — ad account matching", () => {
  it("matches a Snap ad account", () => {
    expect(resolveProviderKey(row({ ad_account_id: "snap-acct-1" }), providers)).toBe("vizymo");
  });

  // The regression: tier 3 checked only snapConfig, so a Meta campaign on an account
  // assigned solely via metaConfig fell through to "Unknown" despite being configured
  // correctly. Meta rows also always arrive with domain_name = "", so tier 2 can never
  // rescue them — this is their only path.
  it("matches a Meta ad account assigned only via metaConfig", () => {
    expect(resolveProviderKey(row({ ad_account_id: "act_meta_2" }), providers)).toBe("predicto");
  });

  it("still resolves a Meta account when domain_name is empty, as Meta rows always are", () => {
    const r = row({ feed_provider_id: "", domain_name: "", ad_account_id: "act_meta_2" });
    expect(resolveProviderKey(r, providers)).toBe("predicto");
  });
});

describe("fallback and robustness", () => {
  it("returns __unknown__ when nothing matches", () => {
    expect(resolveProviderKey(row({ ad_account_id: "unheard-of" }), providers)).toBe("__unknown__");
  });

  it("returns __unknown__ for a completely empty row", () => {
    expect(resolveProviderKey(row(), providers)).toBe("__unknown__");
  });

  it("returns __unknown__ when no providers are loaded", () => {
    expect(resolveProviderKey(row({ domain_name: "vizymo.com", ad_account_id: "snap-acct-1" }), [])).toBe("__unknown__");
  });

  // Providers are user-authored: neither form requires domains or an ad-account list, so
  // sparse records reach this resolver in normal use and must not throw.
  it("tolerates providers with no domains and no configs", () => {
    const bare = provider({ id: "bare" });
    expect(resolveProviderKey(row({ domain_name: "vizymo.com" }), [bare, vizymo])).toBe("vizymo");
    expect(resolveProviderKey(row({ ad_account_id: "snap-acct-1" }), [bare, vizymo])).toBe("vizymo");
    expect(resolveProviderKey(row({ domain_name: "x.example" }), [bare])).toBe("__unknown__");
  });

  it("tolerates a domain entry with an empty baseDomain", () => {
    const broken = provider({ id: "broken", domains: [{ baseDomain: "" }] });
    // Must not treat "" as matching everything.
    expect(resolveProviderKey(row({ domain_name: "anything.example" }), [broken])).toBe("__unknown__");
  });
});
