const Coupon = require('../../models/couponSchema');
const Order = require('../../models/orderSchema');
const mongoose = require('mongoose');

// Load coupons page
const loadCoupons = async (req, res) => {
  try {
    console.log('=== LOADING COUPONS PAGE ===');
    
    const page = parseInt(req.query.page) || 1;
    const limit = 6; // Changed to 6 per page as requested
    const skip = (page - 1) * limit;

    console.log('Fetching coupons from database...');
    const totalCoupons = await Coupon.countDocuments({ isDeleted: { $ne: true } });
    console.log('Total coupons count:', totalCoupons);
    
    const coupons = await Coupon.find({ isDeleted: { $ne: true } })
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit)
      .lean(); // Use lean() for better performance

    console.log('Found coupons:', coupons.length);

    // Process coupons with actual usage count from orders
    const processedCoupons = await Promise.all(coupons.map(async (coupon) => {
      // Get actual usage count from orders
      const actualUsageCount = await Order.countDocuments({
        'coupon.couponId': coupon._id,
        orderStatus: { $ne: 'payment-failed' }
      });

      // Update the coupon's usedCount if it doesn't match actual usage
      if (coupon.usedCount !== actualUsageCount) {
        await Coupon.findByIdAndUpdate(coupon._id, { usedCount: actualUsageCount });
      }

      // Set default values for missing fields to prevent view errors
      return {
        _id: coupon._id,
        name: coupon.name || 'UNKNOWN',
        description: coupon.description || 'No description available',
        discountType: coupon.discountType || 'fixed',
        discountValue: coupon.discountValue || coupon.offerPrice || 0,
        minimumPrice: coupon.minimumPrice || 0,
        maxDiscountAmount: coupon.maxDiscountAmount || null,
        usageLimit: coupon.usageLimit || null,
        usedCount: actualUsageCount, // Use actual count from orders
        expireOn: coupon.expireOn || new Date(),
        isList: coupon.isList !== undefined ? coupon.isList : true,
        isActive: coupon.isActive !== undefined ? coupon.isActive : true,
        createdOn: coupon.createdOn || new Date(),
        createdBy: coupon.createdBy || null
      };
    }));

    const totalPages = Math.ceil(totalCoupons / limit);

    console.log('Rendering coupons page with', processedCoupons.length, 'coupons');
    
    res.render('coupons', {
      coupons: processedCoupons,
      currentPage: page,
      totalPages,
      totalCoupons,
      limit
    });
  } catch (error) {
    console.error('=== ERROR LOADING COUPONS ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Try to render with empty data if there's an error
    try {
      res.render('coupons', {
        coupons: [],
        currentPage: 1,
        totalPages: 1,
        totalCoupons: 0,
        limit: 6
      });
    } catch (renderError) {
      console.error('Error rendering coupons page:', renderError);
      res.status(500).send('Error loading coupons page: ' + error.message);
    }
  }
};

// Load add coupon page
const loadAddCoupon = async (req, res) => {
  try {
    res.render('addCoupon');
  } catch (error) {
    console.error('Error loading add coupon page:', error);
    res.status(500).send('Error loading add coupon page');
  }
};

// Add new coupon
const addCoupon = async (req, res) => {
  try {
    const {
      name,
      description,
      discountType,
      discountValue,
      minimumPrice,
      maxDiscountAmount,
      usageLimit,
      expireOn
    } = req.body;

    console.log('Adding new coupon:', { name, discountType, discountValue });

    // Validation
    if (!name || !description || !discountType || !discountValue || !minimumPrice || !expireOn) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    // Check if coupon name already exists
    const existingCoupon = await Coupon.findOne({ 
      name: name.toUpperCase().trim() 
    });
    
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }

    // Validate discount value
    if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Percentage discount must be between 1 and 100'
      });
    }

    if (discountType === 'fixed' && discountValue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Fixed discount amount must be greater than 0'
      });
    }

    // Validate expiry date
    const expiryDate = new Date(expireOn);
    if (expiryDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Expiry date must be in the future'
      });
    }

    // Validate minimum price
    if (minimumPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum purchase amount cannot be negative'
      });
    }

    // Create new coupon
    const newCoupon = new Coupon({
      name: name.toUpperCase().trim(),
      description: description.trim(),
      discountType,
      discountValue: parseFloat(discountValue),
      offerPrice: parseFloat(discountValue), // Set offerPrice explicitly
      minimumPrice: parseFloat(minimumPrice),
      maxDiscountAmount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
      usageLimit: usageLimit ? parseInt(usageLimit) : null,
      expireOn: expiryDate,
      createdBy: req.admin?._id || null,
      isList: true,
      isActive: true,
      usedCount: 0
    });

    const savedCoupon = await newCoupon.save();
    console.log('Coupon saved successfully:', savedCoupon.name);

    res.json({
      success: true,
      message: 'Coupon created successfully'
    });

  } catch (error) {
    console.error('Error adding coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating coupon: ' + error.message
    });
  }
};

// Load edit coupon page
const loadEditCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const coupon = await Coupon.findOne({ 
      _id: couponId, 
      isDeleted: { $ne: true } 
    }).lean();

    if (!coupon) {
      return res.status(404).send('Coupon not found');
    }

    // Get actual usage statistics from orders
    const actualUsageCount = await Order.countDocuments({
      'coupon.couponId': couponId,
      orderStatus: { $ne: 'payment-failed' }
    });

    // Get total discount given
    const totalDiscountResult = await Order.aggregate([
      {
        $match: {
          'coupon.couponId': coupon._id,
          orderStatus: { $ne: 'payment-failed' }
        }
      },
      {
        $group: {
          _id: null,
          totalDiscount: { $sum: '$couponDiscount' }
        }
      }
    ]);

    const totalDiscountGiven = totalDiscountResult[0]?.totalDiscount || 0;

    // Get list of users who used this coupon
    const usersWhoUsedCoupon = await Order.find({
      'coupon.couponId': couponId,
      orderStatus: { $ne: 'payment-failed' }
    })
    .populate('user', 'name email')
    .select('user orderID couponDiscount createdAt')
    .sort({ createdAt: -1 });

    // Update the coupon's usedCount if it doesn't match actual usage
    if (coupon.usedCount !== actualUsageCount) {
      await Coupon.findByIdAndUpdate(couponId, { usedCount: actualUsageCount });
    }

    // Ensure coupon has all required fields for the view
    const processedCoupon = {
      _id: coupon._id,
      name: coupon.name || 'UNKNOWN',
      description: coupon.description || 'No description available',
      discountType: coupon.discountType || 'fixed',
      discountValue: coupon.discountValue || coupon.offerPrice || 0,
      minimumPrice: coupon.minimumPrice || 0,
      maxDiscountAmount: coupon.maxDiscountAmount || null,
      usageLimit: coupon.usageLimit || null,
      usedCount: actualUsageCount, // Use actual count from orders
      expireOn: coupon.expireOn || new Date(),
      isList: coupon.isList !== undefined ? coupon.isList : true,
      isActive: coupon.isActive !== undefined ? coupon.isActive : true,
      createdOn: coupon.createdOn || new Date(),
      totalDiscountGiven: totalDiscountGiven,
      usersWhoUsed: usersWhoUsedCoupon
    };

    console.log('Coupon usage stats:', {
      couponCode: processedCoupon.name,
      actualUsage: actualUsageCount,
      storedUsage: coupon.usedCount,
      totalDiscount: totalDiscountGiven,
      usersCount: usersWhoUsedCoupon.length
    });

    res.render('editCoupon', { coupon: processedCoupon });
  } catch (error) {
    console.error('Error loading edit coupon page:', error);
    res.status(500).send('Error loading edit coupon page');
  }
};

// Update coupon
const updateCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    const {
      name,
      description,
      discountType,
      discountValue,
      minimumPrice,
      maxDiscountAmount,
      usageLimit,
      expireOn
    } = req.body;

    // Find the coupon
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Validation
    if (!name || !description || !discountType || !discountValue || !minimumPrice || !expireOn) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    // Check if coupon name already exists (excluding current coupon)
    const existingCoupon = await Coupon.findOne({ 
      name: name.toUpperCase().trim(),
      _id: { $ne: couponId }
    });
    
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }

    // Validate discount value
    if (discountType === 'percentage' && (discountValue <= 0 || discountValue > 100)) {
      return res.status(400).json({
        success: false,
        message: 'Percentage discount must be between 1 and 100'
      });
    }

    if (discountType === 'fixed' && discountValue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Fixed discount amount must be greater than 0'
      });
    }

    // Validate expiry date
    const expiryDate = new Date(expireOn);
    if (expiryDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Expiry date must be in the future'
      });
    }

    // Validate minimum price
    if (minimumPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum purchase amount cannot be negative'
      });
    }

    // Get actual usage count before updating
    const actualUsageCount = await Order.countDocuments({
      'coupon.couponId': couponId,
      orderStatus: { $ne: 'payment-failed' }
    });

    // Validate usage limit against actual usage
    if (usageLimit && parseInt(usageLimit) < actualUsageCount) {
      return res.status(400).json({
        success: false,
        message: `Usage limit cannot be less than current usage (${actualUsageCount})`
      });
    }

    // Update coupon
    coupon.name = name.toUpperCase().trim();
    coupon.description = description.trim();
    coupon.discountType = discountType;
    coupon.discountValue = parseFloat(discountValue);
    coupon.offerPrice = parseFloat(discountValue); // Set offerPrice explicitly
    coupon.minimumPrice = parseFloat(minimumPrice);
    coupon.maxDiscountAmount = maxDiscountAmount ? parseFloat(maxDiscountAmount) : null;
    coupon.usageLimit = usageLimit ? parseInt(usageLimit) : null;
    coupon.expireOn = expiryDate;
    coupon.usedCount = actualUsageCount; // Update with actual count

    await coupon.save();

    res.json({
      success: true,
      message: 'Coupon updated successfully'
    });

  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating coupon: ' + error.message
    });
  }
};

// Toggle coupon status (list/unlist)
const toggleCouponStatus = async (req, res) => {
  try {
    const couponId = req.params.id;
    const coupon = await Coupon.findOne({ 
      _id: couponId, 
      isDeleted: { $ne: true } 
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    coupon.isList = !coupon.isList;
    await coupon.save();

    res.json({
      success: true,
      message: `Coupon ${coupon.isList ? 'listed' : 'unlisted'} successfully`,
      isListed: coupon.isList
    });

  } catch (error) {
    console.error('Error toggling coupon status:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating coupon status'
    });
  }
};

// Delete coupon
const deleteCoupon = async (req, res) => {
  try {
    console.log('=== DELETE COUPON REQUEST ===');
    const couponId = req.params.id;
    console.log('Coupon ID to delete:', couponId);

    // Validate coupon ID
    if (!couponId) {
      console.log('No coupon ID provided');
      return res.status(400).json({
        success: false,
        message: 'Coupon ID is required'
      });
    }

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(couponId)) {
      console.log('Invalid ObjectId format:', couponId);
      return res.status(400).json({
        success: false,
        message: 'Invalid coupon ID format'
      });
    }

    // Check if coupon exists first
    const existingCoupon = await Coupon.findById(couponId);
    if (!existingCoupon) {
      console.log('Coupon not found:', couponId);
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    console.log('Found coupon to delete:', existingCoupon.name);

    // Check if coupon is being used in any orders using both string and ObjectId
    console.log('Checking for orders using this coupon...');
    const ordersWithCoupon = await Order.countDocuments({
      $or: [
        { 'coupon.couponId': couponId },
        { 'coupon.couponId': new mongoose.Types.ObjectId(couponId) }
      ],
      orderStatus: { $ne: 'payment-failed' }
    });

    console.log('Orders using this coupon:', ordersWithCoupon);

    if (ordersWithCoupon > 0) {
      console.log('Coupon has been used in orders - performing soft delete');
      
      // Perform soft delete
      const softDeletedCoupon = await Coupon.findByIdAndUpdate(
        couponId,
        {
          isDeleted: true,
          deletedAt: new Date(),
          isList: false, // Also unlist the coupon
          isActive: false // Deactivate the coupon
        },
        { new: true }
      );

      if (!softDeletedCoupon) {
        console.log('Failed to soft delete coupon');
        return res.status(500).json({
          success: false,
          message: 'Failed to delete coupon'
        });
      }

      console.log('Coupon soft deleted successfully:', softDeletedCoupon.name);

      return res.status(200).json({
        success: true, // Set to true for successful soft delete
        message: 'Coupon deleted successfully'
      });
    }

    // Hard delete the coupon if it hasn't been used
    console.log('Coupon has not been used - performing hard delete');
    const deletedCoupon = await Coupon.findByIdAndDelete(couponId);

    if (!deletedCoupon) {
      console.log('Failed to delete coupon');
      return res.status(500).json({
        success: false,
        message: 'Failed to delete coupon'
      });
    }

    console.log('Coupon hard deleted successfully:', deletedCoupon.name);

    res.status(200).json({
      success: true,
      message: 'Coupon deleted successfully'
    });

  } catch (error) {
    console.error('=== ERROR DELETING COUPON ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    // Handle specific MongoDB errors
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Invalid coupon ID format'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error deleting coupon: ' + error.message
    });
  }
};

// Get coupon usage statistics
const getCouponStats = async (req, res) => {
  try {
    const couponId = req.params.id;
    
    // Get coupon details
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    // Get usage statistics
    const totalUsage = await Order.countDocuments({
      'coupon.couponId': couponId,
      orderStatus: { $ne: 'payment-failed' }
    });

    const totalDiscount = await Order.aggregate([
      {
        $match: {
          'coupon.couponId': coupon._id,
          orderStatus: { $ne: 'payment-failed' }
        }
      },
      {
        $group: {
          _id: null,
          totalDiscount: { $sum: '$couponDiscount' }
        }
      }
    ]);

    const recentOrders = await Order.find({
      'coupon.couponId': couponId,
      orderStatus: { $ne: 'payment-failed' }
    })
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(10)
    .select('orderID user couponDiscount finalAmount createdAt');

    res.json({
      success: true,
      stats: {
        coupon,
        totalUsage,
        totalDiscount: totalDiscount[0]?.totalDiscount || 0,
        recentOrders
      }
    });

  } catch (error) {
    console.error('Error getting coupon stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching coupon statistics'
    });
  }
};

module.exports = {
  loadCoupons,
  loadAddCoupon,
  addCoupon,
  loadEditCoupon,
  updateCoupon,
  toggleCouponStatus,
  deleteCoupon,
  getCouponStats
};