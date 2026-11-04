# Folio AI Store version decision

- Previous QA version: `1.0.2.1`
- Final Store candidate version: `1.0.3.0`
- Identity: `OkinawaDesktopTools.FolioAI`
- Publisher: `CN=46263F21-A700-41DB-8C9B-114C22FB82FC`
- Architecture: `x64`

Microsoft Store reserves the fourth component of a Windows package version and requires it to be `0` for new Windows 10/11 package submissions. `1.0.2.1` is therefore retained only as prior QA evidence. The next monotonically higher Store candidate is `1.0.3.0`.

The authoritative source SHA and package SHA-256 are generated after checkout and MakeAppx verification in `msix-out/folio-auto-upload-handoff.json`. They are not hard-coded in this source document because doing so would make the commit identify itself recursively.

Reference: https://learn.microsoft.com/windows/apps/publish/publish-your-app/package-version-numbering?pivots=store-installer-msix

