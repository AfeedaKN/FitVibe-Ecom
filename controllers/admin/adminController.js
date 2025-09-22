const User = require("../../models/userSchema")
const Order = require("../../models/orderSchema")
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
        const [totalUsers, totalOrdersAgg, totalRevenueAgg, totalProducts] = await Promise.all([
            User.countDocuments({ isAdmin: false }),
            Order.countDocuments({ orderStatus: { $nin: ['payment-failed'] } }),
            Order.aggregate([
                { $match: { orderStatus: { $nin: ['cancelled', 'payment-failed'] } } },
                { $group: { _id: null, sum: { $sum: '$finalAmount' } } }
            ]),
            require("../../models/productSchema").countDocuments({ isDeleted: false })
        ]);

        const totalRevenue = totalRevenueAgg && totalRevenueAgg.length ? totalRevenueAgg[0].sum : 0;

        
        const trackedStatuses = ['pending', 'processing', 'shipped', 'delivered'];
        const statusAggregation = await Order.aggregate([
            { $match: { orderStatus: { $in: trackedStatuses } } },
            { $group: { _id: '$orderStatus', count: { $sum: 1 } } }
        ]);
        const statusCounts = trackedStatuses.reduce((acc, s) => (acc[s] = 0, acc), {});
        statusAggregation.forEach(a => { statusCounts[a._id] = a.count; });
        const totalForProgress = trackedStatuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0);
        const statusPercents = trackedStatuses.reduce((acc, s) => (acc[s] = totalForProgress ? Math.round((statusCounts[s] || 0) * 100 / totalForProgress) : 0, acc), {});

        
        const recentOrders = await Order.find({})
            .populate('user')
            .sort({ createdAt: -1 })
            .limit(3)
            .lean();

        
        const topProductsAgg = await Order.aggregate([
            { $match: { orderStatus: { $nin: ['cancelled', 'payment-failed'] } } },
            { $unwind: '$products' },
            { $group: {
                _id: '$products.product',
                quantity: { $sum: '$products.quantity' },
                revenue: { $sum: { $multiply: ['$products.variant.salePrice', '$products.quantity'] } }
            }},
            { $sort: { revenue: -1 } },
            { $limit: 4 },
            { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
            { $unwind: '$product' },
            { $project: { _id: 0, name: '$product.name', quantity: 1, revenue: 1 } }
        ]);

        res.render("admin-dashboard", {
            admin: req.session.admin,
            totalUsers,
            totalOrders: totalOrdersAgg,
            totalRevenue,
            totalProducts,
            statusCounts,
            statusPercents,
            recentOrders,
            topProducts: topProductsAgg,
            message: null
        });
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





const getDashboardChartData = async (req, res) => {
    try {
        const period = (req.query.period || 'daily').toLowerCase();
        const now = new Date();
        let startDate = new Date();
        let format = '%Y-%m-%d';
        let buckets = [];

        if (period === 'yearly') {
            const startYear = now.getFullYear() - 4; 
            startDate = new Date(startYear, 0, 1);
            format = '%Y';
            for (let y = 0; y < 5; y++) {
                buckets.push((startYear + y).toString());
            }
        } else if (period === 'monthly') {
            const start = new Date(now.getFullYear(), now.getMonth() - 11, 1); 
            startDate = start;
            format = '%Y-%m';
            const d = new Date(start);
            for (let i = 0; i < 12; i++) {
                const y = d.getFullYear();
                const m = (d.getMonth() + 1).toString().padStart(2, '0');
                buckets.push(`${y}-${m}`);
                d.setMonth(d.getMonth() + 1);
            }
        } else {
            
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 6);
            format = '%Y-%m-%d';
            const d = new Date(startDate);
            for (let i = 0; i < 7; i++) {
                const y = d.getFullYear();
                const m = (d.getMonth() + 1).toString().padStart(2, '0');
                const day = d.getDate().toString().padStart(2, '0');
                buckets.push(`${y}-${m}-${day}`);
                d.setDate(d.getDate() + 1);
            }
        }

        const pipeline = [
            {
                $match: {
                    createdAt: { $gte: startDate, $lte: now },
                    orderStatus: { $nin: ['cancelled', 'payment-failed'] },
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format, date: '$createdAt' } },
                    totalSales: { $sum: '$finalAmount' },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ];

        const agg = await Order.aggregate(pipeline);
        const map = new Map(agg.map(a => [a._id, a.totalSales]));

        const labels = buckets;
        const data = buckets.map(key => Number((map.get(key) || 0).toFixed(2)));

        return res.json({ success: true, labels, data, period });
    } catch (error) {
        console.error('Dashboard chart data error:', error);
        return res.status(500).json({ success: false, message: 'Failed to load chart data' });
    }
};

module.exports = {
    loadAdminLogin,
    adminLogin,
    loadAdminDashboard,
    adminLogout,
    getDashboardChartData,
};