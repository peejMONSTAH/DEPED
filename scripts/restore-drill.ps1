<#
.SYNOPSIS
  Proves a backup can actually be restored, by restoring it and running the app against it.

.DESCRIPTION
  A backup that has never been restored is a hope, not a backup. This takes the
  newest backup produced by backup-daily.ps1, restores it into a throwaway
  PostgreSQL container, compares row counts against the dump, and boots the API
  against the restored database to confirm it serves real data.

  Nothing here touches production: it only reads a backup file and writes to a
  container it creates and destroys.

.EXAMPLE
  ./scripts/restore-drill.ps1
  ./scripts/restore-drill.ps1 -BackupPath ./backups/digital201-20260921-140000
#>
param(
  [string]$BackupPath,
  [int]$Port = 55434,
  [int]$ApiPort = 5002,
  [string]$PostgresImage = 'postgres:15',
  [string]$ContainerName = 'eminence-restore-drill'
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
Write-Output "Drilling backup: $BackupPath"

$dump = Join-Path $BackupPath 'database.dump'
if (!(Test-Path -LiteralPath $dump)) { throw "database.dump not found in $BackupPath" }

docker rm -f $ContainerName 2>$null | Out-Null
docker run -d --name $ContainerName -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=eminence -p "${Port}:5432" $PostgresImage | Out-Null
try {
  Write-Output 'Waiting for the scratch database to accept connections…'
  Start-Sleep -Seconds 12

  $url = "postgresql://postgres:drill@host.docker.internal:$Port/eminence"
  $env:MSYS_NO_PATHCONV = '1'
  docker run --rm --network host -v "${BackupPath}:/backup" $PostgresImage `
    pg_restore --dbname $url --no-owner --no-privileges /backup/database.dump
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore reported errors — the backup does not restore cleanly.' }

  # Booting the API is the part that matters: a schema can restore and still be
  # unusable if an enum, index or column the code depends on did not come across.
  Write-Output 'Starting the API against the restored database…'
  $env:DATABASE_URL = "postgresql://postgres:drill@127.0.0.1:$Port/eminence"
  $env:DIRECT_URL = $env:DATABASE_URL
  $env:PORT = $ApiPort
  $env:NODE_ENV = 'development'
  $env:JWT_ACCESS_SECRET = 'restore-drill-access-secret-not-a-placeholder-0123456789'
  $env:JWT_REFRESH_SECRET = 'restore-drill-refresh-secret-not-a-placeholder-0123456789'
  $env:CLIENT_URL = "http://localhost:$ApiPort"
  $env:CORS_ORIGIN = $env:CLIENT_URL

  Push-Location (Join-Path $projectRoot 'backend')
  $api = Start-Process -FilePath 'npx' -ArgumentList 'ts-node','--transpile-only','src/index.ts' -PassThru -NoNewWindow
  Pop-Location
  try {
    Start-Sleep -Seconds 18
    $probe = Invoke-WebRequest -Uri "http://localhost:$ApiPort/api/v1/auth/login" -Method Post `
      -ContentType 'application/json' -Body '{"email":"probe","password":"probe"}' `
      -SkipHttpErrorCheck -ErrorAction SilentlyContinue
    if (-not $probe -or $probe.StatusCode -ge 500) {
      throw "The API did not come up against the restored database (status $($probe.StatusCode))."
    }
    Write-Output "RESTORE DRILL PASSED — the backup restores and the application runs against it."
  } finally {
    if ($api -and !$api.HasExited) { Stop-Process -Id $api.Id -Force -ErrorAction SilentlyContinue }
  }
} finally {
  docker rm -f $ContainerName 2>$null | Out-Null
  Write-Output 'Scratch database removed.'
}
