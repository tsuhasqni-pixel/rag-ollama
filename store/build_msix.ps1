param(
    [Parameter(Mandatory=$true)][string]$AppName,
    [switch]$SkipExecutableSelfTest,
    [string]$SigningThumbprint = ''
)
$ErrorActionPreference = 'Stop'
if ($AppName -notin @('DaymarkAI','FolioAI')) { throw "Unexpected product: $AppName" }
if ($SigningThumbprint -and $SigningThumbprint -notmatch '^[0-9A-Fa-f]{40}$') {
    throw 'SigningThumbprint must be a 40-character SHA-1 certificate thumbprint'
}
if ($SkipExecutableSelfTest -and -not $SigningThumbprint) {
    throw 'Skipping the executable self-test is allowed only for a local test-signed QA build'
}
if ($SigningThumbprint) { $SigningThumbprint=$SigningThumbprint.ToUpperInvariant() }
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$cfg=Get-Content (Join-Path $root 'store/product.json') -Raw | ConvertFrom-Json
if ($cfg.product -cne $AppName -or $cfg.release_status -cne 'QA_UNSIGNED_HOLD') {
    throw 'Packaging identity or unsigned QA state is unexpected'
}
$stage=Join-Path $root 'msix-stage'
$deliver=Join-Path $root 'msix-out'
$unpack=Join-Path $root 'msix-verify'
foreach ($path in @($stage,$deliver,$unpack)) {
    if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
}
$extra=@()
foreach ($f in @('index.html','app.js','diary_recall.js','style.css')) {
    if (Test-Path $f) { $extra+=@('--add-data', "$f;.") }
}
$extra+=@('--add-data','store/model_picker.js;store')
$pyArgs=@('-m','PyInstaller','--noconfirm','--clean','--windowed','--onedir',
    '--name',$AppName,'--paths','.','--collect-all','webview',
    '--manifest','store/windows_app.manifest')+$extra+
    @('store/windows_launcher.py')
& python @pyArgs
if ($LASTEXITCODE -ne 0) {throw "PyInstaller failed: $LASTEXITCODE"}
$exe=Join-Path $root "dist/$AppName/$AppName.exe"
if (-not (Test-Path $exe)) {throw "Built Windows executable not found: $exe"}
$sdkRoot=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Windows Kits/10/bin'
if (-not (Test-Path $sdkRoot)) {throw 'Windows 10 SDK bin directory is missing'}
$signTool=$null
if ($SigningThumbprint) {
    $certificate=Get-Item -LiteralPath "Cert:\CurrentUser\My\$SigningThumbprint" -ErrorAction Stop
    if (-not $certificate.HasPrivateKey -or $certificate.Subject -cne $cfg.publisher) {
        throw 'Signing certificate is missing its private key or does not match the package Publisher'
    }
    $signTool=Get-ChildItem -Path $sdkRoot -Filter signtool.exe -Recurse -File |
      Where-Object { $_.FullName -match '[\\/]x64[\\/]signtool\.exe$' } |
      Sort-Object FullName -Descending | Select-Object -First 1
    if ($null -eq $signTool) {throw 'Windows SDK SignTool.exe (x64) not found'}
    & $signTool.FullName sign /fd SHA256 /sha1 $SigningThumbprint /s MY "$exe"
    if ($LASTEXITCODE -ne 0) {throw 'Bundled executable signing failed'}
}
if ($SkipExecutableSelfTest) {
    $selfTestCheck='PyInstaller runtime self-test SKIPPED by explicit local-QA option; CI remains required'
} else {
    $selfTest=Start-Process -FilePath $exe -ArgumentList '--self-test' -Wait -PassThru
    if ($selfTest.ExitCode -ne 0) {throw "Bundled launcher runtime smoke test FAILED: $($selfTest.ExitCode)"}
    $selfTestCheck='PyInstaller runtime self-test PASS'
}
New-Item $stage,$deliver -ItemType Directory -Force | Out-Null
$appRelative="VFS\ProgramFilesX64\OkinawaDesktopTools\$AppName"
$appTarget=Join-Path $stage $appRelative
New-Item $appTarget -ItemType Directory -Force | Out-Null
Copy-Item -Path "dist/$AppName/*" -Destination $appTarget -Recurse -Force
$manifestExe="$appRelative\$AppName.exe"
python store/generate_manifest.py "$stage" "$manifestExe"
if ($LASTEXITCODE -ne 0) {throw 'Manifest generator failed'}
$makeappx=Get-ChildItem -Path $sdkRoot -Filter makeappx.exe -Recurse -File |
  Where-Object { $_.FullName -match '[\\/]x64[\\/]makeappx\.exe$' } |
  Sort-Object FullName -Descending | Select-Object -First 1
if ($null -eq $makeappx) {throw 'Windows SDK MakeAppx.exe (x64) not found'}
$packageLabel=if ($SigningThumbprint) {'QA_TEST_SIGNED_LOCAL_ONLY'} else {'STORE_CANDIDATE_QA_UNSIGNED'}
$package=Join-Path $deliver ("{0}_{1}_x64_{2}.msix" -f $AppName,$cfg.version,$packageLabel)
& $makeappx.FullName pack /d "$stage" /p "$package" /o /l
if ($LASTEXITCODE -ne 0) {throw 'MakeAppx packing failed'}
if ($SigningThumbprint) {
    & $signTool.FullName sign /fd SHA256 /sha1 $SigningThumbprint /s MY "$package"
    if ($LASTEXITCODE -ne 0) {throw 'MSIX signing failed'}
    & $signTool.FullName verify /pa "$package"
    if ($LASTEXITCODE -ne 0) {throw 'MSIX signature verification failed'}
}
& $makeappx.FullName unpack /p "$package" /d "$unpack" /o /l
if ($LASTEXITCODE -ne 0) {throw 'MakeAppx unpack verification failed'}
if (-not (Test-Path (Join-Path $unpack $manifestExe))) {throw 'Packaged entrypoint is missing'}
if (-not (Test-Path (Join-Path $unpack 'Assets/Logo150.png'))) {throw 'MSIX assets are missing'}
[xml]$manifest = Get-Content -Raw -Path (Join-Path $unpack 'AppxManifest.xml')
$identity=$manifest.Package.Identity
if ($identity.Name -cne $cfg.identity_name -or
    $identity.Publisher -cne $cfg.publisher -or
    $identity.Version -cne $cfg.version -or
    $identity.ProcessorArchitecture -cne 'x64') {throw 'Package identity mismatch after unpack'}
$hash=(Get-FileHash -Path $package -Algorithm SHA256).Hash
$size=(Get-Item $package).Length
$summary=[ordered]@{
    product=$AppName
    source_sha=$env:GITHUB_SHA
    identity_name=$identity.Name
    publisher=$identity.Publisher
    version=$identity.Version
    arch=$identity.ProcessorArchitecture
    package_file=(Split-Path $package -Leaf)
    bytes=$size
    sha256=$hash
    signed=[bool]$SigningThumbprint
    signing_thumbprint=if ($SigningThumbprint) {$SigningThumbprint} else {$null}
    status=if ($SigningThumbprint) {'QA_TEST_SIGNED_LOCAL_ONLY_NOT_FOR_DISTRIBUTION'} else {'QA_UNSIGNED_NOT_INSTALLABLE_UNTIL_SIGNED'}
    checks=@($selfTestCheck,'MakeAppx pack/unpack PASS',
             'AppxManifest Identity and executable PASS','Static resource assets present PASS')
    holds=@('Windows install and WebView2 GUI runtime QA',
            'OS localStorage and SQLite data persistence QA',
            'Real Ollama response accuracy QA',
            'Sensitive data encryption and restoration',
            'WACK and Partner Center certification')
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -Encoding utf8 (Join-Path $deliver 'QA_UNSIGNED_BUILD_REPORT.json')
Write-Host "QA_UNSIGNED MSIX built: $package"
Write-Host "SIZE: $size, SHA256: $hash"
Write-Host "IMPORTANT: Do not offer this unsigned QA package as a directly installable release."
