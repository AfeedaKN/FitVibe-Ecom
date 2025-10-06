const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema');
const Cart = require('../../models/cartSchema');

const getWishlistPage = async (req, res) => {
  try {
    const userId = req.session.user._id;
    let wishlist = await Wishlist.findOne({ user: userId }).populate('items.product');

    if (!wishlist) {
      wishlist = await Wishlist.create({ user: userId, items: [] });
    }

    const populatedItems = await Promise.all(wishlist.items.map(async (item) => {
      const product = item.product;
      const selectedVariant = product.variants.id(item.variant);
      
      const availableVariants = product.variants.filter(variant => variant.varientquatity > 0);
      
      const allVariants = product.variants.map(variant => ({
        _id: variant._id,
        size: variant.size,
        salePrice: variant.salePrice,
        varientPrice: variant.varientPrice,
        varientquatity: variant.varientquatity,
        isAvailable: variant.varientquatity > 0
      }));

      return {
        product,
        selectedVariant: selectedVariant || { size: 'N/A', salePrice: 0, varientquatity: 0 },
        availableVariants,
        allVariants
      };
    }));

    res.render('wishlist', { wishlist: { items: populatedItems } });
  } catch (error) {
    console.error('Error loading wishlist:', error);
    res.status(500).send('Server Error');
  }
};

const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId, variantId } = req.body;

    if (!variantId) {
      return res.status(400).json({ success: false, message: 'Variant ID is required' });
    }

    const product = await Product.findById(productId);
    if (!product || !product.variants.id(variantId)) {
      return res.status(404).json({ success: false, message: 'Product or variant not found' });
    }

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      wishlist = new Wishlist({ user: userId, items: [{ product: productId, variant: variantId }] });
    } else {
      const itemExists = wishlist.items.some(
        item => item.product.toString() === productId && item.variant.toString() === variantId
      );
      if (!itemExists) {
        wishlist.items.push({ product: productId, variant: variantId });
      }
    }

    await wishlist.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId, variantId } = req.body;

    await Wishlist.updateOne(
      { user: userId },
      { $pull: { items: { product: productId, variant: variantId } } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const addToCartFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId, variantId } = req.body;

    if (!productId || !variantId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID and Variant ID are required' 
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const variant = product.variants.id(variantId);
    if (!variant) {
      return res.status(400).json({ success: false, message: 'Selected size not found' });
    }

    if (variant.varientquatity === 0) {
      return res.status(400).json({ 
        success: false, 
        message: `Out of stock for size ${variant.size}`,
        stockStatus: 'out_of_stock'
      });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingItem = cart.items.find(
      item => item.productId.toString() === productId && item.variantId.toString() === variantId
    );

    if (existingItem) {
      if (existingItem.quantity + 1 > variant.varientquatity) {
        return res.status(400).json({ 
          success: false, 
          message: `Cannot add more items. Only ${variant.varientquatity} items available for size ${variant.size}, and you already have ${existingItem.quantity} in your cart`,
          stockStatus: 'insufficient_stock'
        });
      }

      if (existingItem.quantity >= 4) {
        return res.status(400).json({ success: false, message: 'Cart limit exceeded' });
      }

      existingItem.quantity += 1;
      existingItem.totalPrice = existingItem.price * existingItem.quantity;

    } else {
      cart.items.push({
        productId: product._id,
        variantId: variant._id,
        price: variant.salePrice,
        quantity: 1,
        totalPrice: variant.salePrice * 1,
        status: "placed",
        cancellationReason: "none"
      });
    }

    await cart.save();

    await Wishlist.updateOne(
      { user: userId },
      { $pull: { items: { product: productId, variant: variantId } } } 
    );

    res.json({ success: true, message: 'Product added to cart successfully' });
  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


const checkWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId } = req.params;

    const wishlist = await Wishlist.findOne({ user: userId });
    const exists = wishlist && wishlist.items.some(item => item.product.toString() === productId);

    res.json({ exists });
  } catch (error) {
    console.error('Error checking wishlist:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const getWishlistCount = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const wishlist = await Wishlist.findOne({ user: userId });
    const count = wishlist ? wishlist.items.length : 0;
    
    res.json({ success: true, count: count });
  } catch (error) {
    console.error('Get wishlist count error:', error);
    res.status(500).json({ success: false, message: 'Server error', count: 0 });
  }
};

module.exports = {
  getWishlistPage,
  addToWishlist,
  removeFromWishlist,
  addToCartFromWishlist,
  checkWishlist,
  getWishlistCount
};