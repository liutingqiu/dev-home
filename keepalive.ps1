$port = 3458
$www = "C:\www"
While (1) {
  $alive = netstat -ano | Select-String ":$port.*LISTENING"
  If (-not $alive) {
    Write-Host "$(Get-Date) Server down, restarting..."
    Set-Location $www
    $env:PORT = $port
    Start-Process node -ArgumentList "server.js" -NoNewWindow
    Start-Sleep 3
  }
  Start-Sleep 30
}
