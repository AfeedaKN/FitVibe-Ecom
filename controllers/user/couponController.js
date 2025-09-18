const Coupon = require('../../models/couponSchema');
const Cart = require('../../models/cartSchema');
const Order = require('../../models/orderSchema');

const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to apply coupon'
      });
    }
    
    const userId = req.user._id;

    

    if (!couponCode || !couponCode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a coupon code'
      });
    }

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    cart.items.forEach(item => {
      const product = item.productId;
      if (!product || !product.variants) {
        console.error('Product or variants not found for item:', item);
        return;
      }
      const matchedVariant = product.variants.find(variant => 
        variant._id.toString() === item.variantId.toString()
      );
      if (!matchedVariant) {
        console.error('Variant not found for item:', item.variantId);
      }
      item.variant = matchedVariant;
    });

    const subtotal = cart.items.reduce((sum, item) => {
      if (!item.variant) {
        console.error('No variant found for cart item:', item);
        return sum;
      }
      if (!item.variant.salePrice) {
        console.error('No salePrice found for variant:', item.variant);
        return sum;
      }
      return sum + (item.variant.salePrice * item.quantity);
    }, 0);

    console.log('Calculated subtotal:', subtotal);

    if (subtotal === 0) {
      return res.status(400).json({
        success: false,
        message: 'Unable to calculate cart total. Please refresh and try again.'
      });
    }

    const taxAmount = 0; 
    const bulkDiscount = 0; 
    const shippingCharge = 100;

    const coupon = await Coupon.findOne({
      name: couponCode.toUpperCase().trim(),
      isList: true,        
      isActive: true,      
      isDeleted: { $ne: true }  
    });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    if (coupon.expireOn < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This coupon has expired'
      });
    }

    if (subtotal < coupon.minimumPrice) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase amount of ₹${coupon.minimumPrice.toLocaleString('en-IN')} required`
      });
    }

    const existingOrder = await Order.findOne({
      user: userId,
      'coupon.couponId': coupon._id,
      orderStatus: { $ne: 'payment-failed' }
    });

    if (existingOrder) {
      return res.status(400).json({
        success: false,
        message: 'You have already used this coupon'
      });
    }

    if (coupon.usageLimit) {
      const currentUsage = await Order.countDocuments({
        'coupon.couponId': coupon._id,
        orderStatus: { $ne: 'payment-failed' }
      });

      if (currentUsage >= coupon.usageLimit) {
        return res.status(400).json({
          success: false,
          message: 'This coupon has reached its usage limit'
        });
      }
    }

    let couponDiscountAmount = 0;
    if (coupon.discountType === 'percentage') {
      couponDiscountAmount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount && couponDiscountAmount > coupon.maxDiscountAmount) {
        couponDiscountAmount = coupon.maxDiscountAmount;
      }
    } else {
      couponDiscountAmount = Math.min(coupon.discountValue, subtotal);
    }

    couponDiscountAmount = Math.min(couponDiscountAmount, subtotal);

    const itemsWithDiscount = cart.items.map(item => {
      if (!item.variant) return item;

      const itemTotal = item.variant.salePrice * item.quantity;
      const itemProportion = itemTotal / subtotal;
      const itemDiscount = couponDiscountAmount * itemProportion;
      const itemDiscountPerUnit = itemDiscount / item.quantity;

      return {
        ...item.toObject(),
        itemTotal: itemTotal,
        itemDiscount: itemDiscount,
        itemDiscountPerUnit: itemDiscountPerUnit,
        discountedPrice: item.variant.salePrice - itemDiscountPerUnit,
        discountedTotal: itemTotal - itemDiscount
      };
    });

    const totalAfterCoupon = subtotal - couponDiscountAmount;
    const finalAmount = totalAfterCoupon + shippingCharge;

    req.session.appliedCoupon = {
      couponId: coupon._id,
      code: coupon.name,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      discountAmount: couponDiscountAmount,
      itemsWithDiscount: itemsWithDiscount
    };

    console.log('Coupon applied successfully:', {
      code: coupon.name,
      discountAmount: couponDiscountAmount,
      itemsCount: itemsWithDiscount.length
    });

    res.json({
      success: true,
      message: 'Coupon applied successfully!',
      coupon: {
        code: coupon.name,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: couponDiscountAmount
      },
      totals: {
        subtotal: subtotal,
        tax: taxAmount,
        discount: bulkDiscount,
        couponDiscount: couponDiscountAmount,
        shipping: shippingCharge,
        total: finalAmount
      },
      itemsWithDiscount: itemsWithDiscount
    });

  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error applying coupon. Please try again.'
    });
  }
};

const removeCoupon = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to remove coupon'
      });
    }
    
    const userId = req.user._id;

    console.log('Removing coupon for user:', userId);

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    cart.items.forEach(item => {
      const product = item.productId;
      const matchedVariant = product.variants.find(variant => 
        variant._id.toString() === item.variantId.toString()
      );
      item.variant = matchedVariant;
    });

    const subtotal = cart.items.reduce((sum, item) => {
      if (!item.variant) return sum;
      return sum + (item.variant.salePrice * item.quantity);
    }, 0);

    const taxAmount = 0; 
    const bulkDiscount = 0; 
    const shippingCharge = 100;
    const finalAmount = subtotal + shippingCharge;

    delete req.session.appliedCoupon;

    const originalItems = cart.items.map(item => {
      if (!item.variant) return item;

      return {
        ...item.toObject(),
        itemTotal: item.variant.salePrice * item.quantity,
        itemDiscount: 0,
        itemDiscountPerUnit: 0,
        discountedPrice: item.variant.salePrice,
        discountedTotal: item.variant.salePrice * item.quantity
      };
    });

    console.log('Coupon removed successfully');

    res.json({
      success: true,
      message: 'Coupon removed successfully',
      totals: {
        subtotal: subtotal,
        tax: taxAmount,
        discount: bulkDiscount,
        couponDiscount: 0,
        shipping: shippingCharge,
        total: finalAmount
      },
      itemsWithDiscount: originalItems
    });

  } catch (error) {
    console.error('Error removing coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing coupon. Please try again.'
    });
  }
};

const validateCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to validate coupon'
      });
    }
    
    const userId = req.user._id;

    if (!couponCode || !couponCode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a coupon code'
      });
    }

    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    const subtotal = cart.items.reduce((sum, item) => {
      const product = item.productId;
      const matchedVariant = product.variants.find(variant => 
        variant._id.toString() === item.variantId.toString()
      );
      if (!matchedVariant) return sum;
      return sum + (matchedVariant.salePrice * item.quantity);
    }, 0);

    const coupon = await Coupon.findOne({
      name: couponCode.toUpperCase().trim(),
      isList: true,        
      isActive: true,      
      isDeleted: { $ne: true }  
    });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    if (coupon.expireOn < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This coupon has expired'
      });
    }

    if (subtotal < coupon.minimumPrice) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase amount of ₹${coupon.minimumPrice.toLocaleString('en-IN')} required`
      });
    }

    const existingOrder = await Order.findOne({
      user: userId,
      'coupon.couponId': coupon._id,
      orderStatus: { $ne: 'payment-failed' }
    });

    if (existingOrder) {
      return res.status(400).json({
        success: false,
        message: 'You have already used this coupon'
      });
    }

    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
      discountAmount = (subtotal * coupon.discountValue) / 100;
      if (coupon.maxDiscountAmount && discountAmount > coupon.maxDiscountAmount) {
        discountAmount = coupon.maxDiscountAmount;
      }
    } else {
      discountAmount = Math.min(coupon.discountValue, subtotal);
    }

    res.json({
      success: true,
      message: 'Coupon is valid',
      coupon: {
        code: coupon.name,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        discountAmount: discountAmount,
        description: coupon.description
      }
    });

  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating coupon'
    });
  }
};

const getAvailableCoupons = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({ success: false, message: 'Please log in to view coupons' });
    }

    const userId = req.user._id;
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.json({ success: true, coupons: [] });
    }

    
    let subtotal = 0;
    cart.items.forEach(item => {
      const product = item.productId;
      if (!product) return;
      const matchedVariant = product.variants?.find(v => v._id.toString() === item.variantId.toString());
      if (!matchedVariant) return;
      subtotal += (matchedVariant.salePrice || 0) * item.quantity;
    });

    if (subtotal <= 0) {
      return res.json({ success: true, coupons: [] });
    }

    const now = new Date();

    
    const coupons = await Coupon.find({
      isList: true,
      isActive: true,
      isDeleted: { $ne: true },
      expireOn: { $gte: now },
      minimumPrice: { $lte: subtotal }
    }).lean();

    
    const results = [];
    for (const c of coupons) {
      
      const usedByUser = await Order.findOne({
        user: userId,
        'coupon.couponId': c._id,
        orderStatus: { $ne: 'payment-failed' }
      }).lean();
      if (usedByUser) continue;

      
      if (c.usageLimit) {
        const totalUsage = await Order.countDocuments({
          'coupon.couponId': c._id,
          orderStatus: { $ne: 'payment-failed' }
        });
        if (totalUsage >= c.usageLimit) continue;
      }

      
      let discountAmount = 0;
      if (c.discountType === 'percentage') {
        discountAmount = (subtotal * c.discountValue) / 100;
        if (c.maxDiscountAmount && discountAmount > c.maxDiscountAmount) {
          discountAmount = c.maxDiscountAmount;
        }
      } else {
        discountAmount = Math.min(c.discountValue, subtotal);
      }

      results.push({
        code: c.name,
        description: c.description || '',
        discountType: c.discountType,
        discountValue: c.discountValue,
        maxDiscountAmount: c.maxDiscountAmount || null,
        minimumPrice: c.minimumPrice || 0,
        expireOn: c.expireOn,
        estimatedDiscount: discountAmount
      });
    }

    
    results.sort((a, b) => {
      if (b.estimatedDiscount !== a.estimatedDiscount) return b.estimatedDiscount - a.estimatedDiscount;
      return new Date(a.expireOn) - new Date(b.expireOn);
    });

    return res.json({ success: true, coupons: results });
  } catch (error) {
    console.error('Error fetching available coupons:', error);
    return res.status(500).json({ success: false, message: 'Error fetching available coupons' });
  }
};

module.exports = {
  applyCoupon,
  removeCoupon,
  validateCoupon,
  getAvailableCoupons
};
