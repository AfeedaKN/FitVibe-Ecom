const User = require("../../models/userSchema");

const customerInfo = async (req, res) => {
    try {
        const search = req.query.search || "";
        const page = parseInt(req.query.page) || 1;
        const limit = 3;

        const query = {
            isAdmin: false,
            $or: [
                { name: { $regex: ".*" + search + ".*", $options: "i" } },
                { email: { $regex: ".*" + search + ".*", $options: "i" } },
            ],
        };

        const userData = await User.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .skip((page - 1) * limit)
            .exec()
            

        const count = await User.countDocuments(query);
        const totalPages = Math.ceil(count / limit);

        res.render("customers", {
            pageTitle: 'Customers',
            adminName: req.session.admin.name,
            data: userData, 
            totalPages,
            currentPage: page,
            search
        });
    } catch (error) {
        console.error("Error in customerInfo:", error);
        res.status(500).send("Something went wrong");
    }
};


const blockCustomer = async (req, res) => {
    try {
        const userId = req.query.id;

        if (!userId) {
            return res.redirect("/admin/users"); 
        }

        const user = await User.findById(userId);

        if (!user || user.isAdmin) {
            return res.redirect("/admin/users");
        }

        user.isBlocked = true;
        await user.save();

        const wantsJson = (req.get('accept') || '').includes('application/json') || req.xhr || req.get('x-requested-with') === 'XMLHttpRequest';
        if (wantsJson) {
            return res.json({ success: true, message: 'Customer blocked successfully' });
        }
        return res.redirect("/admin/users"); 
    } catch (error) {
        console.error("Block customer error:", error);
        const wantsJson = (req.get('accept') || '').includes('application/json') || req.xhr || req.get('x-requested-with') === 'XMLHttpRequest';
        if (wantsJson) {
            return res.status(500).json({ success: false, message: 'Server error while blocking customer' });
        }
        return res.redirect("/admin/users"); 
    }
};


const unblockCustomer = async (req, res) => {
    try {
        const userId = req.query.id;
        if (!userId) {
            return res.redirect("/admin/users");
        }
        const user = await User.findById(userId);
        if (!user || user.isAdmin) {
            return res.redirect("/admin/users");
        }
        user.isBlocked = false;
        await user.save();

        const wantsJson = (req.get('accept') || '').includes('application/json') || req.xhr || req.get('x-requested-with') === 'XMLHttpRequest';
        if (wantsJson) {
            return res.json({ success: true, message: 'Customer unblocked successfully' });
        }
        return res.redirect("/admin/users");
    } catch (error) {
        console.error("Unblock customer error:", error);
        const wantsJson = (req.get('accept') || '').includes('application/json') || req.xhr || req.get('x-requested-with') === 'XMLHttpRequest';
        if (wantsJson) {
            return res.status(500).json({ success: false, message: 'Server error while unblocking customer' });
        }
        return res.redirect("/admin/users");
    }
};


const customerDetails = async (req, res) => {
    try {
        const userId = req.query.id;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const user = await User.findById(userId).lean();
        if (!user || user.isAdmin) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        return res.json({
            success: true,
            data: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone || '',
                isBlocked: !!user.isBlocked,
                createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : null,
                updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : null
            }
        });
    } catch (error) {
        console.error('Customer details error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching customer details' });
    }
};

module.exports={
    customerInfo,
    blockCustomer,
    unblockCustomer,
    customerDetails,
}