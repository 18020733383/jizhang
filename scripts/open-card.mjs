/**
 * 通过 API Token 开写作卡。
 *
 * 用法:
 *   node scripts/open-card.mjs <markdown文件> --token <api_token> [--base <url>] [--title <标题>] [--summary <摘要>]
 *
 * 示例:
 *   node scripts/open-card.mjs article.md --token sk_xxx
 *   node scripts/open-card.mjs article.md --token sk_xxx --title "我的文章" --summary "一句话摘要"
 *   node scripts/open-card.mjs article.md --token sk_xxx --base http://localhost:8788
 *
 * 也可以从 stdin 读入:
 *   cat article.md | node scripts/open-card.mjs - --token sk_xxx --title "管道传入"
 */

import { readFileSync } from 'node:fs';
import { createHash, randomBytes, createCipheriv } from 'node:crypto';

// ── 命令行参数解析 ──────────────────────────────────────────────
function parseArgs(argv) {
  const args = { base: 'https://jizhang-8zk.pages.dev' };
  const positional = [];
  let i = 2;
  while (i < argv.length) {
    if (argv[i] === '--token' && i + 1 < argv.length) {
      args.token = argv[i + 1];
      i += 2;
    } else if (argv[i] === '--base' && i + 1 < argv.length) {
      args.base = argv[i + 1].replace(/\/+$/, '');
      i += 2;
    } else if (argv[i] === '--title' && i + 1 < argv.length) {
      args.title = argv[i + 1];
      i += 2;
    } else if (argv[i] === '--summary' && i + 1 < argv.length) {
      args.summary = argv[i + 1];
      i += 2;
    } else if (argv[i] === '--no-finish') {
      args.noFinish = true;
      i += 1;
    } else if (!argv[i].startsWith('--')) {
      positional.push(argv[i]);
      i += 1;
    } else {
      i += 1;
    }
  }
  args.file = positional[0];
  return args;
}

// ── 字数统计（与前端 WritingCards.tsx 完全一致） ─────────────────
function countWritingWords(text) {
  const cjk = (text.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu) ?? []).length;
  const withoutCjk = text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, ' ');
  const latin = (withoutCjk.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)?/g) ?? []).length;
  return cjk + latin;
}

// ── 加密（与前端一致：AES-256-GCM，密钥 = SHA-256(qrSecret)）───
function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function createQrSecret() {
  return bytesToHex(randomBytes(32)).toUpperCase();
}

function encryptArticleContent(content, qrSecret) {
  const keyDigest = createHash('sha256').update(qrSecret.trim().toUpperCase()).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyDigest, iv);
  const encrypted = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // AES-GCM 在 Web Crypto 中 auth tag 自动附加到密文末尾
  const combined = Buffer.concat([encrypted, authTag]);
  return {
    encryptedContent: bytesToBase64(combined),
    contentIv: bytesToBase64(iv),
  };
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

// ── API 调用 ────────────────────────────────────────────────────
async function apiPost(url, token, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${data.error ?? res.statusText}`);
  }
  return data;
}

async function apiPostFinish(url, token) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${data.error ?? res.statusText}`);
  }
  return data;
}

// ── 主流程 ──────────────────────────────────────────────────────
async function main() {
  const args = parseArgs(process.argv);

  if (!args.token) {
    console.error('❌ 缺少 --token <api_token>');
    console.error('   在设置页 → API Tokens 创建一个管理员 token');
    process.exit(1);
  }

  // 读取文章内容
  let content;
  if (!args.file || args.file === '-') {
    // 从 stdin 读取
    const chunks = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    content = Buffer.concat(chunks).toString('utf8');
  } else {
    content = readFileSync(args.file, 'utf8');
  }

  if (!content.trim()) {
    console.error('❌ 文章内容为空');
    process.exit(1);
  }

  // 提取标题（取第一个 # 标题，或文件名）
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = args.title || (titleMatch ? titleMatch[1] : (args.file || '未命名文章'));
  const summary = args.summary || '';

  // 字数统计
  const wordCount = countWritingWords(content);
  console.log(`📝 标题: ${title}`);
  console.log(`📊 字数: ${wordCount.toLocaleString()}`);

  if (wordCount < 2000) {
    console.error(`❌ 字数不足 2000（差 ${(2000 - wordCount).toLocaleString()} 字），无法开卡`);
    process.exit(1);
  }

  // 生成密钥 & 加密
  const qrSecret = createQrSecret();
  const qrHashVerifier = sha256Hex(qrSecret);
  const encrypted = encryptArticleContent(content, qrSecret);

  console.log(`🔑 QR 密钥: ${qrSecret}`);
  console.log(`🔒 正在加密并提交...`);

  // 调用 API 开卡
  const baseUrl = args.base.replace(/\/+$/, '');
  let card;
  try {
    card = await apiPost(`${baseUrl}/api/v1/writing/cards`, args.token, {
      title: title.trim(),
      summary: summary.trim(),
      wordCount,
      frontImage: '',
      backImage: '',
      encryptedContent: encrypted.encryptedContent,
      contentIv: encrypted.contentIv,
      encryptionVersion: 1,
      qrHashVerifier,
      qrSecret,
    });

    console.log('');
    console.log('✅ 开卡成功！密钥已自动存入系统。');
    console.log(`  卡号:     ${card.cardNumber}`);
    console.log(`  文章 ID:  ${card.articleId}`);
    console.log(`  开卡日期: ${card.issueDate}`);
    console.log(`  QR 密钥:  ${qrSecret}`);
    console.log('');
    console.log('💡 密钥已保存在服务器，可在卡片管理中随时查看。');
    console.log('');

    // 自动锁定（除非指定 --no-finish）
    if (!args.noFinish) {
      console.log('🔒 自动锁定卡片...');
      await apiPostFinish(`${baseUrl}/api/v1/writing/cards/${card.id}/finish`, args.token);
      console.log(`✅ 卡片 ${card.cardNumber} 已锁定。`);
    } else {
      console.log('📌 跳过自动锁定（--no-finish），卡片状态为 draft。');
      console.log(`   后续可调用 POST ${baseUrl}/api/v1/writing/cards/${card.id}/finish 手动锁定。`);
    }
    console.log('');
    console.log('📋 写入你的记账本读卡界面来读这篇文章：');
    console.log(`   ${qrSecret}`);

    // 输出 JSON 格式方便脚本处理
    console.log('');
    console.log('── JSON ──');
    console.log(JSON.stringify({
      cardNumber: card.cardNumber,
      articleId: card.articleId,
      issueDate: card.issueDate,
      qrSecret,
      title,
      wordCount,
    }, null, 2));

  } catch (e) {
    console.error(`❌ 开卡失败: ${e.message}`);
    process.exit(1);
  }
}

main();
