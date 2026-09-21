<#
.SYNOPSIS
  Proves a backup can actually be restored, by restoring it and running the app against it.

.DESCRIPTION
  A backup nobody has restored is a hope, not a backup. This takes a backup
  produced by backup-daily.ps1, restores it into a throwaway PostgreSQL
  container, and boots the API against the restored database. Booting the API is
  the point: a schema can pg_restore cleanly and still be unusable if an enum,
  index or column the code depends on did not come across.

  Nothing here touches production. It reads a backup file and writes only to a
  container it creates and destroys.

.EXAMPLE
  ./scripts/restore-drill.ps1
  ./scripts/restore-drill.ps1 -BackupPath ./backups/digital201-20260921-152234
#>
param(
  [string]$BackupPath,
  [int]$Port = 55434,
  [int]$ApiPort = 5002,
  # Must match backup-daily.ps1: a pg_dump 17 archive cannot be read by pg_restore 15.
  [string]$PostgresImage = 'postgres:17-alpine',
  [string]$ContainerName = 'eminence-restore-drill',
  # Rehearses the deploy on a restored copy of real data: applies any pending
  # migrations before booting the API. Without this the drill fails against a
  # pre-migration backup, which is correct but not what you want to test before
  # a release.
  [switch]$ApplyMigrations
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent

if (!$BackupPath) {
  $newest = Get-ChildItem -LiteralPath (Join-Path $projectRoot 'backups') -Directory -ErrorAction SilentlyContinue |
    Where-Object { Test-Path (Join-Path $_.FullName 'database.dump') } |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (!$newest) { throw 'No backup containing database.dump was found under ./backups.' }
  $BackupPath = $newest.FullName
}

$dump = Join-Path $BackupPath 'database.dump'
if (!(Test-Path -LiteralPath $dump)) { throw "database.dump not found in $BackupPath" }
Write-Output "Drilling backup: $BackupPath"

docker rm -f $ContainerName 2>$null | Out-Null
docker run -d --name $ContainerName -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=eminence -p "${Port}:5432" $PostgresImage | Out-Null

$apiProcess = $null
try {
  Write-Output 'Waiting for the scratch database to accept connections.'
  Start-Sleep -Seconds 14

  $restoreUrl = "postgresql://postgres:drill@host.docker.internal:$Port/eminence"
  $env:MSYS_NO_PATHCONV = '1'

  # A fresh database already has an empty public schema, so the dump's CREATE
  # SCHEMA would fail. Drop it first so a clean restore really is zero errors:
  # relaxing the check instead would hide genuine failures later.
  docker run --rm --network host $PostgresImage psql $restoreUrl -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE;" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the scratch database.' }
  docker run --rm --network host -v "${BackupPath}:/backup" $PostgresImage `
    pg_restore --dbname $restoreUrl --no-owner --no-privileges /backup/database.dump
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore reported errors. The backup does not restore cleanly.' }
  Write-Output 'Restore completed without errors.'

  $env:DATABASE_URL = "postgresql://postgres:drill@127.0.0.1:$Port/eminence"
  $env:DIRECT_URL = $env:DATABASE_URL

  if ($ApplyMigrations) {
    Write-Output 'Applying pending migrations to the restored copy.'
    Push-Location (Join-Path $projectRoot 'backend')
    try {
      npx prisma migrate deploy
      if ($LASTEXITCODE -ne 0) { throw 'Migrations failed against a restored copy of production. Do not deploy.' }
    } finally { Pop-Location }
  }

  Write-Output 'Starting the API against the restored database.'
  $env:DATABASE_URL = "postgresql://postgres:drill@127.0.0.1:$Port/eminence"
  $env:DIRECT_URL = $env:DATABASE_URL
  $env:PORT = "$ApiPort"
  $env:NODE_ENV = 'development'
  $env:JWT_ACCESS_SECRET = 'restore-drill-access-secret-not-a-placeholder-0123456789'
  $env:JWT_REFRESH_SECRET = 'restore-drill-refresh-secret-not-a-placeholder-0123456789'
  $env:CLIENT_URL = "http://localhost:$ApiPort"
  $env:CORS_ORIGIN = $env:CLIENT_URL

  $backendDir = Join-Path $projectRoot 'backend'
  $apiProcess = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', 'npx ts-node --transpile-only src/index.ts' `
    -WorkingDirectory $backendDir -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 22

  $reachable = $false
  try {
    $probe = Invoke-WebRequest -Uri "http://localhost:$ApiPort/api/v1/auth/login" -Method Post `
      -ContentType 'application/json' -Body '{"email":"drill","password":"drill"}' -TimeoutSec 20
    $reachable = $true
  } catch {
    # A 401 for bogus credentials is the healthy answer and arrives as an exception.
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -ge 400 -and $status -lt 500) { $reachable = $true }
    else { Write-Output "API probe failed: $($_.Exception.Message)" }
  }

  if (!$reachable) { throw 'The API did not come up against the restored database.' }
  Write-Output 'RESTORE DRILL PASSED. The backup restores and the application runs against it.'
} finally {
  if ($apiProcess -and !$apiProcess.HasExited) {
    Stop-Process -Id $apiProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Get-NetTCPConnection -State Listen -LocalPort $ApiPort -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
  docker rm -f $ContainerName 2>$null | Out-Null
  Write-Output 'Scratch database removed.'
}
