/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 25/28 · message-batch-users-list
   lines 9675–10405 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function appendMessage(data) {
  publicMessageQueue.push({ type: 'public', data });
  schedulePublicMessageRender();
}

function appendSystemMessage(data) {
  if (data && data.isAnnouncement && data.user) {
    appendMessage({
      id: data.id,
      user: { ...data.user, isAnnouncement: true },
      text: data.content,
      createdAt: data.createdAt
    });
    return;
  }
  publicMessageQueue.push({ type: 'system', data });
  schedulePublicMessageRender();
}

function schedulePublicMessageRender() {
  if (publicMessageRAF) return;
  publicMessageRAF = requestAnimationFrame(() => {
    publicMessageRAF = null;
    if (publicMessageQueue.length === 0) return;

    const messagesToProcess = [...publicMessageQueue];
    publicMessageQueue = [];

    const chatScroller = ui.messagesContainer;
    if (!chatScroller) return;

    // Clear chat-cleared-container once if it exists
    const clearedContainer = chatScroller.querySelector('.chat-cleared-container');
    if (clearedContainer) {
      chatScroller.innerHTML = '';
    }

    // Scroll check BEFORE appending to avoid layout calculations in the middle
    const isAtBottom = chatScroller.scrollHeight - chatScroller.scrollTop - chatScroller.clientHeight < 300;

    const fragment = document.createDocumentFragment();
    const imagesToTrack = [];

    messagesToProcess.forEach(item => {
      let div = null;
      try {
        if (item.type === 'public') {
          div = createMessageElement(item.data);
        } else if (item.type === 'system') {
          div = createSystemMessageElement(item.data);
        }
      } catch (err) {
        console.error('Error rendering message in batch:', err);
      }

      if (div) {
        fragment.appendChild(div);

        // Manual trigger for cached images
        div.querySelectorAll('.user-identity-super').forEach(img => {
          if (img.complete) {
            window.handleUserIdentitySuperLoad(img, img.getAttribute('src'));
          }
        });

        if (isAtBottom) {
          div.querySelectorAll('img').forEach(img => {
            imagesToTrack.push(img);
          });
        }
      }
    });

    if (fragment.children.length > 0) {
      chatScroller.appendChild(fragment);

      // Limit messages to 50 for better performance balance (done ONCE per batch!)
      while (chatScroller.children.length > 50) {
        chatScroller.removeChild(chatScroller.firstChild);
      }

      if (isAtBottom) {
        // Immediate scroll for faster feeling
        chatScroller.scrollTop = chatScroller.scrollHeight;

        // Follow up scroll on image loads
        if (imagesToTrack.length > 0) {
          imagesToTrack.forEach(img => {
            img.onload = () => {
              chatScroller.scrollTop = chatScroller.scrollHeight;
            };
          });
          // Fallback timeout in case image loading is slow/fails
          setTimeout(() => {
            chatScroller.scrollTop = chatScroller.scrollHeight;
          }, 100);
        }
      }
    }
  });
}

function syncDOMList(container, items) {
  if (!container) return;
  
  // Create a map of existing nodes by ID
  const existingNodes = Array.from(container.children);
  const existingMap = new Map();
  existingNodes.forEach(node => {
    if (node.id) existingMap.set(node.id, node);
  });

  let prevNode = null;
  const tempContainer = document.createElement('div');

  items.forEach(item => {
    let node = existingMap.get(item.id);
    let html = item.html.trim();

    if (!node) {
      // Create new node
      tempContainer.innerHTML = html;
      node = tempContainer.firstElementChild;
      if (node) {
        node.id = item.id;
        // Optimization: Save signature to avoid checking outerHTML strings if possible, 
        // but outerHTML comparison is fast enough for small lists
        node.dataset.signature = html; 
      }
    } else {
      // Node exists, check if html changed
      if (node.dataset.signature !== html) {
        tempContainer.innerHTML = html;
        const newNode = tempContainer.firstElementChild;
        if (newNode) {
          if (typeof window.syncNodes === 'function') {
            window.syncNodes(node, newNode);
          } else {
            node.innerHTML = newNode.innerHTML;
            node.className = newNode.className;
            node.style.cssText = newNode.style.cssText;
          }
          node.dataset.signature = html;
        }
      }
      existingMap.delete(item.id);
    }

    if (node) {
      if (!prevNode) {
        if (container.firstChild !== node) {
          container.prepend(node);
        }
      } else {
        if (node.previousSibling !== prevNode) {
          prevNode.after(node);
        }
      }
      prevNode = node;
    }
  });

  // Remove nodes that are no longer in the list
  existingMap.forEach(node => node.remove());
}


function updateOnlineCounters(users) {
  const onlineCount = users.filter(u => u.isOnline || u.isGhost).length;
  console.debug('Updating online counters, count:', onlineCount);
  if (ui.onlineCount) {
    ui.onlineCount.innerText = onlineCount;
    console.debug('Updated onlineCount innerText');
  }
  if (ui.landingUsersCount) {
    ui.landingUsersCount.innerHTML = `<i class="fas fa-user-friends"></i> ${onlineCount}`;
    console.debug('Updated landingUsersCount innerHTML');
  }
}

let forceUpdateUsersListFlag = false;
function updateUsersList(users, options = {}) {
  pendingUsersPayload = users;
  if (options && options.force) {
    forceUpdateUsersListFlag = true;
  }
  
  if (!updateUsersListRAF) {
    updateUsersListRAF = requestAnimationFrame(() => {
      updateUsersListRAF = null;
      if (!pendingUsersPayload) return;
      
      const payloadToProcess = pendingUsersPayload;
      pendingUsersPayload = null;
      
      const force = forceUpdateUsersListFlag;
      forceUpdateUsersListFlag = false;

      // Deep stringify to avoid superficial check
      const payloadString = JSON.stringify(payloadToProcess);
      if (payloadString === lastUsersPayloadString && !force) {
          // Exactly the same payload, no need to re-render or re-sort
          return;
      }
      lastUsersPayloadString = payloadString;

      // Sort users by isGhost ascending (non-ghost first), then roleRank descending, then joinTime ascending, then username
      const sortedUsers = [...payloadToProcess].sort((a, b) => {
        const ghostA = !!a.isGhost;
        const ghostB = !!b.isGhost;
        if (ghostA !== ghostB) return ghostA ? 1 : -1;

        const rankA = a.roleRank || (a.group && a.group.roleRank) || 0;
        const rankB = b.roleRank || (b.group && b.group.roleRank) || 0;
        if (rankA !== rankB) return rankB - rankA;
        
        const joinA = a.joinTime || 0;
        const joinB = b.joinTime || 0;
        if (joinA !== joinB) return joinA - joinB;
        
        return (a.username || '').localeCompare(b.username || '');
      });

      state.setCurrentUsers(sortedUsers);
      
      sortedUsers.forEach(u => {
        if (typeof window.updateSpeakerMutedIcon === 'function') {
          window.updateSpeakerMutedIcon(
            u.userId || u.id,
            u.username,
            u.isSpeakerMuted === true || u.isSpeakerMuted === 'true'
          );
        }
      });
      
      if (typeof profileUser !== 'undefined' && profileUser) {
        const found = sortedUsers.find(u => u.username === profileUser.username || (profileUser.id && (u.id === profileUser.id || u.userId === profileUser.id)));
        if (found) {
          profileUser = { ...profileUser, ...found };
          window.profileUser = profileUser;
          if (typeof updateProfileButtons === 'function') {
            updateProfileButtons(profileUser, 5000);
          }
        }
      }

      updateOnlineCounters(sortedUsers);
      console.debug('Users list updated with', sortedUsers.length, 'users');
      console.debug('landingUsersCount exists:', !!ui.landingUsersCount);
      
      if (updateUsersListTimeout) clearTimeout(updateUsersListTimeout);
      updateUsersListTimeout = setTimeout(() => {
        updateUserVisuals(sortedUsers);
      }, 100);

      // Only render sidebar if tab is active and sidebar is actually open
      if (state.activeSidebarTab === 'users' && ui.sidebar && ui.sidebar.classList.contains('open')) {
         if (!ui.sidebarUsersContainer) ui.sidebarUsersContainer = document.getElementById('sidebar-users-container');
         if (ui.sidebarUsersContainer) {
           if (ui.sidebarSearchInput && ui.sidebarSearchInput.value.trim()) {
             const query = ui.sidebarSearchInput.value.trim().toLowerCase();
             const filteredUsers = sortedUsers.filter(u => 
                (u.username && u.username.toLowerCase().includes(query)) || 
                (u.topic && u.topic.toLowerCase().includes(query))
             );
             renderUsersInSidebar(filteredUsers);
           } else {
             renderUsersInSidebar(sortedUsers);
           }
         }
      } else {
        loadedTabs['users'] = false; // Mark as stale so it re-renders next time tab is opened
      }
    });
  }
}

presenceUsersMap = presenceUsersMap || new Map();
presenceUsersVersion = presenceUsersVersion || 0;

window.getPresenceDomId = getPresenceDomId;
function getPresenceDomId(key) {
  if (!key) return 'sidebar-user-unknown';
  const safeKey = String(key).replace(/[^a-zA-Z0-9_-]/g, (char) => {
    return `_${char.charCodeAt(0).toString(16)}_`;
  });
  return `sidebar-user-${safeKey}`;
}

window.getPresenceKey = getPresenceKey;
function getPresenceKey(u) {
  if (u && u.key) return u.key;
  if (!u) return 'unknown:0';
  const isGuest = u.type === 'guest' || u.isGuest || u.guestId || (typeof u.id === 'number' && u.id < 0) || (u.id && String(u.id).startsWith('g_'));
  if (isGuest) {
    const guestId = u.guestId ?? u.userId ?? u.id ?? 'unknown';
    return `guest:${guestId}`;
  }
  const memberId = u.userId ?? u.id ?? 'unknown';
  return `member:${memberId}`;
}

window.getUserPresenceColor = function(u) {
  if (!u) return '#6c757d'; // Default safe gray (offline/unknown)
  let statusColor = '#6c757d'; // Offline (gray)
  if (u.isOnline) {
    if ((u.isVirtualUser || u.isBotOrVirtual || u.type === 'bot') && u.onlineStatusStr) {
      if (u.onlineStatusStr === 'أخضر') statusColor = '#28a745';
      else if (u.onlineStatusStr === 'أحمر') statusColor = '#dc3545';
      else if (u.onlineStatusStr === 'أصفر') statusColor = '#ffc107';
      else if (u.onlineStatusStr === 'أزرق') statusColor = '#007bff';
      else statusColor = '#6c757d';
    } else if (u.isBotOrVirtual || u.type === 'bot') {
      statusColor = '#28a745';
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

  const isActuallyOnline = u.isOnline && !u.isGhost;
  const isYellow = statusColor === '#ffc107';
  const borderColor = (isActuallyOnline && u.allowPrivate === false && !isYellow) ? '#dc3545' : statusColor;
  return u.isGhost ? '#808080' : borderColor;
};

window.getPresenceUserColor = function(user) {
  if (!user) return '#6c757d';
  const key = (typeof window.getPresenceKey === 'function') ? window.getPresenceKey(user) : null;
  let presUser = null;
  if (key && typeof presenceUsersMap !== 'undefined' && presenceUsersMap && presenceUsersMap.has(key)) {
    presUser = presenceUsersMap.get(key);
  }
  
  if (!presUser) {
    const curUser = (typeof state !== 'undefined' && state) ? state.currentUser : null;
    if (curUser) {
      const curKey = (typeof window.getPresenceKey === 'function') ? window.getPresenceKey(curUser) : null;
      if (curKey && curKey === key) {
        presUser = { ...user, isOnline: true };
      }
    }
  }

  if (presUser) {
    return window.getUserPresenceColor(presUser);
  }
  return '#6c757d'; // Default safe gray if status unavailable or offline
};

window.updateProfileHeaderPresenceStatus = function(targetUser) {
  const user = targetUser || window.profileUser;
  if (!user) return;
  const headerAvatar = document.getElementById('profile-avatar-header');
  if (!headerAvatar) return;

  const color = window.getPresenceUserColor(user);
  headerAvatar.style.borderLeft = `4px solid ${color}`;
};

function updateUsersSnapshot(version, users) {
  if (version && presenceUsersVersion && version < presenceUsersVersion) {
    return;
  }
  window.__snapshotRequestPending = false;
  
  const newMap = new Map();
  if (Array.isArray(users)) {
    users.forEach(u => {
      const key = getPresenceKey(u);
      u.key = key;
      const oldU = presenceUsersMap.get(key);
      if (oldU && u.cover === undefined && oldU.cover) {
        u.cover = oldU.cover;
      }
      newMap.set(key, u);
    });
  }
  
  for (const [key, oldU] of presenceUsersMap.entries()) {
    if (!newMap.has(key)) {
      if (state && state.previousUserSignatures) {
        delete state.previousUserSignatures[key];
      }
      const domId = getPresenceDomId(key);
      const el = document.getElementById(domId);
      if (el) el.remove();
    }
  }
  
  presenceUsersMap = newMap;
  presenceUsersVersion = version || 0;

  const allUsers = Array.from(presenceUsersMap.values());
  state.setCurrentUsers(allUsers);
  updateOnlineCounters(allUsers);
  updateUsersList(allUsers, { force: true });
  if (typeof window.updateProfileHeaderPresenceStatus === 'function') {
    window.updateProfileHeaderPresenceStatus();
  }
  if (typeof profileUser !== 'undefined' && profileUser) {
    const updatedU = allUsers.find(u => u.username === profileUser.username || u.id === profileUser.id || u.userId === profileUser.userId);
    if (updatedU) {
      profileUser = { ...profileUser, ...updatedU };
      window.profileUser = profileUser;
      if (typeof updateProfileButtons === 'function') {
        updateProfileButtons(profileUser, 5000);
      }
    }
  }
}

function repositionSingleUserElement(u, el) {
  if (!ui.sidebarUsersContainer || !el) return;
  
  const comparator = (a, b) => {
    const ghostA = !!a.isGhost;
    const ghostB = !!b.isGhost;
    if (ghostA !== ghostB) return ghostA ? 1 : -1;

    const rankA = a.roleRank || (a.group && a.group.roleRank) || 0;
    const rankB = b.roleRank || (b.group && b.group.roleRank) || 0;
    if (rankA !== rankB) return rankB - rankA;
    const joinA = a.joinTime || 0;
    const joinB = b.joinTime || 0;
    if (joinA !== joinB) return joinA - joinB;
    return (a.username || '').localeCompare(b.username || '');
  };

  const isCurrentRoom = Number(u.roomId) === Number(state.currentRoomId);
  let header = document.getElementById('other-rooms-header');

  if (isCurrentRoom) {
    let insertBeforeEl = null;
    const children = Array.from(ui.sidebarUsersContainer.children);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.id === 'other-rooms-header') break;
      if (child === el) continue;
      const childKey = child.id.replace('sidebar-user-', '');
      let childU = presenceUsersMap.get(childKey);
      if (!childU) {
        for (const [k, val] of presenceUsersMap.entries()) {
          if (getPresenceDomId(k) === child.id) {
            childU = val;
            break;
          }
        }
      }
      if (childU && comparator(u, childU) < 0) {
        insertBeforeEl = child;
        break;
      }
    }

    if (insertBeforeEl) {
      insertBeforeEl.before(el);
    } else if (header) {
      header.before(el);
    } else {
      ui.sidebarUsersContainer.appendChild(el);
    }
  } else {
    if (!header) {
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = `<div id="other-rooms-header" class="other-rooms-header">المتواجدين في الدردشة</div>`;
      header = tempDiv.firstElementChild;
      ui.sidebarUsersContainer.appendChild(header);
    }

    let insertBeforeEl = null;
    let inSection2 = false;
    const children = Array.from(ui.sidebarUsersContainer.children);
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.id === 'other-rooms-header') {
        inSection2 = true;
        continue;
      }
      if (!inSection2 || child === el) continue;

      let childU = null;
      for (const [k, val] of presenceUsersMap.entries()) {
        if (getPresenceDomId(k) === child.id) {
          childU = val;
          break;
        }
      }
      if (childU && comparator(u, childU) < 0) {
        insertBeforeEl = child;
        break;
      }
    }

    if (insertBeforeEl) {
      insertBeforeEl.before(el);
    } else {
      ui.sidebarUsersContainer.appendChild(el);
    }
  }

  header = document.getElementById('other-rooms-header');
  if (header && !header.nextElementSibling) {
    header.remove();
  }
}

function updateUsersPatch(version, upserts, removes) {
  if (version && presenceUsersVersion) {
    if (version <= presenceUsersVersion) {
      return;
    }
    if (version > presenceUsersVersion + 1) {
      if (!window.__snapshotRequestPending) {
        window.__snapshotRequestPending = true;
        setTimeout(() => { window.__snapshotRequestPending = false; }, 3000);
        if (typeof safeRequestUsersSnapshot === 'function') {
          safeRequestUsersSnapshot();
        } else if (typeof socket !== 'undefined' && socket && socket.emit) {
          socket.emit('request-users-snapshot');
        }
      }
      return;
    }
  }
  if (version) {
    presenceUsersVersion = version;
  }

  if (Array.isArray(removes) && removes.length > 0) {
    removes.forEach(key => {
      if (presenceUsersMap.has(key)) {
        presenceUsersMap.delete(key);
      }
      if (state && state.previousUserSignatures) {
        delete state.previousUserSignatures[key];
      }
      if (state && Array.isArray(state.currentUsers)) {
        const idx = state.currentUsers.findIndex(u => u.key === key);
        if (idx !== -1) {
          state.currentUsers.splice(idx, 1);
        }
      }
      const domId = getPresenceDomId(key);
      const el = document.getElementById(domId);
      if (el) {
        el.remove();
      }
    });
    if (ui.sidebarUsersContainer) {
      const header = document.getElementById('other-rooms-header');
      if (header && !header.nextElementSibling) {
        header.remove();
      }
    }
  }

  const modifiedUsersForVisuals = [];

  if (Array.isArray(upserts) && upserts.length > 0) {
    upserts.forEach(u => {
      const key = getPresenceKey(u);
      u.key = key;
      const oldU = presenceUsersMap.get(key);
      
      const isNew = !oldU;
      const oldGhost = oldU ? !!oldU.isGhost : false;
      const newGhost = !!u.isGhost;
      const ghostChanged = oldGhost !== newGhost;
      const oldRank = oldU ? (oldU.roleRank || (oldU.group && oldU.group.roleRank) || 0) : 0;
      const newRank = u.roleRank || (u.group && u.group.roleRank) || 0;
      const rankChanged = oldRank !== newRank;
      const roomChanged = oldU ? (Number(oldU.roomId) !== Number(u.roomId)) : false;
      const joinTimeChanged = oldU ? ((oldU.joinTime || 0) !== (u.joinTime || 0)) : false;
      const typeChanged = oldU ? ((oldU.type || '') !== (u.type || '')) : false;
      const usernameChanged = oldU ? ((oldU.username || '') !== (u.username || '')) : false;

      const needsReposition = isNew || ghostChanged || rankChanged || roomChanged || joinTimeChanged || typeChanged || usernameChanged || !document.getElementById(getPresenceDomId(key));

      const mergedU = oldU ? { ...oldU, ...u } : { ...u };
      if (oldU && u.cover === undefined && oldU.cover) {
        mergedU.cover = oldU.cover;
      }

      presenceUsersMap.set(key, mergedU);
      modifiedUsersForVisuals.push(mergedU);
      
      if (state && Array.isArray(state.currentUsers)) {
        const idx = state.currentUsers.findIndex(item => item.key === key);
        if (idx !== -1) {
          state.currentUsers[idx] = mergedU;
        } else {
          state.currentUsers.push(mergedU);
        }
        state.currentUsers.sort((a, b) => {
          const ghostA = !!a.isGhost;
          const ghostB = !!b.isGhost;
          if (ghostA !== ghostB) return ghostA ? 1 : -1;

          const rankA = a.roleRank || (a.group && a.group.roleRank) || 0;
          const rankB = b.roleRank || (b.group && b.group.roleRank) || 0;
          if (rankA !== rankB) return rankB - rankA;
          const joinA = a.joinTime || 0;
          const joinB = b.joinTime || 0;
          if (joinA !== joinB) return joinA - joinB;
          return (a.username || '').localeCompare(b.username || '');
        });
      }

      if (state && state.currentUser && (state.currentUser.id === mergedU.id || state.currentUser.userId === mergedU.userId)) {
        if (mergedU.cover !== undefined && mergedU.cover !== null) {
          state.currentUser.cover = mergedU.cover;
        }
      }

      if (typeof profileUser !== 'undefined' && profileUser && (profileUser.key === key || profileUser.username === mergedU.username || profileUser.id === mergedU.id || profileUser.userId === mergedU.userId)) {
        profileUser = { ...profileUser, ...mergedU };
        window.profileUser = profileUser;
        if (typeof window.renderProfileCover === 'function') {
          window.renderProfileCover(mergedU.cover, mergedU);
        }
        if (typeof updateProfileButtons === 'function') {
          updateProfileButtons(profileUser, 5000);
        }
      }

      if (typeof window.updateSpeakerMutedIcon === 'function') {
        window.updateSpeakerMutedIcon(
          u.userId || u.id,
          u.username,
          u.isSpeakerMuted === true || u.isSpeakerMuted === 'true'
        );
      }

      if (state.activeSidebarTab === 'users' && ui.sidebar && ui.sidebar.classList.contains('open')) {
        if (ui.sidebarSearchInput && ui.sidebarSearchInput.value.trim()) {
          const query = ui.sidebarSearchInput.value.trim().toLowerCase();
          const allArr = Array.from(presenceUsersMap.values());
          const filtered = allArr.filter(item => 
            (item.username && item.username.toLowerCase().includes(query)) || 
            (item.topic && item.topic.toLowerCase().includes(query))
          );
          if (typeof renderUsersInSidebar === 'function') renderUsersInSidebar(filtered);
        } else {
          const domId = getPresenceDomId(key);
          let el = document.getElementById(domId);

          if (needsReposition) {
            if (!el && typeof window.renderUserObj === 'function') {
              const itemObj = window.renderUserObj(u);
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = itemObj.html.trim();
              el = tempDiv.firstElementChild;
              if (el) {
                el.id = domId;
                el.dataset.signature = itemObj.html;
              }
            } else if (el && typeof window.renderUserObj === 'function') {
              const newObj = window.renderUserObj(u);
              if (el.dataset.signature !== newObj.html) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = newObj.html.trim();
                const newEl = tempDiv.firstElementChild;
                if (newEl) {
                  if (typeof window.syncNodes === 'function') {
                    window.syncNodes(el, newEl);
                  } else {
                    el.innerHTML = newEl.innerHTML;
                    el.className = newEl.className;
                    el.style.cssText = newEl.style.cssText;
                  }
                  el.dataset.signature = newObj.html;
                }
              }
            }
            if (el) {
              repositionSingleUserElement(u, el);
            }
          } else if (el && typeof window.renderUserObj === 'function') {
            const newObj = window.renderUserObj(u);
            if (el.dataset.signature !== newObj.html) {
              const tempDiv = document.createElement('div');
              tempDiv.innerHTML = newObj.html.trim();
              const newEl = tempDiv.firstElementChild;
              if (newEl) {
                if (typeof window.syncNodes === 'function') {
                  window.syncNodes(el, newEl);
                } else {
                  el.innerHTML = newEl.innerHTML;
                  el.className = newEl.className;
                  el.style.cssText = newEl.style.cssText;
                }
                el.dataset.signature = newObj.html;
              }
            }
          }
        }
      } else {
        loadedTabs['users'] = false;
      }
    });
  }

  let onlineCount = 0;
  for (const u of presenceUsersMap.values()) {
    if (u.isOnline || u.isGhost) onlineCount++;
  }
  if (ui.onlineCount) {
    ui.onlineCount.innerText = onlineCount;
  }
  if (ui.landingUsersCount) {
    ui.landingUsersCount.innerHTML = `<i class="fas fa-user-friends"></i> ${onlineCount}`;
  }

  if (modifiedUsersForVisuals.length > 0) {
    if (updateUsersListTimeout) clearTimeout(updateUsersListTimeout);
    updateUsersListTimeout = setTimeout(() => {
      updateUserVisuals(modifiedUsersForVisuals);
    }, 50);
  }

  if (typeof window.updateProfileHeaderPresenceStatus === 'function') {
    window.updateProfileHeaderPresenceStatus();
  }
}

