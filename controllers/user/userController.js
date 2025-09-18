const User = require("../../models/userSchema");
const Product = require('../../models/productSchema');
const env = require("dotenv").config();
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");
const Category = require('../../models/categorySchema');
const Wallet = require('../../models/walletShema');

const pageNotFound = async (req, res) => {
    try {
        res.render("pageNotFound");
    } catch (error) {
        res.redirect("/pageNotFound");
    }
};

function generateReferralCode(name) {
    const prefix = name.slice(0, 3).toUpperCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return prefix + randomNum;
}

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
        const { name, phone, email, password, confirmPassword, referralCode } = req.body;

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
        req.session.userData = { name, phone, email, password, referralCode };

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

        if (otp === req.session.userOtp) {
            const user = req.session.userData;
            if (!user) {
                return res.status(400).json({
                    success: false,
                    message: "User session expired, please signup again",
                });
            }

            let newReferralCode;
            let codeExists = true;
            while (codeExists) {
                newReferralCode = generateReferralCode(user.name);
                codeExists = await User.findOne({ referralCode: newReferralCode });
            }

            const passwordHash = await securePassword(user.password);

            let newUserWallet = await Wallet.findOne({ userId: null }); 
            if (!newUserWallet) {
                newUserWallet = new Wallet({ userId: null, balance: 0, transactions: [] });
            }

            const newUser = new User({
                name: user.name,
                email: user.email,
                phone: user.phone,
                password: passwordHash,
                referralCode: newReferralCode,
                referredBy: user.referralCode || null,
                walletBalance: 0,
            });

            if (user.referralCode) {
                const referrer = await User.findOne({ referralCode: user.referralCode });
                if (referrer) {
                    let referrerWallet = await Wallet.findOne({ userId: referrer._id });
                    if (!referrerWallet) {
                        referrerWallet = new Wallet({ userId: referrer._id, balance: 0, transactions: [] });
                        await referrerWallet.save();
                    }
                    referrerWallet.balance += 100;
                    referrerWallet.transactions.push({
                        type: "credit",
                        amount: 100,
                        description: "Referral bonus for new user signup",
                        balanceAfter: referrerWallet.balance,
                        source: "bonus",
                        metadata: { referredEmail: user.email }
                    });
                    await referrerWallet.save();
                    referrer.walletBalance = referrerWallet.balance;
                    await referrer.save();
                }
            }

            newUserWallet.userId = newUser._id;
            newUserWallet.balance = user.referralCode ? 50 : 0;
            newUserWallet.transactions.push({
                type: "credit",
                amount: user.referralCode ? 50 : 0,
                description: "Welcome bonus" + (user.referralCode ? " + Referral bonus" : ""),
                balanceAfter: newUserWallet.balance,
                source: "bonus",
                metadata: { referredBy: user.referralCode || "None" }
            });
            await newUserWallet.save();
            newUser.walletBalance = newUserWallet.balance;

            await newUser.save();

            req.session.userOtp = null;
            req.session.userData = null;
            req.session.user = newUser
            return res.status(200).json({
                success: true,
                message: "OTP verified successfully",
                redirectUrl: "/",
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

        if (!user || otp !== req.session.resetOtp) {
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
       delete req.session.user;
       res.redirect('/');
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
    sendVerificationEmail
};