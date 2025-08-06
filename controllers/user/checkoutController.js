const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');

const getCheckout = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.redirect('/login'); 
    }

    const userId = req.user._id;
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    const addresses = await Address.find({ user: userId });

    if (!cart || cart.items.length === 0) {
      return res.render('checkout', { 
        cart: null, 
        user, 
        addresses,           
        subtotal: 0, 
        tax: 0, 
        discount: 0, 
        shipping: 0, 
        total: 0, 
        defaultAddress: null 
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
      return sum + (item.variant?.salePrice || 0) * item.quantity;
    }, 0);

    const tax = 0; // Removed GST calculation
    const discount = 0; // Removed bulk discount
    const shipping = 100;
    const total = subtotal + shipping;

    const defaultAddress = addresses.find(addr => addr.isDefault);
    
    res.render('checkout', {
      addresses,
      user,
      cart,
      subtotal,
      tax,
      discount,
      shipping,
      total,
      defaultAddress: defaultAddress ? defaultAddress._id : null 
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};

const placeOrder = async (req, res) => {
  try {
    const { paymentMethod, addressId, couponCode, couponDiscount } = req.body;
    
    const userId = req.user._id;
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    // Match variants for each cart item
    cart.items.forEach(item => {
      const product = item.productId;
      const matchedVariant = product.variants.find(variant => 
        variant._id.toString() === item.variantId.toString()
      );
      item.variant = matchedVariant;
    });

    // Check stock availability
    const outOfStock = cart.items.some(item => {
      if (!item.variant) {
        console.error(`Variant not found for item: ${item.productId._id}, variantId: ${item.variantId}`);
        return true;
      }
      return item.variant.varientquatity < item.quantity;
    });

    if (outOfStock) {
      return res.status(400).json({ success: false, message: 'Some items are out of stock' });
    }

    // Validate address
    const address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid or missing address' });
    }

    // Calculate order totals
    const subtotal = cart.items.reduce((sum, item) => {
      if (!item.variant) return sum;
      return sum + (item.variant.salePrice * item.quantity);
    }, 0);

    const taxAmount = 0; // Removed GST calculation
    const discount = 0; // Removed bulk discount
    const shippingCharge = 100;
    const totalAmount = subtotal;
    
    // Handle coupon discount
    let couponDiscountAmount = 0;
    let appliedCoupon = null;
    
    if (couponCode && couponDiscount) {
      // Validate coupon one more time before applying
      const Coupon = require('../../models/couponSchema');
      const coupon = await Coupon.findOne({ 
        name: couponCode.toUpperCase(),
        isList: true,
        isActive: true
      });
      
      if (coupon && coupon.expireOn >= new Date() && subtotal >= coupon.minimumPrice) {
        // Check if user hasn't used this coupon before
        const existingOrder = await Order.findOne({
          user: userId,
          'coupon.couponId': coupon._id,
          orderStatus: { $ne: 'payment-failed' }
        });
        
        if (!existingOrder) {
          // Calculate discount based on coupon type
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
          
          // Ensure discount doesn't exceed subtotal and matches frontend calculation
          couponDiscountAmount = Math.min(couponDiscountAmount, subtotal, parseFloat(couponDiscount));
          
          appliedCoupon = {
            couponId: coupon._id,
            code: coupon.name,
            discountAmount: couponDiscountAmount
          };
        }
      }
    }
    
    const finalAmount = totalAmount - couponDiscountAmount + shippingCharge;

    // Generate order ID
    const generateOrderID = () => {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = ("0" + (date.getMonth() + 1)).slice(-2);
      const day = ("0" + date.getDate()).toString().padStart(2, "0");
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
      return `ORD${year}${month}${day}${random}`;
    };

    const orderID = generateOrderID();

    // Prepare products for order
    const products = cart.items.map(item => {
      if (!item.variant) {
        throw new Error(`Variant not found for product: ${item.productId._id}, variantId: ${item.variantId}`);
      }
      
      return {
        product: item.productId._id,
        variant: {
          size: item.variant.size,
          varientPrice: item.variant.varientPrice,
          salePrice: item.variant.salePrice,
        },
        quantity: item.quantity,
        status: 'pending', 
      };
    });

    // Create order
    const order = new Order({
      user: userId,
      orderID: orderID,
      products,
      address: address._id,
      addressDetails: {
        name: address.name,
        address: address.address,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        country: address.country,
        phone: address.phone,
      },
      totalAmount,
      discount,
      couponDiscount: couponDiscountAmount,
      taxAmount,
      shippingCharge,
      finalAmount,
      coupon: appliedCoupon,
      paymentMethod,
      orderStatus: paymentMethod === 'Online' ? 'pending' : 'pending',
      paymentStatus: paymentMethod === 'Online' ? 'pending' : 'pending',
    });

    await order.save();
    console.log("Order saved successfully with ID:", order.orderID);

    // For COD orders, update stock and clear cart immediately
    if (paymentMethod === 'COD') {
      // Update product stock
      for (const item of cart.items) {
        if (!item.variant) continue;
        
        const product = item.productId;
        const variantToUpdate = product.variants.find(v => v._id.toString() === item.variantId.toString());
        if (variantToUpdate) {
          variantToUpdate.varientquatity -= item.quantity;
          await product.save();
        }
      }

      // Clear cart
      cart.items = [];
      await cart.save();

      return res.json({ 
        success: true, 
        orderId: order._id,
        orderNumber: order.orderID,
        paymentMethod: 'COD'
      });
    }

    // For online payments, return order details for Razorpay
    if (paymentMethod === 'Online') {
      // Import Razorpay here to avoid circular dependency
      const Razorpay = require('razorpay');
      const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY,
        key_secret: process.env.RAZORPAY_SECRET
      });

      // Create Razorpay order
      const razorpayOptions = {
        amount: Math.round(finalAmount * 100), // Amount in paise
        currency: 'INR',
        receipt: order.orderID,
        payment_capture: 1
      };

      const razorpayOrder = await instance.orders.create(razorpayOptions);

      // Update order with Razorpay order ID
      order.razorpayOrderId = razorpayOrder.id;
      await order.save();

      return res.json({
        success: true,
        orderId: order._id,
        orderNumber: order.orderID,
        paymentMethod: 'Online',
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOptions.amount,
        currency: razorpayOptions.currency,
        key_id: process.env.RAZORPAY_KEY,
        user: {
          name: user.name,
          email: user.email,
          phone: user.phone || address.phone
        }
      });
    }

  } catch (error) {
    console.error('Error in placeOrder:', error);
    res.status(500).json({ success: false, message: 'Server Error: ' + error.message });
  }
};

const getOrderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Find the specific order by ID
    const order = await Order.findById(orderId)
      .populate('products.product')
      .populate('address');
    
    if (!order) {
      return res.status(404).render('pageNotFound', { message: 'Order not found' });
    }
    
    // Pass the specific order and its orderID
    res.render('order-success', { 
      orderId: order.orderID, 
      order: [order] // Keep as array for template compatibility
    });
  } catch (error) {
    console.error('Error in getOrderSuccess:', error);
    res.status(500).send('Server Error');
  }
};

const getOrderFailure = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    // Find the specific order by ID
    const order = await Order.findById(orderId)
      .populate('products.product')
      .populate('address');
    
    if (!order) {
      return res.status(404).render('pageNotFound', { message: 'Order not found' });
    }
    
    // Verify this is actually a failed order
    if (order.orderStatus !== 'payment-failed') {
      return res.redirect(`/order/success/${orderId}`);
    }
    
    // Render the failure page with order details
    res.render('order-failure', { 
      order: order
    });
  } catch (error) {
    console.error('Error in getOrderFailure:', error);
    res.status(500).send('Server Error');
  }
};

const verifyPayment = async (req, res) => {
  try {
    console.log('=== PAYMENT VERIFICATION START ===');
    console.log('Request body:', req.body);
    
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    // Validate required fields
    if (!orderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      console.log('Missing payment details:', {
        orderId: !!orderId,
        razorpay_payment_id: !!razorpay_payment_id,
        razorpay_order_id: !!razorpay_order_id,
        razorpay_signature: !!razorpay_signature
      });
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }

    // Verify signature
    const crypto = require('crypto');
    const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSign = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(sign)
      .digest('hex');

    console.log('Signature verification:', {
      received_signature: razorpay_signature,
      expected_signature: expectedSign,
      sign_string: sign,
      razorpay_secret: process.env.RAZORPAY_SECRET ? 'Present' : 'Missing'
    });

    if (razorpay_signature !== expectedSign) {
      console.log('❌ Signature verification failed');
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    console.log('✅ Signature verification successful');

    // Find and update order
    console.log('Finding order with ID:', orderId);
    const order = await Order.findById(orderId);
    if (!order) {
      console.log('❌ Order not found');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    console.log('✅ Order found:', order.orderID);

    // Update order status
    console.log('Updating order status...');
    order.paymentStatus = 'Paid';
    order.orderStatus = 'Confirmed';
    order.paymentId = razorpay_payment_id;
    order.paymentDetails = {
      paymentId: razorpay_payment_id,
      status: 'completed',
      createdAt: new Date(),
      razorpaySignature: razorpay_signature
    };

    await order.save();
    console.log('✅ Order updated successfully');

    // Update product stock and clear cart
    const userId = req.user._id;
    console.log('Finding cart for user:', userId);
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (cart && cart.items.length > 0) {
      console.log('Updating product stock for', cart.items.length, 'items');
      
      // Update product stock
      for (const item of cart.items) {
        const product = item.productId;
        const variantToUpdate = product.variants.find(v => v._id.toString() === item.variantId.toString());
        if (variantToUpdate) {
          const oldStock = variantToUpdate.varientquatity;
          variantToUpdate.varientquatity -= item.quantity;
          await product.save();
          console.log(`Updated stock for ${product.name}: ${oldStock} -> ${variantToUpdate.varientquatity}`);
        }
      }

      // Clear cart
      cart.items = [];
      await cart.save();
      console.log('✅ Cart cleared');
    } else {
      console.log('No cart found or cart is empty');
    }

    console.log('=== PAYMENT VERIFICATION SUCCESS ===');
    res.json({ success: true, message: 'Payment verified and order confirmed' });

  } catch (error) {
    console.error('=== PAYMENT VERIFICATION ERROR ===');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ success: false, message: 'Payment verification failed: ' + error.message });
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate("products.product")
      .populate("address"); 

    if (!order) {
      return res.status(404).send("Order not found");
    }

    res.render("order-details", { order }); 
  } catch (error) {
    console.error("Order Detail Error:", error);
    res.status(500).send("Server Error");
  }
};

module.exports = {
  getCheckout,
  placeOrder,
  verifyPayment,
  getOrderSuccess,
  getOrderFailure,
  getOrderDetails
};
