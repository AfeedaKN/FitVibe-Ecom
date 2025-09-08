const express = require("express")
const app = express()
const flash = require('connect-flash')
const path = require("path")
const env = require("dotenv").config()
const session = require("express-session")
const nocache = require('nocache')
const passport = require("./config/passport")
const db = require("./config/db")
const userRouter = require("./routes/userRouter")
const adminRouter = require('./routes/adminRouter')
const Cart = require('./models/cartSchema')
const Wishlist = require('./models/wishlistSchema')
db()


app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000

    }

}))


app.use(flash());
app.use(nocache())


app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    next();
});


app.use(passport.initialize())
app.use(passport.session())
app.use((req, res, next) => {
    res.locals.user = req.session.user || null
    res.locals.admin = req.session.admin || null
    next();
})

app.use(async (req, res, next) => {
    try {
        if (req.session.user) {
            const cart = await Cart.findOne({ userId: req.session.user._id });
            const cartCount = cart ? cart.items.length : 0;

            const wishlist = await Wishlist.findOne({ user: req.session.user._id });
            const wishlistCount = wishlist ? wishlist.items.length : 0;

            res.locals.cartCount = cartCount;
            res.locals.wishlistCount = wishlistCount;
        } else {
            res.locals.cartCount = 0;
            res.locals.wishlistCount = 0;
        }
        next();
    } catch (error) {
        console.error('Error fetching cart/wishlist counts:', error);
        res.locals.cartCount = 0;
        res.locals.wishlistCount = 0;
        next();
    }
});



app.set("view engine", "ejs")
app.set("views", [path.join(__dirname, 'views/user'), path.join(__dirname, 'views/admin')])
app.use(express.static(path.join(__dirname, "public")))
app.use('/uploads', express.static('uploads'));



app.use("/", userRouter)
app.use("/admin", adminRouter)


const PORT = 3000 || process.env.PORT
app.listen(PORT, () => {
    console.log("http://localhost:3000");
})




module.exports = app



