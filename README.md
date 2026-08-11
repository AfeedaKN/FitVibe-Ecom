# FitVibe 👕🛍️

FitVibe is a full-stack **men's shirt e-commerce website** built using Node.js, Express.js, MongoDB, and EJS.

The application provides a complete shopping experience for users, along with an admin panel for managing products, users, categories, orders, coupons, and sales.

## 🚀 Features

### 👤 User Features

* User registration and login
* Secure authentication
* OTP verification
* Google authentication
* User profile management
* Profile image upload
* Change password
* Address management
* Product browsing
* Product search
* Product categories
* Product details
* Product variants
* Wishlist
* Shopping cart
* Stock validation
* Coupon application
* Checkout
* Order placement
* Order cancellation
* Order tracking
* Product return requests
* Refund handling
* Wallet
* Razorpay payment
* Cash on Delivery

### 👨‍💼 Admin Features

* Admin login
* Admin authorization
* User management
* Search users
* Pagination
* Block/unblock users
* Category management
* Soft delete categories
* Product management
* Product variants
* Product image management
* Cloudinary image upload
* Order management
* Return request management
* Coupon management
* Sales reports
* Dashboard statistics
* Revenue tracking
* Top-selling products

## 👕 Product Categories

FitVibe focuses on men's shirts, including:

* Casual Shirts
* Printed Shirts
* Formal Shirts
* Denim Shirts
* Oversized Shirts

## 🛠️ Technologies Used

### Frontend

* HTML
* CSS
* JavaScript
* Bootstrap
* EJS

### Backend

* Node.js
* Express.js
* MongoDB
* Mongoose

### Authentication

* Express Session
* Passport.js
* Google OAuth
* bcrypt
* OTP verification

### Image Management

* Multer
* Cloudinary
* Sharp
* Cropper.js

### Payment

* Razorpay
* Wallet
* Cash on Delivery

### Email

* Nodemailer

## 🏗️ Architecture

The application follows an MVC-style structure.

```text
FitVibe
│
├── config
├── controllers
├── middlewares
├── models
├── routes
├── utils
├── views
├── public
│
├── app.js
├── package.json
└── README.md
```

## 🔄 Application Flow

### User Flow

```text
Register / Login
       ↓
     Home
       ↓
 Browse Products
       ↓
 Product Details
       ↓
 Add to Cart / Wishlist
       ↓
     Checkout
       ↓
 Select Payment
       ↓
     Place Order
       ↓
     Order History
```

### Admin Flow

```text
Admin Login
     ↓
Dashboard
     ↓
 ┌──────────────┬──────────────┬──────────────┐
 Users        Products       Categories
 └──────────────┴──────────────┴──────────────┘
                 ↓
              Orders
                 ↓
        Returns / Coupons
                 ↓
           Sales Reports
```

## ☁️ Image Upload

Product and profile images are handled using Multer and Cloudinary.

```text
Image Upload
     ↓
   Multer
     ↓
Image Processing
     ↓
 Cloudinary
     ↓
 Image URL
     ↓
  MongoDB
```

## 💳 Payment Methods

The application supports:

* Cash on Delivery
* Razorpay
* Wallet payment

```text
Checkout
   ↓
Payment Method
   ↓
 ┌─────────┬──────────┬────────┐
 │   COD   │ Razorpay │ Wallet │
 └─────────┴──────────┴────────┘
             ↓
           Order
```

## 🎟️ Coupon System

The application includes coupon management with:

* Coupon creation
* Coupon expiry
* Usage limits
* User-specific usage validation
* Discount calculation
* Cart discount application

## 💰 Wallet System

The wallet supports:

* Credits
* Debits
* Balance tracking
* Refund credits
* Wallet payments

Each wallet transaction keeps track of the balance after the transaction.

## 📊 Sales Reports

The admin can generate sales reports based on different time periods:

* Daily
* Weekly
* Monthly
* Yearly

The dashboard also provides:

* Total users
* Total orders
* Total products
* Total revenue
* Top products

## 📚 Concepts Practiced

This project helped me practice:

* Node.js
* Express.js
* MongoDB
* Mongoose
* MVC architecture
* REST APIs
* CRUD operations
* Authentication
* Authorization
* Sessions
* OAuth
* OTP verification
* Password hashing
* Middleware
* Express routing
* Controllers
* EJS templating
* Form validation
* File uploads
* Image processing
* Cloudinary
* Pagination
* Search
* Soft delete
* Cart management
* Wishlist management
* Coupon management
* Order management
* Return and refund flow
* Wallet transactions
* Payment integration
* MongoDB aggregation
* Sales reports

## ⚙️ Installation

Clone the repository:

```bash
git clone https://github.com/AfeedaKN/FitVibe-Ecom.git
```

Go to the project folder:

```bash
cd FitVibe-Ecom
```

Install dependencies:

```bash
npm install
```

Create a `.env` file in the project root and add the required environment variables.

Example:

```env
MONGO_URI=your_mongodb_connection_string

SESSION_SECRET=your_session_secret

CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

RAZORPAY_KEY_ID=your_razorpay_key
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

Start the application:

```bash
npm start
```

## 🔒 Environment Variables

Never upload your `.env` file or API secrets to GitHub.

Make sure `.env` is included in `.gitignore`.

```text
.env
node_modules/
```

## 🎯 Project Purpose

FitVibe was developed as a full-stack e-commerce project to gain practical experience in building a real-world web application.

The project covers the complete e-commerce workflow, from **authentication and product browsing to cart management, checkout, payments, order processing, returns, refunds, wallet transactions, and admin management**.

## 👩‍💻 Author

**Afeeda KN**

GitHub: AfeedaKN
