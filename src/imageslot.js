// Семафор image-вызовов: три уровня ограничения — система, провайдер, пользователь.
// Раньше здесь был глобальный Postgres advisory-lock на весь HTTP-запрос: варианты
// одного пакета выполнялись строго по очереди. Теперь ограничиваем конкурентность,
// а не сериализуем: пакет из 5 стартует одновременно, пока не упрётся в лимит.
import { getImageConcurrency, getImageConcurrencyUser, getImageConcurrencyProvider, getImageMinGapMs } from './renderconfig.js';

let activeSystem = 0;
let activeProvider = 0;
const activeByUser = new Map();
const waiters = [];

const canTake = userKey => {
  const userLimit = getImageConcurrencyUser();
  const userActive = userKey ? (activeByUser.get(userKey) || 0) : 0;
  return activeSystem < getImageConcurrency()
    && activeProvider < getImageConcurrencyProvider()
    && userActive < userLimit;
};

const take = userKey => {
  activeSystem += 1;
  activeProvider += 1;
  if (userKey) activeByUser.set(userKey, (activeByUser.get(userKey) || 0) + 1);
};

const release = userKey => {
  activeSystem = Math.max(0, activeSystem - 1);
  activeProvider = Math.max(0, activeProvider - 1);
  if (userKey) {
    const next = (activeByUser.get(userKey) || 1) - 1;
    if (next > 0) activeByUser.set(userKey, next);
    else activeByUser.delete(userKey);
  }
  // Будим всех ожидающих: каждый перепроверит свой лимит. Так один пользователь
  // не может занять освободившийся слот, если упёрся в свой потолок.
  for (const wake of waiters.splice(0)) wake();
};

async function acquire(userKey) {
  for (;;) {
    if (canTake(userKey)) {
      take(userKey);
      return;
    }
    await new Promise(resolve => waiters.push(resolve));
  }
}

// userKey — идентификатор пользователя (или комнаты) для справедливого распределения.
export async function withImageSlot(fn, { userKey = null } = {}) {
  await acquire(userKey);
  try {
    const gap = getImageMinGapMs();
    if (gap > 0) await new Promise(resolve => setTimeout(resolve, gap));
    return await fn();
  } finally {
    release(userKey);
  }
}

// Для тестов и мониторинга.
export function imageSlotStats() {
  return { activeSystem, activeProvider, users: [...activeByUser.entries()].map(([key, active]) => ({ key, active })) };
}

export function activeImageCalls() {
  return activeSystem;
}
