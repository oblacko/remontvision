// Семафор image-вызовов: ограничивает число одновременных запросов к провайдеру.
// Раньше здесь был глобальный Postgres advisory-lock на весь HTTP-запрос: из-за этого
// варианты одного пакета (5 картинок) выполнялись строго по очереди, хотя провайдер
// позволяет параллельные запросы. Лимит настраивается в app_settings
// (render.product_refs.v1.image_concurrency), пауза между стартами — там же.
import { getImageConcurrency, getImageMinGapMs } from './renderconfig.js';

let active = 0;
const queue = [];

export async function withImageSlot(fn) {
  const limit = Math.max(1, getImageConcurrency());
  // Ждём, пока освободится слот. Цикл нужен на случай, если между разбудившим
  // сигналом и продолжением слот успел занять другой вызов.
  while (active >= limit) {
    await new Promise(resolve => queue.push(resolve));
  }
  active += 1;
  try {
    const gap = getImageMinGapMs();
    if (gap > 0) await new Promise(resolve => setTimeout(resolve, gap));
    return await fn();
  } finally {
    active -= 1;
    const next = queue.shift();
    if (next) next();
  }
}

// Для тестов: сколько вызовов сейчас в работе.
export function activeImageCalls() {
  return active;
}
