const Coupon = require('../../models/couponSchema');
const Cart = require('../../models/cartSchema');
const Order = require('../../models/orderSchema');

// Apply coupon to cart
const applyCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    
    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to apply coupon'
      });
    }
    
    const userId = req.user._id;

    console.log('Applying coupon:', couponCode, 'for user:', userId);

    // Validate input
    if (!couponCode || !couponCode.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a coupon code'
      });
    }

    // Get user's cart
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Match variants for each cart item
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

    // Calculate cart totals
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

    const taxAmount = 0; // Removed GST calculation
    const bulkDiscount = 0; // Removed bulk discount
    const shippingCharge = 100;

    // Find and validate coupon
    const coupon = await Coupon.findOne({
      name: couponCode.toUpperCase().trim(),
      isList: true,        // Must be listed to be usable
      isActive: true,      // Must be active
      isDeleted: { $ne: true }  // Must not be deleted
    });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    // Check if coupon is expired
    if (coupon.expireOn < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'This coupon has expired'
      });
    }

    // Check minimum purchase requirement
    if (subtotal < coupon.minimumPrice) {
      return res.status(400).json({
        success: false,
        message: `Minimum purchase amount of ₹${coupon.minimumPrice.toLocaleString('en-IN')} required`
      });
    }

    // Check if user has already used this coupon
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

    // Check usage limit
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

    // Calculate coupon discount
    let couponDiscountAmount = 0;
    if (coupon.discountType === 'percentage') {
      couponDiscountAmount = (subtotal * coupon.discountValue) / 100;
      // Apply maximum discount limit if set
      if (coupon.maxDiscountAmount && couponDiscountAmount > coupon.maxDiscountAmount) {
        couponDiscountAmount = coupon.maxDiscountAmount;
      }
    } else {
      // Fixed discount
      couponDiscountAmount = Math.min(coupon.discountValue, subtotal);
    }

    // Ensure discount doesn't exceed subtotal
    couponDiscountAmount = Math.min(couponDiscountAmount, subtotal);

    // **PROPORTIONAL DISTRIBUTION LOGIC**
    // Calculate proportional discount for each cart item
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

    // Calculate final totals
    const totalAfterCoupon = subtotal - couponDiscountAmount;
    const finalAmount = totalAfterCoupon + shippingCharge;

    // Store coupon data in session for order placement
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

// Remove coupon from cart
const removeCoupon = async (req, res) => {
  try {
    // Check if user is authenticated
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Please log in to remove coupon'
      });
    }
    
    const userId = req.user._id;

    console.log('Removing coupon for user:', userId);

    // Get user's cart
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Match variants for each cart item
    cart.items.forEach(item => {
      const product = item.productId;
      const matchedVariant = product.variants.find(variant => 
        variant._id.toString() === item.variantId.toString()
      );
      item.variant = matchedVariant;
    });

    // Calculate original totals (without coupon)
    const subtotal = cart.items.reduce((sum, item) => {
      if (!item.variant) return sum;
      return sum + (item.variant.salePrice * item.quantity);
    }, 0);

    const taxAmount = 0; // Removed GST calculation
    const bulkDiscount = 0; // Removed bulk discount
    const shippingCharge = 100;
    const finalAmount = subtotal + shippingCharge;

    // Remove coupon from session
    delete req.session.appliedCoupon;

    // Return original cart items without discount
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

// Validate coupon (for real-time validation)
const validateCoupon = async (req, res) => {
  try {
    const { couponCode } = req.body;
    
    // Check if user is authenticated
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

    // Get user's cart
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Calculate cart subtotal
    const subtotal = cart.items.reduce((sum, item) => {
      const product = item.productId;
      const matchedVariant = product.variants.find(variant => 
        variant._id.toString() === item.variantId.toString()
      );
      if (!matchedVariant) return sum;
      return sum + (matchedVariant.salePrice * item.quantity);
    }, 0);

    // Find coupon
    const coupon = await Coupon.findOne({
      name: couponCode.toUpperCase().trim(),
      isList: true,        // Must be listed to be usable
      isActive: true,      // Must be active
      isDeleted: { $ne: true }  // Must not be deleted
    });

    if (!coupon) {
      return res.status(400).json({
        success: false,
        message: 'Invalid coupon code'
      });
    }

    // Validate coupon conditions
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

    // Check if user has already used this coupon
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

    // Calculate potential discount
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

module.exports = {
  applyCoupon,
  removeCoupon,
  validateCoupon
};
