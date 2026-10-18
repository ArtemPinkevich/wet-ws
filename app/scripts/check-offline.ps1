# Run manually after the user has agreed to disconnect Wi-Fi for this check.
# This script observes adapters and connectivity; it never changes network settings.
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-NetworkObservation {
    param([ValidateRange(0, 1500)][int] $ProbeTimeoutMilliseconds = 1500)

    $startedAtUtc = [DateTime]::UtcNow.ToString('o')
    $adapters = @(Get-NetAdapter -Physical -ErrorAction Stop | Sort-Object Name | ForEach-Object {
        [ordered]@{ name = [string]$_.Name; status = [string]$_.Status }
    })
    $probeWatch = [Diagnostics.Stopwatch]::StartNew()
    $pending = @()
    $probes = @()
    try {
        # Start both probes before waiting: one observation takes at most 1.5 s in TCP waits.
        foreach ($address in @('1.1.1.1', '8.8.8.8')) {
            $client = [Net.Sockets.TcpClient]::new()
            $entry = [ordered]@{ address = $address; client = $client; operation = $null; error = $null }
            $pending += $entry
            try { $entry.operation = $client.BeginConnect($address, 443, $null, $null) }
            catch { $entry.error = $_.Exception.Message }
        }
        foreach ($entry in $pending) {
            $connected = $false
            $probeError = $entry.error
            if ($null -ne $entry.operation) {
                try {
                    $remaining = [Math]::Max(0, $ProbeTimeoutMilliseconds - [int]$probeWatch.ElapsedMilliseconds)
                    if ($entry.operation.AsyncWaitHandle.WaitOne($remaining)) {
                        $entry.client.EndConnect($entry.operation)
                        $connected = $entry.client.Connected
                    } else {
                        $probeError = 'TCP connection timed out'
                    }
                } catch { $probeError = $_.Exception.Message }
            }
            $probes += [ordered]@{
                address = $entry.address
                port = 443
                connected = $connected
                error = $probeError
            }
        }
    } finally {
        foreach ($entry in $pending) {
            $entry.client.Dispose()
            if ($null -ne $entry.operation) { $entry.operation.AsyncWaitHandle.Close() }
        }
        $probeWatch.Stop()
    }

    $anyPhysicalUp = @($adapters | Where-Object { $_.status -eq 'Up' }).Count -gt 0
    $anyProbeConnected = @($probes | Where-Object { $_.connected }).Count -gt 0
    return [ordered]@{
        startedAtUtc = $startedAtUtc
        finishedAtUtc = [DateTime]::UtcNow.ToString('o')
        physicalAdapters = $adapters
        tcpProbes = $probes
        probeTimeoutMilliseconds = $ProbeTimeoutMilliseconds
        anyPhysicalUp = $anyPhysicalUp
        anyProbeConnected = $anyProbeConnected
        offlineObserved = (-not $anyPhysicalUp -and -not $anyProbeConnected)
    }
}

$appRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$checksDirectory = Join-Path $appRoot 'out/checks/offline'
$desktopReportPath = Join-Path $checksDirectory 'desktop.json'
$reportPath = Join-Path $checksDirectory 'offline-verification.json'
$oldChecksDirectory = [Environment]::GetEnvironmentVariable('CHECKS_DIR', 'Process')
$oldOfflineMonitoring = [Environment]::GetEnvironmentVariable('OFFLINE_MONITORING', 'Process')
$observations = [Collections.Generic.List[object]]::new()
$child = $null
$childWatch = $null
$locationChanged = $false
$exitCode = 1
$report = [ordered]@{
    startedAtUtc = [DateTime]::UtcNow.ToString('o')
    finishedAtUtc = $null
    status = 'failed'
    phase = 'preflight'
    error = $null
    appRoot = $appRoot
    node = $null
    desktopExecutable = $null
    baseline = $null
    offlineStartedAtUtc = $null
    measurements = $observations
    networkRestoredDuringTest = $false
    childProcessId = $null
    childStartedAtUtc = $null
    childFinishedAtUtc = $null
    childExitCode = $null
    childTimedOut = $false
    desktopReportStatus = $null
    desktopReportCheckedAtUtc = $null
    desktopReportPath = $desktopReportPath
    waitForDisconnectSeconds = 180
    childTimeoutSeconds = 60
    method = 'Manual physical disconnect; sampled physical adapter status and TCP connections to 1.1.1.1:443 and 8.8.8.8:443; packaged desktop check.'
    limitations = @(
        'Connectivity is sampled, not continuously observed; a brief reconnection between measurements may be missed.',
        'Two external TCP destinations and physical adapter states do not establish reachability of every possible external route.'
    )
}

try {
    $null = New-Item -ItemType Directory -Path $checksDirectory -Force
    Push-Location -LiteralPath $appRoot
    $locationChanged = $true

    $nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $nodePath = $nodeCommand.Source
    $nodeVersion = (& $nodePath --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $nodeVersion -notmatch '^v24\.') {
        throw "Node.js 24 is required on the current PATH; found: $nodeVersion"
    }
    $report.node = [ordered]@{ executable = $nodePath; version = $nodeVersion }

    $desktopExecutable = $env:DESKTOP_EXE
    if ([string]::IsNullOrWhiteSpace($desktopExecutable)) {
        $desktopExecutable = Join-Path $appRoot 'out/build/manual/wet-ws-ai.exe'
    }
    if (-not [IO.Path]::IsPathRooted($desktopExecutable)) {
        $desktopExecutable = Join-Path $appRoot $desktopExecutable
    }
    $desktopExecutable = [IO.Path]::GetFullPath($desktopExecutable)
    if (-not (Test-Path -LiteralPath $desktopExecutable -PathType Leaf)) {
        throw "Packaged desktop executable not found: $desktopExecutable"
    }
    $report.desktopExecutable = $desktopExecutable
    if (-not (Test-Path -LiteralPath (Join-Path $appRoot 'scripts/check-delivery.mjs') -PathType Leaf)) {
        throw 'scripts/check-delivery.mjs is missing.'
    }
    & $nodePath --input-type=module -e "import('playwright').then(m => { if (!m._electron) process.exit(2); }).catch(() => process.exit(3));"
    if ($LASTEXITCODE -ne 0) { throw 'Local Playwright with Electron support is unavailable. Install dependencies before disconnecting.' }

    $report.baseline = Get-NetworkObservation
    if ($report.baseline.physicalAdapters.Count -eq 0) {
        throw 'No physical adapters were found for a baseline. The check cannot establish the requested disconnect.'
    }
    if (-not $report.baseline.anyProbeConnected) {
        throw 'Neither external TCP probe succeeded before disconnecting. Restore connectivity and start a new check.'
    }

    Write-Host 'Baseline recorded. Disconnect Wi-Fi (and any other physical network connection) manually now.'
    Write-Host 'Waiting up to 180 seconds. This script will not change network settings.'
    $report.phase = 'waiting-for-manual-disconnect'
    $waitWatch = [Diagnostics.Stopwatch]::StartNew()
    $offlineObservation = $null
    while ($waitWatch.Elapsed.TotalSeconds -lt 180) {
        $remainingMs = [Math]::Max(0, 180000 - [int]$waitWatch.ElapsedMilliseconds)
        $observation = Get-NetworkObservation -ProbeTimeoutMilliseconds ([Math]::Min(1500, $remainingMs))
        $observation['phase'] = 'waiting-for-manual-disconnect'
        $observations.Add($observation)
        if ($observation.offlineObserved -and $waitWatch.Elapsed.TotalSeconds -le 180) {
            $offlineObservation = $observation
            break
        }
        $remainingMs = [Math]::Max(0, 180000 - [int]$waitWatch.ElapsedMilliseconds)
        if ($remainingMs -gt 0) { Start-Sleep -Milliseconds ([Math]::Min(500, $remainingMs)) }
    }
    $waitWatch.Stop()
    if ($null -eq $offlineObservation) { throw 'Manual network disconnect was not observed within 180 seconds.' }

    $report.offlineStartedAtUtc = $offlineObservation.finishedAtUtc
    $report.phase = 'desktop-check'
    [Environment]::SetEnvironmentVariable('CHECKS_DIR', $checksDirectory, 'Process')
    [Environment]::SetEnvironmentVariable('OFFLINE_MONITORING', '1', 'Process')
    $childStartedAt = [DateTime]::UtcNow
    $report.childStartedAtUtc = $childStartedAt.ToString('o')
    $childWatch = [Diagnostics.Stopwatch]::StartNew()
    $child = Start-Process -FilePath $nodePath -ArgumentList @('scripts/check-delivery.mjs', 'desktop') `
        -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $checksDirectory 'desktop-stdout.log') `
        -RedirectStandardError (Join-Path $checksDirectory 'desktop-stderr.log')
    # Retain a handle before a fast child exits, so its exit code remains available.
    $null = $child.Handle
    $report.childProcessId = $child.Id
    Write-Host 'Network absence observed. Running the packaged desktop check; keep Wi-Fi disconnected until completion.'

    while (-not $child.HasExited) {
        $remainingMs = 60000 - [int]$childWatch.ElapsedMilliseconds
        if ($remainingMs -le 0) {
            $report.childTimedOut = $true
            Stop-Process -InputObject $child -Force -ErrorAction Stop
            break
        }
        $observation = Get-NetworkObservation -ProbeTimeoutMilliseconds ([Math]::Min(1500, $remainingMs))
        $observation['phase'] = 'desktop-check'
        $observations.Add($observation)
        if (-not $observation.offlineObserved) { $report.networkRestoredDuringTest = $true }
        $remainingMs = 60000 - [int]$childWatch.ElapsedMilliseconds
        if ($remainingMs -gt 0 -and -not $child.HasExited) {
            Start-Sleep -Milliseconds ([Math]::Min(500, $remainingMs))
        }
        $child.Refresh()
    }
    $child.WaitForExit()
    $childWatch.Stop()
    $report.childExitCode = $child.ExitCode
    $report.childFinishedAtUtc = $child.ExitTime.ToUniversalTime().ToString('o')
    if (($child.ExitTime - $child.StartTime).TotalSeconds -gt 60) { $report.childTimedOut = $true }

    # Include a measurement at completion, also covering children that exited very quickly.
    $observation = Get-NetworkObservation
    $observation['phase'] = 'completion'
    $observations.Add($observation)
    if (-not $observation.offlineObserved) { $report.networkRestoredDuringTest = $true }

    if ($report.childTimedOut) { throw 'Desktop check exceeded 60 seconds; only its own Node child process was terminated.' }
    if (-not (Test-Path -LiteralPath $desktopReportPath -PathType Leaf)) {
        throw 'Desktop check did not produce desktop.json.'
    }
    $desktopReport = Get-Content -LiteralPath $desktopReportPath -Raw | ConvertFrom-Json
    $report.desktopReportStatus = [string]$desktopReport.status
    $report.desktopReportCheckedAtUtc = [string]$desktopReport.checkedAt
    $checkedAt = [DateTimeOffset]::Parse($report.desktopReportCheckedAtUtc).UtcDateTime
    if ($checkedAt -lt $childStartedAt) { throw 'desktop.json predates this child run; stale evidence is not accepted.' }
    if ($report.childExitCode -ne 0 -or $report.desktopReportStatus -ne 'passed') {
        throw 'Packaged desktop check failed. See desktop.json and desktop-stderr.log.'
    }
    if ($report.networkRestoredDuringTest) {
        throw 'Network restoration was observed before verification completed. This run does not pass the offline check.'
    }

    $report.status = 'passed'
    $report.phase = 'complete'
    $exitCode = 0
} catch {
    $report.error = $_.Exception.Message
    Write-Host "Offline check failed: $($report.error)"
} finally {
    if ($null -ne $child -and -not $child.HasExited) {
        try {
            Stop-Process -InputObject $child -Force -ErrorAction Stop
            $child.WaitForExit()
            $report.childExitCode = $child.ExitCode
            $report.childFinishedAtUtc = $child.ExitTime.ToUniversalTime().ToString('o')
        } catch {
            $report.error = "$($report.error) Child cleanup failed: $($_.Exception.Message)"
        }
    }
    if ($null -ne $childWatch) { $childWatch.Stop() }
    [Environment]::SetEnvironmentVariable('CHECKS_DIR', $oldChecksDirectory, 'Process')
    [Environment]::SetEnvironmentVariable('OFFLINE_MONITORING', $oldOfflineMonitoring, 'Process')
    if ($locationChanged) { Pop-Location }
    $report.finishedAtUtc = [DateTime]::UtcNow.ToString('o')
    try {
        $null = New-Item -ItemType Directory -Path $checksDirectory -Force
        $json = $report | ConvertTo-Json -Depth 12
        [IO.File]::WriteAllText($reportPath, $json + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
    } catch {
        $exitCode = 1
        Write-Host "Could not save offline report: $($_.Exception.Message)"
    }
    Write-Host "Offline check finished: $($report.status). You may reconnect Wi-Fi now."
    Write-Host "Report: $reportPath"
}

exit $exitCode
