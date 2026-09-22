param(
  [int]$RetentionDays = 14,
  [string]$PostgresImage = 'postgres:17-alpine'
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$environmentPath = Join-Path $projectRoot 'backend/.env'
$backupRoot = Join-Path $projectRoot 'backups'
$logRoot = Join-Path $backupRoot 'logs'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $backupRoot "digital201-$stamp"
$logPath = Join-Path $logRoot "backup-$stamp.log"

New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

function Write-BackupLog([string]$Message) {
  $line = "[$((Get-Date).ToString('s'))] $Message"
  Add-Content -LiteralPath $logPath -Value $line -Encoding utf8
  Write-Output $line
}

function Read-DotEnvValue([string]$Name) {
  $line = Get-Content -LiteralPath $environmentPath |
    Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
    Select-Object -First 1
  if (!$line) { return $null }
  return (($line -split '=', 2)[1]).Trim().Trim('"').Trim("'")
}

try {
  if (!(Test-Path -LiteralPath $environmentPath)) {
    throw "Environment file not found: $environmentPath"
  }

  $databaseUrl = Read-DotEnvValue 'DIRECT_URL'
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    $databaseUrl = Read-DotEnvValue 'DATABASE_URL'
  }
  if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    throw 'Neither DIRECT_URL nor DATABASE_URL is configured.'
  }

  # Prisma-only pooler parameters are not understood by pg_dump/libpq.
  $databaseUrl = $databaseUrl -replace '([?&])(pgbouncer|connection_limit)=[^&]*&?', '$1'
  $databaseUrl = $databaseUrl.TrimEnd('?').Replace('?&', '?')

  if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker Desktop is required because PostgreSQL client tools are not installed locally.'
  }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop is not running or is not accessible.'
  }

  # Only the public schema: that is the whole application. Dumping everything also
  # captured Supabase-managed schemas including vault.secrets, putting encrypted
  # secret material in the backup folder and making the archive restorable only
  # onto Supabase.
  Write-BackupLog 'Starting PostgreSQL database export (public schema).'
  $env:DIGITAL201_BACKUP_DATABASE_URL = $databaseUrl
  $mountPath = $backupPath.Replace('\', '/')
  docker run --rm --env DIGITAL201_BACKUP_DATABASE_URL --volume "${mountPath}:/backup" $PostgresImage `
    sh -c 'pg_dump "$DIGITAL201_BACKUP_DATABASE_URL" --format=custom --no-owner --no-privileges --schema=public --extension=citext --file=/backup/database.dump'
  if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL database export failed.' }
  if (!(Test-Path -LiteralPath (Join-Path $backupPath 'database.dump'))) { throw 'Database dump was not created.' }

  foreach ($source in @(
    @{ Path = 'backend/uploads'; Destination = 'uploads' },
    @{ Path = 'backend/assets/forms'; Destination = 'forms' }
  )) {
    $sourcePath = Join-Path $projectRoot $source.Path
    if (Test-Path -LiteralPath $sourcePath) {
      Copy-Item -LiteralPath $sourcePath -Destination (Join-Path $backupPath $source.Destination) -Recurse
    }
  }

  # Production stores documents in Supabase Storage, not backend/uploads, so the
  # copy above captures nothing there. Pull the objects and reconcile them against
  # the rows that reference them; a backup missing referenced files must fail
  # rather than sit on disk looking complete.
  Write-BackupLog 'Starting document object-storage export.'
  if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js is required to export document object storage.'
  }
  Push-Location $projectRoot
  try {
    node (Join-Path $projectRoot 'backend/scripts/backup-storage.mjs') $backupPath 2>&1 | ForEach-Object { Write-BackupLog $_ }
    if ($LASTEXITCODE -ne 0) {
      throw 'Document object-storage export failed or found referenced documents missing from the backup.'
    }
  } finally {
    Pop-Location
  }

  $checksums = Get-ChildItem -LiteralPath $backupPath -File -Recurse | ForEach-Object {
    @{
      path = $_.FullName.Substring($backupPath.Length).TrimStart([char[]]@('\', '/'))
      sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
      bytes = $_.Length
    }
  }
  @{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    retentionDays = $RetentionDays
    files = @($checksums)
    scope = 'PostgreSQL public data, local uploads, and pinned form assets'
  } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupPath 'manifest.json') -Encoding utf8

  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -LiteralPath $backupRoot -Directory -Filter 'digital201-*' |
    Where-Object { $_.CreationTime -lt $cutoff } |
    ForEach-Object {
      $resolved = $_.FullName
      if ($resolved.StartsWith($backupRoot, [StringComparison]::OrdinalIgnoreCase)) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
        Write-BackupLog "Removed expired backup: $($_.Name)"
      }
    }

  Write-BackupLog "Backup completed successfully: $backupPath"
  exit 0
} catch {
  Write-BackupLog "BACKUP FAILED: $($_.Exception.Message)"
  if (Test-Path -LiteralPath $backupPath) {
    $failedPath = "$backupPath-failed"
    Move-Item -LiteralPath $backupPath -Destination $failedPath -Force
  }
  exit 1
} finally {
  Remove-Item Env:DIGITAL201_BACKUP_DATABASE_URL -ErrorAction SilentlyContinue
}
