const Order = require("../../models/orderSchema");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");        
const excel = require("exceljs");

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
      .populate({ path: "products.product", select: "name" })
      .populate("user")
      .lean();

    
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

    
    let totalSales = 0,
      totalRevenue = 0,
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
          totalSales += productAmount;
          deliveredProducts++;
        } else if (product.status === "cancelled") {
          cancelledProducts++;
        } else if (product.status === "returned") {
          totalSales -= productAmount;
          returnedProducts++;
          totalRefunds += product.refundAmount || 0;
        }
        totalDiscount +=
          (order.discountAmount || 0) / order.products.length + couponDeductionPerProduct;

        
        if (product.status !== "cancelled" && product.status !== "returned") {
          totalRevenue += productAmount - couponDeductionPerProduct;
        }
      });
    });

    
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
          revenue: (p.status !== "cancelled" && p.status !== "returned")
            ? ((p.variant.salePrice || p.variant.varientPrice) * p.quantity) -
              ((order.couponDiscount || 0) / order.products.length)
            : 0
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
      totalRevenue: Math.max(totalRevenue, 0),
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


const exportSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, status, period, format } = req.query;
    let query = {};

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    
    if (period) {
      switch (period) {
        case "daily":
          query.createdAt = { $gte: today, $lte: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1) };
          break;
        case "weekly":
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          query.createdAt = { $gte: weekStart, $lte: new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1) };
          break;
        case "monthly":
          const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
          query.createdAt = { $gte: monthStart, $lte: new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59) };
          break;
        case "yearly":
          const yearStart = new Date(today.getFullYear(), 0, 1);
          query.createdAt = { $gte: yearStart, $lte: new Date(today.getFullYear(), 11, 31, 23, 59, 59) };
          break;
        case "custom":
          if (startDate && endDate) {
            query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate + "T23:59:59") };
          }
          break;
      }
    }

    if (status) {
      if (status === "delivered") query["products.status"] = "delivered";
      else if (status === "cancelled") query["products.status"] = "cancelled";
      else if (status === "returned") query["products.status"] = "returned";
    }

    let allFilteredOrders = await Order.find(query).populate("products.product").populate("user").lean();

    if (status) {
      allFilteredOrders = allFilteredOrders
        .map(order => {
          const obj = { ...order };
          obj.products = obj.products.filter(p => p.status === status);
          return obj;
        })
        .filter(order => order.products.length > 0);
    }

    
    if (format === "pdf") {
      
      const reportsDir = path.join(__dirname, "../../public/reports");
      if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

      const doc = new PDFDocument({ size: "A4", margin: 30, bufferPages: true });
      const filePath = path.join(reportsDir, `sales-report.pdf`);
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      
      const pageWidth = doc.page.width - 60; 
      const startX = 30;
      let y = 120; 
      const baseRowHeight = 16; 
      const fontSize = 9;
      const headerFontSize = 10;
      const titleFontSize = 16;
      const lineGap = 2;

      
      const columns = [
        { key: "orderID", header: "Order ID", width: 70, align: "left" },
        { key: "product", header: "Product", width: 150, align: "left" },
        { key: "size", header: "Size", width: 30, align: "center" },
        { key: "date", header: "Date", width: 60, align: "center" },
        { key: "customer", header: "Customer", width: 80, align: "left" },
        { key: "amount", header: "Amount", width: 60, align: "right" },
        { key: "coupon", header: "Coupon", width: 60, align: "right" },
        { key: "payment", header: "Payment", width: 50, align: "center" },
        { key: "status", header: "Status", width: 50, align: "center" },
      ];

      const totalWidth = columns.reduce((s, c) => s + c.width, 0);
      const getX = (idx) => startX + columns.slice(0, idx).reduce((s, c) => s + c.width, 0);

      
      const addHeader = () => {
        y = 120;
        doc.font("Helvetica-Bold").fontSize(titleFontSize).fillColor("black")
          .text("FitVibe – Sales Report", startX, 40, { align: "center", width: pageWidth });
        doc.font("Helvetica").fontSize(9).fillColor("black")
          .text(`Period: ${period || "All Time"} ${startDate && endDate ? `(${startDate} – ${endDate})` : ""}`, startX, 65, { align: "center", width: pageWidth })
          .text(`Status: ${status || "All"}`, startX, 80, { align: "center", width: pageWidth });

        
        doc.save();
        doc.rect(startX, y - 6, totalWidth, baseRowHeight + 8).fill("#e9e9e9");
        doc.fillColor("black");
        doc.font("Helvetica-Bold").fontSize(headerFontSize);

        
        columns.forEach((c, i) => {
          doc.text(c.header, getX(i) + 4, y - 2, { width: c.width - 8, align: c.align });
        });

        
        doc.moveTo(startX, y + baseRowHeight + 2).lineTo(startX + totalWidth, y + baseRowHeight + 2).lineWidth(0.8).stroke();
        doc.restore();
        y += baseRowHeight + 8; 
      };

      
      addHeader();

      
      doc.font("Helvetica").fontSize(fontSize).fillColor("black");

      
      let totalDelivered = 0;
      let totalDiscount = 0;
      let productCount = 0;
      let rowIndex = 0;

      
      const wrapTextLines = (text, maxWidth) => {
        if (!text) return [""];
        const words = String(text).split(" ");
        const lines = [];
        let line = "";
        for (let i = 0; i < words.length; i++) {
          const word = words[i];
          const test = line ? line + " " + word : word;
          const testWidth = doc.widthOfString(test);
          if (testWidth <= maxWidth) {
            line = test;
          } else {
            if (line) lines.push(line);
            
            if (doc.widthOfString(word) > maxWidth) {
              
              let part = "";
              for (let ch of word) {
                const t = part + ch;
                if (doc.widthOfString(t) <= maxWidth) part = t;
                else {
                  if (part) lines.push(part);
                  part = ch;
                }
              }
              if (part) line = part;
              else line = "";
            } else {
              line = word;
            }
          }
        }
        if (line) lines.push(line);
        return lines;
      };

      
      allFilteredOrders.forEach(order => {
        order.products.forEach(p => {
          rowIndex++;
          productCount++;

          const price = p.variant.salePrice || p.variant.varientPrice || 0;
          const amountVal = price * (p.quantity || 1);
          const couponPerItem = order.couponDiscount ? order.couponDiscount / order.products.length : 0;
          const netAmount = amountVal - couponPerItem;

          if (p.status === "delivered") totalDelivered += netAmount;
          totalDiscount += (order.discountAmount || 0) / order.products.length + couponPerItem;

          const row = {
            orderID: order.orderID || "",
            product: (p.product?.name || "Unknown").replace(/\s+/g, " ").trim(),
            size: p.variant.size || "",
            date: new Date(order.createdAt).toLocaleDateString("en-IN"),
            customer: order.user?.name || "Unknown",
            amount: `${amountVal.toLocaleString("en-IN")}`,
            coupon: `${couponPerItem ? couponPerItem.toFixed(2).toLocaleString("en-IN") : "0.00"}`,
            payment: order.paymentMethod || "",
            status: p.status || "",
          };

          
          const columnLines = columns.map(c => {
            const maxW = c.width - 8; 
            return wrapTextLines(row[c.key], maxW);
          });
          const maxLines = Math.max(...columnLines.map(l => l.length));
          const lineHeight = fontSize + lineGap;
          const rowHeightDynamic = Math.max(baseRowHeight, maxLines * lineHeight + 6);

          
          if (y + rowHeightDynamic > doc.page.height - 70) {
            doc.addPage();
            addHeader();
          }

          
          if (rowIndex % 2 === 0) {
            doc.save();
            doc.rect(startX, y - 4, totalWidth, rowHeightDynamic + 4).fill("#fbfbfb");
            doc.restore();
          }

          columns.forEach((c, i) => {
            const lines = columnLines[i];
            const tx = getX(i) + 4;
            const ty = y;
            const maxW = c.width - 8;
            const textToPrint = lines.join("\n");
            const align = c.align || "left";
            doc.text(textToPrint, tx, ty + 2, { width: maxW, align, lineGap });
          });

          doc.moveTo(startX, y + rowHeightDynamic).lineTo(startX + totalWidth, y + rowHeightDynamic).lineWidth(0.3).stroke();

          y += rowHeightDynamic + 6;
        });
      });

      if (y + 120 > doc.page.height - 70) {
        doc.addPage();
        addHeader();
      }

      doc.font("Helvetica-Bold").fontSize(12).fillColor("black").text("Summary", startX, y + 10);
      const labelX = startX + 10;
      const valueX = startX + 200;
      doc.font("Helvetica").fontSize(10).fillColor("black");

      doc.text("Total Sales (Delivered):", labelX, y + 40);
      doc.text(`${totalDelivered.toFixed(2).toLocaleString("en-IN")}`, valueX, y + 40, { width: 150, align: "right" });

      doc.text("Total Products:", labelX, y + 70);
      doc.text(`${productCount}`, valueX, y + 70, { width: 150, align: "right" });

      doc.text("Total Discount:", labelX, y + 100);
      doc.text(`${totalDiscount.toFixed(2).toLocaleString("en-IN")}`, valueX, y + 100, { width: 150, align: "right" });

      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        const footY = doc.page.height - 50;
        doc.fontSize(8).fillColor("gray")
          .text(`Page ${i + 1} of ${pages.count}`, startX, footY, { align: "center", width: pageWidth })
          .text(`Generated on: ${new Date().toLocaleString("en-IN")}`, startX, footY + 12, { align: "center", width: pageWidth });
      }

      doc.end();

      stream.on("finish", () => {
        res.download(filePath, "sales-report.pdf", err => {
          if (err) console.error("Download error:", err);
           fs.unlink(filePath, () => {});
        });
      });

      stream.on("error", err => {
        console.error("PDF stream error:", err);
        res.status(500).send("PDF generation failed");
      });

      return;
    } 

    
    else if (format === "excel") {
      const workbook = new excel.Workbook();
      const worksheet = workbook.addWorksheet("Sales Report");

      worksheet.columns = [
        { header: "Order ID", key: "orderID", width: 15 },
        { header: "Product Name", key: "productName", width: 30 },
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
            amount: (product.variant.salePrice || product.variant.varientPrice) * product.quantity,
            couponDeduction: order.couponDiscount ? order.couponDiscount / order.products.length : 0,
            paymentMethod: order.paymentMethod,
            status: product.status,
          });
        });
      });

      const totalDelivered = allFilteredOrders
        .flatMap(order =>
          order.products
            .filter(p => p.status === "delivered")
            .map(p => (p.variant.salePrice || p.variant.varientPrice) * p.quantity - (order.couponDiscount ? order.couponDiscount / order.products.length : 0))
        ).reduce((a, b) => a + b, 0);

      worksheet.addRow({});
      worksheet.addRow({ productName: "Total Sales", amount: totalDelivered });
      worksheet.addRow({ productName: "Total Products", amount: allFilteredOrders.reduce((s, o) => s + o.products.length, 0) });
      worksheet.addRow({ productName: "Total Discount", amount: allFilteredOrders.reduce((s, o) => s + (o.discountAmount || 0) / o.products.length + (o.couponDiscount || 0) / o.products.length, 0) });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", "attachment; filename=sales-report.xlsx");
      await workbook.xlsx.write(res);
      res.end();
      return;
    } else {
      res.status(400).send("Invalid export format");
    }
  } catch (error) {
    console.error("exportSalesReport error:", error);
    res.status(500).send("Server Error");
  }
};



module.exports = {
  salesreport,
  exportSalesReport,
};