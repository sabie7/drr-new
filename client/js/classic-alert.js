     1	// Classic Alert Override
     2	(function() {
     3	  const secureCreateElement = window.secureCreateElement || function(tagName, attributes = {}, textContent = null) {
     4	    const el = document.createElement(tagName);
     5	    for (const [key, val] of Object.entries(attributes)) {
     6	      if (key === 'class') el.className = val;
     7	      else if (key === 'style') el.style.cssText = val;
     8	      else el.setAttribute(key, val);
     9	    }
    10	    if (textContent !== null) el.textContent = textContent;
    11	    return el;
    12	  };
    13	
    14	  function injectAlertHtml() {
    15	    if (document.getElementById('classic-alert-overlay')) return;
    16	    
    17	    const alertHtml = `
    18	      <div id="classic-alert-overlay" class="classic-alert-overlay d-none">
    19	        <div class="classic-alert-box">
    20	          <div class="classic-alert-header" id="classic-alert-title"> تنبيه </div>
    21	          <div class="classic-alert-body" id="classic-alert-text"></div>
    22	          <div class="classic-alert-buttons" id="classic-alert-buttons"></div>
    23	        </div>
    24	      </div>
    25	    `;
    26	    
    27	    if (document.body) {
    28	      document.body.insertAdjacentHTML('beforeend', alertHtml);
    29	    } else {
    30	      document.addEventListener('DOMContentLoaded', () => {
    31	        document.body.insertAdjacentHTML('beforeend', alertHtml);
    32	      });
    33	    }
    34	  }
    35	
    36	  // Inject as soon as possible
    37	  if (document.readyState === 'loading') {
    38	    document.addEventListener('DOMContentLoaded', injectAlertHtml);
    39	  } else {
    40	    injectAlertHtml();
    41	  }
    42	
    43	  // Override Swal immediately
    44	  const originalSwal = window.Swal;
    45	  const originalFire = window.Swal ? window.Swal.fire : null;
    46	  const originalClose = window.Swal ? window.Swal.close : null;
    47	  const originalShowLoading = window.Swal ? window.Swal.showLoading : null;
    48	  
    49	  const customFire = function(...args) {
    50	    // Ensure HTML is injected
    51	    injectAlertHtml();
    52	
    53	    // Close original Swal if it's open to prevent overlapping/lingering spinners
    54	    if (originalClose) {
    55	      originalClose.call(originalSwal);
    56	    }
    57	
    58	    return new Promise((resolve) => {
    59	      let title = 'عذراً';
    60	      let text = '';
    61	      let showCancel = false;
    62	      let showDeny = false;
    63	      let confirmText = 'موافق';
    64	      let cancelText = 'إلغاء';
    65	      let denyText = 'رفض';
    66	      let didOpen = null;
    67	      let timer = null;
    68	      let showConfirmButton = true;
    69	      let input = null;
    70	      let inputOptions = null;
    71	      let inputPlaceholder = '';
    72	      let inputValidator = null;
    73	      let icon = null;
    74	      let inputValue = '';
    75	      let preConfirm = null;
    76	      let willClose = null;
    77	      
    78	      if (typeof args[0] === 'object') {
    79	        const options = args[0];
    80	        // We now intercept even toasts to provide a consistent "classic" experience as requested by the user
    81	        // if (options.toast && originalFire) {
    82	        //   return originalFire.apply(originalSwal, args).then(resolve);
    83	        // }
    84	        title = options.title !== undefined ? options.title : title;
    85	        text = options.text || options.html || '';
    86	        showCancel = options.showCancelButton || false;
    87	        showDeny = options.showDenyButton || false;
    88	        confirmText = options.confirmButtonText || confirmText;
    89	        cancelText = options.cancelButtonText || cancelText;
    90	        denyText = options.denyButtonText || denyText;
    91	        didOpen = options.didOpen || null;
    92	        timer = options.timer || null;
    93	        showConfirmButton = options.showConfirmButton !== false;
    94	        input = options.input || null;
    95	        inputOptions = options.inputOptions || null;
    96	        inputPlaceholder = options.inputPlaceholder || '';
    97	        inputValidator = options.inputValidator || null;
    98	        icon = options.icon || null;
    99	        inputValue = options.inputValue || '';
   100	        preConfirm = typeof options.preConfirm === 'function' ? options.preConfirm : null;
   101	        willClose = typeof options.willClose === 'function' ? options.willClose : null;
   102	        
   103	        // Custom background and size style
   104	        const alertBox = document.querySelector('.classic-alert-box');
   105	        if (alertBox) {
   106	            if (options.background) {
   107	                alertBox.style.background = options.background;
   108	            } else {
   109	                alertBox.style.background = ''; // reset to default css
   110	            }
   111	            if (options.width) {
   112	                alertBox.style.width = options.width;
   113	            } else {
   114	                alertBox.style.width = ''; // reset to default css
   115	            }
   116	            if (options.maxWidth) {
   117	                alertBox.style.maxWidth = options.maxWidth;
   118	            } else {
   119	                alertBox.style.maxWidth = ''; // reset to default css
   120	            }
   121	        }
   122	      } else {
   123	        title = args[0] !== undefined ? args[0] : title;
   124	        text = args[1] || '';
   125	        icon = args[2] || null;
   126	      }
   127	
   128	      // Normalize/split long titles into body text if body text is empty to ensure clean visual styling
   129	      if (title && !text) {
   130	        const origTitle = title;
   131	        if (origTitle.startsWith('تمت الموافقة')) {
   132	          title = 'تمت الموافقة';
   133	          text = origTitle;
   134	        } else if (origTitle.startsWith('تم رفض')) {
   135	          title = 'تم الرفض';
   136	          text = origTitle;
   137	        } else if (origTitle.startsWith('تم حذف')) {
   138	          title = 'تم الحذف';
   139	          text = origTitle;
   140	        } else if (origTitle.startsWith('تم')) {
   141	          title = 'نجاح';
   142	          text = origTitle;
   143	        } else if (origTitle.startsWith('فشل')) {
   144	          title = 'فشل الإجراء';
   145	          text = origTitle;
   146	        } else if (origTitle.startsWith('حدث خطأ') || origTitle.startsWith('خطأ')) {
   147	          title = 'عذراً';
   148	          text = origTitle;
   149	        } else if (origTitle.startsWith('عذراً') || origTitle.startsWith('عذرا')) {
   150	          title = 'عذراً';
   151	          text = origTitle;
   152	        } else if (origTitle.length > 15) {
   153	          title = icon === 'success' ? 'نجاح' : (icon === 'error' ? 'عذراً' : (icon === 'warning' ? 'عذراً' : 'تنبيه'));
   154	          text = origTitle;
   155	        }
   156	      }
   157	
   158	      if (title === 'خطأ') {
   159	        title = 'عذراً';
   160	      }
   161	
   162	      const titleEl = document.getElementById('classic-alert-title');
   163	      const textEl = document.getElementById('classic-alert-text');
   164	      const overlayEl = document.getElementById('classic-alert-overlay');
   165	      const buttonsContainer = document.getElementById('classic-alert-buttons');
   166	
   167	      if (!titleEl || !textEl || !overlayEl || !buttonsContainer) {
   168	        // Fallback to original if DOM elements not ready
   169	        if (originalFire) {
   170	          return originalFire.apply(originalSwal, args).then(resolve);
   171	        }
   172	        return resolve({ isConfirmed: true });
   173	      }
   174	
   175	      if (title) {
   176	        titleEl.textContent = title;
   177	        titleEl.style.display = 'block';
   178	        
   179	        // Reset classes and apply icon-based class
   180	        titleEl.className = 'classic-alert-header';
   181	        if (icon === 'error') {
   182	          titleEl.classList.add('classic-alert-header-error');
   183	        } else if (icon === 'success') {
   184	          titleEl.classList.add('classic-alert-header-success');
   185	        } else if (icon === 'warning') {
   186	          titleEl.classList.add('classic-alert-header-warning');
   187	        } else if (icon === 'question') {
   188	          titleEl.classList.add('classic-alert-header-question');
   189	        }
   190	      } else {
   191	        titleEl.style.display = 'none';
   192	      }
   193	      
   194	      textEl.innerHTML = ''; // Clear existing
   195	      
   196	      const contentWrapper = document.createElement('div');
   197	      contentWrapper.style.marginBottom = '10px';
   198	      
   199	      if (typeof args[0] === 'object' && args[0].html) {
   200	        // If HTML is explicitly provided in options, render it
   201	        contentWrapper.innerHTML = args[0].html;
   202	      } else {
   203	        // Otherwise, use secure text content
   204	        contentWrapper.textContent = text;
   205	      }
   206	      
   207	      textEl.appendChild(contentWrapper);
   208	      
   209	      if (input === 'select' && inputOptions) {
   210	        const wrapper = secureCreateElement('div', { style: 'margin-top: 15px;' });
   211	        const select = secureCreateElement('select', { 
   212	            id: 'classic-alert-input', 
   213	            style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px;' 
   214	        });
   215	        
   216	        const placeholderOption = secureCreateElement('option', { value: '', disabled: 'disabled', selected: 'selected' }, inputPlaceholder);
   217	        select.appendChild(placeholderOption);
   218	
   219	        for (const [val, label] of Object.entries(inputOptions)) {
   220	          const option = secureCreateElement('option', { value: val }, label);
   221	          select.appendChild(option);
   222	        }
   223	        wrapper.appendChild(select);
   224	        textEl.appendChild(wrapper);
   225	      } else if (input === 'text') {
   226	        const wrapper = secureCreateElement('div', { style: 'margin-top: 15px;' });
   227	        const inputEl = secureCreateElement('input', { 
   228	            type: 'text', 
   229	            id: 'classic-alert-input', 
   230	            style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px;',
   231	            placeholder: inputPlaceholder
   232	        });
   233	        wrapper.appendChild(inputEl);
   234	        textEl.appendChild(wrapper);
   235	      } else if (input === 'textarea') {
   236	        const wrapper = secureCreateElement('div', { style: 'margin-top: 15px;' });
   237	        const textareaEl = secureCreateElement('textarea', { 
   238	            id: 'classic-alert-input', 
   239	            style: 'width: 100%; padding: 5px; border: 1px solid #000; border-radius: 3px; direction: rtl;',
   240	            placeholder: inputPlaceholder,
   241	            rows: '4'
   242	        });
   243	        wrapper.appendChild(textareaEl);
   244	        textEl.appendChild(wrapper);
   245	      }
   246	
   247	      if (input && inputValue) {
   248	        const inputEl = document.getElementById('classic-alert-input');
   249	        if (inputEl) inputEl.value = inputValue;
   250	      }
   251	
   252	      const handleConfirm = async () => {
   253	        let value = true;
   254	
   255	        if (input) {
   256	          const inputEl = document.getElementById('classic-alert-input');
   257	          if (inputEl) value = inputEl.value;
   258	        }
   259	
   260	        if (inputValidator) {
   261	          const error = inputValidator(value);
   262	          if (error) {
   263	            let errorEl = document.getElementById('classic-alert-error');
   264	
   265	            if (!errorEl) {
   266	              errorEl = secureCreateElement('div', {
   267	                id: 'classic-alert-error',
   268	                style: 'color: red; margin-top: 10px; font-size: 0.9rem;'
   269	              });
   270	              textEl.appendChild(errorEl);
   271	            }
   272	
   273	            errorEl.textContent = error;
   274	            return;
   275	          }
   276	        }
   277	
   278	        if (preConfirm) {
   279	          try {
   280	            const preConfirmValue = await preConfirm(value);
   281	
   282	            if (preConfirmValue === false) {
   283	              return;
   284	            }
   285	
   286	            // إن أعادت preConfirm قيمة محددة، استخدمها كقيمة نهائية.
   287	            if (preConfirmValue !== undefined) {
   288	              value = preConfirmValue;
   289	            }
   290	          } catch (error) {
   291	            console.error('[ClassicAlert] preConfirm failed:', error);
   292	            return;
   293	          }
   294	        }
   295	
   296	        try {
   297	          if (willClose) willClose();
   298	        } catch (error) {
   299	          console.error('[ClassicAlert] willClose failed:', error);
   300	        }
   301	
   302	        closeClassicAlert();
   303	
   304	        resolve({
   305	          isConfirmed: true,
   306	          isDenied: false,
   307	          isDismissed: false,
   308	          value
   309	        });
   310	      };
   311	
   312	      const handleDeny = async () => {
   313	        if (preConfirm) {
   314	          try {
   315	            const preConfirmValue = await preConfirm('reject');
   316	            if (preConfirmValue === false) return;
   317	          } catch (error) {
   318	            console.error('[ClassicAlert] preConfirm failed:', error);
   319	            return;
   320	          }
   321	        }
   322	
   323	        try {
   324	          if (willClose) willClose();
   325	        } catch (error) {
   326	          console.error('[ClassicAlert] willClose failed:', error);
   327	        }
   328	
   329	        closeClassicAlert();
   330	
   331	        resolve({
   332	          isConfirmed: false,
   333	          isDenied: true,
   334	          isDismissed: false,
   335	          value: 'reject'
   336	        });
   337	      };
   338	
   339	      if (!showConfirmButton && !showCancel && !showDeny) {
   340	        buttonsContainer.innerHTML = '';
   341	      } else if (showCancel || showDeny) {
   342	        buttonsContainer.innerHTML = '';
   343	        if (showConfirmButton) {
   344	          const btnConfirm = secureCreateElement('button', { class: 'btn btn-sm btn-dark px-3 mx-1', id: 'classic-btn-confirm' }, confirmText);
   345	          buttonsContainer.appendChild(btnConfirm);
   346	          btnConfirm.onclick = () => { void handleConfirm(); };
   347	        }
   348	        if (showDeny) {
   349	          const btnDeny = secureCreateElement('button', { class: 'btn btn-sm btn-danger px-3 mx-1', id: 'classic-btn-deny' }, denyText);
   350	          buttonsContainer.appendChild(btnDeny);
   351	          btnDeny.onclick = () => { void handleDeny(); };
   352	        }
   353	        if (showCancel) {
   354	          const btnCancel = secureCreateElement('button', { class: 'btn btn-sm btn-secondary px-3 mx-1', id: 'classic-btn-cancel' }, cancelText);
   355	          buttonsContainer.appendChild(btnCancel);
   356	          btnCancel.onclick = () => {
   357	            try {
   358	              if (willClose) willClose();
   359	            } catch (error) {
   360	              console.error('[ClassicAlert] willClose failed:', error);
   361	            }
   362	
   363	            closeClassicAlert();
   364	
   365	            resolve({
   366	              isConfirmed: false,
   367	              isDenied: false,
   368	              isDismissed: true
   369	            });
   370	          };
   371	        }
   372	      } else {
   373	        buttonsContainer.innerHTML = '';
   374	        const btnOk = secureCreateElement('button', { class: 'btn btn-sm btn-dark px-4', id: 'classic-btn-ok' }, confirmText);
   375	        buttonsContainer.appendChild(btnOk);
   376	        
   377	        btnOk.onclick = () => {
   378	          void handleConfirm();
   379	        };
   380	      }
   381	      
   382	      overlayEl.classList.remove('d-none');
   383	      document.body.classList.add('classic-alert-active');
   384	      if (didOpen) didOpen();
   385	
   386	      if (timer) {
   387	        setTimeout(() => {
   388	          try {
   389	            if (willClose) willClose();
   390	          } catch (error) {
   391	            console.error('[ClassicAlert] willClose failed:', error);
   392	          }
   393	          closeClassicAlert();
   394	          resolve({ isConfirmed: false, isDenied: false, isDismissed: true });
   395	        }, timer);
   396	      }
   397	    });
   398	  };
   399	
   400	  if (window.Swal) {
   401	    window.Swal.fire = customFire;
   402	    window.Swal.close = function() {
   403	      closeClassicAlert();
   404	      if (originalClose) originalClose.call(originalSwal);
   405	    };
   406	    window.Swal.getPopup = function() { return document.querySelector('.classic-alert-box'); };
   407	    window.Swal.showLoading = function() {
   408	      // If we're using classic alerts, we might want to show a loading state in the classic box
   409	      const textEl = document.getElementById('classic-alert-text');
   410	      if (textEl && !document.getElementById('classic-alert-overlay').classList.contains('d-none')) {
   411	        if (!textEl.querySelector('.classic-spinner')) {
   412	          textEl.insertAdjacentHTML('beforeend', '<div class="classic-spinner" style="margin-top:10px; text-align:center;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>');
   413	        }
   414	      }
   415	      // Do NOT call originalShowLoading here as it triggers the standard SweetAlert UI
   416	      // which appears behind our classic alert.
   417	    };
   418	    window.Swal.getContainer = function() { return document.getElementById('classic-alert-overlay'); };
   419	  } else {
   420	    window.Swal = {
   421	      fire: customFire,
   422	      showLoading: function() {
   423	        const textEl = document.getElementById('classic-alert-text');
   424	        if (textEl && !document.getElementById('classic-alert-overlay').classList.contains('d-none')) {
   425	          if (!textEl.querySelector('.classic-spinner')) {
   426	            textEl.insertAdjacentHTML('beforeend', '<div class="classic-spinner" style="margin-top:10px; text-align:center;"><div class="spinner-border spinner-border-sm text-primary" role="status"></div></div>');
   427	          }
   428	        }
   429	      },
   430	      close: function() { closeClassicAlert(); },
   431	      getContainer: function() { return document.getElementById('classic-alert-overlay'); },
   432	      getPopup: function() { return document.querySelector('.classic-alert-box'); }
   433	    };
   434	  }
   435	
   436	  window.closeClassicAlert = function() {
   437	    const overlay = document.getElementById('classic-alert-overlay');
   438	    if (overlay) overlay.classList.add('d-none');
   439	    document.body.classList.remove('classic-alert-active');
   440	  };
   441	})();
   442	
   443	