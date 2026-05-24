// DOM Elements
const setupScreen = document.getElementById('setup-screen');
const playerScreen = document.getElementById('player-screen');
const hostPanel = document.getElementById('host-panel');
const guestPanel = document.getElementById('guest-panel');
const loadingState = document.getElementById('loading-state');
const urlInputGroup = document.getElementById('url-input-group');
const fileInputGroup = document.getElementById('file-input-group');
const mediaUrlInput = document.getElementById('media-url');
const mediaFileInput = document.getElementById('media-file');
const fileNameDisplay = document.getElementById('file-name-display');
const createRoomBtn = document.getElementById('create-room-btn');
const platformCards = document.querySelectorAll('.platform-card');

const guestFileGroup = document.getElementById('guest-file-group');
const guestMediaFileInput = document.getElementById('guest-media-file');
const guestFileNameDisplay = document.getElementById('guest-file-name-display');
const joinRoomBtn = document.getElementById('join-room-btn');

const nativePlayer = document.getElementById('native-player');
const ytContainer = document.getElementById('youtube-player');
const roomIdDisplay = document.getElementById('room-id-display');
const copyInviteBtn = document.getElementById('copy-invite-btn');
const closeShareBtn = document.getElementById('close-share-btn');
const roomInfoBadge = document.getElementById('room-info-badge');

// Top Video Controls Elements
const topRotationBtn = document.getElementById('top-rotation-btn');
const topShareBtn = document.getElementById('top-share-btn');
const topLayoutBtn = document.getElementById('top-layout-btn');
const topFullscreenBtn = document.getElementById('top-fullscreen-btn');
const videoControlsTop = document.getElementById('video-controls-top');
const tapOverlay = document.getElementById('tap-overlay');

const chatContainer = document.getElementById('chat-container');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const customKeyboard = document.getElementById('custom-keyboard');

// App State
let peer = null;
let conn = null; // P2P Connection
let isHost = false;
let ytPlayer = null;
let currentMediaType = 'direct';
let ignoreNextSync = false; // Prevents infinite sync loops
let controlsHidden = false; // Track whether floating controls are hidden
let shiftActive = false; // Custom keyboard shift state
let numbersMode = false; // Custom keyboard numbers/symbols mode

// ===== CUSTOM KEYBOARD BUILDER =====
const KEY_ROWS_LOWER = [
    ['q','w','e','r','t','y','u','i','o','p'],
    ['a','s','d','f','g','h','j','k','l'],
    ['SHIFT','z','x','c','v','b','n','m','BKSP'],
    ['123','EMOJI',',','SPACE','.','?','ENTER']
];

const KEY_ROWS_UPPER = [
    ['Q','W','E','R','T','Y','U','I','O','P'],
    ['A','S','D','F','G','H','J','K','L'],
    ['SHIFT','Z','X','C','V','B','N','M','BKSP'],
    ['123','EMOJI',',','SPACE','.','?','ENTER']
];

const KEY_ROWS_NUMBERS = [
    ['1','2','3','4','5','6','7','8','9','0'],
    ['@','#','$','%','&','-','+','(',')'],
    ['SHIFT','*','"','\'',':',';','!','?','BKSP'],
    ['ABC','EMOJI',',','SPACE','.','/','ENTER']
];

const EMOJIS = [
    '❤️','😍','😘','🥰','💕','💖','💗','💓','💞','💝',
    '😊','😂','🤣','😭','🥺','😢','😅','😎','🔥','✨',
    '🎬','🍿','🎥','📺','🌙','⭐','💫','🌟','😴','🤗',
    '👍','👎','👏','🙌','💪','🤝','✌️','🤞','👋','💋',
    '🎉','🎊','🥳','🎶','🎵','💃','🕺','😜','😝','🤪'
];

function buildKeyboard(rows) {
    const rowEls = customKeyboard.querySelectorAll('.kb-row');
    // We have 5 kb-rows in HTML (indices 0-4). We use 4 rows + 1 for emoji panel.
    // Actually let's use 4 rows for keys, and the 5th row is hidden/used later for emoji
    
    rows.forEach((row, rIndex) => {
        if (!rowEls[rIndex]) return;
        rowEls[rIndex].innerHTML = '';
        
        row.forEach(key => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.classList.add('kb-key');
            btn.setAttribute('data-key', key);
            
            if (key === 'SPACE') {
                btn.classList.add('extra-wide');
                btn.textContent = '⎵';
            } else if (key === 'BKSP') {
                btn.classList.add('backspace-key');
                btn.innerHTML = '<i class="fa-solid fa-delete-left"></i>';
            } else if (key === 'SHIFT') {
                btn.classList.add('shift-key');
                btn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
                if (shiftActive) btn.classList.add('action-key');
            } else if (key === 'ENTER') {
                btn.classList.add('action-key', 'wide');
                btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
            } else if (key === '123' || key === 'ABC') {
                btn.classList.add('action-key', 'wide');
                btn.textContent = key;
            } else if (key === 'EMOJI') {
                btn.classList.add('emoji-key');
                btn.textContent = '😊';
            } else {
                btn.textContent = key;
            }
            
            rowEls[rIndex].appendChild(btn);
        });
    });
    
    // 5th row is for emoji panel
    if (rowEls[4]) {
        rowEls[4].innerHTML = '';
        rowEls[4].classList.add('emoji-panel-row');
        // Build emoji panel inside the 5th row
        buildEmojiPanel(rowEls[4]);
    }
}

function buildEmojiPanel(container) {
    container.innerHTML = '';
    container.style.display = 'none'; // Hidden by default
    container.style.flexWrap = 'wrap';
    container.style.justifyContent = 'flex-start';
    container.style.padding = '6px';
    container.style.maxHeight = '120px';
    container.style.overflowY = 'auto';
    container.style.gap = '2px';
    
    EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.classList.add('emoji-btn');
        btn.textContent = emoji;
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            insertTextAtCursor(emoji);
        });
        container.appendChild(btn);
    });
}

function refreshKeyboard() {
    if (numbersMode) {
        buildKeyboard(KEY_ROWS_NUMBERS);
    } else if (shiftActive) {
        buildKeyboard(KEY_ROWS_UPPER);
    } else {
        buildKeyboard(KEY_ROWS_LOWER);
    }
}

// Place cursor at end of contenteditable
function placeCaretAtEnd(el) {
    el.focus();
    if (typeof window.getSelection != 'undefined' && typeof document.createRange != 'undefined') {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

// Insert text at current cursor position in the contenteditable
function insertTextAtCursor(text) {
    chatInput.focus();
    // Use execCommand for contenteditable for better cross-browser support
    document.execCommand('insertText', false, text);
    // Auto scroll the text field
    chatInput.scrollTop = chatInput.scrollHeight;
}

// Handle keyboard key presses
function handleKeyPress(key) {
    const emojiRow = customKeyboard.querySelector('.emoji-panel-row');
    
    if (key === 'SPACE') {
        insertTextAtCursor(' ');
    } else if (key === 'BKSP') {
        chatInput.focus();
        document.execCommand('delete', false);
    } else if (key === 'SHIFT') {
        shiftActive = !shiftActive;
        refreshKeyboard();
    } else if (key === 'ENTER') {
        submitChat();
    } else if (key === '123') {
        numbersMode = true;
        refreshKeyboard();
    } else if (key === 'ABC') {
        numbersMode = false;
        refreshKeyboard();
    } else if (key === 'EMOJI') {
        // Toggle emoji panel
        if (emojiRow) {
            if (emojiRow.style.display === 'none' || !emojiRow.style.display) {
                emojiRow.style.display = 'flex';
            } else {
                emojiRow.style.display = 'none';
            }
        }
    } else {
        insertTextAtCursor(key);
        // Auto-lowercase after typing a letter in shift mode (like real keyboard)
        if (shiftActive && key.length === 1 && key.match(/[A-Z]/)) {
            shiftActive = false;
            refreshKeyboard();
        }
    }
}

// Attach keyboard event delegation
customKeyboard.addEventListener('click', (e) => {
    const keyBtn = e.target.closest('.kb-key');
    if (!keyBtn) return;
    e.preventDefault();
    e.stopPropagation();
    const key = keyBtn.getAttribute('data-key');
    if (key) handleKeyPress(key);
});

// Prevent default keyboard on the chat input (crucial for mobile)
chatInput.addEventListener('focus', (e) => {
    e.preventDefault();
    // On mobile, blur immediately to prevent native keyboard, but keep visual focus
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        chatInput.blur();
    }
});

// Prevent native keyboard from appearing when tapping chat input
chatInput.addEventListener('touchstart', (e) => {
    e.preventDefault();
    // Set visual caret at end
    placeCaretAtEnd(chatInput);
});

// Also prevent mousedown from triggering native keyboard on some devices
chatInput.addEventListener('mousedown', (e) => {
    // On non-touch devices (desktop), allow normal behavior
    if (!('ontouchstart' in window) && navigator.maxTouchPoints === 0) {
        return; // Desktop — allow normal cursor positioning
    }
    e.preventDefault();
    placeCaretAtEnd(chatInput);
});

// Initialize keyboard on load
refreshKeyboard();

// ===== CONTROLS AUTO-HIDE SYSTEM =====
// When user clicks Video Only or Chat & Video, hide all floating controls.
// Tap on the video area to bring them back.

function hideControls() {
    controlsHidden = true;
    videoControlsTop.classList.add('controls-hidden');
    roomInfoBadge.classList.add('controls-hidden');
    // Show tap overlay to catch taps to bring controls back
    tapOverlay.style.display = 'block';
}

function showControls() {
    controlsHidden = false;
    videoControlsTop.classList.remove('controls-hidden');
    roomInfoBadge.classList.remove('controls-hidden');
    tapOverlay.style.display = 'none';
    
    // Auto-hide again after 4 seconds of inactivity
    clearTimeout(controlsAutoHideTimer);
    controlsAutoHideTimer = setTimeout(() => {
        if (!controlsHidden) {
            hideControls();
        }
    }, 4000);
}

let controlsAutoHideTimer = null;

// Tap overlay — tap to bring controls back
tapOverlay.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showControls();
});

// Also handle touch events for mobile
tapOverlay.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    showControls();
});

// Initialize App
function init() {
    const hash = window.location.hash.substring(1);
    
    // Create Peer with robust STUN and free Metered TURN servers for strict networks
    peer = new Peer({ 
        debug: 2,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
                { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
                { urls: "turn:openrelay.metered.ca:443?transport=tcp", username: "openrelayproject", credential: "openrelayproject" }
            ]
        }
    });
    
    peer.on('open', (id) => {
        loadingState.classList.add('hidden');
        if (hash) {
            // Guest Mode
            isHost = false;
            guestPanel.classList.remove('hidden');
        } else {
            // Host Mode
            isHost = true;
            hostPanel.classList.remove('hidden');
            if (topRotationBtn) topRotationBtn.classList.remove('hidden');
        }
    });

    peer.on('connection', (connection) => {
        if (isHost) {
            // SECURITY CHECK: If a partner is already connected, lock the room
            if (conn && conn.open) {
                console.warn("Blocked a trespasser from joining a full room.");
                connection.on('open', () => {
                    connection.send({ type: 'error', message: 'Room is already full. Intruder blocked!' });
                    setTimeout(() => connection.close(), 500);
                });
                return;
            }

            conn = connection;
            setupConnectionHandlers();
            
            conn.on('open', () => {
                addSystemMessage('Your love joined the room! ❤️');
                // Send current video state to guest once the connection is open
                conn.send({
                    type: 'init_video',
                    mediaType: currentMediaType,
                    url: currentMediaType === 'direct' || currentMediaType === 'youtube' ? mediaUrlInput.value : null
                });
                // Auto-hide the share badge when partner joins to keep layout clean
                if (roomInfoBadge) {
                    roomInfoBadge.classList.add('hidden');
                    topShareBtn.classList.remove('active');
                }
            });
        }
    });

    peer.on('error', (err) => {
        console.error(err);
        alert('Connection error: ' + err.message);
    });
}

// Media Selection UI
platformCards.forEach(card => {
    card.addEventListener('click', () => {
        platformCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        currentMediaType = card.getAttribute('data-type');
        
        if (currentMediaType === 'local') {
            urlInputGroup.classList.add('hidden');
            fileInputGroup.classList.remove('hidden');
        } else {
            urlInputGroup.classList.remove('hidden');
            fileInputGroup.classList.add('hidden');
            if (currentMediaType === 'youtube') {
                mediaUrlInput.placeholder = "Paste YouTube link here...";
            } else {
                mediaUrlInput.placeholder = "Paste direct URL or Google Drive link...";
            }
        }
    });
});

mediaFileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) {
        fileNameDisplay.textContent = e.target.files[0].name;
    } else {
        fileNameDisplay.textContent = "Choose Video File";
    }
});

// Fullscreen helper
function requestFullScreen() {
    const docElm = document.documentElement;
    if (docElm.requestFullscreen) {
        docElm.requestFullscreen().catch(err => console.log(err));
    } else if (docElm.webkitRequestFullscreen) {
        docElm.webkitRequestFullscreen().catch(err => console.log(err));
    }
}

// Host Creates Room
createRoomBtn.addEventListener('click', () => {
    requestFullScreen();
    
    let url = '';
    if (currentMediaType === 'local') {
        const file = mediaFileInput.files[0];
        if (!file) return alert('Select a file first');
        url = URL.createObjectURL(file);
    } else {
        url = mediaUrlInput.value;
        if (!url) return alert('Enter a URL');
    }

    setupScreen.classList.remove('active');
    playerScreen.classList.add('active');
    
    roomIdDisplay.textContent = 'Room: ' + peer.id;
    
    setupVideo(currentMediaType, url);
});

// Guest Joins Room
joinRoomBtn.addEventListener('click', () => {
    const hostId = window.location.hash.substring(1);
    
    joinRoomBtn.disabled = true;
    joinRoomBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting to your love...';
    
    setTimeout(() => {
        if (!conn || !conn.open) {
            joinRoomBtn.disabled = false;
            joinRoomBtn.innerHTML = 'Join Room <i class="fa-solid fa-door-open"></i>';
            alert('Connection timed out. Please check the link and try again.');
        }
    }, 10000);

    conn = peer.connect(hostId);
    setupConnectionHandlers();
});

// Guest selects local file if host used local file
guestMediaFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        guestFileNameDisplay.textContent = file.name;
        const url = URL.createObjectURL(file);
        
        requestFullScreen();
        setupVideo('local', url);
        
        setupScreen.classList.remove('active');
        playerScreen.classList.add('active');
        roomIdDisplay.textContent = 'Connected to Host';
        
        guestFileGroup.classList.add('hidden');
        
        // Hide share badge for Guest by default
        if (roomInfoBadge) {
            roomInfoBadge.classList.add('hidden');
            topShareBtn.classList.remove('active');
        }
    } else {
        guestFileNameDisplay.textContent = "Choose Video File";
    }
});

// Connection Handlers (Shared)
function setupConnectionHandlers() {
    conn.on('open', () => {
        console.log('Connected to peer');
    });

    conn.on('close', () => {
        addSystemMessage('Your partner disconnected.');
        if (isHost) conn = null; // Free up room for reconnection
    });
    
    conn.on('error', () => {
        if (isHost) conn = null; // Free up room for reconnection
    });

    conn.on('data', (data) => {
        if (data.type === 'error') {
            alert(data.message);
            window.location.href = window.location.pathname; // kick out
            return;
        }
        if (data.type === 'chat') {
            addMessage(data.text, false);
        } else if (data.type === 'sync') {
            handleVideoSync(data);
        } else if (data.type === 'init_video' && !isHost) {
            currentMediaType = data.mediaType;
            if (data.mediaType === 'local') {
                guestFileGroup.classList.remove('hidden');
                joinRoomBtn.classList.add('hidden'); // Hide join button since local file is needed
                addSystemMessage('Host is playing a local file. Please select the same file.');
            } else {
                requestFullScreen();
                setupVideo(data.mediaType, data.url);
                setupScreen.classList.remove('active');
                playerScreen.classList.add('active');
                roomIdDisplay.textContent = 'Connected to Host';
                
                // Hide share badge for Guest by default
                if (roomInfoBadge) {
                    roomInfoBadge.classList.add('hidden');
                    topShareBtn.classList.remove('active');
                }
            }
        }
    });
}

// Auto-convert Google Drive sharing links to direct download URLs to prevent CORS/broken stream errors
function convertGoogleDriveLink(url) {
    if (url && url.includes('drive.google.com')) {
        const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            return `https://docs.google.com/uc?export=download&id=${match[1]}`;
        }
    }
    return url;
}

// Video Setup
let currentBlobUrl = null;

function setupVideo(type, url) {
    url = convertGoogleDriveLink(url);
    
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }
    if (type === 'local' && url && url.startsWith('blob:')) {
        currentBlobUrl = url;
    }

    if (type === 'youtube') {
        nativePlayer.classList.add('hidden');
        ytContainer.classList.remove('hidden');
        
        // Extract Video ID
        let videoId = '';
        try {
            const urlObj = new URL(url);
            if (url.includes('youtu.be')) videoId = urlObj.pathname.slice(1);
            else videoId = urlObj.searchParams.get('v');
        } catch(e) {}

        if (window.YT && window.YT.Player) {
            initYtPlayer(videoId);
        } else {
            // YouTube API not ready, wait a bit (handled by onYouTubeIframeAPIReady usually)
            window.onYouTubeIframeAPIReady = () => initYtPlayer(videoId);
        }
    } else {
        // Direct or Local
        ytContainer.classList.add('hidden');
        nativePlayer.classList.remove('hidden');
        nativePlayer.src = url;
        setupNativePlayerSync();
    }
}

function initYtPlayer(videoId) {
    if (ytPlayer) ytPlayer.destroy();
    ytPlayer = new YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        events: {
            'onStateChange': onYtStateChange
        }
    });
}

// Synchronization Logic
let expectedSync = { action: null, time: null };

function sendSync(data) {
    if (conn && conn.open) {
        conn.send(data);
    }
}

function handleVideoSync(data) {
    expectedSync = { action: data.action, time: data.time };
    if (currentMediaType === 'youtube' && ytPlayer) {
        if (data.action === 'play') {
            ytPlayer.seekTo(data.time, true);
            ytPlayer.playVideo();
        } else if (data.action === 'pause') {
            ytPlayer.seekTo(data.time, true);
            ytPlayer.pauseVideo();
        } else if (data.action === 'seek') {
            ytPlayer.seekTo(data.time, true);
        }
    } else {
        if (data.action === 'play') {
            nativePlayer.currentTime = data.time;
            nativePlayer.play();
        } else if (data.action === 'pause') {
            nativePlayer.currentTime = data.time;
            nativePlayer.pause();
        } else if (data.action === 'seek') {
            nativePlayer.currentTime = data.time;
        }
    }
    setTimeout(() => { expectedSync = { action: null, time: null }; }, 1000); // Debounce
}

function shouldSendSync(action, time) {
    if (expectedSync.action === action && Math.abs(expectedSync.time - time) < 0.5) {
        return false;
    }
    return true;
}

// Native Player Sync Listeners
let nativeSyncSetup = false;
function setupNativePlayerSync() {
    if (nativeSyncSetup) return;
    nativeSyncSetup = true;
    
    nativePlayer.addEventListener('play', () => {
        if (shouldSendSync('play', nativePlayer.currentTime)) sendSync({ type: 'sync', action: 'play', time: nativePlayer.currentTime });
    });
    nativePlayer.addEventListener('pause', () => {
        if (shouldSendSync('pause', nativePlayer.currentTime)) sendSync({ type: 'sync', action: 'pause', time: nativePlayer.currentTime });
    });
    nativePlayer.addEventListener('seeked', () => {
        if (shouldSendSync('seek', nativePlayer.currentTime)) sendSync({ type: 'sync', action: 'seek', time: nativePlayer.currentTime });
    });
}

// YT Player Sync Listeners
let lastYtTime = -1;
function onYtStateChange(event) {
    const time = ytPlayer.getCurrentTime();
    lastYtTime = time;
    if (event.data == YT.PlayerState.PLAYING) {
        if (shouldSendSync('play', time)) sendSync({ type: 'sync', action: 'play', time });
    } else if (event.data == YT.PlayerState.PAUSED) {
        if (shouldSendSync('pause', time)) sendSync({ type: 'sync', action: 'pause', time });
    }
}

// Poll for YT Seeks
setInterval(() => {
    if (currentMediaType === 'youtube' && ytPlayer && ytPlayer.getPlayerState) {
        const state = ytPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING || state === YT.PlayerState.PAUSED) {
            const time = ytPlayer.getCurrentTime();
            if (lastYtTime !== -1 && Math.abs(time - lastYtTime) > 1.5) {
                // Seek detected
                if (shouldSendSync('seek', time)) sendSync({ type: 'sync', action: 'seek', time });
            }
            lastYtTime = time;
        }
    }
}, 1000);

// Chat & Layout UI Helper
function toggleLayout(showChat) {
    const layoutIcon = topLayoutBtn.querySelector('i');
    const layoutSpan = topLayoutBtn.querySelector('span');
    const videoContainer = document.getElementById('video-container');
    
    if (showChat) {
        chatContainer.classList.remove('hidden');
        videoContainer.classList.remove('video-fullscreen');
        topLayoutBtn.classList.add('active');
        if (layoutIcon) {
            layoutIcon.className = 'fa-solid fa-video';
        }
        if (layoutSpan) {
            layoutSpan.textContent = 'Video Only';
        }
    } else {
        chatContainer.classList.add('hidden');
        videoContainer.classList.add('video-fullscreen');
        topLayoutBtn.classList.remove('active');
        if (layoutIcon) {
            layoutIcon.className = 'fa-solid fa-table-columns';
        }
        if (layoutSpan) {
            layoutSpan.textContent = 'Chat & Video';
        }
    }
    
    // HIDE CONTROLS after toggling layout (user wants immersive view)
    // Small delay so user can see the transition
    setTimeout(() => {
        hideControls();
    }, 600);
}

// Layout / Chat Toggle
topLayoutBtn.addEventListener('click', () => {
    const isChatHidden = chatContainer.classList.contains('hidden');
    toggleLayout(isChatHidden);
});

closeChatBtn.addEventListener('click', () => {
    toggleLayout(false);
});

// Share Badge Control
topShareBtn.addEventListener('click', () => {
    roomInfoBadge.classList.toggle('hidden');
    const isHidden = roomInfoBadge.classList.contains('hidden');
    if (isHidden) {
        topShareBtn.classList.remove('active');
    } else {
        topShareBtn.classList.add('active');
    }
});

closeShareBtn.addEventListener('click', () => {
    roomInfoBadge.classList.add('hidden');
    topShareBtn.classList.remove('active');
});

// Fullscreen (Resize) Control
function toggleFullScreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        const docElm = document.documentElement;
        if (docElm.requestFullscreen) {
            docElm.requestFullscreen().catch(err => console.log(err));
        } else if (docElm.webkitRequestFullscreen) {
            docElm.webkitRequestFullscreen().catch(err => console.log(err));
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen().catch(err => console.log(err));
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen().catch(err => console.log(err));
        }
    }
}

topFullscreenBtn.addEventListener('click', () => {
    toggleFullScreen();
    // Also hide controls after fullscreen toggle
    setTimeout(() => {
        hideControls();
    }, 600);
});

function updateFullscreenButton() {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    const fsIcon = topFullscreenBtn.querySelector('i');
    const fsSpan = topFullscreenBtn.querySelector('span');
    
    if (isFullscreen) {
        if (fsIcon) {
            fsIcon.className = 'fa-solid fa-compress';
        }
        if (fsSpan) {
            fsSpan.textContent = 'Minimize';
        }
        topFullscreenBtn.classList.add('active');
    } else {
        if (fsIcon) {
            fsIcon.className = 'fa-solid fa-expand';
        }
        if (fsSpan) {
            fsSpan.textContent = 'Resize';
        }
        topFullscreenBtn.classList.remove('active');
    }
}

document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);

// Rotation Lock Control
let rotationLocked = false;
if (topRotationBtn) {
    topRotationBtn.addEventListener('click', async () => {
        try {
            if (!rotationLocked) {
                if (screen.orientation && screen.orientation.lock) {
                    await screen.orientation.lock(screen.orientation.type);
                    rotationLocked = true;
                    topRotationBtn.classList.add('active');
                    const icon = topRotationBtn.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-lock';
                    const span = topRotationBtn.querySelector('span');
                    if (span) span.textContent = 'Unlock Rot.';
                } else {
                    alert("Screen orientation lock is not supported on this device/browser.");
                }
            } else {
                if (screen.orientation && screen.orientation.unlock) {
                    screen.orientation.unlock();
                    rotationLocked = false;
                    topRotationBtn.classList.remove('active');
                    const icon = topRotationBtn.querySelector('i');
                    if (icon) icon.className = 'fa-solid fa-lock-open';
                    const span = topRotationBtn.querySelector('span');
                    if (span) span.textContent = 'Lock Rot.';
                }
            }
        } catch (error) {
            console.error(error);
            alert("Could not lock screen orientation. Ensure you are in fullscreen or the device supports it.");
        }
    });
}

function submitChat() {
    const text = chatInput.innerText.trim();
    if (!text) return;
    
    addMessage(text, true);
    if (conn && conn.open) {
        conn.send({ type: 'chat', text: text });
    }
    chatInput.innerText = '';
}

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitChat();
});

// On desktop, still allow physical keyboard input into the chat input
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitChat();
    }
});

function addMessage(text, isSelf) {
    const div = document.createElement('div');
    div.classList.add('message');
    if (isSelf) div.classList.add('self');
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.classList.add('message', 'system');
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Copy Invite
copyInviteBtn.addEventListener('click', () => {
    const url = window.location.origin + window.location.pathname + '#' + peer.id;
    navigator.clipboard.writeText(url).then(() => {
        const orig = copyInviteBtn.innerHTML;
        copyInviteBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        setTimeout(() => copyInviteBtn.innerHTML = orig, 2000);
    });
});

window.addEventListener('beforeunload', () => {
    if (conn) conn.close();
    if (peer) peer.destroy();
});

// Run Init
window.onload = init;
