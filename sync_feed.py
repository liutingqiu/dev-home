#!/usr/bin/env python3
"""KnowledgeSys 爬虫精华 → dev-home 网站数据同步
从本机 KnowledgeSys 输出目录读取最新 JSON，过滤垃圾，生成 feed-cache.json
用法: python sync_feed.py   # 生成本地文件
      python sync_feed.py --to-server   # 同时推送到服务器
"""
import json, os, re, sys

# ====== 配置 ======
KNOWLEDGE_DIR = r'E:\project\tools\KnowledgeSys'
SERVER_FEED = r'C:\www\data\feed-cache.json'  # 服务器路径
LOCAL_FEED = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'feed-cache.json')

SOURCES = [
    {'dir': os.path.join(KNOWLEDGE_DIR, 'ai_news_output'),      'cat': 'AI',         'catCN': 'AI资讯'},
    {'dir': os.path.join(KNOWLEDGE_DIR, 'software_dev_output'),  'cat': 'Software',   'catCN': '软件开发'},
    {'dir': os.path.join(KNOWLEDGE_DIR, 'ui_design_output'),     'cat': 'UI',         'catCN': 'UI设计'},
    {'dir': os.path.join(KNOWLEDGE_DIR, 'miniprogram_output'),   'cat': 'MiniProgram', 'catCN': '小程序'},
]

def is_junk_title(t):
    """过滤 HTML 垃圾 / 导航文本 / 极短碎片"""
    if not t or len(t) < 10:
        return True
    if re.search(r'<(?!\d)[a-zA-Z]+[\s=>]|class="|target="|crossorigin', t):
        return True
    if t.startswith('>') or 'Credit:' in t[:30] or 'Newsletter' in t:
        return True
    return False

def sync():
    all_items = []
    stats = {}
    
    for src in SOURCES:
        if not os.path.isdir(src['dir']):
            print(f'  SKIP {src["catCN"]}: 目录不存在')
            continue
        
        files = sorted([f for f in os.listdir(src['dir']) if f.endswith('.json')], reverse=True)
        if not files:
            print(f'  SKIP {src["catCN"]}: 无JSON文件')
            continue
        
        print(f'  {src["catCN"]}: {len(files)} 个JSON文件, 取最新 {files[0]}')
        with open(os.path.join(src['dir'], files[0]), 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        items = data.get('items', data.get('interviews', []))
        added = 0
        for item in items:
            t = item.get('title', '')
            if is_junk_title(t):
                continue
            
            source = item.get('source', {})
            tag = item.get('interviewee', item.get('topic', {}))
            
            all_items.append({
                'title': t[:200],
                'summary': (item.get('summary', '') or '')[:300],
                'url': source.get('url', ''),
                'platform': source.get('platform', ''),
                'category': tag.get('category', src['cat']) if isinstance(tag, dict) else src['cat'],
                'categoryCN': tag.get('name_cn', src['catCN']) if isinstance(tag, dict) else src['catCN'],
                'sourceType': src['cat'],
                'time': item.get('publish_time', data.get('generated_at', '')),
                'score': (item.get('metadata', {}) or {}).get('play', 0) or 1
            })
            added += 1
        
        stats[src['cat']] = added
        print(f'    精华: {added} / 总量: {len(items)}')
    
    # 去重
    seen = set()
    unique = []
    for item in sorted(all_items, key=lambda x: x['time'], reverse=True):
        key = item['url'] or item['title']
        if key not in seen:
            seen.add(key)
            unique.append(item)
    
    feed = {
        'items': unique,
        'total': len(unique),
        'grandTotal': len(unique),
        'catStats': stats,
        'srcStats': {},
        'generatedAt': __import__('datetime').datetime.now().isoformat()
    }
    
    # 写入本地
    os.makedirs(os.path.dirname(LOCAL_FEED), exist_ok=True)
    with open(LOCAL_FEED, 'w', encoding='utf-8') as f:
        json.dump(feed, f, ensure_ascii=False, indent=2)
    print(f'\n✅ 本地: {LOCAL_FEED} ({len(unique)} 条精华)')
    
    # 写入服务器
    if '--to-server' in sys.argv:
        try:
            os.makedirs(os.path.dirname(SERVER_FEED), exist_ok=True)
            with open(SERVER_FEED, 'w', encoding='utf-8') as f:
                json.dump(feed, f, ensure_ascii=False, indent=2)
            print(f'✅ 服务器: {SERVER_FEED}')
        except Exception as e:
            print(f'❌ 服务器写入失败: {e}')
    
    return len(unique)

if __name__ == '__main__':
    print('KnowledgeSys → dev-home 精华同步\n')
    count = sync()
    print(f'\n总计 {count} 条精华已就绪')
    print('复制 data/feed-cache.json 到服务器 C:\\www\\data\\ 即可')
