const Order = require("../../models/orderSchema");
const mongoose = require('mongoose');
const Product = require("../../models/productSchema");
const Wallet = require("../../models/walletShema");


const loadOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
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
order.products.forEach(product => {
  product.status = status;
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
    for(const item of order.products) {
      const productId=item.product
      const variantSize=item.variant.size
      const quantityToAdd=item.quantity

      const product=await Product.findById(productId)
      if(product) {
        const variant = product.variants.find(v => v.size === variantSize);
        if (variant) {
          variant.varientquatity += quantityToAdd;
          await product.save();
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

    
    
    order.orderStatus = 'returned';

    
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
  } 
  }catch (error) {
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
        product.status = 'processing';
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

module.exports = { 
    loadOrders,
    updateOrderStatus,
    viewOrderDetails,
    approveReturn,
    rejectReturn
 };
