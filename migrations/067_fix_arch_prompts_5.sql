-- 067: Убрать архитектурные нарушения из prompt_description пяти стилей,
-- чтобы production-рендеры не добавляли балки, камины, встроенные стеллажи
-- и не меняли пол по стилевому описанию.
UPDATE styles
SET
  prompt_description = 'An english club interior: deep green walls #2F3B33, leather chesterfield sofa in chestnut brown, a wall of old books on freestanding shelving, brass reading lamps glowing warm, tartan wool blanket in burgundy #6B2B2B, warm wood panelling as a wall finish. Moody low light with warm pools around the lamps, layered club comfort. Eye-level 35mm lens, cozy traditional editorial photography.',
  description = 'Кожаный Честерфилд, книги и клетка — английский клуб.'
WHERE key = 'english';

UPDATE styles
SET
  prompt_description = 'An art deco interior: geometric inlay panels in dark navy #1E2A38 and gold #C9A961, velvet sofa in oxblood #6E3B3B, polished brass details, dark stone surfaces, symmetrical composition with a sunburst mirror as focal point. Glamorous warm lighting with sparkle on metal and glass, rich jewel tones. Eye-level 35mm lens, 1920s jazz-age elegance, editorial photography.'
WHERE key = 'art_deco';

UPDATE styles
SET
  prompt_description = 'A dark academia study: deep green walls #2A2E26, a wall of old books on wooden shelving, leather armchair, brass desk lamp casting a warm cone of light, candles on the desk, Persian rug in faded tones, dried flowers in a vase. Moody low-key lighting with deep soft shadows, scholarly quiet atmosphere. Eye-level 35mm lens, cinematic editorial photography, film grain.'
WHERE key = 'dark_academia';

UPDATE styles
SET
  prompt_description = 'A tropical modern interior: bamboo and rattan furniture, white walls #F0E8D8, lush palm and fern plants near the window, linen cushions in moss green #2E6B4A, woven pendant lamps glowing warm. Dappled daylight through palm leaves, humid airy atmosphere, layered greenery. Eye-level 35mm lens, tropical editorial interior photography.',
  description = 'Бамбук, зелень и натуральные текстуры — тропическая нега.'
WHERE key = 'tropical_modern';

UPDATE styles
SET
  prompt_description = 'An alpine chalet interior: warm honey wood textures on furniture and finishes #E8DFD0, soft sheepskin throws and wool blankets in rust #7A4A3A, wrought iron candle holders, carved wooden furniture, mountain landscape art on the wall. Warm soft layered light, gentle shadows, cozy mountain atmosphere. Eye-level 35mm lens, alpine editorial interior photography.',
  description = 'Дерево, текстиль и горный пейзаж — альпийский уют Шамони.'
WHERE key = 'chalet';
