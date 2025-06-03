window.startScrollCapture = () => {
  const totalHeight = document.body.scrollHeight;
  const viewportHeight = window.innerHeight;

  // Eğer scroll edilmesi gereken yükseklik yoksa, sadece tek kare al ve çık
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
};
