#!/usr/bin/env node
'use strict';

/**
 * auto-reply.js — 离线自动回复
 * 每秒轮询 Chat，检测新消息并自动回复
 * 部署到阿里云服务器，node auto-reply.js &
 */

const https = require('https');
const http = require('http');

const BASE = 'http://localhost:3458';
const CHAT_KEY = '50c88c36048ab2ab031e0adefa77673e';
const REPLY_KEY = 'reply-8a6b2c4d3e1f9070508030';
const POLL_INTERVAL = 1000; // 1秒

let lastMsgId = '';
let isRunning = false;

function fetch(url, method, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const options = {
      hostname: u.hostname, port: u.port,
      path: u.pathname + u.search, method,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      timeout: 5000
    };
    const req = mod.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function sendReply(content) {
  const result = await fetch(
    `${BASE}/api/reply?key=${encodeURIComponent(REPLY_KEY)}`,
    'POST',
    { content }
  );
  if (result && result.success) {
    console.log(`  ✅ 自动回复: ${content.slice(0, 30)}...`);
  }
}

async function checkMessages() {
  if (isRunning) return;
  isRunning = true;

  try {
    let url = `${BASE}/api/chat?key=${encodeURIComponent(CHAT_KEY)}`;
    if (lastMsgId) url += `&since=${encodeURIComponent(lastMsgId)}`;

    const msgs = await fetch(url, 'GET');
    if (!msgs || !msgs.length) { isRunning = false; return; }

    lastMsgId = msgs[msgs.length - 1].id;

    for (const msg of msgs) {
      if (msg.from === 'reasonix') continue; // 不回复自己
      if (msg.read) continue;

      const content = (msg.content || '').trim();
      if (!content) continue;

      // 根据内容回复
      if (content.includes('你好') || content.includes('hi') || content === 'test') {
        await sendReply('主人好！Reasonix 当前离线。紧急情况请查收 QQ 邮箱通知，我会在上线后第一时间处理。');
      } else {
        await sendReply('收到。Reasonix 当前离线，上线后立即处理。紧急请查邮箱。');
      }
    }
  } catch (e) {
    console.error('轮询错误:', e.message);
  }

  isRunning = false;
}

// 启动轮询
console.log('🤖 自动回复已启动 (每秒轮询)');
console.log('   按 Ctrl+C 停止');
checkMessages();
setInterval(checkMessages, POLL_INTERVAL);
