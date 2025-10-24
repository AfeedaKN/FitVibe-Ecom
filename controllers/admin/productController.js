const Product = require("../../models/productSchema")
const Category = require("../../models/categorySchema")
const User = require("../../models/userSchema")
const mongoose = require("mongoose")
const upload = require("../../middlewares/uploadMiddleware")
const cloudinary = require("cloudinary").v2
const { calculateBestPrice, determineBestOffer } = require("../../utils/offerUtils")
const sharp = require("sharp")
const { error } = require("console")


cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
  api_key: process.env.CLOUDINARY_API_KEY?.trim(),
  api_secret: process.env.CLOUDINARY_API_SECRET?.trim(),
});

const loadProducts = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page) || 1
    const limit = 5
    const skip = (page - 1) * limit
    const searchQuery = req.query.search || ""
    const category = req.query.category || ""
    const priceRange = req.query.priceRange || ""
    const sortBy = req.query.sortBy || "createdAt"
    const sortOrder = req.query.sortOrder || "desc"
    const isActiveFilter = req.query.isActive || ""

    const filter = {
  isDeleted: false, 
}
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
      filter.isListed = true
    } else if (isActiveFilter === "false") {
      filter.isListed = false
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

    const allProducts = await Product.find({ isDeleted: false }).populate("categoryId")

    const categories = await Category.find({ isListed: true })

    const admin = req.session.admin
      ? {
        name: req.session.admin.name,
        email: req.session.admin.email,
        profileImage: req.session.admin.profileImage || "",
      }
      : {}

    const totalAllProducts = await Product.countDocuments({ isDeleted: false })

    res.render("adminProducts", {
      admin,
      products,
      allProducts,
      categories,
      currentPage: page,
      totalPages,
      totalProducts,
      totalAllProducts,
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
      allProducts: [],
      categories: [],
      currentPage: 1,
      totalPages: 0,
      totalProducts: 0,
      totalAllProducts: 0,
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


const calculateProductOffer = async (product) => {
  const category = await Category.findById(product.categoryId);
  const productOffer = parseFloat(product.offer) || 0;
  const categoryOffer = category ? parseFloat(category.categoryOffer) || 0 : 0;

  let displayOffer = productOffer;
  let offerSource = "product";
  if (categoryOffer > productOffer) {
    displayOffer = categoryOffer;
    offerSource = "category";
  }

  product.displayOffer = displayOffer;
  product.offerSource = offerSource;

  if (product.variants && product.variants.length > 0) {
    product.variants = product.variants.map((variant) => {
      const originalPrice = variant.varientPrice;
      const discountAmount = (originalPrice * displayOffer) / 100;
      const salePrice = Math.round(originalPrice - discountAmount);
      return { ...variant, salePrice };
    });
  }

  product.updatedAt = Date.now();
  return product;
};

const addProduct = async (req, res) => {
  try {
    const { 
      name, description, categoryId, brand, color, offer, fabric, sku, tags,
      croppedImage1, croppedImage2, croppedImage3
    } = req.body;

    // === VALIDATIONS ===
    if (!name || !description || !categoryId || !color || !fabric) {
      req.flash("error_msg", "All required fields must be filled");
      return res.redirect("/admin/addproducts");
    }

    const existingProduct = await Product.findOne({
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, "i") } },
        { sku: sku || "" }
      ]
    });
    if (existingProduct) {
      req.flash("error_msg", "Product with the same name or SKU already exists");
      return res.redirect("/admin/addproducts");
    }

    const category = await Category.findById(categoryId);
    if (!category) {
      req.flash("error_msg", "Category not found");
      return res.redirect("/admin/addproducts");
    }

    // === VARIANTS ===
    const variants = [];
    const sizes = ["S", "M", "L", "XL"];

    // convert possible object/array to proper array
    const variantPrices = Array.isArray(req.body.varientPrice)
      ? req.body.varientPrice
      : Object.values(req.body.varientPrice || []);
    const variantQuantities = Array.isArray(req.body.varientquatity)
      ? req.body.varientquatity
      : Object.values(req.body.varientquatity || []);

    for (let i = 0; i < sizes.length; i++) {
      const price = Number(variantPrices[i] || 0);
      const quantity = Number(variantQuantities[i] || 0);

      if (!isNaN(price) && !isNaN(quantity) && price > 0 && quantity > 0) {
        variants.push({
          size: sizes[i],
          varientPrice: price,
          salePrice: price, // set salePrice same as price for now
          varientquatity: quantity,
        });
      }
    }

    if (variants.length === 0) {
      req.flash("error_msg", "At least one variant with price & quantity is required");
      return res.redirect("/admin/addproducts");
    }

    // === CROPPED IMAGES ===
    const croppedBase64 = [croppedImage1, croppedImage2, croppedImage3].filter(Boolean);
    if (croppedBase64.length !== 3) {
      req.flash("error_msg", "You must crop and save all 3 images");
      return res.redirect("/admin/addproducts");
    }

    const images = [];
    for (let i = 0; i < 3; i++) {
      const base64Data = croppedBase64[i].replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');

      try {
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: "products",
              transformation: [{ width: 800, height: 800, crop: "fill" }],
              quality: 90
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(buffer);
        });

        const thumb200 = cloudinary.url(uploadResult.public_id, {
          width: 200, height: 200, crop: "fill", format: uploadResult.format
        });
        const thumb400 = cloudinary.url(uploadResult.public_id, {
          width: 400, height: 400, crop: "fill", format: uploadResult.format
        });

        images.push({
          url: uploadResult.secure_url,
          thumbnail: thumb200,
          medium: thumb400,
          isMain: i === 0,
          public_id: uploadResult.public_id,
        });
      } catch (err) {
        console.error("Cloudinary upload failed:", err);
        req.flash("error_msg", `Failed to upload image ${i + 1}`);
        return res.redirect("/admin/addproducts");
      }
    }

    // === TAGS ===
    const tagArray = tags
      ? typeof tags === "string"
        ? tags.split(",").map(t => t.trim()).filter(Boolean)
        : Array.isArray(tags) ? tags.map(t => t.trim()).filter(Boolean) : []
      : [];

    // === CREATE PRODUCT ===
    const newProduct = new Product({
      name,
      description,
      categoryId: new mongoose.Types.ObjectId(categoryId),
      brand: brand?.trim() || "",
      color: color.trim(),
      offer: Number(offer) || 0,
      images,
      variants,
      sku: sku?.trim() || "",
      tags: tagArray,
      fabric: fabric?.trim(),
      ratings: { average: 0, count: 0 },
      isListed: true,
    });

    await calculateProductOffer(newProduct);
    await newProduct.save();

    req.flash("success_msg", "Product added successfully");
    res.redirect("/admin/products");
  } catch (error) {
    console.error("PRODUCT CONTROLLER: Error in addProduct", error);
    req.flash("error_msg", "Failed to add product: " + error.message);
    res.redirect("/admin/addproducts");
  }
};

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
      isActive,
      deletedImages,
      croppedImage1,
      croppedImage2,
      croppedImage3
    } = req.body;

    
    if (!name || !description || !category || !color) {
      req.flash("error_msg", "All required fields must be filled");
      return res.redirect(`/admin/editproducts?id=${productId}`);
    }

    const productObjectId = new mongoose.Types.ObjectId(productId);
    const categoryIdObj = new mongoose.Types.ObjectId(category);

    const existingProduct = await Product.findOne({
      _id: { $ne: productObjectId },
      $or: [
        { name: { $regex: new RegExp(`^${name}$`, "i") } },
        { sku: sku || "" }
      ]
    });

    if (existingProduct) {
      req.flash("error_msg", "Product with the same name or SKU already exists");
      return res.redirect(`/admin/editproducts?id=${productId}`);
    }

    const categoryObj = await Category.findById(categoryIdObj);
    if (!categoryObj) {
      req.flash("error_msg", "Category not found");
      return res.redirect(`/admin/editproducts?id=${productId}`);
    }

    
    const variantPrices = req.body.varientPrice || {};
    const sizes = req.body.sizes || {};
    const variants = [];
    ["S", "M", "L", "XL"].forEach((size) => {
      const price = Number(variantPrices[size]);
      const quantity = Number(sizes[size]);
      if (!isNaN(price) && !isNaN(quantity) && price > 0 && quantity > 0) {
        variants.push({
          size,
          varientPrice: price,
          salePrice: price,
          varientquatity: quantity,
        });
      }
    });

    if (variants.length === 0) {
      req.flash("error_msg", "At least one variant with price & quantity is required");
      return res.redirect(`/admin/editproducts?id=${productId}`);
    }

    
    const product = await Product.findById(productObjectId);
    let images = product.images || [];
    let deletedIndices = [];
    
    if (deletedImages) {
      try {
        deletedIndices = JSON.parse(deletedImages);
        if (!Array.isArray(deletedIndices)) {
          deletedIndices = [];
        }
      } catch (err) {
        console.error("Error parsing deletedImages:", err);
      }
    }

    if (deletedIndices.length > 0) {
      const imagesToDelete = deletedIndices
        .filter(index => images[index])
        .map(index => images[index]);

      for (const image of imagesToDelete) {
        if (image.public_id) {
          try {
            await cloudinary.uploader.destroy(image.public_id);
          } catch (err) {
            console.error("Error deleting image from Cloudinary:", err);
          }
        }
      }

      images = images.filter((_, index) => !deletedIndices.includes(index));
      if (images.length > 0 && !images.some(img => img.isMain)) {
        images[0].isMain = true;
      }
    }

    
    const croppedBase64 = [croppedImage1, croppedImage2, croppedImage3].filter(Boolean);
    const newImages = [];
    
    for (let i = 0; i < croppedBase64.length; i++) {
      const base64Data = croppedBase64[i].replace(/^data:image\/\w+;base64,/, "");
      const buffer = Buffer.from(base64Data, 'base64');

      try {
        const uploadResult = await new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            {
              folder: "products",
              transformation: [{ width: 800, height: 800, crop: "fill" }],
              quality: 90
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          ).end(buffer);
        });

        const thumb200 = cloudinary.url(uploadResult.public_id, {
          width: 200, height: 200, crop: "fill", format: uploadResult.format
        });
        const thumb400 = cloudinary.url(uploadResult.public_id, {
          width: 400, height: 400, crop: "fill", format: uploadResult.format
        });

        newImages.push({
          url: uploadResult.secure_url,
          thumbnail: thumb200,
          medium: thumb400,
          isMain: images.length === 0 && i === 0,
          public_id: uploadResult.public_id,
        });
      } catch (err) {
        console.error("Cloudinary upload failed:", err);
        req.flash("error_msg", `Failed to upload image ${i + 1}`);
        return res.redirect(`/admin/editproducts?id=${productId}`);
      }
    }

    images = [...images, ...newImages];

    if (images.length !== 3) {
      req.flash("error_msg", "Exactly 3 images are required");
      return res.redirect(`/admin/editproducts?id=${productId}`);
    }

    
    const tagArray = tags
      ? typeof tags === "string"
        ? tags.split(",").map(t => t.trim()).filter(Boolean)
        : Array.isArray(tags) ? tags.map(t => t.trim()).filter(Boolean) : []
      : [];

    
    const updatedProduct = await Product.findById(productObjectId);
    updatedProduct.name = name;
    updatedProduct.description = description;
    updatedProduct.categoryId = categoryIdObj;
    updatedProduct.brand = brand?.trim() || "";
    updatedProduct.color = color.trim();
    updatedProduct.offer = Number(offer) || 0;
    updatedProduct.images = images;
    updatedProduct.variants = variants;
    updatedProduct.sku = sku?.trim() || "";
    updatedProduct.tags = tagArray;
    updatedProduct.fabric = fabric?.trim() || "";
    updatedProduct.isListed = isActive === "on";

    await calculateProductOffer(updatedProduct);
    await updatedProduct.save();

    req.flash("success_msg", "Product updated successfully");
    res.redirect("/admin/products");
  } catch (error) {
    console.error("PRODUCT CONTROLLER: Error in updateProduct", error);
    req.flash("error_msg", "Failed to update product: " + error.message);
    res.redirect(`/admin/editproducts?id=${req.body.productId}`);
  }
};


const updateProductOffer = async (req, res) => {
  try {
    const { productId, offer } = req.body;
    const productOffer = Number.parseFloat(offer) || 0;

    const product = await Product.findById(productId).populate("categoryId");

    if (!product) {
      req.flash("error_msg", "Product not found");
      return res.redirect("/admin/products");
    }

    
    await calculateProductOffer(product);

    await product.save();

    req.flash("success_msg", `Product offer updated to ${productOffer}% successfully`);
    res.redirect("/admin/products");
  } catch (error) {
    console.error("Update product offer error:", error);
    req.flash("error_msg", "Failed to update product offer");
    res.redirect("/admin/products");
  }
};

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

    
    for (const image of product.images) {
      try {
        const publicId = image.url.split("/").pop().split(".")[0]
        await cloudinary.uploader.destroy(`products/${publicId}`)
      } catch (error) {
        console.error("Error deleting image from Cloudinary:", error)
      }
    }
     product.isDeleted = true
    await product.save()
    
    

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
    if( product.isListed ===true ) {
      await Product.updateOne(
        { _id: productId }, 
        { $set: { isListed: false } })  
        return res.status(200).json({ success: true, message: "Product unlisted successfully" })  
    }else{
      await Product.updateOne(
        { _id: productId }, 
        { $set: { isListed: true } }) 
        return res.status(200).json({ success: true, message: "Product listed successfully" })
    }
    
  } catch (error) {
    console.error("Error toggling product listing:", error)
    res.status(500).json({ success: false, message: "Server error" })
  }
}
const viewProduct = async (req, res) => {
  try {
    const productId = req.params.id
    const product = await Product.findById(productId).populate("categoryId")

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" })
    }

    res.render("productView", { product })
  } catch (error) {
    console.error("Error viewing product:", error)
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
  viewProduct,
  calculateProductOffer
}