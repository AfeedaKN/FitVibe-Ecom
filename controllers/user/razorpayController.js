const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();
const Order = require('../../models/orderSchema');
const Cart = require('../../models/cartSchema');


const instance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY,
  key_secret: process.env.RAZORPAY_SECRET
});




const getPaymentDetails = async (req, res) => {
  try {
    const { payment_id } = req.params;

    if (!payment_id) {
      return res.status(400).json({
        success: false,
        message: 'Payment ID is required'
      });
    }

    const payment = await instance.payments.fetch(payment_id);

    res.status(200).json({
      success: true,
      payment
    });
  } catch (error) {
    console.error('Error fetching payment details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details',
      error: error.message
    });
  }
};

const handlePaymentFailure = async (req, res) => {
  try {
    console.log('=== PAYMENT FAILURE HANDLER START ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { orderId, error, razorpay_order_id, razorpay_payment_id } = req.body;

    if (!orderId) {
      console.log('Missing orderId');
      return res.status(400).json({ 
        success: false, 
        message: 'Order ID is required' 
      });
    }

    console.log('Finding order with ID:', orderId);
    const order = await Order.findById(orderId);
    
    if (!order) {
      console.log(' Order not found');
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    console.log(' Order found:', {
      orderID: order.orderID,
      currentStatus: order.orderStatus,
      currentPaymentStatus: order.paymentStatus
    });

    if (order.paymentStatus === 'completed') {
      console.log(' Payment already completed');
      return res.json({ 
        success: true, 
        message: 'Payment already completed' 
      });
    }

    console.log('Updating order with payment failure details...');
    
    if (error?.code === 'PAYMENT_CANCELLED' || error?.description?.includes('cancelled')) {
      order.paymentStatus = 'cancelled';
      order.orderStatus = 'payment-failed';
    } else {
      order.paymentStatus = 'failed';
      order.orderStatus = 'payment-failed';
    }
    
    order.isLocked = true; 
    order.paymentMethod = 'Online'; 
    
    if (!order.paymentDetails) {
      order.paymentDetails = {};
    }
    
    order.paymentDetails.status = 'failed';
    order.paymentDetails.failureReason = error?.description || 'Payment failed';
    order.paymentDetails.failureCode = error?.code || 'PAYMENT_FAILED';
    order.paymentDetails.createdAt = new Date();
    
    if (razorpay_payment_id) {
      order.paymentDetails.paymentId = razorpay_payment_id;
    }
    
    if (razorpay_order_id) {
      order.razorpayOrderId = razorpay_order_id;
    }

    if (!order.statusHistory) {
      order.statusHistory = [];
    }
    
    const retryCount = order.statusHistory.filter(h => 
      h.status.includes('retry') || h.status.includes('payment-failed')
    ).length + 1;
    
    order.statusHistory.push({
      status: 'payment-failed',
      date: new Date(),
      description: `Payment failed (Attempt #${retryCount}): ${error?.description || 'Unknown error'}`
    });

    await order.save();
    console.log(' Order updated with payment failure status');

    console.log('=== PAYMENT FAILURE HANDLER COMPLETED ===');
    
    res.json({ 
      success: true, 
      message: 'Payment failure recorded successfully',
      orderId: order._id,
      orderNumber: order.orderID,
      status: 'payment-failed',
      canRetry: true, 
      retryCount: retryCount,
      redirectUrl: `/order/failure/${order._id}`
    });

  } catch (error) {
    console.error('=== PAYMENT FAILURE HANDLER ERROR ===');
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      message: 'Failed to record payment failure',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

const verifyRazorpayPayment = async (req, res) => {
  try {
    console.log('=== PAYMENT VERIFICATION START ===');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    const missingFields = [];
    if (!orderId) missingFields.push('orderId');
    if (!razorpay_payment_id) missingFields.push('razorpay_payment_id');
    if (!razorpay_order_id) missingFields.push('razorpay_order_id');
    if (!razorpay_signature) missingFields.push('razorpay_signature');

    if (missingFields.length > 0) {
      console.log(' Missing required fields:', missingFields);
      return res.status(400).json({ 
        success: false, 
        message: `Missing required fields: ${missingFields.join(', ')}` 
      });
    }

    if (!process.env.RAZORPAY_SECRET) {
      console.log(' RAZORPAY_SECRET not found in environment');
      return res.status(500).json({ 
        success: false, 
        message: 'Server configuration error: Missing Razorpay secret' 
      });
    }

    console.log(' Environment check passed');
    console.log('RAZORPAY_SECRET length:', process.env.RAZORPAY_SECRET.length);

    const signatureString = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(signatureString)
      .digest('hex');

    console.log('Signature verification details:');
    console.log('- Signature string:', signatureString);
    console.log('- Expected signature:', expectedSignature);
    console.log('- Received signature:', razorpay_signature);
    console.log('- Signatures match:', expectedSignature === razorpay_signature);

    if (expectedSignature !== razorpay_signature) {
      console.log(' Signature verification failed');
      return res.status(400).json({ 
        success: false, 
        message: 'Payment signature verification failed',
        debug: process.env.NODE_ENV === 'development' ? {
          expected: expectedSignature,
          received: razorpay_signature,
          signatureString: signatureString
        } : undefined
      });
    }

    console.log(' Signature verification successful');

    console.log('Finding order with ID:', orderId);
    const order = await Order.findById(orderId);
    
    if (!order) {
      console.log(' Order not found');
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    console.log(' Order found:', {
      orderID: order.orderID,
      currentStatus: order.orderStatus,
      currentPaymentStatus: order.paymentStatus,
      razorpayOrderId: order.razorpayOrderId || 'Not set'
    });

    if (order.razorpayOrderId && order.razorpayOrderId !== razorpay_order_id) {
      console.log(' Razorpay order ID mismatch');
      console.log('Expected:', order.razorpayOrderId);
      console.log('Received:', razorpay_order_id);
      return res.status(400).json({ 
        success: false, 
        message: 'Order ID mismatch' 
      });
    } else if (!order.razorpayOrderId) {
      console.log(' No razorpayOrderId found in order, updating it now');
      order.razorpayOrderId = razorpay_order_id;
    } else {
      console.log('Razorpay order ID matches');
    }

    if (order.paymentStatus === 'completed') {
      console.log(' Payment already processed');
      return res.json({ 
        success: true, 
        message: 'Payment already verified and processed' 
      });
    }

    console.log('Updating order with successful payment details...');
    
    order.paymentStatus = 'completed';  
    order.orderStatus = 'processing';   
    
    order.isLocked = false;
    
    if (!order.paymentId) {
      order.paymentId = razorpay_payment_id;
    }
    
    if (!order.razorpayOrderId) {
      order.razorpayOrderId = razorpay_order_id;
    }
    
    if (!order.paymentDetails) {
      order.paymentDetails = {};
    }
    
    order.paymentDetails.paymentId = razorpay_payment_id;
    order.paymentDetails.status = 'completed';
    order.paymentDetails.createdAt = new Date();
    order.paymentDetails.razorpaySignature = razorpay_signature;
    
    order.paymentDetails.failureReason = undefined;
    order.paymentDetails.failureCode = undefined;

    const retryCount = order.statusHistory.filter(h => 
      h.status.includes('retry') || h.status.includes('payment-failed')
    ).length;
    
    order.statusHistory.push({
      status: 'payment completed',
      date: new Date(),
      description: retryCount > 0 ? 
        `Payment completed successfully after ${retryCount} retry attempt(s)` : 
        'Payment completed successfully'
    });

    await order.save();
    console.log(' Order updated successfully');

    const userId = req.user._id;
    console.log('Processing post-payment actions for user:', userId);
    
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (cart && cart.items.length > 0) {
      console.log('Found cart with', cart.items.length, 'items');
      
      for (const item of cart.items) {
        try {
          const product = item.productId;
          const variantToUpdate = product.variants.find(v => 
            v._id.toString() === item.variantId.toString()
          );
          
          if (variantToUpdate) {
            const oldStock = variantToUpdate.varientquatity;
            variantToUpdate.varientquatity = Math.max(0, variantToUpdate.varientquatity - item.quantity);
            await product.save();
            console.log(` Updated stock for ${product.name}: ${oldStock} → ${variantToUpdate.varientquatity}`);
          } else {
            console.log(` Variant not found for product ${product.name}`);
          }
        } catch (stockError) {
          console.error('Error updating stock:', stockError);
        }
      }

      cart.items = [];
      await cart.save();
      console.log(' Cart cleared');
    } else {
      console.log('No cart found or cart is empty');
    }

    console.log('=== PAYMENT VERIFICATION COMPLETED SUCCESSFULLY ===');
    
    res.json({ 
      success: true, 
      message: 'Payment verified and order confirmed',
      orderId: order._id,
      orderNumber: order.orderID
    });

  } catch (error) {
    console.error('=== PAYMENT VERIFICATION ERROR ===');
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);
    
    res.status(500).json({ 
      success: false, 
      message: 'Payment verification failed due to server error',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  instance,
  getPaymentDetails,
  verifyRazorpayPayment,
  handlePaymentFailure
};