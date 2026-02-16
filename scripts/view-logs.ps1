# View latest OpenCode logs
$logPath = "$env:USERPROFILE\.opencode\storage\log\dev.log"
if (Test-Path $logPath) {
    Write-Host "=== Latest Logs ===" -ForegroundColor Cyan
    Write-Host ""
    Get-Content $logPath -Tail 50 | Where-Object {
        $_ -notmatch "service=test" -and
        $_ -notmatch "docker.container-lifecycle"
    }
    Write-Host ""
    Write-Host "=== End of Logs ===" -ForegroundColor Cyan
} else {
    Write-Host "Log file not found: $logPath" -ForegroundColor Red
}
