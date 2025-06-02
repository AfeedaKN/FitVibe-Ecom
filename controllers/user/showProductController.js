const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Category = require('../../models/categorySchema');

const loadHomepage = async (req, res) => {
    try {
        const collections = [
            {
                slug: 'formal-shirts',
                name: 'Formal Shirts',
                description: 'Perfect shirts for office and formal occasions',
                imageUrl: 'https://assets.myntassets.com/h_200,w_200,c_fill,g_auto/h_1440,q_100,w_1080/v1/assets/images/19268524/2022/9/3/983619a1-2943-4a4b-a482-2cbdaf6b437c1662188203993-THE-BEAR-HOUSE-Men-Black-Slim-Fit-Formal-Shirt-6351662188203-1.jpg'
            },
            {
                slug: 'casual-shirts',
                name: 'Casual Shirts',
                description: 'Comfortable and stylish casual wear',
                imageUrl: 'https://5.imimg.com/data5/SELLER/Default/2023/1/RR/KJ/UE/102058255/shimak-casual-shirts-printed-full-sleeve-1000x1000.jpeg'
            },
            {
                slug: 'party-shirts',
                name: 'Party Shirts',
                description: 'Stand out in stylish party shirts',
                imageUrl: 'https://thefoomer.in/cdn/shop/files/jpeg-optimizer_PATP0911_83dc2bbc-47b4-4f3a-a8a1-1554275db470.jpg?v=1705725249'
            }
        ];

        const trending = await Product.find({ isListed: true, isDeleted: false })
            .populate('categoryId')
            .limit(5);
        const newArrivals = await Product.find({ isListed: true, isDeleted: false })
            .populate('categoryId')
            .sort({ createdAt: -1 })
            .limit(5); 
        
        if (!req.session.user) {
            res.render('home', { user: null, newArrivals, trending, collections });
        } else {
            res.render('home', { user: req.session.user, newArrivals, trending, collections });
        }
    } catch (error) {
        console.log("Home page error:", error);
        res.status(500).send("Server error");
    }
};

const productDetails = async (req, res) => {
    try {
        const productId = req.params.id;

        const product = await Product.findOne({ 
            _id: productId, 
            isListed: true, 
            isDeleted: false 
        }).populate('categoryId');

        
        
        

        if (!product) {
            return res.status(404).render('pageNotFound', { message: 'Product not found' });
        }

        console.log('Product details:', product);
        res.render('productDetail', { product });
    } catch (error) {
        console.error("Product details error:", error);
        res.redirect("/pageNotFound");
    }
};

const allproducts = async (req, res) => {
 try {
    const {
      page = 1,
      limit = 12,
      search = '',
      sort = '',
      category = '',
      brand = '',
      minPrice = '',
      maxPrice = ''
    } = req.query;

    let query = { isDeleted: false, isListed: true }; 

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

if (category) {
  query.categoryId = category; // FIXED
}

if (brand) {
  query.brand = { $regex: new RegExp(brand, 'i') }; // FIXED for flexible match
}


    if (minPrice || maxPrice) {
      query['variants.salePrice'] = {};
      if (minPrice) query['variants.salePrice'].$gte = Number(minPrice);
      if (maxPrice) query['variants.salePrice'].$lte = Number(maxPrice);
    }

    // Sorting
    let sortOption = {};
    switch (sort) {
      case 'priceAsc':
        sortOption['variants.salePrice'] = 1;
        break;
      case 'priceDesc':
        sortOption['variants.salePrice'] = -1;
        break;
      case 'nameAsc':
        sortOption.name = 1;
        break;
      case 'nameDesc':
        sortOption.name = -1;
        break;
      case 'popularity':
        sortOption.popularity = -1; // Assuming popularity is a field
        break;
      case 'rating':
        sortOption.rating = -1;
        break;
      case 'newArrivals':
        sortOption.createdAt = -1;
        break;
      case 'featured':
        sortOption.featured = -1; // Assuming featured is a boolean field
        break;
      default:
        sortOption.createdAt = -1;
    }

    // Pagination
    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);
    const products = await Product.find(query)
      .sort(sortOption)
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .populate('categoryId');

    // Fetch categories and brands for filters
    const categories = await Category.find();
    const brands = await Product.distinct('brand');

    // Build query string for pagination links
    const buildQuery = (params) => {
      const queryParams = { ...req.query, ...params };
      return `/products?${new URLSearchParams(queryParams).toString()}`;
    };
    console.log('All products:', products);

    res.render('allproduct', {
      products,
      categories,
      brands,
      query: req.query,
      currentPage: Number(page),
      totalPages,
      buildQuery
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};

module.exports = { 
    loadHomepage,
    productDetails,
    allproducts
};
