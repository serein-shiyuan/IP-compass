const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'frontend', 'functions')
const dst = path.join(__dirname, '..', 'frontend', 'dist', 'functions')

if (!fs.existsSync(src)) {
  console.error('functions source not found:', src)
  process.exit(1)
}

fs.cpSync(src, dst, { recursive: true, force: true })
console.log('copied functions to', dst)
