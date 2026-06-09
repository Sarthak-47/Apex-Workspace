# Auto-update

APEX ships with two layers of update support.

## Today: update notifications (no setup)

On startup the app checks the GitHub Releases API and shows a dismissible
"Update available" banner linking to the latest release. This works out of the
box and needs no signing key. The user downloads and installs the new version
manually. See `src/components/ui/UpdateBanner.tsx`.

## Optional: silent auto-update (one-time maintainer setup)

To let APEX download and install updates in-app, enable the Tauri updater:

1. **Generate a signing keypair** (keep the private key secret):
   ```bash
   npm run tauri signer generate -- -w apex-updater.key
   ```
   This prints a **public key** and writes the **private key** to
   `apex-updater.key`. Do **not** commit the private key.

2. **Add the public key to `src-tauri/tauri.conf.json`** under the updater plugin:
   ```jsonc
   "plugins": {
     "updater": {
       "active": true,
       "endpoints": [
         "https://github.com/Sarthak-47/Apex-Workspace/releases/latest/download/latest.json"
       ],
       "pubkey": "<PASTE PUBLIC KEY HERE>"
     }
   }
   ```
   Also add `"createUpdaterArtifacts": true` to the `bundle` section.

3. **Add the private key as repo secrets** (Settings → Secrets → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY` — contents of `apex-updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password you chose (blank if none)

   The release workflow (`.github/workflows/release.yml`) already reads these and
   `tauri-action` will then emit signed artifacts plus `latest.json` on each tag.

4. **Add the updater plugin to the app** (Rust + JS) and call `check()` on
   startup. This replaces the notify-only banner with a real
   download-and-install flow.

> Note: the updater **signature** proves an update came from you; it is separate
> from **Authenticode code signing**, which removes the Windows SmartScreen
> "unknown publisher" warning and requires a paid certificate.
