param(
  [Parameter(Mandatory=$true)][string]$DatabaseContainer,
  [string]$Database = 'postgres',
  [string]$DatabaseUser = 'postgres'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupPath = Join-Path $projectRoot "backups/digital201-$stamp"
New-Item -ItemType Directory -Path $backupPath | Out-Null
$remoteDump = "/tmp/digital201-$stamp.dump"
# Stop API writes before invoking this script for a consistent DB/file snapshot.
docker exec $DatabaseContainer pg_dump -U $DatabaseUser -d $Database --schema=public --format=custom --no-owner --no-privileges --file=$remoteDump
if ($LASTEXITCODE -ne 0) { throw 'Database backup failed; do not run a migration.' }
docker cp "${DatabaseContainer}:$remoteDump" (Join-Path $backupPath 'database.dump')
if ($LASTEXITCODE -ne 0) { throw 'Could not copy database backup.' }
$uploadPath = Join-Path $projectRoot 'backend/uploads'
if (Test-Path -LiteralPath $uploadPath) { Copy-Item -LiteralPath $uploadPath -Destination (Join-Path $backupPath 'uploads') -Recurse }
$formPath = Join-Path $projectRoot 'backend/assets/forms'
if (Test-Path -LiteralPath $formPath) { Copy-Item -LiteralPath $formPath -Destination (Join-Path $backupPath 'forms') -Recurse }
$checksums = Get-ChildItem -LiteralPath $backupPath -File -Recurse | ForEach-Object {
  @{ path = [IO.Path]::GetRelativePath($backupPath, $_.FullName); sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
}
@{ createdAt = (Get-Date).ToUniversalTime().ToString('o'); database = $Database; files = @($checksums); scope = 'public schema, local uploads including drafts, pinned form assets' } |
  ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $backupPath 'manifest.json') -Encoding utf8
Write-Output "Backup saved: $backupPath"
