const Order = require("../../models/orderSchema");

const salesreport = async (req, res) => {
  try {
    const { startDate, endDate, status } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // Build query
    let query = {};
    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate + "T23:59:59")
      };
    }
    if (status) {
      if (status === "completed") query.orderStatus = "delivered";
      else if (status === "cancelled") query.orderStatus = "cancelled";
    }

    // Fetch ALL filtered orders for summary
    let allFilteredOrders = await Order.find(query)
    .populate("products.product")
    .populate("user");

    // If status is refunded → keep only returned products
    if (status === "refunded") {
      allFilteredOrders = allFilteredOrders
        .map(order => {
          order.products = order.products.filter(p => p.status === "returned");
          return order;
        })
        .filter(order => order.products.length > 0);
    }

    // Calculate summary stats
    const totalSales = allFilteredOrders.reduce((sum, o) => sum + (o.finalAmount || 0), 0);
    const completedOrders = allFilteredOrders.filter(o => o.orderStatus === "delivered").length;
    const cancelledOrders = allFilteredOrders.filter(o => o.orderStatus === "cancelled").length;
    const totalProductsSold = allFilteredOrders.reduce(
      (sum, o) => sum + o.products.reduce((pSum, p) => pSum + p.quantity, 0),
      0
    );
    const totalRefunds = allFilteredOrders.reduce((sum, o) => sum + (o.refundAmount || 0), 0);

    // Pagination
    const totalOrdersCount = allFilteredOrders.length;
    const totalPages = Math.ceil(totalOrdersCount / limit);
    const salesData = allFilteredOrders
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(skip, skip + limit);

    // Render view
    res.render("salesreport", {
      startDate: startDate || "",
      endDate: endDate || "",
      filterStatus: status || "",
      totalSales,
      totalOrders: totalOrdersCount,
      completedOrders,
      cancelledOrders,
      totalProductsSold,
      totalRefunds,
      salesData,
      currentPage: page,
      totalPages,
      messages: req.flash ? req.flash() : {}
    });

  } catch (error) {
    console.log(error);
    res.status(500).send("Server Error");
  }
};

module.exports = {
  salesreport
};
