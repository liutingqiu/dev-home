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

# shop-demo (ATLAS clothing store)
@("shop-demo/index.html","shop-demo/shop.html","shop-demo/product.html","shop-demo/cart.html","shop-demo/checkout.html","shop-demo/order-success.html","shop-demo/css/style.css","shop-demo/js/data.js","shop-demo/js/cart.js") | % { dl $_ }

# portfolio files (from matrix repo)
$matrix = "https://raw.githubusercontent.com/liutingqiu/matrix/master"
function dl2($f) {
    $url = "$matrix/$f"
    $dest = "C:\portfolio\$f"
    $dir = Split-Path $dest -Parent
    if (-not (Test-Path $dir)) { mkdir $dir -Force | Out-Null }
    try {
        Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing -TimeoutSec 30
        Write-Host "  OK  portfolio/$f"
    } catch {
        Write-Host "  SKIP portfolio/$f"
    }
}
dl2 "daily-tasks.bat"
dl2 "scripts/aggregate.js"
dl2 "scripts/daily-build.js"
dl2 "scripts/devto-publish.js"
dl2 "scripts/sync-status.js"
dl2 "scripts/inspire-analyze.js"
dl2 "data/sources.json"

# 只更新文件，不重启（静态文件即时生效，server.js极少变动）
# 如需重启server.js：单独调用 /api/restart-server
Write-Host "Done. Files updated (no restart)."
