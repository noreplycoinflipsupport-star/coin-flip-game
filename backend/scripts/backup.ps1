param(
  [string]$BackupDir = ".\backups",
  [string]$MongoUri = "mongodb://localhost:27017/coinflip",
  [int]$RetentionDays = 7
)

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dbName = "coinflip"
$backupPath = Join-Path $BackupDir "${dbName}_$timestamp"

Write-Host "Starting MongoDB backup..." -ForegroundColor Cyan

# Create backup directory
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# Run mongodump
& "mongodump" --uri="$MongoUri" --out="$backupPath" 2>&1

if ($LASTEXITCODE -eq 0) {
  Write-Host "Backup completed: $backupPath" -ForegroundColor Green

  # Compress backup
  Compress-Archive -Path "$backupPath\*" -DestinationPath "${backupPath}.zip" -Force
  Remove-Item -Recurse -Force $backupPath

  Write-Host "Backup compressed: ${backupPath}.zip" -ForegroundColor Green

  # Clean old backups
  $cutoff = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem $BackupDir -Filter "*.zip" | Where-Object { $_.LastWriteTime -lt $cutoff } | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "Removed old backup: $($_.Name)" -ForegroundColor Yellow
  }
} else {
  Write-Host "Backup FAILED!" -ForegroundColor Red
  exit 1
}

Write-Host "Backup process complete." -ForegroundColor Green
