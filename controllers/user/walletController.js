const User = require('../../models/userSchema');
const Wallet = require('../../models/walletShema');
 
const getWalletPage = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        if (!userId) {
            console.error('Session user ID not found');
            return res.status(401).render('pageNotFound', { message: 'Please log in to access your wallet' });
        }

        const user = await User.findById(userId);
        if (!user) {
            console.error('User not found for ID:', userId);
            return res.status(404).render('pageNotFound', { message: 'User not found' });
        }

        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({ userId, balance: 0, transactions: [] });
            await wallet.save();
            console.log('Created new wallet for user:', userId);
        }
 
        console.log('Wallet retrieved:', wallet);

        res.render('wallet', {
            user,
            wallet
        });
    } catch (error) {
        console.error('Error fetching wallet:', error);
        res.status(500).render('pageNotFound', { message: 'Error loading wallet details' });
    }
};

const addFunds = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        if (!userId) {
            console.error('Session user ID not found');
            return res.status(401).json({ success: false, message: 'Please log in to add funds' });
        }

        const amount = parseFloat(req.body.amount);
        if (!amount || amount <= 0) {
            console.error('Invalid amount provided:', amount);
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        const user = await User.findById(userId);
        if (!user) {
            console.error('User not found for ID:', userId);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.isBlocked) {
            console.error('Blocked user attempted to add funds:', userId);
            return res.status(403).json({ success: false, message: 'Account is blocked' });
        }

        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            wallet = new Wallet({
                userId,
                balance: amount,
                transactions: [{
                    type: 'credit',
                    amount,
                    description: 'Initial wallet funding'
                }]
            });
        } else {
            wallet.balance += amount;
            wallet.transactions.unshift({
                type: 'credit',
                amount,
                description: 'Added to wallet'
            });
        }

        await wallet.save();
        console.log('Funds added successfully:', { userId, amount, newBalance: wallet.balance });

        return res.status(200).json({ success: true, message: 'Funds added successfully' });
    } catch (error) {
        console.error('Error adding funds:', error);
        return res.status(500).json({ success: false, message: 'Server error adding funds' });
    }
};

const withdrawFunds = async (req, res) => {
    try {
        const userId = req.session.user?._id;
        if (!userId) {
            console.error('Session user ID not found');
            return res.status(401).json({ success: false, message: 'Please log in to withdraw funds' });
        }

        const amount = parseFloat(req.body.amount);
        if (!amount || amount <= 0) {
            console.error('Invalid amount provided:', amount);
            return res.status(400).json({ success: false, message: 'Invalid amount' });
        }

        const user = await User.findById(userId);
        if (!user) {
            console.error('User not found for ID:', userId);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (user.isBlocked) {
            console.error('Blocked user attempted to withdraw funds:', userId);
            return res.status(403).json({ success: false, message: 'Account is blocked' });
        }

        let wallet = await Wallet.findOne({ userId });
        if (!wallet) {
            console.error('Wallet not found for user:', userId);
            return res.status(404).json({ success: false, message: 'Wallet not found' });
        }

        if (wallet.balance < amount) {
            console.error('Insufficient balance for withdrawal:', { userId, amount, balance: wallet.balance });
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }

        wallet.balance -= amount;
        wallet.transactions.unshift({
            type: 'debit',
            amount,
            description: 'Funds withdrawn from wallet'
        });

        await wallet.save();
        console.log('Funds withdrawn successfully:', { userId, amount, newBalance: wallet.balance });

        return res.status(200).json({ success: true, message: 'Funds withdrawn successfully' });
    } catch (error) {
        console.error('Error withdrawing funds:', error);
        return res.status(500).json({ success: false, message: 'Server error withdrawing funds' });
    }
};

module.exports = {
    getWalletPage,
    addFunds,
    withdrawFunds
};