# keepalive.ps1
# 守护进程：每30秒检查端口3458，挂了自动重启
while($true){
  $r = netstat -ano | findstr ":3458.*LISTENING"
  if(-not $r){
    Write-Host "$(Get-Date) 服务器挂了，重启中..."
    cd C:\www
    $env:PORT=3458
    Start-Process node -ArgumentList "server.js" -NoNewWindow
    Start-Sleep 3
  }
  Start-Sleep 30
}
