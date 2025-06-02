// Global variables
let cropper = null
let currentImageIndex = 0
let croppedImages = []
let imagesToProcess = []
let isProcessingImages = false
let currentModal = null

// Ensure Bootstrap and Cropper are available
const bootstrap = window.bootstrap
const Cropper = window.Cropper

// Initialize image cropping functionality
function initializeImageCropping() {
  const imageInput = document.getElementById("productImages")
  if (!imageInput) return

  imageInput.addEventListener("change", handleImageSelection)
}

// Handle image selection
function handleImageSelection(event) {
  const files = Array.from(event.target.files)
  if (files.length === 0) return

  // Validate file types
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
  const invalidFiles = files.filter((file) => !validTypes.includes(file.type))

  if (invalidFiles.length > 0) {
    alert("Please select only image files (JPEG, PNG, WebP)")
    event.target.value = ""
    return
  }

  // Validate file sizes (5MB max)
  const oversizedFiles = files.filter((file) => file.size > 5 * 1024 * 1024)
  if (oversizedFiles.length > 0) {
    alert("Some files are too large. Maximum size is 5MB per image.")
    event.target.value = ""
    return
  }

  // Check minimum images for add product page
  if (window.location.pathname.includes("addproducts") && files.length < 3) {
    alert("Please select at least 3 images for the product.")
    event.target.value = ""
    return
  }

  // Store files for processing
  imagesToProcess = files
  currentImageIndex = 0
  croppedImages = []
  isProcessingImages = true

  // Start cropping process
  if (files.length > 0) {
    showImageCropper(files[0])
  }
}

// Show image cropper modal - SIMPLIFIED AND FIXED
function showImageCropper(file) {
  const modal = document.getElementById("cropModal")
  const cropImage = document.getElementById("cropImage")

  if (!modal || !cropImage) {
    console.error("Crop modal elements not found")
    return
  }

  // Clean up any existing state
  cleanupCropper()

  // Update modal title
  const modalTitle = modal.querySelector(".modal-title")
  if (modalTitle) {
    modalTitle.textContent = `Crop Image ${currentImageIndex + 1} of ${imagesToProcess.length}`
  }

  // Create image URL and set it
  const imageUrl = URL.createObjectURL(file)
  cropImage.src = imageUrl

  // Create modal instance if it doesn't exist
  if (!currentModal) {
    currentModal = new bootstrap.Modal(modal, {
      backdrop: "static",
      keyboard: false,
    })
  }

  // Set up event listeners - ONE TIME ONLY
  setupModalEventListeners(modal, imageUrl)

  // Show modal
  currentModal.show()
}

// Setup modal event listeners - SIMPLIFIED
function setupModalEventListeners(modal, imageUrl) {
  // Remove any existing listeners first
  const newModal = modal.cloneNode(true)
  modal.parentNode.replaceChild(newModal, modal)

  // Update currentModal reference
  currentModal = new bootstrap.Modal(newModal, {
    backdrop: "static",
    keyboard: false,
  })

  // Handle modal shown event
  newModal.addEventListener("shown.bs.modal", () => {
    const cropImage = newModal.querySelector("#cropImage")

    // Initialize cropper with simplified settings
    setTimeout(() => {
      if (cropImage && !cropper) {
        cropper = new Cropper(cropImage, {
          aspectRatio: 4 / 5,
          viewMode: 1,
          dragMode: "move",
          autoCropArea: 0.8,
          restore: false,
          guides: true,
          center: true,
          highlight: false,
          cropBoxMovable: true,
          cropBoxResizable: true,
          toggleDragModeOnDblclick: false,
          ready: () => {
            console.log(`Cropper ready for image ${currentImageIndex + 1}`)
            // Enable the crop button when ready
            const cropConfirmBtn = newModal.querySelector("#cropConfirm")
            if (cropConfirmBtn) {
              cropConfirmBtn.disabled = false
              cropConfirmBtn.innerHTML = "Crop & Save"
            }
          },
        })
      }
    }, 300)
  })

  // Handle modal hidden event
  newModal.addEventListener("hidden.bs.modal", () => {
    cleanupCropper()
    URL.revokeObjectURL(imageUrl)
  })

  // Setup crop confirm button
  const cropConfirmBtn = newModal.querySelector("#cropConfirm")
  if (cropConfirmBtn) {
    cropConfirmBtn.disabled = false
    cropConfirmBtn.innerHTML = "Crop & Save"
    cropConfirmBtn.addEventListener("click", () => {
      processCroppedImage(cropConfirmBtn)
    })
  }

  // Setup skip button if it exists
  const skipBtn = newModal.querySelector("#skipCropping")
  if (skipBtn) {
    skipBtn.addEventListener("click", () => {
      skipCropping()
    })
  } else {
    // Add skip button if it doesn't exist
    addSkipButton(newModal)
  }

  // Show the modal
  currentModal.show()
}

// Process cropped image - SIMPLIFIED
function processCroppedImage(cropConfirmBtn) {
  if (!cropper) {
    console.error("Cropper not initialized")
    return
  }

  if (!cropConfirmBtn) {
    cropConfirmBtn = document.querySelector("#cropConfirm")
  }
  if (cropConfirmBtn) {
    cropConfirmBtn.disabled = true
    cropConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'
  }

  try {
    const canvas = cropper.getCroppedCanvas({
      width: 600,
      height: 750,
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "medium",
      fillColor: "#fff",
    })

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          console.error("Failed to create blob from canvas")
          if (cropConfirmBtn) {
            cropConfirmBtn.disabled = false
            cropConfirmBtn.innerHTML = "Crop & Save"
          }
          return
        }

        // Create cropped file
        const croppedFile = new File([blob], imagesToProcess[currentImageIndex].name, {
          type: "image/jpeg",
          lastModified: Date.now(),
        })

        croppedImages.push(croppedFile)
        console.log(`Processed image ${currentImageIndex + 1} of ${imagesToProcess.length}`)

        // Hide modal and continue
        if (currentModal) {
          currentModal.hide()
        }

        // Reset crop button for next use
        if (cropConfirmBtn) {
          cropConfirmBtn.disabled = false
          cropConfirmBtn.innerHTML = "Crop & Save"
        }

        // Process next image or finish
        processNextImage()
      },
      "image/jpeg",
      0.85,
    )
  } catch (error) {
    console.error("Error processing image:", error)
    alert("Error processing image. Please try again.")
    if (cropConfirmBtn) {
      cropConfirmBtn.disabled = false
      cropConfirmBtn.innerHTML = "Crop & Save"
    }
  }
}

// Skip cropping - SIMPLIFIED
function skipCropping() {
  const originalFile = imagesToProcess[currentImageIndex]
  croppedImages.push(originalFile)

  console.log(`Skipped cropping for image ${currentImageIndex + 1}`)

  if (currentModal) {
    currentModal.hide()
  }

  processNextImage()
}

// Process next image or finish
function processNextImage() {
  currentImageIndex++

  if (currentImageIndex < imagesToProcess.length) {
    // Small delay for better UX
    setTimeout(() => {
      showImageCropper(imagesToProcess[currentImageIndex])
    }, 200)
  } else {
    // All images processed
    console.log("All images processed successfully")
    setTimeout(() => {
      displayImagePreviews()
      updateFormWithCroppedImages()
      isProcessingImages = false
      showAlert("success", `Successfully processed ${croppedImages.length} images!`)
    }, 200)
  }
}

// Add skip button to modal
function addSkipButton(modal) {
  const modalFooter = modal.querySelector(".modal-footer")
  const cropBtn = modalFooter.querySelector("#cropConfirm")

  if (modalFooter && cropBtn && !modalFooter.querySelector("#skipCropping")) {
    const skipBtn = document.createElement("button")
    skipBtn.type = "button"
    skipBtn.className = "btn btn-warning"
    skipBtn.id = "skipCropping"
    skipBtn.innerHTML = '<i class="fas fa-forward"></i> Skip Cropping'

    modalFooter.insertBefore(skipBtn, cropBtn)
  }
}

// Clean up cropper and modal state - SIMPLIFIED
function cleanupCropper() {
  if (cropper) {
    cropper.destroy()
    cropper = null
  }
}

// Clean up everything on page unload
function cleanupAll() {
  cleanupCropper()

  if (currentModal) {
    currentModal.dispose()
    currentModal = null
  }

  // Remove any modal backdrops
  const backdrops = document.querySelectorAll(".modal-backdrop")
  backdrops.forEach((backdrop) => backdrop.remove())

  // Reset body state
  document.body.classList.remove("modal-open")
  document.body.style.overflow = ""
  document.body.style.paddingRight = ""
}

// Display image previews
function displayImagePreviews() {
  const container = document.getElementById("imagePreviewContainer")
  if (!container) return

  container.innerHTML = ""

  if (croppedImages.length === 0) {
    return
  }

  const previewWrapper = document.createElement("div")
  previewWrapper.className = "image-preview-container"

  croppedImages.forEach((file, index) => {
    const previewDiv = document.createElement("div")
    previewDiv.className = "image-preview-item"

    const img = document.createElement("img")
    img.src = URL.createObjectURL(file)
    img.alt = `Preview ${index + 1}`

    const overlay = document.createElement("div")
    overlay.className = "image-preview-overlay"

    const editBtn = document.createElement("button")
    editBtn.type = "button"
    editBtn.className = "btn btn-sm btn-primary"
    editBtn.innerHTML = '<i class="fas fa-edit"></i>'
    editBtn.onclick = () => editImage(index)

    const removeBtn = document.createElement("button")
    removeBtn.type = "button"
    removeBtn.className = "btn btn-sm btn-danger"
    removeBtn.innerHTML = '<i class="fas fa-trash"></i>'
    removeBtn.onclick = () => removeImage(index)

    overlay.appendChild(editBtn)
    overlay.appendChild(removeBtn)

    previewDiv.appendChild(img)
    previewDiv.appendChild(overlay)

    if (index === 0) {
      const mainBadge = document.createElement("div")
      mainBadge.className = "main-image-badge"
      mainBadge.textContent = "Main"
      previewDiv.appendChild(mainBadge)
    }

    previewWrapper.appendChild(previewDiv)
  })

  container.appendChild(previewWrapper)
}

// Update form with cropped images
function updateFormWithCroppedImages() {
  const container = document.getElementById("croppedImagesContainer")
  if (!container) return

  container.innerHTML = ""

  // Create hidden inputs for each cropped image
  croppedImages.forEach((file, index) => {
    const input = document.createElement("input")
    input.type = "file"
    input.name = "productImages"
    input.style.display = "none"

    // Create a new FileList with the cropped file
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files

    container.appendChild(input)
  })

  console.log("Form updated with", croppedImages.length, "cropped images")
}

// Edit specific image
function editImage(index) {
  if (index < imagesToProcess.length && !isProcessingImages) {
    currentImageIndex = index
    isProcessingImages = true

    // Remove the edited image from cropped images
    croppedImages.splice(index, 1)

    showImageCropper(imagesToProcess[index])
  }
}

// Remove image from preview
function removeImage(index) {
  if (confirm("Are you sure you want to remove this image?")) {
    croppedImages.splice(index, 1)
    imagesToProcess.splice(index, 1)
    displayImagePreviews()
    updateFormWithCroppedImages()

    // Check minimum images for add product
    if (window.location.pathname.includes("addproducts") && croppedImages.length < 3) {
      alert("Minimum 3 images required. Please add more images.")
    }
  }
}

// Form validation
function initializeFormValidation() {
  const forms = document.querySelectorAll("#addProductForm, #editProductForm")

  forms.forEach((form) => {
    // Remove any existing validation classes
    form.classList.remove("was-validated")

    // Clear any existing validation states
    const inputs = form.querySelectorAll(".form-control, .form-select")
    inputs.forEach((input) => {
      input.classList.remove("is-valid", "is-invalid")
    })

    form.addEventListener("submit", (event) => {
      event.preventDefault()
      event.stopPropagation()

      // Don't submit if images are being processed
      if (isProcessingImages) {
        alert("Please wait for image processing to complete.")
        return
      }

      if (validateForm(form)) {
        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]')
        if (submitBtn) {
          submitBtn.classList.add("btn-loading")
          submitBtn.disabled = true
          submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving Product...'
        }

        // Submit form
        form.submit()
      } else {
        // Only add validation class after submit attempt
        form.classList.add("was-validated")
      }
    })

    // Add real-time validation for better UX
    const formInputs = form.querySelectorAll(".form-control, .form-select")
    formInputs.forEach((input) => {
      input.addEventListener("blur", () => {
        if (form.classList.contains("was-validated")) {
          validateField(input)
        }
      })

      input.addEventListener("input", () => {
        if (form.classList.contains("was-validated")) {
          validateField(input)
        }
      })
    })
  })
}

// Validate individual field
function validateField(field) {
  if (field.hasAttribute("required") && !field.value.trim()) {
    field.classList.add("is-invalid")
    field.classList.remove("is-valid")
  } else {
    field.classList.remove("is-invalid")
    field.classList.add("is-valid")
  }
}

// Custom form validation
function validateForm(form) {
  let isValid = true

  // Check required fields
  const requiredFields = form.querySelectorAll("[required]")
  requiredFields.forEach((field) => {
    if (!field.value.trim()) {
      isValid = false
      field.classList.add("is-invalid")
      field.classList.remove("is-valid")
    } else {
      field.classList.remove("is-invalid")
      field.classList.add("is-valid")
    }
  })

  // Validate images for add product
  if (form.id === "addProductForm") {
    if (croppedImages.length < 3) {
      alert("Please upload at least 3 images for the product.")
      isValid = false
    }
  }

  // Validate at least one variant has price and quantity
  const variantPrices = form.querySelectorAll('input[name="varientPrice"], input[name^="varientPrice"]')
  const variantQuantities = form.querySelectorAll('input[name="varientquatity"], input[name^="sizes"]')

  let hasValidVariant = false
  for (let i = 0; i < variantPrices.length; i++) {
    const price = Number.parseFloat(variantPrices[i].value)
    const quantity = Number.parseInt(variantQuantities[i] ? variantQuantities[i].value : 0)

    if (price > 0 && quantity > 0) {
      hasValidVariant = true
      break
    }
  }

  if (!hasValidVariant) {
    alert("Please provide at least one variant with valid price and quantity.")
    isValid = false
  }

  return isValid
}

// Product management functions
async function toggleProductStatus(productId, currentStatus) {
  const action = currentStatus ? "deactivate" : "activate"

  if (!confirm(`Are you sure you want to ${action} this product?`)) {
    return
  }

  try {
    const response = await fetch(`/admin/toggle-product-listing/${productId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
    })

    const result = await response.json()

    if (result.success) {
      showAlert("success", result.message)
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } else {
      showAlert("error", result.message || "Failed to update product status")
    }
  } catch (error) {
    console.error("Error:", error)
    showAlert("error", "An error occurred while updating product status")
  }
}

async function deleteProduct(productId) {
  if (!confirm("Are you sure you want to permanently delete this product? This action cannot be undone.")) {
    return
  }

  try {
    const response = await fetch(`/admin/deleteproduct/${productId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    })

    const result = await response.json()

    if (result.success) {
      showAlert("success", result.message)
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } else {
      showAlert("error", result.message || "Failed to delete product")
    }
  } catch (error) {
    console.error("Error:", error)
    showAlert("error", "An error occurred while deleting the product")
  }
}

// Utility function to show alerts
function showAlert(type, message) {
  // Remove existing alerts
  const existingAlerts = document.querySelectorAll(".alert")
  existingAlerts.forEach((alert) => alert.remove())

  const alertDiv = document.createElement("div")
  alertDiv.className = `alert alert-${type === "error" ? "danger" : "success"} alert-dismissible fade show`
  alertDiv.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `

  // Insert at the top of main content
  const mainContent = document.querySelector(".main-content")
  const firstChild = mainContent.firstElementChild
  mainContent.insertBefore(alertDiv, firstChild.nextSibling)

  // Auto dismiss after 5 seconds
  setTimeout(() => {
    if (alertDiv.parentNode) {
      const bsAlert = bootstrap.Alert.getOrCreateInstance(alertDiv)
      bsAlert.close()
    }
  }, 5000)
}

// Sidebar toggle for mobile
function toggleSidebar() {
  const sidebar = document.querySelector(".sidebar")
  if (sidebar) {
    sidebar.classList.toggle("active")
  }
}

// Initialize everything when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("Initializing product management...")

  // Clean up any leftover states
  cleanupAll()

  // Initialize image cropping
  initializeImageCropping()

  // Initialize form validation
  initializeFormValidation()

  // Auto-dismiss existing alerts after 5 seconds
  const alerts = document.querySelectorAll(".alert")
  alerts.forEach((alert) => {
    setTimeout(() => {
      if (alert.parentNode) {
        const bsAlert = bootstrap.Alert.getOrCreateInstance(alert)
        bsAlert.close()
      }
    }, 5000)
  })

  console.log("Product management initialized successfully")
})

// Clean up on page unload
window.addEventListener("beforeunload", () => {
  cleanupAll()
})

// Handle page visibility change
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    cleanupAll()
  }
})