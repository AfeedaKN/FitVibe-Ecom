const User = require("../../models/userSchema")
const Order = require("../../models/orderSchema");
const { sendVerificationEmail } = require("../../controllers/user/userController");
const Coupon=require("../../models/couponSchema")


function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const loadUserProfile = async (req, res) => {
  try {  
    const userId = req.session.user._id;
    

    const user = await User.findById(userId).populate("addresses");
    if (!user) {
      return res.status(404).render("pageNotFound", { message: "User not found" });
    }

    const addresses = user.addresses || [];
    const defaultAddress = addresses.find(addr => addr.isDefault) || null;

    const orders = await Order.find({ user: userId })
      .populate("products.product")
      .populate("address")
      .sort({ createdAt: -1 });

  

    res.render("profile", {
      user,
      defaultAddress,
      orders,
    });
  } catch (error) {
    console.error("Error loading user profile:", error);
    res.status(500).render("pageNotFound", { message: "Error loading profile" });
  }
};

const getOrders = async (req, res) => {
  try {
    const limit = 5;
    const page = parseInt(req.query.page) || 1;
    const query = req.query.search || '';

    
    let dateFilter = {};
    if (!isNaN(Date.parse(query))) {
      const date = new Date(query);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);
      dateFilter = {
        orderDate: {
          $gte: date,
          $lt: nextDay
        }
      };
    }

    
    const searchFilter = {
      user: req.user._id,
      $or: [
        { orderID: { $regex: query, $options: 'i' } },
        { orderStatus: { $regex: query, $options: 'i' } }
      ],
      ...dateFilter
    };

    
    const totalOrders = await Order.countDocuments(searchFilter);
    const totalPages = Math.ceil(totalOrders / limit);

    
    const user = await User.findById(req.user._id);

    
    const orders = await Order.find(searchFilter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('products.product')
      .lean();

    res.render("orders", {
      user,
      orders,
      totalPages,
      currentPage: page,
      query: req.query.search || "",
      messages: req.flash(),

    });

  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
};

const getOrderDetail = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const orderId = req.params.id;

    
    const order = await Order.findOne({ _id: orderId, user: userId })
      .populate("products.product")  
      .populate("address")           
      .populate("user");

    

    if (!order) {
      return res.status(404).render("pageNotFound", { message: "Order not found" });
    }
    

    res.render("order-details", { order });
  } catch (error) {
    console.error("Error loading order detail:", error);
    res.status(500).render("pageNotFound", { message: "Error loading order details" });
  }
};

const loadEditProfile = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).render("pageNotFound", { message: "User not found" });
    }
    res.render("edit-profile", { user ,messages: { error: "Some error message" } });
  } catch (error) {
    console.error("Error loading edit profile page:", error);
    res.status(500).render("pageNotFound", { message: "Error loading edit profile" });
  }
};

const sendProfileOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const userId = req.session.user._id;

    const existingUser = await User.findOne({ email, _id: { $ne: userId } });
    if (existingUser) {
      return res.json({ success: false, message: "Email is already in use by another account" });
    }

    const otp = generateOtp();
    
    req.session.profileOtp = otp;
    req.session.newEmail = email;
    req.session.otpExpiry = Date.now() + 600000; 

    const emailSent = await sendVerificationEmail(
      email,
      "Email Verification for Profile Update",
      `Your OTP for email verification is ${otp}. This OTP will expire in 10 minutes.`
    );

    if (!emailSent) {
      return res.json({ success: false, message: "Failed to send OTP. Please try again." });
    }

    console.log("Profile OTP sent:", otp);
    res.json({ success: true, message: "OTP sent to your new email address" });
  } catch (error) {
    console.error("Error sending profile OTP:", error);
    res.json({ success: false, message: "Error sending OTP. Please try again." });
  }
};

const loadProfileOtpVerification = async (req, res) => {
  try {
    if (!req.session.profileOtp || !req.session.newEmail) {
      return res.redirect('/profile/edit');
    }
    
    res.render("verify-profile-otp", { 
      email: req.session.newEmail,
      message: null 
    });
  } catch (error) {
    console.error("Error loading profile OTP verification page:", error);
    res.redirect('/profile/edit');
  }
};

const verifyProfileOtp = async (req, res) => {
  try {
    const { otp } = req.body;

    if (!otp) {
      return res.json({ success: false, message: "OTP is required" });
    }

    if (!req.session.profileOtp || !req.session.newEmail) {
      return res.json({ success: false, message: "OTP session expired. Please try again." });
    }

    if (Date.now() > req.session.otpExpiry) {
      return res.json({ success: false, message: "OTP has expired. Please request a new one." });
    }

    if (otp !== req.session.profileOtp) {
      return res.json({ success: false, message: "Invalid OTP. Please try again." });
    }

    const userId = req.session.user._id;
    const newEmail = req.session.newEmail;
    
    await User.findByIdAndUpdate(userId, { email: newEmail }, { new: true });
    
    req.session.user.email = newEmail;
    
    delete req.session.profileOtp;
    delete req.session.otpExpiry;
    delete req.session.newEmail;

    res.json({ 
      success: true, 
      message: "Email verified and updated successfully",
      redirectUrl: "/profile/edit?emailUpdated=true"
    });
  } catch (error) {
    console.error("Error verifying profile OTP:", error);
    res.json({ success: false, message: "Error verifying OTP. Please try again." });
  }
};

const resendProfileOtp = async (req, res) => {
  try {
    if (!req.session.newEmail) {
      return res.json({ success: false, message: "No email verification in progress" });
    }

    const otp = generateOtp();
    
    req.session.profileOtp = otp;
    req.session.otpExpiry = Date.now() + 600000; 

    const emailSent = await sendVerificationEmail(
      req.session.newEmail,
      "Email Verification for Profile Update",
      `Your new OTP for email verification is ${otp}. This OTP will expire in 10 minutes.`
    );

    if (!emailSent) {
      return res.json({ success: false, message: "Failed to resend OTP. Please try again." });
    }

    console.log("Profile OTP resent:", otp);
    res.json({ success: true, message: "OTP resent successfully" });
  } catch (error) {
    console.error("Error resending profile OTP:", error);
    res.json({ success: false, message: "Error resending OTP. Please try again." });
  }
};

const updateProfile = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { name, email, phone } = req.body;
    
    const currentUser = await User.findById(userId);
    if (!currentUser) {
      return res.json({ success: false, message: "User not found" });
    }

    let updateData = { name, phone };

    updateData.email = email;

    if (req.file) {
      const imagePath = "/uploads/profile/" + req.file.filename;
      updateData.profileImage = imagePath;

      if (currentUser.profileImage && require('fs').existsSync("public" + currentUser.profileImage)) {
        require('fs').unlinkSync("public" + currentUser.profileImage);
      }
    }

    await User.findByIdAndUpdate(userId, updateData, { new: true });
    
    req.session.user = { ...req.session.user, ...updateData };

    return res.json({ success: true, message: "Profile updated successfully" });
  } catch (error) {
    console.error(" Error updating profile:", error);
    return res.json({ success: false, message: "Profile update failed" });
  }
};

const getChangePasswordPage = async (req, res) => {
  try {
    const userId = req.session.user._id; 
    console.log("req.user in change-password:", req.user);

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).send("User not found");
    }

    res.render("change-password", { user }); 
  } catch (error) {
    console.log("Change Password Page Error:", error.message);
    res.status(500).send("Server Error");
  }
};

const bcrypt = require('bcrypt');

const postChangePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { currentPassword, newPassword, confirmPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: "Current password is incorrect." });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match." });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    return res.status(200).json({ success: true, message: "Password changed successfully." });

  } catch (error) {
    console.error("Error changing password:", error);
    return res.status(500).json({ success: false, message: "Server error while changing password." });
  }
};


const loadcoupon = async (req, res) => {
  try {
    const searchQuery = (req.query.search || "").trim();
    const filterStatus = req.query.status || "";
    const page = parseInt(req.query.page, 10) || 1;
    const limit = 6;

    let filter = { isDeleted: false };

    if (searchQuery) {
      filter.$or = [
        { name: { $regex: searchQuery, $options: "i" } },
        { description: { $regex: searchQuery, $options: "i" } }
      ];
    }

    if (filterStatus) {
      filter.isActive = filterStatus === "active" ? true : false;
    }

    const totalCoupons = await Coupon.countDocuments(filter);
    const totalPages = Math.max(Math.ceil(totalCoupons / limit), 1);

    const coupons = await Coupon.find(filter)
      .sort({ createdOn: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.render("couponlisting", {
      coupons,
      query: searchQuery,
      filterStatus,
      totalPages,
      currentPage: page,
      messages: req.flash ? req.flash() : {}
    });
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
};

const loadrefferalcode = async (req, res) => {
  try {
    if (!req.session.user) {
      return res.redirect("/login");
    }

    const user = await User.findById(req.session.user._id);
    if (!user) {
      return res.redirect("/login");
    }

    
    const totalReferrals = await User.countDocuments({ referredBy: user.referralCode });

    const successfulReferrals = await User.countDocuments({
      referredBy: user.referralCode,
      hasMadePurchase: true
    });

    const rewardPerReferral = 100;
    const earnedRewards = successfulReferrals * rewardPerReferral;

    res.render("refferalcode", {
      referralCode: user.referralCode || "Not generated yet",
      totalReferrals,
      successfulReferrals,
      earnedRewards
    });

  } catch (error) {
    console.error("Error loading referral code:", error);
    res.redirect("/error");
  }
};






module.exports = {
  loadUserProfile,
  getOrders,
  getOrderDetail,
  loadEditProfile,
  updateProfile,
  sendProfileOtp,
  loadProfileOtpVerification,
  verifyProfileOtp,
  resendProfileOtp,
  getChangePasswordPage,
  postChangePassword,
  loadcoupon,
  loadrefferalcode
};