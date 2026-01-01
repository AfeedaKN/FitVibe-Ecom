# FitVibe-Ecom

FitVibe is a full-featured men's shirt e-commerce web application developed with Node.js, Express 5, MongoDB/Mongoose, and EJS templating. The platform provides a complete shopping workflow for customers and management capabilities for administrators.

<!-- Screenshots: Add application screenshots here when available -->

## Features

### Customer Experience
- **Authentication**: Local registration with OTP verification delivered via Nodemailer, Google OAuth 2.0 via Passport.js, and bcrypt password hashing.
- **Product Catalog**: Category filtering, product search, image zooming, and detailed size/inventory listings.
- **Cart & Wishlist**: Persistent shopping cart with quantity limits and wishlist tracking.
- **Checkout & Multi-Gateway Payments**: Integrated Razorpay payment processing, Cash on Delivery (COD), and direct wallet payment.
- **User Wallet & Order Management**: User wallet for balances and instant refunds on cancellations and approved returns; order status tracking with downloadable PDF invoices.
- **Promotions & Coupons**: Coupon engine supporting minimum spend requirements, percentage/fixed discounts, usage limits, and expiration checks.

### Administrator Controls
- **Dashboard & Sales Analytics**: Overview of sales metrics with daily, weekly, monthly, and custom date range filters, exportable as PDF or Excel (PDFKit / ExcelJS).
- **Catalog Management**: Add, update, and unlist categories and products with multi-image cropping and upload via Multer, Sharp, and Cloudinary.
- **Order Lifecycle Handling**: Update order progression (Pending, Processing, Shipped, Delivered, Cancelled, Returned) and manage refund requests.
- **Customer Management**: View registered users with status management (block / unblock).

## Architecture

FitVibe follows a modular Model-View-Controller (MVC) architecture:

```
FitVibe/
├── config/             # Database connection, Passport.js, and Cloudinary configurations
├── controllers/        # Business logic divided into user/ and admin/ controllers
│   ├── admin/          # Admin dashboard, products, orders, categories, coupons, sales reports
│   └── user/           # Authentication, profile, catalog, cart, checkout, wallet, orders
├── helpers/            # Reusable utility helpers and business calculations
├── middlewares/        # Session validators, auth guards, upload handlers, and error handlers
├── models/             # Mongoose data schemas (User, Product, Category, Order, Cart, Wallet, etc.)
├── public/             # Static assets (Bootstrap styling, client scripts, custom stylesheets)
├── routes/             # Modular route definitions (userRouter.js, adminRouter.js)
├── utils/              # PDF and document generators, email utilities
├── views/              # EJS templates structured into admin/ and user/ layouts
└── app.js              # Server entry point and middleware pipeline configuration
```

## Tech Stack

- **Runtime & Framework**: Node.js, Express 5
- **Database**: MongoDB with Mongoose ODM
- **Templating**: EJS with Bootstrap 5
- **Authentication & Security**: Passport.js (Google OAuth), express-session, bcrypt, nocache
- **Payment Processing**: Razorpay
- **Media Pipeline**: Multer, Sharp, Cloudinary
- **Communications & Exports**: Nodemailer, PDFKit, ExcelJS

## Known Limitations

- **Product Reviews & Ratings**: Customer reviews and rating submission forms are not yet implemented.
- **Real-Time Inventory Hold**: Stock quantities decrement upon successful checkout rather than temporarily locking during active cart sessions.
- **Automated Order Tracking Notifications**: Email dispatch currently handles OTP verification; status update emails (e.g., shipping confirmations) are not yet integrated.
- **Test Automation**: Automated unit and end-to-end integration test suites are not yet established.

## Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas or local MongoDB instance

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/AfeedaKN/FitVibe-Ecom.git
   cd FitVibe-Ecom
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   Create a `.env` file based on `.env.example` and provide your credentials.
   ```bash
   cp .env.example .env
   ```
4. Start the application:
   ```bash
   npm run dev
   ```
   Or for production:
   ```bash
   npm start
   ```

## Project Structure

- Organize routes, controllers, models, and services clearly.
- Keep shared utilities reusable.
- Maintain consistent naming conventions.

