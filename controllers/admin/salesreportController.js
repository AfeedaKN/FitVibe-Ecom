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
                case 'daily':
                    query.createdAt = { $gte: today, $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) };
                    break;
                case 'weekly':
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - today.getDay());
                    query.createdAt = { $gte: weekStart, $lte: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1) };
                    break;
                case 'monthly':
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    query.createdAt = { $gte: monthStart, $lte: new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59) };
                    break;
                case 'yearly':
                    const yearStart = new Date(today.getFullYear(), 0, 1);
                    query.createdAt = { $gte: yearStart, $lte: new Date(today.getFullYear(), 11, 31, 23, 59, 59) };
                    break;
                case 'custom':
                    if (startDate && endDate) {
                        query.createdAt = {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate + "T23:59:59")
                        };
                    }
                    break;
            }
        }

        if (status) {
            if (status === "completed") query.orderStatus = "delivered";
            else if (status === "cancelled") query.orderStatus = "cancelled";
            else if (status === "refunded") {
                query.orderStatus = { $in: ["delivered", "cancelled"] }; 
            }
        }

        let allFilteredOrders = await Order.find(query)
            .populate("products.product")
            .populate("user");

        if (status === "refunded") {
            allFilteredOrders = allFilteredOrders
                .map(order => {
                    order.products = order.products.filter(p => p.status === "returned");
                    return order;
                })
                .filter(order => order.products.length > 0);
        }

        const totalSales = allFilteredOrders.reduce((sum, o) => sum + (o.finalAmount || 0), 0);
        const totalOrders = allFilteredOrders.length;
        const completedOrders = allFilteredOrders.filter(o => o.orderStatus === "delivered").length;
        const cancelledOrders = allFilteredOrders.filter(o => o.orderStatus === "cancelled").length;
        const totalRefunds = allFilteredOrders.reduce((sum, o) => sum + (o.refundAmount || 0), 0);
        const totalDiscount = allFilteredOrders.reduce((sum, o) => sum + (o.discountAmount || 0) + (o.couponDiscount || 0), 0);

        const totalPages = Math.ceil(totalOrders / limit);
        const salesData = allFilteredOrders
            .sort((a, b) => b.createdAt - a.createdAt)
            .slice(skip, skip + limit);

        res.render("salesreport", {
            period: period || "",
            startDate: startDate || "",
            endDate: endDate || "",
            filterStatus: status || "",
            totalSales,
            totalOrders,
            completedOrders,
            cancelledOrders,
            totalRefunds,
            totalDiscount,
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

const exportSalesReport = async (req, res) => {
    try {
        const { startDate, endDate, status, period, format } = req.query;
        let query = {};

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (period) {
            switch (period) {
                case 'daily':
                    query.createdAt = { $gte: today, $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) };
                    break;
                case 'weekly':
                    const weekStart = new Date(today);
                    weekStart.setDate(today.getDate() - today.getDay());
                    query.createdAt = { $gte: weekStart, $lte: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1) };
                    break;
                case 'monthly':
                    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
                    query.createdAt = { $gte: monthStart, $lte: new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59) };
                    break;
                case 'yearly':
                    const yearStart = new Date(today.getFullYear(), 0, 1);
                    query.createdAt = { $gte: yearStart, $lte: new Date(today.getFullYear(), 11, 31, 23, 59, 59) };
                    break;
                case 'custom':
                    if (startDate && endDate) {
                        query.createdAt = {
                            $gte: new Date(startDate),
                            $lte: new Date(endDate + "T23:59:59")
                        };
                    }
                    break;
            }
        }

        if (status) {
            if (status === "completed") query.orderStatus = "delivered";
            else if (status === "cancelled") query.orderStatus = "cancelled";
            else if (status === "refunded") {
                query.orderStatus = { $in: ["delivered", "cancelled"] };
            }
        }

        let allFilteredOrders = await Order.find(query)
            .populate("products.product")
            .populate("user");

        if (status === "refunded") {
            allFilteredOrders = allFilteredOrders
                .map(order => {
                    order.products = order.products.filter(p => p.status === "returned");
                    return order;
                })
                .filter(order => order.products.length > 0);
        }

        if (format === 'pdf') {
            const htmlContent = `
                <h1>Sales Report - FitVibe Admin</h1>
                <p>Period: ${period || 'All Time'} ${startDate && endDate ? `(${startDate} to ${endDate})` : ''}</p>
                <p>Status: ${status || 'All'}</p>
                <table border="1" cellpadding="5" cellspacing="0">
                    <thead>
                        <tr>
                            <th>Order ID</th>
                            <th>Date</th>
                            <th>Customer</th>
                            <th>Total Amount</th>
                            <th>Discount</th>
                            <th>Coupon Deduction</th>
                            <th>Payment Method</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${allFilteredOrders.map(order => `
                            <tr>
                                <td>${order.orderID}</td>
                                <td>${new Date(order.createdAt).toLocaleDateString('en-IN')}</td>
                                <td>${order.user?.name || 'Unknown'}</td>
                                <td>₹${order.finalAmount.toLocaleString('en-IN')}</td>
                                <td>₹${(order.discountAmount || 0).toLocaleString('en-IN')}</td>
                                <td>₹${(order.couponDiscount || 0).toLocaleString('en-IN')}</td>
                                <td>${order.paymentMethod}</td>
                                <td>${order.orderStatus}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p>Total Sales: ₹${allFilteredOrders.reduce((sum, o) => sum + (o.finalAmount || 0), 0).toLocaleString('en-IN')}</p>
                <p>Total Orders: ${allFilteredOrders.length}</p>
                <p>Total Discount: ₹${allFilteredOrders.reduce((sum, o) => sum + (o.discountAmount || 0) + (o.couponDiscount || 0), 0).toLocaleString('en-IN')}</p>
            `;

            const pdfPath = path.join(__dirname, '../../public/reports/sales-report.pdf');
            pdf.create(htmlContent, { format: 'A4' }).toFile(pdfPath, (err) => {
                if (err) throw err;
                res.download(pdfPath, 'sales-report.pdf', () => {
                    fs.unlinkSync(pdfPath); 
                });
            });
        } else if (format === 'excel') {
            const workbook = new excel.Workbook();
            const worksheet = workbook.addWorksheet('Sales Report');

            worksheet.columns = [
                { header: 'Order ID', key: 'orderID', width: 15 },
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Customer', key: 'customer', width: 20 },
                { header: 'Total Amount', key: 'totalAmount', width: 15 },
                { header: 'Discount', key: 'discount', width: 15 },
                { header: 'Coupon Deduction', key: 'couponDeduction', width: 15 },
                { header: 'Payment Method', key: 'paymentMethod', width: 15 },
                { header: 'Status', key: 'status', width: 15 }
            ];

            allFilteredOrders.forEach(order => {
                worksheet.addRow({
                    orderID: order.orderID,
                    date: new Date(order.createdAt).toLocaleDateString('en-IN'),
                    customer: order.user?.name || 'Unknown',
                    totalAmount: order.finalAmount,
                    discount: order.discountAmount || 0,
                    couponDeduction: order.couponDiscount || 0,
                    paymentMethod: order.paymentMethod,
                    status: order.orderStatus
                });
            });

            worksheet.addRow({});
            worksheet.addRow({ customer: 'Total Sales', totalAmount: allFilteredOrders.reduce((sum, o) => sum + (o.finalAmount || 0), 0) });
            worksheet.addRow({ customer: 'Total Orders', totalAmount: allFilteredOrders.length });
            worksheet.addRow({ customer: 'Total Discount', totalAmount: allFilteredOrders.reduce((sum, o) => sum + (o.discountAmount || 0) + (o.couponDiscount || 0), 0) });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=sales-report.xlsx');
            await workbook.xlsx.write(res);
            res.end();
        } else {
            res.status(400).send('Invalid export format');
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