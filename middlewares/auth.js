const User = require("../models/userSchema");


const userAuth = async (req, res, next) => {
    try {
        if (!req.session.user) {
            // For AJAX requests, return JSON response
            if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                return res.status(401).json({
                    success: false,
                    message: 'Please log in to continue'
                });
            }
            return res.redirect("/login");
        }

        const user = await User.findById(req.session.user);
        if (!user || user.isAdmin || user.isBlocked) {
            req.session.destroy((err) => {
                if (err) console.error("Session destroy error:", err);
                
                if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
                    return res.status(401).json({
                        success: false,
                        message: 'Session expired. Please log in again.'
                    });
                }
                return res.redirect("/login");
            });
            return;
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("User authentication error:", error);
        
        if (req.xhr || req.headers.accept?.indexOf('json') > -1) {
            return res.status(500).json({
                success: false,
                message: 'Authentication error. Please try again.'
            });
        }
        res.redirect("/login");
    }
};

const adminAuth = async (req, res, next) => {
    try {
        if (!req.session.admin) {
            return res.redirect("/admin/login");
        }

        const user = await User.findById(req.session.admin);
        if (!user || !user.isAdmin || user.isBlocked) {
            req.session.destroy((err) => {
                if (err) console.error("Session destroy error:", err);
                return res.redirect("/admin/login");
            });
            return;
        }

        req.user = user;
        next();
    } catch (error) {
        console.error("Admin authentication error:", error);
        res.redirect("/admin/login");
    }
};

module.exports={
    userAuth,
    adminAuth
}