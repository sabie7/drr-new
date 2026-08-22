     1	export const ui = {
     2	  loginOverlay: document.getElementById('login-overlay'),
     3	  chatShell: document.getElementById('chat-shell'),
     4	  chatUI: document.getElementById('chat-ui'),
     5	  messagesContainer: document.getElementById('messages-container'),
     6	  sidebar: document.getElementById('right-sidebar'),
     7	  sidebarTitle: document.getElementById('sidebar-title'),
     8	  sidebarOverlay: document.getElementById('sidebar-overlay'),
     9	  sidebarContent: document.getElementById('sidebar-content'),
    10	  sidebarSearchContainer: document.getElementById('sidebar-search-container'),
    11	  sidebarSearchInput: document.getElementById('sidebar-search-input'),
    12	  closeSidebar: document.getElementById('close-sidebar'),
    13	  
    14	  // Sidebar Tab Containers
    15	  sidebarUsersContainer: document.getElementById('sidebar-users-container'),
    16	  sidebarRoomsContainer: document.getElementById('sidebar-rooms-container'),
    17	  sidebarGamesContainer: document.getElementById('sidebar-games-container'),
    18	  sidebarWallContainer: document.getElementById('sidebar-wall-container'),
    19	  sidebarSettingsContainer: document.getElementById('sidebar-settings-container'),
    20	  sidebarPrivateContainer: document.getElementById('sidebar-private-container'),
    21	  
    22	  emojiPicker: document.getElementById('emoji-picker'),
    23	  emojiPickerContent: document.getElementById('emoji-picker-content'),
    24	  closeEmojiPicker: document.getElementById('close-emoji-picker'),
    25	  pickerTabs: document.querySelectorAll('.picker-tab'),
    26	  
    27	  chatForm: document.getElementById('chat-form'),
    28	  chatInput: document.getElementById('chat-input'),
    29	  fileInput: document.getElementById('file-input'),
    30	  uploadBtn: document.getElementById('upload-btn'),
    31	  settingsUploadBtn: document.getElementById('settings-upload-btn'),
    32	  emojiBtn: document.getElementById('emoji-btn'),
    33	  clearChatBtn: document.getElementById('clear-chat-btn'),
    34	  leaveRoomBtn: document.getElementById('leave-room-btn'),
    35	  botMsgBtn: document.getElementById('bot-msg-btn'),
    36	  extraActionsToggle: document.getElementById('extra-actions-toggle'),
    37	  extraActionsMenu: document.getElementById('extra-actions-menu'),
    38	  botModeBar: document.getElementById('bot-mode-bar'),
    39	  botModeSelection: document.getElementById('bot-mode-selection'),
    40	  botModeSelect: document.getElementById('bot-mode-select'),
    41	  exitBotModeBtn: document.getElementById('exit-bot-mode-btn'),
    42	  botModeToggle: document.getElementById('bot-mode-toggle'),
    43	  toggleSelf: document.getElementById('toggle-self'),
    44	  labelToggleSelf: document.getElementById('label-toggle-self'),
    45	  toggleBot: document.getElementById('toggle-bot'),
    46	  labelToggleBot: document.getElementById('label-toggle-bot'),
    47	  changeBotBtn: document.getElementById('change-bot-btn'),
    48	  exitBotModeBtn2: document.getElementById('exit-bot-mode-btn-2'),
    49	  toggleSoundBtn: document.getElementById('toggle-sound'),
    50	  micButtons: [
    51	    document.getElementById('mic-1'),
    52	    document.getElementById('mic-2'),
    53	    document.getElementById('mic-3'),
    54	    document.getElementById('mic-4'),
    55	    document.getElementById('mic-5'),
    56	    document.getElementById('mic-6'),
    57	    document.getElementById('mic-7')
    58	  ],
    59	  
    60	  onlineCount: document.getElementById('online-count'),
    61	  usersTabBtn: document.getElementById('users-tab-btn'),
    62	  privateTabBtn: document.getElementById('private-tab-btn'),
    63	  wallTabBtn: document.getElementById('wall-tab-btn'),
    64	  roomsTabBtn: document.getElementById('rooms-tab-btn'),
    65	  settingsBtn: document.getElementById('settings-btn'),
    66	  
    67	  replyPreview: document.getElementById('reply-preview'),
    68	  replyToAvatar: document.getElementById('reply-to-avatar'),
    69	  replyToUser: document.getElementById('reply-to-user'),
    70	  replyToText: document.getElementById('reply-to-text'),
    71	  replyToMedia: document.getElementById('reply-to-media'),
    72	  cancelReply: document.getElementById('cancel-reply'),
    73	  
    74	  landingUsersList: document.getElementById('landing-users-list'),
    75	  landingUsersCount: document.getElementById('landing-users-count'),
    76	  memberForm: document.getElementById('member-login-form'),
    77	  guestForm: document.getElementById('guest-login-form'),
    78	  registerForm: document.getElementById('register-form'),
    79	  showRegister: document.getElementById('show-register'),
    80	  showMemberLogin: document.getElementById('show-member-login'),
    81	  showGuestLogin: document.getElementById('show-guest-login'),
    82	  
    83	  userProfileModal: document.getElementById('userProfileModal'),
    84	  profileHeaderTopic: document.getElementById('profile-header-topic'),
    85	  profileHeaderBanner: document.getElementById('profile-header-banner'),
    86	  profileAvatarHeader: document.getElementById('profile-avatar-header'),
    87	  profileCover: document.getElementById('profile-cover'),
    88	  profileAvatarModal: document.getElementById('profile-avatar-modal'),
    89	  profileMainVerifiedBadge: document.getElementById('profile-main-verified-badge'),
    90	  profileMsg: document.getElementById('profile-msg'),
    91	  profileActionsGrid: document.getElementById('profile-actions-grid'),
    92	  profileLikesCountBtn: document.getElementById('profile-likes-count-btn'),
    93	  btnProfileLikes: document.getElementById('btn-profile-likes'),
    94	  btnProfileAlert: document.getElementById('btn-profile-alert'),
    95	  btnProfilePrivate: document.getElementById('btn-profile-private'),
    96	  btnProfileDelPic: document.getElementById('btn-profile-del-pic'),
    97	  btnProfileReveal: document.getElementById('btn-profile-reveal'),
    98	  btnProfileGift: document.getElementById('btn-profile-gift'),
    99	  btnProfileMuteRoom: document.getElementById('btn-profile-mute-room'),
   100	  btnProfileMuteGlobal: document.getElementById('btn-profile-mute-global'),
   101	  btnProfileBanner: document.getElementById('btn-profile-banner'),
   102	  btnProfileDelFrame: document.getElementById('btn-profile-del-frame'),
   103	  btnProfileDelBg: document.getElementById('btn-profile-del-bg'),
   104	  btnProfileDelLink: document.getElementById('btn-profile-del-link'),
   105	  btnProfileKickRoom: document.getElementById('btn-profile-kick-room'),
   106	  btnProfileModRoom: document.getElementById('btn-profile-mod-room'),
   107	  btnProfileKickGlobal: document.getElementById('btn-profile-kick-global'),
   108	  btnProfileBan: document.getElementById('btn-profile-ban'),
   109	  btnProfileReport: document.getElementById('btn-profile-report'),
   110	  btnProfileIgnore: document.getElementById('btn-profile-ignore'),
   111	  
   112	  manageAddonsModal: document.getElementById('manageAddonsModal'),
   113	  addonHeaderAvatar: document.getElementById('addon-header-avatar'),
   114	  addonHeaderBanner: document.getElementById('addon-header-banner'),
   115	  addonHeaderTopic: document.getElementById('addon-header-topic'),
   116	  addonContent: document.getElementById('addon-content'),
   117	  availableAddonsGrid: document.getElementById('available-addons-grid'),
   118	  btnAddonsBack: document.getElementById('btn-addons-back'),
   119	  btnRemoveAddon: document.getElementById('btn-remove-addon'),
   120	  removeAddonText: document.getElementById('remove-addon-text'),
   121	  
   122	  createRoomModal: document.getElementById('createRoomModal'),
   123	  createRoomForm: document.getElementById('create-room-form'),
   124	  thumbnailInput: document.getElementById('thumbnail-input'),
   125	  thumbnailPreview: document.getElementById('thumbnail-preview'),
   126	  
   127	  passwordModal: document.getElementById('passwordModal'),
   128	  roomPasswordInput: document.getElementById('room-password-input'),
   129	  submitPasswordBtn: document.getElementById('submit-password-btn'),
   130	  
   131	  lightbox: document.getElementById('lightbox'),
   132	  lightboxImg: document.getElementById('lightbox-img'),
   133	  lightboxClose: document.querySelector('.lightbox-close')
   134	};
   135	
   136	export function showToast(message, type = 'error') {
   137	  const SwalObj = window.Swal;
   138	  if (!SwalObj || !SwalObj.mixin) {
   139	    // Fallback if Swal is not loaded
   140	    alert(message);
   141	    return;
   142	  }
   143	  
   144	  const Toast = SwalObj.mixin({
   145	    toast: true,
   146	    position: 'top-end',
   147	    showConfirmButton: false,
   148	    timer: 3000,
   149	    timerProgressBar: true,
   150	    didOpen: (toast) => {
   151	      toast.addEventListener('mouseenter', SwalObj.stopTimer)
   152	      toast.addEventListener('mouseleave', SwalObj.resumeTimer)
   153	    }
   154	  });
   155	
   156	  const fireMethod = window.originalSwalFire || Toast.fire;
   157	  fireMethod.call(Toast, {
   158	    toast: true,
   159	    icon: type === 'success' ? 'success' : (type === 'info' ? 'info' : 'error'),
   160	    title: message
   161	  });
   162	}
   163	
   164	export function shakeElement(el) {
   165	  if (!el) return;
   166	  el.classList.add('shake');
   167	  setTimeout(() => el.classList.remove('shake'), 500);
   168	}
   169	