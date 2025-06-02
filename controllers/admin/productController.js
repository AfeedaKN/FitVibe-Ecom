const Product = require("../../models/productSchema")
const Category = require("../../models/categorySchema")
const User = require("../../models/userSchema")
const mongoose = require("mongoose")
const upload = require("../../middlewares/uploadMiddleware")
const cloudinary = require("cloudinary").v2
const { calculateBestPrice, determineBestOffer } = require("../../utils/offerUtils")
const sharp = require("sharp")
const { error } = require("console")

// Ensure Cloudinary is configured before any upload
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  api_key: process.env.CLOUDINARY_API_KEY?.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
});

const loadProducts = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = 10
    const skip = (page - 1) * limit
    const searchQuery = req.query.search || ""
    const category = req.query.category || ""
    const priceRange = req.query.priceRange || ""
    const sortBy = req.query.sortBy || "createdAt"
    const sortOrder = req.query.sortOrder || "desc"
    const isActiveFilter = req.query.isActive || ""

    const filter = {}

    if (searchQuery) {
      filter.$or = [
        { name: { $regex: searchQuery, $options: "i" } },
        { description: { $regex: searchQuery, $options: "i" } },
      ]
    }

    if (category && category.trim() !== "") {
      filter.categoryId = new mongoose.Types.ObjectId(category)
    }

    if (isActiveFilter === "true") {
      filter.isActive = true
    } else if (isActiveFilter === "false") {
      filter.isActive = false
    }

    if (priceRange) {
      const [min, max] = priceRange.split("-")
      const minPrice = Number.parseFloat(min)
      const maxPrice = Number.parseFloat(max)

      if (!isNaN(minPrice) && !isNaN(maxPrice)) {
        filter["variants.varientPrice"] = {
          $gte: minPrice,
          $lte: maxPrice,
        }
      } else if (!isNaN(minPrice)) {
        filter["variants.varientPrice"] = { $gte: minPrice }
      }
    }

    const sort = {}
    sort[sortBy] = sortOrder === "asc" ? 1 : -1

    const totalProducts = await Product.countDocuments(filter)
    const totalPages = Math.ceil(totalProducts / limit)

    const products = await Product.find(filter)
      .populate("categoryId")
      .sort(sort)
      .skip(skip)
      .limit(limit)

    const categories = await Category.find({ isListed: true })

    const admin = req.session.admin
      ? {
        name: req.session.admin.name,
        email: req.session.admin.email,
        profileImage: req.session.admin.profileImage || "",
      }
      : {}

    res.render("adminProducts", {
      admin,
      products,
      categories,
      currentPage: page,
      totalPages,
      totalProducts,
      searchQuery,
      category,
      limit,
      priceRange,
      sortBy,
      sortOrder,
      isActiveFilter,
      query: req.query,
    })
  } catch (error) {
    console.error(error)
    res.status(500).render("adminProducts", {
      admin: req.session.admin || {},
      products: [],
      categories: [],
      currentPage: 1,
      totalPages: 0,
      totalProducts: 0,
      searchQuery: req.query.search || "",
      category: req.query.category || "",
      priceRange: req.query.priceRange || "",
      sortBy: req.query.sortBy || "createdAt",
      sortOrder: req.query.sortOrder || "desc",
      isActiveFilter: req.query.isActive || "",
      query: req.query,
      error_msg: "Server error: " + error.message,
    })
  }
}

const loadAddProducts = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true })

    const admin = {
      name: req.session.admin.name,
      email: req.session.admin.email,
      profileImage: req.session.admin.profileImage,
    }

    res.render("adminAddProducts", { admin, categories })
  } catch (error) {
    console.error(error)
    res.status(500).render("adminAddProducts", {
      admin: req.session.admin || {},
      categories: [],
      error_msg: "Server error",
    })
  }
}

const addProduct = async (req, res) => {
  try {
    const { name, description, categoryId, brand, color, offer, fabric, sku, tags } = req.body

    // Validate category
    const category = await Category.findById(categoryId)
    if (!category) {
      req.flash("error_msg", "Category not found")
      return res.redirect("/admin/addproducts")
    }

    // Calculate offers
    const productOffer = Number(offer) || 0
    const categoryOffer = category.categoryOffer || 0
    const bestOffer = determineBestOffer(productOffer, categoryOffer)

    // Process variants
    const variants = []
    const sizes = ["S", "M", "L", "XL"]
    const varientPrices = Array.isArray(req.body.varientPrice) ? req.body.varientPrice : [req.body.varientPrice]
    const varientQuantities = Array.isArray(req.body.varientquatity)
      ? req.body.varientquatity
      : [req.body.varientquatity]

    for (let i = 0; i < sizes.length; i++) {
      const price = Number(varientPrices[i])
      const quantity = Number(varientQuantities[i])

      if (!isNaN(price) && !isNaN(quantity) && price > 0 && quantity > 0) {
        const { salePrice } = calculateBestPrice(price, productOffer, categoryOffer)

        variants.push({
          size: sizes[i],
          varientPrice: price,
          salePrice,
          varientquatity: quantity,
        })
      }
    }

    if (variants.length === 0) {
      req.flash("error_msg", "At least one variant is required")
      return res.redirect("/admin/addproducts")
    }

    // Only use cropped images from the client (not raw/original)
    // If you use a hidden input or DataTransfer to replace the FileList in the browser,
    // multer will only receive the cropped images, not the raw ones.

    // If you see both cropped and raw images in req.files, filter out duplicates by filename:
    const seen = new Set();
    const filteredFiles = [];
    for (const file of req.files) {
      if (!seen.has(file.originalname)) {
        filteredFiles.push(file);
        seen.add(file.originalname);
      }
    }

    const images = [];
    if (!filteredFiles || filteredFiles.length === 0) {
      req.flash("error_msg", "Please upload at least 3 images");
      return res.redirect("/admin/addproducts");
    }
    if (filteredFiles.length < 3) {
      req.flash("error_msg", "Please upload at least 3 images");
      return res.redirect("/admin/addproducts");
    }

    // Upload each image to Cloudinary and get the URLs
    for (let index = 0; index < filteredFiles.length; index++) {
      const file = filteredFiles[index];
      try {
        // Upload to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(file.path, {
          folder: "products",
          transformation: [
            { width: 800, height: 800, crop: "fill" }
          ]
        });
        // Create thumbnail
        const thumbUrl = cloudinary.url(uploadResult.public_id, {
          width: 200,
          height: 200,
          crop: "fill",
          format: uploadResult.format,
        });

        images.push({
          url: uploadResult.secure_url,
          thumbnail: thumbUrl,
          isMain: index === 0,
          public_id: uploadResult.public_id,
        });

        // Remove local file after upload
        const fs = require("fs").promises;
        await fs.unlink(file.path).catch(() => { });
      } catch (err) {
        console.error("PRODUCT CONTROLLER: Error uploading to Cloudinary", file.path, err);
        req.flash("error_msg", "Error uploading image: " + file.originalname);
        return res.redirect("/admin/addproducts");
      }
    }

    // Process tags
    const tagArray = tags ? (typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags) : []

    // Create product
    const newProduct = new Product({
      name,
      description,
      categoryId: new mongoose.Types.ObjectId(categoryId),
      brand: brand || "",
      color,
      offer: productOffer,
      displayOffer: bestOffer.offerValue,
      offerSource: bestOffer.offerSource,
      images,
      variants,
      sku: sku || "",
      tags: tagArray,
      fabric,
      ratings: {
        average: 0,
        count: 0,
      },
      isActive: true,
    })

    await newProduct.save()

    req.flash("success_msg", "Product added successfully")
    res.redirect("/admin/products")
  } catch (error) {
    console.error("PRODUCT CONTROLLER: Error in addProduct", error);
    req.flash("error_msg", "Failed to add product: " + error.message)
    res.redirect("/admin/addproducts")
  }
}

const loadEditProducts = async (req, res) => {
  try {
    const productId = req.query.id
    const product = await Product.findById(productId).populate("categoryId")

    if (!product) {
      req.flash("error_msg", "Product not found")
      return res.redirect("/admin/products")
    }

    const categories = await Category.find({ isListed: true })
    const admin = {
      name: req.session.admin.name,
      email: req.session.admin.email,
      profileImage: req.session.admin.profileImage,
    }

    res.render("adminUpdateProduct", {
      admin,
      product,
      categories,
    })
  } catch (error) {
    console.error("Load edit products error:", error)
    req.flash("error_msg", "Server error")
    res.redirect("/admin/products")
  }
}

const updateProduct = async (req, res) => {
  try {
    const {
      productId,
      name,
      description,
      color,
      offer,
      category,
      brand,
      fabric,
      sku,
      tags,
      isActive
    } = req.body

    // Validate category
    const categoryObj = await Category.findById(category)
    if (!categoryObj) {
      req.flash("error_msg", "Category not found")
      return res.redirect("/admin/products")
    }

    // Calculate offers
    const productOffer = Number.parseFloat(offer) || 0
    const categoryOffer = categoryObj.categoryOffer || 0
    // const bestOffer = determineBestOffer(productOffer, categoryOffer)

    // Process variants
    // Step 1: Get data from form
    const variantPrices = req.body.varientPrice || {}; // Object with sizes as keys
    const sizes = req.body.sizes || {}; // Object with sizes as keys

    // Step 2: Calculate best offer
    const bestOffer = calculateBestPrice(variantPrices.S, productOffer, category.categoryOffer);

    // Step 3: Loop through sizes and construct variants array
    const variants = [];

    ["S", "M", "L", "XL"].forEach((size) => {
      const price = Number(variantPrices[size]);
      const quantity = Number(sizes[size]);

      if (!isNaN(price) && !isNaN(quantity) && price > 0 && quantity > 0) {
        const salePrice = calculateBestPrice(price, productOffer, categoryOffer).salePrice;

        variants.push({
          size,
          varientPrice: price,
          varientquatity: quantity,
          salePrice,
        });
      }
    });


    // Get existing product for images
    const existingProduct = await Product.findById(productId);
    let images = existingProduct.images || [];

    // Only use cropped images from the client (not raw/original)
    const seen = new Set();
    const filteredFiles = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        if (!seen.has(file.originalname)) {
          filteredFiles.push(file);
          seen.add(file.originalname);
        }
      }
    }

    // Process new images if uploaded (upload to Cloudinary)
    if (filteredFiles && filteredFiles.length > 0) {
      const newImages = [];
      for (let index = 0; index < filteredFiles.length; index++) {
        const file = filteredFiles[index];
        try {
          // Upload to Cloudinary
          const uploadResult = await cloudinary.uploader.upload(file.path, {
            folder: "products",
            transformation: [
              { width: 800, height: 800, crop: "fill" }
            ]
          });
          // Create thumbnail
          const thumbUrl = cloudinary.url(uploadResult.public_id, {
            width: 200,
            height: 200,
            crop: "fill",
            format: uploadResult.format,
          });

          newImages.push({
            url: uploadResult.secure_url,
            thumbnail: thumbUrl,
            isMain: images.length === 0 && index === 0,
            public_id: uploadResult.public_id,
          });

          // Remove local file after upload
          const fs = require("fs").promises;
          await fs.unlink(file.path).catch(() => { });
        } catch (err) {
          console.error("PRODUCT CONTROLLER: Error uploading to Cloudinary (update)", file.path, err);
          req.flash("error_msg", "Error uploading image: " + file.originalname);
          return res.redirect("/admin/products");
        }
      }
      images = [...images, ...newImages];
    }

    // Process tags
    const tagArray = tags ? (typeof tags === 'string' ? tags.split(',').map(tag => tag.trim()) : tags) : []

    // Update product
    await Product.findByIdAndUpdate(productId, {
      name,
      description,
      categoryId: new mongoose.Types.ObjectId(category),
      brand: brand || "",
      color,
      offer: productOffer,
      displayOffer: bestOffer.offerValue,
      offerSource: bestOffer.offerSource,
      fabric: fabric || "",
      sku: sku || "",
      tags: tagArray,
      variants,
      images,
      isActive: isActive === 'on',
      updatedAt: Date.now(),
    })

    req.flash("success_msg", "Product updated successfully")
    res.redirect("/admin/products")
  } catch (error) {
    console.error("PRODUCT CONTROLLER: Error in updateProduct", error);
    req.flash("error_msg", "Failed to update product")
    res.redirect("/admin/products")
  }
}

const updateProductOffer = async (req, res) => {
  try {
    const { productId, offer } = req.body
    const productOffer = Number.parseFloat(offer) || 0

    const product = await Product.findById(productId).populate("categoryId")

    if (!product) {
      req.flash("error_msg", "Product not found")
      return res.redirect("/admin/products")
    }

    const categoryOffer = product.categoryId ? product.categoryId.categoryOffer || 0 : 0
    const bestOffer = determineBestOffer(productOffer, categoryOffer)

    product.offer = productOffer
    product.displayOffer = bestOffer.offerValue
    product.offerSource = bestOffer.offerSource

    if (product.variants && product.variants.length > 0) {
      product.variants.forEach((variant) => {
        const { salePrice } = calculateBestPrice(variant.varientPrice, productOffer, categoryOffer)
        variant.salePrice = salePrice
      })
    }

    await product.save()

    req.flash("success_msg", `Product offer updated to ${productOffer}% successfully`)
    res.redirect("/admin/products")
  } catch (error) {
    console.error("Update product offer error:", error)
    req.flash("error_msg", "Failed to update product offer")
    res.redirect("/admin/products")
  }
}

const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id
    const product = await Product.findById(productId)

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      })
    }

    // Delete images from Cloudinary
    for (const image of product.images) {
      try {
        const publicId = image.url.split("/").pop().split(".")[0]
        await cloudinary.uploader.destroy(`products/${publicId}`)
      } catch (error) {
        console.error("Error deleting image from Cloudinary:", error)
      }
    }

    await Product.findByIdAndDelete(productId)

    return res.status(200).json({
      success: true,
      message: "Product deleted successfully",
    })
  } catch (error) {
    console.error(error)
    res.status(500).json({ success: false, message: "Server error" })
  }
}

const toggleProductListing = async (req, res) => {
  try {
    const productId = req.params.id
    const product = await Product.findById(productId)

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" })
    }

    product.isActive = !product.isActive
    await product.save()

    return res.status(200).json({
      success: true,
      message: product.isActive ? "Product listed successfully" : "Product unlisted successfully",
      isListed: product.isActive,
    })
  } catch (error) {
    console.error("Error toggling product listing:", error)
    res.status(500).json({ success: false, message: "Server error" })
  }
}

module.exports = {
  loadProducts,
  loadAddProducts,
  addProduct,
  loadEditProducts,
  updateProduct,
  updateProductOffer,
  deleteProduct,
  toggleProductListing,
}