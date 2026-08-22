     1	export let currentUser = null;
     2	export let currentRoomId = 0;
     3	export let isRoomFrozen = false;
     4	export let shortcuts = [];
     5	export let smileys = [];
     6	export let activeSidebarTab = null;
     7	export let currentUsers = [];
     8	export let rooms = [];
     9	export let replyingTo = null;
    10	export let ignoredUsers = new Set();
    11	export let isSettingsUpload = false;
    12	export let loginBehavior = { behavior: 'default_room', openUsersTabOnLogin: false };
    13	export let settings = {};
    14	export let limits = { public: 300, private: 500 };
    15	export let previousUserSignatures = {};
    16	
    17	export function setCurrentUser(user) {
    18	  if (user) {
    19	    if (user.group && user.group.roleRank !== undefined && (user.roleRank === undefined || user.roleRank === null)) {
    20	      user.roleRank = user.group.roleRank;
    21	    }
    22	    if (user.muteNotificationSounds !== undefined) {
    23	      try {
    24	        localStorage.setItem('muteNotificationSounds', user.muteNotificationSounds ? 'true' : 'false');
    25	      } catch (e) {}
    26	    } else {
    27	      user.muteNotificationSounds = localStorage.getItem('muteNotificationSounds') === 'true';
    28	    }
    29	  }
    30	  currentUser = user;
    31	}
    32	export function setIsSettingsUpload(val) { isSettingsUpload = val; }
    33	export function setSettings(val) { settings = val; }
    34	export function setLimits(val) { limits = val; }
    35	export function setLoginBehavior(val) { loginBehavior = val; }
    36	export let isInWaitingRoom = false;
    37	export let waitingRoomId = null;
    38	export function setWaitingRoomId(id) { waitingRoomId = id; }
    39	export let GENERAL_ROOM_ID = 1;
    40	export function setGeneralRoomId(id) { GENERAL_ROOM_ID = id; }
    41	
    42	export function setCurrentRoomId(roomId) { 
    43	  currentRoomId = roomId; 
    44	  const numericRoomId = Number(roomId);
    45	  // Prioritize numeric check using the authoritative ID from server
    46	  if (waitingRoomId && (roomId === waitingRoomId || numericRoomId === waitingRoomId)) {
    47	    isInWaitingRoom = true;
    48	  } else {
    49	    // Keep string check only as a legacy fallback
    50	    isInWaitingRoom = (roomId === 'waiting-room');
    51	  }
    52	}
    53	export function setIsRoomFrozen(frozen) { isRoomFrozen = frozen; }
    54	export function setShortcuts(s) { shortcuts = s; }
    55	export function setSmileys(s) { smileys = s; }
    56	
    57	export function hasPermission(user, permission) {
    58	  if (!user) return false;
    59	  if (user.group && user.group[permission] === true) return true;
    60	  if (user[permission] === true) return true;
    61	  return false;
    62	}
    63	
    64	
    65	
    66	export function setActiveSidebarTab(tab) { activeSidebarTab = tab; }
    67	export function setCurrentUsers(users) { currentUsers = users; }
    68	export function setRooms(r) { rooms = r; }
    69	export function setReplyingTo(reply) { replyingTo = reply; }
    70	export function setIgnoredUsers(users) { ignoredUsers = users; }
    71	
    72	export function loadIgnoredUsers() {
    73	  try {
    74	    const saved = sessionStorage.getItem('ignoredUsers');
    75	    if (saved) {
    76	      try {
    77	        ignoredUsers = new Set(JSON.parse(saved));
    78	      } catch (e) {
    79	        ignoredUsers = new Set();
    80	      }
    81	    }
    82	  } catch (e) {
    83	    console.warn('Could not load ignored users from sessionStorage:', e);
    84	    ignoredUsers = new Set();
    85	  }
    86	}
    87	