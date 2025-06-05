const startButton = document.getElementById("startCapture");
const analyzeButton = document.getElementById("analyzeColors");
const detectColorsButton = document.getElementById("detectColors");
const statusText = document.getElementById("status");
const captureModeToggle = document.getElementById("captureMode");

// Hex display elements
const hex1 = document.getElementById("hex1");
const hex2 = document.getElementById("hex2");
const hex3 = document.getElementById("hex3");

startButton.addEventListener("click", async () => {
  const isFullPage = captureModeToggle.checked;
  statusText.textContent = isFullPage ? 'Capturing full page...' : 'Capturing visible area...';
  
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.runtime.sendMessage({ action: 'start_capture' });

  if (isFullPage) {
    // Full page capture (existing logic)
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const totalHeight = document.body.scrollHeight;
        const viewportHeight = window.innerHeight;

        if (totalHeight <= viewportHeight) {
          chrome.runtime.sendMessage({ action: 'capture_single' });
          return;
        }

        const scrollSteps = Math.ceil(totalHeight / viewportHeight);
        let currentStep = 0;

        const scrollAndCapture = () => {
          if (currentStep >= scrollSteps) {
            chrome.runtime.sendMessage({ action: 'capture_done' });
            return;
          }

          window.scrollTo(0, currentStep * viewportHeight);
          setTimeout(() => {
            chrome.runtime.sendMessage({ action: 'capture', step: currentStep });
            currentStep++;
            scrollAndCapture();
          }, 500);
        };

        scrollAndCapture();
      }
    });
  } else {
    // Visible area only capture
    chrome.runtime.sendMessage({ action: 'capture_single' });
  }
});

// Detect most used colors on page
detectColorsButton.addEventListener("click", async () => {
  const loadingElement = document.getElementById("loadingColors");
  const topColorsListElement = document.getElementById("topColorsList");
  
  loadingElement.textContent = "Analyzing colors...";
  topColorsListElement.innerHTML = "";
  
  if (!stitchedCanvas) {
    loadingElement.textContent = "Please capture the page first";
    return;
  }
  
  const topColors = detectTopColors();
  displayTopColors(topColors);
});

function detectTopColors() {
  const ctx = stitchedCanvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = stitchedCanvas;
  const imageData = ctx.getImageData(0, 0, width, height).data;
  
  const colorMap = new Map();
  let totalAnalyzedPixels = 0;
  
  // Analyze every pixel for accuracy (same as manual analysis)
  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];
    
    // Skip transparent pixels only (same as manual analysis)
    if (a < 128) {
      continue;
    }
    
    totalAnalyzedPixels++;
    
    // Group similar colors with a tolerance (similar to manual analysis tolerance of 30)
    const tolerance = 30; // Tolerance for grouping similar colors
    let matched = false;
    
    // Check if this color is similar to any existing color in the map
    for (let [existingColorKey, count] of colorMap.entries()) {
      const [existingR, existingG, existingB] = existingColorKey.split(',').map(Number);
      
      const colorDistance = Math.sqrt(
        Math.pow(r - existingR, 2) +
        Math.pow(g - existingG, 2) +
        Math.pow(b - existingB, 2)
      );
      
      if (colorDistance <= tolerance) {
        colorMap.set(existingColorKey, count + 1);
        matched = true;
        break;
      }
    }
    
    // If no similar color found, add as new color
    if (!matched) {
      const colorKey = `${r},${g},${b}`;
      colorMap.set(colorKey, 1);
    }
  }
  
  // Sort by frequency and get top 3
  const sortedColors = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  
  return sortedColors.map(([colorKey, count]) => {
    const [r, g, b] = colorKey.split(',').map(Number);
    const percentage = ((count / totalAnalyzedPixels) * 100).toFixed(2);
    const hex = rgbToHex(r, g, b);
    
    return {
      rgb: [r, g, b],
      hex: hex,
      percentage: percentage,
      count: count
    };
  });
}

function displayTopColors(topColors) {
  const loadingElement = document.getElementById("loadingColors");
  const topColorsListElement = document.getElementById("topColorsList");
  
  if (topColors.length === 0) {
    loadingElement.textContent = "No significant colors found";
    return;
  }
  
  loadingElement.style.display = "none";
  
  topColors.forEach((color, index) => {
    const colorItem = document.createElement("div");
    colorItem.className = "top-color-item";
    colorItem.innerHTML = `
      <div class="top-color-preview" style="background-color: ${color.hex}"></div>
      <div class="top-color-info">
        <div class="top-color-hex">${color.hex}</div>
        <div class="top-color-percentage">${color.percentage}% of page</div>
      </div>
    `;
    
    // Add click handler to select this color
    colorItem.addEventListener("click", () => {
      selectColorForAnalysis(color.hex, index);
    });
    
    topColorsListElement.appendChild(colorItem);
  });
}

function selectColorForAnalysis(hexColor, suggestedIndex = 0) {
  // Find the first available color picker or use suggested index
  const colorInputs = [
    document.getElementById("color1"),
    document.getElementById("color2"),
    document.getElementById("color3")
  ];
  
  const targetIndex = suggestedIndex < colorInputs.length ? suggestedIndex : 0;
  const targetInput = colorInputs[targetIndex];
  
  if (targetInput) {
    targetInput.value = hexColor;
    updateHexDisplay(targetInput, hexColor);
    updateColorDisplay(targetInput);
    
    // Visual feedback
    targetInput.parentElement.style.transform = "scale(1.1)";
    setTimeout(() => {
      targetInput.parentElement.style.transform = "scale(1)";
    }, 200);
  }
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "stitch" && message.images) {
    stitchImages(message.images);
  }
});

let stitchedCanvas;
function stitchImages(images) {
  const imgElements = [];
  let loadedCount = 0;

  images.forEach((dataUrl, index) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      imgElements[index] = img;
      loadedCount++;
      if (loadedCount === images.length) {
        drawCanvas(imgElements);
      }
    };
  });
}

function drawCanvas(images) {
  stitchedCanvas = document.getElementById("stitchedCanvas");
  const ctx = stitchedCanvas.getContext("2d", { willReadFrequently: true });
  const width = images[0].naturalWidth;
  const height = images.reduce((sum, img) => sum + img.naturalHeight, 0);

  stitchedCanvas.width = width;
  stitchedCanvas.height = height;

  ctx.clearRect(0, 0, width, height);

  let yOffset = 0;
  images.forEach((img) => {
    ctx.drawImage(img, 0, yOffset);
    yOffset += img.naturalHeight;
  });

  const isFullPage = captureModeToggle.checked;
  statusText.textContent = isFullPage ? "Full page capture complete" : "Visible area capture complete";
  
  // Reset top colors section
  document.getElementById("loadingColors").textContent = "Click 'Detect Colors' to analyze";
  document.getElementById("loadingColors").style.display = "block";
  document.getElementById("topColorsList").innerHTML = "";
}

analyzeButton.addEventListener("click", () => {
  if (!stitchedCanvas) {
    statusText.textContent = "Please capture the page first";
    return;
  }
  
  const ctx = stitchedCanvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = stitchedCanvas;
  const imageData = ctx.getImageData(0, 0, width, height).data;

  const selectedColors = [
    hexToRgb(document.getElementById("color1").value),
    hexToRgb(document.getElementById("color2").value),
    hexToRgb(document.getElementById("color3").value),
  ];

  const counts = [0, 0, 0];
  let totalAnalyzedPixels = 0;

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i];
    const g = imageData[i + 1];
    const b = imageData[i + 2];
    const a = imageData[i + 3];
    
    // Skip transparent pixels (same as detectTopColors)
    if (a < 128) {
      continue;
    }
    
    totalAnalyzedPixels++;
    
    const index = closestColorIndex([r, g, b], selectedColors);
    if (index !== -1) {
      counts[index]++;
    }
  }

  const resultText = counts
    .map((c, i) => {
      const hex = rgbToHex(selectedColors[i][0], selectedColors[i][1], selectedColors[i][2]);
      const percentage = ((c / totalAnalyzedPixels) * 100).toFixed(2);
      return `Color ${i + 1} (${hex}): ${percentage}%`;
    })
    .join("\n");
  
  alert("Color Analysis Results:\n\n" + resultText);
});

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
      ]
    : null;
}

function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join("").toUpperCase();
}

function closestColorIndex(color, selectedColors) {
  let minDist = 30; // Same tolerance as detectTopColors for consistency
  let match = -1;
  selectedColors.forEach((c, i) => {
    if (!c) return;
    const dist = Math.sqrt(
      Math.pow(color[0] - c[0], 2) +
        Math.pow(color[1] - c[1], 2) +
        Math.pow(color[2] - c[2], 2)
    );
    if (dist < minDist) {
      minDist = dist;
      match = i;
    }
  });
  return match;
}

function updateHexDisplay(input, hexValue) {
  const inputId = input.id;
  const hexDisplayId = inputId.replace('color', 'hex');
  const hexDisplay = document.getElementById(hexDisplayId);
  if (hexDisplay) {
    hexDisplay.textContent = hexValue.toUpperCase();
  }
}

function updateColorDisplay(input) {
  const display = input.nextElementSibling;
  if (display) {
    display.style.background = input.value;
  }
}

// Initialize color displays and hex values
document.querySelectorAll('input[type="color"]').forEach(input => {
  const display = input.nextElementSibling;
  if (display) {
    input.addEventListener('input', () => {
      updateColorDisplay(input);
      updateHexDisplay(input, input.value);
    });
    
    // Initialize on page load
    updateColorDisplay(input);
    updateHexDisplay(input, input.value);
  }
});