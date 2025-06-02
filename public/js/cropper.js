document.addEventListener("DOMContentLoaded", function () {
  console.log("CROPPER: DOMContentLoaded");
  const fileInputs = document.querySelectorAll('input[type="file"][data-cropper]');
  fileInputs.forEach(input => {
    input.addEventListener("change", function (e) {
      console.log("CROPPER: File input changed", e.target.files);
      handleCropperInput(e.target);
    });
  });
});

async function handleCropperInput(input) {
  const files = input.files;
  if (!files || files.length === 0) return;
  for (let i = 0; i < files.length; i++) {
    console.log(`CROPPER: Starting crop for image ${i + 1} of ${files.length}`);
    await showCropperModal(files[i], i + 1, files.length);
    console.log(`CROPPER: Finished crop for image ${i + 1}`);
  }
}

function showCropperModal(file, current, total) {
  return new Promise((resolve, reject) => {
    console.log("CROPPER: showCropperModal called", file.name, current, total);
    // Add event listeners for crop, skip, and cancel
    document.getElementById("crop-btn").onclick = async function () {
      console.log("CROPPER: Crop button clicked");
      // ...existing code...
      resolve();
    };
    document.getElementById("skip-btn").onclick = function () {
      console.log("CROPPER: Skip cropping for", file.name);
      resolve();
    };
    document.getElementById("cancel-btn").onclick = function () {
      console.log("CROPPER: Cancel cropping");
      reject("User cancelled cropping");
    };
    // ...existing code...
  });
}