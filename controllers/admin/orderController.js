const Order = require("../../models/orderSchema");
const mongoose = require('mongoose');
const Product = require("../../models/productSchema")
const Wallet = require("../../models/walletShema")
const Coupon = require("../../models/couponSchema");

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
      req.flash("error", "Invalid order ID");
      return res.redirect("/admin/orders");
    }

    
    const order = await Order.findById(orderId)
      .populate("products.product")
      .populate("coupon.couponId");

    if (!order || !order.products.some(p => p.status === "return pending")) {
      req.flash("error", "No items found with return pending status");
      return res.redirect("/admin/orders");
    }

    
    const originalSubtotal = order.products.reduce(
      (acc, p) => acc + p.variant.salePrice * p.quantity,
      0
    );

    
    let coupon = null;
    if (order.coupon?.couponId) {
      coupon = await Coupon.findById(order.coupon.couponId);
    } else if (order.coupon?.code) {
      coupon = await Coupon.findOne({ name: order.coupon.code.toUpperCase() });
    }

    
    let totalCouponDiscount = order.couponDiscount || (coupon?.discountAmount || 0);

    let totalRefundAmount = 0;
    let processedItems = 0;
    let couponAlreadyRemoved = order.couponDiscount === 0; 

    
    for (const item of order.products) {
      if (item.status === "return pending") {
        const productId = item.product._id;
        const variantSize = item.variant.size;

       
        const product = await Product.findById(productId);
        if (!product) continue;

        const variant = product.variants.find(v => v.size === variantSize);
        if (!variant) continue;

        
        variant.variantQuantity += item.quantity;
        await product.save();

        
        item.status = "returned";

        
        const returnedItemSubtotal = item.variant.salePrice * item.quantity;
        const remainingSubtotal = order.products
          .filter(p => p.status !== "returned" && p.status !== "return pending")
          .reduce((acc, p) => acc + p.variant.salePrice * p.quantity, 0);

        
        let refundAmount = returnedItemSubtotal;
        let note = "";

        if (coupon && typeof coupon.minimumPrice === "number" && !couponAlreadyRemoved) {
          if (remainingSubtotal >= coupon.minimumPrice) {
            
            const proportionalDiscount = (returnedItemSubtotal / originalSubtotal) * totalCouponDiscount;
            refundAmount = returnedItemSubtotal - proportionalDiscount;
            note = `Coupon still valid. ₹${proportionalDiscount.toFixed(2)} discount deducted.`;
          } else {
            
            refundAmount = returnedItemSubtotal - totalCouponDiscount;
            if (refundAmount < 0) refundAmount = 0;
            note = `Coupon invalid after this return. ₹${totalCouponDiscount.toFixed(2)} total discount deducted once.`;

            order.coupon = null;
            order.couponDiscount = 0;
            couponAlreadyRemoved = true; 
          }
        } else {
          note = "No coupon applied or already removed. Full amount refunded.";
        }

        
        item.refundAmount = refundAmount;
        item.refundStatus = "approved";

        totalRefundAmount += refundAmount;
        processedItems++;

        
        order.statusHistory.push({
          status: "returned",
          date: new Date(),
          description: `Admin approved return for ${item.product.name} (Size: ${variantSize}). ${note} Refund ₹${refundAmount.toFixed(2)} credited.`,
        });
      }
    }

    if (processedItems === 0) {
      req.flash("error", "No items processed for return");
      return res.redirect("/admin/orders");
    }

    
    const allReturned = order.products.every(p => p.status === "returned");
    if (allReturned) {
      order.orderStatus = "returned";
      order.paymentStatus = "refunded";
      totalRefundAmount += order.shippingCharge || 0;
    } else if (order.products.some(p => p.status === "return pending")) {
      order.orderStatus = "return pending";
    } else {
      order.orderStatus = "delivered";
    }

    
    const userId = order.user;
    let wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      wallet = new Wallet({ userId, balance: 0, transactions: [] });
    }

    wallet.balance += totalRefundAmount;
    wallet.transactions.unshift({
      type: "credit",
      amount: totalRefundAmount,
      description: `Refund processed for ${processedItems} returned item(s) from order ${order.orderID}`,
      status: "completed",
      source: "return_refund",
      balanceAfter: wallet.balance,
      date: new Date(),
    });

    await wallet.save();

    
    order.refundAmount = (order.refundAmount || 0) + totalRefundAmount;
    await order.save();

    
    const successMessage = allReturned
      ? `Return approved. ₹${totalRefundAmount.toFixed(2)} refunded (including shipping if applicable).`
      : `Return approved. ₹${totalRefundAmount.toFixed(2)} refunded to wallet.`;

    
    const referer = req.get("Referer");
    if (referer && referer.includes("/admin/return-requests")) {
      req.flash("success", successMessage);
      return res.redirect("/admin/return-requests");
    } else {
      req.flash("success", successMessage);
      return res.redirect("/admin/orders");
    }
  } catch (error) {
    console.error(" Approve return error:", error.message);
    console.error(error.stack);
    req.flash("error", "Error processing return approval");
    res.redirect("/admin/orders");
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

    
    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid order or product ID" });
    }

    
    const order = await Order.findById(orderId).populate("products.product");
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    
    const item = order.products.find(
      (p) =>
        p.product._id.toString() === productId &&
        p.variant.size === variantSize &&
        p.status === "return pending"
    );
    if (!item) {
      return res.status(400).json({ success: false, message: "Item not found or not eligible for return" });
    }

    
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });

    const variant = product.variants.find((v) => v.size === variantSize);
    if (!variant) return res.status(400).json({ success: false, message: "Variant not found" });
    variant.varientquatity += item.quantity;

    
    item.status = "returned";
    item.refundApprovedDate = new Date();

   
    const originalSubtotal = order.products.reduce(
      (acc, p) => acc + p.variant.salePrice * p.quantity,
      0
    );

    
    const remainingSubtotal = order.products
      .filter(p => p.status !== "returned" && p._id.toString() !== item._id.toString())
      .reduce((acc, p) => acc + p.variant.salePrice * p.quantity, 0);

    
    let coupon = null;
    if (order.coupon?.couponId) {
      coupon = await Coupon.findById(order.coupon.couponId);
    }
    if (!coupon && order.coupon?.code) {
      coupon = await Coupon.findOne({ name: order.coupon.code.toUpperCase() });
    }

     let totalCouponDiscount = order.couponDiscount || (coupon?.discountAmount || 0);

     const returnedItemSubtotal = item.variant.salePrice * item.quantity;
    let refundAmount = returnedItemSubtotal;
    let note = "";

    if (coupon && typeof coupon.minimumPrice === "number") {
      if (remainingSubtotal >= coupon.minimumPrice) {
         const proportionalDiscount = (returnedItemSubtotal / originalSubtotal) * totalCouponDiscount;
        refundAmount = returnedItemSubtotal - proportionalDiscount;
        note = `Coupon still valid. ₹${proportionalDiscount.toFixed(2)} discount deducted.`;
      } else {
        refundAmount = returnedItemSubtotal - totalCouponDiscount;
        if (refundAmount < 0) refundAmount = 0;
        note = `Coupon invalid after this return. ₹${totalCouponDiscount.toFixed(2)} total discount deducted.`;
        order.coupon = null;
        order.couponDiscount = 0;
      }
    } else {
      note = "No coupon applied. Full product price refunded.";
    }

    item.refundAmount = refundAmount;
    item.refundStatus = "approved";

    let wallet = await Wallet.findOne({ userId: order.user });
    if (!wallet) {
      wallet = new Wallet({ userId: order.user, balance: 0, transactions: [] });
    }

    wallet.balance += refundAmount;
    wallet.transactions.unshift({
      type: "credit",
      amount: refundAmount,
      description: `Refund for ${item.product.name} (Size: ${variantSize}) - ${note}`,
      status: "completed",
      source: "return_refund",
      balanceAfter: wallet.balance,
      date: new Date(),
    });
    await wallet.save();

    order.refundAmount = (order.refundAmount || 0) + refundAmount;
    order.statusHistory.push({
      status: "returned",
      date: new Date(),
      description: `Admin approved return for ${item.product.name} (Size: ${variantSize}). ${note} Refund ₹${refundAmount.toFixed(2)} credited to wallet.`,
    });

    const allReturned = order.products.every((p) => p.status === "returned");
    if (allReturned) {
      order.orderStatus = "returned";
      order.paymentStatus = "refunded";
    } else if (order.products.some((p) => p.status === "return pending")) {
      order.orderStatus = "return pending";
    } else {
      order.orderStatus = "delivered";
    }
    await product.save();
    await order.save();

    return res.status(200).json({
      success: true,
      message: `Refund ₹${refundAmount.toFixed(2)} processed successfully and credited to wallet. ${note}`,
      refundAmount,
    });
  } catch (error) {
    console.error(" Item return approve error:", error);
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