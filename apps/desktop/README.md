# DeepSeek Harness Studio · Desktop App

English | [中文](README.zh.md)

The desktop app supervises the existing loopback Web Host and keeps it alive from the system tray when its window is closed.

## Development

Install dependencies, then use the desktop development command. On the first run, after a relevant input changes, or when a required output is missing, it builds the Host and client packages, Web frontend, and Electron main process before launching the application. When those inputs and outputs are unchanged, it launches Electron directly from the verified build:

```sh
pnpm run dev:desktop
```

The launcher records a content fingerprint under the ignored `apps/desktop/lib/` output directory. Source, manifest, build-configuration, Node runtime, or build-environment changes invalidate that record; documentation-only edits do not. A failed build never leaves a reusable record. Force a complete rebuild when diagnosing generated output or toolchain state:

```sh
pnpm run dev:desktop:rebuild
```

Closing the window hides it. Use the tray menu to restore the window or quit the application. Explicit quit waits for the Host process to stop and escalates termination after the bounded Host grace period.

The desktop app accepts only the readiness URL emitted by `dsh web` for `127.0.0.1` or `localhost`. Navigation stays on that origin; HTTP and HTTPS links open in the system browser.

Native chrome follows the host platform. macOS uses a frameless inset title bar, traffic lights, and sidebar vibrancy; its collapsed sidebar is 90px wide, with centered controls whose top edge aligns with the expanded logo row below the traffic lights. Windows retains its system frame, shadow, resize and Snap behavior, and Windows 11 rounded corners while a hidden title bar places the native caption buttons in the Session header's first row; the Windows sidebar has no traffic-light inset. The empty part of that row remains draggable, its controls remain clickable, and a resident drag band covers the same row when no Session header is visible. Windows acrylic and macOS vibrancy reach only the sidebar, while conversation and details stay opaque. Linux keeps a frameless window and an opaque sidebar fallback.

### Plugin Center trusted lifecycle

Desktop owns Plugin Center discovery, compatibility, and package-mutation authority. Public discovery searches npm for packages tagged `dsh-plugin`, the convention documented by DeepSeek Harness for ecosystem discovery, and retains only exact versions that declare `dsh.bundle`. The keyword is not an official endorsement. Before an item receives installation authority, Desktop downloads its immutable npm tarball and validates registry integrity, SHA-256, archive containment, package identity, Bundle patch, and activation identities. The sandboxed renderer can call only fixed catalog and operation methods and submits only plugin id, exact version, and an idempotency key.

The same serialized transaction owns install, enable, disable, exact update, and uninstall. It snapshots before mutation, preserves explicit active or disabled Bundle intent, stops the Host before package replacement or removal, and commits only after the target Profile and declared Host, client, and Skill evidence agree. Uninstall preserves configuration and plugin-owned data by default; a separate post-commit bridge can delete only exact declared paths below the plugin storage root. Before a normal Host starts, Desktop deactivates validated external Bundles that are incompatible with the current application release while retaining their packages and reasons. The production preload exposes these operations through the recovery-backed controller.

An uncommitted journal owns recovery before the normal Host starts. Mutation side effects durably record their before and after points, so the same recovery path covers interruption before or after Host stop, Profile or package mutation, Host start, and renderer reconnect. Recovery restores the hash-bound snapshot, rematerializes the old packages, and requires the prior Host, client, and Skill evidence before publishing `rolled-back`; failure opens the protected recovery page with same-operation retry and redacted diagnostic export.

Use `pnpm run dev:desktop:web` for deterministic browser acceptance of the same client components and progress contract. That development bridge simulates phases and persistence but has no Electron, Profile, filesystem, package-manager, MCP, or Host-restart authority.

## Packaging

The local packaging command performs the complete repository build, stages the Host's closed production dependency tree, and creates an unpacked application for the current platform. A separate manual build is not required:

```sh
pnpm run package:desktop
```

Packaged applications run the staged `@deepseek-ai/dsh` CLI in a separate process through Electron's Node mode. The application therefore retains the supervised-Host lifecycle without shipping a second Node executable. An `afterPack` check rejects the package before signing when the staged CLI entry or Web frontend entry is absent. Both macOS and Windows use the exact tracked `apps/desktop/build/icon.png` source; the repository does not preprocess or commit platform-specific icon variants.

### Signed macOS DMG and ZIP

The macOS distribution command produces the DMG used for installation and the ZIP required by the auto-updater. It requires a valid `Developer ID Application` identity whose certificate and private key are both installed in the build user's Keychain. It also requires one complete notarization credential source. A Keychain profile keeps the app-specific password out of the repository and shell history:

```sh
xcrun notarytool store-credentials "dsh-notary" --apple-id "<Apple ID>" --team-id "<Team ID>"
```

`notarytool` requests the secret interactively. Build the signed, hardened-runtime, notarized DMG with the stored profile:

```sh
APPLE_KEYCHAIN_PROFILE=dsh-notary pnpm run dist:mac:desktop
```

An existing secrets file can supply `MAC_CERT_P12_BASE64`, `MACOS_SIGN_IDENTITY`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` without importing the certificate into the persistent Keychain:

```sh
node --env-file=/absolute/path/to/macos-signing-secrets.env --import tsx apps/desktop/scripts/release-mac.ts
```

Electron Builder imports that Base64 PKCS#12 certificate into its temporary Keychain and removes it when the build finishes. The wrapper keeps signing and notarization variables out of the repository-build and runtime-staging subprocesses, then passes them only to Electron Builder. The secrets file and its path are never tracked.

The release preflight runs before the repository build. It fails if the host is not macOS, the supplied identity is not a `Developer ID Application` identity, signing credentials are incomplete, signing discovery is disabled, or notarization credentials are missing or incomplete. Without the PKCS#12 group, it requires a usable `Developer ID Application` identity and private key in the Keychain. Instead of a Keychain profile, the command accepts the complete Apple ID group (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`) or App Store Connect API key group (`APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER`).

After a successful build, mount the generated DMG and verify the installed application signature, Gatekeeper assessment, and stapled notarization ticket:

```sh
DMG_PATH="$(find apps/desktop/dist -maxdepth 1 -type f -name '*.dmg' -print -quit)"
MOUNT_POINT="$(mktemp -d)"
hdiutil attach "$DMG_PATH" -mountpoint "$MOUNT_POINT" -nobrowse -readonly
APP_PATH="$MOUNT_POINT/DeepSeek Harness.app"
codesign --verify --deep --strict --verbose=2 "$APP_PATH"
spctl --assess --type execute --verbose=4 "$APP_PATH"
xcrun stapler validate "$APP_PATH"
hdiutil detach "$MOUNT_POINT"
rmdir "$MOUNT_POINT"
```

### Publishing updates

Desktop installations check the Beyondata OSS feed configured in this package; they never replace this customized application with an upstream DeepSeek Harness artifact. Electron Builder's generic provider generates channel metadata but does not upload it. After `ALIYUN_OSS_ACCESS_KEY_ID` and `ALIYUN_OSS_ACCESS_KEY_SECRET` have been injected through a protected environment mechanism, the release maintainer publishes one or more platform output directories whose installers have passed the platform signing and acceptance checks:

```sh
pnpm run publish:desktop-update -- \
  --dir /path/to/macos-output \
  --dir /path/to/windows-output
```

The command validates one version and channel across all supplied directories, checks every metadata size and SHA-512, requires each blockmap, and rejects a macOS release without a ZIP. It uploads versioned artifacts before replacing `rc-mac.yml` or `rc.yml`, then reads both manifests through the public URL. Existing immutable objects are reused only when their recorded size and SHA-512 match.

`--dry-run` performs every local check without contacting OSS. `--allow-current-baseline` is a one-time exception for publishing an already distributed current version whose macOS test package predates the ZIP requirement; it makes same-version checks return “up to date” but is not a cross-version update release. Future versions must use the signed DMG+ZIP and signed Windows NSIS paths before publication. Credentials stay in protected environment injection and must never enter a command transcript, build output, or tracked file.

### Windows x64 NSIS installer

Build the per-user, one-click Windows x64 installer with:

```sh
pnpm run dist:win:desktop
```

The command builds the complete workspace, stages a Windows-targeted Host runtime, verifies the required Koffi, Sharp, and node-pty x64 native modules, then creates the `.exe` installer, blockmap, and update metadata. macOS cross-builds expose Electron Builder's NSIS templates through a short temporary path because NSIS still uses a fixed 260-character POSIX include buffer; the temporary symlink is removed after the build.

Before replacing an existing installation, the NSIS installer asks the running single instance to enter the ordinary explicit-quit path and waits for the supervised Host to settle. It then terminates any remaining `DeepSeek Harness.exe` process tree before Electron Builder's file-replacement check, so a tray-resident or older application cannot keep the installation directory locked.

Internal test installers remain unsigned until a Windows Authenticode certificate is configured. SmartScreen may therefore require **More info → Run anyway** after the tester verifies the published SHA-256. Do not disable Defender. Actual launch and uninstall acceptance must still run on Windows 10/11 x64.

## Known limitations

The first desktop assembly uses a loopback HTTP Host. The renderer and Host protocol remain unchanged so the application can replace the transport with the IPC carrier reserved by the GUI architecture without changing product features.

Browser progress remains simulation evidence only; real search, package mutation, Host restart, and uninstall require Desktop. The public npm index is a community distribution channel, not a DeepSeek security review. This first live source accepts prebuilt npm DSH Bundles and rejects packages without `dsh.bundle`, unsafe archives, mismatched immutable evidence, or install lifecycle scripts; GitHub-only source builds are not installed by the one-click path.

macOS has a signed and notarized distribution path. Windows has an x64 NSIS installer path, but production Authenticode signing remains release work. Linux still creates an unpacked application and has no installer format or distribution-signing path yet.

## Model Experience

The desktop shell does not add model-visible input. The reused Web profile continues to own its existing Web runtime context.
