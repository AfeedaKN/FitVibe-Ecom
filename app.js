const express=require("express")
const app=express()
const flash = require('connect-flash')
const path=require("path")
const env=require("dotenv").config()
const session=require("express-session")
const passport=require("./config/passport")
const db=require("./config/db")
const userRouter=require("./routes/userRouter")
const adminRouter=require('./routes/adminRouter')
db()


app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(session({
    secret:process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        secure:false,
        httpOnly:true,
        maxAge:72*60*60*1000

    }

}))


app.use(flash());


app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  next();
});

 
app.use(passport.initialize())
app.use(passport.session())
app.use((req,res,next)=>{
    res.locals.user = req.session.user || null
    res.locals.admin = req.session.admin || null
    next();
}) 



app.set("view engine","ejs")
app.set("views",[path.join(__dirname,'views/user'),path.join(__dirname,'views/admin')])
app.use(express.static(path.join(__dirname,"public")))
app.use('/uploads', express.static('uploads'));



app.use("/",userRouter)
app.use("/admin",adminRouter)
 

const PORT=3000 || process.env.PORT
app.listen(PORT,()=>{
    console.log("http://localhost:3000");
})




module.exports=app   



