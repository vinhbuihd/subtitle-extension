chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  chrome.tabs.sendMessage(tab.id, { type: "MES_TOGGLE_UI" }, () => {
    // Some pages cannot receive content-script messages, such as Chrome pages.
    chrome.runtime.lastError;
  });
});
