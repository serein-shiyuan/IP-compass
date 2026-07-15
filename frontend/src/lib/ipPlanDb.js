const DB_NAME = 'ipcompass'
const DB_VERSION = 2
const STORE_NAME = 'ipPlans'

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'userId' })
        store.createIndex('updatedAt', 'updatedAt', { unique: false })
      }
    }
  })
}

export async function saveIpPlanToDB(userId, ipPlan, isConfirmed = false) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const record = {
      userId,
      ipPlan,
      isConfirmed,
      updatedAt: new Date().toISOString()
    }
    const request = store.put(record)
    request.onsuccess = () => resolve(record)
    request.onerror = () => reject(request.error)
  })
}

export async function getIpPlanFromDB(userId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(userId)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  })
}

export async function deleteIpPlanFromDB(userId) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(userId)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}
