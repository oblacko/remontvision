// Выбор арт-направления для промта: direction-агент приоритетнее,
// при пустом prompt_en — fallback на арт-директора (а не второй LLM-вызов).
export function pickArtDirection({ direction, ad } = {}) {
  if (direction?.text) return { branch: 'direction', text: direction.text };
  if (ad?.text) return { branch: 'art_director', text: ad.text };
  return { branch: 'none', text: '' };
}
