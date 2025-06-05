let capturedImages = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'start_capture') {
    capturedImages = [];
  }

  if (message.action === 'capture') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Capture error:', chrome.runtime.lastError);
        return;
      }
      capturedImages.push(dataUrl);
      console.log(`Captured step ${message.step}`);
    });
  }

  // Single step capture (for visible area only or single page)
  if (message.action === 'capture_single') {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('Capture error:', chrome.runtime.lastError);
        return;
      }
      capturedImages = [dataUrl];
      chrome.runtime.sendMessage({ action: 'stitch', images: capturedImages });
    });
  }

  if (message.action === 'capture_done') {
    chrome.runtime.sendMessage({ action: 'stitch', images: capturedImages });
  }
});