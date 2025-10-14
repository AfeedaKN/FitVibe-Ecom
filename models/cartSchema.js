const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const cartSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [  
    {
      productId: { 
        type: Schema.Types.ObjectId,
        ref: 'Product',
        required: true
      },
      variantId: { 
        type: Schema.Types.ObjectId,
         ref: 'Variant',
        required: true
      },
      variantSize: {      // <-- NEW FIELD to store size
        type: String,
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
