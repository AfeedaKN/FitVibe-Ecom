const User = require("../../models/userSchema")
const Cart=require("../../models/cartSchema")
const Product=require("../../models/productSchema")

const addToCart = async (req, res) => {
    try {
        console.log(" Step 1: Got addToCart request");
        const { productId, variantId, quantity } = req.body;
        const user = req.session.user;

        if (!user) {
            console.log(" Step 2: User not logged in");
            return res.status(401).json({ success: false, message: 'Please log in to add to cart' });
        }

        console.log("Step 3: User is logged in", user._id);

        const product = await Product.findById(productId);
        if (!product) {
            console.log(" Step 4: Product not found",productId)
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        console.log(" Step 5: Product found");
        console.log(" Variant ID from request:", variantId);
console.log(" Available variant IDs:", product.variants.map(v => v._id.toString()));


        const variant = product.variants.find(v => v._id.toString() === variantId);
        if (!variant) {
            
            return res.status(404).json({ success: false, message: 'Variant not found' });
        }

       

        if (variant.varientquatity < quantity) {
           
            return res.status(400).json({ success: false, message: 'Not enough stock available' });
        }

        let cart = await Cart.findOne({ userId: user._id });
        if (!cart) {
            console.log("🛒 Step 9: Creating new cart");
            cart = new Cart({ userId: user._id, items: [] });
        } else {
            console.log("🛒 Step 9: Cart found");
        }

        const cartItemIndex = cart.items.findIndex(item =>
            item.productId.toString() === productId && item.variantId.toString() === variantId
        );

        if (cartItemIndex > -1) {
            if( cart.items[cartItemIndex].quantity > 4) {
                console.log('Cart limit exceeded');
                return res.status(400).json({ success: false, message: 'Cart limit exceeded' });
            }
            cart.items[cartItemIndex].quantity += quantity;
            cart.items[cartItemIndex].totalPrice =
                cart.items[cartItemIndex].quantity * cart.items[cartItemIndex].price;
        } else {
            cart.items.push({
                productId,
                variantId,
                quantity,
                price: variant.varientPrice, 
                totalPrice: variant.varientPrice * quantity,
                status: "placed",
                cancellationReason: "none"
            });
        }

        await cart.save();
        console.log(" Step 10: Cart saved successfully");
        res.json({ success: true, message: 'Product added to cart' });
    } catch (error) {
        console.error('Catch Block: Add to cart error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const getCart = async (req, res) => {
    try {
        const user = req.session.user;
        if (!user) {
            return res.redirect('/login');
        }

        const cart = await Cart.findOne({ userId: user._id }).populate('items.productId');
        if (!cart) {
            return res.render('cart', { cart: null, cartItems: [], total: 0 });
        }

        const cartItems = [];
        let total = 0;

        for (const item of cart.items) {
            if (item.productId) {
                const product = item.productId;
                const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
                if (variant) {
                    cartItems.push({
                        product,
                        variant,
                        quantity: item.quantity
                    });
                    total += item.totalPrice;
                }
            }
        }

        console.log(cartItems,"sdds");
        res.render('cart', {
            cart,
            cartItems,
            total
        });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).render('pageNotFound', {
            message: 'An error occurred while fetching your cart'
        });
    }
};


const updateCart = async (req, res) => {
    try {
        const { productId, variantId, change } = req.body;
        const user = req.session.user;

        if (!user) {
            return res.status(401).json({ success: false, message: 'Please log in to update cart' });
        }

        const cart = await Cart.findOne({ userId: user._id });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cartItem = cart.items.find(item => 
            item.productId.toString() === productId && item.variantId.toString() === variantId
        );

        if (!cartItem) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        const product = await Product.findById(productId);
        const variant = product.variants.find(v => v._id.toString() === variantId);
        if (!variant) {
            return res.status(404).json({ success: false, message: 'Variant not found' });
        }
        console.log("Variant stock:", variant);
        cartItem.quantity += change;
        if (cartItem.quantity <= 0) {
            cart.items = cart.items.filter(item => 
                item.productId.toString() !== productId || item.variantId.toString() !== variantId
            );
            
        } else if (cartItem.quantity > variant.varientquatity) {
            return res.status(400).json({ success: false, message: 'Not enough stock available' });
        }else if (cartItem.quantity > 5) {
            return res.status(400).json({ success: false, message: 'Cart limit exceeded' }); 
        } else {
            cartItem.totalPrice = cartItem.quantity * cartItem.price;
        }

        console.log(cartItem.quantity);
        await cart.save();
        res.json({ success: true, message: 'Cart updated' });
    } catch (error) {
        console.error('Update cart error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const removeFromCart = async (req, res) => {
    try {
        const { productId, variantId } = req.body;
        const user = req.session.user;

        if (!user) {
            return res.status(401).json({ success: false, message: 'Please log in to remove from cart' });
        }

        const cart = await Cart.findOne({ userId: user._id });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        cart.items = cart.items.filter(item => 
            item.productId.toString() !== productId || item.variantId.toString() !== variantId
        );

        await cart.save();
        res.json({ success: true, message: 'Item removed from cart' });
    } catch (error) {
        console.error('Remove from cart error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    addToCart,
    getCart,
    updateCart,
    removeFromCart
};

