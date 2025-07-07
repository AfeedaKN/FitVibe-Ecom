const Order = require("../../models/orderSchema");
const mongoose = require('mongoose');


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

    const { orderId, status, reason } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    order.orderStatus = status;

    if (status === 'cancelled' && reason) {
      order.cancelReason = reason;
    }

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


module.exports = { 
    loadOrders,
    updateOrderStatus,
    viewOrderDetails
 };
