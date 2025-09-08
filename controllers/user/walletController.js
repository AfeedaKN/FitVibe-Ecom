const User = require('../../models/userSchema');
const Wallet = require('../../models/walletShema');
const mongoose = require("mongoose");




const createTransaction = (wallet, transactionData) => {
  const transaction = {
    transactionId: 'TXN' + Date.now() + Math.random().toString(36).substr(2, 5).toUpperCase(),
    type: transactionData.type,
    amount: transactionData.amount,
    description: transactionData.description || `${transactionData.type === 'credit' ? 'Credit' : 'Debit'} transaction`,
    balanceAfter: transactionData.type === 'credit' 
      ? wallet.balance + transactionData.amount 
      : Math.max(0, wallet.balance - transactionData.amount),
    orderId: transactionData.orderId || null,
    status: transactionData.status || "completed",
    source: transactionData.source || (transactionData.orderId ? "order_payment" : "cashback"),
    metadata: transactionData.metadata || {},   
    createdAt: new Date(),
    updatedAt: new Date()
  };
  return transaction;
};

const findOrCreateWallet = async (userId) => {
  let wallet = await Wallet.findOne({ userId });
  if (!wallet) {
    wallet = await Wallet.create({ userId, balance: 0, transactions: [] });
    
  }
  return wallet;
};

const getWalletPage = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) {
      return res.status(401).render("pageNotFound", { message: "Please log in to access your wallet" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).render("pageNotFound", { message: "User not found" });
    }

    const wallet = await findOrCreateWallet(userId);

    const stats = {
      totalCredits: wallet.transactions
        .filter(t => t.type === "credit" && t.status === "completed")
        .reduce((sum, t) => sum + t.amount, 0),
      totalDebits: wallet.transactions
        .filter(t => t.type === "debit" && t.status === "completed")
        .reduce((sum, t) => sum + t.amount, 0),
      transactionCount: wallet.transactions.length,
      lastTransactionAt: wallet.transactions.length > 0 
        ? wallet.transactions.sort((a, b) => b.createdAt - a.createdAt)[0].createdAt 
        : null
    };

    res.render("wallet", {
      user,
      wallet,
      stats
    });
  } catch (error) {
    console.error("Error fetching wallet:", error);
    res.status(500).render("pageNotFound", { message: "Error loading wallet details" });
  }
};

const addFunds = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to add funds" });
    }

    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: "Account is blocked" });
    }

    const wallet = await findOrCreateWallet(userId);
    const transaction = createTransaction(wallet, {
      type: "credit",
      amount,
      description: "Added to wallet",
      source: "cashback"
    });

    wallet.transactions.unshift(transaction);
    if (transaction.status === "completed") {
      wallet.balance += amount;
    }

    await wallet.save();
    return res.status(200).json({ success: true, message: "Funds added successfully", transaction });
  } catch (error) {
    console.error("Error adding funds:", error);
    return res.status(500).json({ success: false, message: "Server error adding funds" });
  }
};

const withdrawFunds = async (req, res) => {
  try {
    const userId = req.session.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to withdraw funds" });
    }

    const amount = parseFloat(req.body.amount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: "Account is blocked" });
    }

    const wallet = await findOrCreateWallet(userId);
    if (wallet.balance < amount) {
      return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
    }

    const transaction = createTransaction(wallet, {
      type: "debit",
      amount,
      description: "Withdrawn from wallet",
      source: "admin_debit"
    });

    wallet.transactions.unshift(transaction);
    if (transaction.status === "completed") {
      wallet.balance -= amount;
    }

    await wallet.save();
    return res.status(200).json({ success: true, message: "Funds withdrawn successfully", transaction });
  } catch (error) {
    console.error("Error withdrawing funds:", error);
    return res.status(500).json({ success: false, message: "Server error withdrawing funds" });
  }
};

const getTransactionHistory = async (req, res) => {
  try {
    const { userId, limit = 10, skip = 0, type, status } = req.query;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Please log in to view transaction history" });
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({ success: false, message: "Wallet not found" });
    }

    let transactions = wallet.transactions;
    if (type) transactions = transactions.filter(t => t.type === type);
    if (status) transactions = transactions.filter(t => t.status === status);

    const totalTransactions = transactions.length;
    transactions = transactions
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(Number(skip), Number(skip) + Number(limit));

    res.json({
      success: true,
      transactions,
      totalTransactions,
      hasMore: Number(skip) + Number(limit) < totalTransactions
    });
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    res.status(500).json({ success: false, message: "Server error fetching transaction history" });
  }
};

const adminAddCredit = async (req, res) => {
  try {
    const { userId, amount, description, source = "admin_credit", metadata = {} } = req.body;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: "Invalid user ID" });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid amount" });
    }

    const wallet = await findOrCreateWallet(userId);
    const transaction = createTransaction(wallet, {
      type: "credit",
      amount,
      description: description || "Admin credit",
      source,
      metadata
    });

    wallet.transactions.unshift(transaction);
    if (transaction.status === "completed") {
      wallet.balance += amount;
    }

    await wallet.save();
    return res.status(200).json({ success: true, message: "Credit added successfully", transaction });
  } catch (error) {
    console.error("Error adding admin credit:", error);
    return res.status(500).json({ success: false, message: "Server error adding credit" });
  }
};

module.exports = {
  getWalletPage,
  addFunds,
  withdrawFunds,
  getTransactionHistory,
  adminAddCredit,
  createTransaction,
  findOrCreateWallet
};