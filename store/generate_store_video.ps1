$ErrorActionPreference = 'Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$shots=Join-Path $root 'store-assets/screenshots/ja-JP'
$out=Join-Path $root 'store-assets/video'
New-Item -ItemType Directory -Force $out | Out-Null
$video=Join-Path $out 'FolioAI_Store_Trailer_ja-JP.mp4'
$thumbnail=Join-Path $out 'FolioAI_Store_Trailer_Thumbnail_ja-JP.png'
$ffmpeg=(Get-Command ffmpeg -ErrorAction Stop).Source
$ffprobe=(Get-Command ffprobe -ErrorAction Stop).Source
$inputs=@(
    '01-document-search.png','02-search-results.png','03-document-add.png',
    '04-full-document.png','05-ai-answer.png'
)
$args=@('-y')
foreach($name in $inputs){
    $path=Join-Path $shots $name
    if(-not (Test-Path -LiteralPath $path)){throw "Missing Store screenshot: $name"}
    $args+=@('-loop','1','-framerate','30','-t','5','-i',$path)
}
$args+=@('-f','lavfi','-t','25','-i','anullsrc=channel_layout=stereo:sample_rate=48000',
    '-filter_complex','[0:v]format=yuv420p[v0];[1:v]format=yuv420p[v1];[2:v]format=yuv420p[v2];[3:v]format=yuv420p[v3];[4:v]format=yuv420p[v4];[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0[v]',
    '-map','[v]','-map','5:a','-c:v','libx264','-profile:v','high','-pix_fmt','yuv420p',
    '-r','30','-g','15','-keyint_min','15','-bf','2','-b:v','12M','-maxrate','20M',
    '-bufsize','40M','-c:a','aac','-b:a','384k','-ar','48000','-ac','2','-shortest',
    '-movflags','+faststart','-metadata','title=Folio AI - Local document search',$video)
& $ffmpeg @args
if($LASTEXITCODE -ne 0){throw 'ffmpeg Store trailer generation failed'}
Copy-Item -LiteralPath (Join-Path $shots '02-search-results.png') -Destination $thumbnail -Force
$probeText=& $ffprobe -v error -show_entries 'format=duration,size:stream=codec_type,codec_name,profile,width,height,pix_fmt,channels,sample_rate' -of json $video
if($LASTEXITCODE -ne 0){throw 'ffprobe Store trailer inspection failed'}
$probe=$probeText | ConvertFrom-Json
$videoStream=$probe.streams | Where-Object codec_type -eq 'video' | Select-Object -First 1
$audioStream=$probe.streams | Where-Object codec_type -eq 'audio' | Select-Object -First 1
if($videoStream.codec_name -cne 'h264' -or $videoStream.profile -cne 'High' -or
   $videoStream.width -ne 1920 -or $videoStream.height -ne 1080 -or
   $videoStream.pix_fmt -cne 'yuv420p') {throw 'Store trailer video stream is not compliant'}
if($audioStream.codec_name -cne 'aac' -or $audioStream.channels -ne 2 -or
   [int]$audioStream.sample_rate -ne 48000) {throw 'Store trailer audio stream is not compliant'}
if([double]$probe.format.duration -gt 60 -or [long]$probe.format.size -ge 2GB){
    throw 'Store trailer duration or size exceeds the Microsoft Store limit'
}
Add-Type -AssemblyName System.Drawing
$image=[System.Drawing.Image]::FromFile($thumbnail)
try {
    if($image.Width -ne 1920 -or $image.Height -ne 1080){throw 'Store trailer thumbnail must be 1920x1080'}
} finally {$image.Dispose()}
$report=[ordered]@{
    title='Folio AI - ローカル資料検索'
    file=(Split-Path $video -Leaf)
    thumbnail=(Split-Path $thumbnail -Leaf)
    duration_seconds=[double]$probe.format.duration
    bytes=[long]$probe.format.size
    video_codec=$videoStream.codec_name
    video_profile=$videoStream.profile
    width=$videoStream.width
    height=$videoStream.height
    pixel_format=$videoStream.pix_fmt
    audio_codec=$audioStream.codec_name
    audio_channels=$audioStream.channels
    audio_sample_rate=[int]$audioStream.sample_rate
    status='TECHNICALLY_READY_FOR_OPTIONAL_STORE_UPLOAD_NOT_UPLOADED'
}
$report | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $out 'FolioAI_Store_Trailer_Report.json')
Write-Host 'Folio Store trailer technical validation PASS'
