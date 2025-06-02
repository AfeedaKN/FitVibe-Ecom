const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Category = require('../../models/categorySchema');

const pageNotFound = async (req, res) => {
    try {
        res.render("pageNotFound");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};



const loadSignup = async (req, res) => {
    try {
        return res.render("signUp", {
            error: null,
            user: null,
        });
    } catch (error) {
        console.log("Signup page not found");
        res.redirect("/pageNotFound");
    }
};

const loadLogin = async (req, res) => {
    try {
        if (!req.session.user) {
            return res.render("login", {
                message: null
            });
        } else {
            res.redirect("/");
        }
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendVerificationEmail(email, subject, text) {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD,
            },
        });
        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: subject,
            text: text,
            html: `<p>${text}</p>`,
        });
        return info.accepted.length > 0;
    } catch (error) {
        console.log("Error sending email:", error);
        return false;
    }
}

const signup = async (req, res) => {
    try {
        const { name, phone, email, password, confirmPassword } = req.body;
        
        if (password !== confirmPassword) {
            return res.render("signup", { message: "Passwords do not match" });
        }
        const findUser = await User.findOne({ email });
        if (findUser) {
            return res.render("signup", { message: "User with this email already exists" });
        }
        const otp = generateOtp();
        const emailSent = await sendVerificationEmail(email, "Verify Your Account", `Your OTP is ${otp}`);
        if (!emailSent) {
            return res.json("email-error");
        }
        req.session.userOtp = otp;
        req.session.userData = { name, phone, email, password };

        res.render("verify-otp");
        console.log("OTP sent:", otp);
    } catch (error) {
        console.log("Sign up error:", error);
        res.redirect("/pageNotFound");
    }
};

const securePassword = async (password) => {
    try {
        const passwordHash = await bcrypt.hash(password, 10);
        return passwordHash;
    } catch (error) {
        console.error("Error hashing password:", error);
        throw error;
    }
};

const verifyOTP = async (req, res) => {
    try {
        const { otp } = req.body;

        if (!otp) {
            return res.status(400).json({
                success: false,
                message: "OTP is required",
            });
        }

        if (otp == req.session.userOtp) {
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);

            const savedUserData = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
            });

            await savedUserData.save();

            return res.status(200).json({
                success: true,
                message: "OTP verified successfully",
                redirectUrl: "/login",
            });
        } else {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP",
            });
        }
    } catch (error) {
        console.error("Verify OTP error:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while verifying OTP",
        });
    }
};

const resendOtp = async (req, res) => {
    try {
        const { email } = req.session.userData;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in session" });
        }

        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSent = await sendVerificationEmail(email, "Verify Your Account", `Your OTP is ${otp}`);
        if (emailSent) {
            console.log("Resend OTP:", otp);
            res.status(200).json({ success: true, message: "OTP Resent Successfully" });
        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again" });
        }
    } catch (error) {
        console.error("Error resending OTP:", error);
        res.status(500).json({ success: false, message: "Internal server error. Please try again" });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const findUser = await User.findOne({ email: email });
        if (!findUser) {
            return res.render("login", { message: "User not found" });
        }
        if (findUser.isBlocked) {
            return res.render("login", { message: "User is blocked by admin" });
        }
        const passwordMatch = await bcrypt.compare(password, findUser.password);
        if (!passwordMatch) {
            return res.render("login", { message: "Incorrect password" }); 
        }
        req.session.user = findUser;
        res.redirect("/");
    } catch (error) {
        console.error("Login error:", error);
        res.render("login", { message: "Login failed. Please try again later" });
    }
};

const loadForgotPassword = async (req, res) => {
    try {
        res.render("forgot-password", { message: null });
    } catch (error) {
        console.error("Forgot password page error:", error);
        res.redirect("/pageNotFound");
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.render("forgot-password", { message: "No user with this email" });
        }

        const otp = generateOtp();
        user.resetOtp = otp;
        user.resetOtpExpiry = Date.now() + 600000; 
        await user.save();

        const emailSent = await sendVerificationEmail(
            email,
            "Password Reset OTP",
            `Your OTP for password reset is ${otp}`
        );

        if (!emailSent) {
            return res.render("forgot-password", { message: "Error sending OTP" });
        }

        req.session.resetEmail = email;
        req.session.resetOtp = otp;

        res.render("verify-reset-otp", { message: null });
        console.log("Reset OTP sent:", otp);
    } catch (error) {
        console.error("Forgot password error:", error);
        res.render("forgot-password", { message: "An error occurred. Please try again." });
    }
};

const loadVerifyResetOtp = async (req, res) => {
    try {
        if (!req.session.resetEmail) {
            return res.redirect("/forgot-password");
        }
        res.render("verify-reset-otp", { message: null });
    } catch (error) {
        console.error("Verify reset OTP page error:", error);
        res.redirect("/pageNotFound");
    }
};

const verifyResetOtp = async (req, res) => {
    try {
        const { otp } = req.body;
        if (!otp) {
            return res.render("verify-reset-otp", { message: "OTP is required" });
        }

        const user = await User.findOne({
            email: req.session.resetEmail,
            resetOtp: otp,
            resetOtpExpiry: { $gt: Date.now() },
        });

        if (otp != req.session.resetOtp) {
            return res.render("verify-reset-otp", { message: "Invalid or expired OTP" });
        }

        res.render("reset-password", { email: req.session.resetEmail, message: null });
    } catch (error) {
        console.error("Verify reset OTP error:", error);
        res.render("verify-reset-otp", { message: "An error occurred. Please try again." });
    }
};

const resendResetOtp = async (req, res) => {
    try {
        const email = req.session.resetEmail;
        if (!email) {
            return res.status(400).json({ success: false, message: "Email not found in session" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: "User not found" });
        }

        const otp = generateOtp();
        user.resetOtp = otp;
        user.resetOtpExpiry = Date.now() + 600000; 
        await user.save();

        req.session.resetOtp = otp;

        const emailSent = await sendVerificationEmail(
            email,
            "Password Reset OTP",
            `Your OTP for password reset is ${otp}`
        );

        if (emailSent) {
            console.log("Resend Reset OTP:", otp);
            res.status(200).json({ success: true, message: "OTP Resent Successfully" });
        } else {
            res.status(500).json({ success: false, message: "Failed to resend OTP. Please try again" });
        }
    } catch (error) {
        console.error("Error resending reset OTP:", error);
        res.status(500).json({ success: false, message: "Internal server error. Please try again" });
    }
};

const loadResetPassword = async (req, res) => {
    try {
        if (!req.session.resetEmail) {
            return res.redirect("/forgot-password");
        }
        res.render("reset-password", { email: req.session.resetEmail, message: null });
    } catch (error) {
        console.error("Reset password page error:", error);
        res.redirect("/pageNotFound");
    }
};

const resetPassword = async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;
        const email = req.session.resetEmail;

        if (!email) {
            return res.redirect("/forgot-password");
        }

        if (password !== confirmPassword) {
            return res.render("reset-password", { email, message: "Passwords do not match" });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.render("forgot-password", { message: "User not found" });
        }

        user.password = await securePassword(password);
        user.resetOtp = undefined;
        user.resetOtpExpiry = undefined;
        await user.save();

        delete req.session.resetEmail;
        delete req.session.resetOtp;

        res.render("login", { message: "Password reset successfully. Please login." });
    } catch (error) {
        console.error("Reset password error:", error);
        res.render("reset-password", { email: req.session.resetEmail, message: "An error occurred. Please try again." });
    }
};

const logout = async (req, res) => {
    try {
        req.session.destroy(() => {
            res.redirect('/');
        });
    } catch (error) {
        console.log(error);
        res.redirect("/pageNotFound");
    }
};



module.exports = {

    pageNotFound,
    loadSignup,
    loadLogin,
    signup,
    verifyOTP,
    resendOtp,
    login,
    loadForgotPassword,
    forgotPassword,
    loadVerifyResetOtp,
    verifyResetOtp,
    resendResetOtp,
    loadResetPassword,
    resetPassword,
    logout,
    
};