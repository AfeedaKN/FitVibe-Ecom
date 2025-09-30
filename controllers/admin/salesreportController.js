const Order = require("../../models/orderSchema");
const fs = require('fs');
const path = require('path');
const pdf = require('html-pdf');
const excel = require('exceljs');

const salesreport = async (req, res) => {
    try {
        const { startDate, endDate, status, period } = req.query;
        const page = parseInt(req.query.page) || 1;                     
        const limit = 10;
        const skip = (page - 1) * limit;

        let query = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (period) {
            switch (period) {
                case "daily":
                    query.createdAt = {
                        $gte: today,
                        $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
                    };
                    break;
                case "weekly":
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - today.getDay());
                    query.createdAt = {
                        $gte: weekStart,
                        $lte: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1),
                    };
                    break;
                case "monthly":
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    query.createdAt = {
                        $gte: monthStart,
                        $lte: new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59),
                    };
                    break;
                case "yearly":
                    const yearStart = new Date(today.getFullYear(), 0, 1);
                    query.createdAt = {
                        $gte: yearStart,
                        $lte: new Date(today.getFullYear(), 11, 31, 23, 59, 59),
                    };
                    break;
                case "custom":
                    if (startDate && endDate) {
                        query.createdAt = {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate + "T23:59:59"),
                        };
                    }
                    break;
            }
        }

        if (status) {
            if (status === "delivered") query["products.status"] = "delivered";
            else if (status === "cancelled") query["products.status"] = "cancelled";
            else if (status === "returned") query["products.status"] = "returned";
        }

        let allFilteredOrders = await Order.find(query)
    .populate({
        path: "products.product",
        select: "name"  
    })
    .populate("user")
    .lean();


        
        if (status) {
                    allFilteredOrders = allFilteredOrders.map(order => {
            const obj = order
            obj.products = Array.isArray(obj.products) ? obj.products : [];
            if (status) {
                obj.products = obj.products.filter(p => p.status === status);
            }
            return obj;
        }).filter(order => order.products.length > 0);
        }

        
        let totalSales = 0;
        let totalProducts = 0;
        let deliveredProducts = 0;
        let cancelledProducts = 0;
        let returnedProducts = 0;
        let totalDiscount = 0;
        let totalRefunds = 0;

        allFilteredOrders.forEach((order) => {
            order.products.forEach((product) => {
                const productAmount = (product.variant.salePrice || product.variant.varientPrice) * product.quantity;
                const couponDeductionPerProduct = order.couponDiscount ? order.couponDiscount / order.products.length : 0;

                totalProducts++;
                if (product.status === "delivered") {
                    totalSales += productAmount - couponDeductionPerProduct;
                    deliveredProducts++;
                } else if (product.status === "cancelled") {
                    cancelledProducts++;
                } else if (product.status === "returned") {
                    totalSales -= productAmount - couponDeductionPerProduct; 
                    returnedProducts++;
                    totalRefunds += product.refundAmount || 0;
                }
                totalDiscount += (order.discountAmount || 0) / order.products.length + couponDeductionPerProduct;
            });
        });




        
        const allProducts = allFilteredOrders.flatMap((order) => order.products.map(p => ({ ...p, order })));
        const totalPages = Math.ceil(allProducts.length / limit);
                        const salesData = allFilteredOrders
                .flatMap(order =>
                    order.products.map(p => ({
                    ...p,            
                    productData: p.product,   
                    order
                    }))
                )
                .sort((a, b) => new Date(b.order.createdAt) - new Date(a.order.createdAt))
                .slice(skip, skip + limit);



        res.render("salesreport", {
            period: period || "",
            startDate: startDate || "",
            endDate: endDate || "",
            filterStatus: status || "",
            totalSales: Math.max(totalSales, 0), 
            totalOrders: totalProducts,
            deliveredProducts,
            cancelledProducts,
            returnedProducts,
            totalRefunds,
            totalDiscount,
            salesData,
            currentPage: page,
            totalPages,
            messages: req.flash ? req.flash() : {},
        });
    } catch (error) {
        console.log(error);
        res.status(500).send("Server Error");
    }
};



const exportSalesReport = async (req, res) => {
    try {
        const { startDate, endDate, status, period, format } = req.query;
        let query = {};

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (period) {
            switch (period) {
                case "daily":
                    query.createdAt = {
                        $gte: today,
                        $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1),
                    };
                    break;
                case "weekly":
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - today.getDay());
                    query.createdAt = {
                        $gte: weekStart,
                        $lte: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1),
                    };
                    break;
                case "monthly":
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    query.createdAt = {
                        $gte: monthStart,
                        $lte: new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59),
                    };
                    break;
                case "yearly":
                    const yearStart = new Date(today.getFullYear(), 0, 1);
                    query.createdAt = {
                        $gte: yearStart,
                        $lte: new Date(today.getFullYear(), 11, 31, 23, 59, 59),
                    };
                    break;
                case "custom":
                    if (startDate && endDate) {
                        query.createdAt = {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate + "T23:59:59"),
                        };
                    }
                    break;
            }
        }

        if (status) {
            if (status === "delivered") query["products.status"] = "delivered";
            else if (status === "cancelled") query["products.status"] = "cancelled";
            else if (status === "returned") query["products.status"] = "returned";
        }

        let allFilteredOrders = await Order.find(query)
            .populate("products.product")
            .populate("user");

        if (status) {
            allFilteredOrders = allFilteredOrders.map((order) => ({
                ...order.toObject(),
                products: order.products.filter((p) => !status || p.status === status),
            })).filter((order) => order.products.length > 0);
        }

        if (format === "pdf") {
            const htmlContent = `
                <h1>Sales Report - FitVibe Admin</h1>
                <p>Period: ${period || "All Time"} ${
                startDate && endDate ? `(${startDate} to ${endDate})` : ""
            }</p>
                <p>Status: ${status || "All"}</p>
                <table border="1" cellpadding="5" cellspacing="0">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Product Name</th>
                            <th>Variant</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Amount</th>
                            <th>Coupon Deduction</th>
                            <th>Payment Method</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${allFilteredOrders
                            .flatMap((order) =>
                                order.products.map((product) => `
                                    <tr>
                                        <td>${order.orderID}</td>
                                        <td>${product.product?.name || "Unknown"}</td>
                                        <td>${product.variant.size}</td>
                                        <td>${new Date(order.createdAt).toLocaleDateString("en-IN")}</td>
                                        <td>${order.user?.name || "Unknown"}</td>
                                        <td>₹${(
                                            (product.variant.salePrice || product.variant.varientPrice) *
                                            product.quantity
                                        ).toLocaleString("en-IN")}</td>
                                        <td>₹${(
                                            order.couponDiscount
                                                ? order.couponDiscount / order.products.length
                                                : 0
                                        ).toLocaleString("en-IN")}</td>
                                        <td>${order.paymentMethod}</td>
                                        <td>${product.status}</td>
                                    </tr>
                                `)
                            )
                            .join("")}
                    </tbody>
                </table>
                <p>Total Sales: ₹${allFilteredOrders
                    .flatMap((order) =>
                        order.products.map(
                            (product) =>
                                (product.status === "delivered"
                                    ? (product.variant.salePrice || product.variant.varientPrice) *
                                      product.quantity
                                    : 0) -
                                (order.couponDiscount
                                    ? order.couponDiscount / order.products.length
                                    : 0)
                        )
                    )
                    .reduce((sum, amount) => sum + amount, 0)
                    .toLocaleString("en-IN")}</p>
                <p>Total Products: ${allFilteredOrders
                    .reduce((sum, order) => sum + order.products.length, 0)}</p>
                <p>Total Discount: ₹${allFilteredOrders
                    .reduce(
                        (sum, order) =>
                            sum +
                            (order.discountAmount || 0) / order.products.length +
                            (order.couponDiscount || 0) / order.products.length,
                        0
                    )
                    .toLocaleString("en-IN")}</p>
            `;

            const pdfPath = path.join(__dirname, "../../public/reports/sales-report.pdf");
            pdf.create(htmlContent, { format: "A4" }).toFile(pdfPath, (err) => {
                if (err) throw err;
                res.download(pdfPath, "sales-report.pdf", () => {
                    fs.unlinkSync(pdfPath);
                });
            });
        } else if (format === "excel") {
            const workbook = new excel.Workbook();
            const worksheet = workbook.addWorksheet("Sales Report");

            worksheet.columns = [
                { header: "Order ID", key: "orderID", width: 15 },
                { header: "Product Name", key: "productName", width: 20 },
                { header: "Variant", key: "variant", width: 15 },
                { header: "Date", key: "date", width: 15 },
                { header: "Customer", key: "customer", width: 20 },
                { header: "Amount", key: "amount", width: 15 },
                { header: "Coupon Deduction", key: "couponDeduction", width: 15 },
                { header: "Payment Method", key: "paymentMethod", width: 15 },
                { header: "Status", key: "status", width: 15 },
            ];

            allFilteredOrders.forEach((order) => {
                order.products.forEach((product) => {
                    worksheet.addRow({
                        orderID: order.orderID,
                        productName: product.product?.productName || "Unknown",
                        variant: product.variant.size,
                        date: new Date(order.createdAt).toLocaleDateString("en-IN"),
                        customer: order.user?.name || "Unknown",
                        amount:
                            (product.variant.salePrice || product.variant.varientPrice) *
                            product.quantity,
                        couponDeduction: order.couponDiscount
                            ? order.couponDiscount / order.products.length
                            : 0,
                        paymentMethod: order.paymentMethod,
                        status: product.status,
                    });
                });
            });

            worksheet.addRow({});
            worksheet.addRow({
                productName: "Total Sales",
                amount: allFilteredOrders
                    .flatMap((order) =>
                        order.products.map(
                            (product) =>
                                (product.status === "delivered"
                                    ? (product.variant.salePrice || product.variant.varientPrice) *
                                      product.quantity
                                    : 0) -
                                (order.couponDiscount
                                    ? order.couponDiscount / order.products.length
                                    : 0)
                        )
                    )
                    .reduce((sum, amount) => sum + amount, 0),
            });
            worksheet.addRow({
                productName: "Total Products",
                amount: allFilteredOrders.reduce(
                    (sum, order) => sum + order.products.length,
                    0
                ),
            });
            worksheet.addRow({
                productName: "Total Discount",
                amount: allFilteredOrders.reduce(
                    (sum, order) =>
                        sum +
                        (order.discountAmount || 0) / order.products.length +
                        (order.couponDiscount || 0) / order.products.length,
                    0
                ),
            });

            res.setHeader(
                "Content-Type",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            );
            res.setHeader("Content-Disposition", "attachment; filename=sales-report.xlsx");
            await workbook.xlsx.write(res);
            res.end();
        } else {
            res.status(400).send("Invalid export format");
        }
    } catch (error) {
        console.log(error);
        res.status(500).send("Server Error");
    }
};

module.exports = {
    salesreport,
    exportSalesReport
};