/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 24/28 · message-elements
   lines 9104–9674 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function createSystemMessageElement({ id, title, content, image, titleColor, bgColor, textColor, createdAt, user, isAnnouncement, kind }) {
  if (!state.currentRoomId || (state.isRoomFrozen && !(user && user.isSystemLeaveMessage))) return null;
  
  if (isAnnouncement && user) {
    appendMessage({
      id,
      user: { ...user, isAnnouncement: true },
      text: content,
      createdAt
    });
    return null;
  }

  // Clear chat-cleared-container if it exists
  const clearedContainer = ui.messagesContainer.querySelector('.chat-cleared-container');
  if (clearedContainer) {
    ui.messagesContainer.innerHTML = '';
  }

  // Apply the original join/leave/move prettifying (from the owner's patches)
  // plus a CSS class so the classic accent styling still works on the live site.
  const prettyContent = prettifySystemMessage(content);
  let kindClass = '';
  if (user && user.isSystemLeaveMessage) {
    kindClass = 'js-leave';
  } else if (user && user.isSystemMoveMessage) {
    kindClass = 'js-move';
  } else if (kind === 'join' || (user && user.isSystemJoinMessage)) {
    kindClass = 'js-join';
  } else if (prettyContent.indexOf('تم طرد') !== -1) {
    kindClass = 'js-kick';
  }

  // Join/leave/move/kick render as a centered, bold card exactly like the
  // original owner's .public_message.linen styling (max-width 75%, shadow,
  // rounded corners, colored side border per kind).
  if (kindClass) {
    const row = document.createElement('div');
    row.className = 'message-row system-message-row system-join-leave-line ' + kindClass;
    if (id) row.dataset.id = id;
    row.innerHTML = `<div class="message-text" style="--system-message-original-color: ${textColor || '#333333'}; color: var(--system-message-text-color, var(--system-message-original-color));">${replacePlaceholders(replaceShortcuts(prettyContent))}</div>`;
    return row;
  }

  const div = document.createElement('div');
  div.className = 'message-row system-message-row' + (kindClass ? ' ' + kindClass : '');
  div.style.minHeight = '50px';
  div.style.backgroundColor = bgColor;
  div.style.direction = 'ltr';
  div.style.paddingLeft = '0';
  if (id) div.dataset.id = id;

  const systemAvatar = window.getSystemMessageImageUrl(image); 
  const titleToUse = user ? (user.topic || user.username) : title;
  const usernameData = user ? user.username : title;
  
  let renderUserData = user;
  if (user) {
    const incomingUserId = user.userId || user.id;
    const latestUser =
      state.currentUsers.find(u => Number(u.userId || u.id) === Number(incomingUserId)) ||
      state.currentUsers.find(u => u.username === user.username);
    
    renderUserData = {
      ...user,
      ...(latestUser || {}),
      id: latestUser?.userId || latestUser?.id || incomingUserId || user.id,
      userId: latestUser?.userId || latestUser?.id || incomingUserId || user.userId,
      username: user.username || latestUser?.username,
      superIcon: latestUser?.superIcon !== undefined ? latestUser.superIcon : user.superIcon,
      gifts: latestUser?.gifts !== undefined ? latestUser.gifts : user.gifts
    };
  }
  
  let headerHtml = '';
  if (user) {
    headerHtml = window.renderUserIdentity(renderUserData, {
      nameClasses: 'message-username',
      nameStyle: `color: var(--system-message-username-color, ${titleColor || '#333333'});`,
      tag: 'span'
    });
  } else {
    headerHtml = `<span class="message-username" data-username="${usernameData}" style="color: var(--system-message-username-color, ${titleColor || '#333333'});">${titleToUse}</span>`;
  }

  div.innerHTML = `
    <img src="${systemAvatar}" class="message-avatar" referrerPolicy="origin-when-cross-origin" style="width: 50px; height: 50px; object-fit: cover; border-radius: 0; flex-shrink: 0; margin-right: 1px; align-self: flex-start !important;">
    <div class="message-body" style="padding: 4px 6px; border: none; flex-grow: 1; background-color: transparent;">
      <div class="message-header" style="margin-bottom: 2px; display: flex; align-items: center;">
        ${headerHtml}
      </div>
      <div class="message-text" style="--system-message-original-color: ${textColor || '#333333'}; color: var(--system-message-text-color, var(--system-message-original-color));">${replacePlaceholders(replaceShortcuts(prettyContent))}</div>
    </div>
  `;

  return div;
}

function createMessageElement({ id, user, userId, text, createdAt, replyTo, mediaUrl, mediaType }) {
  const isLeaveSystemMessage = user && user.isSystemLeaveMessage === true;

  if (!isLeaveSystemMessage && (!state.currentRoomId || state.isRoomFrozen)) return null;
  if (!user) return null;
  
  const incomingUserId = userId || user.userId || user.id;

  const latestUser =
    state.currentUsers.find(u => Number(u.userId || u.id) === Number(incomingUserId)) ||
    state.currentUsers.find(u => u.username === user.username);

  const renderUserData = {
    ...user,
    ...(latestUser || {}),
    id: latestUser?.userId || latestUser?.id || incomingUserId || user.id,
    userId: latestUser?.userId || latestUser?.id || incomingUserId || user.userId,
    username: user.username || latestUser?.username,
    superIcon: latestUser?.superIcon !== undefined ? latestUser.superIcon : user.superIcon,
    gifts: latestUser?.gifts !== undefined ? latestUser.gifts : user.gifts
  };
  
  // Clear chat-cleared-container if it exists
  const clearedContainer = ui.messagesContainer.querySelector('.chat-cleared-container');
  if (clearedContainer) {
    ui.messagesContainer.innerHTML = '';
  }
  
  // Check if user is ignored
  if (state.ignoredUsers.has(renderUserData.username)) return null;

  const div = document.createElement('div');
  const isSystemMsg = renderUserData.type === 'system' && !renderUserData.username;
  
  const isVirtualNormalUser =
    renderUserData.isVirtualUser === true &&
    renderUserData.isGameBot !== true;

  div.className = isSystemMsg
    ? 'p-2 text-center small border-bottom system-inline-message'
    : (
        renderUserData.isSystem ||
        renderUserData.isGameBot ||
        (renderUserData.isBot && !isVirtualNormalUser)
      )
        ? 'message-row system-user-message'
        : 'message-row';
  if (id) div.dataset.id = id;
  
  if (isSystemMsg) {
    div.innerHTML = text;
  } else {
    // Check if it's a Game Bot message and handle placeholder rendering
    if (renderUserData.isGameBot) {
        const matches = text.match(/\[(.*?)\]/g);
        if (matches) {
            matches.forEach(match => {
                const username = match.replace(/\[|\]/g, '');
                const foundUser = state.currentUsers.find(u => u.username === username);
                if (foundUser) {
                    const identityHtml = window.renderUserIdentity(foundUser, {
                        nameClasses: 'message-username',
                        nameStyle: 'color: inherit;'
                    });
                    text = text.replace(match, identityHtml);
                }
            });
        }
    }
    
    // Fetch latest addons from state.currentUsers if available
    const latestUserLookup = state.currentUsers.find(u => u.username === renderUserData.username);
    const superIcon = latestUserLookup ? latestUserLookup.superIcon : renderUserData.superIcon;
    const gifts = latestUserLookup ? latestUserLookup.gifts : renderUserData.gifts;
    
    // Fallback chain for ucol, bg, and fontColor matching user profile or active/current state
    const ucol = 
      (latestUserLookup ? latestUserLookup.ucol : null) || 
      renderUserData.ucol || 
      (state.currentUser && state.currentUser.username === renderUserData.username ? state.currentUser.ucol : null) || 
      '';

    const bg = 
      (latestUserLookup ? latestUserLookup.bg : null) || 
      renderUserData.bg || 
      (state.currentUser && state.currentUser.username === renderUserData.username ? state.currentUser.bg : null) || 
      'transparent';

    const fontColor = 
      (latestUserLookup ? latestUserLookup.fontColor : null) || 
      renderUserData.fontColor || 
      (state.currentUser && state.currentUser.username === renderUserData.username ? state.currentUser.fontColor : null) || 
      '';

    const topic = (latestUserLookup ? latestUserLookup.topic : renderUserData.topic) || renderUserData.username;

    const isNightMode = false; // Deprecated/Removed old toggle in favor of global dark mode

    let usernameStyle = '';
    let messageTextStyle = '';

    const isBgImage = (bg && bg !== 'transparent' && (bg.startsWith('http') || bg.startsWith('/'))) ? true : false;
    let bgStyle = '';
    if (isBgImage) {
      bgStyle = `background-image: url('${bg}'); background-size: cover; background-position: center; background-repeat: no-repeat;`;
    } else if (bg && bg !== 'transparent') {
      bgStyle = `background: ${bg};`;
    }
    usernameStyle = `${ucol ? `color: ${ucol};` : ''} ${bgStyle}`;
    messageTextStyle = fontColor ? `color: ${fontColor};` : '';

    if (!isNightMode && fontColor && fontColor !== '#000000' && fontColor !== 'transparent' && fontColor.startsWith('#')) {
      try {
        let hex = fontColor.replace('#', '');
        if (hex.length === 3) {
          hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16);
          const g = parseInt(hex.slice(2, 4), 16);
          const b = parseInt(hex.slice(4, 6), 16);
          if (!isNaN(r) && !isNaN(g) && !isNaN(b)) {
            div.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.03)`;
          }
        }
      } catch (e) {}
    }

    let replyHtml = '';
    if (replyTo) {
      // Rehydrate replyTo
      const replyUserId = replyTo.userId || replyTo.id;

      const latestReplyUser =
        state.currentUsers.find(u => String(u.userId || u.id) === String(replyUserId)) ||
        state.currentUsers.find(u => u.username === replyTo.username);

      const renderReplyUserData = {
        ...replyTo,
        ...(latestReplyUser || {}),
        id: latestReplyUser?.userId || latestReplyUser?.id || replyUserId || replyTo.id,
        userId: latestReplyUser?.userId || latestReplyUser?.id || replyUserId || replyTo.userId,
        username: replyTo.username || latestReplyUser?.username,
        superIcon: latestReplyUser?.superIcon !== undefined ? latestReplyUser.superIcon : replyTo.superIcon,
        gifts: latestReplyUser?.gifts !== undefined ? latestReplyUser.gifts : replyTo.gifts
      };

      if (isNightMode) {
        renderReplyUserData.ucol = '#cbd5e1';
        renderReplyUserData.bg = 'transparent';
      }

      let quotedMediaHtml = '';
      if (replyTo.mediaUrl) {
        if (replyTo.mediaType === 'image') {
          quotedMediaHtml = `<div class="quoted-media mt-1"><img src="${replyTo.mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;"></div>`;
        } else if (replyTo.mediaType === 'video') {
          quotedMediaHtml = `<div class="quoted-media mt-1"><video src="${replyTo.mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;" controls></video></div>`;
        } else if (replyTo.mediaType === 'youtube') {
          quotedMediaHtml = `<div class="quoted-media mt-1"><i class="fab fa-youtube"></i> يوتيوب</div>`;
        } else if (replyTo.mediaType === 'file') {
          quotedMediaHtml = `<div class="quoted-media mt-1"><i class="fas fa-file"></i> ملف</div>`;
        }
      }

      replyHtml = `
        <div class="quoted-message">
          <img src="${window.getAvatarUrl(renderReplyUserData)}" class="quoted-avatar" data-username="${escapeHTML(renderReplyUserData.username)}" data-is-hidden="${renderReplyUserData.isHidden ? 'true' : 'false'}" data-role-rank="${renderReplyUserData.roleRank || 0}" referrerPolicy="origin-when-cross-origin">
          <div class="quoted-content">
            ${window.renderUserIdentity(renderReplyUserData, {
              containerClasses: 'user-identity-inline',
              nameClasses: 'quoted-username',
              tag: 'span',
              onClick: `event.preventDefault();`
            })}
            <div class="quoted-text">${replaceMentions(replacePlaceholders(replaceShortcuts(escapeHTML(replyTo.text))))}</div>
            ${quotedMediaHtml}
          </div>
        </div>
      `;
    }

    let mediaHtml = '';
    if (mediaUrl && mediaType === 'youtube') {
      mediaHtml = `
        <div class="message-media mt-2">
          <div class="youtube-horizontal-placeholder" onclick="revealMedia(this, 'youtube', '${mediaUrl}', event)">
            <div class="yt-left-side">
              <i class="fab fa-youtube"></i>
            </div>
            <div class="yt-right-side">
              <img src="https://img.youtube.com/vi/${mediaUrl}/hqdefault.jpg" class="placeholder-thumb" onerror="this.src='https://img.youtube.com/vi/${mediaUrl}/mqdefault.jpg'">
              <div class="yt-play-label">تشغيل</div>
            </div>
          </div>
        </div>
      `;
    } else if (mediaUrl && mediaType === 'image') {
      mediaHtml = `
        <div class="message-media mt-2">
          <div class="media-placeholder image-placeholder" onclick="revealMedia(this, 'image', '${mediaUrl}', event)">
            <span>عرض الصورة</span>
            <div class="placeholder-icon"><i class="fas fa-image"></i></div>
          </div>
        </div>
      `;
    } else if (mediaUrl && mediaType === 'video') {
      mediaHtml = `
        <div class="message-media mt-2">
          <div class="media-placeholder video-placeholder" onclick="revealMedia(this, 'video', '${mediaUrl}', event)">
            <span>تشغيل الفيديو</span>
            <div class="placeholder-icon"><i class="fas fa-play-circle"></i></div>
          </div>
        </div>
      `;
    } else if (mediaUrl && mediaType === 'audio') {
      mediaHtml = `
        <div class="message-media mt-2">
          <audio src="${mediaUrl}" controls style="width: 100%;"></audio>
        </div>
      `;
    } else if (mediaUrl && mediaType === 'file') {
      mediaHtml = `
        <div class="message-media mt-2">
          <a href="${mediaUrl}" target="_blank" class="btn btn-sm btn-outline-primary mt-1"><i class="fas fa-file"></i> تحميل الملف</a>
        </div>
      `;
    }

    // Use innerHTML for text if it's a system message (contains HTML highlights)
    let textContent = user.isSystem ? text : escapeHTML(text);
    // Only play sound here for actual message receipt
    textContent = replaceMentions(replacePlaceholders(replaceShortcuts(textContent)), true);
    
    // Phase 6: Safe Linkification
    if (window.safeLinkify) {
      textContent = window.safeLinkify(textContent);
    }

    if (user.isAnnouncement) {
      textContent = `<div class="chat-ad-message"><span class="announcement-badge ad-icon"><i class="fas fa-bullhorn"></i> إعلان</span> <span class="ad-text">${textContent}</span></div>`;
    }

    const myRank = (state.currentUser && (state.currentUser.roleRank || (state.currentUser.group && state.currentUser.group.roleRank))) || 0;
    const targetRank = user.roleRank || 0;
        
    let canDelete = false;
    if (state.currentUser) {
      if (user.isAnnouncement) {
        const hasAnnouncePermission = hasPermission('canSendBroadcastMessages');
        const isHigherRank = myRank > targetRank || (state.currentUser.username === user.username);
        if (hasAnnouncePermission && (isHigherRank)) {
          canDelete = true;
        }
      } else {
        const isDeletionEnabled = window.featuresSettings && window.featuresSettings.publicMessageDeletionEnabled;
        canDelete = (state.currentUser.username === user.username && isDeletionEnabled || hasPermission('canDeletePublicMessages'));
      }
    }

    const isReplyEnabled = window.featuresSettings && window.featuresSettings.publicMessageReplyEnabled;
    let canReply = isReplyEnabled || hasPermission('canReplyToPublicMessages');
    if (user.isAnnouncement) {
      canReply = false;
    }

    // Allow user identity standard rendering
    let renderUserDataForIdentity = { ...renderUserData };
    if (isNightMode) {
      renderUserDataForIdentity.ucol = '#cbd5e1';
      renderUserDataForIdentity.bg = 'transparent';
    }
    const userIdentityHtml = window.renderUserIdentity(renderUserDataForIdentity, {
      nameClasses: 'message-username',
      nameStyle: usernameStyle
    });

    const avatarHtml = `<img src="${window.getAvatarUrl(renderUserData)}" class="message-avatar" data-username="${renderUserData.username}" data-is-hidden="${renderUserData.isHidden ? 'true' : 'false'}" data-role-rank="${renderUserData.roleRank || 0}" referrerPolicy="origin-when-cross-origin">`;

    div.innerHTML = `
      ${avatarHtml}
      <div class="message-body">
        <div class="message-header">
          ${userIdentityHtml}
        </div>
        ${replyHtml}
        ${mediaHtml}
        ${textContent ? `<div class="message-text" data-username="${user.username}" style="${messageTextStyle}">${textContent}</div>` : ''}
      </div>
      <div class="message-actions d-flex flex-row align-items-center gap-2">
        <div class="message-time" data-created-at="${createdAt}" style="font-size: 10px; color: #555;">${formatTimeAgo(createdAt)}</div>
        ${(user.isSystem || user.isBot || user.isGameBot) ? '' : `
        <div class="d-flex gap-1 justify-content-center">
          ${canReply ? '<button class="btn-msg-action reply-btn" title="رد"><i class="fas fa-reply"></i></button>' : ''}
          ${canDelete ? '<button class="btn-msg-action delete-btn" title="حذف"><i class="fas fa-times"></i></button>' : ''}
        </div>
        `}
      </div>
    `;

    const deleteBtn = div.querySelector('.delete-btn');
    const replyBtn = div.querySelector('.reply-btn');
    const indicator = div.querySelector('.swipe-indicator');

    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (id) {
          socket.emit('delete-message', { id, roomId: state.currentRoomId });
        } else {
          div.style.opacity = '0';
          div.style.transform = 'translateX(20px)';
          setTimeout(() => {
            if (div.parentNode) {
              div.parentNode.removeChild(div);
            }
          }, 200);
        }
      });
    }

    if (replyBtn) {
      replyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        state.setReplyingTo({
          user: renderUserData,
          text,
          mediaUrl,
          mediaType
        });
        if (ui.replyToAvatar) ui.replyToAvatar.src = window.getAvatarUrl(renderUserData);
        ui.replyToUser.innerHTML = window.renderUserIdentity(renderUserData, {
          containerClasses: 'user-identity-inline',
          nameClasses: 'quoted-username',
          tag: 'span'
        });
        ui.replyToText.innerHTML = replaceMentions(replacePlaceholders(replaceShortcuts(escapeHTML(text))));
        
        if (ui.replyToMedia) {
          if (mediaUrl) {
            if (mediaType === 'image') {
              ui.replyToMedia.innerHTML = `<img src="${mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;">`;
            } else if (mediaType === 'video') {
              ui.replyToMedia.innerHTML = `<video src="${mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;" controls></video>`;
            } else if (mediaType === 'youtube') {
              ui.replyToMedia.innerHTML = `<i class="fab fa-youtube"></i> يوتيوب`;
            }
          } else {
            ui.replyToMedia.innerHTML = '';
          }
        }
        
        ui.replyPreview.classList.remove('d-none');
        ui.chatInput.focus();
      });
    }

    // Swipe to reply logic (Touch & Mouse)
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    const handleStart = (clientX) => {
      if (user.isSystem || user.isBot || user.isGameBot) return;
      startX = clientX;
      currentX = clientX;
      isSwiping = true;
      div.style.transition = 'none';
    };

    const handleMove = (clientX) => {
      if (!isSwiping) return;
      currentX = clientX;
      const diff = currentX - startX;
      
      // Only allow swiping to the right (positive diff)
      if (diff > 0 && diff < 180) {
        // Apply resistance as we pull further
        const resistanceDiff = diff < 70 ? diff : 70 + (diff - 70) * 0.25;
        div.style.transform = `translateX(${resistanceDiff}px)`;
        
        // Show indicator based on distance
        if (indicator) {
          const threshold = 60;
          indicator.style.opacity = Math.min(diff / threshold, 1);
          indicator.style.left = `${-45 + Math.min(diff / 1.2, 75)}px`;
          
          if (diff > threshold) {
            if (!indicator.classList.contains('active')) {
              indicator.classList.add('active');
              // Haptic feedback when threshold is reached
              if (window.navigator && window.navigator.vibrate) {
                window.navigator.vibrate(15);
              }
            }
          } else {
            indicator.classList.remove('active');
          }
        }
      }
    };

    const handleEnd = () => {
      if (!isSwiping) return;
      const diff = currentX - startX;
      
      div.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      if (indicator) {
        indicator.style.opacity = '0';
        indicator.classList.remove('active');
      }

      if (diff > 60) {
        // Trigger reply
        state.setReplyingTo({
          user: renderUserData,
          text,
          mediaUrl,
          mediaType
        });
        if (ui.replyToAvatar) ui.replyToAvatar.src = window.getAvatarUrl(renderUserData);
        ui.replyToUser.innerHTML = window.renderUserIdentity(renderUserData, {
          containerClasses: 'user-identity-inline',
          nameClasses: 'quoted-username',
          tag: 'span'
        });
        ui.replyToText.innerHTML = replaceMentions(replacePlaceholders(replaceShortcuts(escapeHTML(text))));
        
        if (ui.replyToMedia) {
          if (mediaUrl) {
            if (mediaType === 'image') {
              ui.replyToMedia.innerHTML = `<img src="${mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;">`;
            } else if (mediaType === 'video') {
              ui.replyToMedia.innerHTML = `<video src="${mediaUrl}" style="max-width: 100%; max-height: 150px; border-radius: 4px;" controls></video>`;
            } else if (mediaType === 'youtube') {
              ui.replyToMedia.innerHTML = `<i class="fab fa-youtube"></i> يوتيوب`;
            }
          } else {
            ui.replyToMedia.innerHTML = '';
          }
        }
        
        ui.replyPreview.classList.remove('d-none');
        ui.chatInput.focus();
        
        // Visual feedback
        div.style.backgroundColor = '#f0f7ff';
        setTimeout(() => div.style.backgroundColor = '#fff', 500);
        
        // Haptic feedback if available
        if (window.navigator && window.navigator.vibrate) {
          window.navigator.vibrate(10);
        }
      }
      
      div.style.transform = 'translateX(0)';
      isSwiping = false;
    };

    // Swipe logic removed

  }
  return div;
}


// High-performance queueing system for public/system messages
publicMessageQueue = publicMessageQueue || [];
publicMessageRAF = null;

