let capturedImages = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start_capture') {
    capturedImages = [];
  }

  if (message.action === 'capture') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      capturedImages.push(dataUrl);
      console.log(`Captured step ${message.step}`);
    });
  }

  // Yeni tek adımlı yakalama
  if (message.action === 'capture_single') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      capturedImages = [dataUrl];
      chrome.runtime.sendMessage({ action: 'stitch', images: capturedImages });
    });
  }

  if (message.action === 'capture_done') {
    chrome.runtime.sendMessage({ action: 'stitch', images: capturedImages });
  }
});
