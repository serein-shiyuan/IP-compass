const fs = require('fs')
const path = require('path')

// 读取 presetIpPlan.js 文件内容并转换为 CommonJS 可执行
const filePath = path.join(__dirname, '../frontend/src/data/presetIpPlan.js')
const content = fs.readFileSync(filePath, 'utf-8')

// 提取对象字面量部分
const match = content.match(/const presetIpPlan = ({[\s\S]*})\s*export default presetIpPlan/)
if (!match) {
  console.error('无法解析 presetIpPlan.js')
  process.exit(1)
}

// 使用 Function 构造器解析对象（安全的本地静态数据）
const presetIpPlan = new Function('return ' + match[1])()

function validateIpPlan(plan) {
  const errors = []
  if (!plan || typeof plan !== 'object') {
    errors.push('IP 方案数据不能为空')
    return errors
  }
  if (!plan.positioning?.oneLine || plan.positioning.oneLine.length < 5) {
    errors.push('一句话定位需至少 5 个字')
  }
  if (!plan.positioning?.tag) {
    errors.push('专属标签不能为空')
  }
  if (!Array.isArray(plan.positioning?.values) || plan.positioning.values.length === 0) {
    errors.push('账号提供的价值至少 1 条')
  }
  if (!Array.isArray(plan.contentMatrix?.mainLines) || plan.contentMatrix.mainLines.length < 2) {
    errors.push('内容主线至少 2 条')
  }
  if (!Array.isArray(plan.topTopics) || plan.topTopics.length < 3) {
    errors.push('选题至少 3 条')
  }
  return errors
}

console.log('=== TC-004: 验证 presetIpPlan 数据完整性 ===')
const errors = validateIpPlan(presetIpPlan)
if (errors.length === 0) {
  console.log('✅ 通过 validateIpPlan 所有校验')
} else {
  console.error('❌ 校验失败：')
  errors.forEach((e) => console.error('  - ' + e))
  process.exit(1)
}

console.log('\n=== TC-007: 长文本和特殊字符 JSON 序列化测试 ===')
try {
  const json = JSON.stringify(presetIpPlan)
  const parsed = JSON.parse(json)
  if (parsed.summary.length > 10 && parsed.positioning.profileDesign.length > 10) {
    console.log('✅ JSON 序列化正常，长文本字段存在')
  } else {
    console.error('❌ 长文本字段异常')
    process.exit(1)
  }
} catch (err) {
  console.error('❌ JSON 序列化失败：', err.message)
  process.exit(1)
}

console.log('\n=== TC-004-边界: 内容主线数量 ===')
if (presetIpPlan.contentMatrix.mainLines.length === 5) {
  console.log('✅ 内容主线为 5 条')
} else {
  console.error('❌ 内容主线数量异常：', presetIpPlan.contentMatrix.mainLines.length)
  process.exit(1)
}

console.log('\n=== TC-004-边界: 前 10 条选题完整性 ===')
if (presetIpPlan.topTopics.length === 10) {
  let allValid = true
  presetIpPlan.topTopics.forEach((t, i) => {
    if (!t.title || !t.direction) {
      console.error(`❌ 选题 ${i + 1} 缺少 title 或 direction`)
      allValid = false
    }
  })
  if (allValid) console.log('✅ 前 10 条选题完整')
} else {
  console.error('❌ 选题数量异常：', presetIpPlan.topTopics.length)
  process.exit(1)
}

console.log('\n=== TC-009: 关键字段存在性检查 ===')
const requiredFields = [
  'summary',
  'positioning.tag',
  'positioning.oneLine',
  'positioning.values',
  'positioning.personaDetail.description',
  'positioning.profileDesign',
  'positioning.topPosts',
  'positioning.audience.details',
  'userProfile.core',
  'contentMatrix.mainLines',
  'contentMatrix.templates',
  'contentMatrix.topicFormulas',
  'contentMatrix.assetTransform',
  'style.visual',
  'style.copywriting',
  'style.shooting',
  'publishingStandards.coreCriteria',
  'publishingStandards.bottomLines',
  'topTopics'
]
let allFieldsExist = true
requiredFields.forEach((field) => {
  const keys = field.split('.')
  let value = presetIpPlan
  for (const key of keys) {
    value = value?.[key]
  }
  if (value === undefined || value === null || (Array.isArray(value) && value.length === 0)) {
    console.error(`❌ 字段缺失或为空: ${field}`)
    allFieldsExist = false
  }
})
if (allFieldsExist) console.log('✅ 所有关键字段存在且非空')

console.log('\n🎉 所有数据层测试用例通过')
