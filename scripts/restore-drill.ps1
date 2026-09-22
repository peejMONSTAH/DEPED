<# Restores a backup into an owned scratch container; verifies checksums and API readiness.
   Never modifies existing containers or delivers emails from a restored outbox. #>
param(
  [Parameter(Mandatory = $true)][string]$BackupPath,
  [int]$Port = 55434,
  [int]$ApiPort = 5002,
  [string]$PostgresImage = 'postgres:17-alpine',
  [switch]$ApplyMigrations
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$backupDirectory = (Resolve-Path -LiteralPath $BackupPath).Path
$dump = Join-Path $backupDirectory 'database.dump'
if (!(Test-Path -LiteralPath $dump)) { throw 'database.dump is missing.' }
$manifest = Get-Content -LiteralPath (Join-Path $backupDirectory 'manifest.json') -Raw | ConvertFrom-Json
if (!$manifest.files -or !($manifest.files | Where-Object { $_.path -eq 'database.dump' })) { throw 'Backup has no database checksum.' }
foreach ($entry in $manifest.files) {
  $target = [IO.Path]::GetFullPath((Join-Path $backupDirectory $entry.path))
  if (!$target.StartsWith($backupDirectory.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe path in backup manifest.' }
  if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Backup checksum mismatch: $($entry.path)" }
}
foreach ($candidatePort in @($Port, $ApiPort)) {
  if (Get-NetTCPConnection -State Listen -LocalPort $candidatePort -ErrorAction SilentlyContinue) { throw "Port $candidatePort is already in use. Choose a different port." }
}
$containerName = 'digital201-restore-' + [Guid]::NewGuid().ToString('N').Substring(0, 12)
$containerCreated = $false
$apiProcess = $null
$environmentNames = @('DATABASE_URL', 'DIRECT_URL', 'PORT', 'NODE_ENV', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'CLIENT_URL', 'CORS_ORIGIN', 'API_HOST', 'WORKFLOW_OUTBOX_ENABLED')
$savedEnvironment = @{}
foreach ($name in $environmentNames) { $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  docker run -d --name $containerName --label digital201.task=restore-drill -e POSTGRES_PASSWORD=drill -e POSTGRES_DB=digital201_restore_test -p "127.0.0.1:${Port}:5432" $PostgresImage | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not create scratch database.' }
  $containerCreated = $true
  $databaseReady = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    docker exec $containerName pg_isready -U postgres *> $null
    if ($LASTEXITCODE -eq 0) { $databaseReady = $true; break }
    Start-Sleep -Seconds 1
  }
  if (!$databaseReady) { throw 'Scratch database did not become ready.' }
  docker cp $dump "${containerName}:/tmp/database.dump"
  if ($LASTEXITCODE -ne 0) { throw 'Could not copy backup to scratch database.' }
  docker exec $containerName psql -U postgres -d digital201_restore_test -v ON_ERROR_STOP=1 -c 'DROP SCHEMA public CASCADE;'
  if ($LASTEXITCODE -ne 0) { throw 'Could not prepare scratch schema.' }
  docker exec $containerName pg_restore -U postgres -d digital201_restore_test --exit-on-error --no-owner --no-privileges /tmp/database.dump
  if ($LASTEXITCODE -ne 0) { throw 'Backup did not restore cleanly.' }
  $env:DATABASE_URL = "postgresql://postgres:drill@127.0.0.1:$Port/digital201_restore_test"
  $env:DIRECT_URL = $env:DATABASE_URL
  $env:PORT = "$ApiPort"
  $env:API_HOST = '127.0.0.1'
  $env:NODE_ENV = 'test'
  $env:WORKFLOW_OUTBOX_ENABLED = 'false'
  $env:JWT_ACCESS_SECRET = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  $env:JWT_REFRESH_SECRET = [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
  $env:CLIENT_URL = "http://127.0.0.1:$ApiPort"
  $env:CORS_ORIGIN = $env:CLIENT_URL
  $backendDir = Join-Path $projectRoot 'backend'
  if ($ApplyMigrations) {
    Push-Location $backendDir
    try { npx prisma migrate deploy; if ($LASTEXITCODE -ne 0) { throw 'Migrations failed against the restored copy. Do not deploy.' } }
    finally { Pop-Location }
  }
  # Start Node directly so cleanup targets only the process this script owns.
  $apiProcess = Start-Process -FilePath (Get-Command node).Source -ArgumentList '-r', 'ts-node/register/transpile-only', 'src/index.ts' -WorkingDirectory $backendDir -PassThru -WindowStyle Hidden
  $ready = $false
  for ($attempt = 0; $attempt -lt 40; $attempt++) {
    if ($apiProcess.HasExited) { throw 'Scratch API exited during startup.' }
    try {
      $probe = Invoke-RestMethod -Uri "http://127.0.0.1:$ApiPort/ready" -TimeoutSec 2
      if ($probe.status -eq 'ready') { $ready = $true; break }
    } catch { }
    Start-Sleep -Seconds 1
  }
  if (!$ready) { throw 'Restored API failed its database-backed readiness check.' }
  Write-Output 'RESTORE DRILL PASSED: checksums, database restore, API readiness. Object re-upload and user flows still require a staging rehearsal.'
} finally {
  if ($apiProcess -and !$apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue }
  if ($containerCreated) {
    $owner = docker inspect --format '{{ index .Config.Labels "digital201.task" }}' $containerName
    if ($owner -eq 'restore-drill') { docker rm -f $containerName | Out-Null }
  }
  foreach ($name in $environmentNames) { [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process') }
}
