const mongoose = require("mongoose");
const { Schema } = mongoose;

const productSchema = new Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true
  },
  variant: {
    size: { type: String, required: true },
    varientPrice: { type: Number, required: true },
    salePrice: { type: Number, required: true }
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  status: {
    type: String,
    enum: ["pending", "processing", "shipped", "out for delivery", "delivered", "cancelled", "return pending", "returned"],
    default: "pending"
  },
  cancelReason: { type: String },
  returnReason: { type: String },
  returnRequestDate: { type: Date },
  refundStatus: {
    type: String,
    enum: ["none", "pending", "approved", "rejected", "processed"],
    default: "none"
  },
  refundAmount: { type: Number, default: 0 },
  refundRequestDate: { type: Date },
  refundApprovedDate: { type: Date },
  refundProcessedDate: { type: Date },
  adminNotes: { type: String },
  trackingNumber: { type: String },
  trackingUrl: { type: String }
});

const orderSchema = new Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  orderID: {
    type: String,
    required: true,
    unique: true
  },
  products: [productSchema],
  address: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Address",
    required: true
  },
  addressDetails: {
    name: { type: String, required: true },
    address: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zipCode: { type: String, required: true },
    country: { type: String, required: true },
    phone: { type: String, required: true }
  },
  totalAmount: { type: Number, required: true },
  couponDiscount: { type: Number, default: 0 },
  shippingCharge: { type: Number, default: 0 },
  finalAmount: { type: Number, required: true },
  statusHistory: [{
    status: { type: String, required: true },
    date: { type: Date, default: Date.now },
    description: { type: String }
  }],
  coupon: {
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: "Coupon" },
    code: { type: String },
    discountAmount: { type: Number }
  },
  paymentMethod: {
    type: String,
    enum: ["COD", "Online", "Wallet"],
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "completed", "failed", "refunded", "cancelled"],
    default: "pending"
  },
  paymentId: { type: String },
  razorpayOrderId: { type: String },
  paymentDetails: {
    paymentMethod: { type: String },
    amount: { type: Number },
    currency: { type: String },
    status: { type: String },
    createdAt: { type: Date },
    transactionId: { type: String },
    razorpaySignature: { type: String }
  },
  orderStatus: {
    type: String,
    enum: ["pending", "processing", "shipped", "out for delivery", "delivered", "cancelled", "return pending", "returned", "payment-failed"],
    default: "pending"
  },
  cancelReason: { type: String },
  returnReason: { type: String },
  refundAmount: { type: Number, default: 0 },
  refundStatus: {
    type: String,
    enum: ["none", "pending", "approved", "rejected", "processed"],
    default: "none"
  },
  refundRequestDate: { type: Date },
  refundApprovedDate: { type: Date },
  refundProcessedDate: { type: Date },
  adminRefundNotes: { type: String },
  orderDate: { type: Date, default: Date.now },
  deliveryDate: { type: Date },
  trackingDetails: {
    courier: { type: String },
    trackingNumber: { type: String },
    trackingUrl: { type: String },
    estimatedDelivery: { type: Date },
    updates: [{
      status: { type: String },
      location: { type: String },
      timestamp: { type: Date },
      description: { type: String }
    }]
  },
  isLocked: { type: Boolean, default: false }
}, { timestamps: true });

// Indexes for performance
orderSchema.index({ orderID: 1 });
orderSchema.index({ user: 1 });
orderSchema.index({ orderStatus: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

// Pre-save middleware for orderID
orderSchema.pre("save", async function (next) {
  if (!this.orderID) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = ("0" + (date.getMonth() + 1)).slice(-2);
    const day = ("0" + date.getDate()).slice(-2);
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
    this.orderID = `ORD${year}${month}${day}${random}`;
  }
  next();
});

module.exports = mongoose.model("Order", orderSchema);