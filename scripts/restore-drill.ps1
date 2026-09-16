param(
  [Parameter(Mandatory=$true)][string]$DatabaseContainer,
  [Parameter(Mandatory=$true)][string]$BackupPath,
  [string]$DatabaseUser = 'postgres'
)
$ErrorActionPreference = 'Stop'
$backupDirectory = (Resolve-Path -LiteralPath $BackupPath).Path
$manifest = Get-Content -LiteralPath (Join-Path $backupDirectory 'manifest.json') -Raw | ConvertFrom-Json
foreach ($entry in $manifest.files) {
  $filePath = [IO.Path]::GetFullPath((Join-Path $backupDirectory $entry.path))
  if (!$filePath.StartsWith($backupDirectory + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe backup manifest path.' }
  if ((Get-FileHash -LiteralPath $filePath -Algorithm SHA256).Hash -ne $entry.sha256) { throw "Checksum mismatch: $($entry.path)" }
}
# Generated name only: this script cannot target the live database.
$drillDatabase = 'digital201_restore_' + (Get-Date -Format 'yyyyMMddHHmmss')
$remoteDump = "/tmp/$drillDatabase.dump"
docker cp (Join-Path $backupDirectory 'database.dump') "${DatabaseContainer}:$remoteDump"
if ($LASTEXITCODE -ne 0) { throw 'Copy failed.' }
docker exec $DatabaseContainer createdb -U $DatabaseUser --template=template0 $drillDatabase
if ($LASTEXITCODE -ne 0) { throw 'Could not create isolated restore database.' }
docker exec $DatabaseContainer pg_restore -U $DatabaseUser -d $drillDatabase --clean --if-exists --no-owner --no-privileges --exit-on-error $remoteDump
if ($LASTEXITCODE -ne 0) { throw "Restore failed in isolated database $drillDatabase." }
docker exec $DatabaseContainer psql -U $DatabaseUser -d $drillDatabase -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS personnel_count FROM personnel; SELECT count(*) AS document_count FROM uploaded_documents;'
if ($LASTEXITCODE -ne 0) { throw 'Restored database verification failed.' }
Write-Output "Restore drill passed. Isolated database retained for inspection: $drillDatabase. All file checksums match. Live database was not overwritten."
