/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 26/28 · user-visuals-profile-modal
   lines 10406–12518 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function updateUserVisuals(users) {
  renderOnlineBotsForSelection();

  const getElementsFallback = (classes, id, username) => {
    let els = [];
    if (id) {
      const idSelector = classes.map(cls => `${cls}[data-user-id="${id}"]`).join(', ');
      els = Array.from(document.querySelectorAll(idSelector));
    }
    if (els.length === 0 && username) {
      const safeUsername = username.replace(/"/g, '\\"');
      const nameSelector = classes.map(cls => `${cls}[data-username="${safeUsername}"]`).join(', ');
      els = Array.from(document.querySelectorAll(nameSelector));
    }
    return els;
  };

  users.forEach(u => {
    // Generate signature of all visual properties including cover
    const signature = `${u.pic}|${u.cover || ''}|${u.ucol}|${u.bg}|${u.fontColor}|${u.topic}|${u.superIcon}|${u.likes}|${u.rep}|${u.wallPoints}|${u.isVerified}|${u.isSpeakerMuted}`;
    const userKey = u.key || getPresenceKey(u);
    if (state.previousUserSignatures[userKey] !== signature) {
      state.previousUserSignatures[userKey] = signature;
      
      const avatarUrl = window.getAvatarUrl(u);
      const absoluteAvatarUrl = avatarUrl.startsWith('http') || avatarUrl.startsWith('data:') ? avatarUrl : new URL(avatarUrl, window.location.href).href;
      
      const resolvedId = u.userId ?? u.id;

      // Update profile modal if it is open for this user
      if (typeof profileUser !== 'undefined' && profileUser && (profileUser.username === u.username || profileUser.id === resolvedId)) {
        profileUser.wallPoints = u.wallPoints || 0;
        
        const profileWallPoints = document.getElementById('profile-wall-points');
        if (profileWallPoints) {
           profileWallPoints.innerText = window.formatCompactNumber ? window.formatCompactNumber(profileUser.wallPoints) : profileUser.wallPoints;
        }
        
        if (typeof window.renderProfileBadges === 'function' && window.badgeSettings) {
           window.renderProfileBadges(profileUser, window.badgeSettings);
        }
      }

      // Update avatars
      const avatarEls = getElementsFallback(['.message-avatar', '.wall-post-avatar'], resolvedId, u.username);
      avatarEls.forEach(img => {
        if (img.src !== absoluteAvatarUrl) {
          img.src = avatarUrl;
        }
      });
      
      const quotedEls = getElementsFallback(['.quoted-avatar'], resolvedId, u.username);
      quotedEls.forEach(img => {
        if (img.src !== absoluteAvatarUrl) {
          img.src = avatarUrl;
        }
      });

      const storyEls = getElementsFallback(['.story-avatar'], resolvedId, u.username);
      storyEls.forEach(img => {
        if (img.src !== absoluteAvatarUrl) {
          img.src = avatarUrl;
        }
      });

      // Update gifts in wall
      const giftsEls = getElementsFallback(['.user-gifts-container'], resolvedId, u.username);
      giftsEls.forEach(el => {
        const giftHtml = (u.gifts && u.gifts.length > 0) ? `<img src="${u.gifts[0]}" style="height: 16px; width: auto;" title="هدية">` : '';
        if (el.innerHTML !== giftHtml) {
          el.innerHTML = giftHtml;
        }
      });

      // Update colors
      const ucol = u.ucol || '#000000';
      const fontColor = u.fontColor || '#000000';
      
      const isBgImage = (u.bg && u.bg !== 'transparent' && (u.bg.startsWith('http') || u.bg.startsWith('/'))) ? true : false;
      const bgValue = (u.bg && u.bg !== 'transparent') ? u.bg : 'transparent';

      const usernameEls = getElementsFallback(['.message-username', '.private-msg-username', '.wall-post-username', '.quick-chat-username'], resolvedId, u.username);
      usernameEls.forEach(el => {
        el.style.setProperty('color', ucol,);
        if (isBgImage) {
          el.style.setProperty('background', 'none', 'important');
          el.style.setProperty('background-color', 'transparent', 'important');
          el.style.setProperty('background-image', `url('${bgValue}')`, 'important');
          el.style.setProperty('background-position', 'center', 'important');
          el.style.setProperty('background-size', 'cover', 'important');
          el.style.setProperty('background-repeat', 'no-repeat', 'important');
        } else {
          el.style.setProperty('background-image', 'none', 'important');
          el.style.setProperty('background-color', bgValue, 'important');
          el.style.setProperty('background', bgValue, 'important');
        }
        el.style.setProperty('padding', '0 4px', 'important');
        el.style.setProperty('border-radius', '2px', 'important');
        el.innerHTML = u.topic || u.username;
      });
      
      const quotedUsernameEls = getElementsFallback(['.quoted-username'], resolvedId, u.username);
      quotedUsernameEls.forEach(el => {
        el.style.color = ucol;
        el.innerHTML = u.topic || u.username;
      });

      const micLabelEls = getElementsFallback(['.mic-user-label'], resolvedId, u.username);
      micLabelEls.forEach(el => {
        el.textContent = u.topic || u.username;
        const parentBtn = el.closest('.btn-mic');
        if (parentBtn) {
          parentBtn.title = u.topic || u.username;
        }
      });

      const msgTextEls = getElementsFallback(['.message-text'], resolvedId, u.username);
      msgTextEls.forEach(el => {
        el.style.color = fontColor;
      });

      // Update profile modal if open
      if (profileUser && (profileUser.username === u.username || (profileUser.id && profileUser.id === (u.userId ?? u.id)))) {
        profileUser = { ...profileUser, ...u };
        window.profileUser = profileUser;
        if (typeof window.renderProfileCover === 'function') {
          window.renderProfileCover(u.cover, profileUser);
        }
        
        const profileLikesCount = document.getElementById('profile-likes-count');
        if (profileLikesCount) profileLikesCount.innerText = formatCompactNumber(u.likes);
        const likesBtnCount = document.getElementById('profile-likes-count-btn');
        if (likesBtnCount) likesBtnCount.innerText = formatCompactNumber(u.likes);
        
        const profileRepCount = document.getElementById('profile-rep-count');
        if (profileRepCount) profileRepCount.innerText = formatCompactNumber(u.rep);
        const repBtnCount = document.getElementById('profile-rep-count-btn');
        if (repBtnCount) repBtnCount.innerText = formatCompactNumber(u.rep);

        const verifiedBadge = document.getElementById('profile-verified-badge');
        if (verifiedBadge) {
          verifiedBadge.classList.toggle('d-none', !u.isVerified);
        }
      }

      document.querySelectorAll(`.mic-user-name[data-username="${u.username}"]`).forEach(el => {
        el.style.setProperty('color', ucol, 'important');
        if (isBgImage && !u.superIcon) {
          el.style.setProperty('background', 'none', 'important');
          el.style.setProperty('background-color', 'transparent', 'important');
          el.style.setProperty('background-image', `url('${bgValue}')`, 'important');
          el.style.setProperty('background-position', 'center', 'important');
          el.style.setProperty('background-size', 'cover', 'important');
          el.style.setProperty('background-repeat', 'no-repeat', 'important');
        } else {
          el.style.setProperty('background-image', 'none', 'important');
          el.style.setProperty('background-color', bgValue, 'important');
          el.style.setProperty('background', bgValue, 'important');
        }
        el.innerText = u.topic || u.username;
      });
    }
  });

  const onlineUsers = users.filter(u => u.isOnline || u.isGhost);

  const landingItems = onlineUsers.map(u => {
    const selectedCountry = (u.profileCountry || u.country || '')
      .toString()
      .trim()
      .toLowerCase();

    const countryCode = selectedCountry && selectedCountry !== 'unknown'
      ? selectedCountry
      : null;
    let statusColor = '#6c757d'; // Offline (gray)
    if (u.isOnline) {
      if (u.isVirtualUser && u.onlineStatusStr) {
        if (u.onlineStatusStr === 'أخضر') statusColor = '#28a745';
        else if (u.onlineStatusStr === 'أحمر') statusColor = '#dc3545';
        else if (u.onlineStatusStr === 'أصفر') statusColor = '#ffc107';
        else if (u.onlineStatusStr === 'أزرق') statusColor = '#007bff';
        else statusColor = '#6c757d';
      } else if (u.isGhost) {
        statusColor = '#6c757d'; // Ghost (gray)
      } else if (u.isHidden) {
        statusColor = '#007bff'; // Hidden (blue)
      } else if (u.isReconnecting) {
        statusColor = '#ffc107'; // Reconnecting (yellow)
      } else {
        statusColor = (u.isIdle || u.presenceState === 'idle') ? '#ffc107' : '#28a745'; // Idle (yellow) or Active (green)
      }
    }
    
    const appearance = window.siteAppearance || window.domainConfig;
    const rawLandingStatusVal = appearance ? appearance.showStatusOnLanding : undefined;
    const showStatusColorOnLanding =
      rawLandingStatusVal === true ||
      rawLandingStatusVal === 'true' ||
      rawLandingStatusVal === 1 ||
      rawLandingStatusVal === '1';

    const hasDesign = !!(u.membershipFrame || u.membershipBg);
    const showAvatar = u.showMembershipAvatar !== false;
    const showName = u.showMembershipName !== false;
    const showStatusText = u.showMembershipStatus !== false;

    const isActuallyOnline = u.isOnline && !u.isGhost;
    const isYellow = statusColor === '#ffc107';
    const borderColor = (isActuallyOnline && u.allowPrivate === false && !isYellow) ? '#dc3545' : statusColor;

    const landingStatusBorderDesign = showStatusColorOnLanding
      ? `border-left: 5px solid ${borderColor} !important;`
      : '';

    const landingStatusBorderDefault = showStatusColorOnLanding
      ? `border-left: 4px solid ${borderColor} !important;`
      : '';

    const ghostStyle = (showStatusColorOnLanding && u.isGhost)
      ? 'border-left: 4px solid #808080 !important;'
      : '';

    let html = '';

    if (hasDesign) {
      const avatarHtml = window.renderAvatar(u, '', 'width: 72px; height: 72px;');
      const bgStyle = u.membershipBg ? `background: url('${u.membershipBg}'); background-size: cover; background-position: center;` : 'background: #fff;';
      const textColor = u.membershipBg ? '#fff' : (u.ucol || '#000');
      const textShadow = '';
      
      const isClickable = !!state.currentUser;
      html = `
      <div id="landing-user-${u.username}" class="list-group-item d-flex align-items-center border-0 border-bottom p-0 user-pro-item ${isClickable ? 'js-user-profile-btn' : ''} ${u.isGhost ? 'ghost-user' : ''}" ${isClickable ? `data-username="${escapeHTML(u.username)}"` : ''} data-user-id="${u.userId ?? u.id}" style="${landingStatusBorderDesign} min-height: 90px; ${bgStyle} ${textShadow} ${ghostStyle} overflow: hidden; position: relative;">
        ${showAvatar ? `
        <div style="margin: 5px 10px; flex-shrink: 0; z-index: 1;">
          ${avatarHtml}
        </div>
        ` : ''}
        <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">
          ${showName ? `
          <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">
            ${window.renderUserIdentity(u, {
                containerClasses: 'user-addon-container font-weight-bold',
                nameStyle: `color: ${u.ucol || textColor};`
            })}
          </div>
          ` : ''}
          ${showStatusText ? `
          <div class="user-sidebar-status fw-bold" style="color: ${(window.featuresSettings.statusColorEnabled === true && u.mcol) ? u.mcol : '#888'}; width: 100%; display: block;">
            ${u.msg || (u.type === 'guest' ? 'زائر' : 'عضو')}
          </div>
          ` : ''}
        </div>
        <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">
          ${(u.showMembershipFlag !== false && countryCode) ? `<img src="/flags/${countryCode}.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; object-fit: cover;">` : ''}
          ${(u.userId && u.showMembershipId !== false && !isNaN(Number(u.userId))) ? `<span style="font-size: 11px; font-weight: 700; color: ${u.membershipBg ? '#fff' : '#6c757d'}; letter-spacing: 0.5px;">#${Math.abs(Number(u.userId))}</span>` : ''}
        </div>
      </div>
    `;
    } else {
      const isClickable = !!state.currentUser;
      const rawId = u.userId ?? u.id;
      const displayId = (rawId && !isNaN(Number(rawId))) ? `#${Math.abs(Number(rawId))}` : '';
      html = `
      <div id="landing-user-${u.username}" class="list-group-item d-flex align-items-start border-0 border-bottom p-0 ${isClickable ? 'js-user-profile-btn' : ''}" ${isClickable ? `data-username="${escapeHTML(u.username)}"` : ''} data-user-id="${u.userId ?? u.id}" style="${landingStatusBorderDefault} min-height: 52px; background-color: #fff; ${ghostStyle}; cursor: default; position: relative;">
        <div>
          <img src="${window.getAvatarUrl(u)}" style="width: 50px; height: 50px; object-fit: cover;" referrerPolicy="origin-when-cross-origin">
        </div>
        <div class="flex-grow-1 ps-1 py-1 d-flex flex-column" style="min-width: 0; z-index: 1; padding-right: 4px !important; flex: 1;">
          <div class="fw-bold d-flex align-items-center flex-wrap" style="font-size: 17px; font-family: var(--font-family); line-height: 1.2; padding-right: 45px; width: 100%;">
            ${window.renderUserIdentity(u, {
                containerClasses: 'user-addon-container font-weight-bold',
                nameStyle: `color: ${u.ucol || '#000000'}; font-family: var(--font-family);`
            })}
          </div>
          ${showStatusText ? `
          <div class="user-sidebar-status fw-bold" style="color: ${(window.featuresSettings?.statusColorEnabled === true && u.mcol) ? u.mcol : '#888'}; width: 100%; display: block;">
            ${u.msg || (u.isOnline ? 'متصل الآن' : 'غير متصل')}
          </div>
          ` : ''}
        </div>
        <div class="d-flex flex-column align-items-center justify-content-center" style="position: absolute; top: 6px; right: 6px; z-index: 2;">
          ${countryCode ? `<img src="/flags/${countryCode}.png" style="width: 20px; height: 20px; margin-bottom: 2px; border-radius: 2px; object-fit: cover;">` : ''}
          ${displayId ? `<span style="font-size: 9px; font-weight: 700; color: #6c757d; letter-spacing: 0.5px;">${displayId}</span>` : ''}
        </div>
      </div>
    `;
    }
    
    return { id: `landing-user-${u.username}`, html: html };
  });

  if (!state.currentUser && ui.landingUsersList) {
    syncDOMList(ui.landingUsersList, landingItems);
  }

  // Update music player UI to refresh avatars/names if person playing changed their info
  if (window.musicManager) {
    window.musicManager.updateUI();
  }
}


async function renderSettings(skipLoading = false) {
  if (!state.currentUser) return;
  
  currentSettingsView = 'settings';
  window.renderSettings = renderSettings;
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'الضبط والإعدادات';

  const renderUI = () => {
    const getColorPreviewStyle = (color) => {
      if (!color || color === 'transparent') return 'background-color: transparent;';
      return `background-color: ${color};`;
    };
    const getColorClass = (color) => (!color || color === 'transparent') ? 'transparent' : '';

    ui.sidebarSettingsContainer.innerHTML = `
      <div class="classic-settings-container">
        <div class="settings-content">
          <div class="classic-header">الزخرفه</div>
          <input type="text" id="set-topic" name="profile_decoration_text" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" class="classic-input" value="${state.currentUser.topic || ''}">
          
          <div class="classic-header">الحاله</div>
          <input type="text" id="set-msg" name="profile_status_text" autocomplete="off" data-lpignore="true" data-1p-ignore="true" data-bwignore="true" class="classic-input" value="${state.currentUser.msg || ''}">
          
          <div class="simple-settings-list">
          <div class="simple-setting-row">
            <div class="simple-setting-label" style="cursor: pointer;" onclick="window.openColorPalette(this.nextElementSibling, 'set-ucol')">لون الإسم</div>
            <div class="simple-color-preview ${getColorClass(state.currentUser.ucol)}" style="${getColorPreviewStyle(state.currentUser.ucol)}" onclick="window.openColorPalette(this, 'set-ucol')"></div>
            <input type="hidden" id="set-ucol" value="${state.currentUser.ucol || '#000000'}">
          </div>
          <div class="simple-setting-row">
            <div class="simple-setting-label" style="cursor: pointer;" onclick="window.openColorPalette(this.nextElementSibling, 'set-fontcol')">لون خط الكتابة</div>
            <div class="simple-color-preview ${getColorClass(state.currentUser.fontColor)}" style="${getColorPreviewStyle(state.currentUser.fontColor)}" onclick="window.openColorPalette(this, 'set-fontcol')"></div>
            <input type="hidden" id="set-fontcol" value="${state.currentUser.fontColor || '#000000'}">
          </div>
          <div class="simple-setting-row">
            <div class="simple-setting-label" style="cursor: pointer;" onclick="window.openColorPalette(this.nextElementSibling, 'set-bg')">لون خلفية الأسم</div>
            <div class="simple-color-preview ${getColorClass(state.currentUser.bg)}" style="${getColorPreviewStyle(state.currentUser.bg)}" onclick="window.openColorPalette(this, 'set-bg')"></div>
            <input type="hidden" id="set-bg" value="${state.currentUser.bg || 'transparent'}">
          </div>
          ${(window.featuresSettings?.statusColorEnabled === true) ? `
          <div class="simple-setting-row">
            <div class="simple-setting-label" style="cursor: pointer;" onclick="window.openColorPalette(this.nextElementSibling, 'set-status-col')">لون الحالة</div>
            <div class="simple-color-preview ${getColorClass(state.currentUser.mcol)}" style="${getColorPreviewStyle(state.currentUser.mcol)}" onclick="window.openColorPalette(this, 'set-status-col')"></div>
            <input type="hidden" id="set-status-col" value="${state.currentUser.mcol || '#000000'}">
          </div>
          ` : ''}
          ${hasPermission('canChangeCountry') ? `
          <div class="simple-setting-row">
            <div class="simple-setting-label">الدولة</div>
            <select id="set-country" class="classic-input">
                <option value="" ${!state.currentUser.profileCountry ? 'selected' : ''}>تلقائي حسب الدولة من IP</option>
                <option value="jo" ${state.currentUser.profileCountry === 'jo' ? 'selected' : ''}>الأردن</option>
                <option value="sa" ${state.currentUser.profileCountry === 'sa' ? 'selected' : ''}>السعودية</option>
                <option value="eg" ${state.currentUser.profileCountry === 'eg' ? 'selected' : ''}>مصر</option>
                <option value="iq" ${state.currentUser.profileCountry === 'iq' ? 'selected' : ''}>العراق</option>
                <option value="ae" ${state.currentUser.profileCountry === 'ae' ? 'selected' : ''}>الإمارات</option>
                <option value="kw" ${state.currentUser.profileCountry === 'kw' ? 'selected' : ''}>الكويت</option>
                <option value="qa" ${state.currentUser.profileCountry === 'qa' ? 'selected' : ''}>قطر</option>
                <option value="bh" ${state.currentUser.profileCountry === 'bh' ? 'selected' : ''}>البحرين</option>
                <option value="om" ${state.currentUser.profileCountry === 'om' ? 'selected' : ''}>عمان</option>
                <option value="ye" ${state.currentUser.profileCountry === 'ye' ? 'selected' : ''}>اليمن</option>
                <option value="sy" ${state.currentUser.profileCountry === 'sy' ? 'selected' : ''}>سوريا</option>
                <option value="lb" ${state.currentUser.profileCountry === 'lb' ? 'selected' : ''}>لبنان</option>
                <option value="ps" ${state.currentUser.profileCountry === 'ps' ? 'selected' : ''}>فلسطين</option>
                <option value="ma" ${state.currentUser.profileCountry === 'ma' ? 'selected' : ''}>المغرب</option>
                <option value="tn" ${state.currentUser.profileCountry === 'tn' ? 'selected' : ''}>تونس</option>
                <option value="dz" ${state.currentUser.profileCountry === 'dz' ? 'selected' : ''}>الجزائر</option>
                <option value="ly" ${state.currentUser.profileCountry === 'ly' ? 'selected' : ''}>ليبيا</option>
                <option value="sd" ${state.currentUser.profileCountry === 'sd' ? 'selected' : ''}>السودان</option>
                <option value="so" ${state.currentUser.profileCountry === 'so' ? 'selected' : ''}>الصومال</option>
                <option value="mr" ${state.currentUser.profileCountry === 'mr' ? 'selected' : ''}>موريتانيا</option>
                <option value="us" ${state.currentUser.profileCountry === 'us' ? 'selected' : ''}>امريكا</option>
                <option value="fr" ${state.currentUser.profileCountry === 'fr' ? 'selected' : ''}>فرنسا</option>
                <option value="gb" ${state.currentUser.profileCountry === 'gb' ? 'selected' : ''}>بريطانيا</option>
                <option value="ar" ${state.currentUser.profileCountry === 'ar' ? 'selected' : ''}>الارجنتين</option>
                <option value="au" ${state.currentUser.profileCountry === 'au' ? 'selected' : ''}>استراليا</option>
                <option value="cn" ${state.currentUser.profileCountry === 'cn' ? 'selected' : ''}>الصين</option>
                <option value="ru" ${state.currentUser.profileCountry === 'ru' ? 'selected' : ''}>روسيا</option>
                <option value="ca" ${state.currentUser.profileCountry === 'ca' ? 'selected' : ''}>كندا</option>
                <option value="br" ${state.currentUser.profileCountry === 'br' ? 'selected' : ''}>البرازيل</option>
                <option value="in" ${state.currentUser.profileCountry === 'in' ? 'selected' : ''}>الهند</option>
                <option value="dj" ${state.currentUser.profileCountry === 'dj' ? 'selected' : ''}>جيبوتي</option>
                <option value="km" ${state.currentUser.profileCountry === 'km' ? 'selected' : ''}>جزر القمر</option>
            </select>
          </div>
          ` : ''}
        </div>

        <button class="classic-btn classic-btn-green sidebar-action" id="save-settings-btn">
          <i class="fas fa-edit btn-icon-left"></i>
          <span>حفظ التغيرات</span>
        </button>
        
        <div class="classic-btn classic-btn-dark p-0 overflow-hidden" style="height: 32px;">
          <select id="set-font-size" class="w-100 h-100 bg-transparent text-white border-0 px-2 text-center" style="appearance: none; cursor: pointer; outline: none;">
            <option value="150" class="text-dark">حجم الخطوط - 150%</option>
            <option value="140" class="text-dark">حجم الخطوط - 140%</option>
            <option value="130" class="text-dark">حجم الخطوط - 130%</option>
            <option value="120" class="text-dark">حجم الخطوط - 120%</option>
            <option value="115" class="text-dark">حجم الخطوط - 115%</option>
            <option value="110" class="text-dark">حجم الخطوط - 110%</option>
            <option value="105" class="text-dark">حجم الخطوط - 105%</option>
            <option value="100" class="text-dark" selected>حجم الخطوط - 100%</option>
            <option value="95" class="text-dark">حجم الخطوط - 95%</option>
            <option value="90" class="text-dark">حجم الخطوط - 90%</option>
            <option value="85" class="text-dark">حجم الخطوط - 85%</option>
            <option value="80" class="text-dark">حجم الخطوط - 80%</option>
            <option value="70" class="text-dark">حجم الخطوط - 70%</option>
            <option value="60" class="text-dark">حجم الخطوط - 60%</option>
            <option value="50" class="text-dark">حجم الخطوط - 50%</option>
          </select>
          <i class="fas fa-chevron-down btn-icon-left"></i>
        </div>

        <button id="settings-upload-btn" class="classic-btn classic-btn-green sidebar-action" onclick="handleSettingsUpload()">
          <img src="${window.getAvatarUrl(state.currentUser)}" class="classic-avatar-small btn-avatar-right settings-avatar-margin">
          <span>تغيير الصورة</span>
          <i class="fas fa-image btn-icon-left"></i>
        </button>

        <button class="classic-btn classic-btn-red sidebar-action" id="delete-pic-btn">
          <img src="${window.getAvatarUrl(state.currentUser)}" class="classic-avatar-small btn-avatar-right settings-avatar-margin">
          <span>حذف الصورة</span>
          <i class="fas fa-ban btn-icon-left"></i>
        </button>

        <div class="settings-group-accordion" id="privacy-group">
          <div class="settings-group-header" onclick="window.toggleSettingsGroup(this)" aria-expanded="false" role="button" tabindex="0">
            <span>🔒 الإشعارات والخصوصية</span>
            <i class="fas fa-chevron-down arrow-icon"></i>
          </div>
          <div class="settings-group-content">
            <div class="classic-settings-toggle-row">
              <div class="toggle-label">
                <i class="fas fa-comment"></i>
                <span>استقبال الرسائل الخاصة</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-private-checkbox" ${state.currentUser.allowPrivate ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>

            ${hasPermission('canUseCamera') ? `
            <div class="classic-settings-toggle-row">
              <div class="toggle-label">
                <i class="fas fa-camera"></i>
                <span>تفعيل الكاميرا</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-camera-checkbox" ${state.currentUser.allowCamera !== false ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>
            ` : ''}

            <div class="classic-settings-toggle-row">
              <div class="toggle-label">
                <i class="fas fa-envelope"></i>
                <span>استقبال التنبيهات</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-notifications-checkbox" ${state.currentUser.allowAlerts ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>

            <div class="classic-settings-toggle-row">
              <div class="toggle-label">
                <i class="fas fa-volume-mute"></i>
                <span>كتم صوت الإشعارات</span>
              </div>
              <label class="switch">
                <input type="checkbox" id="toggle-mute-notifications-checkbox" ${(localStorage.getItem('muteNotificationSounds') === 'true' || state.currentUser?.muteNotificationSounds === true) ? 'checked' : ''}>
                <span class="slider round"></span>
              </label>
            </div>

            ${!(state.currentUser.isGuest || state.currentUser.type === 'guest') ? `
            <button class="classic-btn classic-btn-orange sidebar-action" id="change-password-trigger-btn" style="margin-top: 10px; margin-bottom: 10px;">
              <span>تغيير كلمة المرور</span>
              <i class="fas fa-key btn-icon-left"></i>
            </button>
            ` : ''}
          </div>
        </div>

        ${(window.featuresSettings?.sidebarAddonsEnabled === true || hasPermission('canUseAddons') || hasPermission('canManageAddons') || hasPermission('canviewsvisitprofile')) ? `
        <button class="classic-btn classic-btn-white sidebar-action" onclick="renderAddons()">
          <i class="fas fa-plus btn-icon-left"></i>
          <span>الإضافات</span>
        </button>
        ` : ''}

        ${hasPermission('canSendBroadcastMessages') ? `
        <button class="classic-btn classic-btn-white sidebar-action" onclick="sendPublicAlert()">
          <i class="fas fa-paper-plane btn-icon-left"></i>
          <span>إرسال إعلان</span>
        </button>
        ` : ''}

        ${(hasPermission('canManageRooms') || (window.roomsData && window.roomsData[state.currentRoomId] && (window.roomsData[state.currentRoomId].ownerId === state.currentUser.id || (window.roomsData[state.currentRoomId].moderators || []).some(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)))))) ? `
        <button class="classic-btn classic-btn-blue sidebar-action" onclick="openEditRoomModal()">
          <i class="fas fa-cog btn-icon-left"></i>
          <span>إدارة الغرفة الحالية</span>
        </button>
        ` : ''}
      </div>
      <div class="settings-footer" style="padding: 10px; border-top: 1px solid #000; background: #eee;">
        ${hasPermission('canAccessAdminPanel') ? `
          <button class="classic-btn classic-btn-white sidebar-action" onclick="openAdminPanel()">
            <i class="fas fa-star btn-icon-left"></i>
            <span>لوحه التحكم</span>
          </button>
        ` : ''}
        <button class="classic-btn classic-btn-red sidebar-action" id="settings-logout-btn">
          <i class="fas fa-sign-out-alt btn-icon-left"></i>
          <span>تسجيل خروج</span>
        </button>
      </div>
    </div>
  `;

  // Event Listeners
  ui.settingsUploadBtn = document.getElementById('settings-upload-btn');
  if (document.getElementById('save-settings-btn')) document.getElementById('save-settings-btn').onclick = saveSettings;
  document.getElementById('delete-pic-btn').onclick = () => updateUserSettings({ pic: null }, true);
  const changePwdTriggerBtn = document.getElementById('change-password-trigger-btn');
  if (changePwdTriggerBtn) {
    changePwdTriggerBtn.onclick = () => renderChangePasswordView();
  }
  const fontSizeSelect = document.getElementById('set-font-size');
  if (fontSizeSelect) {
    // Set initial value based on saved preference
    const savedFontSize = sessionStorage.getItem('userFontSize') || '100';
    fontSizeSelect.value = savedFontSize;
    
    fontSizeSelect.onchange = (e) => {
      sessionStorage.setItem('userFontSize', e.target.value);
      applyUserFontSize();
    };
  }
  document.getElementById('settings-logout-btn').onclick = () => {
    Swal.fire({
      title: 'تسجيل الخروج',
      text: 'هل أنت متأكد من تسجيل الخروج؟',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'نعم',
      cancelButtonText: 'إلغاء'
    }).then((result) => {
      if (result.isConfirmed) {
        logout();
      }
    });
  };
  const togglePrivateCheckbox = document.getElementById('toggle-private-checkbox');
  if (togglePrivateCheckbox) {
    togglePrivateCheckbox.onchange = (e) => {
      updateUserSettings({ allowPrivate: e.target.checked }, true);
    };
  }

  const toggleNotificationsCheckbox = document.getElementById('toggle-notifications-checkbox');
  if (toggleNotificationsCheckbox) {
    toggleNotificationsCheckbox.onchange = (e) => {
      updateUserSettings({ allowAlerts: e.target.checked }, true);
    };
  }

  const toggleCameraCheckbox = document.getElementById('toggle-camera-checkbox');
  if (toggleCameraCheckbox) {
    toggleCameraCheckbox.onchange = (e) => {
      updateUserSettings({ allowCamera: e.target.checked }, true);
    };
  }

  const muteCheckbox = document.getElementById('toggle-mute-notifications-checkbox');
  if (muteCheckbox) {
    muteCheckbox.addEventListener('change', (e) => {
      const isMuted = e.target.checked;
      localStorage.setItem('muteNotificationSounds', isMuted ? 'true' : 'false');
      if (state.currentUser) {
        state.currentUser.muteNotificationSounds = isMuted;
        updateUserSettings({ muteNotificationSounds: isMuted }, true);
      }
    });
  }
  };

  // Render immediately
  renderUI();
}

function renderChangePasswordView() {
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'تغيير كلمة المرور';
  currentSettingsView = 'change-password';

  ui.sidebarSettingsContainer.innerHTML = `
    <div class="classic-settings-container">
      <div class="settings-content">
        <div class="classic-header">كلمة المرور الحالية</div>
        <input type="password" id="current-password-input" class="classic-input text-center" placeholder="••••••••">

        <div class="classic-header">كلمة المرور الجديدة</div>
        <input type="password" id="new-password-input" class="classic-input text-center" placeholder="••••••••">

        <div class="classic-header">تأكيد كلمة المرور </div>
        <input type="password" id="confirm-password-input" class="classic-input text-center" placeholder="••••••••">
      </div>

      <button class="classic-btn classic-btn-green sidebar-action" id="save-password-btn">
        <i class="fas fa-save btn-icon-left"></i>
        <span>تحديث كلمة المرور</span>
      </button>

      <button class="classic-btn classic-btn-white sidebar-action" id="cancel-password-btn">
        <i class="fas fa-arrow-right btn-icon-left"></i>
        <span>رجوع</span>
      </button>
    </div>
  `;

  document.getElementById('cancel-password-btn').onclick = () => {
    renderSettings();
  };

  document.getElementById('save-password-btn').onclick = async () => {
    const currentPasswordInput = document.getElementById('current-password-input');
    const newPasswordInput = document.getElementById('new-password-input');
    const confirmPasswordInput = document.getElementById('confirm-password-input');

    const currentPassword = currentPasswordInput.value.trim();
    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();

    if (!currentPassword) {
      if (window.classicAlert) {
        window.classicAlert('يرجى إدخال كلمة المرور الحالية', 'خطأ');
      } else {
        alert('يرجى إدخال كلمة المرور الحالية');
      }
      return;
    }

    if (!newPassword) {
      if (window.classicAlert) {
        window.classicAlert('يرجى إدخال كلمة المرور الجديدة', 'خطأ');
      } else {
        alert('يرجى إدخال كلمة المرور الجديدة');
      }
      return;
    }

    if (newPassword.length < 4) {
      if (window.classicAlert) {
        window.classicAlert('يجب أن لا تقل كلمة المرور الجديدة عن 4 أحرف', 'خطأ');
      } else {
        alert('يجب أن لا تقل كلمة المرور الجديدة عن 4 أحرف');
      }
      return;
    }

    if (newPassword !== confirmPassword) {
      if (window.classicAlert) {
        window.classicAlert('كلمتا المرور غير متطابقتين', 'خطأ');
      } else {
        alert('كلمتا المرور غير متطابقتين');
      }
      return;
    }

    const saveBtn = document.getElementById('save-password-btn');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin btn-icon-left"></i><span>جاري الحفظ...</span>';

    try {
      const token = getToken();
      const response = await apiFetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 
            'Authorization': `Bearer ${token}`,
            'X-Chat-Token': token 
          } : {})
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        // Token is rotated on password change — persist the new one so the
        // current session stays valid and the leaked old token is discarded.
        if (data.token) {
          try { sessionStorage.setItem('token', data.token); } catch (e) {}
        }
        if (window.classicAlert) {
          window.classicAlert(data.message || 'تم تغيير كلمة المرور بنجاح', 'تنبيه');
        } else {
          alert('تم تغيير كلمة المرور بنجاح');
        }
        renderSettings();
      } else {
        if (window.classicAlert) {
          window.classicAlert(data.message || 'حدث خطأ أثناء تغيير كلمة المرور', 'خطأ');
        } else {
          alert(data.message || 'حدث خطأ أثناء تغيير كلمة المرور');
        }
      }
    } catch (err) {
      console.error('Request error:', err);
      if (window.classicAlert) {
        window.classicAlert('حدث خطأ في الاتصال بالسيرفر', 'خطأ');
      } else {
        alert('حدث خطأ في الاتصال بالسيرفر');
      }
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fas fa-save btn-icon-left"></i><span>تحديث كلمة المرور</span>';
    }
  };
}

async function saveSettings() {
  const settings = {
    topic: document.getElementById('set-topic').value,
    msg: document.getElementById('set-msg').value,
    ucol: document.getElementById('set-ucol').value,
    fontColor: document.getElementById('set-fontcol').value,
    bg: document.getElementById('set-bg').value,
    mcol: document.getElementById('set-status-col') ? document.getElementById('set-status-col').value : state.currentUser.mcol,
    profileCountry: document.getElementById('set-country') ? document.getElementById('set-country').value : state.currentUser.profileCountry
  };
  
  await updateUserSettings(settings);
}

window.openColorPalette = function(element, currentId) {
  const rect = element.getBoundingClientRect();
  const colors = [
    'transparent', 
    // Grays
    '#ffffff', '#f2f2f2', '#e6e6e6', '#cccccc', '#b3b3b3', '#999999', '#808080', '#666666', '#4d4d4d', '#333333', '#1a1a1a', '#000000',
    // Reds
    '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336', '#e53935', '#d32f2f', '#c62828', '#b71c1c',
    // Pinks
    '#fce4ec', '#f8bbd0', '#f48fb1', '#f06292', '#ec407a', '#e91e63', '#d81b60', '#c2185b', '#ad1457', '#880e4f',
    // Purples
    '#f3e5f5', '#e1bee7', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa', '#7b1fa2', '#6a1b9a', '#4a148c',
    // Deep Purples
    '#ede7f6', '#d1c4e9', '#b39ddb', '#9575cd', '#7e57c2', '#673ab7', '#5e35b1', '#512da8', '#4527a0', '#311b92',
    // Indigo
    '#e8eaf6', '#c5cae9', '#9fa8da', '#7986cb', '#5c6bc0', '#3f51b5', '#3949ab', '#303f9f', '#283593', '#1a237e',
    // Blue
    '#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3', '#1e88e5', '#1976d2', '#1565c0', '#0d47a1',
    // Light Blue
    '#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#29b6f6', '#03a9f4', '#039be5', '#0288d1', '#0277bd', '#01579b',
    // Cyan
    '#e0f7fa', '#b2ebf2', '#80deea', '#4dd0e1', '#26c6da', '#00bcd4', '#00acc1', '#0097a7', '#00838f', '#006064',
    // Teal
    '#e0f2f1', '#b2dfdb', '#80cbc4', '#4db6ac', '#26a69a', '#009688', '#00897b', '#00796b', '#00695c', '#004d40',
    // Green
    '#e8f5e9', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50', '#43a047', '#388e3c', '#2e7d32', '#1b5e20',
    // Light Green
    '#f1f8e9', '#dcedc8', '#c5e1a5', '#aed581', '#9ccc65', '#8bc34a', '#7cb342', '#689f38', '#558b2f', '#33691e',
    // Lime
    '#f9fbe7', '#f0f4c3', '#e6ee9c', '#dce775', '#d4e157', '#cddc39', '#c0ca33', '#afb42b', '#9e9d24', '#827717',
    // Yellow
    '#fffde7', '#fff9c4', '#fff59d', '#fff176', '#ffee58', '#ffeb3b', '#fdd835', '#fbc02d', '#f9a825', '#f57f17',
    // Amber
    '#fff8e1', '#ffecb3', '#ffe082', '#ffd54f', '#ffca28', '#ffc107', '#ffb300', '#ffa000', '#ff8f00', '#ff6f00',
    // Orange
    '#fff3e0', '#ffe0b2', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#fb8c00', '#f57c00', '#ef6c00', '#e65100',
    // Deep Orange
    '#fbe9e7', '#ffccbc', '#ffab91', '#ff8a65', '#ff7043', '#ff5722', '#f4511e', '#e64a19', '#d84315', '#bf360c',
    // Brown
    '#efebe9', '#d7ccc8', '#bcaaa4', '#a1887f', '#8d6e63', '#795548', '#6d4c41', '#5d4037', '#4e342e', '#3e2723',
    // Blue Gray
    '#eceff1', '#cfd8dc', '#b0bec5', '#90a4ae', '#78909c', '#607d8b', '#546e7a', '#455a64', '#37474f', '#263238'
  ];

  // Remove existing popovers
  const existing = document.querySelector('.color-palette-popover');
  if (existing) existing.remove();

  const popover = document.createElement('div');
  popover.className = 'color-palette-popover';
  
  // Calculate position
  const popoverWidth = 8 * 27 + 12; // 8 columns * (24px + 3px gap) + padding
  let left = rect.left;
  let top = rect.bottom + 5;

  // Ensure it doesn't go off the right edge
  if (left + popoverWidth > window.innerWidth) {
    left = window.innerWidth - popoverWidth - 15;
  }
  // Ensure it doesn't go off the left edge
  if (left < 10) left = 10;

  // Ensure it doesn't go off the bottom edge
  const estimatedHeight = 300; // rough estimate
  if (top + estimatedHeight > window.innerHeight) {
    top = rect.top - estimatedHeight - 5;
    if (top < 10) top = 10;
  }

  popover.style.top = `${top}px`;
  popover.style.left = `${left}px`;

  colors.forEach(color => {
    const div = document.createElement('div');
    div.className = 'palette-color' + (color === 'transparent' ? ' transparent' : '');
    if (color !== 'transparent') div.style.backgroundColor = color;
    div.onclick = () => {
      const input = document.getElementById(currentId);
      input.value = color;
      element.style.backgroundColor = color === 'transparent' ? 'transparent' : color;
      if (color === 'transparent') element.classList.add('transparent');
      else element.classList.remove('transparent');
      popover.remove();
    };
    popover.appendChild(div);
  });

  document.body.appendChild(popover);

  const closeHandler = (e) => {
    if (!popover.contains(e.target) && e.target !== element) {
      popover.remove();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('mousedown', closeHandler), 10);
};

window.applyRoomMessagesNightMode = function() {
  // Deprecated/Removed in favor of global dark mode
};

async function updateUserSettings(data, silent = false) {
  try {
    const token = getToken();
    const res = await apiFetch('/api/users/settings', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        ...(token ? { 
            'Authorization': `Bearer ${token}`,
            'X-Chat-Token': token 
        } : {})
      },
      body: JSON.stringify(data)
    });
    
    // apiFetch handles 401 and !ok, so if it returns, it's successful or a handled 401
    if (res.ok) {
      const result = await res.json();
      const currentUser = state.currentUser || {};
      const returnedUser = result.user || {};
      const oldRoomId = currentUser.roomId ?? 0;

      // Safely merge group to ensure group permissions are not dropped
      let mergedGroup = currentUser.group;
      if (returnedUser.group) {
        mergedGroup = currentUser.group ? { ...currentUser.group, ...returnedUser.group } : returnedUser.group;
      }

      const normalizedUser = {
        ...currentUser,
        ...returnedUser,
        id: returnedUser.id ?? returnedUser.userId ?? currentUser.id ?? currentUser.userId,
        userId: returnedUser.userId ?? returnedUser.id ?? currentUser.userId ?? currentUser.id,
        roomId: returnedUser.roomId ?? oldRoomId,
        roleRank: returnedUser.roleRank ?? (returnedUser.group && returnedUser.group.roleRank !== undefined ? returnedUser.group.roleRank : (currentUser.roleRank ?? (currentUser.group && currentUser.group.roleRank))),
        roleName: returnedUser.roleName ?? currentUser.roleName ?? (currentUser.group && currentUser.group.roleName),
        roleIcon: returnedUser.roleIcon ?? currentUser.roleIcon ?? (currentUser.group && currentUser.group.roleIcon),
        superIcon: returnedUser.superIcon ?? currentUser.superIcon,
        ...(mergedGroup ? { group: mergedGroup } : {})
      };

      if (normalizedUser.group && normalizedUser.group.roleRank !== undefined && (normalizedUser.roleRank === undefined || normalizedUser.roleRank === null)) {
        normalizedUser.roleRank = normalizedUser.group.roleRank;
      }

      // Guard: Preserve top-level role permissions (e.g. canKickUsers, canBanUsers, canMuteUsers, etc.)
      for (const key of Object.keys(currentUser)) {
        if (key.startsWith('can') && normalizedUser[key] === undefined) {
          normalizedUser[key] = currentUser[key];
        }
      }
      
      state.setCurrentUser(normalizedUser);

      // Update the user inside state.currentUsers array so that future messages and online list use the exact new styling instantly
      if (state.currentUsers && Array.isArray(state.currentUsers)) {
        const index = state.currentUsers.findIndex(u => Number(u.id || u.userId) === Number(normalizedUser.id) || u.username === normalizedUser.username);
        if (index !== -1) {
          state.currentUsers[index] = {
            ...state.currentUsers[index],
            ...normalizedUser
          };
          if (typeof updateUsersList === 'function') {
            updateUsersList(state.currentUsers);
          }
        }
      }
      
      // Update visuals everywhere (Wall, Chat, Stories, etc.)
      updateUserVisuals([normalizedUser]);
      
      if (!silent) {
        Swal.fire('نجاح', 'تم حفظ الإعدادات بنجاح', 'success');
        renderSettings();
      } else {
        const avatarUrl = window.getAvatarUrl(normalizedUser);
        document.querySelectorAll('.btn-avatar-right').forEach(img => {
          img.src = avatarUrl;
        });
      }
      
      if (window.voiceManager) {
        window.voiceManager.updateUser(normalizedUser);
      }
      
      if (window.fetchStories) {
        window.fetchStories();
      }
    }
  } catch (error) {
    const errorMsg = error.message;
    
    // If it's a likes limit error, apiFetch already showed a pretty alert
    if (errorMsg && (errorMsg.includes('لايك') || errorMsg.includes('requiredLikes'))) {
        return;
    }

    if (!silent) {
      Swal.fire('عذراً', errorMsg, 'error');
    } else {
      showToast('فشل الحفظ: ' + errorMsg);
    }
  }
}

window.openAdminPanel = () => {
  const token = getToken();
  window.open(`/cp?token=${token}`, '_blank');
};

window.sendPublicAlert = () => {
  Swal.fire({
    title: 'إرسال إعلان عام',
    input: 'textarea',
    inputLabel: 'نص الإعلان',
    inputPlaceholder: 'اكتب نص الإعلان هنا...',
    showCancelButton: true,
    confirmButtonText: 'إرسال',
    cancelButtonText: 'إلغاء',
    inputValidator: (value) => {
      if (!value) {
        return 'يرجى كتابة نص الإعلان!';
      }
    }
  }).then((result) => {
    if (result.isConfirmed) {
      socket.emit('public-alert', { text: result.value });
    }
  });
};

// User Profile Modal Logic
var profileModalEl = document.getElementById('userProfileModal');
var profileModal = profileModalEl ? new bootstrap.Modal(profileModalEl) : null;
const reportUserModal = new bootstrap.Modal(document.getElementById('reportUserModal'), {
  backdrop: 'static',
  keyboard: true
});
profileUser = profileUser || null;
window.getCurrentProfileUser = function () {
  return profileUser;
};
let profileListenersAttached = false;

window.showUserProfile = showUserProfile;

function initProfileModalListeners() {
  if (profileListenersAttached) return;
  
  const btnEditCover = document.getElementById('btn-edit-cover');
  const coverUploadInput = document.getElementById('cover-upload-input');
  
  if (btnEditCover && coverUploadInput) {
    btnEditCover.addEventListener('click', () => {
      coverUploadInput.click();
    });
    
    coverUploadInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const uploadRes = await fetch('/api/upload/cover', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${getToken()}` },
          body: formData
        });
        
        if (uploadRes.ok) {
          const { url } = await uploadRes.json();
          
          // Update user settings
          const updateRes = await fetch('/api/users/settings', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getToken()}`
            },
            body: JSON.stringify({ cover: url })
          });
          
          if (updateRes.ok) {
            const newCoverUrl = url;
            state.currentUser.cover = newCoverUrl;

            if (state && Array.isArray(state.currentUsers)) {
              state.currentUsers.forEach(u => {
                if (u.id === state.currentUser.id || u.userId === state.currentUser.id) {
                  u.cover = newCoverUrl;
                }
              });
            }

            if (typeof presenceUsersMap !== 'undefined' && presenceUsersMap) {
              const userKey = (typeof window.getPresenceKey === 'function') ? window.getPresenceKey(state.currentUser) : `member:${state.currentUser.id}`;
              presenceUsersMap.forEach((u, k) => {
                if (k === userKey || u.id === state.currentUser.id || u.userId === state.currentUser.id) {
                  u.cover = newCoverUrl;
                }
              });
            }

            if (window.profileUser && (window.profileUser.id === state.currentUser.id || window.profileUser.userId === state.currentUser.id)) {
              window.profileUser.cover = newCoverUrl;
              profileUser = window.profileUser;
            }

            if (typeof window.renderProfileCover === 'function') {
              window.renderProfileCover(newCoverUrl, state.currentUser, true);
            }

            Swal.fire('نجاح', 'تم تحديث صورة الغلاف بنجاح', 'success');
          } else {
            const err = await updateRes.json().catch(() => ({ message: 'فشل تحديث صورة الغلاف' }));
            Swal.fire('عذراً', err.message, 'error');
          }
        } else {
          const err = await uploadRes.json().catch(() => ({ message: 'فشل رفع الصورة' }));
          Swal.fire('عذراً', err.message, 'error');
        }
      } catch (err) {
        console.error('Error uploading cover:', err);
        Swal.fire('عذراً', 'حدث خطأ في الاتصال بالسيرفر أثناء رفع الصورة', 'error');
      }
    });
  }
  
  profileListenersAttached = true;
}

function updateProfileButtons(user, likeThreshold) {
  const btnPrivate = document.getElementById('btn-profile-private');
  const btnAlert = document.getElementById('btn-profile-alert');
  const btnLikes = document.getElementById('btn-profile-likes');
  const btnDelPic = document.getElementById('btn-profile-del-pic');
  const btnReveal = document.getElementById('btn-profile-reveal');
  const btnGift = document.getElementById('btn-profile-gift');
  const btnMuteRoom = document.getElementById('btn-profile-mute-room');
  const btnMuteGlobal = document.getElementById('btn-profile-mute-global');
  const btnBanner = document.getElementById('btn-profile-banner');
  const btnKickRoom = document.getElementById('btn-profile-kick-room');
  const btnKick = document.getElementById('btn-profile-kick');
  const btnBanRoom = document.getElementById('btn-profile-ban-room');
  const btnBan = document.getElementById('btn-profile-ban');
  const btnModRoom = document.getElementById('btn-profile-mod-room');
  const btnKickGlobal = document.getElementById('btn-profile-kick-global');
  const btnBanPermanent = document.getElementById('btn-profile-ban-permanent');
  const btnBanTemporary = document.getElementById('btn-profile-ban-temporary');
  const btnReport = document.getElementById('btn-profile-report');
  const btnIgnore = document.getElementById('btn-profile-ignore');
  const btnKiss = document.getElementById('btn-profile-kiss');

  // Default visibility
  const isSelf = state.currentUser && state.currentUser.username === user.username;
    const targetRank = user.roleRank || (user.group && user.group.roleRank) || 0;
  const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
  const canAffect = myRank > targetRank && !isSelf; // Current system logic
  const canAffectTargetByRank = myRank > targetRank; // Standard rank comparison
  
  // New strict check requested: targetRank >= myRank means no admin access at all unless Root (except if self)
  const isTargetHigherRank = !isSelf && targetRank >= myRank;

  const currentUserId = Number(state.currentUser?.id || state.currentUser?.userId);
  const targetUserId = Number(user.id || user.userId);

  const isPrimaryFounder = currentUserId === 1;
  const isFounderGroupTarget =
    targetUserId !== 1 &&
    Number(user.groupId || user.group?.id) === 1;

  const canManageMembershipTarget =
    !isSelf &&
    (
      myRank > targetRank ||
      (isPrimaryFounder && isFounderGroupTarget)
    );

  if (btnPrivate) btnPrivate.classList.toggle('d-none', false);
  if (btnAlert) {
    const effectiveLikeThreshold = (window.featuresSettings && window.featuresSettings.likes_notifications !== undefined)
      ? window.featuresSettings.likes_notifications
      : likeThreshold;
    const canSendNotif = hasPermission('canSendNotifications') && ((state.currentUser.likes || 0) >= effectiveLikeThreshold);
    btnAlert.classList.toggle('d-none', !canSendNotif || isSelf);
  }
  if (btnLikes) btnLikes.classList.toggle('d-none', false);
  
  const btnRep = document.getElementById('btn-profile-rep');
  if (btnRep) btnRep.classList.toggle('d-none', false);

  if (btnDelPic) {
    const hasAnyPicPermission = hasPermission('canDeleteUserProfilePicture') || 
                                 hasPermission('canDeleteUserCoverPicture') || 
                                 hasPermission('canDeleteUserMembershipFrame') || 
                                 hasPermission('canDeleteUserMembershipBg') ||
                                 hasPermission('canEditUsers') ||
                                 hasPermission('canDesignMembership');
    btnDelPic.classList.toggle('d-none', !hasAnyPicPermission || isTargetHigherRank || (!canAffect && !isSelf));
  }
  if (btnReveal) btnReveal.classList.toggle('d-none', !hasPermission('canViewNicknameHistory') || (!canAffect && !isSelf));
  if (btnGift) btnGift.classList.toggle('d-none', !hasPermission('canSendGifts') || user.type === 'guest' || !!user.superIcon || (!canAffect && !isSelf));
  
  if (btnMuteRoom) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canMute = hasPermission('canMuteUsers') || (isModerator && roomPermissions.includes('canMuteUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;
    btnMuteRoom.classList.toggle('d-none', true); // Force hidden for unified UI
    btnMuteRoom.innerHTML = user.isMutedRoom ? '<span>فك الإسكات (غرفة)</span> <i class="fas fa-microphone"></i>' : '<span>إسكات (غرفة)</span> <i class="fas fa-microphone-slash"></i>';
  }
  if (btnMuteGlobal) {
    btnMuteGlobal.classList.toggle('d-none', true); // Force hidden for unified UI
    btnMuteGlobal.innerHTML = (user.isMutedWall || user.isMuted) ? '<span>فك الإسكات</span> <i class="fas fa-microphone"></i>' : '<span>إسكات</span> <i class="fas fa-microphone-slash"></i>';
  }

  const btnMute = document.getElementById('btn-profile-mute');
  if (btnMute) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    
    const canMuteRoomStatus = hasPermission('canMuteUsers') || (isModerator && roomPermissions.includes('canMuteUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;
    const showMuteRoom = canMuteRoomStatus && canAffect && isSameRoom;
    
    const showMuteGlobal = hasPermission('canMuteUsers') && canAffect;

    const shouldShowMute = !isSelf && (showMuteRoom || showMuteGlobal);
    btnMute.classList.toggle('d-none', !shouldShowMute);

    if (shouldShowMute) {
      const isRoomMuted = user.isMutedRoom === true || user.isMutedRoom === 'true';
      const isWallMuted = user.isMutedWall === true || user.isMutedWall === 'true' || user.isMuted === true || user.isMuted === 'true';
      const isUserMuted = isRoomMuted || isWallMuted;

      if (isUserMuted) {
        btnMute.innerHTML = '<span>فك الإسكات</span> <i class="fas fa-microphone"></i>';
        btnMute.style.setProperty('background', '#28a745', 'important');
        btnMute.style.setProperty('color', '#fff', 'important');
      } else {
        btnMute.innerHTML = '<span>إسكات</span> <i class="fas fa-microphone-slash"></i>';
        btnMute.style.setProperty('background', '#17a2b8', 'important');
        btnMute.style.setProperty('color', '#fff', 'important');
      }
    }
  }
  if (btnBanner) btnBanner.classList.toggle('d-none', !hasPermission('canAssignSuperIcon') || user.type === 'guest' || (!canAffect && !isSelf));

  if (btnKickRoom) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canKick = hasPermission('canKickUsers') || (isModerator && roomPermissions.includes('canKickUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;
    btnKickRoom.classList.toggle('d-none', !canKick || (!canAffect && !isSelf && !isModerator) || !isSameRoom);
  }
  if (btnBanRoom) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canBan = hasPermission('canBanUsers') || (isModerator && roomPermissions.includes('canBanUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;
    btnBanRoom.classList.toggle('d-none', !canBan || (!canAffect && !isSelf && !isModerator) || !isSameRoom);
  }
  if (btnBan) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canBan = hasPermission('canBanUsers') || (isModerator && roomPermissions.includes('canBanUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;

    const showBanRoom = canBan && canAffect && isSameRoom;
    const showBanGlobal = hasPermission('canBanUsers') && canAffect;

    const shouldShowBan = !isSelf && (showBanRoom || showBanGlobal);
    btnBan.classList.toggle('d-none', !shouldShowBan);
  }
  if (btnKick) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canKick = hasPermission('canKickUsers') || (isModerator && roomPermissions.includes('canKickUsers'));
    const isSameRoom = user.roomId === state.currentRoomId;

    const showKickRoom = canKick && canAffect && isSameRoom;
    const showKickGlobal = hasPermission('canKickUsers') && canAffect;

    const shouldShowKick = !isSelf && (showKickRoom || showKickGlobal);
    btnKick.classList.toggle('d-none', !shouldShowKick);
  }
  if (btnModRoom) {
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const isRoomOwner = currentRoom && currentRoom.ownerId === state.currentUser.id;
    const isGlobalAdmin = hasPermission('canManageRooms') || (state.currentUser && state.currentUser.isAdmin);
    btnModRoom.classList.toggle('d-none', !(isRoomOwner || isGlobalAdmin) || isSelf);
    
    const isMod = currentRoom && currentRoom.moderators && currentRoom.moderators.some(m => (typeof m === 'number' ? m === (user.userId || user.id) : Number(m.userId) === Number(user.userId || user.id)));
    if (isMod) {
      btnModRoom.innerHTML = '<span>إزالة المراقبة</span> <i class="fas fa-user-times"></i>';
    } else {
      btnModRoom.innerHTML = '<span>مراقب الغرفة</span> <i class="fas fa-user-shield"></i>';
    }
  }
  if (btnKickGlobal) btnKickGlobal.classList.toggle('d-none', !hasPermission('canKickUsers') || !canAffect || isSelf);
  if (btnBanPermanent) btnBanPermanent.classList.toggle('d-none', !hasPermission('canBanUsers') || !canAffect || isSelf);
  if (btnBanTemporary) btnBanTemporary.classList.toggle('d-none', !hasPermission('canBanUsers') || !canAffect || isSelf);
  if (btnReport) btnReport.classList.toggle('d-none', false);
  if (btnKiss) btnKiss.classList.toggle('d-none', isSelf);
  if (btnIgnore) {
    btnIgnore.classList.toggle('d-none', false);
    btnIgnore.innerHTML = (state.ignoredUsers && state.ignoredUsers.has(user.username)) ? '<span>إلغاء التجاهل</span> <i class="fas fa-minus-circle"></i>' : '<span>تجاهل</span> <i class="fas fa-minus-circle"></i>';
  }

  // Admin section
  const adminEditSection = document.getElementById('profile-admin-edit-section');
  const btnProfileAdmin = document.getElementById('btn-profile-admin');

  if (adminEditSection) {
    const canEditLikes = hasPermission('canEditUserLikes');
    const canEditRep = hasPermission('canEditUserRep');
    const canEditWallPointsUser = hasPermission('canEditUserWallPoints');
    const canChangeUserNicknames = hasPermission('canChangeUserNicknames');
    const canManageGroups = hasPermission('canManageMembershipUpgrades');

    const canMove = state.currentUser.group && state.currentUser.group.canMoveMembers;
    const canMoveUser = canMove && canAffectTargetByRank;

    // Strict rank enforcement for ALL admin tools in profile
    const hasAnyAdmin = ((canEditLikes || canEditRep || canEditWallPointsUser || canChangeUserNicknames || canMoveUser) && !isTargetHigherRank) || (canManageGroups && canManageMembershipTarget);

    if (btnProfileAdmin) {
      btnProfileAdmin.classList.toggle('d-none', !hasAnyAdmin);
    }

    adminEditSection.classList.toggle('d-none', !hasAnyAdmin);
    
    // Close admin panel if it shouldn't be visible
    if (!hasAnyAdmin && typeof window.toggleAdminPanel === 'function') {
      window.toggleAdminPanel(false);
    }

    const editNicknameContainer = document.getElementById('admin-edit-nickname-container');
    if (editNicknameContainer) {
      editNicknameContainer.classList.toggle('d-none', !canChangeUserNicknames || isTargetHigherRank);
      const nicknameInput = document.getElementById('profile-admin-nickname-input');
      if (canChangeUserNicknames && nicknameInput && !isTargetHigherRank) nicknameInput.value = user.topic || '';
    }
    
    const editLikesContainer = document.getElementById('admin-edit-likes-container');
    if (editLikesContainer) {
      editLikesContainer.classList.toggle('d-none', !canEditLikes || isTargetHigherRank);
      const likesInput = document.getElementById('profile-admin-likes-input');
      if (canEditLikes && likesInput && !isTargetHigherRank) likesInput.value = user.likes || 0;
    }
    
    const editRepContainer = document.getElementById('admin-edit-rep-container');
    if (editRepContainer) {
      editRepContainer.classList.toggle('d-none', !canEditRep || isTargetHigherRank);
      const repInput = document.getElementById('profile-admin-rep-input');
      if (canEditRep && repInput && !isTargetHigherRank) repInput.value = user.rep || 0;
    }

    const editWallPointsContainer = document.getElementById('admin-edit-wallpoints-container');
    if (editWallPointsContainer) {
      editWallPointsContainer.classList.toggle('d-none', !canEditWallPointsUser || isTargetHigherRank);
      const wallInput = document.getElementById('profile-admin-wallpoints-input');
      if (canEditWallPointsUser && wallInput && !isTargetHigherRank) wallInput.value = user.wallPoints || 0;
    }

    const editGroupContainer = document.getElementById('admin-edit-group-container');
    if (editGroupContainer) {
      editGroupContainer.classList.toggle('d-none', !canManageGroups || !canManageMembershipTarget || isSelf);
    }

    const moveMemberContainer = document.getElementById('move-member-container');
    if (moveMemberContainer) {
      moveMemberContainer.classList.toggle('d-none', !canMoveUser || isTargetHigherRank || isSelf);
    }
  }

  // Edit cover btn
  const btnEditCover = document.getElementById('btn-edit-cover');
  if (btnEditCover) {
    const canEditCover = isSelf && (window.enableCustomCover !== false);
    btnEditCover.classList.toggle('d-none', !canEditCover);
    if (!profileListenersAttached) {
       initProfileModalListeners();
    }
  }

  // Handle battle challenge button visibility
  const btnBattle = document.getElementById('btn-profile-battle');
  if (btnBattle) {
    const isBattleEnabled = window.featuresSettings && window.featuresSettings.battleChallengesEnabled === true;
    const isTargetGuest = user.isGuest || user.type === 'guest';
    const groupPerms = (state.currentUser && state.currentUser.group) || {};
        const hasBattlePermission = groupPerms.canStartBattleChallenge === true || groupPerms.canManagePermissions === true;
    
    const shouldHideBattle = !isBattleEnabled || isTargetGuest || isSelf || !hasBattlePermission;
    btnBattle.classList.toggle('d-none', shouldHideBattle);
  }
}

window.renderProfileCover = function(rawCoverUrl, userObj, forceCacheBust = false) {
  const profileCover = document.getElementById('profile-cover');
  const profileCoverPlaceholder = document.getElementById('profile-cover-placeholder');
  if (!profileCover) return;

  const targetUser = userObj || window.profileUser || state.currentUser;
  let finalCover = rawCoverUrl;

  if (!finalCover && targetUser) {
    const key = (typeof window.getPresenceKey === 'function') ? window.getPresenceKey(targetUser) : null;
    const presUser = (key && typeof presenceUsersMap !== 'undefined' && presenceUsersMap) ? presenceUsersMap.get(key) : null;
    finalCover = (presUser && presUser.cover) ? presUser.cover : targetUser.cover;
  }
  if (!finalCover && state.currentUser && targetUser && (targetUser.id === state.currentUser.id || targetUser.userId === state.currentUser.id)) {
    finalCover = state.currentUser.cover;
  }

  if (!finalCover && window.defaultCoverUrl) {
    finalCover = window.defaultCoverUrl;
  }

  if (!finalCover) {
    profileCover.removeAttribute('src');
    profileCover.classList.add('d-none');
    if (profileCoverPlaceholder) profileCoverPlaceholder.classList.remove('d-none');
    return;
  }

  let displayUrl = finalCover;
  if (forceCacheBust && displayUrl.startsWith('/uploads/')) {
    displayUrl += (displayUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
  }

  window.__profileCoverLoadId = (window.__profileCoverLoadId || 0) + 1;
  const currentLoadId = window.__profileCoverLoadId;
  const targetId = targetUser ? String(targetUser.userId || targetUser.id || '') : '';

  const img = new Image();
  img.onload = () => {
    if (currentLoadId !== window.__profileCoverLoadId) return;
    if (window.profileUser && targetId && String(window.profileUser.userId || window.profileUser.id || '') !== targetId) return;
    
    profileCover.src = displayUrl;
    profileCover.classList.remove('d-none');
    if (profileCoverPlaceholder) profileCoverPlaceholder.classList.add('d-none');
  };
  img.onerror = () => {
    if (currentLoadId !== window.__profileCoverLoadId) return;
    if (window.profileUser && targetId && String(window.profileUser.userId || window.profileUser.id || '') !== targetId) return;
    
    profileCover.removeAttribute('src');
    profileCover.classList.add('d-none');
    if (profileCoverPlaceholder) profileCoverPlaceholder.classList.remove('d-none');
  };
  img.src = displayUrl;
};

async function showUserProfile(username) {
  if (!state.currentUser) {
    console.warn('Cannot open profile: User not logged in.');
    return;
  }
  let user = state.currentUsers.find(u => u.username === username);
  if (!user) return;

  const presKey = (typeof window.getPresenceKey === 'function') ? window.getPresenceKey(user) : null;
  const presUser = (presKey && typeof presenceUsersMap !== 'undefined' && presenceUsersMap) ? presenceUsersMap.get(presKey) : null;
  if (presUser) {
    user = { ...user, ...presUser };
    if (!user.cover && presUser.cover) user.cover = presUser.cover;
  }
  if (state.currentUser && (user.id === state.currentUser.id || user.userId === state.currentUser.id) && state.currentUser.cover && !user.cover) {
    user.cover = state.currentUser.cover;
  }

  const isTargetHidden = user.isHidden === true || user.isHidden === 'true';
  const targetRank = (user.group && user.group.roleRank) || user.roleRank || 0;
  const myRank = (state.currentUser && (state.currentUser.group && state.currentUser.group.roleRank !== undefined ? state.currentUser.group.roleRank : state.currentUser.roleRank)) || 0;

  if (isTargetHidden && myRank < targetRank) {
    showToast('لا يمكن عرض الملف الشخصي للأعضاء المتخفين ذوي الرتب الأعلى من رتبتك', 'warning');
    return;
  }
  
  if (typeof window.toggleAdminPanel === 'function') {
    window.toggleAdminPanel(false);
  }
  
  profileUser = user;
  window.profileUser = user;
  
  if (user.id && String(user.id) !== String(state.currentUser.id) && !state.currentUser.isGuest) {
    fetch('/api/profile-visits/' + user.id, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      }
    }).catch(() => {});
  }
  
  // Clear and hide badges container immediately to prevent flashing
  const initialBadgesContainer = document.getElementById('profile-badges-container');
  if (initialBadgesContainer) {
    initialBadgesContainer.style.display = 'none';
    initialBadgesContainer.innerHTML = '';
  }
  
  // Populate UI immediately with local data
  const headerAvatar = document.getElementById('profile-avatar-header');
  if (headerAvatar) {
    headerAvatar.src = window.getAvatarUrl(user);
  }
  if (typeof window.updateProfileHeaderPresenceStatus === 'function') {
    window.updateProfileHeaderPresenceStatus(user);
  }
  
  const headerBg = document.getElementById('profile-header-bg');
  if (headerBg) headerBg.style.backgroundImage = 'none';
  
  let headerContainer = document.getElementById('profile-header-topic-container');
  const verifiedBadge = document.getElementById('profile-verified-badge');
  const headerBanner = document.getElementById('profile-header-banner');
  if (headerBanner) headerBanner.remove(); // Remove the separate banner, we will use the unified one

  if (!headerContainer) {
     const topicEl = document.getElementById('profile-header-topic');
     if (topicEl) {
         headerContainer = document.createElement('div');
         headerContainer.id = 'profile-header-topic-container';
         headerContainer.className = 'profile-header-topic-container align-items-center d-flex ms-2';
         topicEl.parentNode.replaceChild(headerContainer, topicEl);
     }
  }

  if (headerContainer) {
    headerContainer.innerHTML = window.renderUserIdentity(user, {
      nameClasses: 'profile-header-topic',
      nameStyle: `color: ${user.ucol || '#000000'}; font-weight: bold;`,
      tag: 'span'
    });
  }

  // Set the clean mid-section username as well
  const midUsernameEl = document.getElementById('profile-mid-username');
  if (midUsernameEl) {
    midUsernameEl.innerHTML = window.renderUserIdentity(user, {
      nameClasses: 'profile-mid-username-text text-truncate d-inline-block',
      nameStyle: `color: ${user.ucol || '#000000'}; font-weight: bold; font-size: 16px;`,
      tag: 'span'
    });
  }
  if (verifiedBadge) verifiedBadge.classList.toggle('d-none', !user.isVerified);

  const mainVerifiedBadge = document.getElementById('profile-main-verified-badge');
  if (mainVerifiedBadge) mainVerifiedBadge.classList.toggle('d-none', !user.isVerified);

  const headerFlag = document.getElementById('profile-header-flag');
  const headerId = document.getElementById('profile-header-id');
  if (headerFlag) headerFlag.classList.add('d-none');
  if (headerId) headerId.classList.add('d-none');

  const profileAvatarWrapper = document.getElementById('profile-avatar-wrapper');
  const hasMembershipFrame = Boolean(user.membershipFrame);
  const hasMembershipDesign = Boolean(
    user.membershipFrame ||
    user.membershipBg
  );
  
  if (profileAvatarWrapper) {
    profileAvatarWrapper.classList.toggle('profile-avatar-frame', !hasMembershipDesign);
    profileAvatarWrapper.classList.toggle('profile-avatar-membership', hasMembershipDesign);
    profileAvatarWrapper.classList.toggle('has-membership-frame', hasMembershipFrame);
    
    // Clear/Reset inline styles that might interfere
    if (hasMembershipDesign) {
        profileAvatarWrapper.style.borderRadius = '50%';
        profileAvatarWrapper.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.25)';
    } else {
        profileAvatarWrapper.style.borderRadius = '10px';
        profileAvatarWrapper.style.boxShadow = '0 4px 12px rgba(0,0,0,0.25)';
    }
  }

  const profileMsgEl = document.getElementById('profile-msg');
  const profileAvatarFrameEl = document.getElementById('profile-avatar-wrapper');
  const profileHeaderClassicBar = document.getElementById('profile-header-classic-bar');
  if (profileMsgEl) {
    profileMsgEl.innerText = user.msg || (user.type === 'guest' ? 'زائر' : 'عضو');
    if (user.statusBgColor && user.statusBgColor !== 'transparent') {
      const bgColor = user.statusBgColor;
      profileMsgEl.style.setProperty('--status-bg', bgColor);
      if (profileAvatarFrameEl) profileAvatarFrameEl.style.setProperty('--status-bg', bgColor);
      if (profileHeaderClassicBar) profileHeaderClassicBar.style.setProperty('--status-bg', bgColor);
    } else {
      profileMsgEl.style.removeProperty('--status-bg');
      if (profileAvatarFrameEl) profileAvatarFrameEl.style.removeProperty('--status-bg');
      if (profileHeaderClassicBar) profileHeaderClassicBar.style.removeProperty('--status-bg');
    }
  }
  const profileAvatarModal = document.getElementById('profile-avatar-modal');
  if (profileAvatarModal) {
    profileAvatarModal.src = window.getAvatarUrl(user);
    if (hasMembershipFrame) {
      profileAvatarModal.style.width = '78%';
      profileAvatarModal.style.height = '78%';
      profileAvatarModal.style.borderRadius = '50%';
      profileAvatarModal.style.border = 'none';
    } else {
      profileAvatarModal.style.width = '100%';
      profileAvatarModal.style.height = '100%';
      profileAvatarModal.style.borderRadius = '0';
      profileAvatarModal.style.border = '3.5px solid white';
    }
  }
  const headerAvatarElement = document.getElementById('profile-avatar-header');
  const mainFrame = document.getElementById('profile-main-frame');
  if (headerAvatarElement) {
    headerAvatarElement.src = window.getAvatarUrl(user);
    if (typeof window.updateProfileHeaderPresenceStatus === 'function') {
      window.updateProfileHeaderPresenceStatus(user);
    }
  }
  if (mainFrame) {
    if (hasMembershipFrame) {
      mainFrame.src = user.membershipFrame;
      mainFrame.classList.remove('d-none');
    } else {
      mainFrame.classList.add('d-none');
    }
  }
  
  if (typeof window.renderProfileCover === 'function') {
    window.renderProfileCover(user.cover, user);
  }
  
  console.log('DEBUG: User object in showUserProfile:', user);
  
  const profileRoomName = document.getElementById('profile-room-name');
  const profileRoomThumbnail = document.getElementById('profile-room-thumbnail');
  const profileRoomContainer = document.getElementById('profile-room-name-container');

  if (profileRoomName) {
    const room = findRoomData(user.roomId);
    profileRoomName.innerText = (room ? room.name : null) || 'خارج الغرف';
    
    if (profileRoomContainer) {
      if (room) {
        profileRoomContainer.style.cursor = 'pointer';
        profileRoomContainer.title = 'انقر للانتقال إلى الغرفة';
        profileRoomContainer.onclick = () => {
          if (user.roomId) {
            window.joinRoom(user.roomId);
            // Optionally close the modal
            if (window.bootstrap && window.bootstrap.Modal) {
              const modalEl = document.getElementById('userProfileModal');
              const modal = window.bootstrap.Modal.getInstance(modalEl);
              if (modal) modal.hide();
            }
          }
        };
      } else {
        profileRoomContainer.style.cursor = 'default';
        profileRoomContainer.title = '';
        profileRoomContainer.onclick = null;
      }
    }

    if (profileRoomThumbnail) {
      if (room) {
        profileRoomThumbnail.src = window.getRoomThumbnailUrl(room);
        profileRoomThumbnail.style.display = 'block';
      } else {
        profileRoomThumbnail.style.display = 'none';
      }
    }
  }
  
  const profileCountryName = document.getElementById('profile-country-name');
  if (profileCountryName) {
    const cVal = user.profileCountry || user.country;
    const countryCode = (cVal && cVal.toLowerCase() !== 'unknown') ? cVal.toLowerCase() : null;
    profileCountryName.innerText = countryCode && window.countryMap[countryCode] ? window.countryMap[countryCode] : (user.countryName || 'غير معروف');
  }
  
  const profileCountryFlag = document.getElementById('profile-country-flag');
  if (profileCountryFlag) {
    const cVal = user.profileCountry || user.country;
    const countryCode = (cVal && cVal.toLowerCase() !== 'unknown') ? cVal.toLowerCase() : null;
    if (countryCode) {
      profileCountryFlag.innerHTML = `<img src="/flags/${countryCode}.png" style="width: 20px; height: 20px; object-fit: cover; border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.2);">`;
      profileCountryFlag.className = '';
    } else {
      profileCountryFlag.innerHTML = `<i class="fas fa-globe text-muted"></i>`;
      profileCountryFlag.className = '';
    }
  }

  // Profile Badges
  const wallPointsForBadges = Number(user.wallPoints || 0);
  const badges = [
    { level: 1, points: 1000, icon: 'fa-medal', title: 'وسام البداية - يحتاج 1000 نقطة' },
    { level: 2, points: 3000, icon: 'fa-award', title: 'وسام التميز - يحتاج 3000 نقطة' },
    { level: 3, points: 5000, icon: 'fa-star', title: 'وسام النشاط - يحتاج 5000 نقطة' },
    { level: 4, points: 10000, icon: 'fa-trophy', title: 'وسام القوة - يحتاج 10000 نقطة' },
    { level: 5, points: 20000, icon: 'fa-crown', title: 'وسام النخبة - يحتاج 20000 نقطة' },
    { level: 6, points: 50000, icon: 'fa-gem', title: 'وسام الأسطورة - يحتاج 50000 نقطة' }
  ];

  window.renderProfileBadges = (targetUser, badgeSettings) => {
    const badgesContainer = document.getElementById('profile-badges-container');
    if (!badgesContainer) return;

    if (!badgeSettings || !badgeSettings.enabled) {
        badgesContainer.style.display = 'none';
        return;
    }
    badgesContainer.style.display = 'flex';
    
    const currentPoints = Number(targetUser.wallPoints || 0);

    const badgesHtml = badges.map(badge => {
        const active = currentPoints >= badge.points;
        const customUrl = badgeSettings.badges ? badgeSettings.badges[badge.level] : null;
        
        if (customUrl) {
           return `
            <div class="profile-badge ${active ? 'active' : 'locked'}" title="${badge.title}">
                <img src="${customUrl}" style="width: 100%; height: 100%; object-fit: contain; ${active ? '' : 'filter: grayscale(100%) opacity(0.5);'}">
            </div>
           `;
        } else {                
            return `
              <div class="profile-badge ${active ? 'active' : 'locked'}" title="${badge.title}">
                <i class="fas ${badge.icon}"></i>
              </div>
            `;
        }
    }).join('');

    badgesContainer.innerHTML = badgesHtml;
  };

  if (window.badgeSettings) {
    window.renderProfileBadges(user, window.badgeSettings);
  } else {
    fetch('/api/settings/badges')
      .then(res => res.json())
      .then(badgeSettings => {
        window.badgeSettings = badgeSettings;
        window.renderProfileBadges(user, badgeSettings);
      })
      .catch(err => console.error('Error fetching badges in showUserProfile:', err));
  }
  
  const likesCount = user.likes || 0;
  const profileLikesCount = document.getElementById('profile-likes-count');
  if (profileLikesCount) profileLikesCount.innerText = formatCompactNumber(likesCount);
  const likesBtnCount = document.getElementById('profile-likes-count-btn');
  if (likesBtnCount) likesBtnCount.innerText = formatCompactNumber(likesCount);

  const repCount = user.rep || 0;
  const profileRepCount = document.getElementById('profile-rep-count');
  if (profileRepCount) profileRepCount.innerText = formatCompactNumber(repCount);
  const repBtnCount = document.getElementById('profile-rep-count-btn');
  if (repBtnCount) repBtnCount.innerText = formatCompactNumber(repCount);

  const profileWallPoints = document.getElementById('profile-wall-points');
  if (profileWallPoints) profileWallPoints.innerText = formatCompactNumber(user.wallPoints || 0);

  // Show Modal Immediately
  profileModal.show();
  
  // Set initial button states based on default like threshold
  const defaultLikeThreshold = 5000;
  updateProfileButtons(user, defaultLikeThreshold);

  // Logic for Move Member UI (Integrated into showUserProfile)
  const moveMemberContainer = document.getElementById('move-member-container');
  const moveMemberRoomSelect = document.getElementById('move-member-room-select');
  const btnProfileMoveMember = document.getElementById('btn-profile-move-member');

  if (moveMemberContainer && moveMemberRoomSelect && btnProfileMoveMember) {
    const myRank = (state.currentUser.group && state.currentUser.group.roleRank) || state.currentUser.roleRank || 0;
    const targetRank = (user.group && user.group.roleRank) || user.roleRank || 0;
    const canMove = state.currentUser.group && state.currentUser.group.canMoveMembers;
    
    if (canMove && (myRank > targetRank)) {
      moveMemberContainer.classList.remove('d-none');
      // Reset password field
      const movePassInput = document.getElementById('move-member-password');
      if (movePassInput) movePassInput.value = '';
      
      // Also ensure the parent admin section is visible
      const adminEditSection = document.getElementById('profile-admin-edit-section');
      if (adminEditSection) adminEditSection.classList.remove('d-none');
      
      // Populate rooms
      moveMemberRoomSelect.innerHTML = '<option value="">اختر الغرفة للنقل</option>';
      state.rooms.forEach(r => {
        if (Number(r.id) !== Number(user.roomId)) {
          const option = document.createElement('option');
          option.value = r.id;
          option.textContent = r.name;
          moveMemberRoomSelect.appendChild(option);
        }
      });

      btnProfileMoveMember.onclick = () => {
        const roomId = moveMemberRoomSelect.value;
        const password = document.getElementById('move-member-password').value;
        if (!roomId) {
          Swal.fire('تنبيه', 'يرجى اختيار غرفة', 'warning');
          return;
        }
        socket.emit('move-user-to-room', { targetUsername: user.username, roomId, password });
        profileModal.hide();
      };
    } else {
      moveMemberContainer.classList.add('d-none');
    }
  }

  // Background Data Fetching
  (async () => {
    // Populate Groups if admin section is visible
    const adminEditSection = document.getElementById('profile-admin-edit-section');
    if (adminEditSection && !adminEditSection.classList.contains('d-none')) {
      const groupSelect = document.getElementById('profile-admin-group-select');
      const editGroupContainer = document.getElementById('admin-edit-group-container');
      const canManageGroups = hasPermission('canManageMembershipUpgrades');
      if (groupSelect && canManageGroups) {
        try {
          const res = await fetch('/api/chat/allowed-promotion-groups', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
          });
          if (res.ok) {
            const allowedGroups = await res.json();
            
            if (allowedGroups && allowedGroups.length > 0) {
              groupSelect.innerHTML = '<option value="">بدون مجموعة</option>';
              allowedGroups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.name;
                if (user.group && user.group.id === group.id) option.selected = true;
                groupSelect.appendChild(option);
              });
              // If user has no group, select the "No group" option
              if (!user.group) groupSelect.value = '';
              
              if (editGroupContainer) {
                editGroupContainer.classList.remove('d-none');
              }
            } else {
              groupSelect.innerHTML = '<option value="">لا توجد مجموعات مسموح الترقية إليها</option>';
              if (editGroupContainer) {
                editGroupContainer.classList.add('d-none');
              }
            }
          } else {
            console.error('Failed to load allowed promotion groups: non-200 response');
            if (editGroupContainer) {
              editGroupContainer.classList.add('d-none');
            }
          }
        } catch (err) {
          console.error('Failed to fetch allowed promotion groups for profile edit:', err);
          if (editGroupContainer) {
            editGroupContainer.classList.add('d-none');
          }
        }
      }
    }
  })();
}
window.showUserProfile = showUserProfile;

window.saveProfileGroup = async () => {
  if (!profileUser) return;
  const userId = profileUser.id || profileUser.userId;
  console.log('saveProfileGroup: userId is', userId, 'profileUser is', profileUser);
  const groupSelect = document.getElementById('profile-admin-group-select');
  if (!groupSelect) return;
  
  // If value is empty or "0", send null to remove the group
  const groupId = (groupSelect.value === '' || groupSelect.value === '0') ? null : groupSelect.value;

  if (!userId) {
    Swal.fire('عذراً', 'معرف المستخدم غير صالح', 'error');
    return;
  }

  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ groupId })
    });

    if (res.ok) {
      showToast('تم تحديث المجموعة بنجاح', 'success');
      // Update local profile view
      profileUser.groupId = (groupId === null || groupId === '' || groupId === '0') ? null : parseInt(groupId, 10);
      // The socket event 'user_updated' will handle updating the UI and notifying the user
    } else {
      let errorMessage = 'فشل تحديث المجموعة';
      try {
        const text = await res.text();
        try {
          const data = JSON.parse(text);
          errorMessage = data.message || errorMessage;
        } catch (e) {
          console.error('Failed to parse error response. Response text:', text);
        }
      } catch (e) {
        console.error('Failed to read error response:', e);
      }
      showToast(errorMessage, 'error');
    }
  } catch (err) {
    console.error('Error updating group:', err);
    showToast('حدث خطأ أثناء تحديث المجموعة', 'error');
  }
};

window.saveProfileNickname = async () => {
  if (!profileUser) return;
  const userId = profileUser.id || profileUser.userId;
  const nickname = document.getElementById('profile-admin-nickname-input').value;

  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ topic: nickname })
    });

    if (response.ok) {
      triggerSuccessAnim('btn-save-profile-nickname');
      // Update modal title if it's the same user
      const profileUsernameEl = document.getElementById('profile-username');
      if (profileUsernameEl) profileUsernameEl.innerText = nickname;
      const profileHeaderTopicEl = document.getElementById('profile-header-topic');
      if (profileHeaderTopicEl) profileHeaderTopicEl.innerText = nickname;
    } else {
      const error = await response.json();
      showToast(error.message || 'فشل تحديث الزخرفه', 'error');
    }
  } catch (err) {
    console.error(err);
    showToast('خطأ في الاتصال بالخادم', 'error');
  }
};

window.saveProfileLikes = async () => {
  if (!profileUser) return;

  const userId = profileUser.id || profileUser.userId;
  const newValue = parseInt(document.getElementById('profile-admin-likes-input').value);

  console.log(`[LikesUpdate] Start: User=${userId}, RequestedValue=${newValue}`);

  try {
    const res = await fetch(`/api/admin/users/${userId}/likes`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ value: newValue })
    });
    
    const text = await res.text().catch(() => '');
    console.log(`[LikesUpdate] Response Received - Status: ${res.status}`);
    console.log(`[LikesUpdate] Raw Body: ${text}`);
    
    let data = null;
    try {
      if (text) data = JSON.parse(text);
    } catch (e) {
      console.warn('[LikesUpdate] JSON Parse Failed');
    }

    if (res.ok) {
      triggerSuccessAnim('btn-save-profile-likes');
      if (typeof showToast === 'function') {
        showToast('تم تحديث اللايكات بنجاح', 'success');
      }
      profileUser.likes = newValue;
      const profileLikesCount = document.getElementById('profile-likes-count');
      if (profileLikesCount) profileLikesCount.innerText = formatCompactNumber(newValue);
      const likesBtnCount = document.getElementById('profile-likes-count-btn');
      if (likesBtnCount) likesBtnCount.innerText = formatCompactNumber(newValue);
      return;
    }

    // If limit exceeded (now using 400 or 403)
    if (data?.code === 'LIKES_LIMIT_EXCEEDED' || (res.status === 400 && data?.code === 'LIKES_LIMIT_EXCEEDED')) {
      Swal.fire({
        icon: 'warning',
        title: 'عذراً، تجاوزت السقف المسموح',
        text: data.message || `السقف المسموح لك هو ${data.maxLikesLimit || ''} لايك فقط.`,
        confirmButtonText: 'حسناً'
      });
      return;
    }

    // Specific generic messages based on status
    let title = 'فشل التعديل';
    let message = data?.message || 'حدث خطأ غير متوقع';

    if (res.status === 403) {
      title = 'صلاحيات غير كافية';
      message = data?.message || 'ليس لديك صلاحية لتعديل اللايكات أو أنك تحاول تجاوز السقف المحدد لرتبتك.';
    } else if (res.status === 404) {
      message = 'المستخدم غير موجود أو الرابط خاطئ';
    }

    Swal.fire({
      icon: 'error',
      title: title,
      text: message,
      confirmButtonText: 'حسناً'
    });
  } catch (err) {
    console.error('[LikesUpdate] Exception:', err);
    Swal.fire({
      icon: 'error',
      title: 'خطأ تقني',
      text: 'فشل الاتصال بالسيرفر: ' + err.message,
      confirmButtonText: 'حسناً'
    });
  }
};

window.saveProfileRep = async () => {
  if (!profileUser) return;
  const userId = profileUser.id || profileUser.userId;
  const newValue = document.getElementById('profile-admin-rep-input').value;
  
  console.log(`[RepUpdate] Attempting to update user ${userId} rep to ${newValue}`);

  try {
    const res = await fetch(`/api/admin/users/${userId}/rep`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ value: parseInt(newValue) })
    });
    
    const text = await res.text().catch(() => '');
    console.log(`[RepUpdate] Status: ${res.status}, Raw Response: ${text}`);

    let data = null;
    try {
      if (text) data = JSON.parse(text);
    } catch (e) {}

    if (res.ok) {
      triggerSuccessAnim('btn-save-profile-rep');
      if (typeof showToast === 'function') {
        showToast('تم تحديث السمعة بنجاح', 'success');
      }
      profileUser.rep = parseInt(newValue);
      // Update UI
      const profileRepCount = document.getElementById('profile-rep-count');
      if (profileRepCount) profileRepCount.innerText = formatCompactNumber(newValue);
      const repBtnCount = document.getElementById('profile-rep-count-btn');
      if (repBtnCount) repBtnCount.innerText = formatCompactNumber(newValue);
      return;
    }

    Swal.fire({
      icon: 'error',
      title: 'فشل التعديل',
      text: data?.message || `خطأ في تعديل الكوينز (كود: ${res.status})`,
      confirmButtonText: 'حسناً'
    });
  } catch (err) {
    console.error('Error updating rep:', err);
    Swal.fire({
      icon: 'error',
      title: 'خطأ في الاتصال',
      text: 'حدث خطأ غير متوقع عند الاتصال بالسيرفر: ' + err.message,
      confirmButtonText: 'حسناً'
    });
  }
};

window.saveProfileWallPoints = async () => {
  if (!profileUser) return;
  const userId = profileUser.id || profileUser.userId;
  const newValue = document.getElementById('profile-admin-wallpoints-input').value;
  
  try {
    const res = await fetch(`/api/admin/users/${userId}/wall-points`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ value: parseInt(newValue) })
    });
    
    const text = await res.text().catch(() => '');
    let data = null;
    try {
      if (text) data = JSON.parse(text);
    } catch (e) {}

    if (res.ok) {
      triggerSuccessAnim('btn-save-profile-wallpoints');
      if (typeof showToast === 'function') {
        showToast('تم تحديث النقاط بنجاح', 'success');
      }
      const confirmedPoints = data?.wallPoints !== undefined ? Number(data.wallPoints) : parseInt(newValue);
      profileUser.wallPoints = confirmedPoints;
      
      const profileWallPointsCount = document.getElementById('profile-wall-points');
      if (profileWallPointsCount) profileWallPointsCount.innerText = window.formatCompactNumber ? window.formatCompactNumber(confirmedPoints) : confirmedPoints;

      if (typeof window.renderProfileBadges === 'function' && window.badgeSettings) {
         window.renderProfileBadges(profileUser, window.badgeSettings);
      }

      return;
    }

    Swal.fire({
      icon: 'error',
      title: 'فشل التعديل',
      text: data?.message || `خطأ في تعديل النقاط (كود: ${res.status})`,
      confirmButtonText: 'حسناً'
    });
  } catch (err) {
    console.error('Error updating wall points:', err);
    Swal.fire({
      icon: 'error',
      title: 'خطأ في الاتصال',
      text: 'حدث خطأ غير متوقع عند الاتصال بالسيرفر: ' + err.message,
      confirmButtonText: 'حسناً'
    });
  }
};

