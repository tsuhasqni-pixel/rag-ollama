param([Parameter(Mandatory=$true)][string]$AppName)
$ErrorActionPreference = 'Stop'
if ($AppName -notin @('DaymarkAI','FolioAI')) { throw "Unexpected product: $AppName" }
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$cfg=Get-Content (Join-Path $root 'store/product.json') -Raw | ConvertFrom-Json
if ($cfg.product -cne $AppName -or $cfg.release_status -cne 'QA_UNSIGNED_HOLD') {
    throw 'Packaging identity or unsigned QA state is unexpected'
}
$extra=@()
foreach ($f in @('index.html','app.js','diary_recall.js','style.css')) {
    if (Test-Path $f) { $extra+=@('--add-data', "$f;.") }
}
$pyArgs=@('-m','PyInstaller','--noconfirm','--clean','--windowed','--onedir',
    '--name',$AppName,'--paths','.','--collect-all','webview')+$extra+
    @('store/windows_launcher.py')
& python @pyArgs
if ($LASTEXITCODE -ne 0) {throw "PyInstaller failed: $LASTEXITCODE"}
$exe=Join-Path $root "dist/$AppName/$AppName.exe"
if (-not (Test-Path $exe)) {throw "Built Windows executable not found: $exe"}
& $exe --self-test
if ($LASTEXITCODE -ne 0) {throw "Bundled launcher runtime smoke test FAILED: $LASTEXITCODE"}
$stage=Join-Path $root 'msix-stage'
$deliver=Join-Path $root 'msix-out'
New-Item $stage,$deliver -ItemType Directory -Force | Out-Null
$appRelative="VFS\ProgramFilesX64\OkinawaDesktopTools\$AppName"
$appTarget=Join-Path $stage $appRelative
New-Item $appTarget -ItemType Directory -Force | Out-Null
Copy-Item -Path "dist/$AppName/*" -Destination $appTarget -Recurse -Force
$manifestExe="$appRelative\$AppName.exe"
python store/generate_manifest.py "$stage" "$manifestExe"
if ($LASTEXITCODE -ne 0) {throw 'Manifest generator failed'}
$sdkRoot=Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Windows Kits/10/bin'
if (-not (Test-Path $sdkRoot)) {throw 'Windows 10 SDK bin directory is missing'}
$makeappx=Get-ChildItem -Path $sdkRoot -Filter makeappx.exe -Recurse -File |
  Where-Object { $_.FullName -match '[\\/]x64[\\/]makeappx\.exe$' } |
  Sort-Object FullName -Descending | Select-Object -First 1
if ($null -eq $makeappx) {throw 'Windows SDK MakeAppx.exe (x64) not found'}
$package=Join-Path $deliver ("{0}_{1}_x64_STORE_CANDIDATE_QA_UNSIGNED.msix" -f $AppName,$cfg.version)
& $makeappx.FullName pack /d "$stage" /p "$package" /o /l
if ($LASTEXITCODE -ne 0) {throw 'MakeAppx packing failed'}
$unpack=Join-Path $root 'msix-verify'
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
    signed=$false
    status='QA_UNSIGNED_NOT_INSTALLABLE_UNTIL_SIGNED'
    checks=@('PyInstaller runtime self-test PASS','MakeAppx pack/unpack PASS',
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
