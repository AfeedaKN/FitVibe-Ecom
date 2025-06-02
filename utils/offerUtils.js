const determineBestOffer = (productOffer, categoryOffer) => {
  productOffer = Number(productOffer) || 0
  categoryOffer = Number(categoryOffer) || 0

  if (productOffer >= categoryOffer) {
    return {
      offerValue: productOffer,
      offerSource: "product",
      isBetter: true,
    }
  } else {
    return {
      offerValue: categoryOffer,
      offerSource: "category",
      isBetter: false,
    }
  }
}

const calculateBestPrice = (originalPrice, productOffer, categoryOffer) => {
  const bestOffer = determineBestOffer(productOffer, categoryOffer)
  const discount = (originalPrice * bestOffer.offerValue) / 100
  const salePrice = Math.round(originalPrice - discount)

  return {
    salePrice,
    appliedOffer: bestOffer.offerValue,
    offerSource: bestOffer.offerSource,
  }
}

module.exports = {
  determineBestOffer,
  calculateBestPrice,
}
