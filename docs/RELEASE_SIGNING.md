# Release signing

StudyDot's current `0.0.1-beta.1` installers are intentionally unsigned. The
release workflow blocks another unsigned release unless the person starting it
explicitly enables `confirm_unsigned_beta`.

## Windows

Preferred path: apply to SignPath Foundation for free open-source signing.

Before applying:

- Keep the repository public and all distributed components under
  OSI-approved licenses.
- Enable multi-factor authentication for GitHub and SignPath.
- Keep builds reproducible from the public GitHub Actions workflow.
- Publish the required code-signing policy after SignPath accepts the project.
- Require manual approval for every signing request.

Fallbacks are a commercial OV code-signing certificate or Microsoft Store
distribution. A self-signed certificate is not suitable for public downloads.

## macOS

Public macOS releases are paused until Apple Developer ID signing and
notarization are available. Keep the build configuration for future testing,
but do not attach macOS artifacts to public releases.

Developer ID signing and Apple notarization require an active Apple Developer
Program membership. Once membership and the Developer ID Application
certificate are available, configure these GitHub Actions secrets:

- `APPLE_CERTIFICATE`
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

`APPLE_PASSWORD` must be an app-specific password. Never commit certificates,
passwords, private keys, or signing tokens to the repository.

## Verification before publication

For every signed release:

1. Build from the tagged commit in GitHub Actions.
2. Verify the Windows Authenticode signature and timestamp.
3. Recalculate SHA-256 checksums after signing.
4. Upload only the verified signed artifacts to the download bucket.
5. Update the website after all public download URLs have been checked.
