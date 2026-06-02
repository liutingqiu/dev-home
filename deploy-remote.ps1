# deploy-remote.ps1
# 从 GitHub 拉取最新文件到 C:\www 并重启服务
$repo = "https://raw.githubusercontent.com/liutingqiu/dev-home/master"
$www = "C:\www"

function dl($f) {
    $url = "$repo/$f"
    $dest = "$www\$f"
    $dir = Split-Path $dest -Parent
    if (-not (Test-Path $dir)) { mkdir $dir -Force | Out-Null }
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 30
        Write-Host "  OK  $f"
    } catch {
        Write-Host "  FAIL $f"
    }
}

Write-Host "Deploy: GitHub -> C:\www"

# core
@("server.js","chat.html","dashboard.html","dashboard-server.js","manifest.json","sw.js","index.html","stats.html","crawler-status.html","auto-reply.js") | % { dl $_ }

# blog
@("blog/index.html","blog/rss.xml","blog/2026-05-28-zero-dependency.html","blog/2026-05-29-store-website.html","blog/2026-05-30-nodejs-security.html","blog/2026-05-31-crawler-system.html","blog/2026-06-01-ai-fullstack.html") | % { dl $_ }

# daily
@("daily/index.html","daily/2026-06-01.html","daily/2026-06-02.html") | % { dl $_ }

# restart
$p = Get-Process node -ErrorAction SilentlyContinue
if ($p) { $p | Stop-Process -Force; Start-Sleep 1 }
Set-Location $www
$env:PORT = 3458
Start-Process node -ArgumentList "server.js" -NoNewWindow
Write-Host "Done. Server restarted."
