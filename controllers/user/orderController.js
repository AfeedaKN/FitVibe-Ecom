const User = require("../../models/userSchema");
const Order = require("../../models/orderSchema");
const Product = require('../../models/productSchema');
const PDFDocument = require('pdfkit');
const fs = require("fs");

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
      .text(`Subtotal: ₹${order.totalAmount.toFixed(2)}`, { align: 'right' })
      .text(`GST (5%): ₹${order.taxAmount.toFixed(2)}`, { align: 'right' });
    if (order.discount > 0) {
      doc.text(`Discount: -₹${order.discount.toFixed(2)}`, { align: 'right' });
    }
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

module.exports = {
  getOrders,
  getOrderDetail,
  cancelOrder,
  returnOrder,
  downloadInvoice
};