const Cart = require('../../models/cartSchema');
const Product = require('../../models/productSchema');
const Order = require('../../models/orderSchema');

const checkout = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.status(401).json({ success: false, message: 'Please log in to checkout' });
        }

        const cart = await Cart.findOne({ userId: user._id }).populate('items.productId');
        if (!cart || cart.items.length === 0) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        res.json({ success: true, message: 'Proceed to checkout' });
    } catch (error) {
        console.error('Checkout error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const buyNow = async (req, res) => {
    try {
        const { productId, variantId, quantity } = req.body;
        const user = req.session.user;

        if (!user) {
            return res.status(401).json({ success: false, message: 'Please log in to buy now' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const variant = product.variants.find(v => v._id.toString() === variantId);
        if (!variant) {
            return res.status(404).json({ success: false, message: 'Variant not found' });
        }

        if (variant.stock < quantity) {
            return res.status(400).json({ success: false, message: 'Not enough stock available' });
        }

        req.session.buyNowItem = { productId, variantId, quantity };
        res.json({ success: true, message: 'Proceed to checkout' });
    } catch (error) {
        console.error('Buy now error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const loadCheckout = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        let items = [];
        let total = 0;

        if (req.session.buyNowItem) {
            // Buy Now flow
            const { productId, variantId, quantity } = req.session.buyNowItem;
            const product = await Product.findById(productId);
            const variant = product.variants.find(v => v._id.toString() === variantId);
            items = [{ product, variant, quantity }];
            total = variant.price * quantity;
        } else {
            // Cart checkout flow
            const cart = await Cart.findOne({ userId: user._id }).populate('items.productId');
            if (cart) {
                for (const item of cart.items) {
                    if (item.productId) {
                        const product = item.productId;
                        const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
                        if (variant) {
                            items.push({ product, variant, quantity: item.quantity });
                            total += item.totalPrice;
                        }
                    }
                }
            }
        }

        if (items.length === 0) {
            return res.redirect('/cart');
        }

        res.render('checkout', { items, total });
    } catch (error) {
        console.error('Load checkout error:', error);
        res.redirect('/pageNotFound');
    }
};

const placeOrder = async (req, res) => {
    try {
        const { address, paymentMethod } = req.body;
        const user = req.session.user;

        if (!user) {
            return res.status(401).json({ success: false, message: 'Please log in to place order' });
        }

        let items = [];
        let total = 0;

        if (req.session.buyNowItem) {
            const { productId, variantId, quantity } = req.session.buyNowItem;
            const product = await Product.findById(productId);
            const variant = product.variants.find(v => v._id.toString() === variantId);
            items = [{ 
                productId, 
                variantId, 
                quantity, 
                price: variant.price,
                status: 'Pending',
                cancellationReason: 'none'
            }];
            total = variant.price * quantity;

            // Update stock
            variant.stock -= quantity;
            await product.save();

            delete req.session.buyNowItem;
        } else {
            const cart = await Cart.findOne({ userId: user._id }).populate('items.productId');
            if (!cart || cart.items.length === 0) {
                return res.status(400).json({ success: false, message: 'Your cart is empty' });
            }

            for (const item of cart.items) {
                if (item.productId) {
                    const product = item.productId;
                    const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
                    if (variant) {
                        items.push({ 
                            productId: item.productId, 
                            variantId: item.variantId, 
                            quantity: item.quantity, 
                            price: item.price,
                            status: 'Pending',
                            cancellationReason: 'none'
                        });
                        total += item.totalPrice;

                        // Update stock
                        variant.stock -= item.quantity;
                        await product.save();
                    }
                }
            }

            // Clear the cart
            await Cart.findOneAndUpdate({ userId: user._id }, { items: [] });
        }

        const order = new Order({
            userId: user._id,
            items,
            total,
            address,
            paymentMethod,
            status: 'Pending'
        });

        await order.save();
        res.json({ success: true, message: 'Order placed successfully' });
    } catch (error) {
        console.error('Place order error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const viewOrders = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const orders = await Order.find({ userId: user._id }).populate('items.productId').sort({ createdAt: -1 });
        res.render('orders', { orders });
    } catch (error) {
        console.error('View orders error:', error);
        res.redirect('/pageNotFound');
    }
};

module.exports = {
    checkout,
    buyNow,
    loadCheckout,
    placeOrder,
    viewOrders
};