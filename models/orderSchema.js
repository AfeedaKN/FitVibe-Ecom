const mongoose = require("mongoose")
const Schema = mongoose.Schema

const productSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  variant: {
    size: {
      type: String,
      required: true,
    },
    varientPrice: {
      type: Number,
      required: true,
    },
    salePrice: {
      type: Number,
      required: true,
    },
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  status: {
    type: String,
    enum: [
      "pending",
      "processing",
      "shipped",
      "out for delivery",
      "delivered",
      "cancelled",
      "returned",
      "return pending",
    ],
    default: "pending",
  },
  cancellationReason: String,
  returnReason: String,
  returnRequestDate: Date,
  trackingNumber: String,
  trackingUrl: String,
})

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderID: {
      type: String,
      required: true,
      unique: true,
    },
    products: [productSchema],
    address: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Address",
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    discount: {
      type: Number,
      default: 0,
    },
    couponDiscount: {
      type: Number,
      default: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
    },
    shippingCharge: {
      type: Number,
      default: 0,
    },
    finalAmount: {
      type: Number,
      required: true,
    },
    coupon: {
      couponId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Coupon",
      },
      code: String,
      discountAmount: Number,
    },
    paymentMethod: {
      type: String,
      enum: ["COD", "online", "paypal", "wallet"],
      required: true,
    },
    paymentMentod: String,
    paymentStatus: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
    },
    paymentDetails: {
      transactionId: String,
      paymentId: String,
      payerId: String,
      paymentMethod: String,
      amount: Number,
      currency: String,
      status: String,
      createdAt: Date,
    },
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "shipped",
        "out for delivery",
        "delivered",
        "cancelled",
        "returned",
        "return pending",
      ],
      default: "pending",
    },
    cancellationReason: String,
    returnReason: String,
    orderDate: {
      type: Date,
      default: Date.now,
    },
    deliveryDate: Date,
    trackingDetails: {
      courier: String,
      trackingNumber: String,
      trackingUrl: String,
      estimatedDelivery: Date,
      updates: [
        {
          status: String,
          location: String,
          timestamp: Date,
          description: String,
        },
      ],
    },
    isTemporary: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
)

orderSchema.pre("save", async function (next) {
  if (this.isNew) {
    const date = new Date()
    const year = date.getFullYear().toString().slice(-2)
    const month = ("0" + (date.getMonth() + 1)).slice(-2)
    const day = ("0" + date.getDate()).slice(-2)
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0")
    this.orderID = `ORD${year}${month}${day}${random}`
  }
  next()
})

module.exports = mongoose.model("Order", orderSchema)
