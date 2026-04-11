$ErrorActionPreference = 'Stop'

$port = 4000
$listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue

if (-not $listeners) {
  Write-Host "[prestart:dev] Port $port is free."
  exit 0
}

$pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $pids) {
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue

  if (-not $proc) {
    continue
  }

  $name = $proc.Name
  $cmd = [string]$proc.CommandLine
  $isIgnisBackendNode = $name -eq 'node.exe' -and ($cmd -match 'Final Year Project\\Ignis\\ignis-be' -or $cmd -match 'dist\\apps\\fireSafety\\main' -or $cmd -match '@nestjs\\cli\\bin\\nest\.js')

  if ($isIgnisBackendNode) {
    Stop-Process -Id $processId -Force
    Write-Host "[prestart:dev] Stopped stale ignis-be process PID=$processId on port $port."
    continue
  }

  Write-Error "[prestart:dev] Port $port is occupied by non-ignis process: PID=$processId NAME=$name. Refusing to stop it automatically."
  exit 1
}

Write-Host "[prestart:dev] Port $port cleanup complete."
exit 0
