/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 04/28 · auth-api
   lines 715–906 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
const handleInitialGesture = () => {
    window.tryAutoPlayRoomMusicAfterFirstGesture();
};

['click', 'touchstart', 'pointerdown', 'keydown'].forEach(evt => {
    document.addEventListener(evt, handleInitialGesture, { once: true, passive: true });
});
// ----------------------------------------------------

function getToken() {
  const token = sessionStorage.getItem('token');
  console.debug('getToken called, returning:', token ? 'Token exists' : 'No token');
  return token;
}

// Global Fetch Interceptor to handle 401 Unauthorized (Expired Tokens)
// Helper to sanitise and convert generic HTML/Status into user-friendly messages
const getMeaningfulError = (error, status, serverMessage) => {
  if (!serverMessage && error) serverMessage = error.message || error;
  
  const isLikesError = serverMessage && (typeof serverMessage === 'string') && (serverMessage.includes('لايك') || serverMessage.includes('requiredLikes'));
  if (isLikesError) {
    return serverMessage;
  }

  // Check if it's a generic status message like "Forbidden", "Forbidden 403", "Not Found", etc.
  const genericPatterns = [
    /forbidden/i, /unauthorized/i, /not found/i, 
    /internal server error/i, /bad request/i, /403/, 
    /permission denied/i, /method not allowed/i
  ];
  
  // If we have a real message that is NOT generic, use it!
  const hasRealMessage = serverMessage && (typeof serverMessage === 'string') && serverMessage.length > 0 && !genericPatterns.some(regex => regex.test(serverMessage));
  
  if (hasRealMessage) {
    return serverMessage;
  }

  // Fallbacks for generic errors
  if (status === 403) return 'عذراً، تم رفض الطلب. قد لا تملك الصلاحية اللازمة أو لم تستوفِ الشروط المطلوبة.';
  if (status === 401) return 'انتهت الجلسة، يرجى تسجيل الدخول من جديد.';
  if (status === 404) return 'لم يتم العثور على المورد المطلوب.';
  if (status === 413) return 'حجم الملف كبير جداً.';
  if (status >= 500) return 'حدث خطأ في السيرفر، يرجى المحاولة لاحقاً.';
  
  return serverMessage || `فشل الطلب (كود: ${status})`;
};

window.showLikesLimitAlert = (message) => {
  Swal.fire({
    title: 'عذرًا',
    text: message,
    icon: 'error',
    confirmButtonText: 'موافق',
    customClass: {
      confirmButton: 'btn btn-primary px-5'
    },
    buttonsStyling: false
  });
};

// Store original fetch
const originalFetch = window.fetch;

const apiFetch = async (...args) => {
  const url = args[0];
  // Bypass internal socket.io polling/handshake from interceptor
  if (typeof url === 'string' && (url.includes('/socket.io/') || url.includes('sid='))) {
    return originalFetch(...args);
  }

  // Intercept POST/PUT/DELETE requests for wall interactions and private messages to report activity
  const options = args[1] || {};
  const method = (options.method || 'GET').toUpperCase();
  if (typeof url === 'string' && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    if (url.includes('/api/posts') || url.includes('/api/private')) {
      if (typeof handleRealActivity === 'function') {
        handleRealActivity();
      }
    }
  }

  try {
    const response = await originalFetch(...args);
    
    // Check if the response might be JSON
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const clone = response.clone();
      let data;
      try {
        data = await clone.json();
      } catch (e) {
        // Not actually JSON
      }
      
      if (data && data.message === 'Session expired, please login again') {
          if (window.showClassicAlert) {
            window.showClassicAlert('انتهت الجلسة يرجى تسجيل الدخول من جديد', 'warning');
          } else {
            alert('انتهت الجلسة يرجى تسجيل الدخول من جديد');
          }
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
          return response; // Or throw, but this should be enough to stop execution
      }
    }

    // Handle Unauthorized
    if (response.status === 401) {
      const clone = response.clone();
      let errorData;
      try { errorData = await clone.json(); } catch (e) { errorData = {}; }
      
      const message = errorData.message || getMeaningfulError(null, 401, errorData.message);
      if (state.currentUser) showToast(message, 'warning');
      logout();
      return response;
    }

    if (!response.ok) {
      let errorBody = {};
      let rawText = '';
      try {
        rawText = await response.text();
      } catch (e) {
        console.error('Failed to read response text', e);
      }
      
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json') && rawText) {
        try { 
          errorBody = JSON.parse(rawText); 
        } catch (e) { 
          console.warn('JSON parse failed for error body', e);
        }
      }

      // If we don't have a message from JSON, try to extract from HTML/Text
      if (!errorBody.message && rawText) {
        // Remove HTML tags
        const doc = new DOMParser().parseFromString(rawText, 'text/html');
        // Prefer content of <body> if it exists
        const textContent = doc.body?.textContent?.trim() || doc.head?.textContent?.trim() || rawText;
        // Clean up excess whitespace and limit length
        const cleanText = textContent.replace(/\s+/g, ' ').trim();
        
        if (cleanText && cleanText.length < 300) {
           errorBody.message = cleanText;
        }
      }
      
      const finalMessage = getMeaningfulError(null, response.status, errorBody.message);
      
      console.error('API Error:', { status: response.status, message: finalMessage, body: errorBody });

      // Auto-call likes limit alert if detected
      if (finalMessage && (finalMessage.includes('لايك') || finalMessage.includes('requiredLikes'))) {
        window.showLikesLimitAlert(finalMessage);
      }

      const error = new Error(finalMessage);
      error.status = response.status;
      error.body = errorBody;
      throw error;
    }

    return response;
  } catch (error) {
    if (error instanceof TypeError) {
      const networkError = new Error('خطأ في الاتصال بالسيرفر. يرجى التحقق من الشبكة.');
      networkError.isNetworkError = true;
      throw networkError;
    }
    throw error;
  }
};

// Shadow the global fetch for this module
const _fetch = apiFetch;
window.apiFetch = apiFetch;

let pendingMediaData = null;
let isSoundMuted = false;
let updateUsersListTimeout = null;
let preserveMessagesAfterLeave = false;
let pendingInitialRoomSelection = false;
let currentSettingsView = null;

