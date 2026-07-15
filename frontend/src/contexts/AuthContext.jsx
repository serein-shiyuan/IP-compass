import { createContext, useContext, useCallback, useState, useMemo } from 'react'
import { createAnonymousUser, validateUser } from '../api/client.js'
import { track, TrackingEvents } from '../lib/tracking.js'

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const USER_ID_KEY = 'user_id'
const APP_KEY_PREFIX = 'ipcompass_'

const AuthContext = createContext(null)

function hasOtherAppData() {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key !== USER_ID_KEY && key.startsWith(APP_KEY_PREFIX)) {
      return true
    }
  }
  return false
}

function isValidUuidV4(value) {
  return typeof value === 'string' && UUID_V4_RE.test(value)
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [userId, setUserId] = useState(null)
  const [error, setError] = useState(null)
  const [dataCleared, setDataCleared] = useState(false)

  const doValidate = useCallback(async (id) => {
    const res = await validateUser(id)
    return res.isValid === true
  }, [])

  const doCreate = useCallback(async () => {
    let lastErr = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const data = await createAnonymousUser()
        if (!isValidUuidV4(data.userId)) {
          throw new Error('服务器返回非法用户标识')
        }
        localStorage.setItem(USER_ID_KEY, data.userId)
        track(TrackingEvents.REGISTER_SUCCESS, {
          phone_masked: '',
          is_new_user: true,
          source: 'anonymous'
        })
        return data.userId
      } catch (err) {
        lastErr = err
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 300))
        }
      }
    }
    throw lastErr || new Error('初始化失败，请刷新页面重试')
  }, [])

  const initialize = useCallback(
    async (options = {}) => {
      const { createIfMissing = true } = options
      // 避免重复初始化：加载中直接跳过；已有有效用户无需再次创建
      if (status === 'loading') return
      if (status === 'ready' && userId) return

      setStatus('loading')
      setError(null)
      setDataCleared(false)

      try {
        let id = localStorage.getItem(USER_ID_KEY)
        let cleared = false

        if (isValidUuidV4(id)) {
          try {
            const valid = await doValidate(id)
            if (!valid) id = null
          } catch {
            id = null
          }
        } else {
          id = null
        }

        if (!id && createIfMissing) {
          // localStorage 被清理且存在其他业务数据时，标记为数据已清除
          cleared = !localStorage.getItem(USER_ID_KEY) && hasOtherAppData()
          id = await doCreate()
        }

        setUserId(id)
        setDataCleared(cleared)
        setStatus('ready')
      } catch (err) {
        setUserId(null)
        setError(err.message || '初始化失败，请刷新页面重试')
        setStatus('error')
      }
    },
    [doCreate, doValidate, status, userId]
  )

  const value = useMemo(
    () => ({
      status,
      userId,
      error,
      dataCleared,
      initialize
    }),
    [status, userId, error, dataCleared, initialize]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return ctx
}
