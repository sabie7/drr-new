/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 19/28 · mentions
   lines 7059–7264 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function setupMentions() {
  if (!ui.chatInput || !window.featuresSettings?.mentionsEnabled) return;
  
  const picker = document.getElementById('mentions-picker');
  if (!picker) return;

  let activeIndex = -1;
  let filteredUsers = [];

  ui.chatInput.addEventListener('keydown', (e) => {
    if (picker.classList.contains('d-none')) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % filteredUsers.length;
      updateActiveMention();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + filteredUsers.length) % filteredUsers.length;
      updateActiveMention();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (filteredUsers.length > 0 && activeIndex >= 0) {
        e.preventDefault();
        selectMention(filteredUsers[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      hideMentions();
    }
  });

  ui.chatInput.addEventListener('input', () => {
    const text = ui.chatInput.value;
    const caretPos = ui.chatInput.selectionStart;
    const textBeforeCaret = text.substring(0, caretPos);
    const words = textBeforeCaret.split(/\s/);
    const lastWord = words[words.length - 1];

    if (lastWord.startsWith('@')) {
      const query = lastWord.substring(1).toLowerCase();
      showMentions(query);
    } else {
      hideMentions();
    }
  });

  function showMentions(query) {
    // currentUsers comes from state module
    filteredUsers = state.currentUsers.filter(u => 
      Number(u.roomId) === Number(state.currentRoomId) && (
        (u.username && u.username.toLowerCase().includes(query)) || 
        (u.topic && u.topic.toLowerCase().includes(query)) ||
        (u.nickname && u.nickname.toLowerCase().includes(query))
      )
    ).slice(0, 10);

    if (filteredUsers.length === 0) {
      hideMentions();
      return;
    }

    picker.innerHTML = filteredUsers.map((u, i) => {
      return `
        <div class="mention-item ${i === activeIndex ? 'active' : ''}" data-index="${i}">
          <img src="${window.getAvatarUrl(u)}" class="mention-avatar" onerror="window.handleAvatarError(this)" alt="">
          <div class="mention-info d-flex align-items-center">
            ${window.renderUserIdentity(u, {
                containerClasses: 'user-addon-container',
                nameClasses: 'nickname',
                nameStyle: 'color: inherit;'
            })}
          </div>
        </div>
      `;
    }).join('');

    picker.classList.remove('d-none');
    activeIndex = 0;
    updateActiveMention();

    // Position picker above input
    const rect = ui.chatInput.getBoundingClientRect();
    picker.style.bottom = (window.innerHeight - rect.top + 10) + 'px';
    picker.style.left = rect.left + 'px';
  }

  function hideMentions() {
    picker.classList.add('d-none');
    activeIndex = -1;
  }

  function updateActiveMention() {
    const items = picker.querySelectorAll('.mention-item');
    items.forEach((item, i) => {
      item.classList.toggle('active', i === activeIndex);
    });
  }

  function selectMention(user) {
    const text = ui.chatInput.value;
    const caretPos = ui.chatInput.selectionStart;
    const textBeforeCaret = text.substring(0, caretPos);
    const textAfterCaret = text.substring(caretPos);
    
    const words = textBeforeCaret.split(/\s/);
    const displayName = user.topic || user.nickname || user.username;
    // استبدال النص بالزخرفة أو الاسم المستعار
    words[words.length - 1] = `@${displayName} `;
    
    ui.chatInput.value = words.join(' ') + textAfterCaret;
    hideMentions();
    ui.chatInput.focus();
  }

  picker.addEventListener('click', (e) => {
    const item = e.target.closest('.mention-item');
    if (item) {
      const index = parseInt(item.dataset.index);
      selectMention(filteredUsers[index]);
    }
  });

  // Hide on blur or click away
  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target) && e.target !== ui.chatInput) {
      hideMentions();
    }
  });
}

function replaceMentions(text, playSound = false) {
  if (!window.featuresSettings?.mentionsEnabled) return text;
  
  if (!state.currentUsers || state.currentUsers.length === 0) return text;
  
  let result = text;
  
  // Create an array of possible mention names for each user, sorted by longest name first to avoid partial matches
  let mentionOptions = [];
  state.currentUsers.forEach(u => {
    if (u.topic && u.topic.trim() !== '') mentionOptions.push({ name: u.topic, user: u });
    if (u.nickname && u.nickname.trim() !== '') mentionOptions.push({ name: u.nickname, user: u });
    if (u.username && u.username.trim() !== '') mentionOptions.push({ name: u.username, user: u });
  });
  
  mentionOptions.sort((a, b) => b.name.length - a.name.length);
  
  let mentionedCurrentUser = false;

  mentionOptions.forEach(opt => {
     // Escape special regex chars in name
     const escapedName = opt.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
     // Match @Name, but ensure it's not part of another word
     const regex = new RegExp(`@${escapedName}(?=\\s|$|<)`, 'g');
     result = result.replace(regex, (match) => {
        if (state.currentUser && (opt.user.username === state.currentUser.username || opt.user.id === state.currentUser.id)) {
            mentionedCurrentUser = true;
        }
        return window.renderUserIdentity(opt.user, {
           containerClasses: 'mention-highlight',
           onClick: `window.showUserProfile('${opt.user.username}')`
        });
     });
  });

  // Play alert if the current user was mentioned, and the flag is true
  if (playSound && mentionedCurrentUser && window.profileSoundManager) {
      window.profileSoundManager.playAlert();
  }
  
  return result;
}

  socket.on('shortcuts:updated', loadShortcuts);
    socket.on('news-ticker-updated', function (nt) {
    if (typeof window.updateNewsTickerUI === 'function' && nt) window.updateNewsTickerUI(nt);
  });
  socket.on('settings-updated', function (d) {
    if (d && d.appearance && typeof applySiteAppearance === 'function') applySiteAppearance(d.appearance);
    if (d && d.siteweb) {
      try {
        var sw = d.siteweb;
        document.title = sw.title || sw.name || document.title;
      } catch (e) {}
    }
  });
  // Admin pressed "refresh everyone's pages"
  socket.on('reload_site', function () {
    setTimeout(function () { location.reload(); }, 400);
  });
  // Browser/OS bans saved mid-session: bounce matching clients now. The
  // connect-time check will present the proper Arabic block message.
  socket.on('banssystem-updated', function () {
    fetch('/api/check-env').then(function (r) { return r.json(); }).then(function (b) {
      if (b && b.banned) setTimeout(function () { location.reload(); }, 500);
    }).catch(function () {});
  });
socket.on('features-updated', function (fs2) {
    if (fs2 && typeof fs2 === 'object') window.featuresSettings = fs2;
  });
socket.on('smileys:updated', loadSmileys);

// Chat Handlers
lastActivityEmit = 0;
lastRealActivityAt = Date.now();
presenceIdleSent = false;

