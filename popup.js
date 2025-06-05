// DOM Elements
const startButton = document.getElementById("startCapture");
const analyzeButton = document.getElementById("analyzeColors");
const statusText = document.getElementById("status");
const resultsDiv = document.getElementById("results");
const projectNameInput = document.getElementById("projectName");
const projectSelect = document.getElementById("projectSelect");
const saveProjectBtn = document.getElementById("saveProject");
const loadProjectBtn = document.getElementById("loadProject");
const deleteProjectBtn = document.getElementById("deleteProject");

let stitchedCanvas;
let currentProjectData = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initializeColorDisplays();
  loadProjectList();
});

// ==================== PROJE YÖNETİMİ FONKSİYONLARI ====================

async function saveProject() {
  const projectName = projectNameInput.value.trim();
  if (!projectName) {
    alert('Please enter a project name');
    return;
  }

  if (!stitchedCanvas) {
    alert('Please capture a page first');
    return;
  }

  const projectData = {
    name: projectName,
    timestamp: Date.now(),
    colors: {
      color1: document.getElementById("color1").value,
      color2: document.getElementById("color2").value,
      color3: document.getElementById("color3").value
    },
    imageData: stitchedCanvas.toDataURL(),
    results: resultsDiv.textContent || null
  };

  try {
    const result = await chrome.storage.local.get(['projects']);
    const projects = result.projects || {};
    projects[projectName] = projectData;
    
    await chrome.storage.local.set({ projects });
    
    statusText.textContent = `Project "${projectName}" saved successfully`;
    projectNameInput.value = '';
    loadProjectList();
  } catch (error) {
    console.error('Error saving project:', error);
    statusText.textContent = 'Error saving project';
  }
}

async function loadProject() {
  const selectedProject = projectSelect.value;
  if (!selectedProject) {
    alert('Please select a project to load');
    return;
  }

  try {
    const result = await chrome.storage.local.get(['projects']);
    const projects = result.projects || {};
    const projectData = projects[selectedProject];

    if (!projectData) {
      alert('Project not found');
      return;
    }

    // Load colors
    document.getElementById("color1").value = projectData.colors.color1;
    document.getElementById("color2").value = projectData.colors.color2;
    document.getElementById("color3").value = projectData.colors.color3;
    
    // Update color displays
    initializeColorDisplays();

    // Load image
    const img = new Image();
    img.onload = () => {
      stitchedCanvas = document.getElementById("stitchedCanvas");
      const ctx = stitchedCanvas.getContext("2d");
      
      stitchedCanvas.width = img.width;
      stitchedCanvas.height = img.height;
      
      ctx.drawImage(img, 0, 0);
      
      // Load results if available
      if (projectData.results) {
        resultsDiv.textContent = projectData.results;
        resultsDiv.style.display = 'block';
      }
      
      statusText.textContent = `Project "${selectedProject}" loaded successfully`;
    };
    img.src = projectData.imageData;

    currentProjectData = projectData;
  } catch (error) {
    console.error('Error loading project:', error);
    statusText.textContent = 'Error loading project';
  }
}

async function deleteProject() {
  const selectedProject = projectSelect.value;
  if (!selectedProject) {
    alert('Please select a project to delete');
    return;
  }

  if (!confirm(`Are you sure you want to delete project "${selectedProject}"?`)) {
    return;
  }

  try {
    const result = await chrome.storage.local.get(['projects']);
    const projects = result.projects || {};
    
    delete projects[selectedProject];
    
    await chrome.storage.local.set({ projects });
    
    statusText.textContent = `Project "${selectedProject}" deleted`;
    loadProjectList();
  } catch (error) {
    console.error('Error deleting project:', error);
    statusText.textContent = 'Error deleting project';
  }
}

async function loadProjectList() {
  try {
    const result = await chrome.storage.local.get(['projects']);
    const projects = result.projects || {};
    
    projectSelect.innerHTML = '<option value="">Select project...</option>';
    
    Object.keys(projects)
      .sort((a, b) => projects[b].timestamp - projects[a].timestamp)
      .forEach(projectName => {
        const option = document.createElement('option');
        option.value = projectName;
        option.textContent = `${projectName} (${new Date(projects[projectName].timestamp).toLocaleDateString()})`;
        projectSelect.appendChild(option);
      });
  } catch (error) {
    console.error('Error loading project list:', error);
  }
}

// ==================== EVENT LISTENERS ====================

// Proje yönetimi event listeners
saveProjectBtn.addEventListener("click", saveProject);
loadProjectBtn.addEventListener("click", loadProject);
deleteProjectBtn.addEventListener("click", deleteProject);

// Mevcut functionality
startButton.addEventListener("click", async () => {
  statusText.textContent = 'Capturing...';
  resultsDiv.style.display = 'none';
  
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
  if (!stitchedCanvas) {
    alert('Please capture a page first');
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
    .map((c, i) => `Color ${i + 1} (${selectedColors[i] ? rgbToHex(selectedColors[i]) : 'N/A'}): ${((c / total) * 100).toFixed(2)}%`)
    .join('\n');
  
  resultsDiv.textContent = resultText;
  resultsDiv.style.display = 'block';
  statusText.textContent = "Analysis complete";
});

// ==================== YARDIMCI FONKSİYONLAR ====================

function initializeColorDisplays() {
  document.querySelectorAll('input[type="color"]').forEach(input => {
    const display = input.nextElementSibling;
    if(display) {
      input.addEventListener('input', () => {
        display.style.background = input.value;
      });
      display.style.background = input.value;
    }
  });
}

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

function rgbToHex(rgb) {
  return "#" + rgb.map(x => {
    const hex = x.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  }).join('');
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