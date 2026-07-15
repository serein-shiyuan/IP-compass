#!/usr/bin/env node
/**
 * 发布前脱敏检查脚本
 * 扫描源码中可能泄露的：API Key、真实姓名、私人邮箱、电脑用户名、本地路径、真人测试数据等
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, extname } from 'path'

const ROOT = process.cwd()

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  '.cache',
  'coverage',
  'logs'
])

const SKIP_FILES = new Set([
  '.env',
  '.env.local',
  '.env.example'
])

const SCAN_EXTS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.scss', '.vue', '.py', '.sh', '.yml', '.yaml'
])

const SKIP_NAME_PATTERNS = [
  /package-lock\.json$/,
  /\.test\./,
  /sanitize-check\.js$/
]

const PATTERNS = [
  {
    name: '硬编码 API Key / Secret Token',
    regex: /sk-[a-zA-Z0-9]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|Bearer\s+[a-zA-Z0-9_\-]{20,}/gi
  },
  {
    name: '邮箱地址',
    regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi
  },
  {
    name: '中国手机号',
    regex: /(?<!\d)1[3-9]\d{9}(?!\d)/g
  },
  {
    name: 'Windows 本地用户路径',
    regex: /C:\\Users\\[^\\\s]+|Users\\[^\\\s]+/gi
  }
]

const SUSPICIOUS_WORDS = [
  '真实姓名', '真名', '身份证号', '家庭住址', '私人邮箱',
  '测试数据', '真实用户'
]

const SUSPICIOUS_PHRASES = [
  /真人[\u4e00-\u9fa5]{0,2}测试/,
  /真人[\u4e00-\u9fa5]{0,2}数据/
]

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      walk(full, files)
    } else if (st.isFile() && SCAN_EXTS.has(extname(name)) && !SKIP_FILES.has(name)) {
      if (SKIP_NAME_PATTERNS.some((re) => re.test(full))) continue
      files.push(full)
    }
  }
  return files
}

function scanFile(filePath) {
  const rel = relative(ROOT, filePath)
  const text = readFileSync(filePath, 'utf-8')
  const lines = text.split(/\r?\n/)
  const findings = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNo = i + 1

    for (const { name, regex } of PATTERNS) {
      regex.lastIndex = 0
      let m
      while ((m = regex.exec(line)) !== null) {
        findings.push({ line: lineNo, type: name, match: m[0] })
      }
    }

    const lower = line.toLowerCase()
    for (const word of SUSPICIOUS_WORDS) {
      if (lower.includes(word.toLowerCase())) {
        findings.push({ line: lineNo, type: '可疑关键词', match: word })
      }
    }
    for (const phrase of SUSPICIOUS_PHRASES) {
      const m = line.match(phrase)
      if (m) {
        findings.push({ line: lineNo, type: '真人测试数据', match: m[0] })
      }
    }
  }

  return findings.length ? { file: rel, findings } : null
}

function main() {
  const files = walk(ROOT)
  const results = files.map(scanFile).filter(Boolean)

  if (results.length === 0) {
    console.log('✅ 脱敏检查通过，未发现明显敏感信息。')
    process.exit(0)
  }

  console.error('❌ 脱敏检查未通过，发现以下潜在敏感信息：\n')
  for (const { file, findings } of results) {
    console.error(`📄 ${file}`)
    for (const f of findings) {
      console.error(`   第 ${f.line} 行 · ${f.type} · "${f.match}"`)
    }
    console.error('')
  }
  console.error('请在发布前处理上述内容，并重新运行本脚本。')
  process.exit(1)
}

main()
