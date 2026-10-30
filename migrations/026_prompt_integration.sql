-- 026: реальные размеры комнаты + скандинавский style brief из сохранённого эталона.

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_width_m NUMERIC(4,2);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_length_m NUMERIC(4,2);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_height_m NUMERIC(4,2);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS bed_length_m NUMERIC(4,2);
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS dimension_orientation TEXT;

UPDATE styles SET
  prompt_description = $scandi$Warm, characterful, designer-led Scandinavian interior.

DESIGN DIRECTION:
Create a contemporary Scandinavian interior with warm natural materials,
a restrained but expressive palette, functional furniture and curated details.
Balance clean lines with soft forms, craftsmanship and a lived-in atmosphere.
Use the existing room size realistically; do not overcrowd the space.

COLOUR PALETTE:
Use warm off-white, oatmeal and natural oak as the foundation.
Introduce muted sage or dusty blue as a clearly visible secondary colour,
supported by small touches of terracotta or rust.
Use charcoal sparingly for visual definition.
Repeat the selected accent colour in two or three deliberate places.
Avoid an entirely white, grey or beige room.

WALL COMPOSITION:
Give the main visible wall an intentional design treatment.
Choose ONE coherent approach appropriate to the room:
- a muted sage or dusty-blue painted wall with one oversized artwork;
- a warm off-white wall with a carefully composed group of two or three substantial framed prints;
- a restrained colour-block treatment with a large graphic artwork.
Scale artwork to the furniture and available wall area.
Do not leave the main wall visually unresolved.
Retain some calm negative space; do not decorate every wall.
Avoid tiny scattered pictures, arbitrary panels and excessive ornament.

FURNITURE:
Use well-proportioned Scandinavian furniture with functional forms,
slender or gently rounded profiles, and visible natural wood.
Combine light oak or ash with tactile upholstery.
Create one clear focal point appropriate to the room’s function.
Introduce one distinctive piece, such as a sculptural lounge chair,
a colourful upholstered chair or a characterful wooden cabinet.
Avoid making every piece identical in material, colour or silhouette.
Maintain believable furniture dimensions and usable circulation paths.

MATERIALS AND TEXTURES:
Create a coherent combination of natural oak or ash, wool or a textured woven rug,
linen or cotton textiles, matte painted surfaces, ceramics and small details
in brushed metal or dark metal. Make the textures visibly distinct but harmonious.
Avoid glossy plastic-looking surfaces and excessive bouclé.

LIGHTING:
Combine soft natural daylight with a believable layered lighting scheme.
Use a pendant or ceiling fixture suited to the existing room,
a floor or reading lamp, and a small table lamp where appropriate.
Prefer warm, softly diffused artificial light around 2700–3000 K.
Place lamps logically near seating, reading or working areas.
Do not rely only on ceiling downlights.
Do not invent architectural recesses or concealed ceiling lighting.

TEXTILES:
Use a generously sized textured rug appropriate to the furniture grouping.
Add a restrained combination of cushions and a casually placed throw.
Use natural-fabric curtains where the window arrangement allows,
without obscuring radiators, doors or essential access.
Mix plain textiles with one subtle stripe, check or graphic pattern.

DECOR AND PERSONALITY:
Style the room with a small number of deliberate, well-scaled objects:
a substantial artwork, ceramic vessels, a few books, a sculptural object
and one plant where space and daylight allow.
Arrange objects in intentional groupings rather than scattering them everywhere.
Make the room feel inhabited and personal, not staged with random accessories.
Keep functional surfaces usable.

COMPOSITION:
Establish one primary focal point and a few supporting details.
Balance wood, textiles, colour and open space.
Create visual interest through proportion, contrast, texture and asymmetry,
not through excessive decoration.
Keep the result achievable in a real home.

AVOID:
Bare unresolved main walls, an all-white or all-grey palette,
generic showroom styling, oversized furniture, random clutter,
excessive plants, tiny scattered decor, cold blue lighting,
distorted furniture, new architectural openings and changes to the room geometry.$scandi$
WHERE key = 'scandi';
