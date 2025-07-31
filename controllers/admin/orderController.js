const Order = require("../../models/orderSchema");
const mongoose = require('mongoose');
const Product = require("../../models/productSchema")
const Wallet = require("../../models/walletShema")

const loadOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    const totalOrders = await Order.countDocuments();
    const totalPages = Math.ceil(totalOrders / limit);

    const orders = await Order.find({})
      .populate("user")
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit);

    res.render("adminOrders", {
      admin: req.session.admin,
      orders,
      currentPage: page,
      totalPages,
      query: req.query,
      
    });
  } catch (error) {
    console.log("Error loading admin orders:", error);
    req.flash('error', 'Failed to load orders');
    res.render("adminOrders", {
      admin: req.session.admin,
      orders: [],
      currentPage: 1,
      totalPages: 1,
      query: req.query,
     
    });
  }
};
const updateOrderStatus = async (req, res) => {
  try {
    console.log('Request body:', req.body);

    const { orderId, status } = req.body;

    
    if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing order ID' });
    }

    
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
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
    
    // Only update status for products that are not cancelled or returned
    order.products.forEach(product => {
      if (!['cancelled', 'returned'].includes(product.status)) {
        product.status = status;
      }
    });
    
    if (status.toLowerCase() === 'delivered') {
      order.paymentStatus = 'completed';
      order.deliveryDate = new Date();
    }

    
    if (status.toLowerCase() === 'cancelled' && reason) {
      order.cancellationReason = reason;
    }

    
    order.statusHistory.push({
      status,
      date: new Date(),
      description: status.toLowerCase() === 'cancelled' && reason ? reason : undefined,
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

    let wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      wallet = new Wallet({
        userId,
        balance: refundAmount,
        transactions: [{
          type: "credit",
          amount: refundAmount,
          description: `Refund for returned order ${order.orderID}`,
          status: "completed"
        }]
      });
    } else {
      wallet.balance += refundAmount;
      wallet.transactions.unshift({
        type: "credit",
        amount: refundAmount,
        description: `Refund for returned order ${order.orderID}`,
        status: "completed"
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
  try {
    const { orderId } = req.params;
    const { productId, variantSize } = req.body;

    // Validate orderId and productId
    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid order or product ID" });
    }

    // Find the order and populate product details
    const order = await Order.findById(orderId).populate('products.product');
    if (!order) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    // Find the specific item in the order's products array
    const item = order.products.find(
      (p) => p.product._id.toString() === productId && p.variant.size === variantSize && p.status === "return pending"
    );

    if (!item) {
      return res.status(400).json({ success: false, message: "Item not found or not eligible for return" });
    }

    // Find the product to update stock
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Update stock for the specific variant
    const variant = product.variants.find((v) => v.size === variantSize);
    if (variant) {
      variant.varientquatity += item.quantity;
    } else {
      return res.status(400).json({ success: false, message: "Variant not found" });
    }

    // Update item status to 'returned'
    item.status = "returned";

    // Calculate refund for the specific item
    const refundAmount = item.variant.salePrice * item.quantity;

    // Update or create wallet
    let wallet = await Wallet.findOne({ userId: order.user });
    if (!wallet) {
      wallet = new Wallet({
        userId: order.user,
        balance: refundAmount,
        transactions: [{
          type: "credit",
          amount: refundAmount,
          description: `Refund for returned product ${product.name} (Size: ${variantSize}) in order ${order.orderID}`,
          status: "completed"
        }]
      });
    } else {
      wallet.balance += refundAmount;
      wallet.transactions.unshift({
        type: "credit",
        amount: refundAmount,
        description: `Refund for returned product ${product.name} (Size: ${variantSize}) in order ${order.orderID}`,
        status: "completed"
      });
    }

    // Update order's refund amount
    order.refundAmount = (order.refundAmount || 0) + refundAmount;

    // Update status history with product name
    order.statusHistory.push({
      status: "returned",
      date: new Date(),
      description: `Admin approved return for product ${product.name} (Size: ${variantSize})`,
    });

    // Check if all items are returned and update order status if necessary
    const allItemsReturned = order.products.every(p => p.status === "returned");
    if (allItemsReturned) {
      order.orderStatus = "returned";
      order.paymentStatus = "refunded";
    } else {
      // If not all items are returned, ensure order status is appropriate
      order.orderStatus = order.products.some(p => p.status === "return pending") ? "return pending" : "delivered";
    }

    // Save changes
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