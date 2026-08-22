/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 13/28 · wall-render
   lines 4119–4975 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function getYoutubeId(url) {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

window.revealMedia = function(container, type, url, event) {
  if (event) event.stopPropagation();
  let html = '';
  if (type === 'youtube') {
    html = `
      <iframe 
        width="100%" 
        height="180" 
        src="https://www.youtube.com/embed/${url}?rel=0&modestbranding=1&autoplay=1" 
        title="YouTube video player" 
        frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
        allowfullscreen
        style="border-radius: 8px; border: 1px solid #ddd;"
        referrerpolicy="origin-when-cross-origin"
      ></iframe>
    `;
  } else if (type === 'image') {
    html = `<img src="${url}" class="img-fluid rounded message-image-preview" onclick="openLightbox('${url}')" referrerpolicy="origin-when-cross-origin">`;
  } else if (type === 'video') {
    html = `
      <div class="position-relative" style="cursor: pointer;" onclick="window.openVideoLightbox('${url}')">
        <video src="${url}" class="img-fluid rounded" style="max-height: 180px;"></video>
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.5); color: white; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <i class="fas fa-play"></i>
        </div>
      </div>
    `;
  } else if (type === 'audio') {
    html = `<audio src="${url}" controls autoplay style="width: 100%;"></audio>`;
  }
  container.innerHTML = html;
  container.classList.add('media-revealed');
};

function decodeWallEntities(text) {
  if (!text) return '';
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return doc.documentElement.textContent;
}

function renderPost(post) {
  const currentUserId = state.currentUser?.id;
  const isLiked = typeof post.isLiked === 'boolean' ? post.isLiked : !!(post.wallLikes?.some(like => like.userId === currentUserId));
  const heartIcon = isLiked ? 'fas fa-heart' : 'far fa-heart';
  const likeCount = typeof post.likeCount === 'number' ? post.likeCount : (post.wallLikes?.length || 0);
  const commentCount = typeof post.commentCount === 'number' ? post.commentCount : (post.comments?.length || 0);
  
  const user = post.user || post.guestInfo || {};
  const canDelete = (state.currentUser && (state.currentUser.id === post.userId || hasPermission('canDeleteWallPosts')));

  const userPadding = '0 4px';
  const userBorderRadius = '2px';
  
  const userIdentityHtml = window.renderUserIdentity(user, {
     nameClasses: 'wall-post-username',
     nameStyle: `color: ${user.ucol || '#e67e22'};`,
     tag: 'a',
     onClick: 'event.preventDefault();'
  });

  const avatarUrl = window.getAvatarUrl(user);

  const pendingClass = post.isPending ? 'wall-pending' : '';

  let wallText = post.msg ? replacePlaceholders(replaceShortcuts(escapeHTML(decodeWallEntities(post.msg)))) : '';
  if (wallText && window.safeLinkify) {
    wallText = window.safeLinkify(wallText);
  }

  let mediaHtml = '';
  if (post.mediaUrl) {
    if (post.mediaType === 'youtube') {
      mediaHtml = `
        <div class="wall-post-media mt-2">
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
          <div class="media-placeholder image-placeholder" onclick="revealMedia(this, 'image', '${post.mediaUrl}', event)">
            <span>عرض الصورة</span>
            <div class="placeholder-icon"><i class="fas fa-image"></i></div>
          </div>
        </div>
      `;
    } else if (post.mediaType === 'video') {
      mediaHtml = `
        <div class="wall-post-media mt-2">
          <div class="media-placeholder video-placeholder" onclick="revealMedia(this, 'video', '${post.mediaUrl}', event)">
            <span>تشغيل الفيديو</span>
            <div class="placeholder-icon"><i class="fas fa-play-circle"></i></div>
          </div>
        </div>
      `;
    }
  }

return `
  <div class="wall-post-card ${pendingClass}" id="post-${post.id}">
    <img src="${avatarUrl}" class="wall-post-avatar js-user-profile-btn" referrerPolicy="origin-when-cross-origin" data-username="${escapeHTML(user.username || '')}" style="cursor: pointer;">
    
    <div class="wall-post-main">
      <div class="wall-post-header">
        <div class="d-flex align-items-center">
          ${userIdentityHtml}
        </div>
        <div class="wall-post-time">${formatTimeAgo(post.createdAt)}</div>
      </div>


       

        <div class="wall-post-content ${mediaHtml ? 'has-media' : ''}">
          <div class="wall-post-body">
            ${wallText ? `
              <div class="wall-post-text" style="color: ${post.user?.fontColor || '#000000'}">
                ${wallText}
              </div>
            ` : ''}
            ${mediaHtml ? `<div class="wall-post-media-clear">${mediaHtml}</div>` : ''}
          </div>
          <div class="wall-post-actions-row">
            ${window.featuresSettings?.wallPostLikesEnabled !== false ? `
              <button class="wall-action-btn wall-btn-like" ${post.isPending ? 'disabled' : `onclick="likePost('${post.id}', this)"`}>
                <i class="${heartIcon}"></i>
                <span>${likeCount}</span>
              </button>
            ` : ''}

            ${window.featuresSettings?.wallPostCommentsEnabled !== false ? `
              <button class="wall-action-btn wall-btn-comment" ${post.isPending ? 'disabled' : `onclick="toggleComments('${post.id}')"`}>
                <i class="fas fa-comments"></i>
                <span>${commentCount}</span>
              </button>
            ` : ''}

            ${canDelete ? `
              <button class="wall-action-btn wall-btn-delete" ${post.isPending ? 'disabled' : `onclick="deletePost('${post.id}')"`}>
                <i class="fas fa-times"></i>
              </button>
            ` : ''}
          </div>
        </div>
    </div>
  </div>
`;
}

function updateWallPostParts(element, post) {
  const currentUserId = state.currentUser?.id;
  const isLiked = typeof post.isLiked === 'boolean' ? post.isLiked : !!(post.wallLikes?.some(like => like.userId === currentUserId));
  const heartIcon = isLiked ? 'fas fa-heart' : 'far fa-heart';
  const likeCount = typeof post.likeCount === 'number' ? post.likeCount : (post.wallLikes?.length || 0);
  const commentCount = typeof post.commentCount === 'number' ? post.commentCount : (post.comments?.length || 0);

  const likeBtn = element.querySelector('.wall-btn-like');
  if (likeBtn) {
    const icon = likeBtn.querySelector('i');
    const span = likeBtn.querySelector('span');
    if (icon) icon.className = heartIcon;
    if (span) span.innerText = likeCount;
  }

  const commentBtn = element.querySelector('.wall-btn-comment span');
  if (commentBtn) {
    commentBtn.innerText = commentCount;
  }
}

window.refreshWallLayout = function(options = {}) {
  const container = document.getElementById('wall-posts-container');
  const input = document.getElementById('wall-post-input');

  if (input) {
    input.style.height = '32px';
  }

  if (container && options.scrollTop) {
    requestAnimationFrame(() => {
      container.scrollTop = 0;
    });
  }
};

let isWallSubmitting = false;

function getWallTargetContainer() {
  const customInner = document.getElementById('wall-posts-inner-container');
  return customInner || ui.sidebarWallContainer;
}

async function loadWall() {
  const existingPostsContainer = document.getElementById('wall-posts-container');
  if (!existingPostsContainer) {
    let storiesHtml = '';
    
    getWallTargetContainer().innerHTML = storiesHtml + `
      <div id="wall-loading" class="d-flex flex-column align-items-center justify-content-center p-5 text-muted">
        <i class="fas fa-circle-notch fa-spin text-primary fa-2x mb-2" style="font-size: 2rem;"></i>
        <div style="font-size: 14px;">جاري تحميل حائط المنشورات...</div>
      </div>
    `;
    if (typeof renderStoriesBar === 'function') renderStoriesBar('wall-stories-container');
  }
  try {
    const res = await fetch('/api/posts', {
      headers: { 
        'Authorization': `Bearer ${getToken()}`,
        'X-Chat-Token': getToken()
      }
    });
    const posts = await res.json();
    
    const currentUserId = state.currentUser?.id;
    
    let postsHtml = '';
    if (posts.length === 0) {
      postsHtml = '<div id="no-posts-msg" class="p-4 text-center text-muted">لا توجد منشورات حالياً.</div>';
    } else {
      posts.forEach(post => {
        postsHtml += renderPost(post);
      });
    }

    const existingPostsContainer = document.getElementById('wall-posts-container');
    if (existingPostsContainer) {
      const newIds = new Set(posts.map(p => p.id));
      
      Array.from(existingPostsContainer.children).forEach(child => {
        if (!child.id.startsWith('post-')) return;
        const id = child.id.replace('post-', '');
        if (!newIds.has(id)) {
          child.remove();
        }
      });
      
      let previousElement = null;
      posts.forEach(post => {
         const existing = document.getElementById(`post-${post.id}`);
         if (!existing) {
             const temp = document.createElement('div');
             temp.innerHTML = renderPost(post);
             const postEl = temp.firstElementChild;
             if (previousElement) {
                previousElement.insertAdjacentElement('afterend', postEl);
             } else {
                existingPostsContainer.insertAdjacentElement('afterbegin', postEl);
             }
             previousElement = postEl;
         } else {
             updateWallPostParts(existing, post);
             
             // Ensure correct order in DOM
             if (previousElement && previousElement.nextElementSibling !== existing) {
                 previousElement.insertAdjacentElement('afterend', existing);
             } else if (!previousElement && existingPostsContainer.firstElementChild !== existing) {
                 // if it should be the very first element
                 existingPostsContainer.insertAdjacentElement('afterbegin', existing);
             }
             
             previousElement = existing;
         }
      });
      
      const noPostsMsg = document.getElementById('no-posts-msg');
      if (posts.length === 0 && !noPostsMsg) {
         existingPostsContainer.insertAdjacentHTML('afterbegin', '<div id="no-posts-msg" class="p-4 text-center text-muted">لا توجد منشورات حالياً.</div>');
      } else if (posts.length > 0 && noPostsMsg) {
         noPostsMsg.remove();
      }

      applyUserFontSize();
      return;
    }
    
    let html = '';
    html += '<div class="wall-container">';
    html += '<button id="new-posts-alert" class="new-posts-alert">منشورات جديدة</button>';
    
    // Youtube Search Container
    if (window.featuresSettings?.wallYoutubeBarEnabled !== false) {
      html += `
        <div class="yt-search-container p-2 border-bottom">
          <div class="yt-search-input-wrap">
            <i class="fab fa-youtube yt-search-youtube-icon"></i>
  
            <input type="text" class="form-control form-control-sm" id="yt-search-input" placeholder="ابحث  في يوتيوب...">
  
            <button type="button" id="yt-search-btn" class="yt-search-btn-inline" aria-label="بحث">
              <i class="fas fa-search"></i>
            </button>
          </div>
  
          <div id="yt-results-container" class="yt-results-list"></div>
        </div>
      `;
    }

    html += '<div class="wall-posts-list" id="wall-posts-container">' + postsHtml + '</div>';
    
    html += `
      <div class="wall-post-form-container">
        <div class="wall-upload-progress-container" id="wall-upload-progress-container">
          <div class="wall-upload-progress-bar" id="wall-upload-progress-bar"></div>
          <div class="wall-upload-progress-text" id="wall-upload-progress-text">0%</div>
          <button id="cancel-wall-upload" class="btn btn-sm btn-danger wall-upload-cancel-btn"><i class="fas fa-times"></i> إلغاء</button>
        </div>
        
        <form id="wall-post-form">
          <div class="wall-post-input-group">
            <div class="wall-post-btn-icon" title="إيموجي" id="wall-btn-emoji" style="padding: 5px; width: 34px; background: transparent; border: none;">
              <img src="/emoii.gif" style="width: 34px; padding: 5px;" alt="emoji">
            </div>
            <div class="wall-post-btn-icon" title="رفع وسائط" id="wall-btn-upload">
              <i class="fas fa-upload"></i>
            </div>
            
            <textarea name="msg" class="wall-post-input" id="wall-post-input" placeholder="اكتب رسالتك هنا"></textarea>
            <button type="submit" class="wall-post-btn-send">
              إرسال <i class="fas fa-paper-plane"></i>
            </button>
          </div>
        </form>
      </div>
    `;
    html += '</div>';
    getWallTargetContainer().innerHTML = html;
    if (typeof renderStoriesBar === 'function') renderStoriesBar('wall-stories-container');
    applyUserFontSize();

    const postsContainer = document.getElementById('wall-posts-container');
    const alertBtn = document.getElementById('new-posts-alert');

    if (postsContainer && alertBtn) {
      postsContainer.onscroll = () => {
        if (postsContainer.scrollTop < 50) {
          alertBtn.style.display = 'none';
        }
      };

      alertBtn.onclick = () => {
        postsContainer.scrollTo({ top: 0, behavior: 'auto' });
        alertBtn.style.display = 'none';
      };
    }

    // Elements
    const form = document.getElementById('wall-post-form');
    const wallInput = document.getElementById('wall-post-input');
    const btnEmoji = document.getElementById('wall-btn-emoji');
    const btnUpload = document.getElementById('wall-btn-upload');
    const ytSearchInput = document.getElementById('yt-search-input');
    const ytResultsContainer = document.getElementById('yt-results-container');
    const ytSearchBtn = document.getElementById('yt-search-btn');
    
    let ytSearchTimeout = null;
    if (ytSearchInput && ytResultsContainer) {
      // Hide results when clicking outside
      const hideResults = (e) => {
        if (!ytResultsContainer.contains(e.target) && e.target !== ytSearchInput && e.target !== ytSearchBtn) {
          ytResultsContainer.innerHTML = '';
        }
      };
      document.addEventListener('click', hideResults);

      ytSearchInput.oninput = (e) => {
        clearTimeout(ytSearchTimeout);
        const query = e.target.value.trim();
        if (!query) { ytResultsContainer.innerHTML = ''; return; }
        
        ytSearchTimeout = setTimeout(async () => {
          ytResultsContainer.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin text-primary"></i></div>';
          try {
            const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`, {
              headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const results = await res.json();
            if (results.length === 0) {
              ytResultsContainer.innerHTML = '<div class="p-3 small text-center text-muted">لا توجد نتائج</div>';
              return;
            }
            ytResultsContainer.innerHTML = results.map(video => `
              <div class="yt-result-item" onclick="window.selectYoutubeVideo('${video.id}', '${escapeHTML(video.title)}')">
                <div class="yt-result-thumb-wrap">
                  <img src="${video.thumbnail}" alt="" class="yt-result-thumb">
                  <i class="fab fa-youtube yt-play-icon-overlay"></i>
                </div>
                <div class="video-info">
                  <div class="video-title" title="${escapeHTML(video.title)}">${escapeHTML(video.title)}</div>
                </div>
              </div>
            `).join('');
          } catch (err) {
            console.error(err);
            ytResultsContainer.innerHTML = '<div class="p-3 small text-center text-danger">تعذر الاتصال بـ YouTube</div>';
          }
        }, 500);
      };
    }

    if (!window.selectYoutubeVideo) {
      window.selectYoutubeVideo = async (videoId, title) => {
        const ytSearchInput = document.getElementById('yt-search-input');
        const ytResultsContainer = document.getElementById('yt-results-container');
        
        // Optimistic UI for YouTube
        const tempId = 'pending-yt-' + Date.now();
        const container = document.getElementById('wall-posts-container');
        if (container) {
          const noPostsMsg = document.getElementById('no-posts-msg');
          if (noPostsMsg) noPostsMsg.remove();

          const tempPost = {
            id: tempId,
            userId: state.currentUser ? state.currentUser.id : null,
            msg: ' ',
            mediaUrl: videoId,
            mediaType: 'youtube',
            createdAt: new Date().toISOString(),
            user: state.currentUser,
            isPending: true,
            wallLikes: [],
            comments: []
          };
          container.insertAdjacentHTML('afterbegin', renderPost(tempPost));
          refreshWallLayout({ scrollTop: true });
          container.scrollTop = 0;
        }

        // Clear search immediately
        if (ytSearchInput) ytSearchInput.value = '';
        if (ytResultsContainer) ytResultsContainer.innerHTML = '';

        const payload = { 
          msg: ' ',
          mediaUrl: videoId, 
          mediaType: 'youtube' 
        };

        try {
          const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getToken()}`,
              'X-Chat-Token': getToken()
            },
            body: JSON.stringify(payload)
          });
          
          if (response.ok) {
            const newPost = await response.json();
            const pendingDiv = document.getElementById(`post-${tempId}`);
            if (pendingDiv) {
              pendingDiv.outerHTML = renderPost(newPost);
            } else if (!document.getElementById(`post-${newPost.id}`)) {
              if (container) {
                container.insertAdjacentHTML('afterbegin', renderPost(newPost));
                container.scrollTop = 0;
              }
            }
            refreshWallLayout({ scrollTop: true });
          } else {
            const pendingDiv = document.getElementById(`post-${tempId}`);
            if (pendingDiv) pendingDiv.remove();
            let errMsg = 'فشل في إرسال الفيديو';
            try {
              const resText = await response.text();
              try {
                const resJson = JSON.parse(resText);
                errMsg = resJson.message || errMsg;
              } catch (_) {
                if (response.status === 403) {
                  errMsg = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
                } else {
                  errMsg = resText || errMsg;
                }
              }
            } catch (_) {}
            if (response.status === 403 || errMsg.includes('إسكات') || response.status === 429 || errMsg.includes('الانتظار') || errMsg.includes('انتظار')) {
              showChatAlert({ message: errMsg, icon: 'error' });
            } else {
              showToast(errMsg);
            }
          }
        } catch (err) {
          console.error(err);
          const pendingDiv = document.getElementById(`post-${tempId}`);
          if (pendingDiv) pendingDiv.remove();
          if (err.message && !err.message.includes('لايك') && !err.message.includes('requiredLikes')) {
            showToast(err.message || 'حدث خطأ غير متوقع');
          }
        }
      };
    }
    
    const progressContainer = document.getElementById('wall-upload-progress-container');
    const progressBar = document.getElementById('wall-upload-progress-bar');
    const progressText = document.getElementById('wall-upload-progress-text');
    const cancelUploadBtn = document.getElementById('cancel-wall-upload');
    
    let currentWallUploadXhr = null;
    
    if (cancelUploadBtn) {
      cancelUploadBtn.onclick = () => {
        if (currentWallUploadXhr) {
          currentWallUploadXhr.abort();
          isWallSubmitting = false;
          if (progressContainer) progressContainer.style.display = 'none';
          if (window.showToast) {
            window.showToast('تم إلغاء الرفع', 'info');
          } else {
            console.log('تم إلغاء الرفع');
          }
        }
      };
    }

    const previewContainer = document.getElementById('wall-media-preview-container');
    const previewContent = document.getElementById('wall-media-preview-content');
    const previewConfirm = document.getElementById('wall-preview-confirm');
    const previewCancel = document.getElementById('wall-preview-cancel');

    if (btnEmoji && wallInput) {
      btnEmoji.onclick = () => toggleEmojiPicker(wallInput);
    }

    // Helper: Show Preview (Remove preview UI as requested)
    const showMediaPreview = (mediaHtml) => {
        // No-op to comply with requirements
    };

    const hideMediaPreview = () => {
       // No-op
    };


    // Unified Upload Handler
    btnUpload.onclick = () => {
      if (isWallSubmitting) return;
      
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*,video/*,.mov,.MOV';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          isWallSubmitting = true;
          
          // Capture current text
          const currentText = (wallInput ? wallInput.value : '').trim();

          // Proceed to upload with real progress
          if (progressContainer) progressContainer.style.display = 'block';
          if (progressBar) progressBar.style.width = '0%';
          if (progressText) progressText.innerText = '0%';

          const formData = new FormData();
          formData.append('file', file);
          
          const xhr = new XMLHttpRequest();
          currentWallUploadXhr = xhr;
          xhr.open('POST', '/api/upload/wallfiles', true);
          xhr.setRequestHeader('Authorization', `Bearer ${getToken()}`);
          xhr.setRequestHeader('X-Chat-Token', getToken());

          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable && progressBar && progressText) {
              const percent = Math.round((event.loaded / event.total) * 100);
              progressBar.style.width = percent + '%';
              progressText.innerText = percent + '%';
            }
          };

          xhr.onload = async () => {
            currentWallUploadXhr = null;
            if (progressContainer) progressContainer.style.display = 'none';
            isWallSubmitting = false;

            if (xhr.status === 200) {
              const result = JSON.parse(xhr.responseText);
              const isVideo = file.type.startsWith('video/') || file.type === 'video/quicktime' || file.name.toLowerCase().endsWith('.mov') || (result.mimetype && (result.mimetype.startsWith('video/') || result.mimetype === 'video/quicktime'));
              const type = isVideo ? 'video' : 'image';
              
              const tempId = 'pending-upload-' + Date.now();
              const container = document.getElementById('wall-posts-container');
              if (container) {
                const noPostsMsg = document.getElementById('no-posts-msg');
                if (noPostsMsg) noPostsMsg.remove();

                const tempPost = {
                  id: tempId,
                  userId: state.currentUser ? state.currentUser.id : null,
                  msg: currentText || '',
                  mediaUrl: result.url,
                  mediaType: type,
                  createdAt: new Date().toISOString(),
                  user: state.currentUser,
                  isPending: true,
                  wallLikes: [],
                  comments: []
                };
                container.insertAdjacentHTML('afterbegin', renderPost(tempPost));
                refreshWallLayout({ scrollTop: true });
                container.scrollTop = 0;
              }
              
              if (wallInput) wallInput.value = '';

              // Directly post media + current text
              const payload = { msg: currentText || '', mediaUrl: result.url, mediaType: type };
              try {
                const response = await fetch('/api/posts', {
                  method: 'POST',
                  headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`,
                    'X-Chat-Token': getToken()
                  },
                  body: JSON.stringify(payload)
                });
                
                if (response.ok) {
                    const newPost = await response.json();
                    const pendingDiv = document.getElementById(`post-${tempId}`);
                    if (pendingDiv) {
                      pendingDiv.outerHTML = renderPost(newPost);
                    } else if (!document.getElementById(`post-${newPost.id}`)) {
                      if (container) {
                        container.insertAdjacentHTML('afterbegin', renderPost(newPost));
                        container.scrollTop = 0;
                      }
                    }
                    refreshWallLayout({ scrollTop: true });
                } else {
                  const pendingDiv = document.getElementById(`post-${tempId}`);
                  if (pendingDiv) pendingDiv.remove();
                  let errMsg = 'فشل في إرسال المنشور';
                  try {
                    const resText = await response.text();
                    try {
                      const resJson = JSON.parse(resText);
                      errMsg = resJson.message || errMsg;
                    } catch (_) {
                      if (response.status === 403) {
                        errMsg = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
                      } else {
                        errMsg = resText || errMsg;
                      }
                    }
                  } catch (_) {}
                  showChatAlert({ message: errMsg, icon: 'error' });
                }
              } catch (err) {
                console.error(err);
                const pendingDiv = document.getElementById(`post-${tempId}`);
                if (pendingDiv) pendingDiv.remove();
              }
            } else if (xhr.status !== 0) { // status 0 is aborted
              let errorMsg = 'تعذر رفع الملف، حاول مرة أخرى';
              try {
                const res = JSON.parse(xhr.responseText);
                if (res.message) errorMsg = res.message;
              } catch (e) {}
              showChatAlert({ message: errorMsg, icon: 'error' });
            }
          };

          xhr.onerror = () => {
             currentWallUploadXhr = null;
             if (progressContainer) progressContainer.style.display = 'none';
             isWallSubmitting = false;
             showChatAlert({ message: 'حدث خطأ أثناء الاتصال بالسيرفر', icon: 'error' });
          };

          xhr.onabort = () => {
            currentWallUploadXhr = null;
            if (progressContainer) progressContainer.style.display = 'none';
            isWallSubmitting = false;
          };

          xhr.send(formData);
        }
      };
      input.click();
    };

    // Form Submit
    if (form) {
      let wallSubmitByEnter = false;

      if (wallInput) {
        wallInput.onkeydown = (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            wallSubmitByEnter = true;

            if (typeof form.requestSubmit === 'function') {
              form.requestSubmit();
            } else {
              form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            }
          }
        };
      }

      form.onsubmit = async (e) => {
        if (e) e.preventDefault();
        
        const msg = (wallInput ? wallInput.value : '').trim();
        if (!msg) return;
        
        // Short throttle to prevent accidental double clicks (300ms)
        if (form.getAttribute('data-submitting')) return;
        form.setAttribute('data-submitting', 'true');
        setTimeout(() => form.removeAttribute('data-submitting'), 300);

        // Auto-detect YouTube link BEFORE creating optimistic UI
        let mediaUrl = null;
        let mediaType = null;
        let finalMsg = msg;
        const ytId = getYoutubeId(msg);
        if (ytId) {
          mediaUrl = ytId;
          mediaType = 'youtube';
          finalMsg = msg;
        }

        const tempId = 'pending-' + Date.now();
        const container = document.getElementById('wall-posts-container');
        
        // Optimistic UI
        if (container) {
          const noPostsMsg = document.getElementById('no-posts-msg');
          if (noPostsMsg) noPostsMsg.remove();

          const tempPost = {
            id: tempId,
            userId: state.currentUser ? state.currentUser.id : null,
            msg: finalMsg,
            mediaUrl: mediaUrl,
            mediaType: mediaType,
            createdAt: new Date().toISOString(),
            user: state.currentUser,
            isPending: true,
            wallLikes: [],
            comments: []
          };
          container.insertAdjacentHTML('afterbegin', renderPost(tempPost));
          refreshWallLayout({ scrollTop: true });
          container.scrollTop = 0;
        }

        // Reset form immediately
        form.reset();

        if (wallInput) {
          wallInput.value = '';
          wallInput.style.height = '32px';

          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

          if (isIOS && wallSubmitByEnter) {
            wallInput.blur();
          }

          wallSubmitByEnter = false;
        }
        
        try {
          const response = await fetch('/api/posts', {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${getToken()}`,
              'X-Chat-Token': getToken()
            },
            body: JSON.stringify({ msg: finalMsg, mediaUrl, mediaType })
          });
          
          if (response.ok) {
            const newPost = await response.json();
            const pendingDiv = document.getElementById(`post-${tempId}`);
            if (pendingDiv) {
              pendingDiv.outerHTML = renderPost(newPost);
            } else if (!document.getElementById(`post-${newPost.id}`)) {
              if (container) {
                container.insertAdjacentHTML('afterbegin', renderPost(newPost));
                container.scrollTop = 0;
              }
            }
            refreshWallLayout({ scrollTop: true });
          } else {
            const pendingDiv = document.getElementById(`post-${tempId}`);
            if (pendingDiv) pendingDiv.remove();
            let errMsg = 'فشل في إرسال المنشور';
            try {
              const resText = await response.text();
              try {
                const resJson = JSON.parse(resText);
                errMsg = resJson.message || errMsg;
              } catch (_) {
                if (response.status === 403) {
                  errMsg = 'عذراً، أنت في حالة إسكات من الكتابة على الحائط حالياً';
                } else {
                  errMsg = resText || errMsg;
                }
              }
            } catch (_) {}
            if (response.status === 403 || errMsg.includes('إسكات') || response.status === 429 || errMsg.includes('الانتظار') || errMsg.includes('انتظار')) {
              showChatAlert({ message: errMsg, icon: 'error' });
            } else {
              showToast(errMsg);
            }
          }
        } catch (err) {
          console.error('Wall post error:', err);
          const pendingDiv = document.getElementById(`post-${tempId}`);
          if (pendingDiv) pendingDiv.remove();
          if (err.message && (err.message.includes('لايك') || err.message.includes('requiredLikes'))) {
          } else {
            showToast(err.message || 'حدث خطأ أثناء الاتصال بالسيرفر');
          }
        }
      };
    }

  } catch (err) {
    console.error('Error loading wall:', err);
    if (!document.getElementById('wall-posts-container')) {
      getWallTargetContainer().innerHTML = `
        <div class="p-3 text-danger">فشل تحميل الحائط</div>
      `;
    }
  }
}



