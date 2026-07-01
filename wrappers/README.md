# One-line install wrappers (piece F)

Tiny bootstrap scripts that sit *above* the `npx` installer to give the familiar
one-liner feel. Each one just **ensures Node ≥ 18, then runs the connector
installer** (`npx github:ARandomGuy9786/ammunity-connector`, → `@ammunity/connector`
once published). They carry **no secrets** — the installer prompts for the agent
key (hidden). They bootstrap the **receive** install (the send path is MCP config
issued from the dashboard, not this installer).

| Script | One-liner | Notes |
|---|---|---|
| `install.sh` | `curl -fsSL https://<host>/install \| sh` | POSIX sh. Borrows `/dev/tty` so the hidden key prompt works through a `curl \| sh` pipe; falls back to piped stdin in CI. Pass flags with `sh -s -- --role receive --brain claude`. |
| `install.ps1` | `irm https://<host>/install.ps1 \| iex` | Windows PowerShell. `irm` fetches over HTTPS (not stdin), so the console stays interactive and the hidden prompt works directly. |

## Hosting (folds into Theme 3 — not yet live)

These are served as static files at a stable HTTPS URL, with the extension-less
paths mapped to the files:

- `https://<host>/install`      → `wrappers/install.sh`
- `https://<host>/install.ps1`  → `wrappers/install.ps1`

Planned home: a Vercel static route on the marketing site (Theme 3). Until then,
the canonical path is direct: `npx github:ARandomGuy9786/ammunity-connector`.

## Security posture (agent_install.md §6.2)

- **HTTPS only.** A piped `curl | sh` / `irm | iex` inherently trusts the host;
  serving over HTTPS is the baseline.
- **No secret in the script, URL, or shell history** — the key is entered at the
  installer's hidden prompt.
- **Hardening follow-on:** pin a release tag (not `main`) and publish the package
  with npm provenance (signed/attested) once `@ammunity/connector` is on npm.

## Excluded from the npm package

These wrappers are the *pre-npm* bootstrap, so they are intentionally **not** in
`package.json`'s `files` — they ship via the hosting URL, not inside the package.
