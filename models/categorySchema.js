const mongoose=require("mongoose")
const {Schema}=mongoose

const categorySchema = new Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    description: {
        type: String,
        required:true
    },
    isListed: {
        type: Boolean,
        default:true     
    },
    isDeleted: {
      type: Boolean,
      default:false,
    },

    categoryOffer: {
        type: Number,     
        default: 0,
        min: 0, // Ensure offer is not negative
        max: 100,
    },
    createdAt:{
        type:Date,
        default:Date.now
    },
    updatedAt: {
    type: Date,
    default: Date.now,
  },
 
})
categorySchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

const Category=mongoose.model("Category",categorySchema)
module.exports=Category