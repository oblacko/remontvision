// Понятные пользователю ошибки генерации. Сырой текст провайдера остаётся в логах,
// клиенту уходит только русская формулировка без деталей и JSON.
const MSG_SMALL_IMAGE = 'Не удалось обработать фото — изображение слишком маленькое. Загрузите фото побольше и попробуйте снова.';
const MSG_REJECTED = 'Модель отклонила запрос. Попробуйте ещё раз или смените модель.';
const MSG_BAD_PARAMS = 'Модель не поддерживает выбранные параметры. Выберите другую модель или параметры.';
const MSG_OVERLOADED = 'Сервис генерации перегружен. Попробуйте ещё раз через минуту.';
const MSG_MODERATION = 'Изображение не прошло модерацию. Попробуйте другое фото или стиль.';
const MSG_DEFAULT = 'Не удалось создать дизайн. Попробуйте ещё раз.';

export function friendlyRenderError(raw) {
  const text = String(raw || '');
  if (/422/.test(text) && /dimensions/i.test(text)) return MSG_SMALL_IMAGE;
  if (/moderation|content_policy|flagged/i.test(text)) return MSG_MODERATION;
  if (/\b429\b/.test(text)) return MSG_OVERLOADED;
  if (/\b400\b/.test(text)) return MSG_BAD_PARAMS;
  if (/\b422\b/.test(text)) return MSG_REJECTED;
  return MSG_DEFAULT;
}
