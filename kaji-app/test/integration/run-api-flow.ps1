$ErrorActionPreference = "Stop"

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$port = Get-Random -Minimum 4310 -Maximum 4810
$baseUrl = "http://127.0.0.1:$port"
$devLog = Join-Path $projectRoot "test\integration\dev-server.log"
$devErrLog = Join-Path $projectRoot "test\integration\dev-server.err.log"

if (Test-Path $devLog) {
  Remove-Item $devLog -Force -ErrorAction SilentlyContinue
}
if (Test-Path $devErrLog) {
  Remove-Item $devErrLog -Force -ErrorAction SilentlyContinue
}

$buildIdPath = Join-Path $projectRoot ".next\BUILD_ID"
if (-not (Test-Path $buildIdPath)) {
  npm run build | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to build project before integration test."
  }
}

$server = Start-Process `
  -FilePath "cmd.exe" `
  -ArgumentList "/d", "/s", "/c", "npm run start -- --hostname 127.0.0.1 --port $port" `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $devLog `
  -RedirectStandardError $devErrLog `
  -PassThru

try {
  $isReady = $false
  for ($i = 0; $i -lt 120; $i++) {
    if ($server.HasExited) {
      throw "App server exited unexpectedly. See log: $devLog"
    }

    try {
      $response = Invoke-WebRequest -Uri "$baseUrl/api/bootstrap" -UseBasicParsing -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        $isReady = $true
        break
      }
    }
    catch {
      # keep retrying until ready
    }

    Start-Sleep -Milliseconds 500
  }

  if (-not $isReady) {
    throw "Timed out waiting for app server. See log: $devLog"
  }

  $env:TEST_BASE_URL = $baseUrl
  node --experimental-loader ./test/support/alias-loader.mjs --experimental-strip-types ./test/integration/api-flow-check.mts

  if ($LASTEXITCODE -ne 0) {
    throw "Integration API flow failed."
  }
}
finally {
  if ($server -and (Get-Process -Id $server.Id -ErrorAction SilentlyContinue)) {
    taskkill /PID $server.Id /T /F 2>$null | Out-Null
  }
}
