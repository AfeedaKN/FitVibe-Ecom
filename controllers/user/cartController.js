const User = require("../../models/userSchema")
const Cart=require("../../models/cartSchema")
const Product=require("../../models/productSchema")

const addToCart = async (req, res) => {
    try {
        
        const { productId, variantId, quantity } = req.body;
        const user = req.session.user;

        if (!user) {
            
            return res.status(401).json({ success: false, message: 'Please log in to add to cart' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const variant = product.variants.find(v => v._id.toString() === variantId);
        if (!variant) {
            
            return res.status(404).json({ success: false, message: 'Variant not found' });
        }


        if (variant.varientquatity === 0) {
            return res.status(400).json({ 
                success: false, 
                message: `Out of stock for size ${variant.size}`,
                stockStatus: 'out_of_stock'
            });
        }

        if (variant.varientquatity < quantity) {
            return res.status(400).json({ 
                success: false, 
                message: `Not enough quantity available. Only ${variant.varientquatity} items left for size ${variant.size}`,
                availableStock: variant.varientquatity,
                stockStatus: 'insufficient_stock'
            });
        }

        let cart = await Cart.findOne({ userId: user._id });
        if (!cart) {
           
            cart = new Cart({ userId: user._id, items: [] });
        } else {
            console.log(" Cart found");
        }

        const cartItemIndex = cart.items.findIndex(item =>
            item.productId.toString() === productId && item.variantId.toString() === variantId
        );

        if (cartItemIndex > -1) {
            if( cart.items[cartItemIndex].quantity > 4) {
                console.log('Cart limit exceeded');
                return res.status(400).json({ success: false, message: 'Cart limit exceeded' });
            }
            
            const newQuantity = cart.items[cartItemIndex].quantity + quantity;
            if (newQuantity > variant.varientquatity) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Cannot add more items. Only ${variant.varientquatity} items available for size ${variant.size}, and you already have ${cart.items[cartItemIndex].quantity} in your cart`,
                    availableStock: variant.varientquatity,
                    currentCartQuantity: cart.items[cartItemIndex].quantity,
                    stockStatus: 'insufficient_stock'
                });
            }
            
            cart.items[cartItemIndex].quantity += quantity;
            cart.items[cartItemIndex].totalPrice =
                cart.items[cartItemIndex].quantity * cart.items[cartItemIndex].price;
        } else {
            cart.items.push({
                productId,
                variantId,
                variantSize: variant.size,
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
      console.log("No user session found. Redirecting to login.");
      return res.redirect('/login');
    }

    const cart = await Cart.findOne({ userId: user._id }).populate('items.productId');
    if (!cart) {
      console.log("No cart found for user:", user._id);
      return res.render('cart', { cart: null, cartItems: [], total: 0, removedItems: [], toastMessages: [], cartCount: 0 });
    }

    const cartItems = [];
    let total = 0;
    const toastMessages = [];

    for (const item of cart.items) {
      if (item.productId) {
        const product = item.productId;

        const variant = product.variants.find(
          (v) => v._id.toString() === item.variantId.toString()
        );

        if (variant) {
          const availableQty = variant.varientquatity;

          const isOutOfStock = availableQty <= 0;
          const hasInsufficientStock = item.quantity > availableQty;

          if (isOutOfStock) {
            toastMessages.push(`${product.name} - currently out of stock.`);
          } else if (hasInsufficientStock) {
            toastMessages.push(`${product.name} - only ${availableQty} available for the selected size.`);
          }

          cartItems.push({
            product,
            variant,
            quantity: item.quantity,
            isOutOfStock,
            hasInsufficientStock
          });

          if (!isOutOfStock && !hasInsufficientStock) {
            total += (variant.salePrice ?? item.price) * item.quantity;
          }
        } else {
          
          cartItems.push({
            product,
            variant: { _id: item.variantId, size: item.variantSize || 'Unavailable', varientquatity: 0, salePrice: item.price },
            quantity: item.quantity,
            isOutOfStock: true,
            hasInsufficientStock: false
          });
          toastMessages.push(`${product.name} - selected variant is unavailable.`);
        }
      }
    }

    return res.render('cart', {
      cart,
      cartItems,
      total,
      removedItems: [], 
      toastMessages,
      cartCount: cart.items.length
    });
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).render("pageNotFound", {
      message: "An error occurred while fetching your cart",
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
        cartItem.quantity += change;
        if (cartItem.quantity <= 0) {
            cart.items = cart.items.filter(item => 
                item.productId.toString() !== productId || item.variantId.toString() !== variantId
            );
            
        } else if (cartItem.quantity > variant.varientquatity) {
            return res.status(400).json({ 
                success: false, 
                message: `Not enough stock available. Only ${variant.varientquatity} items left for size ${variant.size}`,
                availableStock: variant.varientquatity,
                stockStatus: 'insufficient_stock'
            });
        }else if (cartItem.quantity > 5) {
            return res.status(400).json({ success: false, message: 'Cart limit exceeded' }); 
        } else {
            cartItem.totalPrice = cartItem.quantity * cartItem.price;
        }

        console.log(cartItem.quantity);
        await cart.save();

        // Recalculate totals after update
        const updatedCart = await Cart.findOne({ userId: user._id }).populate({
            path: 'items.productId',
            model: 'Product'
        });

        let subtotal = 0;
        for (const item of updatedCart.items) {
            const product = item.productId;
            const variant = product.variants.find(v => v._id.toString() === item.variantId.toString());
            if (variant) {
                subtotal += (variant.salePrice || item.price) * item.quantity;
            }
        }

        res.json({ 
            success: true, 
            message: 'Cart updated',
            newQuantity: cartItem.quantity,
            subtotal: subtotal,
            cartCount: updatedCart.items.length
        });
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

const getCartCount = async (req, res) => {
    try {
        const userId = req.session.user._id;
        const cart = await Cart.findOne({ userId: userId });
        const count = cart ? cart.items.length : 0;
        
        res.json({ success: true, count: count });
    } catch (error) {
        console.error('Get cart count error:', error);
        res.status(500).json({ success: false, message: 'Server error', count: 0 });
    }
};

const checkStock = async (req, res) => {
    try {
        const { productId, variantId, quantity } = req.body;
        const user = req.session.user;

        if (!user) {
            return res.status(401).json({ success: false, message: 'Please log in to check stock' });
        }

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        const variant = product.variants.find(v => v._id.toString() === variantId);
        if (!variant) {
            return res.status(404).json({ success: false, message: 'Variant not found' });
        }

        const cart = await Cart.findOne({ userId: user._id });
        let currentCartQuantity = 0;
        
        if (cart) {
            const cartItem = cart.items.find(item =>
                item.productId.toString() === productId && item.variantId.toString() === variantId
            );
            if (cartItem) {
                currentCartQuantity = cartItem.quantity;
            }
        }

        const availableStock = variant.varientquatity;
        const requestedQuantity = quantity || 1;
        const totalQuantityAfterAdd = currentCartQuantity + requestedQuantity;

        if (availableStock === 0) {
            return res.json({
                success: false,
                available: false,
                message: `Out of stock for size ${variant.size}`,
                stockStatus: 'out_of_stock',
                availableStock: 0,
                currentCartQuantity
            });
        }

        if (totalQuantityAfterAdd > availableStock) {
            return res.json({
                success: false,
                available: false,
                message: `Not enough stock available. Only ${availableStock} items left for size ${variant.size}, and you already have ${currentCartQuantity} in your cart`,
                stockStatus: 'insufficient_stock',
                availableStock,
                currentCartQuantity,
                maxCanAdd: Math.max(0, availableStock - currentCartQuantity)
            });
        }

        return res.json({
            success: true,
            available: true,
            message: 'Stock available',
            stockStatus: 'available',
            availableStock,
            currentCartQuantity,
            canAdd: availableStock - currentCartQuantity
        });

    } catch (error) {
        console.error('Check stock error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

module.exports = {
    addToCart,
    getCart,
    updateCart,
    removeFromCart,
    getCartCount,
    checkStock
};