const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletShema');
const PDFDocument = require('pdfkit');
const fs = require("fs");
const mongoose = require('mongoose');

// Helper function to calculate item final amount (matches UI calculation exactly)
const calculateItemFinalAmount = (item, order) => {
  // Calculate item subtotal (exactly as in UI)
  const itemSubtotal = item.variant.salePrice * item.quantity;
  
  // Calculate total coupon discount (exactly as in UI)
  let totalCouponDiscount = 0;
  if (order.couponDiscount && order.couponDiscount > 0) {
    totalCouponDiscount = order.couponDiscount;
  } else if (order.coupon && order.coupon.discountAmount && order.coupon.discountAmount > 0) {
    totalCouponDiscount = order.coupon.discountAmount;
  }
  
  // Calculate total order subtotal for proportional calculation (exactly as in UI)
  let orderSubtotal = 0;
  order.products.forEach(orderItem => {
    orderSubtotal += (orderItem.variant.salePrice * orderItem.quantity);
  });
  
  // Calculate proportional coupon discount for this item (exactly as in UI)
  let itemCouponDiscount = 0;
  if (totalCouponDiscount > 0 && orderSubtotal > 0) {
    itemCouponDiscount = (itemSubtotal / orderSubtotal) * totalCouponDiscount;
  }
  
  // Calculate final amount for this item after coupon discount (exactly as in UI)
  const itemFinalAmount = itemSubtotal - itemCouponDiscount;
  
  return {
    itemSubtotal,
    itemCouponDiscount,
    itemFinalAmount
  };
};

const getOrders = async (req, res) => {
  try {
    const limit = 5;
    const page = parseInt(req.query.page) || 1;
    const query = req.query.search || '';

    let dateFilter = {};
    if (!isNaN(Date.parse(query))) {
      const date = new Date(query);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      dateFilter = {
        orderDate: {
          $gte: date,
          $lt: nextDay
        }
      };
    }

    const searchFilter = {
      user: req.user._id,
      $or: [
        { orderID: { $regex: query, $options: 'i' } },
        { orderStatus: { $regex: query, $options: 'i' } }
      ],
      ...dateFilter
    };

    const totalOrders = await Order.countDocuments(searchFilter);
    const totalPages = Math.ceil(totalOrders / limit);

    const user = await User.findById(req.user._id);

    const orders = await Order.find(searchFilter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('products.product')
      .lean();

    res.render("orders", {
      user: req.user,
      orders,
      totalPages,
      currentPage: page,
      query: req.query.search || "",
      messages: req.flash(),
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};

const getOrderDetail = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.id;

    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate("products.product")
      .populate("address")
      .populate("user");

    if (!order) {
      return res.status(404).render("pageNotFound", { message: "Order not found" });
    }

    res.render("order-details", {
      order,
    });
  } catch (error) {
    console.error("Error loading order detail:", error);
    res.status(500).render("pageNotFound", { message: "Error loading order details" });
  }
};

const cancelOrder = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const reason = req.body.reason;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.json({ success: false, message: 'Order not found.' });
    }
    
    // Store original payment status for refund check
    const originalPaymentStatus = order.paymentStatus;
    
    order.orderStatus = 'cancelled';
    order.cancelReason = reason || '';

    // Restore product stock
    for (const item of order.products) { 
      const productId = item.product;
      const variantSize = item.variant.size;
      const quantityToAdd = item.quantity;
      item.status = "cancelled";
      
      const product = await Product.findById(productId);
      if (product) {
        const variant = product.variants.find(v => v.size === variantSize);
        if (variant) {
          variant.varientquatity += quantityToAdd;
        }
        await product.save();
      }
    }

    // Handle refund for online payments
    if (order.paymentMethod && 
        (order.paymentMethod.toLowerCase() === 'online' || order.paymentMethod === 'Online') &&
        (originalPaymentStatus === 'completed' || originalPaymentStatus === 'success')) {
      
      const refundAmount = order.finalAmount;
      const userId = order.user;

      // Find or create wallet
      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({
          userId,
          balance: refundAmount,
          transactions: [{
            type: "credit",
            amount: refundAmount,
            description: `Refund for cancelled order ${order.orderID}`,
            createdAt: new Date()
          }]
        });
      } else {
        wallet.balance += refundAmount;
        wallet.transactions.unshift({
          type: "credit",
          amount: refundAmount,
          description: `Refund for cancelled order ${order.orderID}`,
          createdAt: new Date()
        });
      }

      await wallet.save();
      
      // Update order with refund information
      order.refundAmount = refundAmount;
      order.paymentStatus = 'refunded';
      
      // Add status history
      order.statusHistory.push({
        status: 'refunded',
        date: new Date(),
        description: `₹${refundAmount} refunded to wallet for cancelled order`,
      });
    }

    await order.save();

    return res.json({ success: true, message: 'Order cancelled successfully.' });
  } catch (error) {
    console.error('Error canceling order:', error);
    return res.json({ success: false, message: 'Error canceling order.', error: error.message });
  }
};

const returnOrder = async (req, res) => {
  try {
    const { orderId, reason, productIds } = req.body;

    console.log('Return request body:', req.body); 

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    const order = await Order.findOne({ _id: orderId, user: req.session.user._id });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found or not owned by user' });
    }

    
    if (order.orderStatus.toLowerCase() !== 'delivered') {
      return res.status(400).json({ success: false, message: 'Only delivered orders can be returned' });
    }

    
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      return res.status(400).json({ success: false, message: 'Return reason is required' });
    }

    
    order.orderStatus = 'return pending';
    order.returnReason = reason.trim();

    
    let itemsToReturn = [];
    if (productIds && Array.isArray(productIds) && productIds.length > 0) {
      itemsToReturn = order.products.filter(item => productIds.includes(item.product.toString()));
      if (itemsToReturn.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid products selected for return' });
      }
    } else {
      itemsToReturn = order.products; 
    }

    
    for (const item of itemsToReturn) {
      if (['return pending', 'returned'].includes(item.status)) {
        console.log(`Skipping item ${item.product} as it is already ${item.status}`);
        continue; 
      }
      item.status = 'return pending';
      item.returnReason = reason.trim();
      item.returnRequestDate = new Date();

      const product = await Product.findById(item.product);
      if (!product) {
        console.error(`Product not found: ${item.product}`);
        continue;
      }

      const variant = product.variants.find(v => v.size === item.variant.size);
      if (!variant) {
        console.error(`Variant not found for product: ${item.product}, size: ${item.variant.size}`);
        continue;
      }

      variant.varientquatity += item.quantity;
      console.log(`Restored stock for product ${item.product}, size ${item.variant.size}: +${item.quantity}`);
      await product.save();
    }

    
    order.statusHistory.push({
      status: 'return pending',
      date: new Date(),
      description: `Return requested: ${reason.trim()}`,
    });

    await order.save();
    console.log('Order saved with return pending status:', order.orderStatus);

    return res.json({ success: true, message: 'Return request submitted successfully' });
  } catch (error) {
    console.error('Error processing return request:', error);
    return res.status(500).json({ success: false, message: 'Server error processing return request', error: error.message });
  }
};

const cancelOrderItem = async (req, res) => {
  try {
    const { orderId, productId, variantSize, reason } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Order ID or Product ID'
      });
    }

    if (!orderId || !productId || !variantSize) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: orderId, productId, or variantSize' 
      });
    }

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found or not owned by user' 
      });
    }

    if (!['pending', 'processing'].includes(order.orderStatus)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Order cannot be cancelled at this stage' 
      });
    }

    const item = order.products.find(item =>
      item.product.toString() === productId &&
      item.variant.size === variantSize &&
      item.status !== 'cancelled'
    );

    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: 'Item not found or already cancelled' 
      });
    }

    item.status = 'cancelled';
    item.cancelReason = reason || '';
    item.cancelDate = new Date();

    // Use helper function to calculate exact final amount (matches UI calculation)
    const { itemSubtotal: cancelledItemSubtotal, itemCouponDiscount, itemFinalAmount: cancelledItemFinalAmount } = calculateItemFinalAmount(item, order);
    
    // Update order amounts - subtract the final amount (not just subtotal)
    order.finalAmount = Math.max(0, order.finalAmount - cancelledItemFinalAmount);
    order.totalAmount = Math.max(0, order.totalAmount - cancelledItemSubtotal);
    
    // DO NOT UPDATE COUPON DISCOUNT - Keep original coupon discount amount fixed
    // The coupon discount should remain as it was during payment to maintain payment integrity

    // Restore product stock
    const product = await Product.findById(productId);
    if (product) {
      const variant = product.variants.find(v => v.size === variantSize);
      if (variant) {
        variant.varientquatity += item.quantity;
        await product.save();
      }
    }

    const refundAmount = cancelledItemFinalAmount;
    
    // For ALL payment methods: Require admin approval before wallet credit
    item.refundStatus = 'pending';
    item.refundAmount = refundAmount;
    item.refundRequestDate = new Date();
    
    // Update order with pending refund information
    order.refundAmount = (order.refundAmount || 0) + refundAmount;
    order.refundStatus = 'pending';
    if (!order.refundRequestDate) {
      order.refundRequestDate = new Date();
    }

    const allItemsCancelled = order.products.every(p => p.status === 'cancelled');
    if (allItemsCancelled) {
      order.orderStatus = 'cancelled';
      
      // Set payment status based on payment method and whether refund was processed
      if (order.paymentMethod && 
          (order.paymentMethod.toLowerCase() === 'online' || order.paymentMethod === 'Online') &&
          (order.paymentStatus === 'completed' || order.paymentStatus === 'success') &&
          order.refundAmount > 0) {
        order.paymentStatus = 'refunded';
      } else {
        order.paymentStatus = 'cancelled';
      }
    }

    // All refunds now require admin approval
    order.statusHistory.push({
      status: 'item cancelled',
      date: new Date(),
      description: `Item cancelled: ${product?.name || 'Product'} (${variantSize})${reason ? ` - Reason: ${reason}` : ''}. Refund of ₹${refundAmount.toFixed(2)} is pending admin approval.`
    });

    await order.save();

    return res.json({ 
      success: true, 
      message: `Item cancelled successfully. Refund of ₹${refundAmount.toFixed(2)} is pending admin approval and will be credited to your wallet once approved.`
    });

  } catch (error) {
    console.error('Error cancelling item:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error while cancelling item' 
    });
  }
};

const returnOrderItem = async (req, res) => {
  try {
    console.log("Incoming request headers:", req.headers);
    console.log("Raw request body:", req.body);

    if (!req.body) {
      console.error("req.body is undefined");
      return res.status(400).json({
        success: false,
        message: "Request body is missing",
      });
    }

    const { orderId, productId, variantSize, reason } = req.body;
    console.log("Destructured:", { orderId, productId, variantSize, reason });

    const userId = req.user._id;

    if (!orderId || !productId || !variantSize || !reason) {
      console.log("Missing fields:", { orderId, productId, variantSize, reason });
      return res.status(400).json({
        success: false,
        message: "Missing required fields: orderId, productId, variantSize, or reason",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID or Product ID",
      });
    }

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found or not owned by user",
      });
    }

    if (order.orderStatus !== "delivered" && order.orderStatus !== "return pending") {
      return res.status(400).json({
        success: false,
        message: "Only delivered items can be returned",
      });
    }

    console.log("All Items in Order:");
    order.products.forEach((item, idx) => {
      console.log(
        `Item ${idx + 1}: Product=${item.product}, Size=${item.variant.size}, Status=${item.status}`
      );
    });

    const itemIndex = order.products.findIndex(
      (item) => item.product.equals(productId) && item.variant.size === variantSize
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Item not found in order",
      });
    }

    const item = order.products[itemIndex];

    console.log("Selected Item to Return:");
    console.log(`Product: ${item.product}, Size: ${item.variant.size}, Status: ${item.status}`);

    if (item.status === "return pending") {
      return res.status(400).json({
        success: false,
        message: "Return already requested for this item",
      });
    }

    if (item.status === "returned") {
      return res.status(400).json({
        success: false,
        message: "Item is already returned",
      });
    }

    // Use helper function to calculate exact final amount (matches UI calculation)
    const { itemSubtotal: returnedItemSubtotal, itemCouponDiscount, itemFinalAmount: returnedItemFinalAmount } = calculateItemFinalAmount(item, order);

    item.status = "return pending";
    item.returnReason = reason;
    item.returnRequestDate = new Date();

    const product = await Product.findById(productId);
    if (product) {
      const variant = product.variants.find((v) => v.size === variantSize);
      if (variant) {
        variant.varientquatity += item.quantity;
        await product.save();
      }
    }

    const refundAmount = returnedItemFinalAmount;
    
    // For ALL payment methods: Require admin approval before wallet credit
    item.refundStatus = 'pending';
    item.refundAmount = refundAmount;
    item.refundRequestDate = new Date();
    
    // Update order with pending refund information
    order.refundAmount = (order.refundAmount || 0) + refundAmount;
    order.refundStatus = 'pending';
    if (!order.refundRequestDate) {
      order.refundRequestDate = new Date();
    }
    
    // Update order amounts - subtract the final amount
    order.finalAmount = Math.max(0, order.finalAmount - returnedItemFinalAmount);
    order.totalAmount = Math.max(0, order.totalAmount - returnedItemSubtotal);
    
    // DO NOT UPDATE COUPON DISCOUNT - Keep original coupon discount amount fixed
    // The coupon discount should remain as it was during payment to maintain payment integrity
    // The refund amount already accounts for the proportional coupon discount

    const allItemsReturnPending = order.products.every((item) =>
      ["return pending", "returned"].includes(item.status)
    );
    if (allItemsReturnPending) {
      order.orderStatus = "return pending";
    }

    // All refunds now require admin approval
    order.statusHistory.push({
      status: "item return requested",
      date: new Date(),
      description: `Return requested for: ${product?.name || "Product"} (${variantSize}) - Reason: ${reason}. Refund of ₹${refundAmount.toFixed(2)} is pending admin approval.`,
    });

    await order.save();

    return res.json({
      success: true,
      message: `Return request submitted successfully. Refund of ₹${refundAmount.toFixed(2)} is pending admin approval and will be credited to your wallet once approved.`,
    });
  } catch (error) {
    console.error("Error processing return request:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while processing return request",
      error: error.message,
    });
  }
};

const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId)
      .populate('products.product')
      .populate('address');

    if (!order) {
      return res.status(404).render('pageNotFound', { message: 'Order not found' });
    }

    const doc = new PDFDocument({ margin: 50 });
    const fileName = `invoice-${order.orderID}.pdf`;

    res.setHeader('Content-disposition', `attachment; filename=${fileName}`);
    res.setHeader('Content-type', 'application/pdf');

    doc.pipe(res);

    doc.fontSize(20).text('FitVibe', { align: 'center' });
    doc.fontSize(16).text('Invoice', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`Order #${order.orderID}`, { align: 'left' });
    doc.text(`Order Date: ${order.orderDate.toLocaleDateString()}`, { align: 'left' });
    doc.text(`Status: ${order.orderStatus}`, { align: 'left' });
    doc.text(`Payment Method: ${order.paymentMethod}`, { align: 'left' });
    doc.text(`Payment Status: ${order.paymentStatus || 'Unknown'}`, { align: 'left' });
    doc.moveDown();

    if (order.addressDetails) {
      doc.fontSize(14).text('Shipping Address:', { align: 'left' });
      doc.fontSize(12)
        .text(`${order.addressDetails.name}`)
        .text(`${order.addressDetails.address}, ${order.addressDetails.city}, ${order.addressDetails.state} - ${order.addressDetails.zipCode}`)
        .text(`${order.addressDetails.country}`)
        .text(`Phone: ${order.addressDetails.phone}`);
      doc.moveDown();
    } else {
      doc.fontSize(14).text('Shipping Address: Not available', { align: 'left' });
      doc.moveDown();
    }

    doc.fontSize(14).text('Order Items:', { align: 'left' });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const itemWidth = 100;
    const priceWidth = 80;
    const qtyWidth = 60;
    const totalWidth = 80;

    doc.fontSize(10).font('Helvetica-Bold')
      .text('Product', 50, tableTop, { width: itemWidth })
      .text('Variant', 150, tableTop, { width: itemWidth })
      .text('Price', 250, tableTop, { width: priceWidth, align: 'right' })
      .text('Quantity', 330, tableTop, { width: qtyWidth, align: 'right' })
      .text('Total', 390, tableTop, { width: totalWidth, align: 'right' });

    doc.moveTo(50, tableTop + 15).lineTo(470, tableTop + 15).stroke();
    let y = tableTop + 25;

    order.products.forEach(item => {
      doc.font('Helvetica')
        .text(item.product.name, 50, y, { width: itemWidth })
        .text(item.variant.size, 150, y, { width: itemWidth })
        .text(`₹${item.variant.salePrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 250, y, { width: priceWidth, align: 'right' })
        .text(item.quantity, 330, y, { width: qtyWidth, align: 'right' })
        .text(`₹${(item.variant.salePrice * item.quantity).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 390, y, { width: totalWidth, align: 'right' });
      y += 20;
    });

    doc.moveDown(2);
    doc.fontSize(12).font('Helvetica')
      .text(`Subtotal: ₹${order.totalAmount.toFixed(2)}`, { align: 'right' });
    if (order.couponDiscount > 0) {
      doc.text(`Coupon Discount: -₹${order.couponDiscount.toFixed(2)}`, { align: 'right' });
    }
    doc.text(`Shipping: ₹${order.shippingCharge.toFixed(2)}`, { align: 'right' })
      .font('Helvetica-Bold')
      .text(`Total: ₹${order.finalAmount.toFixed(2)}`, { align: 'right' });

    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica')
      .text('Thank you for shopping with FitVibe!', { align: 'center' });

    doc.end();
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).send('Error generating invoice');
  }
};

const retryPayment = async (req, res) => {
  try {
    console.log('Retry payment request:', req.body);
    console.log('User:', req.user);
    
    const { orderId, amount } = req.body;
    const userId = req.user._id;

    // Validate input
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    // Validate order
    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    console.log('Found order:', {
      orderID: order.orderID,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      orderStatus: order.orderStatus,
      isLocked: order.isLocked
    });

    // Check if order is eligible for payment retry
    const isEligibleForRetry = (
      order.paymentMethod && 
      (order.paymentMethod.toLowerCase() === 'online' || order.paymentMethod === 'Online') &&
      (order.paymentStatus === 'pending' || order.paymentStatus === 'failed' || order.orderStatus === 'payment-failed')
    );

    if (!isEligibleForRetry) {
      return res.status(400).json({ 
        success: false, 
        message: `This order is not eligible for payment retry. Payment Method: ${order.paymentMethod}, Payment Status: ${order.paymentStatus}, Order Status: ${order.orderStatus}` 
      });
    }

    // Check environment variables
    if (!process.env.RAZORPAY_KEY || !process.env.RAZORPAY_SECRET) {
      console.error('Razorpay credentials missing:', {
        key_id: !!process.env.RAZORPAY_KEY,
        key_secret: !!process.env.RAZORPAY_SECRET
      });
      return res.status(500).json({ 
        success: false, 
        message: 'Payment gateway configuration error' 
      });
    }

    // Create new Razorpay order for retry
    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY,
      key_secret: process.env.RAZORPAY_SECRET,
    });

    console.log('Creating Razorpay order with amount:', order.finalAmount);

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.finalAmount * 100), // Convert to paise
      currency: 'INR',
      receipt: `retry_${order.orderID}_${Date.now()}`,
    });

    console.log('Razorpay order created:', razorpayOrder);

    // Update order with new Razorpay order ID and reset status for retry
    order.razorpayOrderId = razorpayOrder.id;
    order.paymentStatus = 'pending';
    
    // Reset order status if it was payment-failed to allow retry
    if (order.orderStatus === 'payment-failed') {
      order.orderStatus = 'pending';
    }
    
    // Unlock the order for retry attempts
    order.isLocked = false;
    
    // Initialize paymentDetails if it doesn't exist
    if (!order.paymentDetails) {
      order.paymentDetails = {};
    }
    
    // Update payment details for retry
    order.paymentDetails.razorpayOrderId = razorpayOrder.id;
    order.paymentDetails.amount = razorpayOrder.amount;
    order.paymentDetails.currency = razorpayOrder.currency;
    order.paymentDetails.createdAt = new Date();
    order.paymentDetails.status = 'pending';
    
    // Clear previous failure details for fresh retry
    order.paymentDetails.failureReason = undefined;
    order.paymentDetails.failureCode = undefined;
    
    // Count retry attempts
    const retryCount = order.statusHistory.filter(h => h.status.includes('retry')).length + 1;
    
    // Add status history entry
    order.statusHistory.push({
      status: 'payment retry initiated',
      date: new Date(),
      description: `Payment retry initiated by user (Attempt #${retryCount})`,
    });

    await order.save();
    console.log('Order updated successfully for retry');

    res.json({
      success: true,
      key_id: process.env.RAZORPAY_KEY,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      razorpayOrderId: razorpayOrder.id,
      orderId: order._id,
      user: {
        name: req.user.name,
        email: req.user.email,
        phone: req.user.phone
      }
    });

  } catch (error) {
    console.error('Error creating retry payment:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error preparing payment retry',
      error: error.message 
    });
  }
};

// Admin function to approve refunds and credit wallet
const approveRefund = async (req, res) => {
  try {
    const { orderId, productId, variantSize, adminNotes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Order ID or Product ID'
      });
    }

    const order = await Order.findById(orderId).populate('products.product');
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    const item = order.products.find(item =>
      item.product._id.toString() === productId &&
      item.variant.size === variantSize &&
      item.refundStatus === 'pending'
    );

    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: 'Refund request not found or already processed' 
      });
    }

    // Calculate the exact final amount as shown in order details UI
    const { itemFinalAmount } = calculateItemFinalAmount(item, order);
    
    // Use the calculated final amount (not the stored refundAmount which might be incorrect)
    const refundAmount = itemFinalAmount;
    const userId = order.user;

    // Credit the exact final amount to wallet
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({
        userId,
        balance: refundAmount,
        transactions: [{
          type: "credit",
          amount: refundAmount,
          description: `Refund approved for ${item.product.name} (${variantSize}) in order ${order.orderID} - Final Amount: ₹${refundAmount.toFixed(2)}`,
          createdAt: new Date()
        }]
      });
    } else {
      wallet.balance += refundAmount;
      wallet.transactions.unshift({
        type: "credit",
        amount: refundAmount,
        description: `Refund approved for ${item.product.name} (${variantSize}) in order ${order.orderID} - Final Amount: ₹${refundAmount.toFixed(2)}`,
        createdAt: new Date()
      });
    }

    await wallet.save();

    // Update item refund status and store the correct refund amount
    item.refundStatus = 'approved';
    item.refundAmount = refundAmount; // Update with correct final amount
    item.refundApprovedDate = new Date();
    item.refundProcessedDate = new Date();
    item.adminNotes = adminNotes || '';

    // Update order refund status
    const allPendingRefundsProcessed = order.products.every(p => 
      p.refundStatus !== 'pending'
    );
    
    if (allPendingRefundsProcessed) {
      order.refundStatus = 'processed';
      order.refundApprovedDate = new Date();
      order.refundProcessedDate = new Date();
      order.adminRefundNotes = adminNotes || '';
    }

    // Add status history
    order.statusHistory.push({
      status: 'refund approved',
      date: new Date(),
      description: `Refund of ₹${refundAmount.toFixed(2)} (Final Amount) approved and credited to wallet for ${item.product.name} (${variantSize})${adminNotes ? ` - Admin notes: ${adminNotes}` : ''}`,
    });

    await order.save();

    return res.json({ 
      success: true, 
      message: `Refund of ₹${refundAmount.toFixed(2)} (Final Amount from order details) has been approved and credited to user's wallet.`
    });

  } catch (error) {
    console.error('Error approving refund:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error while approving refund' 
    });
  }
};

// Admin function to reject refunds
const rejectRefund = async (req, res) => {
  try {
    const { orderId, productId, variantSize, adminNotes } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Order ID or Product ID'
      });
    }

    const order = await Order.findById(orderId).populate('products.product');
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        message: 'Order not found' 
      });
    }

    const item = order.products.find(item =>
      item.product._id.toString() === productId &&
      item.variant.size === variantSize &&
      item.refundStatus === 'pending'
    );

    if (!item) {
      return res.status(404).json({ 
        success: false, 
        message: 'Refund request not found or already processed' 
      });
    }

    const refundAmount = item.refundAmount;

    // Update item refund status to rejected
    item.refundStatus = 'rejected';
    item.refundApprovedDate = new Date();
    item.adminNotes = adminNotes || '';

    // Restore the order amounts since refund is rejected
    order.finalAmount += refundAmount;
    order.totalAmount += (item.variant.salePrice * item.quantity);

    // Update order refund amount
    order.refundAmount = Math.max(0, order.refundAmount - refundAmount);

    // Check if all refunds are processed
    const allPendingRefundsProcessed = order.products.every(p => 
      p.refundStatus !== 'pending'
    );
    
    if (allPendingRefundsProcessed) {
      if (order.refundAmount === 0) {
        order.refundStatus = 'none';
      } else {
        order.refundStatus = 'processed';
      }
      order.adminRefundNotes = adminNotes || '';
    }

    // Add status history
    order.statusHistory.push({
      status: 'refund rejected',
      date: new Date(),
      description: `Refund of ₹${refundAmount.toFixed(2)} rejected for ${item.product.name} (${variantSize})${adminNotes ? ` - Admin notes: ${adminNotes}` : ''}`,
    });

    await order.save();

    return res.json({ 
      success: true, 
      message: `Refund request has been rejected.`
    });

  } catch (error) {
    console.error('Error rejecting refund:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Server error while rejecting refund' 
    });
  }
};

module.exports = {
  getOrders,
  getOrderDetail,
  cancelOrder,
  cancelOrderItem,
  returnOrder,
  returnOrderItem,
  downloadInvoice,
  retryPayment,
  approveRefund,
  rejectRefund
};