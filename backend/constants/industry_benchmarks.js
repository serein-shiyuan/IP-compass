// 行业均值常量（B-008）：用于视频数据归因诊断的比率基准
// 数值为短视频新手/成长账号的中位参考值，基于播放量计算比率

export const INDUSTRY_BENCHMARKS = {
  // 完播率（%）
  completionRate: 25,
  // 点赞率（%）
  likesRate: 3,
  // 评论率（%）
  commentsRate: 0.5,
  // 收藏率（%）
  savesRate: 1.5,
  // 转发率（%）
  sharesRate: 0.5,
  // 关注转化率（%）
  followRate: 1,
  // 播放量低基准（绝对数）
  playCountLow: 1000
}

// 高于均值的比例阈值（1.2 = 高于均值 20%）
export const HIGH_THRESHOLD = 1.2

// 低于均值的比例阈值（0.8 = 低于均值 20%）
export const LOW_THRESHOLD = 0.8

// 4 种标准归因类型（按 PRD 定义）
export const ATTRIBUTION_TYPES = {
  high_likes_low_completion: {
    key: 'high_likes_low_completion',
    name: '点高完低',
    description: '点赞率高但完播率低，说明用户愿意互动但没看完，开头钩子或内容节奏需要优化',
    highMetrics: ['likesRate'],
    lowMetrics: ['completionRate']
  },
  high_completion_low_engagement: {
    key: 'high_completion_low_engagement',
    name: '完高互低',
    description: '完播率高但互动率低，说明内容看完了但用户不想互动，缺少行动号召或情绪共鸣点',
    highMetrics: ['completionRate'],
    lowMetrics: ['engagementRate']
  },
  high_saves_low_follow: {
    key: 'high_saves_low_follow',
    name: '收高粉低',
    description: '收藏率高但涨粉率低，说明内容有价值但账号/人设吸引力不足，用户没动力关注',
    highMetrics: ['savesRate'],
    lowMetrics: ['followRate']
  },
  low_plays_good_follow: {
    key: 'low_plays_good_follow',
    name: '播低粉好',
    description: '播放量低但涨粉转化好，说明内容小众但精准，可考虑扩大选题覆盖面或优化封面/标题',
    highMetrics: ['followRate'],
    lowMetrics: ['playCount']
  }
}

export const ATTRIBUTION_TYPE_KEYS = Object.keys(ATTRIBUTION_TYPES)
