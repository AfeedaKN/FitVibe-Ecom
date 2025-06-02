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
            .limit(limit)
            .skip((page - 1) * limit)
            .exec();

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

        res.redirect("/admin/users"); 
    } catch (error) {
        console.error("Block customer error:", error);
        res.redirect("/admin/users"); 
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
        res.redirect("/admin/users");
    } catch (error) {
        console.error("Unblock customer error:", error);
        res.redirect("/admin/users");
    }
};


module.exports={
    customerInfo,
    blockCustomer,
    unblockCustomer,

}