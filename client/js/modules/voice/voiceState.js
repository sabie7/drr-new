     1	export const voiceState = {
     2	  audioElements: {},
     3	  currentMicIndex: null,
     4	  currentRoomId: null,
     5	  currentVoiceSessionId: null,
     6	  isIncomingMuted: false,
     7	  isMuted: false,
     8	  localMutedUsers: new Set(),
     9	  localStream: null,
    10	  localVolumes: {},
    11	  masterIncomingVolume: 1,
    12	  micsState: {},
    13	  peerConnections: {}
    14	};
    15	