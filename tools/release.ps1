<#
.SYNOPSIS
    Release một phiên bản HP Action LIVE — chạy trọn từ build tới lúc máy khách thấy modal cập nhật.

.DESCRIPTION
    Gộp toàn bộ RELEASE-WORKFLOW.md vào MỘT lệnh. Trước đây mỗi bản phải chép tay một file
    publish-vX.Y.Z.ps1 rồi sửa số ở 4 chỗ — sai một chỗ là publish nhầm metadata cho file khác.
    Giờ số hiệu chỉ nằm ở package.json, mọi thứ khác suy ra từ đó.

    CHẠY LẠI ĐƯỢC. Mỗi bước tự kiểm đã làm chưa rồi mới làm, nên nếu đứt giữa chừng (mạng rớt
    lúc upload 120MB chẳng hạn) thì chạy lại là nó đi tiếp từ chỗ dở, không làm lại từ đầu và
    không tạo tag/release trùng.

.PARAMETER SkipBuild
    Bỏ qua npm run build:win khi installer đã build sẵn và code chưa đổi.

.PARAMETER DryRun
    Chạy hết phần kiểm tra rồi in ra những gì SẼ làm, không đẩy gì ra ngoài. Nên chạy trước.

.PARAMETER NotesFile
    File ghi chú phát hành. Mặc định release-notes\<version>.md.

.EXAMPLE
    .\tools\release.ps1 -DryRun
    .\tools\release.ps1
    .\tools\release.ps1 -SkipBuild

.NOTES
    Cần trước:
      $env:HP_ADMIN_TOKEN = "<token license.hpvn.media>"   (không bao giờ ghi vào file này)
      gh auth login
#>

[CmdletBinding()]
param(
    [switch]$SkipBuild,
    [switch]$DryRun,
    [string]$NotesFile
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$BASE_URL = "https://license.hpvn.media"

function Say    ($m) { Write-Host $m -ForegroundColor Cyan }
function Good   ($m) { Write-Host "  OK   $m" -ForegroundColor Green }
function Skip   ($m) { Write-Host "  BO   $m (da lam roi)" -ForegroundColor DarkGray }
function Warn   ($m) { Write-Host "  !    $m" -ForegroundColor Yellow }
function Die    ($m) { Write-Host "DUNG: $m" -ForegroundColor Red; exit 1 }
function Would  ($m) { Write-Host "  ->   SE LAM: $m" -ForegroundColor Magenta }

# ─── Lấy số hiệu từ package.json — nguồn sự thật duy nhất ────────────────────
$pkg = Get-Content package.json -Raw | ConvertFrom-Json
$VERSION  = $pkg.version
$TAG      = "v$VERSION"
$FILENAME = "HP-Action-LIVE-Setup-$VERSION.exe"
$FILEPATH = "dist\$FILENAME"
if (-not $NotesFile) { $NotesFile = "release-notes\$VERSION.md" }

Write-Host ""
Say "HP Action LIVE — release $TAG"
if ($DryRun) { Warn "DRY RUN — khong day gi ra ngoai" }
Write-Host ""

# ─── PREFLIGHT ───────────────────────────────────────────────────────────────
# Kiểm hết một lượt rồi mới làm, để không đứt ở giữa với nửa release đã đẩy đi.
Say "1/8  Kiem tra dieu kien"

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
Good "nhanh $branch"

$dirty = git status --porcelain
if ($dirty) {
    Write-Host ($dirty | Select-Object -First 10 | Out-String)
    Die "Working tree con thay doi chua commit. Commit hoac stash truoc khi release."
}
Good "working tree sach"

# Tag đã tồn tại mà trỏ vào commit KHÁC nghĩa là số hiệu này đã dùng cho bản khác rồi.
$head = (git rev-parse HEAD).Trim()
$existingTag = git tag -l $TAG
if ($existingTag) {
    $tagCommit = (git rev-list -n 1 $TAG).Trim()
    if ($tagCommit -ne $head) {
        Die "Tag $TAG da ton tai nhung tro vao commit khac ($($tagCommit.Substring(0,8))). Bump version trong package.json truoc."
    }
}

if (-not (Test-Path $NotesFile)) {
    Die "Thieu file ghi chu $NotesFile. Viet ghi chu phat hanh roi chay lai — user se doc no trong modal cap nhat."
}
$notes = Get-Content $NotesFile -Raw
if ($notes.Trim().Length -lt 20) { Die "$NotesFile qua ngan, viet tu te vao." }
Good "ghi chu $NotesFile ($($notes.Trim().Length) ky tu)"

if (-not $env:HP_ADMIN_TOKEN) {
    Die 'Thieu $env:HP_ADMIN_TOKEN. Chay: $env:HP_ADMIN_TOKEN = "<token>"'
}
Good "co HP_ADMIN_TOKEN"

gh auth status | Out-Null
if ($LASTEXITCODE -ne 0) { Die "gh chua dang nhap. Chay: gh auth login" }
Good "gh da dang nhap"

# ─── BUILD ───────────────────────────────────────────────────────────────────
Say "2/8  Build installer"
if ($SkipBuild) {
    if (-not (Test-Path $FILEPATH)) { Die "-SkipBuild nhung khong thay $FILEPATH" }
    Skip "npm run build:win"
} elseif ($DryRun) {
    Would "npm run build:win"
} else {
    npm run build:win
    if ($LASTEXITCODE -ne 0) { Die "build that bai" }
    Good "da build"
}
if (-not (Test-Path $FILEPATH)) {
    if ($DryRun) { Warn "chua co $FILEPATH (dry run)" } else { Die "khong thay $FILEPATH sau khi build" }
}

# ─── KIỂM RUỘT INSTALLER ─────────────────────────────────────────────────────
# Đây là chốt chặn quan trọng nhất: đẩy lên license-server là toàn bộ máy khách nhận,
# nên phải chắc file trong asar đủ TRƯỚC khi đẩy, không phải sau khi khách báo lỗi.
Say "3/8  Kiem ruot installer (doc xuyen asar bang Electron that)"
if ((Test-Path "dist\win-unpacked\resources\app.asar")) {
    npx --no-install electron tools\verify-build.js
    if ($LASTEXITCODE -ne 0) { Die "installer thieu file — xem danh sach o tren" }
} elseif ($DryRun) {
    Would "npx electron tools\verify-build.js"
} else {
    Die "khong thay dist\win-unpacked\resources\app.asar"
}

# ─── HASH ────────────────────────────────────────────────────────────────────
Say "4/8  Tinh SHA-256"
if (Test-Path $FILEPATH) {
    $SHA256 = (Get-FileHash -Path $FILEPATH -Algorithm SHA256).Hash.ToLower()
    $SIZE   = (Get-Item $FILEPATH).Length
    Good "$SIZE byte ($([math]::Round($SIZE/1MB,1)) MB)"
    Good "sha256 $SHA256"
} else {
    $SHA256 = "(chua build)"; $SIZE = 0
}

# ─── TAG + PUSH ──────────────────────────────────────────────────────────────
Say "5/8  Tag va push (backup tren GitHub)"
if ($existingTag) {
    Skip "tag $TAG"
} elseif ($DryRun) {
    Would "git tag -a $TAG"
} else {
    git tag -a $TAG -m "$TAG"
    if ($LASTEXITCODE -ne 0) { Die "tao tag that bai" }
    Good "tao tag $TAG"
}

if ($DryRun) {
    Would "git push origin $branch; git push origin $TAG"
} else {
    git push origin $branch
    if ($LASTEXITCODE -ne 0) { Die "push nhanh that bai" }
    Good "push nhanh $branch"

    $remoteTag = git ls-remote --tags origin $TAG
    if ($remoteTag) {
        Skip "push tag $TAG"
    } else {
        git push origin $TAG
        if ($LASTEXITCODE -ne 0) { Die "push tag that bai" }
        Good "push tag $TAG"
    }
}

# ─── GITHUB RELEASE (kênh backup, admin dùng để rollback) ────────────────────
Say "6/8  GitHub Release (kenh backup)"
gh release view $TAG | Out-Null
$releaseExists = ($LASTEXITCODE -eq 0)
if ($releaseExists) {
    Skip "gh release create $TAG"
} elseif ($DryRun) {
    Would "gh release create $TAG (dinh kem $FILENAME)"
} else {
    # --notes-file chu khong nhet ghi chu vao dong lenh: ghi chu nhieu dong nhet thang vao
    # tham so lam dong lenh dai loang ngoang, vua kho doc vua de vo cu phap.
    gh release create $TAG $FILEPATH --title "$TAG" --notes-file $NotesFile
    if ($LASTEXITCODE -ne 0) { Die "tao GitHub release that bai" }
    Good "da tao release $TAG kem installer"
}

# ─── UPLOAD LÊN LICENSE-SERVER (kênh chính, máy khách tự tải) ────────────────
Say "7/8  Upload installer len $BASE_URL"
$headersAuth = @{ "Authorization" = "Bearer $env:HP_ADMIN_TOKEN" }

if ($DryRun) {
    Would "POST $BASE_URL/admin/api/upload-installer  ($FILENAME)"
} else {
    $bytes = [IO.File]::ReadAllBytes((Resolve-Path $FILEPATH))
    $up = Invoke-RestMethod -Uri "$BASE_URL/admin/api/upload-installer" -Method Post `
        -Headers ($headersAuth + @{ "X-Filename" = $FILENAME; "Content-Type" = "application/octet-stream" }) `
        -Body $bytes -TimeoutSec 900
    if (-not $up.ok) { Die "upload tra ve: $($up | ConvertTo-Json -Compress)" }
    # Server tu bam lai hash tu file NO nhan duoc. Lech nghia la file di duong truyen bi hong,
    # publish tiep la may khach tai ve mot file hong ma checksum van "khop" theo metadata sai.
    if ($up.sha256.ToLower() -ne $SHA256) {
        Die "SHA256 server ($($up.sha256)) khac local ($SHA256) — file loi duong truyen, DUNG lai."
    }
    Good "upload xong, sha256 khop"
}

# ─── PUBLISH METADATA — bước làm máy khách thấy modal ────────────────────────
Say "8/8  Publish metadata (tu day may khach thay modal cap nhat)"
if ($DryRun) {
    Would "POST $BASE_URL/admin/api/publish-version  version=$VERSION"
    Write-Host ""
    Say "DRY RUN xong — chua day gi. Bo -DryRun de chay that."
    exit 0
}

$publishBody = @{
    version  = $VERSION
    filename = $FILENAME
    sha256   = $SHA256
    size     = $SIZE
    notes    = $notes
} | ConvertTo-Json

$pub = Invoke-RestMethod -Uri "$BASE_URL/admin/api/publish-version" -Method Post `
    -Headers ($headersAuth + @{ "Content-Type" = "application/json" }) -Body $publishBody
if (-not $pub.ok) { Die "publish tra ve: $($pub | ConvertTo-Json -Compress)" }
Good "publish version=$($pub.info.version)"

# Doc nguoc lai tu API cong khai — day moi la thu may khach that su nhin thay.
Start-Sleep -Seconds 2
$live = Invoke-RestMethod -Uri "$BASE_URL/api/version" -TimeoutSec 30
if ($live.version -ne $VERSION) {
    Warn "API /api/version dang tra '$($live.version)', khong phai '$VERSION' — kiem tra lai server."
} else {
    Good "/api/version da tra $VERSION"
}

Write-Host ""
Write-Host "XONG — $TAG da phat hanh. May khach mo app se thay modal cap nhat." -ForegroundColor Magenta
Write-Host "  Kiem tra:  $BASE_URL/api/version" -ForegroundColor Gray
Write-Host "  Backup  :  gh release view $TAG --web" -ForegroundColor Gray
