const mongoose = require("mongoose");
const { Schema } = mongoose;

const transactionSchema = new Schema({
  transactionId: {
    type: String,
    required: true,
    default: () => 'TXN' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase()
  },
  type: {
    type: String,
    enum: ["credit", "debit"],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  description: {
    type: String,
    required: true
  },
  balanceAfter: {
    type: Number,
    required: true,
    min: 0
  },
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Order",
    default: null
  },
  status: {
    type: String,
    enum: ["pending", "completed", "failed", "cancelled"],
    default: "completed"
  },
  source: {
    type: String,
    enum: ["order_payment", "refund", "order_cancellation", "return_refund", "admin_credit", "admin_debit", "cashback", "bonus"],
    required: true
  },
  metadata: {
    orderNumber: String,
    productName: String,
    refundReason: String,
    adminNotes: String,
    paymentMethod: String,
    originalTransactionId: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

const walletSchema = new Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  transactions: [transactionSchema]
}, { timestamps: true });

// Indexes for performance (removed duplicate userId index)
walletSchema.index({ "transactions.transactionId": 1 });
walletSchema.index({ "transactions.orderId": 1 });
walletSchema.index({ "transactions.createdAt": -1 });

const Wallet = mongoose.model("Wallet", walletSchema);
module.exports = Wallet;