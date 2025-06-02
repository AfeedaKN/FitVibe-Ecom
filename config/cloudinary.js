const cloudinary = require('cloudinary').v2
const {cloudinaryStorage, CloudinaryStorage} = require('multer-storage-cloudinary')
const env=require("dotenv").config()



cloudinary.config({
    cloud_name:process.env.CLOUD_NAME,
    api_key:process.env.CLOUD_API_KEY,
    api_secret:process.env.CLOUD_API_SECERET
})

const storage = new CloudinaryStorage({
    cloudinary:cloudinary,
    params:{
        folder:'FitVibe-Products',
        allowed_formats:['jpg' ,  'png' , 'jpeg'],
        transformation : [{width : 500, height  : 500 , crop : 'limit'}]
    }
});
module.exports = {
    cloudinary,
    storage
}