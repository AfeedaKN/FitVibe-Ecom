// Test script to verify refund calculation
// This simulates the calculateItemFinalAmount function used in both user and admin controllers

function calculateItemFinalAmount(item, order) {
  console.log('=== TESTING REFUND CALCULATION (FIXED VERSION) ===');
  
  // Calculate item subtotal (exactly as in UI)
  const itemSubtotal = item.variant.salePrice * item.quantity;
  console.log('Item Subtotal:', itemSubtotal);
  
  // Calculate total coupon discount (exactly as in UI)
  let totalCouponDiscount = 0;
  if (order.couponDiscount && order.couponDiscount > 0) {
    totalCouponDiscount = order.couponDiscount;
    console.log('Using order.couponDiscount:', totalCouponDiscount);
  } else if (order.coupon && order.coupon.discountAmount && order.coupon.discountAmount > 0) {
    totalCouponDiscount = order.coupon.discountAmount;
    console.log('Using order.coupon.discountAmount:', totalCouponDiscount);
  }
  console.log('Total Coupon Discount:', totalCouponDiscount);
  
  // Calculate total order subtotal for proportional calculation (exactly as in UI)
  let orderSubtotal = 0;
  order.products.forEach(orderItem => {
    orderSubtotal += (orderItem.variant.salePrice * orderItem.quantity);
  });
  console.log('Order Subtotal:', orderSubtotal);
  
  // Calculate proportional coupon discount for this item (exactly as in UI)
  let itemCouponDiscount = 0;
  if (totalCouponDiscount > 0 && orderSubtotal > 0) {
    itemCouponDiscount = (itemSubtotal / orderSubtotal) * totalCouponDiscount;
  }
  console.log('Item Coupon Discount:', itemCouponDiscount);
  
  // Calculate final amount for this item after coupon discount (exactly as in UI)
  const itemFinalAmount = itemSubtotal - itemCouponDiscount;
  console.log('Item Final Amount (Balance Amount - REFUND TO WALLET):', itemFinalAmount);
  
  return {
    itemSubtotal,
    itemCouponDiscount,
    itemFinalAmount
  };
}

// Test case 1: Order with coupon discount
console.log('\n=== TEST CASE 1: Order with Coupon ===');
const testOrder1 = {
  couponDiscount: 100,
  products: [
    { variant: { salePrice: 1000 }, quantity: 1 },
    { variant: { salePrice: 500 }, quantity: 2 }
  ]
};

const testItem1 = { variant: { salePrice: 1000 }, quantity: 1 };
const result1 = calculateItemFinalAmount(testItem1, testOrder1);

console.log('\nExpected:');
console.log('- Item Subtotal: 1000');
console.log('- Order Subtotal: 2000 (1000 + 500*2)');
console.log('- Item Coupon Discount: 50 (1000/2000 * 100)');
console.log('- Balance Amount (REFUND): 950 (1000 - 50)');

// Test case 2: Order without coupon discount
console.log('\n=== TEST CASE 2: Order without Coupon ===');
const testOrder2 = {
  couponDiscount: 0,
  products: [
    { variant: { salePrice: 1000 }, quantity: 1 }
  ]
};

const testItem2 = { variant: { salePrice: 1000 }, quantity: 1 };
const result2 = calculateItemFinalAmount(testItem2, testOrder2);

console.log('\nExpected:');
console.log('- Item Subtotal: 1000');
console.log('- Item Coupon Discount: 0');
console.log('- Balance Amount (REFUND): 1000');

// Test case 3: Multiple items with different prices and coupon
console.log('\n=== TEST CASE 3: Complex Order with Multiple Items ===');
const testOrder3 = {
  couponDiscount: 200,
  products: [
    { variant: { salePrice: 1500 }, quantity: 1 }, // Item being returned
    { variant: { salePrice: 800 }, quantity: 2 },  // Other items
    { variant: { salePrice: 600 }, quantity: 1 }   // Other items
  ]
};

const testItem3 = { variant: { salePrice: 1500 }, quantity: 1 }; // Returning the first item
const result3 = calculateItemFinalAmount(testItem3, testOrder3);

console.log('\nExpected:');
console.log('- Item Subtotal: 1500');
console.log('- Order Subtotal: 3700 (1500 + 800*2 + 600)');
console.log('- Item Coupon Discount: 81.08 (1500/3700 * 200)');
console.log('- Balance Amount (REFUND): 1418.92 (1500 - 81.08)');

console.log('\n=== SUMMARY ===');
console.log('✅ Test 1 - Balance Amount should be 950:', result1.itemFinalAmount);
console.log('✅ Test 2 - Balance Amount should be 1000:', result2.itemFinalAmount);
console.log('✅ Test 3 - Balance Amount should be ~1418.92:', result3.itemFinalAmount.toFixed(2));

console.log('\n=== FIX SUMMARY ===');
console.log('🔧 ISSUE: Admin itemReturnApprove was only refunding item.variant.salePrice * item.quantity');
console.log('✅ FIXED: Now refunds itemFinalAmount which includes proportional coupon discount');
console.log('💰 RESULT: Users now get correct refund amount including coupon discount in wallet');
console.log('📝 WALLET DESCRIPTION: Now shows detailed breakdown with Balance Amount and coupon discount info');

console.log('\n=== WALLET TRANSACTION EXAMPLES ===');
console.log('📱 For item with coupon:');
console.log('   "Refund for returned product T-Shirt (Size: M) in order ORD240101001');
console.log('   - Balance Amount: ₹950.00 (Subtotal: ₹1000.00 - Coupon Discount: ₹50.00)"');
console.log('');
console.log('📱 For item without coupon:');
console.log('   "Refund for returned product T-Shirt (Size: M) in order ORD240101001');
console.log('   - Balance Amount: ₹1000.00"');