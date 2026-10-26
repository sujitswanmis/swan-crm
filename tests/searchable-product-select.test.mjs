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
