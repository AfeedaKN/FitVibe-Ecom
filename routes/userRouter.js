const express=require("express")
const router=express.Router()
const { userAuth, adminAuth } = require("../middlewares/auth");

const upload = require('../middlewares/uploadMiddleware');

const userController=require("../controllers/user/userController")
const cartController=require("../controllers/user/cartController")
const checkoutController=require("../controllers/user/checkoutController") 
const showProductsController=require("../controllers/user/showProductController") 
const wishlistController=require("../controllers/user/wishlistController")
const userProfileController=require("../controllers/user/userProfileController")
const addressController=require("../controllers/user/addressController")
const orderController = require("../controllers/user/orderController");
const passport = require("passport");
const Wishlist = require("../models/wishlistSchema");
const walletController = require("../controllers/user/walletController");


router.get("/pageNotFound",userController.pageNotFound)
router.get("/",showProductsController.loadHomepage)
router.get("/signup",userController.loadSignup)
router.get("/login",userController.loadLogin)
router.post("/login",userController.login)
router.post("/signup",userController.signup)
router.post("/verify-otp",userController.verifyOTP)
router.post("/resend-otp",userController.resendOtp)
router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}))
router.get('/google/auth/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res)=>{
    req.session.user=req.user
    res.redirect('/')
})
router.get("/forgot-password",userController.loadForgotPassword)
router.post("/forgot-password",userController.forgotPassword)
router.get("/reset-password/:token",userController.loadResetPassword)
router.post("/reset-password/:token",userController.resetPassword)
router.post("/verify-reset-otp",userController.verifyResetOtp)
router.post("/resend-reset-otp",userController.resendResetOtp)
router.get("/reset-password",userController.loadResetPassword) 
router.post("/reset-password",userController.resetPassword)
router.get('/logout',userController.logout)

router.get("/products/:id",userAuth,showProductsController.productDetails)
router.get("/product/:id",userAuth,showProductsController.productDetails)
router.get("/products",userAuth,showProductsController.allproducts)

router.post("/user/cart/add",userAuth,cartController.addToCart)
router.get("/user/cart",userAuth,cartController.getCart)
router.post("/cart/update",userAuth,cartController.updateCart);
router.post("/cart/remove",userAuth,cartController.removeFromCart)

router.get("/user/wishlist",userAuth,wishlistController.getWishlistPage)
router.post("/wishlist/add",userAuth,wishlistController.addToWishlist)
router.post("/wishlist/remove",userAuth,wishlistController.removeFromWishlist)
router.post("/wishlist/add-to-cart",userAuth,wishlistController.addToCartFromWishlist)
router.get("/wishlist/check/:productId", userAuth, wishlistController.checkWishlist);

router.get('/checkout',userAuth,checkoutController.getCheckout)
router.post('/order/place', userAuth, checkoutController.placeOrder)
router.get('/success/:orderId', userAuth, checkoutController.getOrderSuccess)
router.get("/order/success/:orderId", userAuth, checkoutController.getOrderSuccess);
router.get("/order/:id", userAuth, checkoutController.getOrderDetails);

router.get('/address/:id',userAuth,addressController.getAddress)
router.post('/save-address', userAuth, addressController.saveAddress)
router.post('/address/set-default', userAuth, addressController.setDefaultAddress)
router.get("/profile/addresses", userAuth, addressController.loadaddresses);
router.post('/profile/address/edit',userAuth,addressController.editAddress);
router.post("/address/delete/:id", userAuth, addressController.deleteAddress);


router.get("/user/account", userAuth, userProfileController.loadUserProfile); 
router.get("/profile/edit", userAuth, userProfileController.loadEditProfile);
router.post('/profile/edit', upload.single('profileImage'), userProfileController.updateProfile);
router.get('/profile/change-password',userAuth, userProfileController.getChangePasswordPage);
router.post('/profile/change-password',userAuth, userProfileController.postChangePassword);


router.get("/profile/orders", userAuth,orderController.getOrders);
router.get("profile/order/:id", userAuth,orderController.getOrderDetail);
router.post("/order/cancel/:orderId",  orderController.cancelOrder);
router.get("/order/invoice/:id", userAuth, orderController.downloadInvoice);
router.post("/order/return/:orderId",userAuth, orderController.returnOrder);

router.get("/profile/Wallet", userAuth, walletController.getWalletPage);
router.post("/wallet/add-funds", userAuth, walletController.addFunds);

module.exports=router 

