// Classic Alert Override with proper Queue and Lifecycle Management
(function() {
  const secureCreateElement = window.secureCreateElement || function(tagName, attributes = {}, textContent = null) {
    const el = document.createElement(tagName);
    for (const [key, val] of Object.entries(attributes)) {
      if (key === 'class') el.className = val;
      else if (key === 'style') el.style.cssText = val;
      else el.setAttribute(key, val);
    }
    if (textContent !== null) el.textContent = textContent;
    return el;
  };

  let alertQueue = [];
  let isAlertOpen = false;
  let currentAlertCloseFn = null;

  function injectAlertHtml() {
    if (document.getElementById('classic-alert-overlay')) return;
    
    const alertHtml = `
      <div id="classic-alert-overlay" class="classic-alert-overlay d-none">
        <div class="classic-alert-box">
          <div class="classic-alert-header" id="classic-alert-title"> تنبيه </div>
          <div class="classic-alert-body" id="classic-alert-text"></div>
          <div class="classic-alert-buttons" id="classic-alert-buttons"></div>
        </div>
      </div>
    `;
    
    if (document.body) {
      document.body.insertAdjacentHTML('beforeend', alertHtml);
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        document.body.insertAdjacentHTML('beforeend', alertHtml);
      });
    }
  }

  // Inject as soon as possible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectAlertHtml);
  } else {
    injectAlertHtml();
  }

  const processQueue = async () => {
    if (isAlertOpen || alertQueue.length === 0) return;
    isAlertOpen = true;

    const nextAlert = alertQueue.shift();
    await renderAlert(nextAlert);
  };

  const renderAlert = (alertConfig) => {
    return new Promise((internalResolve) => {
      const { args, resolve } = alertConfig;
      
      let title = 'عذراً';
      let text = '';
      let showCancel = false;
      let showDeny = false;
      let confirmText = 'موافق';
      let cancelText = 'إلغاء';
      let denyText = 'رفض';
      let didOpen = null;
      let willOpen = null;
      let timer = null;
      let showConfirmButton = true;
      let input = null;
      let inputOptions = null;
      let inputPlaceholder = '';
      let inputValidator = null;
      let icon = null;
      let inputValue = '';
      let preConfirm = null;
      let willClose = null;
      let didClose = null;
      let allowOutsideClick = true;
      
      if (typeof args[0] === 'object') {
        const options = args[0];
        title = options.title !== undefined ? options.title : title;
        text = options.text || options.html || '';
        showCancel = options.showCancelButton || false;
        showDeny = options.showDenyButton || false;
        confirmText = options.confirmButtonText || confirmText;
        cancelText = options.cancelButtonText || cancelText;
        denyText = options.denyButtonText || denyText;
        didOpen = options.didOpen || null;
        willOpen = options.willOpen || null;
        timer = options.timer || null;
        showConfirmButton = options.showConfirmButton !== false;
        input = options.input || null;
        inputOptions = options.inputOptions || null;
        inputPlaceholder = options.inputPlaceholder || '';
        inputValidator = options.inputValidator || null;
        icon = options.icon || null;
        inputValue = options.inputValue || '';
        preConfirm = typeof options.preConfirm === 'function' ? options.preConfirm : null;
        willClose = typeof options.willClose === 'function' ? options.willClose : null;
        didClose = typeof options.didClose === 'function' ? options.didClose : null;
        allowOutsideClick = options.allowOutsideClick !== false; // default true in sweetalert usually
        
        // Custom background and size style
        const alertBox = document.querySelector('.classic-alert-box');
        if (alertBox) {
            if (options.background) alertBox.style.background = options.background;
            else alertBox.style.background = '';
            
            if (options.width) alertBox.style.width = options.width;
            else alertBox.style.width = '';
            
            if (options.maxWidth) alertBox.style.maxWidth = options.maxWidth;
            else alertBox.style.maxWidth = '';
        }
      } else {
        title = args[0] !== undefined ? args[0] : title;
        text = args[1] || '';
        icon = args[2] || null;
      }

      // Normalize title
      if (title && !text) {
        const origTitle = title;
        if (origTitle.startsWith('تمت الموافقة')) { title = 'تمت الموافقة'; text = origTitle; }
        else if (origTitle.startsWith('تم رفض')) { title = 'تم الرفض'; text = origTitle; }
        else if (origTitle.startsWith('تم حذف')) { title = 'تم الحذف'; text = origTitle; }
        else if (origTitle.startsWith('تم')) { title = 'نجاح'; text = origTitle; }
        else if (origTitle.startsWith('فشل')) { title = 'فشل الإجراء'; text = origTitle; }
        else if (origTitle.startsWith('حدث خطأ') || origTitle.startsWith('خطأ')) { title = 'عذراً'; text = origTitle; }
        else if (origTitle.startsWith('عذراً') || origTitle.startsWith('عذرا')) { title = 'عذراً'; text = origTitle; }
        else if (origTitle.length > 15) {
          title = icon === 'success' ? 'نجاح' : (icon === 'error' ? 'عذراً' : (icon === 'warning' ? 'عذراً' : 'تنبيه'));
          text = origTitle;
        }
      }
      if (title === 'خطأ') title = 'عذراً';

      const titleEl = document.getElementById('classic-alert-title');
      const textEl = document.getElementById('classic-alert-text');
      const overlayEl = document.getElementById('classic-alert-overlay');
      const buttonsContainer = document.getElementById('classic-alert-buttons');

      if (!titleEl || !textEl || !overlayEl || !buttonsContainer) {
        // missing dom
        resolve({ isConfirmed: true });
        isAlertOpen = false;
        internalResolve();
        processQueue();
        return;
      }

      if (title) {
        titleEl.textContent = title;
        titleEl.style.display = 'block';
        titleEl.className = 'classic-alert-header';
        if (icon === 'error') titleEl.classList.add('classic-alert-header-error');
        else if (icon === 'success') titleEl.classList.add('classic-alert-header-success');
        else if (icon === 'warning') titleEl.classList.add('classic-alert-header-warning');
        else if (icon === 'question') titleEl.classList.add('classic-alert-header-question');
      } else {
        titleEl.style.display = 'none';
      }

      textEl.innerHTML = '';
      const contentWrapper = document.createElement('div');
      contentWrapper.style.marginBottom = '10px';
      
      if (typeof args[0] === 'object' && args[0].html) {
        contentWrapper.innerHTML = args[0].html;
      } else {
        contentWrapper.textContent = text;
      }
      textEl.appendChild(contentWrapper);

      // inputs
      if (input === 'select' && inputOptions) {
        const wrapper = secureCreateElement('div', { style: 'margin-top: 15px;' });
        const select = secureCreateElement('select', { id: 'classic-alert-input', style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px;' });
        const placeholderOption = secureCreateElement('option', { value: '', disabled: 'disabled', selected: 'selected' }, inputPlaceholder);
        select.appendChild(placeholderOption);
        for (const [val, label] of Object.entries(inputOptions)) {
          select.appendChild(secureCreateElement('option', { value: val }, label));
        }
        wrapper.appendChild(select);
        textEl.appendChild(wrapper);
      } else if (input === 'text') {
        const wrapper = secureCreateElement('div', { style: 'margin-top: 15px;' });
        wrapper.appendChild(secureCreateElement('input', { type: 'text', id: 'classic-alert-input', style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px;', placeholder: inputPlaceholder }));
        textEl.appendChild(wrapper);
      } else if (input === 'textarea') {
        const wrapper = secureCreateElement('div', { style: 'margin-top: 15px;' });
        wrapper.appendChild(secureCreateElement('textarea', { id: 'classic-alert-input', style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px; direction: rtl;', placeholder: inputPlaceholder, rows: '4' }));
        textEl.appendChild(wrapper);
      }

      if (input && inputValue) {
        const inputEl = document.getElementById('classic-alert-input');
        if (inputEl) inputEl.value = inputValue;
      }

      let timerTimeout = null;

      const finishAlert = (result) => {
        if (timerTimeout) clearTimeout(timerTimeout);
        overlayEl.removeEventListener('click', outsideClickHandler);
        document.removeEventListener('keydown', escapeKeyHandler);
        
        try { if (willClose) willClose(document.querySelector('.classic-alert-box')); } catch (e) { console.error('[ClassicAlert] willClose failed:', e); }
        
        overlayEl.classList.add('d-none');
        document.body.classList.remove('classic-alert-active');
        
        try { if (didClose) didClose(); } catch (e) { console.error('[ClassicAlert] didClose failed:', e); }

        resolve(result);
        isAlertOpen = false;
        currentAlertCloseFn = null;
        internalResolve();
        processQueue(); // Process next in queue
      };

      currentAlertCloseFn = () => finishAlert({ isConfirmed: false, isDenied: false, isDismissed: true });

      const handleConfirm = async () => {
        let value = true;
        if (input) {
          const inputEl = document.getElementById('classic-alert-input');
          if (inputEl) value = inputEl.value;
        }
        if (inputValidator) {
          const error = inputValidator(value);
          if (error) {
            let errorEl = document.getElementById('classic-alert-error');
            if (!errorEl) {
              errorEl = secureCreateElement('div', { id: 'classic-alert-error', style: 'color: red; margin-top: 10px; font-size: 0.9rem;' });
              textEl.appendChild(errorEl);
            }
            errorEl.textContent = error;
            return;
          }
        }
        if (preConfirm) {
          try {
            const preConfirmValue = await preConfirm(value);
            if (preConfirmValue === false) return;
            if (preConfirmValue !== undefined) value = preConfirmValue;
          } catch (error) {
            console.error('[ClassicAlert] preConfirm failed:', error);
            return;
          }
        }
        finishAlert({ isConfirmed: true, isDenied: false, isDismissed: false, value });
      };

      const handleDeny = async () => {
        if (preConfirm) {
          try {
            const preConfirmValue = await preConfirm('reject');
            if (preConfirmValue === false) return;
          } catch (error) {
            console.error('[ClassicAlert] preConfirm failed:', error);
            return;
          }
        }
        finishAlert({ isConfirmed: false, isDenied: true, isDismissed: false, value: 'reject' });
      };

      buttonsContainer.innerHTML = '';
      if (!showConfirmButton && !showCancel && !showDeny) {
        // no buttons
      } else if (showCancel || showDeny) {
        if (showConfirmButton) {
          const btnConfirm = secureCreateElement('button', { class: 'btn btn-sm btn-dark px-3 mx-1', id: 'classic-btn-confirm' }, confirmText);
          buttonsContainer.appendChild(btnConfirm);
          btnConfirm.onclick = () => { void handleConfirm(); };
        }
        if (showDeny) {
          const btnDeny = secureCreateElement('button', { class: 'btn btn-sm btn-danger px-3 mx-1', id: 'classic-btn-deny' }, denyText);
          buttonsContainer.appendChild(btnDeny);
          btnDeny.onclick = () => { void handleDeny(); };
        }
        if (showCancel) {
          const btnCancel = secureCreateElement('button', { class: 'btn btn-sm btn-secondary px-3 mx-1', id: 'classic-btn-cancel' }, cancelText);
          buttonsContainer.appendChild(btnCancel);
          btnCancel.onclick = () => finishAlert({ isConfirmed: false, isDenied: false, isDismissed: true });
        }
      } else {
        const btnOk = secureCreateElement('button', { class: 'btn btn-sm btn-dark px-4', id: 'classic-btn-ok' }, confirmText);
        buttonsContainer.appendChild(btnOk);
        btnOk.onclick = () => { void handleConfirm(); };
      }

      // Handlers for outside click and escape
      const outsideClickHandler = (e) => {
        if (allowOutsideClick && e.target === overlayEl) {
          finishAlert({ isConfirmed: false, isDenied: false, isDismissed: true });
        }
      };
      const escapeKeyHandler = (e) => {
        if (allowOutsideClick && e.key === 'Escape') {
          finishAlert({ isConfirmed: false, isDenied: false, isDismissed: true });
        }
      };

      overlayEl.addEventListener('click', outsideClickHandler);
      document.addEventListener('keydown', escapeKeyHandler);

      try { if (willOpen) willOpen(document.querySelector('.classic-alert-box')); } catch (e) { console.error(e); }

      overlayEl.classList.remove('d-none');
      document.body.classList.add('classic-alert-active');
      
      // Auto focus input if present, else ok button
      const inputEl = document.getElementById('classic-alert-input');
      const okBtn = document.getElementById('classic-btn-ok');
      if (inputEl) setTimeout(() => inputEl.focus(), 10);
      else if (okBtn) setTimeout(() => okBtn.focus(), 10);

      try { if (didOpen) didOpen(document.querySelector('.classic-alert-box')); } catch (e) { console.error(e); }

      if (timer) {
        timerTimeout = setTimeout(() => {
          finishAlert({ isConfirmed: false, isDenied: false, isDismissed: true });
        }, timer);
      }
    });
  };

  const customFire = function(...args) {
    injectAlertHtml();
    return new Promise((resolve) => {
      alertQueue.push({ args, resolve });
      processQueue();
    });
  };

  if (window.Swal) {
    window.Swal.fire = customFire;
    window.Swal.close = function() {
      if (currentAlertCloseFn) currentAlertCloseFn();
    };
    window.Swal.getPopup = function() { return document.querySelector('.classic-alert-box'); };
    window.Swal.showLoading = function() {
      const textEl = document.getElementById('classic-alert-text');
      if (textEl && !document.getElementById('classic-alert-overlay').classList.contains('d-none')) {
        if (!textEl.querySelector('.classic-spinner')) {
          textEl.insertAdjacentHTML('beforeend', '<div class="classic-spinner" style="margin-top:10px; text-align:center;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>');
        }
      }
    };
    window.Swal.getContainer = function() { return document.getElementById('classic-alert-overlay'); };
  } else {
    window.Swal = {
      fire: customFire,
      showLoading: function() {
        const textEl = document.getElementById('classic-alert-text');
        if (textEl && !document.getElementById('classic-alert-overlay').classList.contains('d-none')) {
          if (!textEl.querySelector('.classic-spinner')) {
            textEl.insertAdjacentHTML('beforeend', '<div class="classic-spinner" style="margin-top:10px; text-align:center;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>');
          }
        }
      },
      close: function() { if (currentAlertCloseFn) currentAlertCloseFn(); },
      getContainer: function() { return document.getElementById('classic-alert-overlay'); },
      getPopup: function() { return document.querySelector('.classic-alert-box'); }
    };
  }

  window.closeClassicAlert = function() {
    if (currentAlertCloseFn) currentAlertCloseFn();
  };

})();
