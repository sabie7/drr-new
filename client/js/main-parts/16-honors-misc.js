/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 16/28 · honors-misc
   lines 6115–6675 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function formatWallHonorPoints(value) {
  const number = Number(value) || 0;

  if (number < 10000) {
    return String(number);
  }

  const format = (amount, suffix) => {
    return Number(amount.toFixed(1)).toString() + suffix;
  };

  if (number >= 1000000000) {
    return format(number / 1000000000, 'B');
  }

  if (number >= 1000000) {
    return format(number / 1000000, 'M');
  }

  return format(number / 1000, 'K');
}

window.renderWallCreators = async function() {
  currentSettingsView = 'wallCreators';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'لوحة الشرف';

  ui.sidebarSettingsContainer.innerHTML = `
    <div class="classic-settings-container p-3">
      <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
        <i class="fas fa-chevron-right btn-icon-left"></i>
        <span>العودة للإضافات</span>
      </button>
      <div class="text-center py-4">
        <i class="fas fa-spinner fa-spin fa-2x text-muted"></i>
        <div class="mt-2 text-muted">جاري تحميل لوحة الشرف...</div>
      </div>
    </div>
  `;

  try {
    const token = getToken();
    const res = await apiFetch('/api/wall/creators', {
      headers: {
        ...(token ? { 
          'Authorization': `Bearer ${token}`,
          'X-Chat-Token': token 
        } : {})
      }
    });
    const data = await res.json();
    
    let html = '';
    if (data.success && data.creators && data.creators.length > 0) {
      const top3 = data.creators.slice(0, 3);
      const others = data.creators.slice(3);

      let podiumOrder = [];
      if (top3[1]) podiumOrder.push({ user: top3[1], rank: 2, iconClass: 'medal text-secondary', iconStyle: 'color: #c0c0c0;' });
      if (top3[0]) podiumOrder.push({ user: top3[0], rank: 1, iconClass: 'crown text-warning', iconStyle: '' });
      if (top3[2]) podiumOrder.push({ user: top3[2], rank: 3, iconClass: 'medal', iconStyle: 'color: #cd7f32;' });

      if (podiumOrder.length > 0) {
        html += '<div class="wall-creators-podium pb-3 mb-3 border-bottom">';
        podiumOrder.forEach(item => {
          const { user, rank, iconClass, iconStyle } = item;
          html += `
            <div class="podium-item rank-${rank}" onclick="window.showUserProfile(${user.id})">
              <div class="podium-avatar-wrapper">
                ${rank === 1 ? '<i class="fas fa-crown podium-crown text-warning"></i>' : ''}
                <div class="podium-avatar">
                  <img src="${window.getAvatarUrl(user)}" style="border-color: ${user.ucol || '#ccc'};">
                </div>
                <div class="podium-rank-badge rank-badge-${rank}">${rank}</div>
              </div>
              <div class="podium-details">
                <div class="podium-name text-truncate w-100 px-1">
                  ${window.renderUserIdentity(user, { containerClasses: 'wall-honor-identity user-addon-container font-weight-bold flex-nowrap justify-content-center', nameStyle: `color: ${user.fontColor || user.ucol || '#000'}; font-size: 13px;` })}
                </div>
                <div class="podium-points small font-weight-bold text-muted">${formatWallHonorPoints(user.wallPoints)}</div>
              </div>
            </div>
          `;
        });
        html += '</div>';
      }

      if (others.length > 0) {
        html += '<div class="wall-creators-list px-2">';
        others.forEach((user, index) => {
          const rank = index + 4;
          html += `
            <div class="creator-list-item d-flex align-items-center mb-2 px-3 py-2 bg-light shadow-sm" style="cursor:pointer;" onclick="window.showUserProfile(${user.id})">
              <div class="creator-rank font-weight-bold me-3 fs-5 text-secondary" style="width: 25px; text-align: center;">${rank}</div>
              <div class="creator-avatar me-3">
                <img src="${window.getAvatarUrl(user)}" style="border: 2px solid ${user.ucol || '#ccc'};">
              </div>
              <div class="creator-name flex-grow-1 text-truncate pe-2">
                ${window.renderUserIdentity(user, { containerClasses: 'wall-honor-identity user-addon-container font-weight-bold flex-nowrap', nameStyle: `color: ${user.fontColor || user.ucol || '#000'}; font-size: 14px;` })}
              </div>
              <div class="creator-points font-weight-bold text-muted ms-2 px-2 py-1 bg-white rounded">${formatWallHonorPoints(user.wallPoints)}</div>
            </div>
          `;
        });
        html += '</div>';
      }
    } else {
      html = `
        <div class="text-center py-5 text-muted bg-light rounded border">
          <i class="fas fa-box-open fa-3x mb-3 text-secondary"></i>
          <div class="font-weight-bold" style="font-size: 15px;">لا يوجد أعضاء في لوحة الشرف حتى الآن</div>
          <small>كن أول من يشارك منشورات يومية رائعة وتصدر القائمة!</small>
        </div>
      `;
    }

    ui.sidebarSettingsContainer.innerHTML = `
      <div class="classic-settings-container p-3">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div class="m-0 text-dark font-weight-bold" style="font-size: 16px;"><i class="fas fa-award text-warning me-2"></i>لوحة الشرف</div>
        </div>
        <div id="wall-creators-list">
          ${html}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Failed to load wall creators:', err);
    ui.sidebarSettingsContainer.innerHTML = `
      <div class="classic-settings-container p-3">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
        <div class="text-center text-danger py-4">
          <i class="fas fa-exclamation-circle mb-2"></i><br>حدث خطأ أثناء جلب البيانات.
        </div>
      </div>
    `;
  }
};

let membershipAssetsCache = null;

window.renderMembershipDesign = async function(skipLoading = false) {
  currentSettingsView = 'membership';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'تصميم العضوية';
  
  const renderUI = (assets) => {
    const backgrounds = assets ? assets.filter(a => a.type === 'background') : [];
    const frames = assets ? assets.filter(a => a.type === 'frame') : [];

    let html = `
      <div class="membership-pro-container p-3">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
        <!-- Background Section -->
        <div class="design-section mb-4">
          <div class="section-header d-flex justify-content-between align-items-center mb-3">
            <div class="d-flex align-items-center">
              <div class="icon-box me-2"><i class="fas fa-image"></i></div>
              <h6 class="mb-0 fw-bold">خلفية العضوية</h6>
            </div>
            <button class="upload-btn-pro" onclick="document.getElementById('membership-bg-upload').click()">
              <i class="fas fa-cloud-upload-alt"></i> رفع خاص
            </button>
          </div>
          <div class="assets-grid">
            <div class="asset-card ${!state.currentUser.membershipBg ? 'active' : ''}" onclick="updateMembershipDesign('membershipBg', null)">
              <div class="none-box"><i class="fas fa-ban"></i><span>بدون</span></div>
            </div>
            ${backgrounds.map(bg => `
              <div class="asset-card ${state.currentUser.membershipBg === bg.url ? 'active' : ''}" onclick="updateMembershipDesign('membershipBg', '${bg.url}')">
                <div class="img-box" style="background-image: url('${bg.url}')"></div>
              </div>
            `).join('')}
            ${state.currentUser.membershipBg && !backgrounds.find(b => b.url === state.currentUser.membershipBg) ? `
              <div class="asset-card active">
                <div class="img-box" style="background-image: url('${state.currentUser.membershipBg}')"></div>
                <div class="custom-badge">خاص</div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Frame Section -->
        <div class="design-section mb-4">
          <div class="section-header d-flex justify-content-between align-items-center mb-3">
            <div class="d-flex align-items-center">
              <div class="icon-box me-2"><i class="fas fa-border-style"></i></div>
              <h6 class="mb-0 fw-bold">برواز الصورة</h6>
            </div>
            <button class="upload-btn-pro" onclick="document.getElementById('membership-frame-upload').click()">
              <i class="fas fa-cloud-upload-alt"></i> رفع خاص
            </button>
          </div>
          <div class="assets-grid frames-grid">
            <div class="asset-card frame-card ${!state.currentUser.membershipFrame ? 'active' : ''}" onclick="updateMembershipDesign('membershipFrame', null)">
              <div class="none-box circular"><i class="fas fa-ban"></i></div>
            </div>
            ${frames.map(frame => `
              <div class="asset-card frame-card ${state.currentUser.membershipFrame === frame.url ? 'active' : ''}" onclick="updateMembershipDesign('membershipFrame', '${frame.url}')">
                <div class="frame-preview-box">
                  <img src="${window.getAvatarUrl(state.currentUser)}" class="preview-avatar">
                  <img src="${frame.url}" class="preview-frame">
                </div>
              </div>
            `).join('')}
            ${state.currentUser.membershipFrame && !frames.find(f => f.url === state.currentUser.membershipFrame) ? `
              <div class="asset-card frame-card active">
                <div class="frame-preview-box">
                  <img src="${window.getAvatarUrl(state.currentUser)}" class="preview-avatar">
                  <img src="${state.currentUser.membershipFrame}" class="preview-frame">
                </div>
                <div class="custom-badge">خاص</div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Display Options Section -->
        <div class="design-section mb-4">
          <div class="section-header d-flex align-items-center mb-3">
            <div class="icon-box me-2"><i class="fas fa-cog"></i></div>
            <h6 class="mb-0 fw-bold">خيارات العرض</h6>
          </div>
          <div class="display-options">
            <div class="option-item d-flex justify-content-between align-items-center mb-3">
              <div class="option-info">
                <div class="fw-bold small">إظهار علم الدولة</div>
                <div class="text-muted" style="font-size: 10px;">عرض علم دولتك بجانب اسمك</div>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="toggle-show-flag" ${state.currentUser.showMembershipFlag !== false ? 'checked' : ''} onchange="updateMembershipDesign('showMembershipFlag', this.checked)">
              </div>
            </div>
            <div class="option-item d-flex justify-content-between align-items-center mb-3">
              <div class="option-info">
                <div class="fw-bold small">إظهار رقم العضوية</div>
                <div class="text-muted" style="font-size: 10px;">عرض الرقم التعريفي الخاص بك</div>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="toggle-show-id" ${state.currentUser.showMembershipId !== false ? 'checked' : ''} onchange="updateMembershipDesign('showMembershipId', this.checked)">
              </div>
            </div>
            <div class="option-item d-flex justify-content-between align-items-center mb-3">
              <div class="option-info">
                <div class="fw-bold small">إظهار الصورة الشخصية</div>
                <div class="text-muted" style="font-size: 10px;">عرض صورتك الشخصية والبرواز</div>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="toggle-show-avatar" ${state.currentUser.showMembershipAvatar !== false ? 'checked' : ''} onchange="updateMembershipDesign('showMembershipAvatar', this.checked)">
              </div>
            </div>
            <div class="option-item d-flex justify-content-between align-items-center mb-3">
              <div class="option-info">
                <div class="fw-bold small">إظهار الاسم</div>
                <div class="text-muted" style="font-size: 10px;">عرض اسمك المستعار</div>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="toggle-show-name" ${state.currentUser.showMembershipName !== false ? 'checked' : ''} onchange="updateMembershipDesign('showMembershipName', this.checked)">
              </div>
            </div>
            <div class="option-item d-flex justify-content-between align-items-center mb-3">
              <div class="option-info">
                <div class="fw-bold small">إظهار الحالة</div>
                <div class="text-muted" style="font-size: 10px;">عرض حالتك أسفل الاسم</div>
              </div>
              <div class="form-check form-switch">
                <input class="form-check-input" type="checkbox" id="toggle-show-status" ${state.currentUser.showMembershipStatus !== false ? 'checked' : ''} onchange="updateMembershipDesign('showMembershipStatus', this.checked)">
              </div>
            </div>
            <div class="option-item d-flex justify-content-between align-items-center">
              <div class="option-info">
                <div class="fw-bold small">لون تصميم البروفايل</div>
                <div class="text-muted" style="font-size: 10px;">اختر لون خلفية إضافي للبروفايل</div>
              </div>
              <div class="d-flex flex-column align-items-center">
                <input type="color" id="membership-status-bg"
                  value="${(state.currentUser.statusBgColor && state.currentUser.statusBgColor !== 'transparent') ? state.currentUser.statusBgColor : '#ffffff'}"
                  onchange="updateMembershipDesign('statusBgColor', this.value)"
                  class="form-control form-control-color border-0 p-0 shadow-none bg-transparent"
                  style="width: 30px; height: 30px; cursor: pointer;" title="اختر اللون">
                ${state.currentUser.statusBgColor && state.currentUser.statusBgColor !== 'transparent' ? `
                <button class="btn btn-sm text-danger mt-1 p-0 fw-bold" style="font-size: 10px; background: none; border: none; outline: none; box-shadow: none;" onclick="updateMembershipDesign('statusBgColor', 'transparent')">بدون لون</button>
                ` : `<span style="font-size:10px;text-align:center" class="text-muted mt-1">بدون لون</span>`}
              </div>
            </div>
          </div>
        </div>

      </div>

      <style>
        .membership-pro-container { direction: rtl; font-family: var(--font-family); }
        .design-section { background: #fff; border-radius: 12px; padding: 15px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
        .icon-box { width: 30px; height: 30px; background: #f0f2f5; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #0d6efd; }
        .upload-btn-pro { background: #e7f3ff; color: #0d6efd; border: none; padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; transition: 0.3s; }
        .upload-btn-pro:hover { background: #0d6efd; color: #fff; }
        .assets-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); gap: 10px; }
        .asset-card { position: relative; border-radius: 10px; border: 2px solid #f0f2f5; cursor: pointer; transition: 0.3s; overflow: hidden; aspect-ratio: 3/2; }
        .asset-card:hover { border-color: #0d6efd; transform: translateY(-2px); }
        .asset-card.active { border-color: #0d6efd; background: #f0f7ff; }
        .asset-card.active::after { content: '\\f058'; font-family: 'Font Awesome 5 Free'; font-weight: 900; position: absolute; top: 2px; right: 2px; color: #0d6efd; font-size: 14px; background: #fff; border-radius: 50%; }
        .none-box { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: #adb5bd; font-size: 12px; }
        .none-box i { font-size: 18px; margin-bottom: 2px; }
        .img-box { height: 100%; background-size: cover; background-position: center; }
        .frame-card { aspect-ratio: 1/1; }
        .frame-preview-box { position: relative; width: 100%; height: 100%; padding: 5px; }
        .preview-avatar { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }
        .preview-frame { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
        .custom-badge { position: absolute; bottom: 0; left: 0; right: 0; background: rgba(13, 110, 253, 0.8); color: #fff; font-size: 9px; text-align: center; padding: 2px 0; }
        .display-options { padding: 5px 0; }
        .option-item { border-bottom: 1px solid #f0f2f5; padding-bottom: 10px; }
        .option-item:last-child { border-bottom: none; padding-bottom: 0; }
        .form-check-input { cursor: pointer; width: 35px; height: 18px; }
        .form-check-input:checked { background-color: #0d6efd; border-color: #0d6efd; }
        .back-btn-pro { background: #343a40; color: #fff; border: none; padding: 10px; border-radius: 10px; font-weight: bold; transition: 0.3s; display: flex; align-items: center; justify-content: center; }
        .back-btn-pro:hover { background: #000; }
      </style>
    `;
    
    if (ui.sidebarSettingsContainer) ui.sidebarSettingsContainer.innerHTML = html;
  };

  // Render immediately with cached or empty values
  renderUI(membershipAssetsCache || []);

  try {
    const res = await fetch('/api/membership-assets', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const assets = await res.json();
    
    // Update cache and re-render if different
    if (JSON.stringify(membershipAssetsCache) !== JSON.stringify(assets) && currentSettingsView === 'membership') {
      membershipAssetsCache = assets;
      renderUI(membershipAssetsCache);
    }
  } catch (err) {
    console.error(err);
    if (!membershipAssetsCache) {
      ui.sidebarSettingsContainer.innerHTML = '<div class="p-4 text-danger text-center"><i class="fas fa-exclamation-triangle fa-2x mb-2"></i><div>فشل تحميل الاستوديو</div></div>';
    }
  }
};

window.uploadMembershipAsset = async function(type, file) {
  const formData = new FormData();
  formData.append('file', file);
  
  const endpoint = type === 'background' ? '/api/upload/membership-bg' : '/api/upload/membership-frame';
  const field = type === 'background' ? 'membershipBg' : 'membershipFrame';
  const typeName = type === 'background' ? 'خلفية' : 'برواز';
  
  try {
    Swal.fire({
      title: `جاري رفع ال${typeName}...`,
      html: 'يرجى الانتظار قليلاً، يتم معالجة الصورة بأعلى جودة',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData
    });
    
    if (res.ok) {
      const result = await res.json();
      await updateMembershipDesign(field, result.url);
      
      Swal.fire({
        icon: 'success',
        title: 'تم الرفع بنجاح',
        text: `تم تطبيق ال${typeName} الجديدة على ملفك الشخصي`,
        timer: 2000,
        showConfirmButton: false
      });
    } else {
      const err = await res.json();
      Swal.fire({
        icon: 'error',
        title: 'فشل الرفع',
        text: err.message || 'حدث خطأ غير متوقع أثناء الرفع'
      });
    }
  } catch (err) {
    console.error(err);
    Swal.fire({
      icon: 'error',
      title: 'خطأ في الاتصال',
      text: 'تعذر الوصول إلى السيرفر، يرجى التحقق من اتصالك'
    });
  }
};

window.updateMembershipDesign = async function(field, value) {
  const data = {};
  data[field] = value;
  // Use silent update to avoid Swal and full renderSettings()
  await updateUserSettings(data, true);
  // Re-render design tab without flickering
  renderMembershipDesign(true);
};

let notificationsCache = null;
window.sessionNotifications = window.sessionNotifications || [];

window.renderNotifications = async function(skipLoading = false) {
  currentSettingsView = 'notifications';
  if (ui.sidebarTitle) ui.sidebarTitle.innerText = 'الإشعارات';
  
  const renderUI = (notifications) => {
    let html = `
      <div class="classic-settings-container">
        <button class="classic-btn classic-btn-dark sidebar-action mb-3" onclick="window.renderAddons()">
          <i class="fas fa-chevron-right btn-icon-left"></i>
          <span>العودة للإضافات</span>
        </button>
    `;
    
    if (window.pendingZajelModeration && window.pendingZajelModeration.size > 0) {
      html += `
        <div class="zajel-moderation-section mb-3">
          <div class="d-flex align-items-center justify-content-between mb-2 pb-1 border-bottom border-secondary">
            <div class="fw-bold text-dark" style="font-size: 13px;">
              <i class="fas fa-feather-alt me-1 text-primary"></i> طلبات مراجعة زاجل
            </div>
            <span class="badge bg-danger rounded-pill">${window.pendingZajelModeration.size}</span>
          </div>
          <div class="zajel-moderation-list">
      `;
      window.pendingZajelModeration.forEach((req) => {
        const date = new Date(req.createdAt || Date.now());
        const timeStr = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
        html += `
          <div class="card mb-2 p-2 shadow-sm border" id="zajel-req-card-${req.id}" style="background: #fff8e1; border-color: #ffe082 !important;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-bold text-dark" style="font-size: 13px;">${escapeHTML(req.username)}</span>
              <small class="text-muted" style="font-size: 11px;">${timeStr}</small>
            </div>
            <div class="text-dark mb-2" style="font-size: 12px; word-break: break-word; text-align: right; direction: rtl;">${escapeHTML(req.message)}</div>
            <div class="d-flex gap-2">
              <button class="btn btn-sm btn-success flex-grow-1 py-1" style="font-size: 12px;" onclick="window.moderateZajelRequest(${req.id}, 'approve')">
                <i class="fas fa-check me-1"></i> قبول
              </button>
              <button class="btn btn-sm btn-danger flex-grow-1 py-1" style="font-size: 12px;" onclick="window.moderateZajelRequest(${req.id}, 'reject')">
                <i class="fas fa-times me-1"></i> رفض
              </button>
            </div>
          </div>
        `;
      });
      html += `
          </div>
        </div>
      `;
    }
    
    if ((!notifications || notifications.length === 0) && (!window.pendingZajelModeration || window.pendingZajelModeration.size === 0)) {
      html += '<div class="p-3 text-center text-muted">لا توجد إشعارات حالية في هذه الجلسة</div>';
    } else if (notifications && notifications.length > 0) {
      notifications.forEach(n => {
        const date = new Date(n.createdAt);
        const timeStr = String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
        const sender = n.sender || {};
        const senderAvatar = escapeHTML(sender.pic || '/uploads/site/default.png');
        const hasBanner = !!sender.membershipBg && n.type !== 'manual_alert';
        const itemBg = hasBanner ? `url('${escapeHTML(sender.membershipBg)}')` : '#fff';
        const decorationBg = escapeHTML(sender.bg || 'transparent');
        const ucol = escapeHTML(sender.ucol || (hasBanner ? '#fff' : '#333'));
        const safeUsername = escapeHTML(sender.username || 'نظام');
        
        const rawMessage = n.message || n.text || '';
        const processedMessage = window.replacePlaceholders ? window.replacePlaceholders(window.replaceShortcuts ? window.replaceShortcuts(escapeHTML(rawMessage)) : escapeHTML(rawMessage)) : escapeHTML(rawMessage);
        
        const hasUsername = sender && sender.username && sender.username !== 'نظام';
        const senderIdentityHtml = window.renderUserIdentity ? window.renderUserIdentity(sender, {
          nameStyle: `color: ${ucol}; font-size: 13px; cursor: ${hasUsername ? 'pointer' : 'default'};`,
          nameClasses: hasUsername ? 'js-user-profile-btn' : '',
          onClick: hasUsername ? `window.showUserProfile('${sender.username}')` : ''
        }) : `<span style="color: ${ucol};">${safeUsername}</span>`;

        let textContentHtml = '';
        if (n.type === 'manual_alert') {
          textContentHtml = `
            <div class="text-muted mb-1" style="font-size: 11px;">أرسل لك تنبيهًا</div>
            <div class="sidebar-notification-text" style="color: #333; word-break: break-word;">${processedMessage}</div>
          `;
        } else {
          textContentHtml = `
            <div class="sidebar-notification-text" style="color: ${hasBanner ? '#fff' : '#333'};">
              ${processedMessage}
            </div>
          `;
        }

        html += `
          <div class="classic-notification-item sidebar-notification-item" style="background-image: ${itemBg};">
            ${hasBanner ? '<div class="sidebar-notification-overlay"></div>' : ''}
            <div class="sidebar-notification-content">
              <img src="${senderAvatar}" class="sidebar-notification-avatar" onerror="this.onerror=null;this.src='/uploads/site/default.png';">
              <div class="flex-grow-1" style="min-width: 0;">
                <div class="sidebar-notification-sender" style="background: ${decorationBg};">
                  ${senderIdentityHtml}
                </div>
                ${textContentHtml}
              </div>
              <span class="sidebar-notification-time" style="color: ${hasBanner ? '#eee' : '#6c757d'};">${timeStr}</span>
            </div>
          </div>
        `;
      });
    }
    
    html += `</div>`;
    
    if (ui.sidebarSettingsContainer) ui.sidebarSettingsContainer.innerHTML = html;
  };

  // Render purely from the session-based RAM list
  renderUI(window.sessionNotifications || []);
};




window.updateLiveBroadcastButtonVisibility = function() {
  const btn = document.getElementById('top-live-broadcast-btn');
  if (!btn) return;

  const liveEnabled = window.featuresSettings?.liveBroadcastEnabled === true;
  const hasLivePermission = typeof hasPermission === 'function' && hasPermission('canStartLiveBroadcast') === true;

  const currentRoom =
    window.currentRoom ||
    window.currentRoomData ||
    (window.roomsData && state.currentRoomId ? window.roomsData[state.currentRoomId] : null);

  const roomAllowsLive = currentRoom ? currentRoom.allowBroadcast === true : false;
  const currentRoomId = state.currentRoomId;

  const shouldShow =
    liveEnabled &&
    hasLivePermission &&
    currentRoomId &&
    Number(currentRoomId) > 0 &&
    roomAllowsLive;

  btn.classList.toggle('d-none', !shouldShow);
};

