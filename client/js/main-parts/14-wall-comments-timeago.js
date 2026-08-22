/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 14/28 · wall-comments-timeago
   lines 4976–5394 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now - date) / 60000);
  
  if (diffInMinutes < 1) return 'الآن';
  if (diffInMinutes < 60) return `<span>${diffInMinutes}</span><span>د</span>`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `<span>${diffInHours}</span><span>س</span>`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  return `<span>${diffInDays}</span><span>ي</span>`;
}

window.toggleYoutube = (postId, videoId) => {
  const container = document.getElementById(`youtube-container-${postId}`);
  if (container.classList.contains('d-none')) {
    container.innerHTML = `
      <div class="ratio ratio-16x9">
        <iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>
      </div>
    `;
    container.classList.remove('d-none');
  } else {
    container.innerHTML = '';
    container.classList.add('d-none');
  }
};


function renderComment(c) {
  const user = c.user || c.guestInfo || {};
  const userId = c.userId || (c.guestInfo ? c.guestInfo.id : null);
  
  const userIdentityHtml = window.renderUserIdentity(user, {
      nameClasses: 'wall-post-username',
      nameStyle: `color: ${user.ucol || '#e67e22'};`,
      tag: 'a',
      onClick: 'event.preventDefault();'
  });
  
  const avatarUrl = window.getAvatarUrl(user);
  let commentText = c.msg ? replacePlaceholders(replaceShortcuts(escapeHTML(decodeWallEntities(c.msg)))) : '';
  if (commentText && window.safeLinkify) {
    commentText = window.safeLinkify(commentText);
  }

  return `
  <div class="wall-post-card" style="padding: 6px; border-bottom: 1px solid #f0f0f0;" data-user-id="${userId || ''}">
    <img src="${avatarUrl}" class="wall-post-avatar js-user-profile-btn" referrerPolicy="origin-when-cross-origin" data-username="${escapeHTML(user.username || '')}" data-user-id="${userId || ''}" style="cursor: pointer;">
    
    <div class="wall-post-main">
      <div class="wall-post-header">
        <div class="d-flex align-items-center">
          ${userIdentityHtml}
        </div>
        <div class="wall-post-time">${formatTimeAgo(c.createdAt)}</div>
      </div>
      <div class="wall-post-content">
        <div class="wall-post-text" style="color: ${c.user?.fontColor || '#000000'}">${commentText}</div>
      </div>
    </div>
  </div>
  `;
}

window.toggleComments = async (postId) => {
  console.log('Fetching post:', postId);
  window.activeCommentPostId = postId;
  let overlay = document.getElementById('comment-modal-overlay');
  const isNewModal = !overlay;

  try {
    const res = await fetch(`/api/posts/${postId}`, {
      headers: { 
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      }
    });
    
    if (!res.ok) {
      const text = await res.text();
      console.error('Fetch failed:', res.status, text);
      return;
    }
    
    const post = await res.json();
    if (!post) return;

    // Render Original Post at the top
    const userIdentityHtml = window.renderUserIdentity(post.user || post.guestInfo || {}, {
        nameClasses: 'wall-post-username',
        nameStyle: `color: ${post.user?.ucol || '#e67e22'};`,
        tag: 'span'
    });
    
    let mediaHtml = '';
    if (post.mediaUrl) {
      if (post.mediaType === 'youtube') {
        mediaHtml = `
          <div class="wall-post-media mt-2 text-center">
            <div class="youtube-horizontal-placeholder" onclick="revealMedia(this, 'youtube', '${post.mediaUrl}', event)">
              <div class="yt-left-side">
                <i class="fab fa-youtube"></i>
              </div>
              <div class="yt-right-side">
                <img src="https://img.youtube.com/vi/${post.mediaUrl}/hqdefault.jpg" class="placeholder-thumb" onerror="this.src='https://img.youtube.com/vi/${post.mediaUrl}/mqdefault.jpg'">
                <div class="yt-play-label">تشغيل</div>
              </div>
            </div>
          </div>
        `;
      } else if (post.mediaType === 'image') {
        mediaHtml = `
          <div class="wall-post-media mt-2">
            <img src="${post.mediaUrl}" class="img-fluid rounded" style="max-height: 200px; cursor: pointer;" onclick="openLightbox('${post.mediaUrl}')">
          </div>
        `;
      } else if (post.mediaType === 'video') {
        mediaHtml = `
          <div class="wall-post-media mt-2">
            <div class="position-relative" style="cursor: pointer;" onclick="window.openVideoLightbox('${post.mediaUrl}')">
              <video src="${post.mediaUrl}" class="w-100 rounded" style="max-height: 200px;"></video>
              <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.5); color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-play"></i>
              </div>
            </div>
          </div>
        `;
      }
    }

    let modalPostText = post.msg ? replacePlaceholders(replaceShortcuts(escapeHTML(decodeWallEntities(post.msg)))) : '';
    if (modalPostText && window.safeLinkify) {
      modalPostText = window.safeLinkify(modalPostText);
    }

    const originalPostHtml = `
      <div class="comment-original-post">
        <div class="d-flex">
          <img src="${post.user?.pic || '/default-avatar.png'}" class="wall-post-avatar js-user-profile-btn" referrerPolicy="origin-when-cross-origin" data-username="${escapeHTML(post.user?.username || '')}" style="cursor: pointer;">
          <div class="wall-post-main flex-grow-1">
            <div class="wall-post-header d-flex justify-content-between align-items-center">
              <div class="d-flex align-items-center">
                ${userIdentityHtml}
              </div>
              <div class="wall-post-time">${formatTimeAgo(post.createdAt)}</div>
            </div>
            <div class="wall-post-body mt-1" style="color: ${post.user?.fontColor || '#000'}">
              ${modalPostText}
            </div>
            ${mediaHtml}
          </div>
        </div>
      </div>
    `;

    let commentsHtml = '';
    if (post.comments && post.comments.length > 0) {
      commentsHtml = post.comments.map(c => renderComment(c)).join('');
    } else {
      commentsHtml = '<div class="p-4 text-center text-muted" id="no-comments-msg">لا توجد تعليقات بعد.</div>';
    }

    const fullBodyHtml = originalPostHtml + '<div class="comments-list" id="comments-list-container">' + commentsHtml + '</div>';

    if (isNewModal) {
      overlay = document.createElement('div');
      overlay.id = 'comment-modal-overlay';
      overlay.className = 'comment-modal-overlay';
      overlay.innerHTML = `
        <div class="comment-modal">
          <div class="comment-modal-header">
            <div class="title">
              <i class="fas fa-comments"></i>
              التعليقات
            </div>
            <div class="close-btn" onclick="document.getElementById('comment-modal-overlay').remove()">
              <i class="fas fa-times-circle"></i>
            </div>
          </div>
          <div class="comment-modal-body" id="comment-modal-body">
            ${fullBodyHtml}
          </div>
          <div class="comment-modal-footer" style="padding: 4px; border-top: 1px solid #ccc; background: #f0f2f5;">
            <div class="wall-post-input-group">
              <div class="wall-post-btn-icon" id="comment-btn-emoji" title="إيموجي" style="padding: 5px; width: 34px; background: transparent; border: none; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-smile text-secondary fs-5"></i>
              </div>
              <textarea id="comment-modal-input" class="wall-post-input" placeholder="اكتب تعليقك هنا..." style="min-height: 32px; height: 32px;"></textarea>
              <button class="wall-post-btn-send" id="comment-send-btn">
                إرسال <i class="fas fa-paper-plane"></i>
              </button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
      refreshWallLayout();
    } else {
      // Update existing modal body
      const body = document.getElementById('comment-modal-body');
      body.innerHTML = fullBodyHtml;
    }

    // Update send button and input handlers
    const sendBtn = document.getElementById('comment-send-btn');
    const input = document.getElementById('comment-modal-input');
    const btnEmoji = document.getElementById('comment-btn-emoji');
    
    if (btnEmoji && input) {
      btnEmoji.onclick = () => toggleEmojiPicker(input);
    }
    
    sendBtn.onclick = (e) => submitComment(e, postId);
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitComment(e, postId);
      }
    };

    // Scroll to bottom
    const body = document.getElementById('comment-modal-body');
    body.scrollTop = body.scrollHeight;

  } catch (err) {
    console.error('Error loading comments:', err);
  }
};

window.submitComment = async (e, postId) => {
  if (e) e.preventDefault();
  const input = document.getElementById('comment-modal-input');
  const msg = input.value.trim();
  if (!msg) return;

  try {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      },
      body: JSON.stringify({ msg })
    });
    if (res.ok) {
       input.value = '';
       // The socket event 'wall-update' will handle appending the new comment to the UI
     } else {
       let errorMessage = 'خطأ غير معروف';
       try {
         const responseText = await res.text();
         try {
           const errorData = JSON.parse(responseText);
           errorMessage = errorData.message || errorMessage;
         } catch (e) {
           if (res.status === 403) {
             errorMessage = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
           } else {
             errorMessage = responseText || res.statusText || errorMessage;
           }
         }
       } catch (e) {
         if (res.status === 403) {
           errorMessage = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
         } else {
           errorMessage = res.statusText || errorMessage;
         }
       }
       if (res.status === 403 || errorMessage.includes('إسكات')) {
         showChatAlert({ message: errorMessage, icon: 'error' });
       } else {
         showToast(errorMessage);
       }
     }
  } catch (err) {
    console.error('Error commenting:', err);
    showToast('حدث خطأ أثناء الاتصال بالسيرفر');
  }
};

window.openYoutubeSearch = () => {
  // Simple prompt for now, can be replaced with a modal
  const videoId = prompt('أدخل معرف فيديو يوتيوب (مثلاً: dQw4w9WgXcQ):');
  if (videoId) {
    const payload = { msg: 'شاهد هذا الفيديو!', mediaUrl: videoId, mediaType: 'youtube' };
    fetch('/api/posts', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      },
      body: JSON.stringify(payload)
    }).then(async (res) => {
      if (res.ok) {
        const newPost = await res.json();
        const container = document.getElementById('wall-posts-container');
        if (container && !document.getElementById(`post-${newPost.id}`)) {
          const noPostsMsg = document.getElementById('no-posts-msg');
          if (noPostsMsg) noPostsMsg.remove();
          container.insertAdjacentHTML('afterbegin', renderPost(newPost));
          refreshWallLayout({ scrollTop: true });
          container.scrollTop = 0;
        }
      } else {
        let errMsg = 'فشل في إرسال الفيديو';
        try {
          const resText = await res.text();
          try {
            const resJson = JSON.parse(resText);
            errMsg = resJson.message || errMsg;
          } catch (_) {
            if (res.status === 403) {
              errMsg = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
            } else {
              errMsg = resText || errMsg;
            }
          }
        } catch (_) {}
        if (res.status === 403 || errMsg.includes('إسكات')) {
          showChatAlert({ message: errMsg, icon: 'error' });
        } else {
          showToast(errMsg);
        }
      }
    });
  }
};

window.likePost = async (postId, btnElement) => {
  const icon = btnElement.querySelector('i');
  if (icon.classList.contains('fas')) return; // Already liked

  try {
    const res = await fetch(`/api/posts/${postId}/like`, { 
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      }
    });
    if (res.ok) {
      // Just change icon for immediate feedback, let the socket event 'wall-update' update the count
      icon.classList.remove('far');
      icon.classList.add('fas', 'animate-like');
      
      // Remove animation class after it finishes
      setTimeout(() => {
        icon.classList.remove('animate-like');
      }, 400);
    }
  } catch (err) {
    console.error('Error liking post:', err);
  }
};

window.handleSettingsUpload = async () => {
  state.setIsSettingsUpload(true);
  document.getElementById('file-input').click();
};

window.deletePost = async (postId) => {
  try {
    const res = await fetch(`/api/posts/${postId}`, { 
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      }
    });
    if (res.ok) {
      const postElement = document.getElementById(`post-${postId}`);
      if (postElement) {
        postElement.remove();
      } else {
        loadWall(); // Fallback if element not found
      }
    } else {
      let errorMessage = 'خطأ غير معروف';
      try {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const errorData = await res.json();
          errorMessage = errorData.message || errorMessage;
        } else {
          errorMessage = `خطأ من الخادم (${res.status})`;
        }
      } catch (e) {
        errorMessage = `خطأ في معالجة الرد (${res.status})`;
      }
      showToast('فشل الحذف: ' + errorMessage);
    }
  } catch (err) {
    console.error('Error deleting post:', err);
    showToast('حدث خطأ أثناء الحذف');
  }
};

// Handle story clicks from sidebar
document.addEventListener('click', function(e) {
  const storyAvatar = e.target.closest('.js-sidebar-story-avatar.has-unviewed');
  if (!storyAvatar) return;

  e.preventDefault();
  e.stopPropagation();

  const userId = storyAvatar.dataset.userId;

  if (typeof window.openUserStoriesFromSidebar === 'function') {
    window.openUserStoriesFromSidebar(e, userId);
  }
});
window.renderUserObj = renderUserObj;

// D6: small state label under usernames — «عضو جديد» for members, «زائر جديد» for guests.
