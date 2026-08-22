/* ═══════════════════════════════════════════════════════════════
   MAIN-PART 18/28 · text-shortcuts-placeholders
   lines 6928–7058 of the original main.js (verbatim, ordered)
   ⚠ ORDER MATTERS — do not rename/reorder parts.
   Build: node build-chat.cjs  (concatenates parts → esbuild)
   ═══════════════════════════════════════════════════════════ */
function replaceShortcuts(text) {
  // Admin-defined text shortcuts (control panel list): name -> value, applied
  // first so values can themselves contain emoji shortcuts expanded below.
  try {
    const scList = state.shortcuts;
    if (Array.isArray(scList) && scList.length) {
      const sig = scList.map(s => s && s.name).join('|');
      if (!cachedShrtRegex || sig !== lastShrtSig) {
        lastShrtSig = sig;
        cachedShrtMap.clear();
        const sorted = scList.filter(s => s && s.name)
          .sort((a, b) => String(b.name).length - String(a.name).length);
        sorted.forEach(s => cachedShrtMap.set(window.normalizeNumerals(String(s.name)), String(s.value ?? '')));
        const pat = sorted
          .map(s => window.normalizeNumeralsPattern(String(s.name)))
          .filter(p => p.length > 0)
          .join('|');
        cachedShrtRegex = pat ? new RegExp(`(${pat})`, 'g') : null;
      }
      if (cachedShrtRegex) {
        const escHtmlVal = (v) => String(v)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        text = text.toString().replace(cachedShrtRegex, (m) => {
          const v = cachedShrtMap.get(window.normalizeNumerals(m));
          return v !== undefined ? escHtmlVal(v) : m;
        });
      }
    }
  } catch (e) { /* never block message flow on shortcut errors */ }
  if (!state.smileys || !Array.isArray(state.smileys) || state.smileys.length === 0) return text;

  // Check if we need to rebuild the cache
  if (!cachedShortcutsRegex || state.smileys.length !== lastSmileysCount) {
    lastSmileysCount = state.smileys.length;
    cachedSortedSmileys = [...state.smileys].sort((a, b) => b.shortcut.length - a.shortcut.length);
    
    // Re-populate Map for O(1) lookups
    cachedSmileysMap.clear();
    cachedSortedSmileys.forEach(s => cachedSmileysMap.set(window.normalizeNumerals(s.shortcut), s));
    
    const pattern = cachedSortedSmileys
      .map(s => window.normalizeNumeralsPattern(s.shortcut || ''))
      .filter(p => p.length > 0)
      .join('|');
    
    if (pattern) {
      // Use a more lenient pattern that doesn't strictly require spaces if the shortcut is distinct
      // This helps with shortcuts like ه1 that users might type quickly or together
      cachedShortcutsRegex = new RegExp(`(${pattern})`, 'g');
    } else {
      cachedShortcutsRegex = null;
    }
  }
  
  if (!cachedShortcutsRegex) return text;

  // Protect __SMILEY|...__ placeholders
  const placeholders = [];
  let protectedText = text.toString().replace(/__SMILEY\|[\s\S]*?__/g, (match) => {
    placeholders.push(match);
    return `___PLACEHOLDER_${placeholders.length - 1}___`;
  });

  // Protect any __SHT|...__ placeholders
  const shtPlaceholders = [];
  protectedText = protectedText.replace(/__SHT\|[\s\S]*?__SHT/g, (match) => {
    shtPlaceholders.push(match);
    return `___SHTPLACEHOLDER_${shtPlaceholders.length - 1}___`;
  });

  // Protect HTML tags (especially any existing <img> tags if any)
  const htmlTags = [];
  protectedText = protectedText.replace(/<[^>]+>/g, (match) => {
    htmlTags.push(match);
    return `___HTMLTAG_${htmlTags.length - 1}___`;
  });

  // Now replace shortcuts safely on the protected text
  protectedText = protectedText.replace(cachedShortcutsRegex, (match, p1) => {
    const shortcutText = p1 || match;
    const s = cachedSmileysMap.get(window.normalizeNumerals(shortcutText));
    if (!s) return match;

    const isSticker = s.type === 'sticker';
    const className = isSticker ? 'sticker-img' : 'smiley-img';
    
    const imgHtml = `<img src="${s.url}" class="${className}" alt="${s.shortcut}" title="${s.order}">`;
    return imgHtml;
  });

  // Restore HTML tags
  protectedText = protectedText.replace(/___HTMLTAG_(\d+)___/g, (match, index) => {
    return htmlTags[parseInt(index, 10)];
  });

  // Restore __SHT placeholders
  protectedText = protectedText.replace(/___SHTPLACEHOLDER_(\d+)___/g, (match, index) => {
    return shtPlaceholders[parseInt(index, 10)];
  });

  // Restore __SMILEY placeholders
  protectedText = protectedText.replace(/___PLACEHOLDER_(\d+)___/g, (match, index) => {
    return placeholders[parseInt(index, 10)];
  });

  return protectedText;
}

function replacePlaceholders(text) {
  if (!text) return '';
  
  // 1. Process Shortcuts first (they might contain stickers/smileys __SMILEY tags)
  let res = text.replace(/__SHT\|([^|]*)\|([\s\S]*?)__SHT/g, (match, key, val) => {
    return `<span class="shortcut-text" title="${key}">${val}</span>`;
  });
  
  // 2. Process Smileys/Stickers
  res = res.replace(/__SMILEY\|(.*?)\|(.*?)\|(.*?)\|(.*?)\|(.*?)__/g, (match, url, width, height, name, type) => {
    const className = type === 'sticker' ? 'sticker-img' : 'smiley-img';
    const style = width && height ? `style="width: ${width}; height: ${height};"` : '';
    return `<img src="${url}" class="${className}" ${style} alt="" loading="lazy">`;
  });
  
  return res;
}

window.replacePlaceholders = replacePlaceholders;
window.replaceShortcuts = replaceShortcuts;

/* Mentions Implementation */
