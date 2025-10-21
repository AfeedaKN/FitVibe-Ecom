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
        toastMessages: [] 
      });
    }

    const originalItemCount = cart.items.length;
    const validItems = [];
    const toastMessages = [];

    for (const item of cart.items) {
      const product = item.productId;

      
      if (!product || product.isDeleted || !product.isListed) {
        toastMessages.push(`Product '${product?.name || 'Unknown'}' was unlisted by admin, so removing it from cart.`);
        continue;
      }

      
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        toastMessages.push(`Product '${product.name}' was removed due to invalid or missing quantity.`);
        continue;
      }

      const matchedVariant = product.variants.find(variant => 
        variant._id.toString() === item.variantId.toString()
      );

      
      if (!matchedVariant || matchedVariant.varientquatity <= 0) {
        toastMessages.push(`Product '${product.name} - ${matchedVariant?.size || 'Variant'}' was removed as it is now out of stock.`);
        continue;
      }

      
      if (matchedVariant.varientquatity < item.quantity) {
        toastMessages.push(`Quantity for '${product.name} - ${matchedVariant.size}' was updated to ${matchedVariant.varientquatity} due to low stock.`);
        item.quantity = matchedVariant.varientquatity;
      }

      item.variant = matchedVariant; 
      validItems.push(item);
    }

    
    if (validItems.length < originalItemCount) {
      cart.items = validItems;
      await cart.save();
    }

    
    const subtotal = validItems.reduce((sum, item) => {
      return sum + (item.variant?.salePrice || 0) * item.quantity;
    }, 0);

    const tax = 0; 
    const discount = 0; 
    const shipping = validItems.length > 0 ? 100 : 0; 
    const total = subtotal + shipping;

    const defaultAddress = addresses.find(addr => addr.isDefault);
    
    res.render('checkout', {
      addresses,
      user,
      cart: { items: validItems }, 
      subtotal,
      tax,
      discount,
      shipping,
      total,
      defaultAddress: defaultAddress ? defaultAddress._id : null,
      walletBalance: walletBalance,
      toastMessages 
    });

  } catch (error) {
    console.error('Checkout error:', error.message, error.stack);
    res.status(500).send('Server Error');
  }
};


const placeOrder = async (req, res) => {
  try {
    const { paymentMethod, addressId, couponCode, couponDiscount } = req.body;
    const userId = req.user._id;
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    
    const toastMessages = [];
    const validItems = [];

   
    if (!cart || !cart.items || cart.items.length === 0) {
      toastMessages.push('Your cart is empty. Please add items to proceed.');
      console.log('Cart is empty or missing');
      
      req.session.toastMessages = toastMessages;
      return res.status(400).json({
        success: false,
        message: 'This item is currently unavailable',
        redirect: '/user/cart',
      });
    }

    
    const originalItemCount = cart.items.length;
    for (const item of cart.items) {
      const product = item.productId;

      
      if (!product || product.isDeleted || !product.isListed) {
        toastMessages.push(
          `Product '${product?.name || "Unknown"}' was unlisted by admin, so removing it from cart.`
        );
        console.log(`Removing unlisted/deleted product: ${product?.name || "Unknown"}`);
        continue;
      }

      
      if (!item.quantity || item.quantity <= 0) {
        toastMessages.push(
          `Product '${product.name}' was removed due to invalid or missing quantity.`
        );
        console.log(`Removing product with invalid quantity: ${product.name}`);
        continue;
      }

      
      const matchedVariant = product.variants.find(
        (variant) => variant._id.toString() === item.variantId.toString()
      );

      if (!matchedVariant) {
        toastMessages.push(
          `Product '${product.name}' was removed due to invalid variant.`
        );
        console.log(`Removing product with invalid variant: ${product.name}`);
        continue;
      }

      
      if (matchedVariant.varientquatity <= 0) {
        toastMessages.push(
          `Product '${product.name} - ${matchedVariant.size}' was removed as it is now out of stock.`
        );
        console.log(`Removing out-of-stock product: ${product.name} - ${matchedVariant.size}`);
        continue;
      }

      
      if (matchedVariant.varientquatity < item.quantity) {
        toastMessages.push(
          `Quantity for '${product.name} - ${matchedVariant.size}' was updated to ${matchedVariant.varientquatity} due to low stock.`
        );
        console.log(
          `Adjusting quantity for ${product.name} - ${matchedVariant.size} from ${item.quantity} to ${matchedVariant.varientquatity}`
        );
        item.quantity = matchedVariant.varientquatity;
      }

      
      item.variant = matchedVariant;
      validItems.push(item);
    }

    
    if (validItems.length < originalItemCount || toastMessages.length > 0) {
      cart.items = validItems;
      await cart.save();
      console.log('Cart updated after validation:', cart.items);
      
      req.session.toastMessages = toastMessages;
      return res.status(400).json({
        success: false,
        message: 'This item is currently unavailable',
        redirect: '/user/cart',
      });
    }

    
    const address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing address',
      });
    }

    
    const subtotal = cart.items.reduce((sum, item) => {
      if (!item.variantId) return sum;
      return sum + (item.variant?.salePrice || 0) * item.quantity;
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
        isActive: true,
      });

      if (
        coupon &&
        coupon.expireOn >= new Date() &&
        subtotal >= coupon.minimumPrice
      ) {
        const existingOrder = await Order.findOne({
          user: userId,
          'coupon.couponId': coupon._id,
          orderStatus: { $ne: 'payment-failed' },
        });

        if (!existingOrder) {
          if (coupon.discountType === 'percentage') {
            couponDiscountAmount = (subtotal * coupon.discountValue) / 100;
            if (
              coupon.maxDiscountAmount &&
              couponDiscountAmount > coupon.maxDiscountAmount
            ) {
              couponDiscountAmount = coupon.maxDiscountAmount;
            }
          } else {
            couponDiscountAmount = Math.min(coupon.discountValue, subtotal);
          }

          couponDiscountAmount = Math.min(
            couponDiscountAmount,
            subtotal,
            parseFloat(couponDiscount)
          );

          appliedCoupon = {
            couponId: coupon._id,
            code: coupon.name,
            discountAmount: couponDiscountAmount,
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
          message: `Insufficient wallet balance. Available: ₹${walletBalance.toFixed(
            2
          )}, Required: ₹${finalAmount.toFixed(2)}`,
        });
      }
    }

    
    const generateOrderID = () => {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = ('0' + (date.getMonth() + 1)).slice(-2);
      const day = ('0' + date.getDate()).toString().padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return `ORD${year}${month}${day}${random}`;
    };

    const orderID = generateOrderID();

    
    const products = cart.items.map((item) => {
      if (!item.variant) {
        throw new Error(
          `Variant not found for product: ${item.productId._id}, variantId: ${item.variantId}`
        );
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
      orderStatus: 'pending',
      paymentStatus: 'pending',
    });

    await order.save();
    console.log('Order saved successfully with ID:', order.orderID);

    
    if (paymentMethod === 'COD') {
      for (const item of cart.items) {
        if (!item.variant) continue;

        const product = item.productId;
        const variantToUpdate = product.variants.find(
          (v) => v._id.toString() === item.variant._id.toString()
        );
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
        paymentMethod: 'COD',
      });
    }

    
    if (paymentMethod === 'Wallet' || paymentMethod === 'wallet') {
      try {
        let wallet = await findOrCreateWallet(userId);

        if (wallet.balance < finalAmount) {
          return res.status(400).json({
            success: false,
            message: `Insufficient wallet balance. Available: ₹${wallet.balance.toFixed(
              2
            )}, Required: ₹${finalAmount.toFixed(2)}`,
          });
        }

        const transaction = createTransaction(wallet, {
          type: 'debit',
          amount: finalAmount,
          description: `Payment for order ${orderID}`,
          orderId: order._id,
          status: 'completed',
          source: 'order_payment',
          metadata: {
            orderNumber: orderID,
            paymentMethod: 'Wallet',
          },
        });

        wallet.transactions = wallet.transactions.map((t) => ({
          ...t,
          source: t.source === 'legacy' ? 'cashback' : t.source,
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
          transactionId: transaction.transactionId,
        };

        await order.save();

        for (const item of cart.items) {
          if (!item.variant) continue;

          const product = item.productId;
          const variantToUpdate = product.variants.find(
            (v) => v._id.toString() === item.variant._id.toString()
          );
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
          message: `Payment of ₹${finalAmount.toFixed(2)} deducted from wallet successfully`,
        });
      } catch (error) {
        console.error('Error processing wallet payment:', error);
        return res.status(500).json({
          success: false,
          message: 'Error processing wallet payment: ' + error.message,
        });
      }
    }

    
    if (paymentMethod === 'Online') {
      const Razorpay = require('razorpay');
      const instance = new Razorpay({
        key_id: process.env.RAZORPAY_KEY,
        key_secret: process.env.RAZORPAY_SECRET,
      });

      const razorpayOptions = {
        amount: Math.round(finalAmount * 100),
        currency: 'INR',
        receipt: order.orderID,
        payment_capture: 1,
      };
      console.log("hii working checkout");
      

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
          phone: user.phone || address.phone,
        },
      });
    }
  } catch (error) {
    console.error('Error in placeOrder:', error);
    res.status(500).json({ success: false, message: 'Server Error: ' + error.message });
  }
};;


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
  getOrderSuccess,
  getOrderFailure,
  getOrderDetails
};
