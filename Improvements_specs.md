# CrowdSec CF Worker Bouncer — UX&UI Improvements Spec

> **Status:** Work in progress — this document is a living spec.  
> Sections marked 🚧 are confirmed improvements to implement.  
> Sections marked 💭 are still open for discussion / not yet decided.  
> Do not treat 💭 sections as implementation tasks.

---

## Context

The installer is a self-contained Cloudflare Worker (React Router + Vite) that deploys the CrowdSec Cloudflare Worker Bouncer onto a user's Cloudflare zones. It lives at `app/routes/home.jsx` and calls the Cloudflare API directly thanks to a Cloudflare API Token, no backend intermediary.

The current flow is a linear wizard: pick action (Deploy / Clear) → enter credentials → select zones → watch streaming log output.

The improvements below aim to turn this one-shot wizard into a stateful zone management UI.

---

## 🚧 Confirmed improvements

### Zone Protection Status View

**Problem:** The user always starts from scratch. There is no way to see what is already deployed without re-running the wizard.

**What to implement:**
- On load, after the CF token is validated, call the Cloudflare API to detect which zones already have CrowdSec workers deployed (`crowdsec-cloudflare-worker-bouncer`, `crowdsec-decisions-sync-worker`).
- Display all zones with their current state: `active`, `inactive`
  - Have filters to select ALL, Actives, Inactives
  - Ordered by Name
  - Possibility filter with text search
- This becomes the default view instead of the wizard step 1.

**Data to surface per zone:**
- Worker install date (might need to store it in the workers settings)
- KV namespace ID, D1 database ID (if active), Turnstile widget ID (if any)
- Last sync timestamp
- Number of blocked IPs (from worker status endpoint if available)

---

### CF token live validation

**Problem:** The user enters a token, clicks Deploy, and only discovers errors several minutes into the streaming log.

**What to implement:**
- As soon as the CF API token field loses focus (or after a short debounce), call `GET /user/tokens/verify`.
- Show inline feedback: ✓ valid / ✗ invalid / required permissions missing.
- Block the deploy action until the token is confirmed valid.
- Info about the requiered permissions: https://doc.crowdsec.net/u/bouncers/cloudflare-workers/#generating-a-cloudflare-api-token
    - and link that opens token creation in new tab : https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22account_settings%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22challenge_widgets%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22user_details%22%2C%22type%22%3A%22read%22%7D%2C%7B%22key%22%3A%22workers_kv_storage%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_routes%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22workers_scripts%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22zone%22%2C%22type%22%3A%22read%22%7D%2C%20%7B%22key%22%3A%20%22dns%22%2C%20%22type%22%3A%22read%22%7D%2C%20%7B%22key%22%3A%22d1%22%2C%20%22type%22%3A%22edit%22%7D%5D&name=
- When token is verified, update the **zone protection status view**
---

### Per-zone install/remove (instead of global Clear/Reinstall)

**Problem:** "Clear" removes all CrowdSec infrastructure across all zones at once. This is a destructive all-or-nothing action. it's also impossible to remove it from a single zone or install on an additionnal zone if already installed on other zones

**What to implement:**
- Replace the global "Clear" action with a per-zone "Remove" button.
- Remove only the worker routes and workers for that specific zone.
- KV namespace and D1 database are kept (to avoid data loss on accidental remove).
- Require an explicit confirmation modal before executing. The modal must name the zone and list what will be deleted vs kept.
- Allow individual install too
- could have a select box system to batch remove or install
  - remove on selected zone where it's not installed would of course do nothing, but we'll log that nothing was done for this zone
  - install on already installed zone would prompt an initial message listing the zone where it's installed and ask confirm for RE-install, thus replacing the workers code
- we could keep a clear all button still
- Refresh **zone protection status view** after install/uninstall
- Display a message i a top banner: Installed/Uninstalled on/from <number> zones

---
