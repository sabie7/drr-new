     1	/* ══════════════════════════════════════════════════════════════
     2	   EMOJI PICKER
     3	   Populates the existing #emoji-picker container (smiley + sticker
     4	   tabs) and inserts the chosen emoji into #chat-input at the cursor.
     5	   Fixes the "frozen Emojis button" gap (issue #6).
     6	   ══════════════════════════════════════════════════════════════ */
     7	
     8	var SMILEYS = [
     9	  '😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎',
    10	  '😍', '🥰', '😘', '😗', '😙', '😚', '🙂', '🤗', '🤩', '🤔', '🤨', '😐',
    11	  '😑', '😶', '🙄', '😏', '😣', '😥', '😮', '🤐', '😯', '😪', '😫', '🥱',
    12	  '😴', '😌', '😛', '😜', '😝', '🤤', '😒', '😓', '😔', '😕', '🙃', '🤑',
    13	  '😲', '☹️', '🙁', '😖', '😞', '😟', '😤', '😢', '😭', '😦', '😧', '😨',
    14	  '😩', '🤯', '😬', '😰', '😱', '🥵', '🥶', '😳', '🤪', '😵', '😡', '😠',
    15	  '🤬', '😷', '🤒', '🤕', '🤢', '🤮', '🤧', '😇', '🥳', '🥺', '🤠', '🤡',
    16	  '🤥', '🤫', '🤭', '🧐', '🤓', '😈', '👿', '👻', '💀', '☠️', '👽', '🤖'
    17	];
    18	
    19	var STICKERS = [
    20	  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕',
    21	  '💞', '💓', '💗', '💖', '💘', '💝', '💟', '♥️', '💌', '💋', '👋', '🤚',
    22	  '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈',
    23	  '👉', '👆', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌',
    24	  '👐', '🤲', '🤝', '🙏', '💪', '🔥', '✨', '⭐', '🌟', '💫', '⚡', '☄️',
    25	  '🌈', '☀️', '🌙', '🌚', '🌝', '🌞', '🦋', '🌸', '🌹', '🌺', '💐', '🎉',
    26	  '🎊', '🎁', '🥂', '🍀', '🏆', '🥇', '👑', '💎', '🚀', '⚽', '🎮', '🎵'
    27	];
    28	
    29	var activeTab = 'smiley';
    30	
    31	function chatInput() {
    32	  return document.getElementById('chat-input');
    33	}
    34	
    35	function insertEmoji(emoji) {
    36	  var input = chatInput();
    37	  if (!input) return;
    38	  var start = input.selectionStart || input.value.length;
    39	  var end = input.selectionEnd || input.value.length;
    40	  input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    41	  var pos = start + emoji.length;
    42	  input.focus();
    43	  input.setSelectionRange(pos, pos);
    44	  input.dispatchEvent(new Event('input', { bubbles: true }));
    45	}
    46	
    47	function renderTab(tab) {
    48	  var content = document.getElementById('emoji-picker-content');
    49	  if (!content) return;
    50	  var list = tab === 'sticker' ? STICKERS : SMILEYS;
    51	  content.innerHTML = '';
    52	  list.forEach(function (emoji) {
    53	    var item = document.createElement('span');
    54	    item.className = 'picker-item ' + tab;
    55	    item.textContent = emoji;
    56	    item.addEventListener('click', function () {
    57	      insertEmoji(emoji);
    58	    });
    59	    content.appendChild(item);
    60	  });
    61	  activeTab = tab;
    62	}
    63	
    64	export function initEmojiPicker() {
    65	  var picker = document.getElementById('emoji-picker');
    66	  if (!picker) return;
    67	  renderTab('smiley');
    68	
    69	  document.addEventListener('click', function (e) {
    70	    var tabBtn = e.target.closest('.picker-tab[data-tab]');
    71	    if (!tabBtn) return;
    72	    renderTab(tabBtn.getAttribute('data-tab'));
    73	  });
    74	}
    75	