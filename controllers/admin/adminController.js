const User = require("../../models/userSchema")
const mongoose=require("mongoose")
const bcrypt = require("bcrypt");


const loadAdminLogin = async (req, res) => {
    try {
        if (req.session.admin) { 
            return res.redirect("/admin/dashboard");
        }
        res.render("admin-login", { message: null });
    } catch (error) {
        console.error("Admin login page error:", error);
        res.redirect("/pageNotFound");
    }
};

const adminLogin = async (req, res) => {
    try {
        const { email, password } = req.body;
         
        const Admin = await User.findOne({ email,isAdmin:true});
        
        if (!Admin) {
            return res.render("admin-login", { message: "Admin not found" });
        }
        if (!Admin.isAdmin) {
            return res.render("admin-login", { message: "Not authorized as admin" });
        }
        const passwordMatch = await bcrypt.compare(password, Admin.password);
        if (!passwordMatch) {
            return res.render("admin-login", { message: "Incorrect password" });
        }
        req.session.admin = Admin;
        res.redirect("/admin/dashboard");
    } catch (error) {
        console.error("Admin login error:", error);
        res.render("admin-login", { message: "Login failed. Please try again." });
    }
};

const loadAdminDashboard = async (req, res) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/login"); 
        }
        const users = await User.find({ isAdmin: false }).countDocuments()
        res.render("admin-dashboard", { admin: req.session.admin,totalUsers:users, message: null ,totalOrders:0,totalRevenue:0 ,orders:0});
    } catch (error) {
        console.error("Admin dashboard error:", error);
        res.redirect("/pageNotFound");
    }
};


const adminLogout = async (req, res) => {
    try {
        delete req.session.admin;
        res.redirect("/admin/login");
    } catch (error) {
        console.error("Admin logout error:", error);
        res.redirect("/pageNotFound");
    }
};





module.exports = {
    loadAdminLogin,
    adminLogin,
    loadAdminDashboard,
    adminLogout,
};