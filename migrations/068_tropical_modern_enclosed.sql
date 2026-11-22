-- 068: Усилить tropical_modern: убрать terrace-ассоциации, вернуть терракотовый акцент,
-- явно запретить замену дверей на стеклянные/французские/террасные.
UPDATE styles
SET
  prompt_description = 'A tropical modern interior: bamboo and rattan furniture, white walls #F0E8D8, lush palm and fern plants near the window, linen cushions in moss green #2E6B4A and terracotta #E07A5F accents, woven pendant lamps glowing warm. Dappled daylight through palm leaves, humid enclosed interior atmosphere, layered greenery. Eye-level 35mm lens, tropical editorial interior photography.'
WHERE key = 'tropical_modern';
