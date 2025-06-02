const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const { userAuth, adminAuth } = require("../middlewares/auth");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");

// --- FINAL FIX for "upload.array is not a function" ---
// Your uploadMiddleware.js MUST export the multer instance directly:
    // module.exports = upload; // where upload = multer({...})
// If it exports as { upload }, change it to: module.exports = upload;

const upload = require("../middlewares/uploadMiddleware"); // This will now be the multer instance

// Remove this line (it causes double registration and disables cropping!)
// router.post('/addproducts', adminAuth, upload.array('productImages', 10), productController.addProduct);

// Instead, handle cropping on the client side and only allow form submission after cropping is done.
// The correct way is to:
// 1. Let the user crop all images in the browser (using Cropper.js).
// 2. Replace the input's FileList with the cropped blobs/files (using DataTransfer).
// 3. Only then submit the form, so multer receives already-cropped images.

// So, keep only one route for addproducts POST:
router.post('/addproducts', adminAuth, upload.array('productImages', 10), productController.addProduct);

router.get("/login", adminController.loadAdminLogin);
router.post("/login", adminController.adminLogin);
router.get("/dashboard", adminAuth, adminController.loadAdminDashboard);
router.get("/logout", adminController.adminLogout);

router.get("/users", adminAuth, customerController.customerInfo);
router.get("/blockCustomer", adminAuth, customerController.blockCustomer);
router.get("/unblockCustomer", adminAuth, customerController.unblockCustomer);

router.get("/categories", adminAuth, categoryController.categoryInfo);
router.post("/addCategory", adminAuth, categoryController.addCategory);
router.patch("/editCategory", adminAuth, categoryController.editCategory);
router.patch("/deleteCategory", adminAuth, categoryController.deleteCategory);
router.patch("/restoreCategory", adminAuth, categoryController.restoreCategory);

router.get("/products", adminAuth, productController.loadProducts);
router.get("/addproducts", adminAuth, productController.loadAddProducts);
router.post('/addproducts', adminAuth, upload.array('productImages', 10), productController.addProduct);
router.get("/editproducts", adminAuth, productController.loadEditProducts);
router.post('/editproducts', adminAuth, upload.array('productImages', 10), productController.updateProduct);
router.post("/update-product-offer", adminAuth, productController.updateProductOffer);
router.delete("/deleteproduct/:id", adminAuth, productController.deleteProduct);
router.put("/toggle-product-listing/:id", adminAuth, productController.toggleProductListing);

module.exports = router;