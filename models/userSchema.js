const mongoose=require("mongoose")
const{Schema}=mongoose


const userSchema=new Schema({
    name:{
        type:String,
        required:true
    },
    email:{
        type:String,
        required:true,
        unique:true,
    },
    phone:{
        type:String,
        required:false,
        unique:false,
        sparse:true,
        default:null
    },
    googleId:{
        type:String,
        unique:true,
        sparse:true
    },
    password:{
        type:String,
        required:false

    },
    isBlocked:{
        type:Boolean,
        default:false

    },
    isAdmin:{
        type:Boolean,
        default:false

    },
  addresses: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Address",
  }],
    referralCode: {
    type: String,
    unique: true,
    required: true
  },

  referredBy: {
    type: String, // store referralCode of the user who referred
    default: null,
  },

},

{
  timestamps: true,
});const User=mongoose.model("User",userSchema)
module.exports=User