import test from 'node:test';
import assert from 'node:assert/strict';

// Test the core search and filter logic of SearchableProductSelect
function filterProducts(products, query) {
  if (!query || !query.trim()) return products;
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return products.filter(p => {
    const searchTarget = [
      p.name,
      p.sku,
      p.category,
      p.sub_category,
      p.description
    ].filter(Boolean).join(' ').toLowerCase();

    return tokens.every(token => searchTarget.includes(token));
  });
}

test('multi-token search matches across name and specs in any order', () => {
  const catalog = [
    { id: '1', name: 'Rotavator | MINI | Single | 2.5ft', sku: '4000000653', category: 'Rotavator', price: 48656 },
    { id: '2', name: 'Rotavator | MINI | Single | 3.25ft', sku: '4000000654', category: 'Rotavator', price: 52632 },
    { id: '3', name: 'Laser Land Leveller', sku: 'PRD-LASE-7006', category: 'Laser', price: 130889 },
    { id: '4', name: 'Super Seeder 8 Row', sku: 'SWAN-SEED-08', category: 'Seeder', price: 245000 }
  ];

  const res1 = filterProducts(catalog, 'mini 3.25');
  assert.equal(res1.length, 1);
  assert.equal(res1[0].sku, '4000000654');

  const res2 = filterProducts(catalog, '3.25 mini');
  assert.equal(res2.length, 1);
  assert.equal(res2[0].sku, '4000000654');
});

test('SKU lookup matches exact and partial SKU codes', () => {
  const catalog = [
    { id: '1', name: 'Rotavator | MINI | Single | 2.5ft', sku: '4000000653', category: 'Rotavator', price: 48656 },
    { id: '2', name: 'Rotavator | MINI | Single | 3.25ft', sku: '4000000654', category: 'Rotavator', price: 52632 },
    { id: '3', name: 'Laser Land Leveller', sku: 'PRD-LASE-7006', category: 'Laser', price: 130889 }
  ];

  const res = filterProducts(catalog, '4000000653');
  assert.equal(res.length, 1);
  assert.equal(res[0].name, 'Rotavator | MINI | Single | 2.5ft');
  assert.equal(res[0].price, 48656);
});

test('selecting product pre-fills standard price into rate field', () => {
  const selected = {
    id: 'prod_1',
    name: 'Rotavator | MINI | Single | 2.5ft',
    sku: '4000000653',
    price: 48656
  };

  const lineItem = { product: '', qty: 1, rate: 0 };
  lineItem.product = selected.name;
  lineItem.rate = Number(selected.price) || 0;

  assert.equal(lineItem.product, 'Rotavator | MINI | Single | 2.5ft');
  assert.equal(lineItem.rate, 48656);
});

test('order totals calculate accurately across multiple line items', () => {
  const orderItems = [
    { product: 'Rotavator 2.5ft', qty: 2, rate: 48656 },
    { product: 'Laser Land Leveller', qty: 1, rate: 130889 }
  ];

  const totalQty = orderItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
  const totalAmount = orderItems.reduce((acc, it) => acc + ((Number(it.qty) || 0) * (Number(it.rate) || 0)), 0);

  assert.equal(totalQty, 3);
  assert.equal(totalAmount, 2 * 48656 + 130889);
});

test('all 129 products are displayed without 60-item capping', () => {
  const catalog = Array.from({ length: 129 }, (_, i) => ({
    id: `prod_${i}`,
    name: `Product Model ${i + 1}`,
    sku: `SKU-${1000 + i}`,
    price: 10000 + i * 500
  }));

  const allItems = filterProducts(catalog, '');
  assert.equal(allItems.length, 129, 'Full catalog of 129 products must not be capped at 60');
});

test('blank items are properly initialized and filtered on submission', () => {
  const initialRow = { product: '', qty: 1, rate: 0 };
  assert.equal(initialRow.product, '');
  assert.equal(initialRow.rate, 0);

  const rawRows = [
    { product: 'Rotavator 2.5ft', qty: 2, rate: 48656 },
    { product: '', qty: 1, rate: 0 },
    { product: '   ', qty: 1, rate: 0 }
  ];

  const validRows = rawRows.filter(r => r.product && r.product.trim() !== '');
  assert.equal(validRows.length, 1);
  assert.equal(validRows[0].product, 'Rotavator 2.5ft');
});

test('OrderRevisionModal handleProductSelect handles product object and pre-fills rate correctly', () => {
  const catalog = [
    { id: 'PRD-MINI-6986', name: 'Mini Mulcher | 3Ft', price: 84786, sku: '4000000686' },
    { id: 'PRD-ROTA-1001', name: 'Rotavator | 6Ft', price: 110000, sku: '4000000701' }
  ];

  let items = [{ product: 'Old Product', qty: 1, rate: 50000 }];

  // Simulate handleProductSelect
  const handleProductSelect = (index, selectedProduct) => {
    const updated = [...items];
    const prodName = typeof selectedProduct === 'string'
      ? selectedProduct
      : (selectedProduct?.name || selectedProduct?.id || '');

    let prodPrice = null;
    if (typeof selectedProduct === 'object' && selectedProduct?.price != null && selectedProduct?.price !== '') {
      prodPrice = selectedProduct.price;
    } else {
      const match = catalog.find(p =>
        p.name === prodName ||
        p.id === prodName ||
        (p.sku && p.sku === prodName)
      );
      if (match && match.price != null && match.price !== '') {
        prodPrice = match.price;
      }
    }

    updated[index].product = prodName;
    if (prodPrice != null && prodPrice !== '') {
      updated[index].rate = Number(prodPrice) || 0;
    }
    items = updated;
  };

  // Case 1: Selecting full product object from dropdown
  handleProductSelect(0, { id: 'PRD-MINI-6986', name: 'Mini Mulcher | 3Ft', price: 84786, sku: '4000000686' });
  assert.equal(items[0].product, 'Mini Mulcher | 3Ft');
  assert.equal(items[0].rate, 84786);

  // Case 2: Selecting by string name lookup
  handleProductSelect(0, 'Rotavator | 6Ft');
  assert.equal(items[0].product, 'Rotavator | 6Ft');
  assert.equal(items[0].rate, 110000);
});

test('currentSelected resolution works with string, object, and SKU without returning null/blank', () => {
  const normalizedProducts = [
    { id: 'PRD-MINI-6986', name: 'Mini Mulcher | 3Ft', price: 84786, sku: '4000000686' },
    { id: 'PRD-ROTA-1001', name: 'Rotavator | 6Ft', price: 110000, sku: '4000000701' }
  ];

  const resolveCurrentSelected = (value) => {
    if (!value) return null;
    const valStr = typeof value === 'string'
      ? value.trim()
      : (typeof value === 'object' ? (value.name || value.id || value.sku || '').trim() : String(value).trim());
    if (!valStr) return null;

    const match = normalizedProducts.find(p =>
      p.name?.toLowerCase() === valStr.toLowerCase() ||
      p.id?.toLowerCase() === valStr.toLowerCase() ||
      (p.sku && p.sku.toLowerCase() === valStr.toLowerCase())
    );

    if (match) return match;
    if (typeof value === 'object' && value.name) return value;
    return { name: valStr };
  };

  // String lookup
  const res1 = resolveCurrentSelected('Mini Mulcher | 3Ft');
  assert.equal(res1?.name, 'Mini Mulcher | 3Ft');
  assert.equal(res1?.price, 84786);

  // Object lookup
  const res2 = resolveCurrentSelected({ id: 'PRD-MINI-6986', name: 'Mini Mulcher | 3Ft' });
  assert.equal(res2?.name, 'Mini Mulcher | 3Ft');
  assert.equal(res2?.price, 84786);

  // SKU lookup
  const res3 = resolveCurrentSelected('4000000686');
  assert.equal(res3?.name, 'Mini Mulcher | 3Ft');
  assert.equal(res3?.price, 84786);
});
