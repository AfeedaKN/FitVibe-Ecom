// const express = require("express")
// const router = express.Router()
// const adminAuth = require("../middlewares/adminAuthMiddleware")
// const productController = require("../controllers/admin/productController")
// const upload = require("../middlewares/uploadMiddleware")

// router.get("/products", adminAuth, productController.loadProducts)
// router.get("/addproducts", adminAuth, productController.loadAddProducts)
// router.post("/addProduct", adminAuth, upload.array("images", 10), productController.addProduct)
// router.get("/editproducts", adminAuth, productController.loadEditProducts)
// router.patch("/editProduct", adminAuth, upload.array("images", 10), productController.updateProduct)
// router.patch("/updateProductOffer", adminAuth, productController.updateProductOffer)
// router.delete("/deleteProduct/:id", adminAuth, productController.deleteProduct)
// router.patch("/toggleProductListing/:id", adminAuth, productController.toggleProductListing)

// module.exports = router