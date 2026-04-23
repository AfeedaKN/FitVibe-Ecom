<<<<<<< HEAD
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

=======
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
>>>>>>> 5c359ce00af4d3a42483ff424aa77db3e0cef963

## Project Structure

- Organize routes, controllers, models, and services clearly.
- Keep shared utilities reusable.
- Maintain consistent naming conventions.

<<<<<<< HEAD
=======

## Project Structure

- Organize routes, controllers, models, and services clearly.
- Keep shared utilities reusable.
- Maintain consistent naming conventions.


## Project Structure

- Organize routes, controllers, models, and services clearly.
- Keep shared utilities reusable.
- Maintain consistent naming conventions.

>>>>>>> 7477bcb (docs: document project structure)

## Project Structure

- Organize routes, controllers, models, and services clearly.
- Keep shared utilities reusable.
- Maintain consistent naming conventions.


## Authentication

- Verify user credentials securely.
- Protect private routes.
- Handle expired sessions safely.


## Authorization

- Restrict administrative operations.
- Verify permissions before sensitive actions.
- Prevent unauthorized access to user data.


## Product Management

- Validate product details before saving.
- Maintain consistent product information.
- Handle unavailable products safely.


## Product Variants

- Validate available sizes and colors.
- Associate variants with the correct product.
- Check stock before accepting purchases.


## Image Uploads

- Validate uploaded image formats.
- Enforce file size limits.
- Handle image upload failures safely.


## Product Search

- Support relevant product searches.
- Handle empty search results.
- Validate search parameters.


## Shopping Cart

- Validate product quantities.
- Recalculate prices on the server.
- Check stock before checkout.


## Wishlist

- Associate wishlist items with the correct user.
- Handle deleted products safely.
- Prevent unauthorized wishlist modifications.


## Coupon Management

- Validate coupon expiry dates.
- Enforce usage limits.
- Apply discounts according to eligibility rules.


## Checkout

- Calculate order totals on the server.
- Validate shipping addresses.
- Recheck product availability before placing orders.


## Order Management

- Maintain clear order statuses.
- Validate status transitions.
- Preserve order details for future reference.


## Payment Processing

- Verify payment responses on the server.
- Handle failed and cancelled payments.
- Prevent duplicate payment processing.


## Wallet Management

- Maintain transaction history.
- Validate available balance before debiting.
- Keep wallet balances consistent with transactions.


## Order Cancellation

- Validate cancellation eligibility.
- Update order status consistently.
- Handle stock restoration and refunds correctly.


## Returns and Refunds

- Validate return eligibility.
- Calculate refunds from the correct order data.
- Preserve original order totals.


## User Management

- Validate user profile updates.
- Protect private user information.
- Apply account restrictions consistently.


## Admin Product Management

- Validate product creation and editing.
- Keep product variants consistent.
- Handle product deletion safely.


## Admin User Management

- Restrict account management to authorized administrators.
- Validate user search parameters.
- Handle blocked accounts consistently.


## Sales Reports

- Calculate revenue from valid order records.
- Define how cancelled orders affect reports.
- Validate top-selling product calculations.


## Database Performance

- Review frequently used database queries.
- Add indexes when query patterns justify them.
- Avoid unnecessary database operations.


## Security Practices

- Store secrets outside source code.
- Validate incoming requests.
- Avoid exposing sensitive information in error responses.


## Responsive Design

- Support common mobile and desktop screen sizes.
- Keep product cards readable.
- Make cart and checkout forms usable on small screens.


## Form Validation

- Validate required fields.
- Display clear validation messages.
- Repeat important validation on the server.


## Error Handling

- Return appropriate HTTP status codes.
- Handle expected failures consistently.
- Keep internal error details private.


## Automated Testing

- Test important business rules.
- Cover invalid inputs and edge cases.
- Verify coupon and checkout calculations.


## Workflow Testing

- Test checkout and payment failure paths.
- Verify cancellation and refund behavior.
- Check order status transitions.


## Code Quality

- Use meaningful names.
- Keep functions focused.
- Reuse shared validation and calculation logic.


## Project Setup

- Document required dependencies.
- Explain environment configuration.
- Keep installation instructions accurate.


## Regression Testing

- Verify product browsing and cart operations.
- Test critical checkout and order flows.
- Fix regressions before release.


## Release Readiness

- Review application configuration.
- Verify critical customer and admin workflows.
- Confirm project documentation matches the implementation.


## Backend Architecture

- Separate routes, controllers, and models.
- Keep business logic organized.
- Reuse shared utilities where appropriate.


## Authentication and Sessions

- Verify user credentials securely.
- Manage authenticated sessions.
- Handle session expiration and logout.


## Admin Authorization

- Restrict administrative routes.
- Verify permissions before sensitive actions.
- Prevent unauthorized access to admin operations.


## Product and Variant Validation

- Validate product details before saving.
- Check available sizes and colors.
- Prevent invalid variant and stock values.


## Product Image Uploads

- Validate image formats and file sizes.
- Handle Cloudinary upload failures.
- Keep product image references consistent.


## Cart Validation

- Validate requested product quantities.
- Recheck stock before checkout.
- Calculate cart prices on the server.


## Wishlist Management

- Associate wishlist entries with the correct user.
- Validate product references.
- Restrict wishlist changes to authorized users.


## Coupon Validation

- Check coupon expiry dates.
- Enforce usage limits.
- Validate minimum purchase requirements.
- Apply eligible discounts correctly.


## Checkout Calculations

- Calculate subtotal and discounts on the server.
- Include applicable delivery charges.
- Validate final totals before creating an order.


## Order Creation

- Validate cart items before placing orders.
- Keep order totals consistent with checkout.
- Maintain stock consistency during order creation.


## Razorpay Payment Verification

- Verify payment signatures on the server.
- Handle unsuccessful payment attempts.
- Prevent duplicate payment processing.


## Wallet Transactions

- Validate the available balance before debiting.
- Record credit and debit transactions.
- Keep transaction history consistent with wallet balances.


## Cash on Delivery

- Validate COD eligibility during checkout.
- Enforce configured order-value restrictions.
- Recheck payment rules before placing orders.


## Order Cancellation

- Validate whether an order can be cancelled.
- Update order status consistently.
- Handle stock restoration and applicable refunds.


## Returns and Refunds

- Validate return eligibility and order status.
- Calculate refunds using the correct order data.
- Preserve original order totals.


## Admin Product Management

- Validate product creation and editing.
- Maintain product variant consistency.
- Handle product images and category references correctly.


## User Management

- Validate user search parameters.
- Support appropriate user management operations.
- Restrict sensitive actions to authorized administrators.


## Sales Reports

- Aggregate order and revenue information accurately.
- Define how cancelled and returned orders are counted.
- Validate top-selling product calculations.


## MongoDB Query Optimization

- Review frequently used database queries.
- Add indexes when justified by query patterns.
- Avoid unnecessary database operations.


## Responsive EJS Pages

- Support common mobile and desktop screen sizes.
- Keep product and order information readable.
- Make checkout forms usable on smaller screens.


## Form Validation

- Validate required fields.
- Display clear and useful validation messages.
- Repeat important validation on the server.


## Error Handling

- Handle expected errors consistently.
- Return appropriate HTTP status codes.
- Avoid exposing internal implementation details.


## Business Logic Testing

- Test coupon eligibility and discount calculations.
- Test cart and stock validation.
- Cover invalid inputs and edge cases.


## Checkout Workflow Testing

- Test successful and unsuccessful checkout attempts.
- Verify payment failure handling.
- Test order creation and stock consistency.


## Reusable Service Functions

- Keep business logic separate from route handlers.
- Reuse common validation and calculation logic.
- Keep functions focused on one responsibility.


## API Documentation

- Document endpoint URLs and HTTP methods.
- Explain required request fields.
- Describe expected responses and error cases.


## Security Review

- Review authentication and authorization rules.
- Keep secrets outside source code.
- Validate uploaded files and incoming requests.
- Protect sensitive user information.


## Regression Testing

- Verify product browsing and cart operations.
- Test checkout, cancellation, and refund workflows.
- Check that new changes do not break existing features.


## Installation and Configuration

- Document required dependencies.
- Explain environment variable setup.
- Provide accurate installation and startup instructions.


## Final Project Review

- Review critical customer and admin workflows.
- Verify tests and configuration.
- Ensure documentation matches the implementation.


## Backend Architecture

- Separate routes, controllers, and models.
- Keep business logic organized.
- Reuse shared utilities where appropriate.


## Authentication and Sessions

- Verify user credentials securely.
- Manage authenticated sessions.
- Handle session expiration and logout.


## Admin Authorization

- Restrict administrative routes.
- Verify permissions before sensitive actions.
- Prevent unauthorized access to admin operations.


## Product and Variant Validation

- Validate product details before saving.
- Check available sizes and colors.
- Prevent invalid variant and stock values.


## Product Image Uploads

- Validate image formats and file sizes.
- Handle Cloudinary upload failures.
- Keep product image references consistent.


## Cart Validation

- Validate requested product quantities.
- Recheck stock before checkout.
- Calculate cart prices on the server.


## Wishlist Management

- Associate wishlist entries with the correct user.
- Validate product references.
- Restrict wishlist changes to authorized users.


## Coupon Validation

- Check coupon expiry dates.
- Enforce usage limits.
- Validate minimum purchase requirements.
- Apply eligible discounts correctly.


## Checkout Calculations

- Calculate subtotal and discounts on the server.
- Include applicable delivery charges.
- Validate final totals before creating an order.


## Order Creation

- Validate cart items before placing orders.
- Keep order totals consistent with checkout.
- Maintain stock consistency during order creation.


## Razorpay Payment Verification

- Verify payment signatures on the server.
- Handle unsuccessful payment attempts.
- Prevent duplicate payment processing.


## Wallet Transactions

- Validate the available balance before debiting.
- Record credit and debit transactions.
- Keep transaction history consistent with wallet balances.


## Cash on Delivery

- Validate COD eligibility during checkout.
- Enforce configured order-value restrictions.
- Recheck payment rules before placing orders.


## Order Cancellation

- Validate whether an order can be cancelled.
- Update order status consistently.
- Handle stock restoration and applicable refunds.


## Returns and Refunds

- Validate return eligibility and order status.
- Calculate refunds using the correct order data.
- Preserve original order totals.


## Admin Product Management

- Validate product creation and editing.
- Maintain product variant consistency.
- Handle product images and category references correctly.


## User Management

- Validate user search parameters.
- Support appropriate user management operations.
- Restrict sensitive actions to authorized administrators.


## Sales Reports

- Aggregate order and revenue information accurately.
- Define how cancelled and returned orders are counted.
- Validate top-selling product calculations.


## MongoDB Query Optimization

- Review frequently used database queries.
- Add indexes when justified by query patterns.
- Avoid unnecessary database operations.


## Responsive EJS Pages

- Support common mobile and desktop screen sizes.
- Keep product and order information readable.
- Make checkout forms usable on smaller screens.


## Form Validation

- Validate required fields.
- Display clear and useful validation messages.
- Repeat important validation on the server.


## Error Handling

- Handle expected errors consistently.
- Return appropriate HTTP status codes.
- Avoid exposing internal implementation details.


## Business Logic Testing

- Test coupon eligibility and discount calculations.
- Test cart and stock validation.
- Cover invalid inputs and edge cases.


## Checkout Workflow Testing

- Test successful and unsuccessful checkout attempts.
- Verify payment failure handling.
- Test order creation and stock consistency.


## Reusable Service Functions

- Keep business logic separate from route handlers.
- Reuse common validation and calculation logic.
- Keep functions focused on one responsibility.


## API Documentation

- Document endpoint URLs and HTTP methods.
- Explain required request fields.
- Describe expected responses and error cases.


## Security Review

- Review authentication and authorization rules.
- Keep secrets outside source code.
- Validate uploaded files and incoming requests.
- Protect sensitive user information.


## Regression Testing

- Verify product browsing and cart operations.
- Test checkout, cancellation, and refund workflows.
- Check that new changes do not break existing features.


## Installation and Configuration

- Document required dependencies.
- Explain environment variable setup.
- Provide accurate installation and startup instructions.


## Installation and Configuration

- Document required dependencies.
- Explain environment variable setup.
- Provide accurate installation and startup instructions.

