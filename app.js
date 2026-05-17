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

const chatContainer = document.getElementById('chat-container');
const toggleChatBtn = document.getElementById('toggle-chat-btn');
const closeChatBtn = document.getElementById('close-chat-btn');
const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

// App State
let peer = null;
let conn = null; // P2P Connection
let isHost = false;
let ytPlayer = null;
let currentMediaType = 'direct';
let ignoreNextSync = false; // Prevents infinite sync loops

// Initialize App
function init() {
    const hash = window.location.hash.substring(1);
    
    // Create Peer with STUN servers for robust production NAT traversal (crucial for Mobile Networks)
    peer = new Peer({ 
        debug: 2,
        config: {
            'iceServers': [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
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
        }
    });

    peer.on('connection', (connection) => {
        if (isHost) {
            conn = connection;
            setupConnectionHandlers();
            addSystemMessage('Partner joined the room!');
            // Send current video state to guest
            sendSync({
                type: 'init_video',
                mediaType: currentMediaType,
                url: currentMediaType === 'direct' || currentMediaType === 'youtube' ? mediaUrlInput.value : null
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
    requestFullScreen();
    const hostId = window.location.hash.substring(1);
    
    conn = peer.connect(hostId);
    setupConnectionHandlers();
    
    setupScreen.classList.remove('active');
    playerScreen.classList.add('active');
    roomIdDisplay.textContent = 'Connected to Host';
});

// Guest selects local file if host used local file
guestMediaFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        guestFileNameDisplay.textContent = file.name;
        const url = URL.createObjectURL(file);
        setupVideo('local', url);
        guestFileGroup.classList.add('hidden');
    } else {
        guestFileNameDisplay.textContent = "Choose Video File";
    }
});

// Connection Handlers (Shared)
function setupConnectionHandlers() {
    conn.on('open', () => {
        console.log('Connected to peer');
    });

    conn.on('data', (data) => {
        if (data.type === 'chat') {
            addMessage(data.text, false);
        } else if (data.type === 'sync') {
            handleVideoSync(data);
        } else if (data.type === 'init_video' && !isHost) {
            if (data.mediaType === 'local') {
                guestFileGroup.classList.remove('hidden');
                addSystemMessage('Host is playing a local file. Please select the same file.');
            } else {
                setupVideo(data.mediaType, data.url);
            }
        }
    });
}

// Video Setup
function setupVideo(type, url) {
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
function sendSync(data) {
    if (conn && conn.open) {
        conn.send(data);
    }
}

function handleVideoSync(data) {
    ignoreNextSync = true;
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
    setTimeout(() => { ignoreNextSync = false; }, 500); // Debounce
}

// Native Player Sync Listeners
function setupNativePlayerSync() {
    nativePlayer.addEventListener('play', () => {
        if (!ignoreNextSync) sendSync({ type: 'sync', action: 'play', time: nativePlayer.currentTime });
    });
    nativePlayer.addEventListener('pause', () => {
        if (!ignoreNextSync) sendSync({ type: 'sync', action: 'pause', time: nativePlayer.currentTime });
    });
    nativePlayer.addEventListener('seeked', () => {
        if (!ignoreNextSync) sendSync({ type: 'sync', action: 'seek', time: nativePlayer.currentTime });
    });
}

// YT Player Sync Listeners
function onYtStateChange(event) {
    if (ignoreNextSync) return;
    const time = ytPlayer.getCurrentTime();
    if (event.data == YT.PlayerState.PLAYING) {
        sendSync({ type: 'sync', action: 'play', time });
    } else if (event.data == YT.PlayerState.PAUSED) {
        sendSync({ type: 'sync', action: 'pause', time });
    }
}

// Chat UI
toggleChatBtn.addEventListener('click', () => {
    chatContainer.classList.remove('hidden');
    toggleChatBtn.classList.add('hidden');
});

closeChatBtn.addEventListener('click', () => {
    chatContainer.classList.add('hidden');
    toggleChatBtn.classList.remove('hidden');
});

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
        const orig = copyInviteBtn.textContent;
        copyInviteBtn.textContent = 'Copied!';
        setTimeout(() => copyInviteBtn.textContent = orig, 2000);
    });
});

// Run Init
window.onload = init;
