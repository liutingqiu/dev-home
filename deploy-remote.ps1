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

# core pages
@("server.js","index.html","feed.html","cases.html","docs.html","cooperation.html","apply.html","login.html","admin.html","vercel.json") | % { dl $_ }

# css + js
@("css/style.css","css/admin.css","js/main.js","js/admin.js") | % { dl $_ }

# blog
@("blog/index.html","blog/rss.xml","blog/2026-05-28-zero-dependency.html","blog/2026-05-29-store-website.html","blog/2026-05-30-nodejs-security.html","blog/2026-05-31-crawler-system.html","blog/2026-06-01-ai-fullstack.html","blog/auto-2026-06-03.html") | % { dl $_ }

# data
@("data/projects.json","data/settings.json","data/users.json","data/messages.json","data/applications.json","data/feed-cache.json") | % { dl $_ }

# restart server (new server.js needs restart)
Write-Host "Restarting server..."
try {
    Invoke-WebRequest -Uri "http://localhost:3458/api/restart-server" -Method POST -UseBasicParsing -TimeoutSec 5 | Out-Null
    Write-Host "  Server restart triggered"
} catch {
    Write-Host "  Restart failed (server may not be running)"
}

Write-Host "Done."
