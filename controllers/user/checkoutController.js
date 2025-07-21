const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');
const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');

const getCheckout = async (req, res) => {
  try {
    if (!req.user || !req.user._id) {
      return res.redirect('/login'); 
    }

    const userId = req.user._id;
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate('items.productId');
    const addresses = await Address.find({ user: userId });

    if (!cart || cart.items.length === 0) {
      return res.render('checkout', { 
        cart: null, 
        user, 
        addresses,           
        subtotal: 0, 
        tax: 0, 
        discount: 0, 
        shipping: 0, 
        total: 0, 
        defaultAddress: null 
      });
    }

    cart.items.forEach(item => {
      const product = item.productId;
      const matchedVariant = product.variants.find(variant => 
        variant._id.toString() === item.variantId.toString()
      );
      item.variant = matchedVariant; 
    });

    const subtotal = cart.items.reduce((sum, item) => {
      return sum + (item.variant?.salePrice || 0) * item.quantity;
    }, 0);

    const tax = subtotal * 0.05;
    const discount = subtotal > 5000 ? subtotal * 0.1 : 0;
    const shipping = 100;
    const total = subtotal + tax - discount + shipping;

    res.render('checkout', {
      addresses,
      user,
      cart,
      subtotal,
      tax,
      discount,
      shipping,
      total,
      defaultAddress: addresses.length > 0 ? addresses[0]._id : null 
    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};




const placeOrder = async (req, res) => {
  try {
    const { paymentMethod, addressId } = req.body;
    console.log("Payment Method:", req.body);
    console.log('Request Body:', req.body);
    console.log("Placing order with method:", paymentMethod);

    const userId = req.user._id;
    const user = await User.findById(userId);
    const cart = await Cart.findOne({ userId }).populate('items.productId');

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }

    const outOfStock = cart.items.some(item => item.productId.variants[0].stock < item.quantity);
    if (outOfStock) {
      return res.status(400).json({ success: false, message: 'Some items are out of stock' });
    }

    console.log("Stock is fine:", outOfStock);

    const address = await Address.findOne({ _id: addressId, user: userId });
    if (!address) {
      return res.status(400).json({ success: false, message: 'Invalid or missing address' });
    }

    const generateOrderID = () => {
      const date = new Date();
      const year = date.getFullYear().toString().slice(-2);
      const month = ("0" + (date.getMonth() + 1)).slice(-2);
      const day = ("0" + date.getDate()).toString().padStart(2, "0");
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
      return `ORD${year}${month}${day}${random}`;
    };

    const orderID = generateOrderID();

    const subtotal = cart.items.reduce((sum, item) => sum + (item.productId.variants[0].salePrice * item.quantity), 0);
    const taxAmount = subtotal * 0.05;
    const discount = subtotal > 5000 ? subtotal * 0.1 : 0;
    const shippingCharge = 100;
    const totalAmount = subtotal + taxAmount;
    const finalAmount = totalAmount - discount + shippingCharge;

    const products = cart.items.map(item => ({
      product: item.productId._id,
      variant: {
        size: item.productId.variants[0].size,
        varientPrice: item.productId.variants[0].varientPrice,
        salePrice: item.productId.variants[0].salePrice,
      },
      quantity: item.quantity,
    }));

    const order = new Order({
      user: userId,
      orderID: orderID,
      products,
      address: address._id,
      addressDetails: {
        name: address.name,
        address: address.address,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        country: address.country,
        phone: address.phone,
      },
      totalAmount,
      discount,
      taxAmount,
      shippingCharge,
      finalAmount,
      paymentMethod,
      orderStatus: "pending",
    });

    await order.save();

    for (const item of cart.items) {
      const product = item.productId;
      console.log("no product", product);
      product.variants[0].varientquatity -= item.quantity;
      console.log("no stock", product.variants[0].varientquatity);
      await product.save();
    }

    cart.items = [];
    await cart.save();

    res.json({ success: true, orderId: order.orderID });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

const getOrderSuccess = async (req, res) => {
  try {
    const { orderId } = req.params;
     const order = await Order.find({ user: req.user._id })
          .sort({ createdAt: -1 })
          .populate('products.product') 
    res.render('order-success', { orderId,order });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const orderId = req.params.id;

    const order = await Order.findById(orderId)
      .populate("products.product")
      .populate("address"); 

    if (!order) {
      return res.status(404).send("Order not found");
    }

    res.render("order-details", { order }); 
  } catch (error) {
    console.error("Order Detail Error:", error);
    res.status(500).send("Server Error");
  }
};

module.exports = {
  getCheckout,
  placeOrder,
  getOrderSuccess,
  getOrderDetails
};