const startButton = document.getElementById("startCapture");
const analyzeButton = document.getElementById("analyzeColors");
const statusText = document.getElementById("status");

startButton.addEventListener("click", async () => {
  statusText.textContent = 'Capturing...';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  chrome.runtime.sendMessage({ action: 'start_capture' });

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
});

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

  statusText.textContent = "Capture complete";
}

analyzeButton.addEventListener("click", () => {
  if (!stitchedCanvas) return;
  const ctx = stitchedCanvas.getContext('2d', { willReadFrequently: true });
  const { width, height } = stitchedCanvas;
  const imageData = ctx.getImageData(0, 0, width, height).data;

  const selectedColors = [
    hexToRgb(document.getElementById("color1").value),
    hexToRgb(document.getElementById("color2").value),
    hexToRgb(document.getElementById("color3").value),
  ];

  const counts = [0, 0, 0];
  let total = 0;

  for (let i = 0; i < imageData.length; i += 4) {
    const r = imageData[i],
      g = imageData[i + 1],
      b = imageData[i + 2];
    const index = closestColorIndex([r, g, b], selectedColors);
    if (index !== -1) {
      counts[index]++;
    }
    total++;
  }

  const resultText = counts
    .map((c, i) => `Color ${i + 1}: ${((c / total) * 100).toFixed(2)}%`)
    .join("\n");
  alert(resultText);
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

function closestColorIndex(color, selectedColors) {
  let minDist = 60; // threshold (tolerans)
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

document.querySelectorAll('input[type="color"]').forEach(input => {
  const display = input.nextElementSibling; // color-display span
  if(display) {
    input.addEventListener('input', () => {
      display.style.background = input.value;
    });
    // Sayfa yüklendiğinde renk kutusunu eşitle
    display.style.background = input.value;
  }
});
