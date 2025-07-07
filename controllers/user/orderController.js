const User = require("../../models/userSchema")
const Order = require("../../models/orderSchema");
const Product = require('../../models/productSchema');

const getOrders = async (req, res) => {
  try {
    const limit = 5;
    const page = parseInt(req.query.page) || 1;
    const query = req.query.search || '';

    // Date filter (if query is a valid date)
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

    // Search filters
    const searchFilter = {
      user: req.user._id,
      $or: [
        { orderID: { $regex: query, $options: 'i' } },
        { orderStatus: { $regex: query, $options: 'i' } }
      ],
      ...dateFilter
    };

    // Total count for pagination
    const totalOrders = await Order.countDocuments(searchFilter);
    const totalPages = Math.ceil(totalOrders / limit);

    // Fetch user
    const user = await User.findById(req.user._id);

    // Fetch orders
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
      query: req.query.search || "", // ✅ pass query here
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

    console.log("Populated Address:", order.address);

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

    order.orderStatus = 'cancelled'; 
    order.cancelReason = reason || '';

    for (const item of order.products) {
      const productId = item.product;
      const variantSize = item.variant.size;
      const quantityToAdd = item.quantity;

      const product = await Product.findById(productId);

      if (product) {
        const variant = product.variants.find(v => v.size === variantSize);

        if (variant) {
          variant.varientquatity += quantityToAdd;
        }
        
        await product.save(); 
      }
    }

    await order.save();

    return res.json({ success: true, message: 'Order cancelled successfully.' });
  } catch (error) {
    console.error('Error canceling order:', error);
    return res.json({ success: false, message: 'Error canceling order.', error: error.message });
  }
};






module.exports = {
  getOrders,      
getOrderDetail,
cancelOrder
}