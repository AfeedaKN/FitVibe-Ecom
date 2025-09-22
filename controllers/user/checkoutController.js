const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Wallet = require('../../models/walletShema');
const Coupon = require('../../models/couponSchema');
const { findOrCreateWallet, createTransaction } = require('../../controllers/user/walletController')

const getCheckout = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.redirect('/login'); 
    }

    const userId = req.user._id;
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    const addresses = await Address.find({ user: userId });

    let wallet = await Wallet.findOne({ userId });
    const walletBalance = wallet ? wallet.balance : 0;

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
        defaultAddress: null,
        walletBalance: walletBalance,
        flashMessages: req.flash('info')
      });
    }

    const originalItemCount = cart.items.length;
    const validItems = [];
    const removalMessages = [];

    for (const item of cart.items) {
      const product = item.productId;
      if (!product || product.isDeleted || !product.isListed) {
        removalMessages.push(`An item was removed because it's no longer available.`);
        continue;
      }

      const matchedVariant = product.variants.find(variant => 
        variant._id.toString() === item.variantId.toString()
      );

      if (!matchedVariant || matchedVariant.varientquatity <= 0) {
        removalMessages.push(`'${product.name} - ${matchedVariant?.size || 'Variant'}' was removed as it is now out of stock.`);
        continue;
      }

      if (matchedVariant.varientquatity < item.quantity) {
        removalMessages.push(`Quantity for '${product.name} - ${matchedVariant.size}' was updated to ${matchedVariant.varientquatity} due to low stock.`);
        item.quantity = matchedVariant.varientquatity;
      }

      item.variant = matchedVariant; 
      validItems.push(item);
    }

    if (validItems.length < originalItemCount) {
      cart.items = validItems;
      await cart.save();
      req.flash('info', removalMessages);
      
      return res.redirect('/checkout');
    }

    const subtotal = cart.items.reduce((sum, item) => {
      return sum + (item.variant?.salePrice || 0) * item.quantity;
    }, 0);


    const tax = 0; 
    const discount = 0; 
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
      defaultAddress: defaultAddress ? defaultAddress._id : null,
      walletBalance: walletBalance,
      flashMessages: req.flash('info')
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

    cart.items.forEach(item => {
      const product = item.productId;
      const matchedVariant = product.variants.find(variant => 
        variant._id.toString() === item.variantId.toString()
      );
      item.variantId = matchedVariant;
    });

    const outOfStock = cart.items.some(item => {
      if (!item.variantId) {
        console.error(`Variant not found for item: ${item.productId._id}, variantId: ${item.variantId}`);
        return true;
      }
      return item.variantId.varientquatity < item.quantity;
    });

    if (outOfStock) {
      return res.status(400).json({ success: false, message: 'Some items are out of stock' });
    }

    const address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid or missing address' });
    }

    const subtotal = cart.items.reduce((sum, item) => {
      if (!item.variantId) return sum;
      return sum + (item.variant.salePrice * item.quantity);
    }, 0);

    const taxAmount = 0;
    const discount = 0;
    const shippingCharge = 100;
    const totalAmount = subtotal;
    
    let couponDiscountAmount = 0;
    let appliedCoupon = null;
    
    if (couponCode && couponDiscount) {
      
      const coupon = await Coupon.findOne({ 
        name: couponCode.toUpperCase(),
        isList: true,
        isActive: true
      });
      
      if (coupon && coupon.expireOn >= new Date() && subtotal >= coupon.minimumPrice) {
        const existingOrder = await Order.findOne({
          user: userId,
          'coupon.couponId': coupon._id,
          orderStatus: { $ne: 'payment-failed' }
        });
        
        
        if (!existingOrder) {
          if (coupon.discountType === 'percentage') {
            couponDiscountAmount = (subtotal * coupon.discountValue) / 100;
            if (coupon.maxDiscountAmount && couponDiscountAmount > coupon.maxDiscountAmount) {
              couponDiscountAmount = coupon.maxDiscountAmount;
            }
          } else {
            couponDiscountAmount = Math.min(coupon.discountValue, subtotal);
          }
          
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

    if (paymentMethod === 'Wallet' || paymentMethod === 'wallet') {
      const wallet = await Wallet.findOne({ userId });
      const walletBalance = wallet ? wallet.balance : 0;
      
      if (walletBalance < finalAmount) {
        return res.status(400).json({ 
          success: false, 
          message: `Insufficient wallet balance. Available: ₹${walletBalance.toFixed(2)}, Required: ₹${finalAmount.toFixed(2)}` 
        });
      }
    }

    const generateOrderID = () => {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = ("0" + (date.getMonth() + 1)).slice(-2);
      const day = ("0" + date.getDate()).toString().padStart(2, "0");
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
      return `ORD${year}${month}${day}${random}`;
    };

    const orderID = generateOrderID();

    const products = cart.items.map(item => {
      if (!item.variant) {
        throw new Error(`Variant not found for product: ${item.productId._id}, variantId: ${item.variantId}`);
      }
      
      return {
        product: item.productId._id,
        variant: {
          size: item.variantId.size,
          varientPrice: item.variantId.varientPrice,
          salePrice: item.variantId.salePrice,
        },
        quantity: item.quantity,
        status: 'pending'
      };
    });

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
        phone: address.phone
      },
      totalAmount,
      discount,
      couponDiscount: couponDiscountAmount,
      taxAmount,
      shippingCharge,
      finalAmount,
      coupon: appliedCoupon,
      paymentMethod,
      orderStatus: 'pending',
      paymentStatus: 'pending'
    });

    await order.save();
    console.log("Order saved successfully with ID:", order.orderID);

    if (paymentMethod === 'COD') {
      for (const item of cart.items) {
        if (!item.variant) continue;
        
        const product = item.productId;
        const variantToUpdate = product.variants.find(v => v._id.toString() === item.variantId.toString());
        if (variantToUpdate) {
          variantToUpdate.varientquatity -= item.quantity;
          await product.save();
        }
      }

      cart.items = [];
      await cart.save();

      return res.json({ 
        success: true, 
        orderId: order._id,
        orderNumber: order.orderID,
        paymentMethod: 'COD'
      });
    }

    if (paymentMethod === 'Wallet' || paymentMethod === 'wallet') {
      try {
        let wallet = await findOrCreateWallet(userId);
        
        if (wallet.balance < finalAmount) {
          return res.status(400).json({ 
            success: false, 
            message: `Insufficient wallet balance. Available: ₹${wallet.balance.toFixed(2)}, Required: ₹${finalAmount.toFixed(2)}` 
          });
        }

        const transaction = createTransaction(wallet, {
          type: "debit",
          amount: finalAmount,
          description: `Payment for order ${orderID}`,
          orderId: order._id,
          status: "completed",
          source: "order_payment", 
          metadata: {
            orderNumber: orderID,
            paymentMethod: 'Wallet'
          }
        });

        wallet.transactions = wallet.transactions.map(t => ({
          ...t,
          source: t.source === 'legacy' ? 'cashback' : t.source 
        }));

        wallet.transactions.unshift(transaction);
        wallet.balance -= finalAmount;
        await wallet.save({ validateModifiedOnly: true }); 

        order.paymentStatus = 'completed';
        order.orderStatus = 'processing';
        order.paymentId = transaction.transactionId;
        order.paymentDetails = {
          paymentMethod: 'Wallet',
          status: 'completed',
          createdAt: new Date(),
          amount: finalAmount,
          transactionId: transaction.transactionId
        };

        await order.save();

        for (const item of cart.items) {
          if (!item.variant) continue;
          
          const product = item.productId;
          const variantToUpdate = product.variants.find(v => v._id.toString() === item.variantId.toString());
          if (variantToUpdate) {
            variantToUpdate.varientquatity -= item.quantity;
            await product.save();
          }
        }

        cart.items = [];
        await cart.save();

        return res.json({ 
          success: true, 
          orderId: order._id,
          orderNumber: order.orderID,
          paymentMethod: 'Wallet',
          transactionId: transaction.transactionId,
          message: `Payment of ₹${finalAmount.toFixed(2)} deducted from wallet successfully`
        });

      } catch (error) {
        console.error('Error processing wallet payment:', error);
        return res.status(500).json({ 
          success: false, 
          message: 'Error processing wallet payment: ' + error.message 
        });
      }
    }

    if (paymentMethod === 'Online') {
      const Razorpay = require('razorpay');
      const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY,
        key_secret: process.env.RAZORPAY_SECRET
      });

      const razorpayOptions = {
        amount: Math.round(finalAmount * 100),
        currency: 'INR',
        receipt: order.orderID,
        payment_capture: 1
      };

      const razorpayOrder = await instance.orders.create(razorpayOptions);

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
    
    const order = await Order.findById(orderId)
      .populate('products.product')
      .populate('address');
    
    if (!order) {
      return res.status(404).render('pageNotFound', { message: 'Order not found' });
    }
    
    res.render('order-success', { 
      orderId: order.orderID, 
      order: [order] 
    });
  } catch (error) {
    console.error('Error in getOrderSuccess:', error);
    res.status(500).send('Server Error');
  }
};

const getOrderFailure = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findById(orderId)
      .populate('products.product')
      .populate('address');
    
    if (!order) {
      return res.status(404).render('pageNotFound', { message: 'Order not found' });
    }
    
    if (order.orderStatus !== 'payment-failed') {
      return res.redirect(`/order/success/${orderId}`);
    }
    
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
    
    
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    if (!orderId || !razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      console.log('Missing payment details:', {
        orderId: !!orderId,
        razorpay_payment_id: !!razorpay_payment_id,
        razorpay_order_id: !!razorpay_order_id,
        razorpay_signature: !!razorpay_signature
      });
      return res.status(400).json({ success: false, message: 'Missing payment details' });
    }

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
      console.log(' Signature verification failed');
      return res.status(400).json({ success: false, message: 'Invalid payment signature' });
    }

    console.log(' Signature verification successful');

    console.log('Finding order with ID:', orderId);
    const order = await Order.findById(orderId);
    if (!order) {
      console.log(' Order not found');
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    console.log(' Order found:', order.orderID);

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
    console.log(' Order updated successfully');

    const userId = req.user._id;
    console.log('Finding cart for user:', userId);
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (cart && cart.items.length > 0) {
      console.log('Updating product stock for', cart.items.length, 'items');
      
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

      cart.items = [];
      await cart.save();
      console.log(' Cart cleared');
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
