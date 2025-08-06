const mongoose=require("mongoose")
const {Schema}=mongoose

const couponSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true
    },
    description: {
        type: String,
        required: true,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true,
        default: 'fixed'
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    // Keep offerPrice for backward compatibility
    offerPrice: {
        type: Number,
        required: true
    },
    minimumPrice: {
        type: Number,
        required: true,
        min: 0
    },
    maxDiscountAmount: {
        type: Number,
        default: null // Only for percentage discounts
    },
    usageLimit: {
        type: Number,
        default: null // null means unlimited
    },
    usedCount: {
        type: Number,
        default: 0
    },
    createdOn: {
        type: Date,
        default: Date.now,
        required: true
    },
    expireOn: {
        type: Date,
        required: true
    },
    isList: {
        type: Boolean,
        default: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
    },
    // Keep userId for backward compatibility
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
    },
    // Soft delete fields
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
})

// Pre-save middleware to sync offerPrice with discountValue for backward compatibility
couponSchema.pre('save', function(next) {
    if (this.discountType === 'fixed') {
        this.offerPrice = this.discountValue;
    } else {
        // For percentage, offerPrice represents the percentage value
        this.offerPrice = this.discountValue;
    }
    next();
});

const Coupon=mongoose.model("Coupon",couponSchema)
module.exports=Coupon