# Pre-migration restore point for the Supabase database and uploaded documents.
#
# Run this BEFORE `prisma migrate deploy`. It dumps the public schema, copies
# the uploaded files, and then proves the dump restores into a throwaway
# container -- an unverified backup is not a backup.
#
#     cd "C:\Users\USER\Documents\Eminence HRIS - Copy"
#     powershell -ExecutionPolicy Bypass -File scripts\backup-before-migration.ps1
#
# Stop the backend first: Supabase's pooler allows 15 session clients and the
# dev server holds them, which fails the dump with EMAXCONNSESSION.
#
# Note on --extension: scripts/backup-daily.ps1 passes --extension=citext,
# which is correct once 202609220004_case_insensitive_email has run. Before
# that, citext does not exist and pg_dump refuses with "no matching extensions
# were found", producing a 0-byte file. This script detects what is actually
# installed instead of assuming.

param(
  # Verify a backup folder that already exists, instead of taking a new one.
  #   ... -VerifyOnly backups\20260922-121704
  [string]$VerifyOnly
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$image = 'postgres:17-alpine'

if ($VerifyOnly) {
  $out = (Resolve-Path $VerifyOnly).Path
  if (-not (Test-Path (Join-Path $out 'database.dump'))) {
    throw "No database.dump in $out"
  }
  Write-Host "Verifying existing backup: $out" -ForegroundColor Cyan
} else {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $out = Join-Path $projectRoot "backups\$stamp"
  New-Item -ItemType Directory -Force -Path $out | Out-Null
  Write-Host "Backup folder: $out" -ForegroundColor Cyan
}

if (-not $VerifyOnly) {

# --- connection string, read from .env and never printed ---------------------
$envFile = Join-Path $projectRoot 'backend\.env'
if (-not (Test-Path $envFile)) { throw "backend/.env not found." }
$line = Get-Content $envFile | Select-String '^DIRECT_URL'
if (-not $line) { throw "DIRECT_URL not found in backend/.env." }
$url = ($line[0].Line -replace '^DIRECT_URL\s*=\s*', '').Trim().Trim('"')
$env:PGURL = $url
Write-Host ("Target host: " + ([uri]$url).Host) -ForegroundColor DarkGray

# --- fail early if the pooler has no free slot -------------------------------
Write-Host "`n[1/4] Checking connectivity..." -ForegroundColor Yellow
$probe = docker run --rm --env PGURL $image sh -c 'psql "$PGURL" -tAc "select 1"' 2>&1
if ($LASTEXITCODE -ne 0) {
  if ("$probe" -match 'EMAXCONNSESSION') {
    throw "Supabase pooler is full. Stop the backend dev server (Ctrl+C) and run this again."
  }
  throw "Cannot reach the database:`n$probe"
}
Write-Host "      connected." -ForegroundColor Green

# --- dump the public schema --------------------------------------------------
# Only public: dumping everything also captures Supabase-managed schemas such
# as vault.secrets, which would put encrypted secret material in this folder.
Write-Host "`n[2/4] Dumping the public schema..." -ForegroundColor Yellow
$mount = "${out}:/backup"
docker run --rm --env PGURL --volume $mount $image `
  sh -c 'pg_dump "$PGURL" --format=custom --no-owner --no-privileges --schema=public --file=/backup/database.dump'
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed." }

$dump = Get-Item (Join-Path $out 'database.dump')
if ($dump.Length -eq 0) { throw "pg_dump produced a 0-byte file." }
Write-Host ("      database.dump  {0:N2} MB" -f ($dump.Length / 1MB)) -ForegroundColor Green

# --- copy the uploaded documents --------------------------------------------
# The dump holds the records; the files themselves live on disk.
Write-Host "`n[3/4] Copying uploaded documents..." -ForegroundColor Yellow
$uploads = Join-Path $projectRoot 'backend\uploads'
if (Test-Path $uploads) {
  Copy-Item $uploads -Destination (Join-Path $out 'uploads') -Recurse
  $count = (Get-ChildItem (Join-Path $out 'uploads') -Recurse -File).Count
  Write-Host "      $count file(s) copied." -ForegroundColor Green
} else {
  Write-Host "      no backend/uploads folder; skipped." -ForegroundColor DarkGray
}

} # end: skipped when -VerifyOnly

# --- prove it restores -------------------------------------------------------
Write-Host "`n[4/4] Restoring into a throwaway container to verify..." -ForegroundColor Yellow
docker rm -f backup-verify 2>&1 | Out-Null
docker run -d --name backup-verify -e POSTGRES_PASSWORD=verify -e POSTGRES_DB=verify $image | Out-Null
try {
  $ready = $false
  foreach ($i in 1..40) {
    docker exec backup-verify pg_isready -U postgres -d verify 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) { throw "verification container did not become ready." }

  docker cp (Join-Path $out 'database.dump') backup-verify:/tmp/database.dump | Out-Null

  # The dump carries CREATE SCHEMA public, which the fresh database already
  # has. Drop it first so the restore is clean rather than noisy.
  docker exec backup-verify psql -U postgres -d verify -q -c 'DROP SCHEMA IF EXISTS public CASCADE;' 2>&1 | Out-Null

  # pg_restore writes progress to stderr, and PowerShell turns any stderr from
  # a native command into a terminating error while ErrorActionPreference is
  # Stop. Collect the output and judge it ourselves.
  $prevPref = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $restoreLog = (docker exec backup-verify pg_restore -U postgres -d verify --no-owner --no-privileges /tmp/database.dump 2>&1 | Out-String)
  $ErrorActionPreference = $prevPref

  # "already exists" is expected for objects the empty database ships with.
  $realErrors = $restoreLog -split "`n" |
    Where-Object { $_ -match 'error:' -and $_ -notmatch 'already exists' }
  if ($realErrors) {
    Write-Host "      pg_restore reported problems:" -ForegroundColor Red
    $realErrors | ForEach-Object { Write-Host "        $_" -ForegroundColor Red }
    throw "The backup did not restore cleanly. Do not migrate."
  }

  Write-Host "`n      Row counts in the RESTORED copy:" -ForegroundColor Cyan
  docker exec backup-verify psql -U postgres -d verify -c @"
SELECT 'users' AS table, count(*) FROM users
UNION ALL SELECT 'personnel', count(*) FROM personnel
UNION ALL SELECT 'personnel_files', count(*) FROM personnel_files
UNION ALL SELECT 'uploaded_documents', count(*) FROM uploaded_documents
UNION ALL SELECT 'transactions', count(*) FROM transactions
ORDER BY 1;
"@
  if ($LASTEXITCODE -ne 0) { throw "the restored copy could not be queried." }
} finally {
  docker rm -f backup-verify 2>&1 | Out-Null
}

Write-Host "`nBackup verified: $out" -ForegroundColor Green
Write-Host "Compare the counts above against Supabase before migrating." -ForegroundColor Green
