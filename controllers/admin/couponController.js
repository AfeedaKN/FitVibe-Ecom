const Coupon = require('../../models/couponSchema');
const Order = require('../../models/orderSchema');
const mongoose = require('mongoose');


const loadCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 6;
    const skip = (page - 1) * limit;

   
    const filter = { isDeleted: { $ne: true } };
    const searchQuery = req.query.search?.trim();
    if (searchQuery) {
      filter.$or = [
        { name: { $regex: searchQuery, $options: 'i' } },
        { description: { $regex: searchQuery, $options: 'i' } }
      ];
    }

    
    const totalCoupons = await Coupon.countDocuments(filter);

    
    const coupons = await Coupon.find(filter)
      .sort({ createdOn: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    
    const processedCoupons = await Promise.all(coupons.map(async (coupon) => {
      const actualUsageCount = await Order.countDocuments({
        'coupon.couponId': coupon._id,
        orderStatus: { $ne: 'payment-failed' }
      });

      if (coupon.usedCount !== actualUsageCount) {
        await Coupon.findByIdAndUpdate(coupon._id, { usedCount: actualUsageCount });
      }

      return {
        _id: coupon._id,
        name: coupon.name || 'UNKNOWN',
        description: coupon.description || 'No description available',
        discountType: coupon.discountType || 'fixed',
        discountValue: coupon.discountValue || coupon.offerPrice || 0,
        minimumPrice: coupon.minimumPrice || 0,
        maxDiscountAmount: coupon.maxDiscountAmount || null,
        usageLimit: coupon.usageLimit || null,
        usedCount: actualUsageCount,
        expireOn: coupon.expireOn || new Date(),
        isList: coupon.isList !== undefined ? coupon.isList : true,
        isActive: coupon.isActive !== undefined ? coupon.isActive : true,
        createdOn: coupon.createdOn || new Date(),
        createdBy: coupon.createdBy || null
      };
    }));

    const totalPages = Math.ceil(totalCoupons / limit);

    res.render('coupons', {
      coupons: processedCoupons,
      currentPage: page,
      totalPages,
      totalCoupons,
      limit,
      query: req.query 
    });
  } catch (error) {
    console.error('=== ERROR LOADING COUPONS ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);

    try {
      res.render('coupons', {
        coupons: [],
        currentPage: 1,
        totalPages: 1,
        totalCoupons: 0,
        limit: 6,
        query: req.query
      });
    } catch (renderError) {
      console.error('Error rendering coupons page:', renderError);
      res.status(500).send('Error loading coupons page: ' + error.message);
    }
  }
};

const loadAddCoupon = async (req, res) => {
  try {
    res.render('addCoupon');
  } catch (error) {
    console.error('Error loading add coupon page:', error);
    res.status(500).send('Error loading add coupon page');
  }
};

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

 
    if (!name || !description || !discountType || !discountValue || !minimumPrice || !expireOn) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    const existingCoupon = await Coupon.findOne({ 
      name: name.toUpperCase().trim() 
    });
    
    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        message: 'Coupon code already exists'
      });
    }

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

    const expiryDate = new Date(expireOn);
    if (expiryDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Expiry date must be in the future'
      });
    }

    if (minimumPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum purchase amount cannot be negative'
      });
    }

    const newCoupon = new Coupon({
      name: name.toUpperCase().trim(),
      description: description.trim(),
      discountType,
      discountValue: parseFloat(discountValue),
      offerPrice: parseFloat(discountValue),
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

    const actualUsageCount = await Order.countDocuments({
      'coupon.couponId': couponId,
      orderStatus: { $ne: 'payment-failed' }
    });

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

    const usersWhoUsedCoupon = await Order.find({
      'coupon.couponId': couponId,
      orderStatus: { $ne: 'payment-failed' }
    })
    .populate('user', 'name email')
    .select('user orderID couponDiscount createdAt')
    .sort({ createdAt: -1 });

    if (coupon.usedCount !== actualUsageCount) {
      await Coupon.findByIdAndUpdate(couponId, { usedCount: actualUsageCount });
    }

    const processedCoupon = {
      _id: coupon._id,
      name: coupon.name || 'UNKNOWN',
      description: coupon.description || 'No description available',
      discountType: coupon.discountType || 'fixed',
      discountValue: coupon.discountValue || coupon.offerPrice || 0,
      minimumPrice: coupon.minimumPrice || 0,
      maxDiscountAmount: coupon.maxDiscountAmount || null,
      usageLimit: coupon.usageLimit || null,
      usedCount: actualUsageCount, 
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

    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    if (!name || !description || !discountType || !discountValue || !minimumPrice || !expireOn) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

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

    const expiryDate = new Date(expireOn);
    if (expiryDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Expiry date must be in the future'
      });
    }

    if (minimumPrice < 0) {
      return res.status(400).json({
        success: false,
        message: 'Minimum purchase amount cannot be negative'
      });
    }

    const actualUsageCount = await Order.countDocuments({
      'coupon.couponId': couponId,
      orderStatus: { $ne: 'payment-failed' }
    });

    if (usageLimit && parseInt(usageLimit) < actualUsageCount) {
      return res.status(400).json({
        success: false,
        message: `Usage limit cannot be less than current usage (${actualUsageCount})`
      });
    }

    coupon.name = name.toUpperCase().trim();
    coupon.description = description.trim();
    coupon.discountType = discountType;
    coupon.discountValue = parseFloat(discountValue);
    coupon.offerPrice = parseFloat(discountValue);
    coupon.minimumPrice = parseFloat(minimumPrice);
    coupon.maxDiscountAmount = maxDiscountAmount ? parseFloat(maxDiscountAmount) : null;
    coupon.usageLimit = usageLimit ? parseInt(usageLimit) : null;
    coupon.expireOn = expiryDate;
    coupon.usedCount = actualUsageCount;

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

const deleteCoupon = async (req, res) => {
  try {
    const couponId = req.params.id;
    console.log('Coupon ID to delete:', couponId);

    if (!couponId) {
      console.log('No coupon ID provided');
      return res.status(400).json({
        success: false,
        message: 'Coupon ID is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(couponId)) {
      console.log('Invalid ObjectId format:', couponId);
      return res.status(400).json({
        success: false,
        message: 'Invalid coupon ID format'
      });
    }

    const existingCoupon = await Coupon.findById(couponId);
    if (!existingCoupon) {
      console.log('Coupon not found:', couponId);
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

    console.log('Found coupon to delete:', existingCoupon.name);

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
      
      const softDeletedCoupon = await Coupon.findByIdAndUpdate(
        couponId,
        {
          isDeleted: true,
          deletedAt: new Date(),
          isList: false, 
          isActive: false 
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
        success: true, 
        message: 'Coupon deleted successfully'
      });
    }

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

const getCouponStats = async (req, res) => {
  try {
    const couponId = req.params.id;
    
    const coupon = await Coupon.findById(couponId);
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: 'Coupon not found'
      });
    }

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