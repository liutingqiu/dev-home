// ============ Product Data ============
const PRODUCTS = [
  {
    id: 'p001',
    name: 'Silk Slip Dress',
    category: 'dresses',
    price: 128.00,
    colors: ['Black', 'Champagne', 'Navy'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    description: 'Cut on the bias from fluid silk charmeuse, this slip dress drapes effortlessly against the body. Featuring delicate spaghetti straps and a midi-length hem, it transitions seamlessly from day to evening.',
    details: ['100% Silk Charmeuse', 'Bias-cut for fluid drape', 'Adjustable spaghetti straps', 'French seams', 'Dry clean only'],
    images: 3,
    featured: true,
    newArrival: true
  },
  {
    id: 'p002',
    name: 'Linen Wide-Leg Trousers',
    category: 'bottoms',
    price: 98.00,
    colors: ['Ecru', 'Black', 'Sand'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    description: 'High-waisted trousers tailored from heavyweight Irish linen. A relaxed wide-leg silhouette with front pleats and side pockets. The perfect foundation for effortless warm-weather dressing.',
    details: ['100% Irish Linen', 'High-rise with front pleats', 'Side seam pockets', 'Zip fly with hook closure', 'Machine wash cold'],
    images: 3,
    featured: true,
    newArrival: false
  },
  {
    id: 'p003',
    name: 'Cashmere Crewneck',
    category: 'tops',
    price: 195.00,
    colors: ['Camel', 'Grey Melange', 'Black', 'Ivory'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    description: 'A refined essential knitted from traceable Mongolian cashmere. Relaxed fit with ribbed trims at the crew neckline, cuffs, and hem. An investment piece designed to last for seasons.',
    details: ['100% Grade-A Mongolian Cashmere', 'Relaxed fit', 'Ribbed neck, cuffs & hem', 'Fully fashioned', 'Hand wash or dry clean'],
    images: 3,
    featured: true,
    newArrival: false
  },
  {
    id: 'p004',
    name: 'Oversized Blazer',
    category: 'outerwear',
    price: 245.00,
    colors: ['Black', 'Taupe'],
    sizes: ['XS', 'S', 'M', 'L'],
    description: 'A single-breasted blazer cut in an oversized masculine silhouette. Crafted from RWS-certified wool with a half-lined interior for structure without weight. Notch lapel, flap pockets, and a single vent.',
    details: ['100% RWS-Certified Wool', 'Single-breasted, notch lapel', 'Half-lined interior', 'Flap pockets', 'Dry clean only'],
    images: 3,
    featured: true,
    newArrival: true
  },
  {
    id: 'p005',
    name: 'Tencel Shirt Dress',
    category: 'dresses',
    price: 112.00,
    colors: ['White', 'Olive'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    description: 'A modern shirt dress cut from sustainable Tencel™ lyocell. Point collar, concealed button placket, and a self-tie belt to cinch the waist. Equally polished worn open as a duster.',
    details: ['100% Tencel™ Lyocell', 'Point collar', 'Concealed button placket', 'Self-tie belt', 'Machine wash gentle'],
    images: 3,
    featured: false,
    newArrival: true
  },
  {
    id: 'p006',
    name: 'Ribbed Knit Tank',
    category: 'tops',
    price: 58.00,
    colors: ['White', 'Black', 'Mocha'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    description: 'A close-fitting tank top knitted from a fine-gauge ribbed organic cotton blend. High crew neckline and a cropped length — a foundational layering piece with endless versatility.',
    details: ['95% Organic Cotton, 5% Elastane', 'Fine-rib knit', 'High crew neck', 'Cropped length', 'Machine wash cold'],
    images: 2,
    featured: false,
    newArrival: false
  },
  {
    id: 'p007',
    name: 'Tailored Shorts',
    category: 'bottoms',
    price: 82.00,
    colors: ['Black', 'Sand'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    description: 'Precision-tailored shorts with a mid-rise waist and a straight, city-length cut. Pressed center crease and side adjusters for a clean, polished finish.',
    details: ['55% Polyester, 45% Wool', 'Mid-rise, straight cut', 'Side adjusters', 'Pressed crease', 'Dry clean'],
    images: 2,
    featured: false,
    newArrival: false
  },
  {
    id: 'p008',
    name: 'Cotton Poplin Maxi Skirt',
    category: 'bottoms',
    price: 110.00,
    colors: ['White', 'Black'],
    sizes: ['XS', 'S', 'M', 'L'],
    description: 'A voluminous maxi skirt cut from crisp cotton poplin. Gathered waistband, side seam pockets, and a full sweep that moves beautifully with every step.',
    details: ['100% Cotton Poplin', 'Gathered waistband', 'Side seam pockets', 'Maxi length', 'Machine wash'],
    images: 3,
    featured: false,
    newArrival: true
  },
  {
    id: 'p009',
    name: 'Merino Turtleneck',
    category: 'tops',
    price: 135.00,
    colors: ['Black', 'Burgundy', 'Navy'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    description: 'A fine-gauge turtleneck spun from extra-fine merino wool. Slim fit with a rolled neck and extended cuff — ideal for layering under blazers or wearing alone on transitional days.',
    details: ['100% Extra-Fine Merino Wool', 'Slim fit', 'Rolled turtleneck', 'Extended cuff', 'Hand wash cold'],
    images: 2,
    featured: false,
    newArrival: false
  },
  {
    id: 'p010',
    name: 'Wrap Coat',
    category: 'outerwear',
    price: 320.00,
    colors: ['Camel', 'Charcoal'],
    sizes: ['XS', 'S', 'M', 'L'],
    description: 'A sculptural wrap coat in double-faced wool-cashmere. Shawl collar, self-tie belt closure, and generous patch pockets. An elegant outer layer that defines any silhouette.',
    details: ['90% Wool, 10% Cashmere', 'Double-faced construction', 'Shawl collar', 'Self-tie belt', 'Dry clean only'],
    images: 3,
    featured: false,
    newArrival: true
  },
  {
    id: 'p011',
    name: 'Satin Camisole',
    category: 'tops',
    price: 52.00,
    colors: ['Champagne', 'Black', 'Rose'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    description: 'A fluid camisole cut from sand-washed satin with a subtle luster. V-neckline, slim adjustable straps, and a clean finish. Wear solo or layered under sheer knits.',
    details: ['100% Polyester Satin', 'Sand-washed finish', 'V-neckline', 'Adjustable straps', 'Machine wash gentle'],
    images: 2,
    featured: false,
    newArrival: false
  },
  {
    id: 'p012',
    name: 'Pleated Midi Dress',
    category: 'dresses',
    price: 145.00,
    colors: ['Navy', 'Burgundy', 'Forest'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    description: 'A midi dress featuring accordion pleats that create subtle movement. Round neckline, bracelet-length sleeves, and a self-tie back for a customizable fit through the waist.',
    details: ['100% Polyester Pleated', 'Accordion pleats', 'Round neckline', 'Self-tie back', 'Hand wash cold'],
    images: 3,
    featured: false,
    newArrival: false
  }
];

const CATEGORIES = [
  { id: 'dresses', name: 'Dresses' },
  { id: 'tops', name: 'Tops & Knits' },
  { id: 'bottoms', name: 'Bottoms' },
  { id: 'outerwear', name: 'Outerwear' }
];

// Get product by ID
function getProduct(id) {
  return PRODUCTS.find(p => p.id === id) || null;
}

// Get featured products
function getFeatured() {
  return PRODUCTS.filter(p => p.featured);
}

// Get new arrivals
function getNewArrivals() {
  return PRODUCTS.filter(p => p.newArrival);
}

// Filter products
function filterProducts({ category, minPrice, maxPrice, sizes } = {}) {
  return PRODUCTS.filter(p => {
    if (category && p.category !== category) return false;
    if (minPrice && p.price < minPrice) return false;
    if (maxPrice && p.price > maxPrice) return false;
    if (sizes && sizes.length > 0 && !sizes.some(s => p.sizes.includes(s))) return false;
    return true;
  });
}
