/**
 * Swan Agro Machinery Product Catalog
 * Comprehensive catalog of all 37 Agricultural Implements & Genuine Spare Parts
 */

export const PRODUCT_GROUPS = [
  // 1. Rotavators (7 Models)
  { id: 'ROTAVATOR_MINI', name: 'Rotavator – Mini Series', category: 'Implement', subCategory: 'Rotavator' },
  { id: 'ROTAVATOR_STANDARD', name: 'Rotavator – Standard Series', category: 'Implement', subCategory: 'Rotavator' },
  { id: 'ROTAVATOR_SUPER', name: 'Rotavator – Super Series', category: 'Implement', subCategory: 'Rotavator' },
  { id: 'ROTAVATOR_ULTRA', name: 'Rotavator – Ultra Series', category: 'Implement', subCategory: 'Rotavator' },
  { id: 'ROTAVATOR_ULTRON', name: 'Rotavator – Ultron Series', category: 'Implement', subCategory: 'Rotavator' },
  { id: 'ROTAVATOR_GYRO', name: 'Rotavator – Gyro Series', category: 'Implement', subCategory: 'Rotavator' },
  { id: 'ROTAVATOR_DUSTER', name: 'Rotavator – Duster Series', category: 'Implement', subCategory: 'Rotavator' },

  // 2. Ploughs (4 Models)
  { id: 'HYDRAULIC_REVERSIBLE_MB_PLOUGH', name: 'Hydraulic Reversible MB Plough', category: 'Implement', subCategory: 'Plough' },
  { id: 'MOUNTED_DISC_PLOUGH', name: 'Mounted Disc Plough', category: 'Implement', subCategory: 'Plough' },
  { id: 'MOULD_BOARD_PLOUGH', name: 'Mould Board Plough', category: 'Implement', subCategory: 'Plough' },
  { id: 'REVERSE_FORWARD', name: 'Reverse Forward', category: 'Implement', subCategory: 'Plough' },

  // 3. Tillage & Land Preparation (7 Models)
  { id: 'ROTO_PUDDLER', name: 'Roto Puddler', category: 'Implement', subCategory: 'Tillage' },
  { id: 'LASER_LAND_LEVELLER', name: 'Laser Land Leveller', category: 'Implement', subCategory: 'Land Leveller' },
  { id: 'HEAVY_DUTY_DISC_HARROW', name: 'Heavy Duty Compact Model Disc Harrow', category: 'Implement', subCategory: 'Disc Harrow' },
  { id: 'MOUNTED_OFFSET_DISC_HARROW', name: 'Mounted Offset Disc Harrow', category: 'Implement', subCategory: 'Disc Harrow' },
  { id: 'EXTRA_HEAVY_DUTY_CULTIVATOR', name: 'Extra Heavy Duty Spring Loaded Cultivator', category: 'Implement', subCategory: 'Cultivator' },
  { id: 'HEAVY_DUTY_SUB_SOILER', name: 'Heavy Duty Sub Soiler', category: 'Implement', subCategory: 'Sub Soiler' },
  { id: 'LIGHT_DUTY_SUB_SOILER', name: 'Light Duty Sub Soiler', category: 'Implement', subCategory: 'Sub Soiler' },

  // 4. Seeding & Planting (8 Models)
  { id: 'SUPER_SEEDER', name: 'Super Seeder', category: 'Implement', subCategory: 'Seeder' },
  { id: 'ROTO_SEEDER', name: 'Roto Seeder', category: 'Implement', subCategory: 'Seeder' },
  { id: 'HAPPY_SEEDER', name: 'Happy Seeder', category: 'Implement', subCategory: 'Seeder' },
  { id: 'ZERO_TILL_SEED_DRILL', name: 'Zero Till Seed Drill', category: 'Implement', subCategory: 'Seed Drill' },
  { id: 'PNEUMATIC_PLANTER', name: 'Pneumatic Planter', category: 'Implement', subCategory: 'Planter' },
  { id: 'POTATO_PLANTER', name: 'Potato Planter', category: 'Implement', subCategory: 'Planter' },
  { id: 'NEW_GEN_POTATO_PLANTER', name: 'New Generation Potato Planter', category: 'Implement', subCategory: 'Planter' },
  { id: 'MULTICROP_PLANTER', name: 'Multicrop Planter', category: 'Implement', subCategory: 'Planter' },

  // 5. Harvesting & Post-Harvest (6 Models)
  { id: 'STRAW_REAPER', name: 'Straw Reaper', category: 'Implement', subCategory: 'Harvesting' },
  { id: 'PADDY_THRESHER', name: 'Paddy Thresher', category: 'Implement', subCategory: 'Harvesting' },
  { id: 'REAPER_BINDER', name: 'Reaper Binder (Tractor Mounted)', category: 'Implement', subCategory: 'Harvesting' },
  { id: 'SQUARE_BALER', name: 'Square Baler', category: 'Implement', subCategory: 'Baler' },
  { id: 'HAY_RAKE', name: 'Hay Rake', category: 'Implement', subCategory: 'Hay Equipment' },
  { id: 'TURMERIC_DIGGER_SS', name: 'Turmeric Digger SS Model', category: 'Implement', subCategory: 'Digger' },

  // 6. Crop Care & Mulching (5 Models)
  { id: 'MULCHER', name: 'Mulcher', category: 'Implement', subCategory: 'Mulcher' },
  { id: 'SLASHER', name: 'Slasher', category: 'Implement', subCategory: 'Slasher' },
  { id: 'INTER_ROW_WEEDER', name: 'Inter Row Weeder', category: 'Implement', subCategory: 'Weeder' },
  { id: 'POWER_WEEDER', name: 'Power Weeder', category: 'Implement', subCategory: 'Weeder' },
  { id: 'FERTILIZER_SPREADER', name: 'Fertilizer Spreader', category: 'Implement', subCategory: 'Spreader' },

  // 7. Genuine Spare Parts
  { id: 'SPARE_PARTS', name: 'Genuine Swan Blades, Gearbox & Spares', category: 'Spare Part', subCategory: 'Spares' }
];

export const ALL_PRODUCT_NAMES = PRODUCT_GROUPS.map(p => p.name);
export const ALL_IMPLEMENT_NAMES = PRODUCT_GROUPS.filter(p => p.category === 'Implement').map(p => p.name);
export const ALL_SPARE_NAMES = PRODUCT_GROUPS.filter(p => p.category === 'Spare Part').map(p => p.name);
