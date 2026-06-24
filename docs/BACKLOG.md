# EntraPulse Lite — Backlog

Future features not yet scheduled. Each entry captures the idea, rationale, and known design constraints so it can be picked up later.

---

## Multi-tenant analysis via Lokka Connection Manager (secondary tenant)

**Status:** Backlog (feature release). Smaller target audience — not the majority of users.

**Idea:** Let EntraPulse provide Lokka a **secondary tenant connection** alongside the primary, so the LLM can evaluate **cross-tenant** scenarios in one session — e.g. comparing **Cross-Tenant Access Policies (CTAP)**, Conditional Access, or B2B/guest configuration across two tenants.

**Design direction:**
- **Reuse existing Tenant Profiles — do not duplicate settings.** Add a Settings option to *designate an existing profile as the secondary connection* (its client ID / tenant / scopes already live in that profile). Avoids duplicating every Entra app-registration + scope field per tenant.
- **EntraPulse keeps owning auth (Level B).** EntraPulse brokers **both** tokens and injects both into Lokka's Connection Manager:
  - Primary = the signed-in user's interactive delegated token (as today).
  - Secondary = most realistically an **app-only / service-principal** connection (EntraPulse acquires a client-credentials token for tenant B). Delegated also possible if the user is a guest in tenant B.
- **Policy gate becomes nuanced:** allow EntraPulse-brokered connection add/switch, while still **blocking iframe-initiated** sign-in/consent.

**Known hard parts / constraints:**
- **Lokka uses the *active* connection only** — `Lokka-Microsoft` has no per-call tenant/connection parameter. Cross-tenant work = `switch-lokka-connection` between queries. Prefer **EntraPulse orchestrating a controlled dual-run** (run in A → switch → run in B → compare) over trusting the LLM to manage active-connection state.
- **Token lifecycle:** EntraPulse re-injects the primary token on auth/restart events — must not clobber the secondary connection; secondary (app-only) token refreshes independently.
- **Per-tenant consent:** the secondary SP needs its own admin-consented scopes in tenant B (e.g. `Policy.Read.All` for CTAP/CAP). Inherent to cross-tenant; profiles already carry scopes.

**Phasing thoughts:**
1. Designate a secondary profile → EntraPulse adds it to Lokka as an app-only connection (Level B gate); manual per-connection querying via the Connection Manager.
2. A purpose-built "compare across tenants" capability where EntraPulse runs a query against both connections and hands both result sets to the LLM (CTAP/CAP/B2B comparisons).

