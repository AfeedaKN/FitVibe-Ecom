const User = require("../../models/userSchema")
const Order = require("../../models/orderSchema");



const loadUserProfile = async (req, res) => {
  try {  
    const userId = req.session.user._id;
    console.log("Loading user profile for ID:", userId);

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

    console.log("User orders:", orders.length);

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




    console.log("Order Details:", order);

    if (!order) {
      return res.status(404).render("pageNotFound", { message: "Order not found" });
    }
    console.log("Populated Address:", order.address);

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

const updateProfile = async (req, res) => {
  try {
    const userId = req.session.user._id;
    const { name, email, phone } = req.body;

    let updateData = { name, email, phone };

    if (req.file) {
      const imagePath = "/uploads/profile/" + req.file.filename;
      updateData.profileImage = imagePath;

      
      const user = await User.findById(userId);
      if (user.profileImage && fs.existsSync("public" + user.profileImage)) {
        fs.unlinkSync("public" + user.profileImage);
      }
    }

    await User.findByIdAndUpdate(userId, updateData, { new: true });

    return res.json({ success: true });
  } catch (error) {
    console.error("🔥 Error updating profile:", error);
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




module.exports = {
  loadUserProfile,
  getOrders,
  getOrderDetail,
  loadEditProfile,
  updateProfile,
  getChangePasswordPage,
  postChangePassword,
};

