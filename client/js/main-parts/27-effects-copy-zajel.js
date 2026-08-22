/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 27/28 · effects-copy-zajel
   lines 12519–15723 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function triggerSuccessAnim(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  
  btn.classList.add('success-anim');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = 'تم <i class="fas fa-check-circle"></i>';
  
  setTimeout(() => {
    btn.classList.remove('success-anim');
    btn.innerHTML = originalHtml;
  }, 1500);
}

// Button Handlers
const btnProfilePrivate = document.getElementById('btn-profile-private');
if (btnProfilePrivate) {
  btnProfilePrivate.onclick = () => {
    const canBypass = hasPermission('canOpenPrivateMessages');
    if (profileUser && profileUser.allowPrivate === false && !canBypass) {
      Swal.fire({
        icon: 'error',
        title: 'عذراً',
        text: 'هذا المستخدم لا يقبل الرسائل الخاصة',
        confirmButtonText: 'حسناً'
      });
      return;
    }
    if (window.PrivateChatManager && profileUser) {
      window.PrivateChatManager.openChat(profileUser);
    }
    profileModal.hide();
  };
}

window.showPrivateNotificationModal = async function(targetUser, fromReply = false) {
  const canBypass = hasPermission('canOpenPrivateMessages');
  if (targetUser && targetUser.allowAlerts === false && !canBypass) {
    Swal.fire({
      icon: 'error',
      title: 'عذراً',
      text: 'هذا المستخدم لا يستقبل التنبيهات',
      confirmButtonText: 'حسناً'
    });
    return;
  }
  if (typeof profileModal !== 'undefined' && profileModal && typeof profileModal.hide === 'function') {
    profileModal.hide();
  }
  const displayName = targetUser.topic || targetUser.username;
  const { value: message } = await Swal.fire({
    title: '',
    html: `
      <div class="private-alert-container">
        <div class="private-alert-header">
          <img src="${window.getAvatarUrl(targetUser)}" class="private-alert-avatar" onerror="this.src='/uploads/site/default.png'">
          <div class="private-alert-name">
            ${window.escapeHTML ? window.escapeHTML(displayName) : displayName}
          </div>
        </div>
        <div style="direction: rtl; text-align: right; width: 100%; box-sizing: border-box;">
          <div class="private-alert-textarea-wrapper">
            <textarea id="private-alert-textarea-input" maxlength="500" placeholder="أدخل رسالة التنبيه هنا..." class="private-alert-textarea"></textarea>
            <div id="private-alert-char-counter" class="private-alert-char-counter">0 / 500</div>
          </div>
          
          <div class="private-alert-toolbar">
            <button type="button" id="private-alert-btn-emoji" class="private-alert-btn-emoji" title="الابتسامات والملصقات">
              <img src="/emoii.gif" alt="emoji">
            </button>
          </div>
          
          <!-- Custom Emoji/Sticker Picker Box -->
          <div id="private-alert-emoji-picker" class="private-alert-picker">
            <div class="private-alert-picker-header">
              <div class="private-alert-picker-tabs">
                <button type="button" class="private-alert-tab-btn active" data-tab="smileys">الابتسامات</button>
                <button type="button" class="private-alert-tab-btn" data-tab="stickers">الملصقات</button>
              </div>
              <button type="button" id="private-alert-picker-close" class="private-alert-picker-close" title="إغلاق">&times;</button>
            </div>
            <div id="private-alert-picker-content" class="private-alert-picker-content"></div>
          </div>
        </div>
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: 'إرسال',
    cancelButtonText: 'إلغاء',
    focusConfirm: false,
    customClass: {
      popup: 'p-0 border-0 rounded-1 overflow-hidden',
      confirmButton: 'btn btn-dark btn-sm px-4 mx-1',
      cancelButton: 'btn btn-secondary btn-sm px-4 mx-1'
    },
    buttonsStyling: false,
    preConfirm: () => {
      const txt = document.getElementById('private-alert-textarea-input');
      return txt ? txt.value : '';
    },
    didOpen: () => {
      // Hide the default classic-alert title box if it exists to avoid overlap
      const titleBox = document.getElementById('classic-alert-title');
      if (titleBox) titleBox.style.display = 'none';
      
      const input = document.getElementById('private-alert-textarea-input');
      if (input) {
        input.focus();
        
        // Counter logic
        const counter = document.getElementById('private-alert-char-counter');
        input.addEventListener('input', () => {
          if (counter) {
            counter.textContent = `${input.value.length} / 500`;
          }
        });
      }

      // Initialize Custom Picker
      const pickerEl = document.getElementById('private-alert-emoji-picker');
      const btnEmoji = document.getElementById('private-alert-btn-emoji');
      const btnClosePicker = document.getElementById('private-alert-picker-close');
      const pickerContent = document.getElementById('private-alert-picker-content');
      
      let currentTab = 'smileys'; // Default tab

      function renderPickerItems() {
        if (!pickerContent) return;
        pickerContent.innerHTML = '';

        const smileysList = (state.smileys || []).filter(item => {
          if (currentTab === 'smileys') return item.type === 'smiley';
          if (currentTab === 'stickers') return item.type === 'sticker';
          return false;
        });

        if (smileysList.length === 0) {
          pickerContent.innerHTML = `<div style="text-align: center; color: #888; font-size: 13px; padding: 20px;">لا توجد عناصر لعرضها</div>`;
          return;
        }

        const gridClass = currentTab === 'smileys' ? 'private-alert-smileys-grid' : 'private-alert-stickers-grid';
        const grid = document.createElement('div');
        grid.className = gridClass;

        smileysList.forEach(item => {
          const itemEl = document.createElement('div');
          itemEl.className = `private-alert-picker-item ${currentTab === 'smileys' ? 'smiley' : 'sticker'}`;
          itemEl.setAttribute('title', item.shortcut);

          const img = document.createElement('img');
          img.src = item.url;
          img.alt = item.shortcut;
          img.loading = 'lazy';
          itemEl.appendChild(img);

          itemEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (input) {
              insertPrivateAlertShortcutAtCaret(input, item.shortcut);
            }
          });

          grid.appendChild(itemEl);
        });

        pickerContent.appendChild(grid);
      }

      function insertPrivateAlertShortcutAtCaret(textarea, shortcut) {
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        const text = textarea.value;
        const before = text.substring(0, startPos);
        const after = text.substring(endPos, text.length);
        
        textarea.value = before + shortcut + after;
        
        // Move selection caret to after inserted shortcut
        const newPos = startPos + shortcut.length;
        textarea.selectionStart = newPos;
        textarea.selectionEnd = newPos;
        
        textarea.focus();
        
        // Dispatch 'input' event to update counter
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }

      if (btnEmoji && pickerEl) {
        btnEmoji.addEventListener('click', (e) => {
          e.stopPropagation();
          const isOpen = pickerEl.classList.contains('is-open');
          if (isOpen) {
            pickerEl.classList.remove('is-open');
          } else {
            pickerEl.classList.add('is-open');
            renderPickerItems();
          }
        });
      }

      if (btnClosePicker && pickerEl) {
        btnClosePicker.addEventListener('click', (e) => {
          e.stopPropagation();
          pickerEl.classList.remove('is-open');
        });
      }

      // Handle Tab Switching
      const tabBtns = document.querySelectorAll('.private-alert-tab-btn');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          tabBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentTab = btn.getAttribute('data-tab');
          renderPickerItems();
        });
      });

      // Prevent closing picker or window on scroll and clicking inside picker
      if (pickerEl) {
        const preventEvt = (e) => {
          e.stopPropagation();
        };
        pickerEl.addEventListener('pointerdown', preventEvt);
        pickerEl.addEventListener('mousedown', preventEvt);
        pickerEl.addEventListener('touchstart', preventEvt);
        pickerEl.addEventListener('click', preventEvt);
        pickerEl.addEventListener('wheel', preventEvt);
      }
    },
    willClose: () => {
      // Restore title box for other alerts
      const titleBox = document.getElementById('classic-alert-title');
      if (titleBox) titleBox.style.display = 'block';
    }
  });


  if (message) {
    socket.emit('send-private-notification', { targetUsername: targetUser.username, text: message }, (response) => {
      if (response && response.ok) {
        if (response.mode === 'offline') {
          Swal.fire({
            title: 'تنبيه',
            text: 'المستخدم غير متصل حاليًا، سيشاهد التنبيه فور دخوله',
            icon: 'info',
            confirmButtonText: 'حسناً'
          });
        } else {
          if (typeof showToast === 'function') {
            showToast('تم إرسال التنبيه بنجاح', 'success');
          }
        }
      } else {
        Swal.fire({
          title: 'فشل الإرسال',
          text: response?.message || 'حدث خطأ أثناء إرسال التنبيه',
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
      }
    });
    if (ui && ui.chatInput) {
      ui.chatInput.focus();
    }
  } else {
    if (!fromReply) {
      showUserProfile(targetUser.username);
    }
  }
};

const btnProfileAlert = document.getElementById('btn-profile-alert');
if (btnProfileAlert) {
  btnProfileAlert.onclick = () => {
    if (profileUser) {
      window.showPrivateNotificationModal(profileUser, false);
    }
  };
}

const btnProfileLikes = document.getElementById('btn-profile-likes');
if (btnProfileLikes) {
  btnProfileLikes.onclick = () => {
    console.log('Liking user:', profileUser.username);
    socket.emit('like-user', { targetUsername: profileUser.username });
  };
}

const btnProfileRep = document.getElementById('btn-profile-rep');
if (btnProfileRep) {
  btnProfileRep.onclick = () => {
    console.log('Repping user:', profileUser.username);
    socket.emit('rep-user', { targetUsername: profileUser.username });
  };
}

const btnProfileDelPic = document.getElementById('btn-profile-del-pic');
if (btnProfileDelPic) {
  btnProfileDelPic.onclick = () => {
    const isSelf = state.currentUser && state.currentUser.username === profileUser.username;
        const targetRank = profileUser.roleRank || (profileUser.group && profileUser.group.roleRank) || 0;
    const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
    const isTargetHigherRank = !isSelf && targetRank >= myRank;

    const canDelPic = (hasPermission('canDeleteUserProfilePicture')) && !isTargetHigherRank;
    const canDelCover = (hasPermission('canDeleteUserCoverPicture')) && !isTargetHigherRank;
    const canDelFrame = (hasPermission('canDeleteUserMembershipFrame')) && !isTargetHigherRank;
    const canDelBg = (hasPermission('canDeleteUserMembershipBg')) && !isTargetHigherRank;
    
    const canUpPic = (hasPermission('canEditUsers')) && !isTargetHigherRank;
    const canUpCover = (hasPermission('canEditUsers')) && !isTargetHigherRank;
    const canUpFrame = (hasPermission('canDesignMembership') || hasPermission('canEditUsers')) && !isTargetHigherRank;
    const canUpBg = (hasPermission('canDesignMembership') || hasPermission('canEditUsers')) && !isTargetHigherRank;

    const identityHtml = window.renderUserIdentity ? window.renderUserIdentity(profileUser, { tag: 'span' }) : `<span>${profileUser.username}</span>`;

    const html = `
      <div class="p-1 text-right" style="direction: rtl; font-family: 'Helvetica Neue', Arial, sans-serif; text-align: right;">
        
        <div class="mb-3 text-center" style="border-bottom: 1px solid #e2e8f0; padding-bottom: 12px;">
          <span class="text-secondary d-block mb-1" style="font-size: 0.8rem; font-weight: 500;">الملف الشخصي المستهدف</span>
          <div style="display: inline-block; padding: 4px 12px; background-color: #f8fafc; border-radius: 20px; border: 1px solid #edf2f7; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02); vertical-align: middle;">
            ${identityHtml}
          </div>
        </div>
        
        <div class="mb-3">
          <label class="font-weight-bold mb-2 d-block text-secondary" style="font-size: 0.8rem; font-weight: 600; letter-spacing: 0.5px;">
            <i class="fas fa-trash-alt ml-1 text-danger"></i> أزرار الحذف السريع لخيارات الملف:
          </label>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <button class="btn btn-sm btn-outline-danger" id="admin-del-pic-btn" ${canDelPic ? '' : 'disabled'} style="font-size: 0.72rem; border-radius: 4px; padding: 4px 6px; line-height: 1.1; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 28px;">
              <i class="fas fa-user-circle"></i> حذف الصورة
            </button>
            <button class="btn btn-sm btn-outline-danger" id="admin-del-cover-btn" ${canDelCover ? '' : 'disabled'} style="font-size: 0.72rem; border-radius: 4px; padding: 4px 6px; line-height: 1.1; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 28px;">
              <i class="fas fa-image"></i> حذف الغلاف
            </button>
            <button class="btn btn-sm btn-outline-danger" id="admin-del-frame-btn" ${canDelFrame ? '' : 'disabled'} style="font-size: 0.72rem; border-radius: 4px; padding: 4px 6px; line-height: 1.1; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 28px;">
              <i class="fas fa-border-style"></i> حذف البرواز
            </button>
            <button class="btn btn-sm btn-outline-danger" id="admin-del-bg-btn" ${canDelBg ? '' : 'disabled'} style="font-size: 0.72rem; border-radius: 4px; padding: 4px 6px; line-height: 1.1; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 4px; min-height: 28px;">
              <i class="fas fa-palette"></i> حذف الخلفية
            </button>
          </div>
        </div>

        <div class="mb-1" style="border-top: 1px solid #edf2f7; padding-top: 12px;">
          <label class="font-weight-bold mb-2 d-block text-secondary" style="font-size: 0.8rem; font-weight: 600; letter-spacing: 0.5px;">
            <i class="fas fa-arrow-alt-circle-up ml-1 text-primary"></i> تحديث ورفع وسائط جديدة:
          </label>
          
          <div style="border-radius: 6px; border: 1px solid #e2e8f0; padding: 10px; background-color: #f8fafc; box-shadow: 0 1px 2px rgba(0,0,0,0.01);">
            <div class="form-group mb-0">
              <label class="mb-1 d-block text-dark font-weight-bold" style="font-size: 0.74rem; text-align: right; opacity: 0.85;">العنصر المراد تعديله:</label>
              <select id="admin-cosmetic-type-select" class="form-control form-control-sm" style="border-radius: 5px; font-size: 0.78rem; height: 30px; padding: 4px 6px; width: 100%; border: 1px solid #cbd5e1; margin-bottom: 8px;">
                <option value="pic" ${canUpPic ? '' : 'disabled'}>الصورة الشخصية (الأفاتار)</option>
                <option value="cover" ${canUpCover ? '' : 'disabled'}>صورة الغلاف (الكفر)</option>
                <option value="membershipFrame" ${canUpFrame ? '' : 'disabled'}>برواز تصميم العضوية</option>
                <option value="membershipBg" ${canUpBg ? '' : 'disabled'}>الخلفية الخاصة بتصميم العضوية</option>
              </select>
              
              <label class="mb-1 d-block text-dark font-weight-bold" style="font-size: 0.74rem; text-align: right; margin-top: 6px; opacity: 0.85;">الملف الجديد:</label>
              <div style="position: relative; margin-bottom: 10px; display: flex; align-items: center; gap: 6px; background: white; border: 1px solid #cbd5e1; padding: 3px 6px; border-radius: 5px;">
                <i class="fas fa-file-image text-muted" style="font-size: 0.85rem;"></i>
                <input type="file" id="admin-cosmetic-file-input" accept="image/*" style="font-size: 0.74rem; border: none; outline: none; width: 100%; cursor: pointer;">
              </div>
              
              <button class="btn btn-sm btn-primary" id="admin-upload-cosmetic-btn" style="font-size: 0.78rem; border-radius: 5px; width: 100%; padding: 6px; background-color: #007bff; color: white; border: none; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 4px; box-shadow: 0 1px 2px rgba(0,123,255,0.1); transition: background-color 0.2s;">
                <i class="fas fa-cloud-upload-alt"></i> رفع وحفظ المستند الجديد
              </button>
            </div>
          </div>
          
        </div>
      </div>
    `;

    Swal.fire({
      title: 'إدارة صور الملف الشخصي',
      html: html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'إغلاق النافذة',
      customClass: {
        popup: 'custom-swal-cosmetics'
      },
      didOpen: () => {
        const handleDelelte = async (type, name) => {
          Swal.fire({
            title: 'تأكيد الحذف',
            text: `هل أنت متأكد من حذف ${name}؟`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'نعم، احذف',
            cancelButtonText: 'إلغاء'
          }).then(async (result) => {
            if (result.isConfirmed) {
              Swal.showLoading();
              try {
                const res = await fetch('/api/admin/users/delete-cosmetic', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                  },
                  body: JSON.stringify({
                    targetUserId: profileUser.id,
                    cosmeticType: type
                  })
                });
                const data = await res.json();
                if (data.success) {
                  Swal.fire('تم الحذف', `تم حذف ${name} بنجاح.`, 'success');
                  if (type === 'pic') {
                    profileUser.pic = null;
                  } else if (type === 'cover') {
                    profileUser.cover = null;
                  } else if (type === 'membershipFrame') {
                    profileUser.membershipFrame = null;
                  } else if (type === 'membershipBg') {
                    profileUser.membershipBg = null;
                  }
                  
                  // Reload profile modal elements with latest details
                  showUserProfile(profileUser.username);
                } else {
                  Swal.fire('خطأ', data.message || 'فشل حذف الملف', 'error');
                }
              } catch (err) {
                console.error(err);
                Swal.fire('خطأ', 'حدث خطأ في الاتصال بالسيرفر', 'error');
              }
            }
          });
        };

        const btnPic = document.getElementById('admin-del-pic-btn');
        if (btnPic) btnPic.onclick = () => handleDelelte('pic', 'الصورة الشخصية');

        const btnCover = document.getElementById('admin-del-cover-btn');
        if (btnCover) btnCover.onclick = () => handleDelelte('cover', 'صورة الغلاف');

        const btnFrame = document.getElementById('admin-del-frame-btn');
        if (btnFrame) btnFrame.onclick = () => handleDelelte('membershipFrame', 'برواز العضوية');

        const btnBg = document.getElementById('admin-del-bg-btn');
        if (btnBg) btnBg.onclick = () => handleDelelte('membershipBg', 'خلفية العضوية');

        const btnUpload = document.getElementById('admin-upload-cosmetic-btn');
        if (btnUpload) {
          btnUpload.onclick = async () => {
            const select = document.getElementById('admin-cosmetic-type-select');
            const fileInput = document.getElementById('admin-cosmetic-file-input');
            
            const selectedType = select ? select.value : 'pic';
            const file = fileInput && fileInput.files ? fileInput.files[0] : null;

            if (!file) {
              Swal.fire('تنبيه', 'الرجاء تحديد ملف لرفعه أولاً', 'warning');
              return;
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('cosmeticType', selectedType);

            Swal.showLoading();
            try {
              const res = await fetch(`/api/admin/users/${profileUser.id}/upload-cosmetic`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${getToken()}`
                },
                body: formData
              });
              const data = await res.json();
              if (data.success) {
                Swal.fire('تم التحديث', 'تم رفع وصياغة التصميم بنجاح', 'success');
                if (selectedType === 'pic') {
                  profileUser.pic = data.url;
                } else if (selectedType === 'cover') {
                  profileUser.cover = data.url;
                } else if (selectedType === 'membershipFrame') {
                  profileUser.membershipFrame = data.url;
                } else if (selectedType === 'membershipBg') {
                  profileUser.membershipBg = data.url;
                }
                
                showUserProfile(profileUser.username);
              } else {
                Swal.fire('خطأ', data.message || 'فشل تحديث الملف', 'error');
              }
            } catch (err) {
              console.error(err);
              Swal.fire('خطأ', 'حدث خطأ أثناء الرفع بالشبكة', 'error');
            }
          };
        }
      }
    });
  };
}

const btnProfileReveal = document.getElementById('btn-profile-reveal');
if (btnProfileReveal) {
  btnProfileReveal.onclick = () => {
    socket.emit('reveal-nickname', {
      targetUsername: profileUser.username,
      targetUserId: profileUser.id || profileUser.userId,
      targetType: (profileUser.type === 'guest' || profileUser.isGuest) ? 'guest' : 'member'
    });
  };
}

currentAddonMode = currentAddonMode || 'gift'; // 'gift' or 'super_icon'

function canCurrentUserSendEffects() {
  const effectiveLikeThreshold = (window.featuresSettings && window.featuresSettings.likes_effects !== undefined)
    ? Number(window.featuresSettings.likes_effects)
    : 0;
  const currentLikes = (state.currentUser && state.currentUser.likes) ? Number(state.currentUser.likes) : 0;
  if (effectiveLikeThreshold > 0 && currentLikes < effectiveLikeThreshold) {
    if (window.showLikesLimitAlert) {
      window.showLikesLimitAlert(`عذراً، تحتاج إلى ${effectiveLikeThreshold} لايك لإرسال التأثيرات. (لديك ${currentLikes})`);
    } else {
      showToast(`عذراً، تحتاج إلى ${effectiveLikeThreshold} لايك لإرسال التأثيرات. (لديك ${currentLikes})`, 'warning');
    }
    return false;
  }
  return true;
}

const btnProfileKiss = document.getElementById('btn-profile-kiss');
if (btnProfileKiss) {
  btnProfileKiss.onclick = () => {
    if (!canCurrentUserSendEffects()) return;
    if (profileUser && state.currentUser && profileUser.username !== state.currentUser.username) {
        socket.emit('kiss', { targetUsername: profileUser.username });
        showToast('تم إرسال البوسة!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('effectsModal'));
        if (modal) modal.hide();
    } else if (profileUser && state.currentUser && profileUser.username === state.currentUser.username) {
        showToast('لا يمكنك إرسال البوسة لنفسك!', 'warning');
    }
  };
}

const btnProfileSlap = document.getElementById('btn-profile-slap');
if (btnProfileSlap) {
  btnProfileSlap.onclick = () => {
    if (!canCurrentUserSendEffects()) return;
    if (profileUser && state.currentUser && profileUser.username !== state.currentUser.username) {
        socket.emit('slap', { targetUsername: profileUser.username });
        showToast('تم إرسال الكف!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('effectsModal'));
        if (modal) modal.hide();
    } else if (profileUser && state.currentUser && profileUser.username === state.currentUser.username) {
        showToast('لا يمكنك إرسال الكف لنفسك!', 'warning');
    }
  };
}

const btnProfileHug = document.getElementById('btn-profile-hug');
if (btnProfileHug) {
  btnProfileHug.onclick = () => {
    if (!canCurrentUserSendEffects()) return;
    if (profileUser && state.currentUser && profileUser.username !== state.currentUser.username) {
        socket.emit('hug', { targetUsername: profileUser.username });
        showToast('تم إرسال الحضن!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('effectsModal'));
        if (modal) modal.hide();
    } else if (profileUser && state.currentUser && profileUser.username === state.currentUser.username) {
        showToast('لا يمكنك إرسال الحضن لنفسك!', 'warning');
    }
  };
}

const btnProfileClap = document.getElementById('btn-profile-clap');
if (btnProfileClap) {
  btnProfileClap.onclick = () => {
    if (!canCurrentUserSendEffects()) return;
    if (profileUser && state.currentUser && profileUser.username !== state.currentUser.username) {
        socket.emit('clap', { targetUsername: profileUser.username });
        showToast('تم إرسال التصفيق!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('effectsModal'));
        if (modal) modal.hide();
    } else if (profileUser && state.currentUser && profileUser.username === state.currentUser.username) {
        showToast('لا يمكنك إرسال التصفيق لنفسك!', 'warning');
    }
  };
}

const btnProfileGift = document.getElementById('btn-profile-gift');
if (btnProfileGift) {
  btnProfileGift.onclick = () => {
    currentAddonMode = 'gift';
    
    // Update Addon Header
    const addonHeaderAvatar = document.getElementById('addon-header-avatar');
    if (addonHeaderAvatar) addonHeaderAvatar.src = window.getAvatarUrl(profileUser);
    
    const addonHeaderTopic = document.getElementById('addon-header-topic');
    if (addonHeaderTopic) {
      addonHeaderTopic.innerHTML = profileUser.topic || profileUser.username;
      addonHeaderTopic.style.color = profileUser.ucol || '#ffffff';
    }
    
    const addonHeaderBanner = document.getElementById('addon-header-banner');
    if (addonHeaderBanner) {
      if (profileUser.superIcon) {
        addonHeaderBanner.src = profileUser.superIcon;
        addonHeaderBanner.classList.remove('d-none');
      } else {
        addonHeaderBanner.classList.add('d-none');
      }
    }
    
    const btnRemoveAddon = document.getElementById('btn-remove-addon');
    const removeAddonText = document.getElementById('remove-addon-text');
    if (removeAddonText) removeAddonText.innerText = 'حذف الهدايا';
    if (btnRemoveAddon) btnRemoveAddon.classList.remove('d-none');

    loadAddons();
    manageAddonsModal.show();
  };
}

const btnProfileMuteRoom = document.getElementById('btn-profile-mute-room');
if (btnProfileMuteRoom) {
  btnProfileMuteRoom.onclick = () => {
    if (profileUser.isMutedRoom) {
      socket.emit('room-unmute-user', { targetUsername: profileUser.username, roomId: state.currentRoomId });
      profileUser.isMutedRoom = false;
    } else {
      socket.emit('room-mute-user', { targetUsername: profileUser.username, roomId: state.currentRoomId });
      profileUser.isMutedRoom = true;
    }
    updateProfileButtons(profileUser, 5000);
  };
}

const btnProfileMuteGlobal = document.getElementById('btn-profile-mute-global');
if (btnProfileMuteGlobal) {
  btnProfileMuteGlobal.onclick = () => {
    if (profileUser.isMutedWall || profileUser.isMuted) {
      socket.emit('unmute-user', { targetUsername: profileUser.username });
      profileUser.isMuted = false;
      profileUser.isMutedWall = false;
    } else {
      socket.emit('mute-user', { targetUsername: profileUser.username });
      profileUser.isMuted = true;
      profileUser.isMutedWall = true;
    }
    updateProfileButtons(profileUser, 5000);
  };
}

const btnProfileMute = document.getElementById('btn-profile-mute');
if (btnProfileMute) {
  btnProfileMute.onclick = () => {
    const targetRank = profileUser.roleRank || (profileUser.group && profileUser.group.roleRank) || 0;
    const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
    const canAffect = myRank > targetRank;
    
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    
    const canMuteRoomStatus = hasPermission('canMuteUsers') || (isModerator && roomPermissions.includes('canMuteUsers'));
    const isSameRoom = profileUser.roomId === state.currentRoomId;
    
    const showMuteRoom = canMuteRoomStatus && canAffect && isSameRoom;
    const showMuteGlobal = hasPermission('canMuteUsers') && canAffect;

    if (!showMuteRoom && !showMuteGlobal) return;

    if (showMuteRoom && !showMuteGlobal) {
      const roomBtn = document.getElementById('btn-profile-mute-room');
      if (roomBtn) roomBtn.click();
      return;
    }

    if (showMuteGlobal && !showMuteRoom) {
      const globalBtn = document.getElementById('btn-profile-mute-global');
      if (globalBtn) globalBtn.click();
      return;
    }

    let html = '<div class="list-group text-right" style="direction: rtl; gap: 8px; display: flex; flex-direction: column;">';
    
    if (showMuteRoom) {
      const isRoomMuted = profileUser.isMutedRoom === true || profileUser.isMutedRoom === 'true';
      const btnClass = isRoomMuted ? 'text-success' : 'text-danger';
      const btnBg = isRoomMuted ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)';
      const btnBorder = isRoomMuted ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)';
      const label = isRoomMuted ? 'فك إسكات من الغرفة' : 'إسكات من الكلام في الغرفة';
      const icon = isRoomMuted ? 'fa-microphone' : 'fa-microphone-slash';
      
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded ${btnClass} font-weight-bold" id="opt-mute-room" style="background: ${btnBg}; border: 1px solid ${btnBorder} !important; cursor: pointer; text-align: right;">
          <span><i class="fas ${icon} ms-2"></i> ${label}</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    
    if (showMuteGlobal) {
      const isWallMuted = profileUser.isMutedWall === true || profileUser.isMutedWall === 'true' || profileUser.isMuted === true || profileUser.isMuted === 'true';
      const btnClass = isWallMuted ? 'text-success' : 'text-danger';
      const btnBg = isWallMuted ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)';
      const btnBorder = isWallMuted ? 'rgba(40, 167, 69, 0.2)' : 'rgba(220, 53, 69, 0.2)';
      const label = isWallMuted ? 'فك إسكات الحائط' : 'إسكات من الكلام بالحائط';
      const icon = isWallMuted ? 'fa-microphone' : 'fa-microphone-slash';
      
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded ${btnClass} font-weight-bold" id="opt-mute-global" style="background: ${btnBg}; border: 1px solid ${btnBorder} !important; cursor: pointer; text-align: right;">
          <span><i class="fas ${icon} ms-2"></i> ${label}</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    
    html += '</div>';

    Swal.fire({
      title: 'خيارات إسكات العضو',
      html: html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'إلغاء',
      customClass: {
        popup: 'mute-options-popup'
      },
      didOpen: () => {
        const optRoom = document.getElementById('opt-mute-room');
        const optGlobal = document.getElementById('opt-mute-global');

        if (optRoom) {
          optRoom.onclick = () => {
            Swal.close();
            const originalMuteRoomBtn = document.getElementById('btn-profile-mute-room');
            if (originalMuteRoomBtn) originalMuteRoomBtn.click();
          };
        }
        if (optGlobal) {
          optGlobal.onclick = () => {
            Swal.close();
            const originalMuteGlobalBtn = document.getElementById('btn-profile-mute-global');
            if (originalMuteGlobalBtn) originalMuteGlobalBtn.click();
          };
        }
      }
    });
  };
}

const btnProfileKickRoom = document.getElementById('btn-profile-kick-room');
if (btnProfileKickRoom) {
  btnProfileKickRoom.onclick = () => {
    socket.emit('room-kick-user', { targetUsername: profileUser.username, roomId: state.currentRoomId });
  };
}

const btnProfileKickGlobal = document.getElementById('btn-profile-kick-global');
if (btnProfileKickGlobal) {
  btnProfileKickGlobal.onclick = () => {
    profileModal.hide();
    Swal.fire({
      title: 'طرد الشات',
      text: 'هل أنت متأكد من طرد هذا المستخدم من الشات؟',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'نعم، اطرد',
      cancelButtonText: 'إلغاء'
    }).then((result) => {
      if (result.isConfirmed) {
        socket.emit('kick-user', { targetUsername: profileUser.username });
      } else {
        showUserProfile(profileUser.username);
      }
    });
  };
}

const btnProfileKick = document.getElementById('btn-profile-kick');
if (btnProfileKick) {
  btnProfileKick.onclick = () => {
    const targetRank = profileUser.roleRank || (profileUser.group && profileUser.group.roleRank) || 0;
    const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
        const canAffect = myRank > targetRank;
    
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canKick = hasPermission('canKickUsers') || (isModerator && roomPermissions.includes('canKickUsers'));
    const isSameRoom = profileUser.roomId === state.currentRoomId;

    const showKickRoom = canKick && canAffect && isSameRoom;
    const showKickGlobal = hasPermission('canKickUsers') && canAffect;

    // Build options HTML
    let html = '<div class="list-group text-right" style="direction: rtl; gap: 8px; display: flex; flex-direction: column;">';
    if (showKickGlobal) {
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded text-danger font-weight-bold" id="opt-kick-global" style="background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.2) !important; cursor: pointer; text-align: right;">
          <span><i class="fas fa-sign-out-alt ms-2"></i> طرد من الدردشة</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    if (showKickRoom) {
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded text-dark font-weight-bold" id="opt-kick-room" style="background: rgba(108, 117, 125, 0.1); border: 1px solid rgba(108, 117, 125, 0.2) !important; cursor: pointer; text-align: right;">
          <span><i class="fas fa-user-minus ms-2"></i> طرد من الغرفة</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    html += '</div>';

    Swal.fire({
      title: 'خيارات طرد العضو',
      html: html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'إلغاء',
      customClass: {
        popup: 'kick-options-popup'
      },
      didOpen: () => {
        const optGlobal = document.getElementById('opt-kick-global');
        const optRoom = document.getElementById('opt-kick-room');

        if (optGlobal) {
          optGlobal.onclick = () => {
            Swal.close();
            const originalKickGlobalBtn = document.getElementById('btn-profile-kick-global');
            if (originalKickGlobalBtn) originalKickGlobalBtn.click();
          };
        }
        if (optRoom) {
          optRoom.onclick = () => {
            Swal.close();
            const originalKickRoomBtn = document.getElementById('btn-profile-kick-room');
            if (originalKickRoomBtn) originalKickRoomBtn.click();
          };
        }
      }
    });
  };
}

const btnProfileBan = document.getElementById('btn-profile-ban');
if (btnProfileBan) {
  btnProfileBan.onclick = () => {
    const targetRank = profileUser.roleRank || (profileUser.group && profileUser.group.roleRank) || 0;
    const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
        const canAffect = myRank > targetRank;
    
    const currentRoom = window.roomsData ? window.roomsData[state.currentRoomId] : null;
    const modObj = currentRoom && currentRoom.moderators && currentRoom.moderators.find(m => (typeof m === 'number' ? m === state.currentUser.id : Number(m.userId) === Number(state.currentUser.id)));
    const isModerator = !!modObj;
    const roomPermissions = (modObj && typeof modObj === 'object') ? (modObj.permissions || []) : [];
    const canBan = hasPermission('canBanUsers') || (isModerator && roomPermissions.includes('canBanUsers'));
    const isSameRoom = profileUser.roomId === state.currentRoomId;

    const showBanRoom = canBan && canAffect && isSameRoom;
    const showBanGlobal = hasPermission('canBanUsers') && canAffect;

    // Build options HTML
    let html = '<div class="list-group text-right" style="direction: rtl; gap: 8px; display: flex; flex-direction: column;">';
    if (showBanGlobal) {
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded text-danger font-weight-bold" id="opt-ban-perm" style="background: rgba(220, 53, 69, 0.1); border: 1px solid rgba(220, 53, 69, 0.2) !important; cursor: pointer; text-align: right;">
          <span><i class="fas fa-ban ms-2"></i> حظر دائم</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded text-warning font-weight-bold" id="opt-ban-temp" style="background: rgba(253, 126, 20, 0.1); border: 1px solid rgba(253, 126, 20, 0.2) !important; cursor: pointer; text-align: right; color: #856404 !important;">
          <span><i class="fas fa-clock ms-2"></i> حظر مؤقت</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    if (showBanRoom) {
      html += `
        <button class="list-group-item list-group-item-action border-0 d-flex align-items-center justify-content-between p-3 rounded text-dark font-weight-bold" id="opt-ban-room" style="background: rgba(108, 117, 125, 0.1); border: 1px solid rgba(108, 117, 125, 0.2) !important; cursor: pointer; text-align: right;">
          <span><i class="fas fa-user-slash ms-2"></i> حظر من الغرفة</span>
          <i class="fas fa-chevron-left text-muted"></i>
        </button>
      `;
    }
    html += '</div>';

    Swal.fire({
      title: 'خيارات حظر العضو',
      html: html,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: 'إلغاء',
      customClass: {
        popup: 'ban-options-popup'
      },
      didOpen: () => {
        const optPerm = document.getElementById('opt-ban-perm');
        const optTemp = document.getElementById('opt-ban-temp');
        const optRoom = document.getElementById('opt-ban-room');

        if (optPerm) {
          optPerm.onclick = () => {
            Swal.close();
            const originalBanPermBtn = document.getElementById('btn-profile-ban-permanent');
            if (originalBanPermBtn) originalBanPermBtn.click();
          };
        }
        if (optTemp) {
          optTemp.onclick = () => {
            Swal.close();
            const originalBanTempBtn = document.getElementById('btn-profile-ban-temporary');
            if (originalBanTempBtn) originalBanTempBtn.click();
          };
        }
        if (optRoom) {
          optRoom.onclick = () => {
            Swal.close();
            const originalBanRoomBtn = document.getElementById('btn-profile-ban-room');
            if (originalBanRoomBtn) originalBanRoomBtn.click();
          };
        }
      }
    });
  };
}

const btnProfileBanRoom = document.getElementById('btn-profile-ban-room');
if (btnProfileBanRoom) {
  btnProfileBanRoom.onclick = async () => {
    profileModal.hide();
    const { value: reason } = await Swal.fire({
      title: 'حظر من الغرفة',
      input: 'text',
      inputLabel: 'سبب الحظر',
      showCancelButton: true,
      confirmButtonText: 'حظر',
      cancelButtonText: 'إلغاء'
    });
    if (reason !== undefined) {
      socket.emit('room-ban-user', { targetUsername: profileUser.username, roomId: state.currentRoomId, reason });
    } else {
      showUserProfile(profileUser.username);
    }
  };
}

const btnProfileBanPermanent = document.getElementById('btn-profile-ban-permanent');
if (btnProfileBanPermanent) {
  btnProfileBanPermanent.onclick = async () => {
    profileModal.hide();
    const { value: reason } = await Swal.fire({
      title: 'حظر نهائي',
      input: 'text',
      inputLabel: 'سبب الحظر',
      showCancelButton: true,
      confirmButtonText: 'حظر نهائي',
      cancelButtonText: 'إلغاء'
    });
    if (reason !== undefined) {
      socket.emit('ban-user', { username: profileUser.username, type: 'permanent', reason });
    } else {
      showUserProfile(profileUser.username);
    }
  };
}

const btnProfileReport = document.getElementById('btn-profile-report');
if (btnProfileReport) {
  btnProfileReport.onclick = () => {
    profileModal.hide();
    const reportUserModalEl = document.getElementById('reportUserModal');
    if (reportUserModalEl) {
      const modal = bootstrap.Modal.getInstance(reportUserModalEl) || new bootstrap.Modal(reportUserModalEl);
      modal.show();
    }
  };
}

const btnSubmitReport = document.getElementById('btn-submit-report');
if (btnSubmitReport) {
  btnSubmitReport.onclick = async () => {
    const reasonInput = document.getElementById('report-reason-input');
    const reason = reasonInput.value;
    if (!reason || reason.trim() === '') {
        document.getElementById('report-reason-error').classList.remove('d-none');
        return;
    }
    document.getElementById('report-reason-error').classList.add('d-none');
    
    let proofImage = null;
    const fileInput = document.getElementById('report-file-input');
    const uploadProgress = document.getElementById('report-upload-progress');
    
    if (fileInput.files && fileInput.files.length > 0) {
        try {
            uploadProgress.classList.remove('d-none');
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            
            const response = await safeFetch('/api/upload/report', {
                method: 'POST',
                body: formData
            });
            const result = await response.json();
            if(result.success) {
                proofImage = result.url;
            } else {
                throw new Error(result.message || 'فشل رفع الصورة');
            }
        } catch (err) {
            showToast(err.message, 'error');
            return;
        } finally {
            uploadProgress.classList.add('d-none');
        }
    }
    
    socket.emit('report-user', { targetUsername: profileUser.username, reason, proofImage }, (response) => {
        if (response.success) {
            Swal.fire({ title: 'نجاح', text: response.message, icon: 'success' });
            const modal = bootstrap.Modal.getInstance(document.getElementById('reportUserModal'));
            if(modal) modal.hide();
            reasonInput.value = '';
            fileInput.value = '';
        } else {
            Swal.fire({ title: 'خطأ', text: response.message, icon: 'error' });
        }
    });
  };
}

// Handle Temporary Ban
const btnProfileBanTemporary = document.getElementById('btn-profile-ban-temporary');

if (btnProfileBanTemporary) {
  btnProfileBanTemporary.onclick = async () => {
    profileModal.hide();

    const durationResult = await Swal.fire({
      title: 'حظر مؤقت',
      input: 'select',
      inputLabel: 'اختر مدة الحظر',
      inputOptions: {
        1: '1 دقيقة',
        5: '5 دقائق',
        10: '10 دقائق',
        20: '20 دقيقة',
        30: '30 دقيقة',
        60: '1 ساعة',
        120: '2 ساعتين',
        360: '6 ساعات',
        720: '12 ساعة',
        1440: '24 ساعة',
        2880: 'يومين',
        4320: '3 أيام',
        10080: '7 أيام',
        43200: '30 يوم'
      },
      inputValue: '20',
      showCancelButton: true,
      confirmButtonText: 'التالي',
      cancelButtonText: 'إلغاء',
      inputValidator: (value) => {
        const duration = Number(value);
        if (!Number.isFinite(duration) || duration <= 0) {
          return 'مدة الحظر المؤقت غير صحيحة';
        }
        return null;
      }
    });

    if (!durationResult.isConfirmed) {
      showUserProfile(profileUser.username);
      return;
    }

    const duration = Number(durationResult.value);

    if (!Number.isFinite(duration) || duration <= 0) {
      Swal.fire('تنبيه', 'مدة الحظر المؤقت غير صحيحة من الواجهة', 'error');
      return;
    }

    const reasonResult = await Swal.fire({
      title: 'سبب الحظر',
      input: 'text',
      inputLabel: 'السبب',
      inputPlaceholder: 'اكتب سبب الحظر أو اتركه فارغًا',
      showCancelButton: true,
      confirmButtonText: 'حظر مؤقت',
      cancelButtonText: 'إلغاء'
    });

    if (!reasonResult.isConfirmed) {
      showUserProfile(profileUser.username);
      return;
    }

    const payload = {
      username: profileUser.username,
      type: 'temporary',
      duration: duration,
      durationMinutes: duration,
      reason: reasonResult.value || '',
      country: profileUser.country,
      roomId: state.currentRoomId
    };

    console.log('[TEMP BAN PAYLOAD FINAL]', payload);

    socket.emit('ban-user', payload);
  };
}

const btnProfileBanner = document.getElementById('btn-profile-banner');
if (btnProfileBanner) {
  btnProfileBanner.onclick = () => {
    currentAddonMode = 'super_icon';
    
    // Update Addon Header
    const addonHeaderAvatar = document.getElementById('addon-header-avatar');
    if (addonHeaderAvatar) addonHeaderAvatar.src = window.getAvatarUrl(profileUser);
    
    const addonHeaderTopic = document.getElementById('addon-header-topic');
    if (addonHeaderTopic) {
      addonHeaderTopic.innerHTML = profileUser.topic || profileUser.username;
      addonHeaderTopic.style.color = profileUser.ucol || '#ffffff';
    }
    
    const addonHeaderBanner = document.getElementById('addon-header-banner');
    if (addonHeaderBanner) {
      if (profileUser.superIcon) {
        addonHeaderBanner.src = profileUser.superIcon;
        addonHeaderBanner.classList.remove('d-none');
      } else {
        addonHeaderBanner.classList.add('d-none');
      }
    }

    const btnRemoveAddon = document.getElementById('btn-remove-addon');
    const removeAddonText = document.getElementById('remove-addon-text');
    if (removeAddonText) removeAddonText.innerText = 'حذف البنر';
    if (btnRemoveAddon) btnRemoveAddon.classList.remove('d-none');

    loadAddons();
    manageAddonsModal.show();
  };
}

const btnAddonsBack = document.getElementById('btn-addons-back');
if (btnAddonsBack) {
  btnAddonsBack.onclick = () => {
    manageAddonsModal.hide();
  };
}

const btnProfileDelFrame = document.getElementById('btn-profile-del-frame');
if (btnProfileDelFrame) {
  btnProfileDelFrame.onclick = () => {
    socket.emit('delete-user-frame', { targetUsername: profileUser.username });
  };
}

const btnProfileDelBg = document.getElementById('btn-profile-del-bg');
if (btnProfileDelBg) {
  btnProfileDelBg.onclick = () => {
    socket.emit('delete-user-bg', { targetUsername: profileUser.username });
  };
}

const btnProfileDelLink = document.getElementById('btn-profile-del-link');
if (btnProfileDelLink) {
  btnProfileDelLink.onclick = () => {
    socket.emit('delete-user-link', { targetUsername: profileUser.username });
  };
}

const btnProfileIgnore = document.getElementById('btn-profile-ignore');
if (btnProfileIgnore) {
  btnProfileIgnore.onclick = () => {
    const isIgnored = state.ignoredUsers.has(profileUser.username);
    if (isIgnored) {
      state.ignoredUsers.delete(profileUser.username);
      showToast(`تم إلغاء تجاهل ${profileUser.topic || profileUser.username}`, 'success');
    } else {
      state.ignoredUsers.add(profileUser.username);
      showToast(`تم تجاهل ${profileUser.topic || profileUser.username}`, 'success');
    }
    saveIgnoredUsers();
    profileModal.hide();
  };
}

var manageAddonsModalEl = document.getElementById('manageAddonsModal');
var effectsModalEl = document.getElementById('effectsModal');
var manageAddonsModal = manageAddonsModalEl ? new bootstrap.Modal(manageAddonsModalEl) : null;
var effectsModal = effectsModalEl ? new bootstrap.Modal(effectsModalEl) : null;

if (effectsModalEl) {
  effectsModalEl.addEventListener('show.bs.modal', (e) => {
    effectsModalEl.style.setProperty('z-index', '1300', 'important');
    const effectiveLikeThreshold = (window.featuresSettings && window.featuresSettings.likes_effects !== undefined)
      ? Number(window.featuresSettings.likes_effects)
      : 0;
    const currentLikes = (state.currentUser && state.currentUser.likes) ? Number(state.currentUser.likes) : 0;
    if (effectiveLikeThreshold > 0 && currentLikes < effectiveLikeThreshold) {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (window.showLikesLimitAlert) {
        window.showLikesLimitAlert(`عذراً، تحتاج إلى ${effectiveLikeThreshold} لايك لإرسال التأثيرات. (لديك ${currentLikes})`);
      } else {
        showToast(`عذراً، تحتاج إلى ${effectiveLikeThreshold} لايك لإرسال التأثيرات. (لديك ${currentLikes})`, 'warning');
      }
    }
  });
}

if (manageAddonsModalEl) {
  manageAddonsModalEl.addEventListener('show.bs.modal', () => {
    manageAddonsModalEl.style.setProperty('z-index', '1300', 'important');
  });
  manageAddonsModalEl.addEventListener('shown.bs.modal', () => {
    const backdrops = document.querySelectorAll('.modal-backdrop');
    if (backdrops.length > 1) {
      backdrops[backdrops.length - 1].style.setProperty('z-index', '1250', 'important');
    }
  });
  manageAddonsModalEl.addEventListener('hidden.bs.modal', () => {
    // Ensure body keeps modal-open class if profile modal is still open
    const userProfileModalEl = document.getElementById('userProfileModal');
    if (userProfileModalEl && userProfileModalEl.classList.contains('show')) {
      document.body.classList.add('modal-open');
    }
  });
}

const btnManageAddonsTop = document.getElementById('btn-manage-addons');
if (btnManageAddonsTop) {
  btnManageAddonsTop.onclick = async () => {
    // Update Addon Header
    const addonHeaderAvatar = document.getElementById('addon-header-avatar');
    if (addonHeaderAvatar) addonHeaderAvatar.src = window.getAvatarUrl(profileUser);
    
    const addonHeaderTopic = document.getElementById('addon-header-topic');
    if (addonHeaderTopic) {
      addonHeaderTopic.innerHTML = profileUser.topic || profileUser.username;
      addonHeaderTopic.style.color = profileUser.ucol || '#ffffff';
    }
    
    const addonHeaderBanner = document.getElementById('addon-header-banner');
    if (addonHeaderBanner) {
      if (profileUser.superIcon) {
        addonHeaderBanner.src = profileUser.superIcon;
        addonHeaderBanner.classList.remove('d-none');
      } else {
        addonHeaderBanner.classList.add('d-none');
      }
    }
    
    // Handle tab visibility based on permissions
    const tabSuperIcon = document.getElementById('tab-item-super-icon');
    const tabGifts = document.getElementById('tab-item-gifts');
    const canAssignSuperIcon = hasPermission('canAssignSuperIcon');
    const canSendGifts = hasPermission('canSendGifts');

    if (canAssignSuperIcon) {
      if (tabSuperIcon) tabSuperIcon.classList.remove('d-none');
    } else {
      if (tabSuperIcon) tabSuperIcon.classList.add('d-none');
    }

    if (canSendGifts) {
      if (tabGifts) tabGifts.classList.remove('d-none');
    } else {
      if (tabGifts) tabGifts.classList.add('d-none');
    }

    // Activate the first available tab
    if (canAssignSuperIcon) {
      const superIconTab = document.getElementById('super-icon-tab');
      if (superIconTab) superIconTab.click();
    } else if (canSendGifts) {
      const giftsTab = document.getElementById('gifts-tab');
      if (giftsTab) giftsTab.click();
    }

    // Fetch and render available addons
    loadAddons();
    
    if (manageAddonsModal) {
      manageAddonsModal.show();
    }
  };
}

async function loadAddons() {
  const grid = document.getElementById('available-addons-grid');
  if (!grid) return;

  grid.innerHTML = '<div class="text-center w-100 p-4"><i class="fas fa-spinner fa-spin"></i> جاري التحميل...</div>';

  try {
    const response = await fetch('/api/admin/addons', {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (response.ok) {
      const allAddons = await response.json();
      const filtered = allAddons.filter(a => a.type === currentAddonMode);
      
      if (filtered.length === 0) {
        grid.innerHTML = '<div class="text-center w-100 p-4 text-muted">لا توجد إضافات متاحة حالياً.</div>';
        return;
      }

      grid.innerHTML = filtered.map(addon => `
        <div class="addon-item border rounded p-1 text-center d-flex align-items-center justify-content-center" style="cursor: pointer; height: 32px; min-width: 38px;" onclick="selectAddon('${addon.url}', '${addon.type}')" title="${addon.name}">
          <img src="${addon.url}" alt="${addon.name}" style="height: 18px; width: auto; object-fit: contain;" onload="if(this.naturalWidth > 100) { this.parentElement.classList.add('w-100', 'p-2'); this.parentElement.style.height = 'auto'; this.parentElement.style.order = '100'; }">
        </div>
      `).join('');
    } else {
      grid.innerHTML = '<div class="text-center w-100 p-4 text-danger">فشل في تحميل الإضافات.</div>';
    }
  } catch (err) {
    console.error('Error loading addons:', err);
    grid.innerHTML = '<div class="text-center w-100 p-4 text-danger">حدث خطأ أثناء التحميل.</div>';
  }
}

window.selectAddon = async (url, type) => {
  if (type === 'gift') {
    await assignGift(url);
  } else if (type === 'super_icon') {
    await assignSuperIcon(url);
  }
};

var btnRemoveAddon = document.getElementById('btn-remove-addon');
if (btnRemoveAddon) {
  btnRemoveAddon.onclick = async () => {
    if (currentAddonMode === 'super_icon') {
      Swal.fire({
        title: 'تأكيد الإزالة',
        text: 'هل أنت متأكد من إزالة البنر؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم',
        cancelButtonText: 'إلغاء'
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const botId = profileUser.isVirtualUser && profileUser.socketId?.startsWith('bot-')
              ? Number(profileUser.socketId.replace('bot-', ''))
              : null;
            const response = await fetch('/api/admin/addons/remove-super-icon', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
              },
              body: JSON.stringify({ 
                userId: profileUser.userId || profileUser.id || profileUser.username,
                isVirtualUser: !!profileUser.isVirtualUser,
                socketId: profileUser.socketId || null,
                botId
              })
            });
            if (response.ok) {
              profileUser.superIcon = null;
              manageAddonsModal.hide();
            } else {
              const data = await response.json().catch(() => ({}));
              showToast(data.message || 'فشل في إزالة البنر.');
            }
          } catch (err) { console.error(err); }
        }
      });
    } else {
      Swal.fire({
        title: 'تأكيد الإزالة',
        text: 'هل أنت متأكد من إزالة جميع الهدايا؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم',
        cancelButtonText: 'إلغاء'
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const response = await fetch('/api/admin/addons/remove-gift', {
              method: 'POST',
              headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getToken()}`
              },
              body: JSON.stringify({ userId: profileUser.userId || profileUser.id || profileUser.username, giftUrl: profileUser.gifts[0] })
            });
            if (response.ok) {
              profileUser.gifts = [];
              manageAddonsModal.hide();
            }
          } catch (err) { console.error(err); }
        }
      });
    }
  };
}

async function assignSuperIcon(url) {
  try {
    const botId = profileUser.isVirtualUser && profileUser.socketId?.startsWith('bot-')
      ? Number(profileUser.socketId.replace('bot-', ''))
      : null;
    const response = await fetch('/api/admin/addons/assign-super-icon', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ 
        userId: profileUser.userId || profileUser.id || profileUser.username, 
        iconUrl: url,
        isVirtualUser: !!profileUser.isVirtualUser,
        socketId: profileUser.socketId || null,
        botId
      })
    });
    
    if (response.ok) {
      profileUser.superIcon = url;
      manageAddonsModal.hide();
    } else {
      const data = await response.json().catch(() => ({}));
      showToast(data.message || 'فشل في تعيين الأيقونة.');
    }
  } catch (err) {
    console.error('Error assigning super icon:', err);
  }
}
window.assignSuperIcon = assignSuperIcon;

async function assignGift(url) {
  try {
    const response = await fetch('/api/admin/addons/assign-gift', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify({ userId: profileUser.userId || profileUser.id || profileUser.username, giftUrl: url })
    });
    
    if (response.ok) {
      if (!profileUser.gifts) profileUser.gifts = [];
      if (!profileUser.gifts.includes(url)) {
        profileUser.gifts.push(url);
      }
      manageAddonsModal.hide();
    } else {
      showToast('فشل في إرسال الهدية.');
    }
  } catch (err) {
    console.error('Error assigning gift:', err);
  }
}

function extractYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}
window.assignGift = assignGift;

async function removeGift(url) {
  Swal.fire({
    title: 'تأكيد الإزالة',
    text: 'هل أنت متأكد من إزالة هذه الهدية؟',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'نعم',
    cancelButtonText: 'إلغاء'
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        const response = await fetch('/api/admin/addons/remove-gift', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
          },
          body: JSON.stringify({ userId: profileUser.userId || profileUser.id || profileUser.username, giftUrl: url })
        });
        
        if (response.ok) {
          if (profileUser.gifts) {
            profileUser.gifts = [];
          }
          showToast('تم إزالة الهدية بنجاح', 'success');
          // Update UI components
          showUserProfile(profileUser.username);
        } else {
          showToast('فشل في إزالة الهدية.');
        }
      } catch (err) {
        console.error('Error removing gift:', err);
      }
    }
  });
}
window.removeGift = removeGift;


window.stopLightboxVideo = () => {
  const video = document.getElementById('lightbox-video');
  if (video) {
    video.pause();
    video.currentTime = 0;
  }
};

window.openLightbox = (url) => {
  if (ui.lightbox && ui.lightboxImg) {
    ui.lightboxImg.classList.remove('is-tall-image');
    ui.lightboxImg.onload = null;

    ui.lightboxImg.onload = function() {
      const ratio = this.naturalHeight / this.naturalWidth;
      if (ratio > 1.6) {
        this.classList.add('is-tall-image');
      } else {
        this.classList.remove('is-tall-image');
      }
    };

    ui.lightboxImg.src = url;
    ui.lightboxImg.style.display = 'block';
    const video = document.getElementById('lightbox-video');
    if (video) {
      video.style.display = 'none';
      video.pause();
      video.currentTime = 0;
    }
    history.pushState({ lightbox: true }, '');
    ui.lightbox.classList.add('show');
  }
};

window.showChatAlert = ({ message, senderName, senderAvatar, showSender = false, icon = 'info', isHtml = false }) => {
  const msgContent = isHtml ? message : escapeHTML(message);
  let html = `<div style="text-align: center; direction: rtl; font-family: inherit;">
    <div style="margin-bottom: 5px; font-size: inherit;">${msgContent}</div>
  </div>`;

  if (showSender && senderName) {
    let senderHtml = `<div style="display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #f0f0f0;">`;
    if (senderAvatar) {
      senderHtml += `<img src="${escapeHTML(senderAvatar)}" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd;" onerror="this.onerror=null;this.src='/uploads/site/default.png';">`;
    }
    const safeSenderName = isHtml ? senderName : escapeHTML(senderName);
    senderHtml += `<span style="font-weight: bold; font-size: inherit;">${safeSenderName}</span></div>`;
    
    html = senderHtml + html;
  }

  return Swal.fire({
    title: 'تنبيه',
    html: html,
    icon: icon !== 'none' ? icon : undefined,
    confirmButtonText: 'موافق',
    customClass: {
      popup: 'site-font-modal', // Make sure this will inherit site font
      content: 'site-font-modal-content'
    }
  });
};

window.openVideoLightbox = (url) => {
  if (ui.lightbox) {
    const video = document.getElementById('lightbox-video');
    if (video) {
      video.src = url;
      video.style.display = 'block';
      video.play();
    }
    if (ui.lightboxImg) ui.lightboxImg.style.display = 'none';
    history.pushState({ lightbox: true }, '');
    ui.lightbox.classList.add('show');
  }
};

// Lightbox Logic
if (ui.lightbox && ui.lightboxClose) {
  const closeLightbox = () => {
    if (history.state && history.state.lightbox) {
      history.back();
    } else {
      ui.lightbox.classList.remove('show');
      window.stopLightboxVideo();
      if (ui.lightboxImg) {
        ui.lightboxImg.classList.remove('is-tall-image');
        ui.lightboxImg.onload = null;
      }
    }
  };

  ui.lightboxClose.addEventListener('click', (e) => {
    e.stopPropagation();
    closeLightbox();
  });

  ui.lightbox.addEventListener('click', (e) => {
    if (e.target === ui.lightbox) {
      e.stopPropagation();
      closeLightbox();
    }
  });
}

// Sidebar handling
document.addEventListener('click', (e) => {
  if (e.target.closest('.sidebar-action')) {
    if (window.PrivateChatManager && window.PrivateChatManager.isWindowOpen) {
      window.PrivateChatManager.closeChat();
    }
  }
});

// Close sidebar when clicking outside
document.addEventListener('click', (e) => {
  const sidebar = ui.sidebar;
  const target = e.target;
  
  // 1. If click is inside sidebar, do nothing
  if (sidebar && sidebar.contains(target)) return;
  
  // New: If target was removed from DOM (likely a re-render), do nothing
  if (target && !target.isConnected) return;

  // Safety check for closest
  if (!target || typeof target.closest !== 'function') return;

  // New: If click is on a sidebar-action, the file-input, or emoji-picker, do nothing
  if (target.closest('.sidebar-action') || target === ui.fileInput || target.closest('#emoji-picker') || target.closest('.story-add-btn') || target.id === 'direct-story-media-input') return;

  // 2. If click is on a toggle button, do nothing (let the toggle handle it)
  if (target.closest('#users-tab-btn') || 
      target.closest('#private-tab-btn') || 
      target.closest('#rooms-tab-btn') || 
      target.closest('#wall-tab-btn') || 
      target.closest('#games-tab-btn') || 
      target.closest('#settings-btn')) return;

  // 3. If click is on the modal backdrop or inside a modal, do nothing
  if (target.classList.contains('modal-backdrop') || 
      target.closest('.modal') || 
      target.closest('[class*="swal2"]') || 
      target.closest('.classic-alert-overlay') || 
      target.closest('.comment-modal-overlay')) return;

  // 4. If click is on an image in the wall or a media placeholder, do nothing (let the wall handle it)
  if (target.tagName === 'IMG' && (target.closest('.wall-post-content') || target.closest('.wall-post-avatar'))) return;
  if (target.closest('.media-placeholder')) return;

  // 5. If sidebar is open, close it
  if (sidebar && sidebar.classList.contains('open')) {
    closeSidebar();
  }
});

// Global event listener for clicking on images in chat
document.addEventListener('click', (e) => {
  const username = e.target.dataset.username;
  if (username) {
    // Only show profile if clicking on the avatar (message, quoted, or mic)
    if (e.target.classList.contains('message-avatar') || 
        e.target.classList.contains('quoted-avatar') || 
        e.target.classList.contains('mic-user-avatar')) {
      e.preventDefault();

      const isTargetHidden = e.target.getAttribute('data-is-hidden') === 'true' || e.target.dataset.isHidden === 'true';
      const targetRank = parseInt(e.target.getAttribute('data-role-rank') || e.target.dataset.roleRank || '0', 10);
      const myRank = (state.currentUser && (state.currentUser.group && state.currentUser.group.roleRank !== undefined ? state.currentUser.group.roleRank : state.currentUser.roleRank)) || 0;

      if (isTargetHidden && myRank < targetRank) {
        showToast('لا يمكن عرض الملف الشخصي للأعضاء المتخفين ذوي الرتب الأعلى من رتبتك', 'warning');
        return;
      }

      showUserProfile(username);
      return;
    }
  }

  if (e.target.tagName === 'IMG' && 
      (e.target.closest('.message-text') || e.target.closest('.quoted-text') || e.target.closest('.private-msg-text')) &&                
      !e.target.classList.contains('smiley-img') && 
      !e.target.classList.contains('sticker-img')) {
    if (typeof window.openLightbox === 'function') {
      window.openLightbox(e.target.src);
    }
  }
});

window.addEventListener('popstate', (e) => {
  if (ui.lightbox && ui.lightbox.classList.contains('show')) {
    ui.lightbox.classList.remove('show');
    window.stopLightboxVideo();
    if (ui.lightboxImg) {
      ui.lightboxImg.classList.remove('is-tall-image');
      ui.lightboxImg.onload = null;
    }
  }
});

// Initial UI state
updateChatUI();

socket.on('user-addons-updated', ({ userId, username, superIcon, gifts }) => {
  const targetIdStr = String(userId || '');
  const user = state.currentUsers.find(u => String(u.userId ?? u.id ?? '') === targetIdStr || u.username === username);
  if (user) {
    user.superIcon = superIcon;
    user.gifts = gifts || [];
  }
  if (state.currentUser && (String(state.currentUser.userId ?? state.currentUser.id ?? '') === targetIdStr || state.currentUser.username === username)) {
    state.currentUser.superIcon = superIcon;
    state.currentUser.gifts = gifts || [];
    updateChatUI();
  }

  // Refresh sidebar online users list if active
  if (typeof window.renderUsersInSidebar === 'function' && Array.isArray(state.currentUsers)) {
    window.renderUsersInSidebar(state.currentUsers);
  }

  // Update existing messages in DOM using centralized renderer
  const userData = user || { userId, username, superIcon, gifts: gifts || [] };
  
  const selectors = [];
  if (userId) selectors.push(`.user-identity[data-user-id="${CSS.escape(String(userId))}"]`);
  if (username) selectors.push(`.user-identity[data-username="${CSS.escape(username)}"]`);
  
  const identities = document.querySelectorAll(selectors.join(','));
  
  // Clear cache for this superIcon to force re-evaluation if it's updated
  if (superIcon && window.superIconWideCache) {
      delete window.superIconWideCache[superIcon];
      delete window.superIconWideCache[escapeHTML(superIcon)];
  }

  identities.forEach(el => {
      const nameEl = el.querySelector('.user-identity-name');
      const isAnchor = nameEl && nameEl.tagName.toLowerCase() === 'a';
      const nameClasses = nameEl ? nameEl.className.replace('user-identity-name', '').replace('wall-post-username', '').trim() : '';
      const nameStyle = nameEl ? nameEl.style.cssText : '';
      
      // Clean up old state classes to avoid them persisting if the width changes
      const containerClasses = el.className
          .replace('user-identity', '')
          .replace('user-identity-super-wide', '')
          .replace('user-identity-super-normal', '')
          .trim();

      const tag = isAnchor ? 'a' : 'span';
      let onClick = nameEl ? nameEl.getAttribute('onclick') : '';
      if (onClick && onClick.startsWith('event.preventDefault(); ')) {
          onClick = onClick.replace('event.preventDefault(); ', '');
      }
      
      const newHtml = window.renderUserIdentity(userData, {
          nameClasses: isAnchor && !nameClasses.includes('wall-post-username') ? nameClasses + ' wall-post-username' : nameClasses, // Preserve wall post specific class
          nameStyle,
          containerClasses,
          tag,
          onClick
      });
      
      // Use replaceWith for better handling of new elements and triggering loads
      const temp = document.createElement('div');
      temp.innerHTML = newHtml.trim();
      const newNode = temp.firstElementChild;
      if (newNode) {
          el.replaceWith(newNode);
          
          // Trigger check for the new icon
          const img = newNode.querySelector('.user-identity-super');
          if (img) {
              const runCheck = () => window.handleUserIdentitySuperLoad(img, img.getAttribute('src'));
              if (img.complete) {
                  setTimeout(runCheck, 0);
              } else {
                  img.addEventListener('load', runCheck, { once: true });
              }
          }
      }
  });

  // Also update profile modal if it's open for this user
  if (profileUser && profileUser.username === username) {
    const headerTopic = document.getElementById('profile-header-topic');
    if (headerTopic) {
      if (superIcon) {
        headerTopic.style.background = 'transparent';
        headerTopic.style.padding = '0';
      } else {
        const userData = state.currentUsers.find(cu => cu.username === username);
        if (userData && userData.bg) {
          if (userData.bg.startsWith('http') || userData.bg.startsWith('/')) {
            headerTopic.style.background = 'none';
            headerTopic.style.backgroundColor = 'transparent';
            headerTopic.style.backgroundImage = `url('${userData.bg}')`;
            headerTopic.style.backgroundPosition = 'center';
            headerTopic.style.backgroundSize = 'cover';
          } else {
            headerTopic.style.backgroundImage = 'none';
            headerTopic.style.background = userData.bg;
          }
          headerTopic.style.padding = '0 6px';
        } else {
          headerTopic.style.background = 'transparent';
          headerTopic.style.padding = '0';
        }
      }
    }
    const headerBanner = document.getElementById('profile-header-banner');
    if (headerBanner) {
      if (superIcon) {
        headerBanner.src = superIcon;
        headerBanner.classList.remove('d-none');
      } else {
        headerBanner.classList.add('d-none');
      }
    }
  }
});

window.renderPrivateNotificationText = function(rawText) {
  if (!rawText) return '';
  const esc = window.escapeHTML || ((str) => {
    if (!str) return '';
    return str.toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  });
  let safeHtml = esc(rawText);
  if (window.replaceShortcuts) {
    safeHtml = window.replaceShortcuts(safeHtml);
  }
  if (window.replacePlaceholders) {
    safeHtml = window.replacePlaceholders(safeHtml);
  }
  return safeHtml.replace(/\n/g, '<br>');
};

socket.on('private-notification', (data) => {
  if (typeof window.addSessionNotification === 'function') {
    window.addSessionNotification({
      id: data.id,
      type: 'manual_alert',
      senderId: data.senderId,
      senderUsername: data.sender,
      senderDisplayName: data.senderNickname,
      senderAvatar: data.senderAvatar,
      senderBanner: data.senderBanner,
      senderDecoration: data.senderDecoration,
      senderUcol: data.senderUcol,
      senderSuperIcon: data.senderSuperIcon,
      senderGifts: data.senderGifts || [],
      message: data.text,
      createdAt: data.createdAt,
      suppressPopup: true,
      suppressSound: true
    });
  }

  if (window.profileSoundManager) {
    window.profileSoundManager.playAlert();
  } else if (window.soundManager) {
    window.soundManager.playSound('notification');
  }

  const senderUsername = data.sender;
  const senderNickname = data.senderNickname;
  // Use best available display name: nickname (decoration) -> username
  const displayName = (senderNickname && senderNickname.trim() !== '') ? senderNickname : senderUsername;

  // Use the global helper if available, otherwise fallback
  const senderAvatar = typeof window.getAvatarUrl === 'function' 
    ? window.getAvatarUrl({ pic: data.senderAvatar }) 
    : (data.senderAvatar || '/uploads/site/default.png');

  const userIdentityHtml = window.renderUserIdentity({
      username: senderUsername,
      topic: senderNickname,
      superIcon: data.senderSuperIcon,
      ucol: data.senderUcol || '#333'
  }, {
      nameStyle: `color: ${data.senderUcol || '#333'}; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;`,
  });

  const canReply = data.senderId && senderUsername && senderUsername !== 'نظام';

  Swal.fire({
    title: 'تنبيه',
    html: `
      <!-- Header / Title Region -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; direction: rtl; font-family: inherit; font-size: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px; margin-bottom: 10px;">
        <img src="${senderAvatar}" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd; flex-shrink: 0; background: #fff;" onerror="this.src='/uploads/site/default.png'">
        <div style="display: flex; align-items: center; max-width: 200px; overflow: hidden;">
          ${userIdentityHtml}
        </div>
      </div>
      
      <!-- Body / Message Region -->
      <div style="direction: rtl; text-align: center; padding: 5px; font-size: 15.5px; color: #444; line-height: 1.7; min-height: 50px;">
        ${window.renderPrivateNotificationText(data.text)}
      </div>
    `,
    showConfirmButton: true,
    confirmButtonText: canReply ? 'رد على التنبيه' : 'إغلاق',
    showCancelButton: canReply,
    cancelButtonText: 'إغلاق',
    customClass: {
      popup: 'border-0 rounded-4 shadow-lg p-0',
      htmlContainer: 'p-4',
      confirmButton: canReply ? 'btn btn-primary px-4 mt-2 mb-3 rounded-pill shadow-sm mx-1' : 'btn btn-primary px-5 mt-2 mb-3 rounded-pill shadow-sm',
      cancelButton: 'btn btn-secondary px-4 mt-2 mb-3 rounded-pill mx-1'
    },
    buttonsStyling: false,
    width: '380px'
  }).then((result) => {
    if (result.isConfirmed && canReply) {
      const targetUserObj = {
        id: data.senderId,
        username: senderUsername,
        topic: senderNickname,
        pic: data.senderAvatar,
        superIcon: data.senderSuperIcon,
        ucol: data.senderUcol,
        mcol: data.senderMcol,
        allowAlerts: data.senderAllowAlerts !== false
      };
      window.showPrivateNotificationModal(targetUserObj, true);
    }
  });
});


socket.on('new-notification', (notification) => {
  // Classic database notifications are bypassed by user request
});

// Real-time session-based list items (direct_like, wall_like, wall_comment, manual_alert)
window.sessionNotifications = window.sessionNotifications || [];

window.addSessionNotification = function(n) {
  if (!n || !n.id) return;
  
  // Prevent duplicate notifications by ID
  const exists = window.sessionNotifications.some(item => item.id === n.id);
  if (exists) return;

  const msgText = n.message || n.text || '';

  // Format consistent with window.renderNotifications expectation
  const freshNotif = {
    id: n.id,
    type: n.type,
    createdAt: n.createdAt ? new Date(n.createdAt) : new Date(),
    message: msgText,
    text: msgText,
    sender: {
      username: n.senderUsername || 'نظام',
      pic: n.senderAvatar || '/uploads/site/default.png',
      membershipBg: n.type === 'manual_alert' ? null : (n.senderBanner || null),
      bg: n.senderDecoration || n.senderBg || 'transparent',
      ucol: n.senderUcol || null,
      superIcon: n.senderSuperIcon || null,
      gifts: n.senderGifts || [],
      topic: n.senderDisplayName || null
    }
  };

  // Add to the beginning (most recent first)
  window.sessionNotifications.unshift(freshNotif);

  // Enforce memory limit of 30 items
  if (window.sessionNotifications.length > 30) {
    window.sessionNotifications.splice(30);
  }

  // Play sound if not muted inside local storage and not silent
  const isSilent = n.suppressSound === true || n.type === 'manual_alert';
  if (!isSilent && !window.isNotificationSoundsMuted()) {
    if (window.profileSoundManager) {
      window.profileSoundManager.playAlert();
    } else if (window.soundManager) {
      window.soundManager.playSound('notification');
    }
  }

  // Refresh view if active
  if (currentSettingsView === 'notifications') {
    window.renderNotifications();
  }

  // Update UI notifications badge count if elements exist
  const badge = document.getElementById('sidebar-notifications-badge');
  if (badge) {
    const unreadCount = window.sessionNotifications.filter(x => !x.read).length;
    if (unreadCount > 0) {
      badge.innerText = unreadCount;
      badge.classList.remove('d-none');
    } else {
      badge.classList.add('d-none');
    }
  }

  // If we should show a popup
  const shouldShowPopup = n.type !== 'manual_alert' && n.suppressPopup !== true;
  if (shouldShowPopup && window.Swal) {
    const senderDisplayName = n.senderDisplayName || n.senderUsername || 'نظام';
    const senderAvatarStr = escapeHTML(n.senderAvatar || '/uploads/site/default.png');
    const actionText = escapeHTML(n.message || n.text || '');

    const userIdentityHtml = window.renderUserIdentity ? window.renderUserIdentity({
      username: n.senderUsername || 'نظام',
      pic: n.senderAvatar || '/uploads/site/default.png',
      bg: n.senderDecoration || n.senderBg || 'transparent',
      ucol: n.senderUcol || '#333',
      superIcon: n.senderSuperIcon || null,
      gifts: n.senderGifts || [],
      topic: n.senderDisplayName || null
    }, {
      nameStyle: `color: ${n.senderUcol || '#333'}; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;`,
    }) : `<strong style="color: ${n.senderUcol || '#333'}; font-weight: bold;">${escapeHTML(senderDisplayName)}</strong>`;

    window.Swal.fire({
      title: 'تنبيه جديد',
      html: `
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px; direction: rtl; font-family: inherit; font-size: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px; margin-bottom: 10px;">
          <img src="${senderAvatarStr}" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd; flex-shrink: 0; background: #fff;" onerror="this.src='/uploads/site/default.png'">
          <div style="display: flex; align-items: center; max-width: 200px; overflow: hidden;">
            ${userIdentityHtml}
          </div>
        </div>
        <div style="direction: rtl; text-align: center; padding: 5px; font-size: 15.5px; color: #444; line-height: 1.7; min-height: 50px;">
          ${actionText.replace(/\n/g, '<br>')}
        </div>
      `,
      showConfirmButton: true,
      confirmButtonText: 'إغلاق',
      customClass: {
        popup: 'border-0 rounded-4 shadow-lg p-0',
        htmlContainer: 'p-4',
        confirmButton: 'btn btn-primary px-5 mt-2 mb-3 rounded-pill shadow-sm'
      },
      buttonsStyling: false,
      width: '380px'
    });
  }
};

socket.on('session-notification', (n) => {
  window.addSessionNotification(n);
});

// RAM pending offline alert delivery logic (Swal chain)
socket.on('offline-pending-alert', (data) => {
  if (typeof window.addSessionNotification === 'function') {
    window.addSessionNotification({
      id: data.id,
      type: 'manual_alert',
      senderId: data.senderId,
      senderUsername: data.senderUsername,
      senderDisplayName: data.senderDisplayName,
      senderAvatar: data.senderAvatar,
      senderBanner: data.senderBanner,
      senderDecoration: data.senderDecoration,
      senderUcol: data.senderUcol,
      senderSuperIcon: data.senderSuperIcon,
      senderGifts: data.senderGifts || [],
      message: data.message,
      createdAt: data.createdAt,
      suppressPopup: true,
      suppressSound: true
    });
  }

  if (!window.isNotificationSoundsMuted()) {
    if (window.profileSoundManager) {
      window.profileSoundManager.playAlert();
    } else if (window.soundManager) {
      window.soundManager.playSound('notification');
    }
  }

  const senderUsername = data.senderUsername;
  const displayName = data.senderDisplayName || senderUsername;
  const senderAvatar = data.senderAvatar || '/uploads/site/default.png';

  const userIdentityHtml = window.renderUserIdentity ? window.renderUserIdentity({
      username: senderUsername,
      topic: displayName,
      superIcon: data.senderSuperIcon,
      ucol: data.senderUcol || '#333'
  }, {
      nameStyle: `color: ${data.senderUcol || '#333'}; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;`,
  }) : `<strong>${escapeHTML(displayName)}</strong>`;

  const canReply = data.senderId && senderUsername && senderUsername !== 'نظام';

  Swal.fire({
    title: 'تنبيه معلق (أثناء غيابك)',
    html: `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; direction: rtl; font-family: inherit; font-size: 15px; border-bottom: 1px solid #f0f0f0; padding-bottom: 15px; margin-bottom: 10px;">
        <img src="${escapeHTML(senderAvatar)}" style="width: 25px; height: 25px; border-radius: 50%; object-fit: cover; border: 1px solid #ddd; flex-shrink: 0; background: #fff;" onerror="this.src='/uploads/site/default.png'">
        <div style="display: flex; align-items: center; max-width: 200px; overflow: hidden;">
          ${userIdentityHtml}
        </div>
      </div>
      <div style="direction: rtl; text-align: center; padding: 5px; font-size: 15.5px; color: #444; line-height: 1.7; min-height: 50px;">
        ${window.renderPrivateNotificationText(data.message)}
      </div>
    `,
    showConfirmButton: true,
    confirmButtonText: canReply ? 'رد على التنبيه' : 'إغلاق',
    showCancelButton: canReply,
    cancelButtonText: 'إغلاق',
    customClass: {
      popup: 'border-0 rounded-4 shadow-lg p-0',
      htmlContainer: 'p-4',
      confirmButton: canReply ? 'btn btn-primary px-4 mt-2 mb-3 rounded-pill shadow-sm mx-1' : 'btn btn-primary px-5 mt-2 mb-3 rounded-pill shadow-sm',
      cancelButton: 'btn btn-secondary px-4 mt-2 mb-3 rounded-pill mx-1'
    },
    buttonsStyling: false,
    width: '380px'
  }).then((result) => {
    // Confirm delivery so server can release it from RAM and send the next one
    socket.emit('offline-pending-alert-shown', { alertId: data.id });

    if (result.isConfirmed && canReply) {
      const targetUserObj = {
        id: data.senderId,
        username: senderUsername,
        topic: displayName,
        pic: data.senderAvatar,
        superIcon: data.senderSuperIcon,
        ucol: data.senderUcol,
        mcol: data.senderMcol,
        allowAlerts: data.senderAllowAlerts !== false
      };
      if (window.showPrivateNotificationModal) {
         window.showPrivateNotificationModal(targetUserObj, true);
      }
    }
  });
});

function showStoryInstantAlert(data) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000000;
  `;
  
  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #e9e9e9;
    border: 1px solid #000;
    width: 320px;
    box-shadow: 0 5px 25px rgba(0,0,0,0.4);
    border-radius: 2px;
    position: relative;
    padding: 20px 10px;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    background: #2c3e50;
    color: #fff;
    padding: 6px 30px;
    text-align: center;
    font-weight: bold;
    border-radius: 5px;
    border: 1px solid #111;
    position: absolute;
    top: -15px;
    left: 50%;
    transform: translateX(-50%);
    font-size: 14px;
    box-shadow: 0 2px 5px rgba(0,0,0,0.3);
    min-width: 80px;
    white-space: nowrap;
  `;
  header.innerText = 'تنبيه';

  const body = document.createElement('div');
  body.style.cssText = `
    padding: 25px 10px 15px;
    text-align: center;
    color: #000;
    font-size: 13px;
    font-weight: bold;
    direction: rtl;
    line-height: 1.4;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: inherit;
  `;

  const img = document.createElement('img');
  img.src = data.fromPic || '/img/default-avatar.png';
  img.style.cssText = `
    width: 25px;
    height: 25px;
    border-radius: 2px;
    border: 1px solid #999;
    object-fit: cover;
    flex-shrink: 0;
  `;

  // Construct styled text
  const contentSpan = document.createElement('span');
  contentSpan.style.display = 'flex';
  contentSpan.style.alignItems = 'center';
  contentSpan.style.gap = '4px';
  contentSpan.style.flexWrap = 'wrap';
  contentSpan.style.justifyContent = 'center';

  const prefix = document.createElement('span');
  prefix.innerText = 'قام ';
  contentSpan.appendChild(prefix);

  if (data.fromSuperIcon) {
    const sIcon = document.createElement('img');
    sIcon.src = data.fromSuperIcon;
    sIcon.style.width = 'auto';
    sIcon.style.height = '16px';
    contentSpan.appendChild(sIcon);
  }

  const nameSpan = document.createElement('span');
  nameSpan.innerText = data.fromName;
  if (data.fromColor) {
    nameSpan.style.color = data.fromColor;
  }
  contentSpan.appendChild(nameSpan);

  const suffix = document.createElement('span');
  suffix.innerText = data.type === 'story_like' ? ' بالإعجاب بالستوري الخاص بك' : ' بالتعليق على الستوري الخاص بك';
  contentSpan.appendChild(suffix);

  body.appendChild(img);
  body.appendChild(contentSpan);

  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = `
    text-align: center;
    padding-top: 10px;
  `;

  const btn = document.createElement('button');
  btn.style.cssText = `
    background: #2c3e50;
    color: #fff;
    border: 1px solid #111;
    padding: 5px 25px;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 14px;
    min-width: 90px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  `;
  btn.innerText = 'موافق';
  btn.onclick = () => {
    document.body.removeChild(overlay);
  };

  btnContainer.appendChild(btn);
  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(btnContainer);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}

socket.on('story-instant-alert', (data) => {
  showStoryInstantAlert(data);
  if (!window.isNotificationSoundsMuted()) {
    if (window.profileSoundManager) {
      window.profileSoundManager.playAlert();
    } else if (window.soundManager) {
      window.soundManager.playSound('notification');
    }
  }
  
  // If notifications list is open, refresh it
  if (ui.sidebarTitle && ui.sidebarTitle.innerText === 'الإشعارات') {
    renderNotifications();
  }
});

// Handle Membership Asset Uploads
document.addEventListener('change', (e) => {
  if (e.target.id === 'membership-bg-upload' && e.target.files.length > 0) {
    window.uploadMembershipAsset('background', e.target.files[0]);
    e.target.value = '';
  }
  if (e.target.id === 'membership-frame-upload' && e.target.files.length > 0) {
    window.uploadMembershipAsset('frame', e.target.files[0]);
    e.target.value = '';
  }
});

// News Ticker System
async function initNewsTicker() {
  try {
    const res = await fetch('/api/settings/news-ticker');
    if (res.ok) {
      const data = await res.json();
      window.updateNewsTickerUI(data);
    }
  } catch (err) {
    console.error('Failed to init news ticker:', err);
  }
}

window.updateNewsTickerUI = function(data) {
  const bar = document.getElementById('news-ticker-bar');
  const textElem = document.getElementById('news-ticker-text');
  const content = document.getElementById('news-ticker-content');
  
  if (!bar || !textElem || !content) return;
  
  if (data.enabled && data.text && data.text.trim() !== '') {
    bar.classList.remove('d-none');
    bar.classList.add('d-flex');
    
    let bgColor = data.bgColor || '#ff0000';
    let textColor = data.textColor || '#ffffff';
    
    if (window.domainConfig) {
      if (window.domainConfig.tickerBgColor && typeof window.domainConfig.tickerBgColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(window.domainConfig.tickerBgColor)) {
        bgColor = window.domainConfig.tickerBgColor;
      }
      if (window.domainConfig.tickerTextColor && typeof window.domainConfig.tickerTextColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(window.domainConfig.tickerTextColor)) {
        textColor = window.domainConfig.tickerTextColor;
      }
    }
    
    bar.style.backgroundColor = bgColor;
    content.style.color = textColor;
    textElem.innerText = data.text;
    
    // Update animation speed
    const speed = data.speed || 25;
    content.style.animationDuration = `${speed}s`;
  } else {
    bar.classList.add('d-none');
    bar.classList.remove('d-flex');
  }
};

socket.on('news_ticker_updated', (data) => {
  window.updateNewsTickerUI(data);
});

// Initialize news ticker
initNewsTicker();
initBotMessaging();

// Camera request delegation
document.addEventListener('click', async (e) => {
  if (!e.target || typeof e.target.closest !== 'function') return;

  // Handle Top Live Broadcast Button click
  const topLiveBtn = e.target.closest('#top-live-broadcast-btn');
  if (topLiveBtn) {
    e.stopPropagation();
    e.preventDefault();
    const manager = await window.ensureLiveBroadcastLoaded();
    if (manager) {
      if (manager.isBroadcasting) {
        manager.stopBroadcast();
      } else {
        manager.openStartModal();
      }
    }
    return;
  }

  // Handle Profile Battle Button click
  const btnBattle = e.target.closest('#btn-profile-battle');
  if (btnBattle) {
    e.stopPropagation();
    e.preventDefault();
    if (typeof window.openBattleModeSelectionModal !== 'function') {
      await window.ensureBattleLoaded();
    }
    if (typeof window.openBattleModeSelectionModal === 'function') {
      const target = (typeof window.getCurrentProfileUser === 'function' ? window.getCurrentProfileUser() : null) || window.profileUser;
      if (!target) {
        Swal.fire({
          title: 'خطأ',
          text: 'لم يتم العثور على معلومات العضو.',
          icon: 'error',
          confirmButtonText: 'حسناً'
        });
        return;
      }

      const room = window.state ? window.state.currentRoomId : 0;
      if (!room || Number(room) <= 0) {
        Swal.fire({
          title: 'تنبيه',
          text: 'يجب أن تكون متواجداً بنشاط داخل غرفة للتحدي.',
          icon: 'warning',
          confirmButtonText: 'حسناً'
        });
        return;
      }

      window.openBattleModeSelectionModal(target, Number(room));
    }
    return;
  }

  // Handle Live Broadcast Button click
  const liveBroadcastBtn = e.target.closest('.js-live-broadcast-btn');
  if (liveBroadcastBtn) {
    e.stopPropagation();
    const userId = parseInt(liveBroadcastBtn.getAttribute('data-user-id'), 10);
    if (!userId || isNaN(userId)) return;

    const manager = await window.ensureLiveBroadcastLoaded();
    if (manager && typeof manager.watchBroadcast === 'function') {
      manager.watchBroadcast(userId);
    }
    return;
  }

  // Handle Camera Request Button
  const cameraBtn = e.target.closest('.js-camera-request-btn');
  if (cameraBtn) {
    e.stopPropagation();
    
    const currentRoom = window.currentRoom || window.currentRoomData || (window.roomsData && state.currentRoomId ? window.roomsData[state.currentRoomId] : null);
    if (currentRoom && currentRoom.allowCamera !== true) {
      window.showToast('الكاميرا غير مفعلة في هذه الغرفة', 'error');
      return;
    }

    const userId = parseInt(cameraBtn.getAttribute('data-user-id'), 10);
    if (!userId || isNaN(userId)) return;

    // Search for user in state.currentUsers or state.rooms
    let userObj = null;
    if (state.currentUsers) {
      userObj = state.currentUsers.find(u => (u.userId === userId || u.id === userId));
    }
    
    // If user object found, pass it to requestView
    if (userObj) {
      const cameraManager = await window.ensureCameraLoaded();
      if (cameraManager && typeof cameraManager.requestView === 'function') {
        cameraManager.requestView(userObj);
      }
    } else {
      console.warn('User not found in memory to request camera view');
      window.showToast('تعذر العثور على بيانات المستخدم', 'error');
    }
    return;
  }

  // Handle User Profile List Item Button
  const profileBtn = e.target.closest('.js-user-profile-btn');
  if (profileBtn) {
    e.stopPropagation();
    const username = profileBtn.getAttribute('data-username');
    if (username && typeof window.showUserProfile === 'function') {
      const isTargetHidden = profileBtn.getAttribute('data-is-hidden') === 'true' || profileBtn.dataset.isHidden === 'true';
      const targetRank = parseInt(profileBtn.getAttribute('data-role-rank') || profileBtn.dataset.roleRank || '0', 10);
      const myRank = (state.currentUser && (state.currentUser.group && state.currentUser.group.roleRank !== undefined ? state.currentUser.group.roleRank : state.currentUser.roleRank)) || 0;

      if (isTargetHidden && myRank < targetRank) {
        showToast('لا يمكن عرض الملف الشخصي للأعضاء المتخفين ذوي الرتب الأعلى من رتبتك', 'warning');
        return;
      }
      window.showUserProfile(username);
    }
    return;
  }
});

// Profile Image Lightbox
function openProfileImageLightbox(imageSrc) {
  if (!imageSrc) return;
  if (!window.featuresSettings || !window.featuresSettings.profileLightboxEnabled) return;

  const lightbox = document.getElementById('profileImageLightbox');
  const img = document.getElementById('profileLightboxImg');

  if (!lightbox || !img) return;

  img.src = imageSrc;
  lightbox.classList.add('active');
}

function closeProfileImageLightbox() {
  const lightbox = document.getElementById('profileImageLightbox');
  const img = document.getElementById('profileLightboxImg');

  if (!lightbox || !img) return;

  lightbox.classList.remove('active');
  img.src = '';
}

document.addEventListener('click', function (e) {
  if (!e.target || typeof e.target.closest !== 'function') return;
  const profileImg = e.target.closest('#profile-avatar-modal, .profile-header-avatar');

  if (profileImg) {
    e.preventDefault();
    e.stopPropagation();

    const imageSrc = profileImg.dataset.fullSrc || profileImg.src;
    openProfileImageLightbox(imageSrc);
    return;
  }

  if (
    e.target.id === 'profileImageLightbox' ||
    e.target.closest('.profile-lightbox-close')
  ) {
    closeProfileImageLightbox();
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    closeProfileImageLightbox();
  }
});

// Copy and Right-Click Disable Logic
function isInsideChat(target) {
  if (!target || typeof target.closest !== 'function') return false;
  // Use the main app container that wraps chat components (excluding admin CP)
  return !!target.closest('#chat-shell') || !!target.closest('#chat-ui') || !!target.closest('#right-sidebar') || !!target.closest('.modal') || !!target.closest('.layout-container');
}

function isEditable(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return !!target.closest('input, textarea, [contenteditable="true"]');
}

document.addEventListener('contextmenu', function (e) {
  if (!window.featuresSettings?.disableRightClick) return;
  // Allow right click if it's an editable field or if user is an admin
  if (isEditable(e.target) || hasPermission('canAccessAdminPanel')) return;

  e.preventDefault();
});

function handleCopyBlock(e) {
  if (!window.featuresSettings?.disableCopy) return;
  // Allow copy/cut if it's an editable field or if user is an admin
  if (isEditable(e.target) || hasPermission('canAccessAdminPanel')) return;

  e.preventDefault();
}

document.addEventListener('copy', handleCopyBlock);
document.addEventListener('cut', handleCopyBlock);
document.addEventListener('paste', handleCopyBlock);

// Selectstart happens continuously as user drags to text. We will block it silently, no toast to prevent spam.
document.addEventListener('selectstart', function (e) {
  if (!window.featuresSettings?.disableCopy) return;
  if (isEditable(e.target) || hasPermission('canAccessAdminPanel')) return;

  e.preventDefault();
});

// Special Entry Notification Listener
socket.on('special-entry', (data) => {
    showSpecialEntryToast(data);
    playSpecialEntrySound(data.sound);
});

function showSpecialEntryToast(data) {
    const toast = document.createElement('div');
    toast.className = `special-entry-toast ${data.className}`;

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'entry-content-wrapper';

    const avatarContainer = document.createElement('div');
    avatarContainer.className = 'entry-avatar-container';

    const img = document.createElement('img');
    img.src = data.avatar;
    img.className = 'entry-avatar';
    img.onerror = () => { img.src = '/images/default-avatar.png'; }; // Fallback
    avatarContainer.appendChild(img);

    const textInfo = document.createElement('div');
    textInfo.className = 'entry-text-info';

    const entryUser = document.createElement('div');
    entryUser.className = 'entry-username';

    if (data.user && window.renderUserIdentity) {
        const identityHtml = window.renderUserIdentity(data.user, {
            tag: 'span'
        });

        entryUser.innerHTML = identityHtml;

        const identityElement = entryUser.querySelector('.user-identity');
        if (identityElement) {
            identityElement.classList.add('entry-identity');
        }
    } else {
        entryUser.textContent = data.name || 'مستخدم';
    }

    textInfo.appendChild(entryUser);

    contentWrapper.appendChild(avatarContainer);
    contentWrapper.appendChild(textInfo);
    toast.appendChild(contentWrapper);

    const voiceTopBar = document.querySelector('.voice-top-bar');
    if (voiceTopBar) {
        const voiceBarStyle = window.getComputedStyle(voiceTopBar);
        const voiceBarRect = voiceTopBar.getBoundingClientRect();

        const isVoiceBarVisible =
            !voiceTopBar.classList.contains('d-none') &&
            voiceBarStyle.display !== 'none' &&
            voiceBarStyle.visibility !== 'hidden' &&
            voiceBarRect.height > 0 &&
            voiceBarRect.bottom > 0;

        if (isVoiceBarVisible) {
            const safeGap = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--special-entry-mics-gap')) || 8;
            const toastTop = Math.ceil(voiceBarRect.bottom + safeGap);
            toast.style.top = `${toastTop}px`;
        }
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5500); // Remove after animation
}

function playSpecialEntrySound(soundUrl) {
    if (!window.isChatAudioAllowed()) return;
    if (!soundUrl) return;
    try {
        const audio = new Audio(soundUrl);
        audio.loop = false;
        audio.play().catch(e => {
            // Ignore
        });
    } catch (e) {
        // Ignore
    }
}


// ==========================================
// ZAJEL FEATURE IMPLEMENTATION (CLIENT)
// ==========================================
let activeZajelMessages = [];

window.pendingZajelModeration = window.pendingZajelModeration || new Map();
window.currentZajelModerationAlertId = null;

window.updateZajelModerationUI = function() {
  if (currentSettingsView === 'notifications') {
    if (typeof window.renderNotifications === 'function') {
      window.renderNotifications(true);
    }
  } else if (currentSettingsView === 'addons') {
    if (typeof window.renderAddons === 'function') {
      window.renderAddons();
    }
  }
};

window.showZajelModerationAlert = function(req) {
  if (!req || !req.id) return;
  // Prevent showing more than one alert at the same time
  const overlay = document.getElementById('classic-alert-overlay');
  if (overlay && !overlay.classList.contains('d-none')) {
    return;
  }

  window.currentZajelModerationAlertId = req.id;

  const htmlContent = `
    <div style="direction: rtl; text-align: center; padding: 5px 0;">
      <div style="font-weight: bold; color: #1a252f; font-size: 15px; margin-bottom: 8px;">
        <i class="fas fa-user text-primary me-1"></i> ${escapeHTML(req.username)}
      </div>
      <div style="background: #fff; border: 1px solid #ccc; border-radius: 5px; padding: 10px; font-size: 13px; color: #333; word-break: break-word; text-align: right; max-height: 120px; overflow-y: auto;">
        ${escapeHTML(req.message)}
      </div>
    </div>
  `;

  if (window.Swal && typeof window.Swal.fire === 'function') {
    Swal.fire({
      title: 'طلب مراجعة رسالة زاجل',
      html: htmlContent,
      showConfirmButton: true,
      confirmButtonText: 'قبول ونشر',
      showDenyButton: true,
      denyButtonText: 'رفض',
      showCancelButton: true,
      cancelButtonText: 'لاحقاً',
      willClose: () => {
        if (window.currentZajelModerationAlertId === req.id) {
          window.currentZajelModerationAlertId = null;
        }
      }
    }).then((result) => {
      if (result.isConfirmed) {
        window.moderateZajelRequest(req.id, 'approve');
      } else if (result.isDenied) {
        window.moderateZajelRequest(req.id, 'reject');
      }
    });
  }
};

window.moderateZajelRequest = function(id, action) {
  if (!socket) return;
  socket.emit('zajel:moderate', { id: Number(id), action }, (response) => {
    if (response && response.success) {
      if (window.pendingZajelModeration) {
        window.pendingZajelModeration.delete(Number(id));
      }
      if (window.currentZajelModerationAlertId === Number(id)) {
        if (typeof window.closeClassicAlert === 'function') {
          window.closeClassicAlert();
        }
        window.currentZajelModerationAlertId = null;
      }
      window.updateZajelModerationUI();
      if (window.showToast) {
        window.showToast(response.message || 'تم اتخاذ الإجراء بنجاح');
      }
    } else {
      const msg = (response && response.message) ? response.message : 'حدث خطأ أثناء معالجة الطلب';
      if (window.showToast) window.showToast(msg);
      if (msg.includes('بالفعل') || msg.includes('غير موجودة')) {
        if (window.pendingZajelModeration) {
          window.pendingZajelModeration.delete(Number(id));
        }
        if (window.currentZajelModerationAlertId === Number(id)) {
          if (typeof window.closeClassicAlert === 'function') {
            window.closeClassicAlert();
          }
          window.currentZajelModerationAlertId = null;
        }
        window.updateZajelModerationUI();
      }
    }
  });
};

socket.on('zajel:moderation-request', (req) => {
  if (!req || !req.id) return;
  if (!window.pendingZajelModeration) window.pendingZajelModeration = new Map();
  window.pendingZajelModeration.set(req.id, req);
  window.updateZajelModerationUI();
  window.showZajelModerationAlert(req);
});

socket.on('zajel:moderation-resolved', (data) => {
  if (!data || !data.id) return;
  if (window.pendingZajelModeration) {
    window.pendingZajelModeration.delete(data.id);
  }
  if (window.currentZajelModerationAlertId === data.id) {
    if (typeof window.closeClassicAlert === 'function') {
      window.closeClassicAlert();
    }
    window.currentZajelModerationAlertId = null;
  }
  window.updateZajelModerationUI();
});

socket.on('zajel:moderation:pending-list', (list) => {
  if (!window.pendingZajelModeration) window.pendingZajelModeration = new Map();
  else window.pendingZajelModeration.clear();
  if (Array.isArray(list)) {
    list.forEach(item => {
      window.pendingZajelModeration.set(item.id, item);
    });
  }
  window.updateZajelModerationUI();
  if (window.pendingZajelModeration.size > 0) {
    const firstReq = window.pendingZajelModeration.values().next().value;
    if (firstReq && !window.currentZajelModerationAlertId) {
      window.showZajelModerationAlert(firstReq);
    }
  }
});



socket.on('zajel:list', (payload) => {
  // Server sends { messages: [...] }; tolerate a bare array as well.
  activeZajelMessages = Array.isArray(payload) ? payload : (payload && Array.isArray(payload.messages) ? payload.messages : []);
  renderZajelTicker();
});

socket.on('zajel:new', (msg) => {
  if (msg && msg.id && !activeZajelMessages.some(m => m.id === msg.id)) {
    activeZajelMessages.push(msg);
    if (activeZajelMessages.length > 30) {
      activeZajelMessages.shift();
    }
    renderZajelTicker();
  }
});

socket.on('zajel:delete', ({ id }) => {
  activeZajelMessages = activeZajelMessages.filter(m => m.id !== id);
  renderZajelTicker();
});

function updateZajelMarqueeMotion() {
  const container = document.getElementById('zajel-container');
  const textFlow = document.getElementById('zajel-text-flow');

  if (!container || !textFlow) return;

  requestAnimationFrame(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;

    const containerWidth = container.clientWidth || 300;
    const flowWidth = textFlow.scrollWidth || 300;

    textFlow.style.setProperty('--zajel-start-x', `-${flowWidth}px`);
    textFlow.style.setProperty('--zajel-end-x', `${containerWidth}px`);

    const distance = flowWidth + containerWidth;

    // السرعة: كلما قل الرقم أصبحت الحركة أبطأ
    const speed = isMobile ? 25 : 40;

    const minDuration = isMobile ? 22 : 18;
    const maxDuration = isMobile ? 90 : 120;

    const duration = Math.max(
      minDuration,
      Math.min(maxDuration, distance / speed)
    );

    textFlow.style.animation = 'none';
    void textFlow.offsetWidth; // force reflow
    textFlow.style.animation = `marquee-zajel ${duration}s linear infinite`;
  });
}

function setupZajelResizeObserver() {
  const container = document.getElementById('zajel-container');
  if (!container || container.dataset.zajelResizeObserverAttached === '1') return;

  container.dataset.zajelResizeObserverAttached = '1';

  const observer = new ResizeObserver(() => {
    updateZajelMarqueeMotion();
  });

  observer.observe(container);
}

if (!window.__zajelEventsRegistered) {
  window.__zajelEventsRegistered = true;
  window.addEventListener('resize', updateZajelMarqueeMotion);
  window.addEventListener('orientationchange', updateZajelMarqueeMotion);
}

function renderZajelTicker() {
  const zajelBar = document.getElementById('zajel-bar');
  const addBtn = document.getElementById('zajel-add-btn');
  const textFlow = document.getElementById('zajel-text-flow');

  if (!zajelBar || !textFlow) return;

  // If Zajel is disabled globally in Settings, hide the entire bar. Guard with !window.featuresSettings to prevent race condition before settings load.
  if (!window.featuresSettings || window.featuresSettings.zajelEnabled === false) {
    zajelBar.classList.add('d-none');
    return;
  }

  // Ensure the bar itself is visible (remove d-none) when enabled
  zajelBar.classList.remove('d-none');

  const hasSendPerm = hasPermission('sendZajelMessage');

  // Verify only the addition button depends on permission
  if (addBtn) {
    if (hasSendPerm) {
      addBtn.classList.remove('d-none');
    } else {
      addBtn.classList.add('d-none');
    }
  }

  const siteLogoEl = document.getElementById('site-logo');
  let logoUrl = (siteLogoEl && siteLogoEl.tagName === 'IMG' && siteLogoEl.src) || (window.siteAppearance && window.siteAppearance.logo) || (window.domainConfig && window.domainConfig.faviconUrl) || '';
  const logoImgHtml = logoUrl ? `<img src="${logoUrl}" class="zajel-logo-sep">` : `<span class="badge bg-secondary text-light ms-1 me-1" style="font-size: 10px; vertical-align: middle;">Logo</span>`;

  if (!activeZajelMessages || activeZajelMessages.length === 0) {
    // If no messages, show placeholder text as requested
    textFlow.innerHTML = `${logoImgHtml}<span class="zajel-msg-item" dir="rtl"><i class="fas fa-bullhorn ms-1"></i> لا توجد رسائل زاجل معتمدة حالياً...</span>${logoImgHtml}`;
    updateZajelMarqueeMotion();
    setupZajelResizeObserver();
    return;
  }

  // Remove username completely from the marquee; display only the message
  const flowHtml = activeZajelMessages.map(msg => {
    return `<span class="zajel-msg-item" dir="rtl">${escapeHTML(msg.message)}</span>`;
  }).join(logoImgHtml);

  textFlow.innerHTML = `${logoImgHtml}${flowHtml}${logoImgHtml}`;

  updateZajelMarqueeMotion();
  setupZajelResizeObserver();
}



window.openZajelModal = function() {
  const modalElement = document.getElementById('zajelSubmitModal');
  if (modalElement) {
    let modal = bootstrap.Modal.getInstance(modalElement);
    if (!modal) {
      modal = new bootstrap.Modal(modalElement);
    }
    const input = document.getElementById('zajel-msg-input');
    if (input) {
      input.value = '';
      const charCount = document.getElementById('zajel-char-count');
      if (charCount) charCount.innerText = 'المتبقي: 150 حرفاً';
      
      input.oninput = function() {
        const left = 150 - input.value.length;
        if (charCount) charCount.innerText = `المتبقي: ${left} حرفاً`;
      };
    }
    const errDiv = document.getElementById('zajel-submit-error');
    if (errDiv) {
      errDiv.innerText = '';
      errDiv.classList.add('d-none');
    }
    
    modal.show();
  }
};

window.submitZajelMsg = async function() {
  const input = document.getElementById('zajel-msg-input');
  const errDiv = document.getElementById('zajel-submit-error');
  if (!input) return;

  if (typeof hasPermission === 'function' && !hasPermission('sendZajelMessage')) {
    if (errDiv) {
      errDiv.innerText = 'عذراً، ليس لديك صلاحية إرسال رسائل زاجل.';
      errDiv.classList.remove('d-none');
    } else {
      alert('عذراً، ليس لديك صلاحية إرسال رسائل زاجل.');
    }
    return;
  }

  const text = input.value.trim();
  if (!text || text.length === 0) {
    if (errDiv) {
      errDiv.innerText = 'عذراً، لا يمكن إرسال رسالة فارغة.';
      errDiv.classList.remove('d-none');
    } else {
      alert('عذراً، لا يمكن إرسال رسالة فارغة.');
    }
    return;
  }

  if (text.length > 150) {
    if (errDiv) {
      errDiv.innerText = 'عذراً، يجب ألا تتجاوز الرسالة 150 حرفاً.';
      errDiv.classList.remove('d-none');
    } else {
      alert('عذراً، يجب ألا تتجاوز الرسالة 150 حرفاً.');
    }
    return;
  }

  if (errDiv) {
    errDiv.innerText = '';
    errDiv.classList.add('d-none');
  }

  socket.emit('zajel:send', { message: text });

  const modalElement = document.getElementById('zajelSubmitModal');
  if (modalElement) {
    const modal = bootstrap.Modal.getInstance(modalElement);
    if (modal) modal.hide();
  }
};

window.enforceAdminPasswordPolicy = function() {
  // Completely disabled as requested by user. Admins are no longer forced to change their passwords.
};

(function () {
  if (window.__mentionShakeInstalled) return;
  window.__mentionShakeInstalled = true;

  const style = document.createElement('style');
  style.innerHTML = `
    @keyframes messageShake {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-4px); }
      40% { transform: translateX(4px); }
      60% { transform: translateX(-2px); }
      80% { transform: translateX(2px); }
    }

    .mention-shake-effect {
      animation: messageShake 0.5s ease-in-out !important;
      background-color: rgba(212, 176, 165, 0.15) !important;
      border-radius: 8px;
      transition: background-color 0.3s ease;
    }
  `;
  document.head.appendChild(style);

  function triggerMentionShake(mentionEl) {
    const row = mentionEl.closest('.message-row');
    if (!row || row.dataset.hasMentionShaked === 'true') return;

    row.dataset.hasMentionShaked = 'true';

    row.classList.remove('mention-shake-effect');
    void row.offsetWidth;
    row.classList.add('mention-shake-effect');

    setTimeout(() => {
      row.classList.remove('mention-shake-effect');
    }, 600);
  }

  function scanMentionNode(node) {
    if (!node || node.nodeType !== 1) return;

    if (node.classList && node.classList.contains('mention-highlight')) {
      triggerMentionShake(node);
    }

    if (node.querySelectorAll) {
      node.querySelectorAll('.mention-highlight').forEach(triggerMentionShake);
    }
  }

  function initMentionShakeObserver() {
    const target = document.getElementById('messages-container') || document.body;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(scanMentionNode);
        }

        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          scanMentionNode(mutation.target);
        }
      });
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });

    scanMentionNode(target);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMentionShakeObserver);
  } else {
    initMentionShakeObserver();
  }
})();

(function() {
    if (window.__darkModeInstalled) return;
    window.__darkModeInstalled = true;

    const savedDarkMode = localStorage.getItem('darkModeActive') === 'true';
    if (savedDarkMode) {
        document.body.classList.add('dark-mode-active');
    } else {
        document.body.classList.remove('dark-mode-active');
    }

    function updateButtonUI(isDark) {
        const btn = document.getElementById('toggle-dark-mode-btn');
        if (!btn) return;

        const expectedHTML = isDark 
            ? '<i class="fas fa-sun btn-icon-left"></i><span>إيقاف الوضع الليلي</span>' 
            : '<i class="fas fa-moon btn-icon-left"></i><span>الوضع الليلي</span>';
            
        if (btn.innerHTML !== expectedHTML) {
            btn.innerHTML = expectedHTML;
            btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        }
    }

    function enableDarkMode() {
        document.body.classList.add('dark-mode-active');
        localStorage.setItem('darkModeActive', 'true');
        updateButtonUI(true);
    }

    function disableDarkMode() {
        document.body.classList.remove('dark-mode-active');
        localStorage.setItem('darkModeActive', 'false');
        updateButtonUI(false);
    }

    function toggleDarkMode() {
        if (document.body.classList.contains('dark-mode-active')) {
            disableDarkMode();
        } else {
            enableDarkMode();
        }
    }

    document.addEventListener('click', function(e) {
        const btn = e.target.closest('#toggle-dark-mode-btn');
        if (btn) {
            toggleDarkMode();
            return;
        }

        if (e.target.closest('#settings-logout-btn')) {
            disableDarkMode();
        }
    });

    function syncButtonState() {
        const btn = document.getElementById('toggle-dark-mode-btn');
        if (!btn) return;
        updateButtonUI(document.body.classList.contains('dark-mode-active'));
    }

    const observer = new MutationObserver(syncButtonState);

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Run once initially
    syncButtonState();

})();

