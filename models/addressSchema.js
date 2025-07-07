const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const addressSchema = new Schema({
    user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    zipCode: {
        type: String,
        required: true
    },
    address: {
        type: String,
    },
    city: {
        type: String,
        required: true
    },
    country: {
        type: String,
        required: true
    },
    state: {
        type: String,
        required: true
    },
    isDefault: {
        type: Boolean,
        default: false
    }
}, {  timestamps: true });

const Address = mongoose.model('Address', addressSchema);
module.exports = Address;