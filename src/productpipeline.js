export const HERO_PRODUCT_CATEGORIES = ['bed', 'sofa', 'dining_table', 'light', 'rug'];

const DESIGN_MATERIAL_CATEGORIES = new Set([
  'floor', 'paint', 'wallpaper', 'tile', 'skirting', 'countertop', 'cabinet',
  'faucet', 'sink', 'toilet', 'shower', 'bathtub', 'outlets', 'appliance',
]);

const LARGE_FURNITURE_CATEGORIES = new Set([
  'bed', 'wardrobe', 'sofa', 'armchair', 'coffee_table', 'dining_table',
  'dining_chair', 'sideboard', 'desk', 'office_chair', 'storage', 'bench', 'cabinet',
]);

export function designProducts(products = []) {
  return products.filter(product => DESIGN_MATERIAL_CATEGORIES.has(product.category));
}

export function productTarget(product) {
  if (product.category === 'paint' || product.category === 'wallpaper') return 'wall';
  return product.category;
}

export function canBindProduct(product, keepFurniture = false) {
  if (!HERO_PRODUCT_CATEGORIES.includes(product.category)) return false;
  if (!product.image_path && !product.image_url) return false;
  return !(keepFurniture && LARGE_FURNITURE_CATEGORIES.has(product.category));
}

export function canReplaceWithProduct(product, keepFurniture = false) {
  return !(keepFurniture && LARGE_FURNITURE_CATEGORIES.has(product.category));
}
