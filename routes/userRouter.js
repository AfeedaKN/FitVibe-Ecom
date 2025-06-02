const express=require("express")
const router=express.Router()
const { userAuth, adminAuth } = require("../middlewares/auth");

const userController=require("../controllers/user/userController")
const cartController=require("../controllers/user/cartController")
const checkoutController=require("../controllers/user/checkoutController") 
const showProductsController=require("../controllers/user/showProductController") 
const wishlistController=require("../controllers/user/wishlistController")
const userProfileController=require("../controllers/user/userProfileController")
const passport = require("passport");
const Wishlist = require("../models/wishlistSchema");

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

router.get("/products/:id",showProductsController.productDetails)
router.get("/product/:id",showProductsController.productDetails)
router.get("/products",showProductsController.allproducts)

router.post("/user/cart/add",userAuth,cartController.addToCart)
router.get("/user/cart",userAuth,cartController.getCart)
router.post("/cart/update",userAuth,cartController.updateCart);
router.post("/cart/remove",userAuth,cartController.removeFromCart)

router.get("/user/wishlist",userAuth,wishlistController.getWishlistPage)
router.post("/wishlist/add",userAuth,wishlistController.addToWishlist)
router.post("/wishlist/remove",userAuth,wishlistController.removeFromWishlist)
router.post("/wishlist/add-to-cart",userAuth,wishlistController.addToCartFromWishlist)



module.exports=router