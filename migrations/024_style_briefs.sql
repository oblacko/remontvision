ALTER TABLE styles ADD COLUMN IF NOT EXISTS swatches JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE styles SET
  prompt_description = 'Warm Scandinavian interior: airy, calm and functional, with a quiet editorial finish. Palette: chalk white #F2EFE9, warm greige #D8D0C4, pale oak #C9A77C, muted sage #A8B3A0, soft charcoal #3F4340 and brushed brass #B08D57. Materials: white walls, light oak and ash, matte lacquer, natural linen, wool bouclé, tactile plaster, ceramic, matte black metal and brushed brass. Lighting: soft natural daylight, warm 2700–3000K, linen or opal-glass pendants, low pools of practical light; use existing fixtures only. Furniture: clean-lined oak casegoods, simple upholstered bed or sofa, woven wool rug, framed art, ceramics, books and one or two plants. Mood: lived-in, warm minimalism, calm and breathable. Avoid glossy surfaces, heavy ornament, dark dramatic palettes, rustic clutter, industrial concrete and visible cables.',
  swatches = '[{"hex":"#F2EFE9","name":"chalk white"},{"hex":"#D8D0C4","name":"warm greige"},{"hex":"#C9A77C","name":"pale oak"},{"hex":"#A8B3A0","name":"muted sage"},{"hex":"#3F4340","name":"soft charcoal"},{"hex":"#B08D57","name":"brushed brass"}]'::jsonb
WHERE key = 'scandi';

UPDATE styles SET
  prompt_description = 'Japandi interior: warm minimalism with a wabi-sabi, quiet-luxury mood. Palette: warm plaster #E7DFD3, oatmeal #D6C7B5, smoked oak #8B6F52, deep umber #4A3C2F, moss charcoal #3E463D and aged brass #A8895A. Materials: oak and ash, limewash, natural linen, wool, paper lanterns, handmade ceramic, stone, matte metal and tactile plaster. Lighting: soft diffused 2700K, paper or opal pendants, low pools of light and candles; use existing fixtures only. Furniture: low-profile oak furniture, simple organic upholstery, a low bed or sofa, textured rug, handmade ceramics, dried branches, a restrained art print and one sculptural object. Mood: serene, grounded, tactile, imperfect and uncluttered. Avoid glossy finishes, cold gray, chrome, maximalist patterns, rustic country clichés and heavy ornament.',
  swatches = '[{"hex":"#E7DFD3","name":"warm plaster"},{"hex":"#D6C7B5","name":"oatmeal"},{"hex":"#8B6F52","name":"smoked oak"},{"hex":"#4A3C2F","name":"deep umber"},{"hex":"#3E463D","name":"moss charcoal"},{"hex":"#A8895A","name":"aged brass"}]'::jsonb
WHERE key = 'japandi';

UPDATE styles SET active = false WHERE key NOT IN ('scandi', 'japandi');
UPDATE styles SET active = true WHERE key IN ('scandi', 'japandi');
