const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cartSchema = new Schema({
  userId: { // 🔄 renamed from `user` to `userId`
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [ // 🔄 renamed from `products` to `items`
    {
      productId: { // 🔄 renamed from `product` to `productId`
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      variantId: { // 🆕 added this to match variant logic
        type: Schema.Types.ObjectId,
        required: true
      },
      quantity: {
        type: Number,
        default: 1
      },
      price: {
        type: Number,
        required: true
      },
      totalPrice: {
        type: Number,
        required: true
      },
      status: {
        type: String,
        default: "placed"
      },
      cancellationReason: {
        type: String,
        default: "none"
      }
    }
  ]
}, { timestamps: true });

const Cart = mongoose.model('Cart', cartSchema);
module.exports = Cart;
