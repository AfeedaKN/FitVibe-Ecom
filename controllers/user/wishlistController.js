const Wishlist = require('../../models/wishlistSchema');
const Product = require('../../models/productSchema'); // assuming you have a product schema
const Cart = require('../../models/cartSchema'); // only if you're using cart system

// 📄 1. Show Wishlist Page
const getWishlistPage = async (req, res) => {
  try {
    const userId = req.session.user._id;
    let wishlist = await Wishlist.findOne({ user: userId }).populate('products');
    const products = await Product.find({});
    if (!wishlist) {
      wishlist = await Wishlist.create({ user: userId, products: [] });
    }

    const items = wishlist.products.map(product => ({
      product
    }));

    res.render('wishlist', { wishlist: { items }, product: products });
  } catch (error) {
    console.error('Error loading wishlist:', error);
    res.status(500).send('Server Error');
  }
};

// ➕ 2. Add to Wishlist
const addToWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId } = req.body;

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      wishlist = new Wishlist({ user: userId, products: [productId] });
    } else if (!wishlist.products.includes(productId)) {
      wishlist.products.push(productId);
    }

    await wishlist.save();
    res.json({ success: true });
  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// ❌ 3. Remove from Wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId } = req.body;

    await Wishlist.updateOne(
      { user: userId },
      { $pull: { products: productId } }
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error removing from wishlist:', error);
    res.status(500).json({ success: false });
  }
};

const addToCartFromWishlist = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { productId } = req.body;

    const product = await Product.findById(productId);
    console.log("Received productId:", req.body.productId);
    console.log('Product ID from request:', productId)
    



    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let cart = await Cart.findOne({ userId });

    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const variant = product.variants[0]; 
    console.log('Variant:', variant);

    if (!variant) {
      return res.status(400).json({ success: false, message: 'No variant found for product' });
    }

    const existingItem = cart.items.find(
      item => item.productId.toString() === productId && item.variantId.toString() === variant._id.toString()
    );

    if (existingItem) {
      console.log('Existing item found in cart:', existingItem);
      if( existingItem.quantity > 4) {
        console.log('Cart limit exceeded');
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
        totalPrice: variant.salePrice * 1
      });
    }


    await cart.save();

    await Wishlist.updateOne(
      { user: userId },
      { $pull: { products: productId } }
    );

    res.json({ success: true });

  } catch (error) {
    console.error('Error adding to cart:', error);
    res.status(500).json({ success: false });
  }
};


module.exports = {
  getWishlistPage,
  addToWishlist,
  removeFromWishlist,
  addToCartFromWishlist
};
