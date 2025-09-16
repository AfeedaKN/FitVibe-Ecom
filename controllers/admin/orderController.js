const Order = require("../../models/orderSchema");
const mongoose = require('mongoose');
const Product = require("../../models/productSchema")
const Wallet = require("../../models/walletShema")

const calculateItemFinalAmount = (item, order, productVariant) => {
  const itemSubtotal = productVariant.salePrice * item.quantity;

  let totalCouponDiscount = 0;
  if (order.couponDiscount && order.couponDiscount > 0) {
    totalCouponDiscount = order.couponDiscount;
  } else if (order.coupon && order.coupon.discountAmount && order.coupon.discountAmount > 0) {
    totalCouponDiscount = order.coupon.discountAmount;
  }

  let orderSubtotal = 0;
  order.products.forEach(orderItem => {
    const variantPrice = orderItem.product.variants.find(v => v.size.toLowerCase() === orderItem.variant.size.toLowerCase())?.salePrice || 0;
    orderSubtotal += (variantPrice * orderItem.quantity);
  });

  let itemCouponDiscount = 0;
  if (totalCouponDiscount > 0 && orderSubtotal > 0) {
    itemCouponDiscount = (itemSubtotal / orderSubtotal) * totalCouponDiscount;
  }

  // Final calculation - only balance amount (item price minus coupon discount)
  const itemFinalAmount = itemSubtotal - itemCouponDiscount;

  return { itemSubtotal, itemCouponDiscount, itemFinalAmount };
};


const loadOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    
    const filter = {};
    
    const searchQuery = req.query.search;

    if (req.query.status) {
      filter.orderStatus = req.query.status;
    }

    let sortOption = { orderDate: -1 }; 
    if (req.query.sort) {
      switch (req.query.sort) {
        case 'orderDate':
          sortOption = { orderDate: 1 };
          break;
        case '-orderDate':
          sortOption = { orderDate: -1 };
          break;
        case 'finalAmount':
          sortOption = { finalAmount: 1 };
          break;
        case '-finalAmount':
          sortOption = { finalAmount: -1 };
          break;
        case 'orderStatus':
          sortOption = { orderStatus: 1 };
          break;
      }
    }

    let allOrdersQuery = await Order.find(filter).populate("user").sort(sortOption);
    
    if (searchQuery) {
      const searchRegex = new RegExp(searchQuery, 'i');
      allOrdersQuery = allOrdersQuery.filter(order => 
        order.orderID.match(searchRegex) ||
        order.user.name.match(searchRegex) ||
        order.user.email.match(searchRegex)
      );
    }

    const totalFilteredOrders = allOrdersQuery.length;
    const totalPages = Math.ceil(totalFilteredOrders / limit);

    const orders = allOrdersQuery.slice(skip, skip + limit);

    const allOrders = await Order.find({}).populate("user");

    res.render("adminOrders", {
      admin: req.session.admin,
      orders,
      allOrders,
      currentPage: page,
      totalPages,
      totalOrders: totalFilteredOrders,
      query: req.query,
    });
  } catch (error) {
    console.log("Error loading admin orders:", error);
    req.flash('error', 'Failed to load orders');
    res.render("adminOrders", {
      admin: req.session.admin,
      orders: [],
      allOrders: [],
      currentPage: 1,
      totalPages: 1,
      totalOrders: 0,
      query: req.query,
    });
  }
};

const updateOrderStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing order ID' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    if (order.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update status for locked orders (payment failed). This order is protected from status changes.',
      });
    }

    if (order.orderStatus === 'payment-failed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update status for payment failed orders. These orders are locked for security.',
      });
    }

    if (order.paymentMethod && (order.paymentMethod.toLowerCase() === 'online' || order.paymentMethod === 'Online')) {
      if (order.paymentStatus === 'pending' || order.paymentStatus === 'failed') {
        return res.status(400).json({
          success: false,
          message: `Cannot update status for orders with ${order.paymentStatus} online payment. Payment must be completed first.`,
        });
      }
    }

    if (order.orderStatus.toLowerCase() === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update status for a delivered order',
      });
    }

    const validStatuses = [
      'pending',
      'processing',
      'shipped',
      'out for delivery',
      'delivered',
      'cancelled',
    ];
    if (!validStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    order.orderStatus = status;
    
    order.products.forEach(product => {
      if (!['cancelled', 'returned'].includes(product.status)) {
        product.status = status;
      }
    });
    
    if (status.toLowerCase() === 'delivered') {
      order.paymentStatus = 'completed';
      order.deliveryDate = new Date();
    }

    if (status.toLowerCase() === 'cancelled') {
      if (order.paymentMethod === "Wallet" || order.paymentMethod === "Online") {
        let wallet = await Wallet.findOne({ userId: order.user });

        if (!wallet) {
          wallet = new Wallet({ userId: order.user, balance: 0, transactions: [] });
        }

        // Calculate correct refund amount: finalAmount (which already includes shipping and excludes coupon discount)
        const refundAmount = order.finalAmount;
        
        wallet.balance += refundAmount;
        wallet.transactions.push({
          type: "credit",
          amount: refundAmount,
          description: `Refund for cancelled order #${order.orderID} by admin`,
          balanceAfter: wallet.balance,
          orderId: order._id,
          source: "order_cancellation",
          metadata: {
            refundReason: req.body.reason,
            paymentMethod: "wallet",
          },
        });

        await wallet.save();
        order.paymentStatus = "refunded";
      } 
    }

    order.statusHistory.push({
      status,
      date: new Date(),
      description: status.toLowerCase() === 'cancelled' && req.body.reason ? req.body.reason : undefined,
    });

    await order.save();

    res.json({ success: true, message: 'Status updated successfully' });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ success: false, message: 'Server error updating status' });
  }
};

const viewOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      req.flash('error', 'Invalid order ID');
      return res.redirect('/admin/orders');
    }

    const order = await Order.findById(orderId)
      .populate('user')
      .populate('products.product')
      .populate('address'); 

    if (!order) {
      req.flash('error', 'Order not found');
      return res.redirect('/admin/orders');
    }

    res.render('admin-orderdetail', {
      order,
      success_msg: req.flash('success'),
      error_msg: req.flash('error'),
    });

  } catch (error) {
    console.error(error);
    req.flash('error', 'Error loading order details');
    res.redirect('/admin/orders');
  }
};

const approveReturn = async (req, res) => {
  try {
    const orderId = req.params.orderId;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid order ID' });
    }

    const order = await Order.findById(orderId).populate('products.product');
    if (!order || order.orderStatus !== 'return pending') {
      return res.status(400).json({ success: false, message: 'Order not in return pending status' });
    }

    let totalRefundAmount = 0;
    let processedItems = 0;

    // Process each product with return pending status
    for (const item of order.products) {
      if (item.status === 'return pending') {
        const productId = item.product._id;
        const variantSize = item.variant.size;
        const quantityToAdd = item.quantity;

        // Find the product and variant
        const product = await Product.findById(productId);
        if (!product) {
          console.error(`Product not found for ID: ${productId}`);
          continue;
        }

        const variant = product.variants.find(v => v.size === variantSize);
        if (!variant) {
          console.error(`Variant not found for size: ${variantSize} in product: ${productId}`);
          continue;
        }

        // Increase stock
        variant.varientquatity += quantityToAdd;

        // Calculate refund amount for this item - only balance amount (no shipping)
        const { itemSubtotal, itemCouponDiscount, itemFinalAmount } = calculateItemFinalAmount(item, order, variant);
        item.refundAmount = itemFinalAmount;
        totalRefundAmount += itemFinalAmount;
        processedItems++;

        // Update product status
        item.status = 'returned';

        // Add to status history for this item
        order.statusHistory.push({
          status: 'returned',
          date: new Date(),
          description: `Admin approved return for product ${product.name} (Size: ${variantSize}) - Balance Amount: ₹${itemFinalAmount.toFixed(2)}`,
        });

        await product.save();
      }
    }

    // Only proceed if we actually processed some items
    if (processedItems === 0) {
      req.flash('error', 'No items found with return pending status');
      return res.redirect('/admin/orders');
    }

    // Check if this is a full order return (all items are being returned)
    const allItemsReturned = order.products.every(p => p.status === 'returned');
    let shippingRefund = 0;
    
    if (allItemsReturned) {
      // For full order return, include shipping charge in refund
      shippingRefund = order.shippingCharge || 0;
      totalRefundAmount += shippingRefund;
      
      order.orderStatus = 'returned';
      order.paymentStatus = 'refunded';
    } else {
      const hasReturnPending = order.products.some(p => p.status === 'return pending');
      if (hasReturnPending) {
        order.orderStatus = 'return pending';
      } else {
        order.orderStatus = 'delivered';
      }
    }

    // Update order refund amount
    order.refundAmount = (order.refundAmount || 0) + totalRefundAmount;

    // Update wallet with balance amounts + shipping (if full return)
    const userId = order.user;
    let refundDescription;
    
    if (allItemsReturned && shippingRefund > 0) {
      refundDescription = processedItems === 1
        ? `Refund for returned item in order ${order.orderID} - Balance Amount: ₹${(totalRefundAmount - shippingRefund).toFixed(2)} + Shipping: ₹${shippingRefund.toFixed(2)} = Total: ₹${totalRefundAmount.toFixed(2)}`
        : `Refund for ${processedItems} returned items in order ${order.orderID} - Balance Amount: ₹${(totalRefundAmount - shippingRefund).toFixed(2)} + Shipping: ₹${shippingRefund.toFixed(2)} = Total: ₹${totalRefundAmount.toFixed(2)}`;
    } else {
      refundDescription = processedItems === 1
        ? `Refund for returned item in order ${order.orderID} - Balance Amount: ₹${totalRefundAmount.toFixed(2)}`
        : `Refund for ${processedItems} returned items in order ${order.orderID} - Balance Amount: ₹${totalRefundAmount.toFixed(2)}`;
    }

    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({
        userId,
        balance: totalRefundAmount,
        transactions: [{
          type: 'credit',
          amount: totalRefundAmount,
          description: refundDescription,
          status: 'completed',
          source: 'return_refund',
          balanceAfter: totalRefundAmount,
        }],
      });
    } else {
      wallet.balance = (wallet.balance || 0) + totalRefundAmount;
      wallet.transactions.unshift({
        type: 'credit',
        amount: totalRefundAmount,
        description: refundDescription,
        status: 'completed',
        source: 'return_refund',
        balanceAfter: wallet.balance,
      });
    }

    await wallet.save();
    await order.save();

    // Check if request came from return requests page
    const referer = req.get('Referer');
    const successMessage = allItemsReturned && shippingRefund > 0
      ? `Return request approved successfully. ₹${totalRefundAmount.toFixed(2)} (including ₹${shippingRefund.toFixed(2)} shipping) refunded to customer wallet.`
      : `Return request approved successfully. ₹${totalRefundAmount.toFixed(2)} refunded to customer wallet.`;
      
    if (referer && referer.includes('/admin/return-requests')) {
      req.flash('success', successMessage);
      res.redirect('/admin/return-requests');
    } else {
      req.flash('success', successMessage);
      res.redirect('/admin/orders');
    }

  } catch (error) {
    console.error('Return approval error:', error);
    req.flash('error', 'Error processing return approval');
    res.redirect('/admin/orders');
  }
};

const rejectReturn = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    order.products.forEach(product => {
      if (product.status === 'return pending') {
        product.status = 'delivered';
      }
    });

    order.orderStatus = 'delivered';
    order.statusHistory.push({
      status: 'return rejected',
      date: new Date(),
      description: 'Admin rejected return request',
    });

    await order.save();

    // Check if request came from return requests page
    const referer = req.get('Referer');
    if (referer && referer.includes('/admin/return-requests')) {
      req.flash('success', 'Return request rejected successfully');
      res.redirect("/admin/return-requests");
    } else {
      res.redirect("/admin/orders");
    }
  } catch (error) {
    console.error("Error rejecting return:", error);
    res.status(500).json({ success: false, message: "Server error rejecting return" });
  }
};

const itemReturnApprove = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, variantSize } = req.body;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid order or product ID" });
    }

    // Find order
    const order = await Order.findById(orderId).populate('products.product');
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    // Find product in order with return pending status
    const item = order.products.find(p =>
      p.product._id.toString() === productId &&
      p.variant.size === variantSize &&
      p.status === "return pending"
    );
    if (!item) return res.status(400).json({ success: false, message: "Item not found or not eligible for return" });

    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const variant = product.variants.find(v => v.size === variantSize);
    if (!variant) return res.status(400).json({ success: false, message: "Variant not found" });

    // Increase product stock
    variant.varientquatity += item.quantity;

    // Mark item as returned
    item.status = "returned";

    // Calculate item final amount
    const { itemSubtotal, itemCouponDiscount, itemFinalAmount } = calculateItemFinalAmount(item, order, variant);

    // Check if this will be a full order return after this item is approved
    const allItemsWillBeReturned = order.products.every(p => 
      p.status === "returned" || 
      (p.product._id.toString() === productId && p.variant.size === variantSize)
    );

    let totalRefundAmount = itemFinalAmount;
    let shippingRefund = 0;

    // If this is the last item to be returned (making it a full order return), include shipping
    if (allItemsWillBeReturned) {
      shippingRefund = order.shippingCharge || 0;
      totalRefundAmount += shippingRefund;
    }

    // Assign individual item refund amount (includes shipping if full return)
    item.refundAmount = totalRefundAmount;
    console.log(item.refundAmount,"refund amount with shipping if applicable");

    let refundDescription;
    if (allItemsWillBeReturned && shippingRefund > 0) {
      refundDescription = itemCouponDiscount > 0
        ? `Refund for ${product.name} (Size: ${variantSize}) - Balance: ₹${itemFinalAmount.toFixed(2)} (Subtotal: ₹${itemSubtotal.toFixed(2)} - Coupon: ₹${itemCouponDiscount.toFixed(2)}) + Shipping: ₹${shippingRefund.toFixed(2)} = Total: ₹${totalRefundAmount.toFixed(2)}`
        : `Refund for ${product.name} (Size: ${variantSize}) - Balance: ₹${itemFinalAmount.toFixed(2)} + Shipping: ₹${shippingRefund.toFixed(2)} = Total: ₹${totalRefundAmount.toFixed(2)}`;
    } else {
      refundDescription = itemCouponDiscount > 0
        ? `Refund for ${product.name} (Size: ${variantSize}) - Balance: ₹${itemFinalAmount.toFixed(2)} (Subtotal: ₹${itemSubtotal.toFixed(2)} - Coupon: ₹${itemCouponDiscount.toFixed(2)})`
        : `Refund for ${product.name} (Size: ${variantSize}) - Balance: ₹${itemFinalAmount.toFixed(2)}`;
    }

    // Update wallet
    let wallet = await Wallet.findOne({ userId: order.user });
    console.log("Wallet before update:", wallet?.balance);

    if (!wallet) {
      wallet = new Wallet({
        userId: order.user,
        balance: totalRefundAmount,
        transactions: [{
          type: "credit",
          amount: totalRefundAmount,
          description: refundDescription,
          status: "completed",
          source: "return_refund",
          balanceAfter: totalRefundAmount
        }]
      });
    } else {
      wallet.balance = (wallet.balance || 0) + totalRefundAmount;
      console.log("Wallet after update:", wallet.balance);

      wallet.transactions.unshift({
        type: "credit",
        amount: totalRefundAmount,
        description: refundDescription,
        status: "completed",
        source: "return_refund",
        balanceAfter: wallet.balance
      });
    }

    // Update order refund
    order.refundAmount = (order.refundAmount || 0) + totalRefundAmount;

    // Add order history
    let historyDescription = `Admin approved return for product ${product.name} (Size: ${variantSize})`;
    if (allItemsWillBeReturned && shippingRefund > 0) {
      historyDescription += ` - Full order return includes shipping charge of ₹${shippingRefund.toFixed(2)}`;
    }
    
    order.statusHistory.push({
      status: "returned",
      date: new Date(),
      description: historyDescription,
    });

    // Update order status
    const allItemsReturned = order.products.every(p => p.status === "returned");
    order.orderStatus = allItemsReturned ? "returned" : (order.products.some(p => p.status === "return pending") ? "return pending" : "delivered");
    if (allItemsReturned) order.paymentStatus = "refunded";

    // Save all
    await product.save();
    await wallet.save();
    await order.save();

    const successMessage = allItemsWillBeReturned && shippingRefund > 0
      ? `Product return approved. ₹${totalRefundAmount.toFixed(2)} (including ₹${shippingRefund.toFixed(2)} shipping) refunded to customer wallet.`
      : "Product return approved";

    return res.status(200).json({ success: true, message: successMessage });

  } catch (error) {
    console.log("Item return approve error:", error);
    return res.status(500).json({ success: false, message: "Server error", error: error.message });
  }
};


const itemReturnReject = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, variantSize, reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid order or product ID" });
    }

    const order = await Order.findById(orderId).populate('products.product');
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const item = order.products.find(
      (p) => p.product._id.toString() === productId && p.variant.size === variantSize && p.status === "return pending"
    );

    if (!item) {
      return res.status(400).json({ success: false, message: "Item not found or not eligible for return" });
    }

    item.status = "delivered";
    if (reason) {
      item.returnReason = reason;
    }

    order.statusHistory.push({
      status: "return rejected",
      date: new Date(),
      description: reason 
        ? `Admin rejected return for product ${item.product.name} (Size: ${variantSize}): ${reason}`
        : `Admin rejected return for product ${item.product.name} (Size: ${variantSize})`,
    });

    const anyPendingReturns = order.products.some(p => p.status === "return pending");
    order.orderStatus = anyPendingReturns ? "return pending" : "delivered";

    await order.save();

    return res.status(200).json({ success: true, message: "Product return rejected" });
  } catch (error) {
    console.log("Item return reject error:", error);
    return res.status(500).json({ success: false, message: "Server error rejecting return", error: error.message });
  }
};

const loadReturnRequests = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Find all orders with return pending status
    const returnRequestsQuery = Order.find({ "products.status": 'return pending' })
      .populate('user')
      .populate('products.product')
      .sort({ orderDate: -1 });

const totalReturnRequests = await Order.countDocuments({ "products.status": "return pending" });
    const totalPages = Math.ceil(totalReturnRequests / limit);

    const returnRequests = await returnRequestsQuery.skip(skip).limit(limit);

returnRequests.forEach(order => {
  order.products.forEach(p => {
    console.log("Product refund amount ->", p.refundAmount, p.product?.name);
  });
});

    res.render('returnRequests', {
      admin: req.session.admin,
      returnRequests,
      currentPage: page,
      totalPages,
      totalRequests: totalReturnRequests,
      success_msg: req.flash('success'),
      error_msg: req.flash('error')
    });
  } catch (error) {
    console.log("Error loading return requests:", error);
    req.flash('error', 'Failed to load return requests');
    res.render('returnRequests', {
      admin: req.session.admin,
      returnRequests: [],
      currentPage: 1,
      totalPages: 1,
      totalRequests: 0,
      success_msg: req.flash('success'),
      error_msg: req.flash('error')
    });
  }
};

module.exports = { 
    loadOrders,
    updateOrderStatus,
    viewOrderDetails,
    approveReturn,
    rejectReturn,
    itemReturnApprove,
    itemReturnReject,
    loadReturnRequests
 };