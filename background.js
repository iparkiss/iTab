// Background Service Worker
// Extension page (new tab)는 CORS 제한을 받지만,
// Service Worker는 host_permissions 선언만으로 제한 없이 fetch 가능.

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'fetchSuggest') {
    const url =
      `https://suggestqueries.google.com/complete/search` +
      `?client=firefox&hl=ko&gl=kr&q=${encodeURIComponent(message.query)}`;

    fetch(url)
      .then(res => {
        if (!res.ok) { sendResponse({ ok: false }); return; }
        return res.json();
      })
      .then(data => {
        sendResponse({
          ok:   true,
          list: Array.isArray(data?.[1]) ? data[1].slice(0, 7) : [],
        });
      })
      .catch(() => sendResponse({ ok: false }));

    return true; // 비동기 응답을 위해 채널 유지
  }
});
