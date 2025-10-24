const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const Product = require('../../models/productSchema');
const Wallet = require('../../models/walletShema');
const PDFDocument = require('pdfkit');
const fs = require("fs");
const path = require("path");
const mongoose = require('mongoose');
const Coupon = require('../../models/couponSchema')

const calculateItemFinalAmount = (item, order) => {
  const itemSubtotal = item.variant.salePrice * item.quantity;

  
  let totalCouponDiscount = 0;
  if (order.couponDiscount && order.couponDiscount > 0) {
    totalCouponDiscount = order.couponDiscount;
  } else if (order.coupon && order.coupon.discountAmount && order.coupon.discountAmount > 0) {
    totalCouponDiscount = order.coupon.discountAmount;
  }

  let orderSubtotal = 0;
  order.products.forEach(orderItem => {
    orderSubtotal += (orderItem.variant.salePrice * orderItem.quantity);
  });

  let itemCouponDiscount = 0;
  if (totalCouponDiscount > 0 && orderSubtotal > 0) {
    itemCouponDiscount = (itemSubtotal / orderSubtotal) * totalCouponDiscount;
  }

  
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
    const reason = req.body.reason === 'Other' ? req.body.otherReason : req.body.reason || '';

    const order = await Order.findById(orderId);
    if (!order) {
      return res.json({ success: false, message: 'Order not found.' });
    }

    const originalPaymentStatus = order.paymentStatus;
    const paymentMethod = (order.paymentMethod || '').toLowerCase();

    order.orderStatus = 'cancelled';
    order.cancelReason = reason;

    for (const item of order.products) {
      item.status = 'cancelled';
      item.cancelReason = reason;

      const product = await Product.findById(item.product);
      if (product) {
        const variant = product.variants.find(v => v.size === item.variant.size);
        if (variant) {
          variant.varientquatity = (variant.varientquatity || 0) + (item.quantity || 0);
        }
        await product.save();
      }
    }

    let refundProcessed = false;

    if ((paymentMethod === 'online' || paymentMethod === 'wallet') &&
        (originalPaymentStatus === 'completed' || originalPaymentStatus === 'success')) {

      const refundAmount = order.finalAmount || 0;
      const userId = order.user;

      let wallet = await Wallet.findOne({ userId });
      if (!wallet) {
        wallet = new Wallet({ userId, balance: 0, transactions: [] });
      }
      console.log(wallet);
      
      wallet.balance = (wallet.balance || 0) + refundAmount;
      wallet.transactions.unshift({
        type: "credit",
        amount: refundAmount,
        description: `Refund for cancelled order ${order.orderID}`,
        balanceAfter: wallet.balance,
        orderId: order._id,
        source: "order_cancellation",
        metadata: {
          orderNumber: order.orderID,
          refundReason: reason,
          paymentMethod: order.paymentMethod
        }
      });

      await wallet.save();

      order.refundAmount = refundAmount;
      order.paymentStatus = 'refunded';
      order.statusHistory.push({
        status: 'refunded',
        date: new Date(),
        description: `₹${refundAmount.toFixed(2)} refunded to wallet`
      });

      for (const item of order.products) {
        item.refundStatus = 'processed';
        const unitPrice = (item.variant && (item.variant.salePrice || item.variant.varientPrice)) || 0;
        item.refundAmount = unitPrice * (item.quantity || 0);
      }

      refundProcessed = true;
    }

    if (!refundProcessed) {
      order.paymentStatus = 'cancelled';
      order.statusHistory.push({
        status: 'cancelled',
        date: new Date(),
        description: `Order cancelled without refund`
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
    

    return res.json({ success: true, message: 'Return request submitted successfully' });
  } catch (error) {
    console.error('Error processing return request:', error);
    return res.status(500).json({ success: false, message: 'Server error processing return request', error: error.message });
  }
};

const cancelOrderItem = async (req, res) => {
  try {
    const { orderId, productId, variantSize, reason } = req.body;
    const userId = req.user?._id;

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

    if (!userId) {
      console.log(`User not authenticated for orderId: ${orderId}, session: ${JSON.stringify(req.session)}`);
      return res.status(401).json({ success: false, message: 'User not authenticated. Please log in.' });
    }

    const order = await Order.findOne({ _id: orderId, user: userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found or not owned by user'
      });
    }

    console.log('Order details:', {
      orderId: order._id,
      orderStatus: order.orderStatus,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus
    });

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

    let cancelledItemSubtotal, itemCouponDiscount, cancelledItemFinalAmount;
    try {
      
      const amounts = calculateItemFinalAmount(item, order);
      cancelledItemSubtotal = amounts.itemSubtotal;
      itemCouponDiscount = amounts.itemCouponDiscount;
      cancelledItemFinalAmount = amounts.itemFinalAmount;
      console.log('Calculated amounts (balance amount only):', amounts);
    } catch (calcError) {
      console.error('Error in calculateItemFinalAmount:', calcError.message);
      console.error(calcError.stack);
      throw calcError;
    }

    
    const isSingleProductOrder = order.products.length === 1;

    
    order.finalAmount = Math.max(0, order.finalAmount - cancelledItemFinalAmount - (isSingleProductOrder ? order.shippingCharge : 0));
    order.totalAmount = Math.max(0, order.totalAmount - cancelledItemSubtotal - (isSingleProductOrder ? order.shippingCharge : 0));

    const product = await Product.findById(productId);
    if (product) {
      const variant = product.variants.find(v => v.size === variantSize);
      if (variant) {
        variant.varientquatity = (variant.varientquatity || 0) + (item.quantity || 0);
        await product.save();
      }
    }

    let refundAmount = cancelledItemFinalAmount;
    if (isSingleProductOrder) {
      refundAmount += order.shippingCharge; 
    }

    let refundProcessed = false;
    if (
      order.paymentMethod &&
      ['online', 'wallet'].includes(order.paymentMethod.toLowerCase()) &&
      (order.paymentStatus === 'completed' || order.paymentStatus === 'success' || order.paymentStatus === 'partially refunded')
    ) {
      const userId = order.user;
      let refundDescription = `Refund for cancelled item ${product?.name || 'Product'} (${variantSize}) in order ${order.orderID} - Balance Amount: ₹${cancelledItemFinalAmount.toFixed(2)}`;
      if (itemCouponDiscount > 0) {
        refundDescription += ` (Subtotal: ₹${cancelledItemSubtotal.toFixed(2)} - Coupon Discount: ₹${itemCouponDiscount.toFixed(2)})`;
      }
      if (isSingleProductOrder && order.shippingCharge > 0) {
        refundDescription += ` + Shipping Charge: ₹${order.shippingCharge.toFixed(2)}`;
      }

      let wallet = await Wallet.findOne({ userId });

      if (!wallet) {
        wallet = new Wallet({
          userId,
          balance: refundAmount,
          transactions: [{
            type: "credit",
            amount: refundAmount,
            source: "order_cancellation",
            balanceAfter: refundAmount,
            description: refundDescription,
            orderId: order._id,
            metadata: {
              orderNumber: order.orderID,
              productName: product?.name || '',
              refundReason: reason || '',
              paymentMethod: order.paymentMethod
            },
            createdAt: new Date()
          }]
        });
      } else {
        wallet.balance += refundAmount;
        wallet.transactions.unshift({
          type: "credit",
          amount: refundAmount,
          source: "order_cancellation",
          balanceAfter: wallet.balance,
          description: refundDescription,
          orderId: order._id,
          metadata: {
            orderNumber: order.orderID,
            productName: product?.name || '',
            refundReason: reason || '',
            paymentMethod: order.paymentMethod
          },
          createdAt: new Date()
        });
      }
      await wallet.save();

      item.refundStatus = 'approved';
      item.refundAmount = refundAmount;
      item.refundApprovedDate = new Date();
      item.refundProcessedDate = new Date();

      order.refundAmount = (order.refundAmount || 0) + refundAmount;
      order.refundStatus = 'processed';

      order.statusHistory.push({
        status: 'item cancelled',
        date: new Date(),
        description: `Item cancelled: ${product?.name || 'Product'} (${variantSize})${reason ? ` - Reason: ${reason}` : ''}. ₹${refundAmount.toFixed(2)} refunded to wallet (including ₹${isSingleProductOrder ? order.shippingCharge.toFixed(2) : '0.00'} shipping charge).`
      });

      if (!order.products.every(p => p.status === 'cancelled')) {
        order.paymentStatus = 'partially refunded';
      } else {
        order.paymentStatus = 'refunded';
      }

      refundProcessed = true;
    }

    if (!refundProcessed) {
      item.refundStatus = 'none';
      item.refundAmount = 0;

      order.statusHistory.push({
        status: 'item cancelled',
        date: new Date(),
        description: `Item cancelled: ${product?.name || 'Product'} (${variantSize})${reason ? ` - Reason: ${reason}` : ''}.`
      });

      if (order.paymentMethod && ['online', 'wallet'].includes(order.paymentMethod.toLowerCase()) && !['completed', 'success'].includes(order.paymentStatus)) {
        order.paymentStatus = 'cancelled';
      }
    }

    const allItemsCancelled = order.products.every(p => p.status === 'cancelled');
    if (allItemsCancelled) {
      order.orderStatus = 'cancelled';
      if (
        order.paymentMethod &&
        ['online', 'wallet'].includes(order.paymentMethod.toLowerCase()) &&
        (order.paymentStatus === 'completed' || order.paymentStatus === 'success' || order.refundAmount > 0)
      ) {
        order.paymentStatus = 'refunded';
      } else {
        order.paymentStatus = 'cancelled';
      }
    }

    await Order.updateOne({ _id: orderId }, order);

    let successMessage = 'Item cancelled successfully.';
    if (refundProcessed) {
      successMessage += ` ₹${refundAmount.toFixed(2)} credited to your wallet (including ₹${isSingleProductOrder ? order.shippingCharge.toFixed(2) : '0.00'} shipping charge).`;
    }

    return res.json({
      success: true,
      message: successMessage
    });

  } catch (error) {
    console.error('Error cancelling item:', error.message);
    console.error(error.stack);
    return res.status(500).json({
      success: false,
      message: 'Server error while cancelling item',
      error: error.message
    });
  }
};

const returnOrderItem = async (req, res) => {
  try {
    const { orderId, productId, variantSize, reason } = req.body;
    const userId = req.user._id;

    if (!orderId || !productId || !variantSize || !reason) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Order ID or Product ID",
      });
    }

    const order = await Order.findOne({ _id: orderId, user: userId }).populate("products.product");
    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    const item = order.products.find(
      (p) => p.product._id.toString() === productId && p.variant.size === variantSize
    );

    if (!item) {
      return res.status(404).json({ success: false, message: "Item not found in order" });
    }

    if (["return pending", "returned"].includes(item.status)) {
      return res.status(400).json({ success: false, message: "Item already returned or pending" });
    }

    
    const { itemFinalAmount } = calculateItemFinalAmount(item, order);

    
    let couponMinimumPrice = 0;
    if (order.coupon && order.coupon.couponId) {
      const coupon = await Coupon.findById(order.coupon.couponId);
      if (coupon) {
        couponMinimumPrice = coupon.minimumPrice;
      }
    }

    
    const newFinalAmount = order.finalAmount - itemFinalAmount;

    
    if (couponMinimumPrice > 0 && newFinalAmount < couponMinimumPrice) {
      return res.status(400).json({
        success: false,
        message: `Cannot return item: Returning this item would make the order total (${newFinalAmount.toFixed(2)}) less than the coupon minimum amount (${couponMinimumPrice.toFixed(2)}).`,
      });
    }

    
    item.status = "return pending";
    item.returnReason = reason;
    item.returnRequestDate = new Date();
    item.refundAmount = itemFinalAmount;
    item.refundStatus = "pending";

    order.orderStatus = "return pending";

    order.statusHistory.push({
      status: "return pending",
      date: new Date(),
      description: `Return requested for ${item.product.name} (Size: ${variantSize}). Reason: ${reason}`,
    });

    await order.save();

    return res.json({
      success: true,
      message: "Return request submitted. Waiting for admin approval.",
    });

  } catch (error) {
    console.error("Return request error:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


const downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.id;
    const order = await Order.findById(orderId)
      .populate("user", "name email")
      .populate("products.product")
      .populate("addressDetails");

    if (!order) {
      return res.status(404).render("pageNotFound", { message: "Order not found" });
    }

    const doc = new PDFDocument({ margin: 50 });
    const fileName = `invoice-${order.orderID}.pdf`;

    res.setHeader("Content-disposition", `attachment; filename=${fileName}`);
    res.setHeader("Content-type", "application/pdf");

    doc.pipe(res);

    
    doc.font("Helvetica-Bold").fontSize(22).text("FitVibe Pvt. Ltd.", 50, 50);
    doc.fontSize(10).font("Helvetica")
      .text("123 Fashion Street, Kochi, Kerala, India", 50, 75)
      .text("Email: support@fitvibe.com | Phone: +91 9876543210", 50, 90)
      .text("GSTIN: 32ABCDE1234F1ZB", 50, 105);

    doc.fontSize(18).font("Helvetica-Bold").text("INVOICE", 450, 50);

    doc.moveTo(50, 125).lineTo(550, 125).strokeColor("#00A859").stroke();
    doc.moveDown(1.5);

    
    doc.fontSize(12).font("Helvetica-Bold").text("Invoice Details", 50, 140);
    doc.font("Helvetica").fontSize(10)
      .text(`Invoice Number: ${order.orderID}`, 50, 160)
      .text(`Order Date: ${order.orderDate.toLocaleDateString()}`, 50, 175)
      .text(`Due Date: ${order.orderDate.toLocaleDateString()}`, 50, 190);

    
    const startY = 220; 
    let billHeight = 0;
    let shipHeight = 0;

    
    doc.fontSize(12).font("Helvetica-Bold").text("Bill To:", 50, startY);
    doc.font("Helvetica").fontSize(10);
    const billLines = [
      order.user?.name || "Customer",
      order.user?.email || "Email not available",
    ];
    billLines.forEach((line, i) => {
      doc.text(line, 50, startY + 25 + i * 20); 
    });
    billHeight = 25 + billLines.length * 20;

    
    doc.fontSize(12).font("Helvetica-Bold").text("Ship To:", 350, startY); 
    doc.font("Helvetica").fontSize(10);
    if (order.addressDetails) {
      const addr = order.addressDetails;
      const shipLines = [
        addr.name,
        addr.address,
        `${addr.city}, ${addr.state} - ${addr.zipCode}`,
        addr.country,
        `Phone: ${addr.phone}`,
      ];
      shipLines.forEach((line, i) => {
        doc.text(line, 350, startY + 25 + i * 20); 
      });
      shipHeight = 25 + shipLines.length * 20;
    } else {
      doc.text("Address not available", 350, startY + 25);
      shipHeight = 45;
    }

    
    const tableTop = startY + Math.max(billHeight, shipHeight) + 40; 
    doc.moveTo(50, tableTop - 5).lineTo(550, tableTop - 5).strokeColor("#000").stroke();
    doc.font("Helvetica-Bold").fontSize(10);
    doc.text("#", 55, tableTop);
    doc.text("Product", 80, tableTop);
    doc.text("Quantity", 300, tableTop, { width: 90, align: "right" });
    doc.text("Unit Price", 380, tableTop, { width: 80, align: "right" });
    doc.text("Total", 470, tableTop, { width: 80, align: "right" });
    doc.moveTo(50, tableTop + 12).lineTo(550, tableTop + 12).stroke();

   
    let y = tableTop + 25;
    order.products.forEach((item, index) => {
      const totalPrice = item.variant.salePrice * item.quantity;
      doc.font("Helvetica").fontSize(10)
        .text(index + 1, 55, y)
        .text(item.product.name, 80, y)
        .text(item.quantity, 300, y, { width: 90, align: "right" })
        .text(`${item.variant.salePrice.toFixed(2)}`, 380, y, { width: 80, align: "right" })
        .text(`${totalPrice.toFixed(2)}`, 470, y, { width: 80, align: "right" });
      y += 20;
    });

    doc.moveTo(50, y + 5).lineTo(550, y + 5).stroke();

    
    y += 20;
    doc.font("Helvetica-Bold").text("Payment Method:", 50, y);
    doc.font("Helvetica").text(order.paymentMethod, 150, y);
    doc.font("Helvetica-Bold").text("Payment Status:", 300, y);
    doc.font("Helvetica").text(order.paymentStatus || "Pending", 410, y);

    
    y += 40;
    doc.moveTo(320, y - 10).lineTo(550, y - 10).strokeColor("#ccc").stroke();

    const subtotal = order.totalAmount;
    const discount = order.couponDiscount || 0;
    const shipping = order.shippingCharge || 0;
    const totalAmount = subtotal - discount + shipping;

    doc.font("Helvetica").fontSize(11)
      .text(`Subtotal:`, 380, y, { width: 100, align: "right" })
      .text(`${subtotal.toFixed(2)}`, 470, y, { width: 80, align: "right" });

    y += 15;
    if (discount > 0) {
      doc.text(`Discount:`, 380, y, { width: 100, align: "right" })
        .text(`-${discount.toFixed(2)}`, 470, y, { width: 80, align: "right" });
      y += 15;
    }

    doc.text(`Shipping:`, 380, y, { width: 100, align: "right" })
      .text(`${shipping.toFixed(2)}`, 470, y, { width: 80, align: "right" });
    y += 15;

    doc.moveTo(320, y + 5).lineTo(550, y + 5).strokeColor("#00A859").stroke();
    doc.font("Helvetica-Bold").fontSize(12)
      .fillColor("#00A859")
      .text(`Total Amount:`, 380, y + 10, { width: 100, align: "right" })
      .text(`${totalAmount.toFixed(2)}`, 470, y + 10, { width: 80, align: "right" });
    doc.fillColor("black");

    
    const pageHeight = doc.page.height;
    const footerY = pageHeight - 90;

    doc.font("Helvetica").fontSize(9)
      .text("Thank you for shopping with FitVibe!", 0, footerY, { align: "center", lineGap: 4 })
      .text("For support, contact support@fitvibe.com", { align: "center", lineGap: 4 });

    doc.fontSize(8)
      .text("© 2025 FitVibe Pvt. Ltd. All rights reserved.", { align: "center" });

    doc.end();

  } catch (error) {
    console.error("Error generating invoice:", error);
    res.status(500).send("Error generating invoice");
  }
};


const retryPayment = async (req, res) => {
  try {
    console.log('Retry payment request:', req.body);
    console.log('User:', req.user);
    
    const { orderId, amount } = req.body;
    const userId = req.user._id;

    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

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

    const Razorpay = require('razorpay');
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY,
      key_secret: process.env.RAZORPAY_SECRET,
    });

    console.log('Creating Razorpay order with amount:', order.finalAmount);

    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(order.finalAmount * 100), 
      currency: 'INR',
      receipt: `retry_${order.orderID}_${Date.now()}`,
    });

    console.log('Razorpay order created:', razorpayOrder);

    order.razorpayOrderId = razorpayOrder.id;
    order.paymentStatus = 'pending';
    
    if (order.orderStatus === 'payment-failed') {
      order.orderStatus = 'pending';
    }
    
    order.isLocked = false;
    
    if (!order.paymentDetails) {
      order.paymentDetails = {};
    }
    
    order.paymentDetails.razorpayOrderId = razorpayOrder.id;
    order.paymentDetails.amount = razorpayOrder.amount;
    order.paymentDetails.currency = razorpayOrder.currency;
    order.paymentDetails.createdAt = new Date();
    order.paymentDetails.status = 'pending';
    
    order.paymentDetails.failureReason = undefined;
    order.paymentDetails.failureCode = undefined;
    
    const retryCount = order.statusHistory.filter(h => h.status.includes('retry')).length + 1;
    
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

    const { itemFinalAmount } = calculateItemFinalAmount(item, order);
    
    const refundAmount = itemFinalAmount;
    const userId = order.user;

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

    item.refundStatus = 'approved';
    item.refundAmount = refundAmount; 
    item.refundApprovedDate = new Date();
    item.refundProcessedDate = new Date();
    item.adminNotes = adminNotes || '';

    const allPendingRefundsProcessed = order.products.every(p => 
      p.refundStatus !== 'pending'
    );
    
    if (allPendingRefundsProcessed) {
      order.refundStatus = 'processed';
      order.refundApprovedDate = new Date();
      order.refundProcessedDate = new Date();
      order.adminRefundNotes = adminNotes || '';
    }

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

    item.refundStatus = 'rejected';
    item.refundApprovedDate = new Date();
    item.adminNotes = adminNotes || '';

    order.finalAmount += refundAmount;
    order.totalAmount += (item.variant.salePrice * item.quantity);

    order.refundAmount = Math.max(0, order.refundAmount - refundAmount);

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