const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const {calculateProductOffer} = require("../../controllers/admin/productController")

const categoryInfo = async (req, res) => {
  try {
    let search = req.query.search || "";
    let page = parseInt(req.query.page) || 1;
    const limit = 5;

    const query = {
      name: { $regex: ".*" + search + ".*", $options: "i" },
      isDeleted: false,
    };

    const categories = await Category.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();

    const count = await Category.countDocuments(query);
    const totalPages = Math.ceil(count / limit);

    const adminName = req.session.admin?.name || "Admin";

    res.render("categories", {
      pageTitle: "Category Management",
      adminName: adminName,
      cat: categories,
      totalPages: totalPages,
      currentPage: page,
      search: search,
    });
  } catch (error) {
    console.error("Error in categoryInfo:", error);
    res.redirect("/pageNotFound");
  }
};

const addCategory = async (req, res) => {
  try {
    const { name, description, categoryOffer } = req.body;
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Category name is required", error: "Category name is required" });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
      isDeleted: false,
    });
    if (existingCategory) {
      return res
        .status(400)
        .json({ success: false, message: "Category already exists", error: "Category already exists" });
    }

    const newCategory = new Category({ name, description, categoryOffer: categoryOffer || 0 });
    await newCategory.save();

    res.status(200).json({ success: true, message: "Category added successfully" });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const editCategory = async (req, res) => {
  try {
    const { id, name, description, categoryOffer } = req.body;
    if (!id || !name) {
      return res.status(400).json({ success: false, message: "Category ID and name are required" });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
      _id: { $ne: id },
    });

    if (existingCategory) {
      return res.status(400).json({ success: false, message: "Category name already exists" });
    }

    const result = await Category.updateOne(
      { _id: id },
      { $set: { name, description, categoryOffer: categoryOffer || 0 } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    // Update all products in this category to reflect the new category offer
const products = await Product.find({ categoryId: id });
    for (const product of products) {
      await calculateProductOffer(product);
      await product.save();
    }

    res.status(200).json({ success: true, message: "Category updated successfully" });
  } catch (error) {
    console.error("Error editing category:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const categorylist = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      return res.status(400).json({ success: false, message: "Category ID is required" });
    }

    const result = await Category.updateOne(
      { _id: id, isListed: true },
      { $set: { isListed: false } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: "Category not found or already unlisted" });
    }

    return res.status(200).json({ success: true, message: "Category unlisted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const categoryDelete = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      return res.status(400).json({ success: false, message: "Category ID is required" });
    }
    const result = await Category.updateOne({ _id: id }, { $set: { isDeleted: true } });
    return res.status(200).json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

const restoreCategory = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) {
      return res.status(400).json({ success: false, message: "Category ID is required" });
    }

    const result = await Category.updateOne(
      { _id: id, isListed: false },
      { $set: { isListed: true } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: "Category not found or already listed" });
    }

    return res.status(200).json({ success: true, message: "Category listed successfully" });
  } catch (error) {
    console.error("Error restoring category:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

module.exports = {
  categoryInfo,
  addCategory,
  editCategory,
  categorylist,
  restoreCategory,
  categoryDelete,
};