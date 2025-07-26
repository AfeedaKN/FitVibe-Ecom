const express = require("express");
const router = express.Router();
const adminController = require("../controllers/admin/adminController");
const { userAuth, adminAuth } = require("../middlewares/auth");
const customerController = require("../controllers/admin/customerController");
const categoryController = require("../controllers/admin/categoryController");
const productController = require("../controllers/admin/productController");
const orderController = require("../controllers/admin/orderController");




const upload = require("../middlewares/uploadMiddleware"); // This will now be the multer instance

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
router.patch("/deleteCategory", adminAuth, categoryController.categorylist);
router.delete("/categoryDelete", adminAuth, categoryController.categoryDelete);
router.patch("/restoreCategory", adminAuth, categoryController.restoreCategory);

router.get("/products", adminAuth, productController.loadProducts);
router.get("/product/:id", adminAuth, productController.viewProduct);
router.get("/addproducts", adminAuth, productController.loadAddProducts);
router.post('/addproducts', adminAuth, upload.array('productImages', 10), productController.addProduct);
router.get("/editproducts", adminAuth, productController.loadEditProducts);
router.post('/editproducts', adminAuth, upload.array('productImages', 10), productController.updateProduct);
router.post("/update-product-offer", adminAuth, productController.updateProductOffer);
router.delete("/deleteproduct/:id", adminAuth, productController.deleteProduct);
router.put("/toggle-product-listing/:id", adminAuth, productController.toggleProductListing);

router.get("/orders", adminAuth, orderController.loadOrders);
router.post("/order/status", adminAuth, orderController.updateOrderStatus);
router.get("/order/:id", adminAuth, orderController.viewOrderDetails);
router.post("/order/return-approve/:orderId", adminAuth, orderController.approveReturn);
router.post("/order/return-reject/:orderId", adminAuth, orderController.rejectReturn);








module.exports = router;
