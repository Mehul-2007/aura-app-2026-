const video = document.getElementById('webcam');
const canvas = document.getElementById('overlay');
const ctx = canvas.getContext('2d');
const toggleBtn = document.getElementById('toggle-camera');
const statusIndicator = document.getElementById('status-indicator');
const initialState = document.getElementById('initial-state');
const loadingState = document.getElementById('loading-state');
const scanningLines = document.querySelector('.scanning-lines');
const detectionList = document.getElementById('detection-list');
const detectionCount = document.getElementById('detection-count');
const cameraStatusText = document.getElementById('camera-status-text');

// --- Secure User Authentication & Tracking ---
let currentUsername = localStorage.getItem("aura_username");
let currentUserPhone = localStorage.getItem("aura_phone");
const userGreeting = document.getElementById("user-greeting");
const logoutBtn = document.getElementById("logout-btn");

function loadRecentUsers() {
    const usersListEl = document.getElementById("recent-users-list");
    if(usersListEl) {
        if(currentUsername) {
            const phoneMasked = currentUserPhone ? (currentUserPhone.substring(0,4) + '***' + currentUserPhone.slice(-2)) : 'N/A';
            usersListEl.innerHTML = `
                <li class="detection-item" style="padding: 0.8rem 1.2rem; margin-bottom: 0.5rem; background: rgba(56, 189, 248, 0.05); border: 1px solid var(--accent-1); display: flex; flex-direction: column; gap: 4px; border-radius: var(--radius-md);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 700; color: var(--accent-1); font-size: 1.1rem;">${currentUsername}</span>
                        <span class="badge" style="font-size: 0.65rem; padding: 0.2rem 0.5rem; margin: 0; background: rgba(16, 185, 129, 0.2); color: var(--success);">ACTIVE SESSION</span>
                    </div>
                    <div style="font-size: 0.85rem; color: var(--text-secondary); opacity: 0.8;">Verified Phone: ${phoneMasked}</div>
                </li>
            `;
        } else {
            usersListEl.innerHTML = '<li class="empty-state">Welcome! Please login to your secure account to start using Aura.</li>';
        }
    }
}

function handleLogout() {
    localStorage.removeItem("aura_username");
    localStorage.removeItem("aura_phone");
    window.location.reload();
}

function initUserTracking() {
    const authModal = document.getElementById("auth-modal");
    const authForm = document.getElementById("auth-form");
    const toggleModeBtn = document.getElementById("toggle-auth-mode");
    const modalTitle = document.getElementById("modal-title");
    const modalDesc = document.getElementById("modal-desc");
    const nameGroup = document.getElementById("name-group");
    const submitBtn = document.getElementById("auth-submit-btn");
    const toggleText = document.getElementById("toggle-text");
    
    let isLoginMode = false;

    if (logoutBtn) {
        logoutBtn.addEventListener("click", handleLogout);
    }

    if (toggleModeBtn) {
        toggleModeBtn.addEventListener("click", (e) => {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            
            if (isLoginMode) {
                modalTitle.textContent = "Login to Aura";
                modalDesc.textContent = "Enter your credentials to resume your session.";
                nameGroup.style.display = "none";
                submitBtn.textContent = "Secure Login";
                toggleText.textContent = "Don't have an account?";
                toggleModeBtn.textContent = "Sign Up";
            } else {
                modalTitle.textContent = "Welcome to Aura";
                modalDesc.textContent = "Please register to start using the assistive vision system.";
                nameGroup.style.display = "block";
                submitBtn.textContent = "Create Account";
                toggleText.textContent = "Already have an account?";
                toggleModeBtn.textContent = "Login";
            }
        });
    }

    function updateUIState() {
        if (currentUsername) {
            if (userGreeting) userGreeting.textContent = `Hello, ${currentUsername}`;
            if (logoutBtn) logoutBtn.classList.remove("hidden");
            if (authModal) authModal.classList.add("hidden");
        } else {
            if (userGreeting) userGreeting.textContent = "";
            if (logoutBtn) logoutBtn.classList.add("hidden");
            if (authModal) authModal.classList.remove("hidden");
        }
        loadRecentUsers();
    }

    if (authForm) {
        authForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const nameVal = document.getElementById("auth-name").value.trim();
            const phoneVal = document.getElementById("auth-phone").value.trim();
            const passVal = document.getElementById("auth-pass").value.trim();
            
            const endpoint = isLoginMode ? '/api/login' : '/api/signup';
            const payload = isLoginMode 
                ? { phone: phoneVal, password: passVal }
                : { name: nameVal, phone: phoneVal, password: passVal, timestamp: new Date().toISOString() };

            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });

                const result = await response.json();

                if (response.ok) {
                    currentUsername = result.user.name;
                    currentUserPhone = result.user.phone;
                    localStorage.setItem("aura_username", currentUsername);
                    localStorage.setItem("aura_phone", currentUserPhone);
                    updateUIState();
                } else {
                    alert(result.error || "Authentication failed");
                }
            } catch (err) {
                console.error("Auth Error:", err);
                alert("Connection failed. Please try again.");
            }
        });
    }

    updateUIState();
}

// Initialize when dom is ready
if(document.readyState !== 'loading') {
    initUserTracking();
} else {
    document.addEventListener('DOMContentLoaded', initUserTracking);
}

let model = null;
let isWebcamStarted = false;
let animationId = null;

// Audio context for auditory feedback (optional, simple beep for close objects)
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let lastBeepTime = 0;

function playBeep(frequency, duration) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
}

// Load Model
async function loadModel() {
    try {
        model = await cocoSsd.load();
        console.log("Model loaded successfully");
    } catch (error) {
        console.error("Error loading model:", error);
        alert("Failed to load the AI model. Please check connectivity.");
    }
}

// Start Webcam
async function startWebcam() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment' // Fallback to basic environment camera without strict resolution
            } 
        });
        video.srcObject = stream;
        
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                // Match canvas to video dimensions
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                resolve();
            };
        });
    } catch (err) {
        console.error("Webcam access error:", err);
        alert("Error accessing the webcam. Please ensure permissions are granted.");
        throw err;
    }
}

// Estimate distance based on bounding box height relative to video height
// This is a rough heuristic: larger box = closer object
function estimateDistance(boxHeight, videoHeight) {
    const ratio = boxHeight / videoHeight;
    // Assume if it takes up 100% of height it's 0.5m away, 10% is 5m away
    let distanceInMeters = 0.5 / ratio;
    
    // Clamp values for realism
    if (distanceInMeters < 0.2) distanceInMeters = 0.2;
    if (distanceInMeters > 15) distanceInMeters = 15;
    
    return distanceInMeters;
}

let backendLogTime = 0;
function logHazardToBackend(detectionData) {
    const now = Date.now();
    // Throttle logging to backend to once every 5 seconds
    if (now - backendLogTime > 5000) {
        backendLogTime = now;
        fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                timestamp: new Date().toISOString(),
                label: detectionData.label,
                distance: detectionData.distance,
                confidence: detectionData.score
            })
        }).catch(err => console.error("Logging failed:", err));
    }
}

// Map to keep track of recently spoken objects
const recentAnnouncements = new Map();

function announceObject(label) {
    const now = Date.now();
    // Only announce the same object once every 7 seconds to prevent speech overlap/spam
    if (!recentAnnouncements.has(label) || (now - recentAnnouncements.get(label) > 7000)) {
        recentAnnouncements.set(label, now);
        
        if ('speechSynthesis' in window) {
            // Cancel any ongoing speech so new objects get priority
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(label + " detected");
            utterance.rate = 1.2; // Slightly fast for quick assistive feedback
            utterance.pitch = 1.0;
            window.speechSynthesis.speak(utterance);
        }
    }
}

// Draw bounding box and text
function drawBox(prediction, videoWidth, videoHeight) {
    const [x, y, width, height] = prediction.bbox;
    const label = prediction.class; 
    const score = Math.round(prediction.score * 100);
    
    // Announce the object via sound/voice
    announceObject(label);
    
    // Calculate distance
    const estDistance = estimateDistance(height, videoHeight);
    const distanceText = estDistance.toFixed(1) + 'm';
    
    // Determine risk level based on distance
    let color = '#38bdf8'; // Default blue
    let risk = 'low';
    
    if (estDistance < 1.0) {
        color = '#ef4444'; // Red for very close
        risk = 'high';
        // Beep and Vibrate if very close (throttled)
        const now = Date.now();
        if (now - lastBeepTime > 1000) {
            playBeep(800, 0.2);
            if ('vibrate' in navigator) {
                navigator.vibrate([300, 100, 300]); // Real vibration pattern (SOS/Warning style)
            }
            lastBeepTime = now;
        }
        logHazardToBackend({ label, score, distance: estDistance });
    } else if (estDistance < 2.5) {
        color = '#f59e0b'; // Orange for medium
        risk = 'medium';
    }

    // Set styling
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.fillStyle = color;
    ctx.font = 'bold 18px Inter';

    // Draw Box
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.stroke();

    // Draw Label bg
    const textStr = `${label.toUpperCase()} | Dist: ${distanceText} | Conf: ${score}%`;
    const textWidth = ctx.measureText(textStr).width;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(x, y - 30, textWidth + 16, 30);
    
    // Draw Label text
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = '#000000';
    ctx.fillText(textStr, x + 8, y - 9);

    return { label, score, distance: estDistance, risk, color };
}

// Update the UI sidebar
function updateSidebar(processedDetections) {
    detectionCount.textContent = processedDetections.length;
    
    if (processedDetections.length === 0) {
        detectionList.innerHTML = '<li class="empty-state">No objects detected. Env is clear.</li>';
        return;
    }

    // Sort by distance (closest first)
    processedDetections.sort((a, b) => a.distance - b.distance);

    detectionList.innerHTML = processedDetections.map(det => `
        <li class="detection-item" style="border-left: 4px solid ${det.color}">
            <div class="detection-info">
                <span class="detection-label" style="color: ${det.color}">${det.label}</span>
                <div class="detection-stats">
                    <span class="stat-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                        ${det.distance.toFixed(1)}m away
                    </span>
                    <span class="stat-item">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                        ${det.score}% conf
                    </span>
                </div>
            </div>
            <div class="warning-level warning-${det.risk}" title="${det.risk} collision risk"></div>
        </li>
    `).join('');
}

// Main Detection Loop
async function detectFrame() {
    if (!isWebcamStarted || !model) return;

    // Make predictions
    const predictions = await model.detect(video);
    
    // Clear previous canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const processedDetections = [];
    
    predictions.forEach(prediction => {
        // Draw the box and get formatted data
        const data = drawBox(prediction, canvas.width, canvas.height);
        processedDetections.push(data);
    });
    
    updateSidebar(processedDetections);
    
    // Loop
    animationId = requestAnimationFrame(detectFrame);
}

// Toggle Camera / App
toggleBtn.addEventListener('click', async () => {
    if (!isWebcamStarted) {
        // START
        initialState.classList.add('hidden');
        loadingState.classList.remove('hidden');
        
        try {
            // Load model if not loaded yet
            if (!model) {
                await loadModel();
            }
            
            await startWebcam();
            
            isWebcamStarted = true;
            loadingState.classList.add('hidden');
            scanningLines.classList.add('active');
            statusIndicator.classList.add('active');
            
            toggleBtn.textContent = 'Stop Camera';
            toggleBtn.classList.remove('primary');
            toggleBtn.classList.add('danger');
            
            cameraStatusText.textContent = 'Camera is active';
            
            // Start detection loop
            detectFrame();
            
        } catch (error) {
            loadingState.classList.add('hidden');
            initialState.classList.remove('hidden');
            console.error("Failed to start:", error);
        }
        
    } else {
        // STOP
        isWebcamStarted = false;
        if (animationId) cancelAnimationFrame(animationId);
        
        const stream = video.srcObject;
        if (stream) {
            const tracks = stream.getTracks();
            tracks.forEach(track => track.stop());
        }
        video.srcObject = null;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        scanningLines.classList.remove('active');
        statusIndicator.classList.remove('active');
        
        toggleBtn.textContent = 'Start Camera';
        toggleBtn.classList.remove('danger');
        
        cameraStatusText.textContent = 'Camera is off';
        
        initialState.classList.remove('hidden');
        detectionCount.textContent = '0';
        detectionList.innerHTML = '<li class="empty-state">Camera stopped.</li>';
    }
});

// Initialize audio context lazily
document.body.addEventListener('click', () => {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}, { once: true });

// Smooth scrolling for anchor links (Hero button -> Demo section)
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            const navHeight = document.getElementById('navbar').offsetHeight;
            const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - navHeight;
            window.scrollTo({
                top: targetPosition,
                behavior: 'smooth'
            });
        }
    });
});

// Connect Bluetooth Wearable Logic
const connectBtBtn = document.getElementById('connect-bt');
if (connectBtBtn) {
    connectBtBtn.addEventListener('click', async () => {
        if (!navigator.bluetooth) {
            alert("Aapka Mobile Browser (jese iPhone Safari) Web Bluetooth support nahi karta. Please Google Chrome (Android ya Laptop) use karein.");
            return;
        }
        
        try {
            // Attempt to use Web Bluetooth API with real GATT Server Connection
            // We request common services so we can actually connect and read data
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['battery_service', 'device_information']
            });
            
            console.log('Bluetooth Device Selected:', device.name);
            connectBtBtn.innerHTML = 'Connecting...';
            
            // REAL CONNECTION: Connect to the GATT server
            const server = await device.gatt.connect();
            console.log('Connected to GATT Server');
            
            let deviceName = device.name || 'Unnamed Device';
            let message = `Successfully paired and connected to: ${deviceName}\n`;
            
            // Try to read Device Information (Original Model/Manufacturer Names)
            try {
                const infoService = await server.getPrimaryService('device_information');
                try {
                    const modelChar = await infoService.getCharacteristic('model_number_string');
                    const value = await modelChar.readValue();
                    const modelName = new TextDecoder().decode(value);
                    message += `Model: ${modelName}\n`;
                } catch(e) {}
                try {
                    const mfgChar = await infoService.getCharacteristic('manufacturer_name_string');
                    const value = await mfgChar.readValue();
                    const mfgName = new TextDecoder().decode(value);
                    message += `Manufacturer: ${mfgName}\n`;
                } catch(e) {}
            } catch(e) {
                console.log("No extra device info found.");
            }
            
            // Try to read battery if available, to prove real data flow
            try {
                const service = await server.getPrimaryService('battery_service');
                const characteristic = await service.getCharacteristic('battery_level');
                const value = await characteristic.readValue();
                const batteryLevel = value.getUint8(0);
                message += `Battery Level: ${batteryLevel}%`;
            } catch (e) {
                console.log("No battery service found on this device.");
            }
            
            alert(message);
            
            // Visual confirmation
            connectBtBtn.style.backgroundColor = 'var(--accent-1)';
            connectBtBtn.style.color = '#181616ff';
            connectBtBtn.style.border = 'none';
            connectBtBtn.innerHTML = 'BT Connected';
            
            // Optional: Provide audio feedback that it connected
            const utterance = new SpeechSynthesisUtterance("External Bluetooth device connected successfully.");
            window.speechSynthesis.speak(utterance);
            
            // Listen for disconnection
            device.addEventListener('gattserverdisconnected', () => {
                alert(`Bluetooth device ${device.name || ''} disconnected.`);
                connectBtBtn.style.backgroundColor = 'transparent';
                connectBtBtn.style.color = 'var(--text-primary)';
                connectBtBtn.style.border = '1px solid var(--accent-1)';
                connectBtBtn.innerHTML = 'Connect BT';
            });
            
        } catch (error) {
            console.warn("Bluetooth connection failed or was cancelled:", error);
            connectBtBtn.innerHTML = 'Connect BT';
            if (error.name !== 'NotFoundError' && error.name !== 'SecurityError') {
               alert(`Bluetooth Error: ${error.message}. Ensure your device is ready to pair.`);
            }
        }
    });
}

// Waitlist Modal Logic
const waitlistBtn = document.getElementById('waitlist-btn');
const waitlistModal = document.getElementById('waitlist-modal');
const closeModalBtn = document.getElementById('close-modal');
const waitlistForm = document.getElementById('waitlist-form');
const waitlistSuccess = document.getElementById('waitlist-success');

if (waitlistBtn && waitlistModal) {
    waitlistBtn.addEventListener('click', () => {
        waitlistModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => {
        waitlistModal.classList.add('hidden');
        setTimeout(() => {
            waitlistSuccess.classList.add('hidden');
            waitlistForm.style.display = 'flex';
            waitlistForm.reset();
        }, 300);
    });

    // Close on click outside
    waitlistModal.addEventListener('click', (e) => {
        if (e.target === waitlistModal) {
            closeModalBtn.click();
        }
    });

    waitlistForm.addEventListener('submit', (e) => {
        e.preventDefault();
        // Here we could send it to backend, but we'll simulate success
        waitlistForm.style.display = 'none';
        waitlistSuccess.classList.remove('hidden');
        
        // Optionally save to backend if implemented, e.g. /api/waitlist
    });
}

// SOS Help Logic
const helpBtn = document.getElementById('get-help');
if (helpBtn) {
    helpBtn.addEventListener('click', async () => {
        if (!currentUsername) {
            alert("Please login/register before using SOS.");
            return;
        }
        
        const confirmHelp = confirm("Are you sure you want to send an SOS alert to the owner?");
        if (confirmHelp) {
            helpBtn.textContent = 'Sending SOS...';
            helpBtn.style.backgroundColor = '#991b1b'; // Darker red
            
            try {
                const res = await fetch('/api/help', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: currentUsername,
                        phone: currentUserPhone,
                        timestamp: new Date().toISOString(),
                        status: 'ACTIVE'
                    })
                });
                
                if (res.ok) {
                    announceObject("Emergency SOS request sent. Please stay calm.");
                    alert("SOS Alert Sent! The owner has been notified.");
                }
            } catch (e) {
                console.error("SOS failed", e);
                alert("Failed to send SOS. Please check your internet connection.");
            } finally {
                helpBtn.textContent = 'SOS HELP';
                helpBtn.style.backgroundColor = ''; // Restore to CSS default
            }
        }
    });
}

// --- PWA Installation Logic ---
let deferredPrompt;
const installAppBtn = document.getElementById('install-app-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    if (installAppBtn) installAppBtn.classList.remove('hidden');
});

if (installAppBtn) {
    installAppBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt = null;
        // Hide the install button
        installAppBtn.classList.add('hidden');
    });
}

window.addEventListener('appinstalled', (event) => {
    console.log('Aura was installed.');
    if (installAppBtn) installAppBtn.classList.add('hidden');
});
