/* -------------------------------------------------------------
   SALES REPORT CONTROLLERS – PDFKit version
   ------------------------------------------------------------- */
const Order = require("../../models/orderSchema");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");          // <-- NEW
const excel = require("exceljs");

/* -----------------------------------------------------------------
   Helper – builds a PDF table with PDFKit
   ----------------------------------------------------------------- */
function addTableToPDF(doc, rows, headers, startY = 120) {
  const colWidths = [80, 110, 60, 70, 90, 70, 70, 70, 60];
  const startX = 40;
  let y = startY;

  // ---- Header ----------------------------------------------------
  doc.font("Helvetica-Bold").fontSize(10);
  headers.forEach((h, i) => {
    doc.text(h, startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0), y);
  });
  y += 20;
  doc.moveTo(startX, y - 5).lineTo(570, y - 5).stroke();

  // ---- Rows -------------------------------------------------------
  doc.font("Helvetica").fontSize(9);
  rows.forEach(row => {
    row.forEach((cell, i) => {
      const x = startX + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(String(cell), x, y, { width: colWidths[i], align: "left" });
    });
    y += 18;
    if (y > 750) {               // page break
      doc.addPage();
      y = 60;
    }
  });
}

/* -----------------------------------------------------------------
   1. Render the sales-report page (unchanged)
   ----------------------------------------------------------------- */
const salesreport = async (req, res) => {
  try {
    const { startDate, endDate, status, period } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    // ----- build query (same as before) -----
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

    // ----- fetch orders -----
    let allFilteredOrders = await Order.find(query)
      .populate({ path: "products.product", select: "name" })
      .populate("user")
      .lean();

    // ----- filter by status (if any) -----
    if (status) {
      allFilteredOrders = allFilteredOrders
        .map(order => {
          const obj = { ...order };
          obj.products = Array.isArray(obj.products) ? obj.products : [];
          obj.products = obj.products.filter(p => p.status === status);
          return obj;
        })
        .filter(order => order.products.length > 0);
    }

    // ----- calculations (same as before) -----
    let totalSales = 0,
      totalProducts = 0,
      deliveredProducts = 0,
      cancelledProducts = 0,
      returnedProducts = 0,
      totalDiscount = 0,
      totalRefunds = 0;

    allFilteredOrders.forEach(order => {
      order.products.forEach(product => {
        const price = product.variant.salePrice || product.variant.varientPrice;
        const productAmount = price * product.quantity;
        const couponDeductionPerProduct = order.couponDiscount
          ? order.couponDiscount / order.products.length
          : 0;

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
        totalDiscount +=
          (order.discountAmount || 0) / order.products.length + couponDeductionPerProduct;
      });
    });

    // ----- pagination -----
    const allProducts = allFilteredOrders.flatMap(order =>
      order.products.map(p => ({ ...p, order }))
    );
    const totalPages = Math.ceil(allProducts.length / limit);
    const salesData = allFilteredOrders
      .flatMap(order =>
        order.products.map(p => ({
          ...p,
          productData: p.product,
          order,
        }))
      )
      .sort((a, b) => new Date(b.order.createdAt) - new Date(a.order.createdAt))
      .slice(skip, skip + limit);

    // ----- render page -----
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
    console.error(error);
    res.status(500).send("Server Error");
  }
};

/* -----------------------------------------------------------------
   2. Export (PDF with PDFKit / Excel unchanged)
   ----------------------------------------------------------------- */
const exportSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, status, period, format } = req.query;
    let query = {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ----- same query building as in salesreport -----
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
      .populate("user")
      .lean();

    if (status) {
      allFilteredOrders = allFilteredOrders
        .map(order => {
          const obj = { ...order };
          obj.products = obj.products.filter(p => p.status === status);
          return obj;
        })
        .filter(order => order.products.length > 0);
    }

    /* -------------------------- PDF (PDFKit) -------------------------- */
    if (format === "pdf") {
      const doc = new PDFDocument({ margin: 40, size: "A4" });
      const filePath = path.join(
        __dirname,
        "../../public/reports/sales-report.pdf"
      );

      // pipe to a file first (PDF Kit streams to file then we send it)
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // ---- Header -------------------------------------------------
      doc

        .fontSize(18)
        .font("Helvetica-Bold")
        .text("FitVibe – Sales Report", { align: "center" });
      doc.moveDown(0.5);
      doc
        .fontSize(12)
        .font("Helvetica")
        .text(
          `Period: ${period || "All Time"} ${
            startDate && endDate ? `(${startDate} – ${endDate})` : ""
          }`,
          { align: "center" }
        )
        .text(`Status: ${status || "All"}`, { align: "center" })
        .moveDown();

      // ---- Table data --------------------------------------------
      const headers = [
        "Order ID",
        "Product",
        "Size",
        "Date",
        "Customer",
        "Amount",
        "Coupon",
        "Payment",
        "Status",
      ];

      const rows = [];
      let totalDelivered = 0;

      allFilteredOrders.forEach(order => {
        order.products.forEach(p => {
          const price = p.variant.salePrice || p.variant.varientPrice;
          const amount = price * p.quantity;
          const couponPerItem = order.couponDiscount
            ? order.couponDiscount / order.products.length
            : 0;

          rows.push([
            order.orderID,
            p.product?.name || "Unknown",
            p.variant.size,
            new Date(order.createdAt).toLocaleDateString("en-IN"),
            order.user?.name || "Unknown",
            `₹${amount.toLocaleString("en-IN")}`,
            `₹${couponPerItem.toLocaleString("en-IN")}`,
            order.paymentMethod,
            p.status,
          ]);

          if (p.status === "delivered") totalDelivered += amount - couponPerItem;
        });
      });

      addTableToPDF(doc, rows, headers);

      // ---- Summary ------------------------------------------------
      doc.addPage();
      doc.fontSize(14).font("Helvetica-Bold").text("Summary", { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12).font("Helvetica");

      const summary = [
        ["Total Sales (Delivered)", `₹${totalDelivered.toLocaleString("en-IN")}`],
        ["Total Products", rows.length],
        [
          "Total Discount",
          `₹${allFilteredOrders
            .reduce(
              (s, o) =>
                s +
                (o.discountAmount || 0) / o.products.length +
                (o.couponDiscount || 0) / o.products.length,
              0
            )
            .toLocaleString("en-IN")}`,
        ],
      ];

      summary.forEach(([label, value]) => {
        doc.text(`${label}: ${value}`);
      });

      doc.end();

      // Wait for the file to be written, then send it
      stream.on("finish", () => {
        res.download(filePath, "sales-report.pdf", err => {
          if (err) console.error(err);
          fs.unlink(filePath, () => {}); // clean up
        });
      });
    }
    /* -------------------------- EXCEL (unchanged) -------------------------- */
    else if (format === "excel") {
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

      allFilteredOrders.forEach(order => {
        order.products.forEach(product => {
          worksheet.addRow({
            orderID: order.orderID,
            productName: product.product?.name || "Unknown",
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

      // ----- Summary rows -----
      const totalDelivered = allFilteredOrders
        .flatMap(order =>
          order.products
            .filter(p => p.status === "delivered")
            .map(
              p =>
                (p.variant.salePrice || p.variant.varientPrice) * p.quantity -
                (order.couponDiscount ? order.couponDiscount / order.products.length : 0)
            )
        )
        .reduce((a, b) => a + b, 0);

      worksheet.addRow({});
      worksheet.addRow({ productName: "Total Sales", amount: totalDelivered });
      worksheet.addRow({
        productName: "Total Products",
        amount: allFilteredOrders.reduce((s, o) => s + o.products.length, 0),
      });
      worksheet.addRow({
        productName: "Total Discount",
        amount: allFilteredOrders.reduce(
          (s, o) =>
            s +
            (o.discountAmount || 0) / o.products.length +
            (o.couponDiscount || 0) / o.products.length,
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
    console.error(error);
    res.status(500).send("Server Error");
  }
};

module.exports = {
  salesreport,
  exportSalesReport,
};