const User = require("../../models/userSchema");
const Address = require("../../models/addressSchema")

const loadaddresses = async (req, res) => {
  try {
    const userId = req.session.user._id;
    
    const addresses = await Address.find({ user: userId }).sort({ isDefault: -1 });
    const defaultAddress = addresses.find(addr => addr.isDefault) || null;
    res.render("addresses", {
      addresses,
      defaultAddress,
      user: req.user,
      messages: { error: null, success: null }
    });
  } catch (error) {
    console.error('Error fetching address:', error);
    res.status(500).json({ message: 'Server Error' });

  }
}

const getAddress = async (req, res) => {
  try {
    const addressId = req.params.id;


    const address = await Address.findOne({
      _id: addressId,
      user: req.user._id
    });

    if (!address) {
      return res.status(404).json({ message: 'Address not found' });
    }

    res.json(address);
  } catch (error) {
    console.error('Error fetching address:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

 const saveAddress = async (req, res) => {
  try {
    const { addressId, name, address, city, state, zipCode, country, phone } = req.body;
    const userId = req.user._id;

    const addressData = {
      user: userId,
      name,
      address,
      city,
      state,
      zipCode,
      country,
      phone
    };

    
    const addressCount = await Address.countDocuments({ user: userId });
    if (addressCount === 0) {
      addressData.isDefault = true;
    }

    if (addressId) {
      const updated = await Address.findOneAndUpdate(
        { _id: addressId, user: userId },
        addressData,
        { new: true }
      );

      if (!updated) {
        return res.status(404).json({ message: "Address not found" });
      }

      res.json({ success: true, message: "Address updated" });
    } else {
      const newAddress = await Address.create(addressData);

      
      await User.findByIdAndUpdate(userId, {
        $push: { addresses: newAddress._id }
      });

      res.redirect("/profile/addresses");
    }
  } catch (error) {
    console.error("Save Address Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const setDefaultAddress = async (req, res) => {
  try {
    const { addressId } = req.body;
    const userId = req.user._id;

    await Address.updateMany({ user: userId }, { $set: { isDefault: false } });

    const updated = await Address.findOneAndUpdate(
      { _id: addressId, user: userId },
      { $set: { isDefault: true } },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Address not found' });
    }

    return res.redirect("/profile/addresses");
  } catch (error) {
    console.error("Set Default Address Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const deleteAddress = async (req, res) => {
  try {
    const addressId = req.params.id;
    const userId = req.user._id;

    const deleted = await Address.findOneAndDelete({ _id: addressId, user: userId });

    if (!deleted) {
      return res.status(404).json({ success: false, message: "Address not found" });
    }

 
 res.redirect('/profile/addresses');
  } catch (error) {
    console.error("Delete Address Error:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

const editAddress = async (req, res) => {
  try {
    const { addressId, name, address: updatedAddress, city, state, zipCode, country, phone } = req.body;

    const address = await Address.findOne({ _id: addressId, user: req.user._id });

    if (address) {
      address.name = name;
      address.address = updatedAddress;
      address.city = city;
      address.state = state;
      address.zipCode = zipCode;
      address.country = country;
      address.phone = phone;

      await address.save();
      req.flash('success', 'Address updated successfully');
    } else {
      req.flash('error', 'Address not found');
    }

    res.redirect('/profile/addresses');
  } catch (error) {
    console.error(error);
    req.flash('error', 'Something went wrong');
    res.redirect('/profile/addresses');
  }
};





module.exports = {
  getAddress,
  saveAddress,
  setDefaultAddress,
  loadaddresses,
  deleteAddress,
  editAddress
};