const Order = require("../../models/orderSchema");
const mongoose = require('mongoose');
const Product = require("../../models/productSchema")
const Wallet = require("../../models/walletShema")

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

    // Validate order ID
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing order ID' });
    }

    // Find the order
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    // Check if order is locked (payment failed orders)
    if (order.isLocked) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update status for locked orders (payment failed). This order is protected from status changes.',
      });
    }

    // Check if order has payment-failed status
    if (order.orderStatus === 'payment-failed') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update status for payment failed orders. These orders are locked for security.',
      });
    }

    // Check if online payment is pending or failed
    if (order.paymentMethod && (order.paymentMethod.toLowerCase() === 'online' || order.paymentMethod === 'Online')) {
      if (order.paymentStatus === 'pending' || order.paymentStatus === 'failed') {
        return res.status(400).json({
          success: false,
          message: `Cannot update status for orders with ${order.paymentStatus} online payment. Payment must be completed first.`,
        });
      }
    }

    // Check if order is already delivered
    if (order.orderStatus.toLowerCase() === 'delivered') {
      return res.status(400).json({
        success: false,
        message: 'Cannot update status for a delivered order',
      });
    }

    // Validate status
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

    // Update order status
    order.orderStatus = status;
    
    // Update product statuses
    order.products.forEach(product => {
      if (!['cancelled', 'returned'].includes(product.status)) {
        product.status = status;
      }
    });
    
    // Handle delivered status
    if (status.toLowerCase() === 'delivered') {
      order.paymentStatus = 'completed';
      order.deliveryDate = new Date();
    }

    // Handle cancellation
    if (status.toLowerCase() === 'cancelled' && req.body.reason) {
      order.cancellationReason = req.body.reason;
    }

    // Add to status history
    order.statusHistory.push({
      status,
      date: new Date(),
      description: status.toLowerCase() === 'cancelled' && req.body.reason ? req.body.reason : undefined,
    });

    // Save the order
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

    const order = await Order.findById(orderId);
    if (!order || order.orderStatus !== 'return pending') {
      return res.status(400).json({ success: false, message: 'Order not in return pending status' });
    }

    order.orderStatus = 'returned';

    for (const item of order.products) {
      const productId = item.product;
      const variantSize = item.variant.size;
      const quantityToAdd = item.quantity;

      const product = await Product.findById(productId);
      if (product) {
        const variant = product.variants.find(v => v.size === variantSize);
        if (variant) {
          variant.varientquatity += quantityToAdd;
          await product.save();
        }
      }
    }

    order.products.forEach(product => {
      if (product.status === 'return pending') {
        product.status = 'returned';
      }
    });

    order.statusHistory.push({
      status: 'returned',
      date: new Date(),
      description: 'Return approved by admin',
    });

    const userId = order.user;
    const refundAmount = order.finalAmount;
    order.refundAmount = refundAmount;

    // Create detailed description for full order refund
    let refundDescription = `Refund for returned order ${order.orderID} - Balance Amount: ₹${refundAmount.toFixed(2)}`;
    if (order.couponDiscount > 0 || (order.coupon && order.coupon.discountAmount > 0)) {
      const couponAmount = order.couponDiscount || order.coupon.discountAmount;
      refundDescription += ` (includes coupon discount of ₹${couponAmount.toFixed(2)})`;
    }

    let wallet = await Wallet.findOne({ userId });
if (!wallet) {
  wallet = new Wallet({
    userId,
    balance: refundAmount,
    transactions: [{
      type: "credit",
      amount: refundAmount,
      description: refundDescription,
      status: "completed",
      source: "return_refund",            // Add this
      balanceAfter: refundAmount          // Add this
    }]
  });
} else {
  wallet.balance += refundAmount;
  wallet.transactions.unshift({
    type: "credit",
    amount: refundAmount,
    description: refundDescription,
    status: "completed",
    source: "return_refund",            // Add this
    balanceAfter: wallet.balance         // Add this
  });
}

    await wallet.save();
    await order.save();

    res.redirect("/admin/orders");

  } catch (error) {
    console.error('Return approval error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
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

    res.redirect("/admin/orders");
  } catch (error) {
    console.error("Error rejecting return:", error);
    res.status(500).json({ success: false, message: "Server error rejecting return" });
  }
};

const itemReturnApprove = async (req, res) => {
  console.log("afiiii")

  try {
    const { orderId } = req.params;
    const { productId, variantSize } = req.body;
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

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const variant = product.variants.find((v) => v.size === variantSize);
    if (variant) {
      variant.varientquatity += item.quantity;
    } else {
      return res.status(400).json({ success: false, message: "Variant not found" });
    }

    item.status = "returned";

    // Calculate the exact final amount as shown in order details UI (includes proportional coupon discount)
    const { itemSubtotal, itemCouponDiscount, itemFinalAmount } = calculateItemFinalAmount(item, order);
    console.log({ itemSubtotal, itemCouponDiscount, itemFinalAmount });

    const refundAmount = itemFinalAmount;


    // Create detailed description showing the balance amount calculation
    let refundDescription = `Refund for returned product ${product.name} (Size: ${variantSize}) in order ${order.orderID}`;
    if (itemCouponDiscount > 0) {
      refundDescription += ` - Balance Amount: ₹${itemFinalAmount.toFixed(2)} (Subtotal: ₹${itemSubtotal.toFixed(2)} - Coupon Discount: ₹${itemCouponDiscount.toFixed(2)})`;
    } else {
      refundDescription += ` - Balance Amount: ₹${itemFinalAmount.toFixed(2)}`;
    }

    let wallet = await Wallet.findOne({ userId: order.user });
    if (!wallet) {
      wallet = new Wallet({
        userId: order.user,
        balance: refundAmount,
        transactions: [{
          type: "credit",
          amount: refundAmount,
          description: refundDescription,
          status: "completed",
          source: "return_refund",           // Added source here
          balanceAfter: refundAmount         // Added balanceAfter here
        }]
      });
    } else {
      wallet.balance += refundAmount;
      wallet.transactions.unshift({
        type: "credit",
        amount: refundAmount,
        description: refundDescription,
        status: "completed",
        source: "return_refund",           // Added source here
        balanceAfter: wallet.balance        // Added balanceAfter here
      });
    }

    order.refundAmount = (order.refundAmount || 0) + refundAmount;

    order.statusHistory.push({
      status: "returned",
      date: new Date(),
      description: `Admin approved return for product ${product.name} (Size: ${variantSize})`,
    });

    const allItemsReturned = order.products.every(p => p.status === "returned");
    if (allItemsReturned) {
      order.orderStatus = "returned";
      order.paymentStatus = "refunded";
    } else {
      order.orderStatus = order.products.some(p => p.status === "return pending") ? "return pending" : "delivered";
    }

    await product.save();
    await wallet.save();
    await order.save();

    return res.status(200).json({ success: true, message: "Product return approved" });

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

module.exports = { 
    loadOrders,
    updateOrderStatus,
    viewOrderDetails,
    approveReturn,
    rejectReturn,
    itemReturnApprove,
    itemReturnReject
 };