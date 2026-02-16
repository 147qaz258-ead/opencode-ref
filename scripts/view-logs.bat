@echo off
echo === Latest Logs ===
echo.
type D:\C_Projects\Agent\opencode-ref\.opencode\storage\log\dev.log | findstr /V "test" | findstr /V "docker.container-lifecycle" | more
echo.
echo === End of Logs ===
pause
