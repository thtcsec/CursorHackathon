// Configuration
const BACKEND_URL = 'http://localhost:8000';
const FINGER_UP_THRESHOLD = 0.1;
const PEACE_Y_THRESHOLD = 0.05;
const THUMB_DISTANCE_THRESHOLD = 0.15;
const CLEAR_HOLD_TIME = 3000; // 3 seconds

// DOM Elements
const drawingCanvas = document.getElementById('drawingCanvas');
const drawingCtx = drawingCanvas.getContext('2d', { willReadFrequently: true });
const webcam = document.getElementById('webcam');
const overlayCanvas = document.getElementById('overlayCanvas');
const overlayCtx = overlayCanvas.getContext('2d');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const gestureDisplay = document.querySelector('.gesture-display');
const colorSwatch = document.getElementById('colorSwatch');
const colorText = document.getElementById('colorText');
const colorPalette = document.getElementById('colorPalette');
const aiResultModal = document.getElementById('aiResultModal');

// State
let hands;
let faceMesh;
let cameraStarted = false;
let isDrawing = false;
let lastX = null;
let lastY = null;
let currentColor = [0, 0, 255]; // BGR format (Red in OpenCV)
let currentGesture = 'idle';
let clearTimer = null;
let clearStartTime = null;
let colorPaletteActive = false;
let hoveredColorIndex = -1;
let ghostImage = null; // AI ghost guide overlay
let ghostOpacity = 0.4; // 40% opacity for ghost guide
let lastThumbY = 0;
let trailEffect = 'normal'; // normal, rainbow, neon
let lastEmotion = 'neutral';
let currentEmotion = 'Neutral'; // Global emotion state
let emojiReactionTimeout = null;
let darkModeTimer = null;
let darkModeStartTime = null;
let frameCount = 0;
let lastProcessTime = 0;
let isDarkModeTransitioning = false;
let lastDetectedGesture = 'idle';
let gestureStableCount = 0;
const GESTURE_STABLE_FRAMES = 3; // Need 3 consistent frames to change gesture

// Debug logger
const debugOutput = document.getElementById('debugOutput');
function debugLog(message, type = 'info') {
    if (!debugOutput) return;
    const time = new Date().toLocaleTimeString();
    const div = document.createElement('div');
    div.innerHTML = `<span class="debug-time">${time}</span><span class="debug-${type}">${message}</span>`;
    debugOutput.insertBefore(div, debugOutput.firstChild);
    
    // Keep only last 20 logs
    while (debugOutput.children.length > 20) {
        debugOutput.removeChild(debugOutput.lastChild);
    }
}

// Clear debug button
document.getElementById('clearDebug').addEventListener('click', () => {
    debugOutput.innerHTML = '';
});

// Initialize drawing canvas
function initCanvas() {
    const bgColor = document.body.classList.contains('dark-mode') ? '#2a2a2a' : 'white';
    drawingCtx.fillStyle = bgColor;
    drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';
    drawingCtx.lineWidth = 3;
}

initCanvas();

// Update color display
function updateColorDisplay() {
    const [b, g, r] = currentColor;
    colorSwatch.style.background = `rgb(${r}, ${g}, ${b})`;
    colorText.textContent = `RGB(${r}, ${g}, ${b})`;
}
updateColorDisplay();

// Initialize MediaPipe Hands
async function initializeMediaPipe() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 0,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.3
    });

    hands.onResults(onHandsResults);

    // Initialize Face Mesh for emotion detection
    faceMesh = new FaceMesh({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`;
        }
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onFaceMeshResults);
}

// Check if finger is up - more lenient for detection
function isFingerUp(landmarks, tipIdx, pipIdx) {
    const tip = landmarks[tipIdx];
    const pip = landmarks[pipIdx];
    // Simple check: tip above pip
    return tip.y < (pip.y - 0.03); // Lowered threshold for better detection
}

// Calculate distance between two points
function calculateDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Gesture detection logic - FIXED priority
function detectGesture(landmarks) {
    // Landmark indices
    const THUMB_TIP = 4;
    const INDEX_TIP = 8, INDEX_PIP = 6, INDEX_MCP = 5;
    const MIDDLE_TIP = 12, MIDDLE_PIP = 10;
    const RING_TIP = 16, RING_PIP = 14;
    const PINKY_TIP = 20, PINKY_PIP = 18;
    const WRIST = 0;

    // Check which fingers are up
    const indexUp = isFingerUp(landmarks, INDEX_TIP, INDEX_PIP);
    const middleUp = isFingerUp(landmarks, MIDDLE_TIP, MIDDLE_PIP);
    const ringUp = isFingerUp(landmarks, RING_TIP, RING_PIP);
    const pinkyUp = isFingerUp(landmarks, PINKY_TIP, PINKY_PIP);
    
    // Count fingers
    const fingersUp = [indexUp, middleUp, ringUp, pinkyUp].filter(Boolean).length;
    
    // Thumb detection
    const thumbTip = landmarks[THUMB_TIP];
    const indexTip = landmarks[INDEX_TIP];
    const wrist = landmarks[WRIST];
    const thumbDistance = calculateDistance(thumbTip, indexTip);
    
    // Thumb up: thumb VERY far from other fingers, clearly above wrist, ALL other fingers DOWN
    const thumbUp = thumbTip.y < wrist.y - 0.18 && // Higher threshold
                    thumbDistance > 0.18 && // Farther distance
                    fingersUp === 0 && // ALL other fingers must be down
                    !indexUp; // Explicitly check index is NOT up

    // PRIORITY ORDER (FIXED):
    
    // 1. Drawing mode (HIGHEST PRIORITY) - only index up
    if (indexUp && !middleUp && !ringUp && !pinkyUp && !thumbUp) {
        return { type: 'drawing', indexTip: landmarks[INDEX_TIP] };
    }

    // 2. Peace sign - index + middle up
    const indexMiddleYDiff = Math.abs(landmarks[INDEX_TIP].y - landmarks[MIDDLE_TIP].y);
    if (indexUp && middleUp && !ringUp && !pinkyUp && indexMiddleYDiff < 0.08) {
        return { type: 'peace', indexTip: landmarks[INDEX_TIP] };
    }

    // 3. Open hand - all 4 fingers clearly up
    if (fingersUp === 4) {
        return { type: 'open_hand' };
    }

    // 4. Thumb up - for color selection
    if (thumbUp) {
        return { type: 'thumb_up', thumbY: thumbTip.y };
    }

    // 5. Fist (for dark mode) - STRICT DETECTION to avoid conflicts
    if (fingersUp === 0 && !thumbUp) {
        // Hand must be VERY compact AND thumb must be tucked in
        const handSize = calculateDistance(landmarks[WRIST], landmarks[MIDDLE_TIP]);
        const thumbToWrist = calculateDistance(landmarks[THUMB_TIP], landmarks[WRIST]);
        
        // Very strict: hand small AND thumb close to palm
        if (handSize < 0.18 && thumbToWrist < 0.15) {
            return { type: 'fist' };
        }
    }

    // 6. Default: idle
    return { type: 'idle' };
}

// Handle hand tracking results - with visual feedback
function onHandsResults(results) {
    // Always clear overlay first
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        // Draw hand connections (green lines) for visual feedback
        drawConnectors(overlayCtx, landmarks, HAND_CONNECTIONS, {
            color: '#00FF00', 
            lineWidth: 2
        });
        
        // Draw landmarks (red dots)
        drawLandmarks(overlayCtx, landmarks, {
            color: '#FF0000', 
            lineWidth: 2, 
            radius: 4
        });
        
        // Detect gesture with smoothing
        const detectedGesture = detectGesture(landmarks);
        
        // Only change gesture if stable for multiple frames
        if (detectedGesture.type === lastDetectedGesture) {
            gestureStableCount++;
            if (gestureStableCount >= GESTURE_STABLE_FRAMES) {
                handleGesture(detectedGesture);
            }
        } else {
            lastDetectedGesture = detectedGesture.type;
            gestureStableCount = 0;
        }
    } else {
        // No hand - immediate transition to idle
        if (currentGesture !== 'idle') {
            lastDetectedGesture = 'idle';
            gestureStableCount = GESTURE_STABLE_FRAMES;
            handleNoHand();
        }
    }
}

// Handle detected gesture with debouncing
function handleGesture(gesture) {
    const prevGesture = currentGesture;
    currentGesture = gesture.type;
    
    // Log gesture changes (throttled)
    if (prevGesture !== currentGesture && frameCount % 10 === 0) {
        debugLog(`Gesture: ${prevGesture} → ${currentGesture}`, 'gesture');
    }

    switch (gesture.type) {
        case 'thumb_up':
            handleThumbUpGesture(gesture.thumbY);
            break;

        case 'open_hand':
            handleOpenHandGesture();
            break;

        case 'peace':
            handlePeaceGesture(gesture.indexTip);
            break;

        case 'drawing':
            handleDrawingGesture(gesture.indexTip);
            break;

        case 'fist':
            handleFistGesture();
            break;

        case 'idle':
        default:
            handleIdleGesture();
            break;
    }
}

// Thumb up: Color selection
function handleThumbUpGesture(thumbY) {
    updateGestureDisplay('👍', 'Thumb Up - Select Color');
    
    if (!colorPaletteActive) {
        colorPaletteActive = true;
        colorPalette.classList.add('show');
    }

    // Calculate which color is hovered based on thumb Y position
    const colorOptions = document.querySelectorAll('.color-option');
    const normalizedY = thumbY; // 0 to 1
    const colorIndex = Math.floor(normalizedY * colorOptions.length);
    const clampedIndex = Math.max(0, Math.min(colorOptions.length - 1, colorIndex));

    // Update hover state
    colorOptions.forEach((option, index) => {
        if (index === clampedIndex) {
            option.classList.add('hovered');
        } else {
            option.classList.remove('hovered');
        }
    });

    hoveredColorIndex = clampedIndex;
    lastThumbY = thumbY;
    
    // Reset clear timer
    resetClearTimer();
    // Stop drawing
    isDrawing = false;
    lastX = null;
    lastY = null;
}

// Open hand: Clear canvas after 3 seconds
function handleOpenHandGesture() {
    if (!clearTimer) {
        clearStartTime = Date.now();
        clearTimer = setInterval(() => {
            const elapsed = Date.now() - clearStartTime;
            const remaining = Math.ceil((CLEAR_HOLD_TIME - elapsed) / 1000);
            
            if (remaining > 0) {
                updateGestureDisplay('🖐️', `Open Hand - Clearing in ${remaining}s`);
            } else {
                // Clear canvas
                drawingCtx.fillStyle = 'white';
                drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
                updateGestureDisplay('✅', 'Canvas Cleared!');
                resetClearTimer();
                setTimeout(() => {
                    if (currentGesture === 'open_hand') {
                        updateGestureDisplay('🖐️', 'Open Hand');
                    }
                }, 1000);
            }
        }, 100);
    }
    
    // Hide color palette
    if (colorPaletteActive) {
        finalizeColorSelection();
    }
    
    // Stop drawing
    isDrawing = false;
    lastX = null;
    lastY = null;
}

// Peace sign: Pause drawing
function handlePeaceGesture(indexTip) {
    updateGestureDisplay('✌️', 'Peace Sign - Pause Drawing');
    
    // Reset clear timer
    resetClearTimer();
    
    // Hide color palette
    if (colorPaletteActive) {
        finalizeColorSelection();
    }
    
    // Stop drawing but show pointer position
    isDrawing = false;
    lastX = null;
    lastY = null;
    
    // Draw cursor on overlay
    const x = (1 - indexTip.x) * overlayCanvas.width;
    const y = indexTip.y * overlayCanvas.height;
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, 10, 0, 2 * Math.PI);
    overlayCtx.fillStyle = 'rgba(255, 255, 0, 0.5)';
    overlayCtx.fill();
}

// Drawing mode: Draw on canvas
function handleDrawingGesture(indexTip) {
    updateGestureDisplay('☝️', 'Drawing Mode');
    
    // Reset clear timer
    resetClearTimer();
    
    // Hide color palette
    if (colorPaletteActive) {
        finalizeColorSelection();
    }
    
    // Map index finger position to drawing canvas
    const x = (1 - indexTip.x) * drawingCanvas.width;
    const y = indexTip.y * drawingCanvas.height;

    if (!isDrawing) {
        isDrawing = true;
        lastX = x;
        lastY = y;
                    } else {
                        // Draw line with trail effect
                        if (trailEffect === 'rainbow') {
                            const grad = drawingCtx.createLinearGradient(lastX, lastY, x, y);
                            const hue1 = (Date.now() / 10) % 360;
                            const hue2 = (hue1 + 60) % 360;
                            grad.addColorStop(0, `hsl(${hue1}, 100%, 50%)`);
                            grad.addColorStop(1, `hsl(${hue2}, 100%, 50%)`);
                            drawingCtx.strokeStyle = grad;
                        } else if (trailEffect === 'neon') {
                            const [b, g, r] = currentColor;
                            drawingCtx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
                            drawingCtx.shadowBlur = 15;
                            drawingCtx.shadowColor = `rgb(${r}, ${g}, ${b})`;
                        } else {
                            const [b, g, r] = currentColor;
                            drawingCtx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
                            drawingCtx.shadowBlur = 0;
                        }
                        
                        drawingCtx.beginPath();
                        drawingCtx.moveTo(lastX, lastY);
                        drawingCtx.lineTo(x, y);
                        drawingCtx.stroke();
                        
                        lastX = x;
                        lastY = y;
                    }
}

// Idle: No active gesture
function handleIdleGesture() {
    updateGestureDisplay('✊', 'Closed Hand - Idle');
    
    // Reset clear timer
    resetClearTimer();
    resetDarkModeTimer();
    
    // Hide color palette
    if (colorPaletteActive) {
        finalizeColorSelection();
    }
    
    // Stop drawing
    isDrawing = false;
    lastX = null;
    lastY = null;
}

// Fist: Dark mode toggle
function handleFistGesture() {
    if (isDarkModeTransitioning) {
        // Skip during transition to prevent flicker
        return;
    }
    
    if (!darkModeTimer) {
        darkModeStartTime = Date.now();
        debugLog('Fist detected - Dark mode timer started', 'gesture');
        
        darkModeTimer = setInterval(() => {
            const elapsed = Date.now() - darkModeStartTime;
            const remaining = Math.ceil((2000 - elapsed) / 1000);
            
            if (remaining > 0) {
                updateGestureDisplay('✊', `Fist - Dark Mode in ${remaining}s`);
            } else {
                // Toggle dark mode
                isDarkModeTransitioning = true;
                const wasDark = document.body.classList.contains('dark-mode');
                document.body.classList.toggle('dark-mode');
                const isDark = document.body.classList.contains('dark-mode');
                
                // Save current canvas content
                const imageData = drawingCtx.getImageData(0, 0, drawingCanvas.width, drawingCanvas.height);
                
                // Change background only
                const bgColor = isDark ? '#2a2a2a' : 'white';
                drawingCtx.fillStyle = bgColor;
                drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
                
                // Restore drawing on top
                drawingCtx.putImageData(imageData, 0, 0);
                
                debugLog(`Dark mode ${isDark ? 'ON' : 'OFF'}`, 'info');
                updateGestureDisplay('✅', isDark ? 'Dark Mode ON' : 'Light Mode ON');
                resetDarkModeTimer();
                
                // Reset transition flag after 1 second
                setTimeout(() => {
                    isDarkModeTransitioning = false;
                }, 1000);
            }
        }, 100);
    }
    
    // Reset clear timer
    resetClearTimer();
    
    // Hide color palette
    if (colorPaletteActive) {
        finalizeColorSelection();
    }
    
    // Stop drawing
    isDrawing = false;
    lastX = null;
    lastY = null;
}

// No hand detected
function handleNoHand() {
    updateGestureDisplay('✋', 'No hand detected');
    currentGesture = 'idle';
    
    // Reset clear timer
    resetClearTimer();
    
    // Finalize color selection if active
    if (colorPaletteActive) {
        finalizeColorSelection();
    }
    
    // Stop drawing
    isDrawing = false;
    lastX = null;
    lastY = null;
}

// Update gesture display
function updateGestureDisplay(icon, text) {
    gestureDisplay.innerHTML = `
        <span class="gesture-icon">${icon}</span>
        <span class="gesture-text">${text}</span>
    `;
}

// Reset clear timer
function resetClearTimer() {
    if (clearTimer) {
        clearInterval(clearTimer);
        clearTimer = null;
        clearStartTime = null;
    }
}

// Reset dark mode timer
function resetDarkModeTimer() {
    if (darkModeTimer) {
        clearInterval(darkModeTimer);
        darkModeTimer = null;
        darkModeStartTime = null;
    }
}

// Finalize color selection
function finalizeColorSelection() {
    if (hoveredColorIndex >= 0) {
        const colorOptions = document.querySelectorAll('.color-option');
        const selectedOption = colorOptions[hoveredColorIndex];
        const colorStr = selectedOption.dataset.color;
        currentColor = colorStr.split(',').map(Number);
        updateColorDisplay();
    }
    
    colorPaletteActive = false;
    colorPalette.classList.remove('show');
    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('hovered');
    });
    hoveredColorIndex = -1;
}

// Camera processing loop - optimized
async function processCamera() {
    if (!cameraStarted) return;
    
    frameCount++;
    
    // Process hands every frame for smooth drawing
    try {
        await hands.send({image: webcam});
    } catch (e) {
        debugLog(`Hand processing error: ${e.message}`, 'error');
    }
    
    // Process face mesh only every 10 frames (further reduced)
    if (frameCount % 10 === 0) {
        try {
            await faceMesh.send({image: webcam});
        } catch (e) {
            debugLog(`Face processing error: ${e.message}`, 'error');
        }
    }
    
    // No throttling - let browser handle frame rate naturally
    requestAnimationFrame(processCamera);
}

// Face emotion detection - improved sensitivity
function onFaceMeshResults(results) {
    if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
        // Reset to neutral if no face
        if (document.getElementById('emotionText').textContent !== 'Neutral') {
            document.getElementById('emotionIcon').textContent = '😐';
            document.getElementById('emotionText').textContent = 'Neutral';
            currentEmotion = 'Neutral'; // Update global
        }
        return;
    }
    
    const landmarks = results.multiFaceLandmarks[0];
    
    // More precise emotion detection
    const upperLip = landmarks[13];
    const lowerLip = landmarks[14];
    const leftMouth = landmarks[61];
    const rightMouth = landmarks[291];
    
    // Mouth dimensions
    const mouthHeight = Math.abs(lowerLip.y - upperLip.y);
    const mouthWidth = Math.abs(rightMouth.x - leftMouth.x);
    const smileRatio = mouthWidth / mouthHeight;
    
    // Eyebrows for sad detection
    const leftEyebrowInner = landmarks[70];
    const rightEyebrowInner = landmarks[300];
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    
    const eyebrowToEyeLeft = Math.abs(leftEyebrowInner.y - leftEye.y);
    const eyebrowToEyeRight = Math.abs(rightEyebrowInner.y - rightEye.y);
    const avgEyebrowDistance = (eyebrowToEyeLeft + eyebrowToEyeRight) / 2;
    
    let emotion = 'Neutral';
    let icon = '😐';
    
    // More sensitive thresholds
    if (smileRatio > 4.0 && mouthHeight > 0.01) {
        // Smiling - mouth wider
        emotion = 'Happy';
        icon = '😊';
    } else if (mouthHeight < 0.008 && smileRatio < 4.2) {
        // Closed mouth + not wide = could be sad
        if (avgEyebrowDistance < 0.08) {
            emotion = 'Sad';
            icon = '😢';
        }
    } else if (avgEyebrowDistance < 0.07) {
        // Eyebrows very close to eyes = sad/worried
        emotion = 'Sad';
        icon = '😢';
    }
    
    document.getElementById('emotionIcon').textContent = icon;
    document.getElementById('emotionText').textContent = emotion;
    currentEmotion = emotion; // Update global variable
    
    // Auto-Emoji Reaction with debounce
    if (emotion !== lastEmotion && emotion !== 'Neutral' && !emojiReactionTimeout) {
        lastEmotion = emotion;
        showEmojiReaction(icon);
    }
}

// Show emoji reaction on canvas
function showEmojiReaction(emoji) {
    const emojiSize = 60;
    const x = drawingCanvas.width - emojiSize - 20;
    const y = emojiSize + 20;
    
    // Draw emoji with shadow for visibility
    drawingCtx.save();
    drawingCtx.font = `${emojiSize}px Arial`;
    drawingCtx.shadowColor = 'rgba(0,0,0,0.3)';
    drawingCtx.shadowBlur = 5;
    drawingCtx.fillText(emoji, x, y);
    drawingCtx.restore();
    
    // Debounce for 3 seconds
    emojiReactionTimeout = setTimeout(() => {
        emojiReactionTimeout = null;
        lastEmotion = 'Neutral';
    }, 3000);
}

// Start camera
document.getElementById('startCameraBtn').addEventListener('click', async () => {
    if (!cameraStarted) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480 } 
            });
            webcam.srcObject = stream;
            
            await initializeMediaPipe();
            
            webcam.addEventListener('loadeddata', () => {
                // Set overlay canvas size to match video
                overlayCanvas.width = webcam.videoWidth;
                overlayCanvas.height = webcam.videoHeight;
                
                cameraStarted = true;
                processCamera();
                
                debugLog('Camera started successfully', 'info');
                debugLog(`Resolution: ${webcam.videoWidth}x${webcam.videoHeight}`, 'info');
                
                // Update UI
                statusIndicator.classList.add('running');
                statusText.textContent = 'Running';
                document.getElementById('startCameraBtn').disabled = true;
                document.getElementById('stopCameraBtn').disabled = false;
            });
        } catch (error) {
            debugLog(`Camera error: ${error.message}`, 'error');
            alert('Error accessing camera: ' + error.message);
            console.error('Camera error:', error);
        }
    }
});

// Stop camera
document.getElementById('stopCameraBtn').addEventListener('click', () => {
    if (cameraStarted) {
        cameraStarted = false;
        const stream = webcam.srcObject;
        const tracks = stream.getTracks();
        tracks.forEach(track => track.stop());
        webcam.srcObject = null;
        
        debugLog('Camera stopped', 'info');
        
        // Update UI
        statusIndicator.classList.remove('running');
        statusText.textContent = 'Not Running';
        document.getElementById('startCameraBtn').disabled = false;
        document.getElementById('stopCameraBtn').disabled = true;
        
        // Clear overlay
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        updateGestureDisplay('✋', 'No hand detected');
    }
});

// Clear canvas button
document.getElementById('clearCanvasBtn').addEventListener('click', () => {
    const bgColor = document.body.classList.contains('dark-mode') ? '#2a2a2a' : 'white';
    drawingCtx.fillStyle = bgColor;
    drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    ghostImage = null; // Clear ghost guide too
    debugLog('Canvas cleared manually', 'info');
});

// Save Drawing button - save to media folder
document.getElementById('saveBtn').addEventListener('click', async () => {
    try {
        // Convert canvas to blob
        const blob = await new Promise(resolve => drawingCanvas.toBlob(resolve, 'image/png'));
        
        // Create form data
        const formData = new FormData();
        formData.append('image', blob, 'drawing.png');
        
        // Send to backend to save in media folder
        const response = await fetch(`${BACKEND_URL}/save-drawing`, {
            method: 'POST',
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            debugLog(`Saved: ${result.filename}`, 'info');
            
            // Also download to user's computer
            const link = document.createElement('a');
            link.download = result.filename;
            link.href = drawingCanvas.toDataURL('image/png');
            link.click();
            
            alert(`✅ Drawing saved!\nFile: ${result.filename}\nLocation: media folder + Downloads`);
        } else {
            throw new Error('Save failed');
        }
    } catch (error) {
        debugLog(`Save error: ${error.message}`, 'error');
        // Fallback to normal download
        const link = document.createElement('a');
        const filename = `airdraw-${Date.now()}.png`;
        link.download = filename;
        link.href = drawingCanvas.toDataURL('image/png');
        link.click();
        debugLog(`Downloaded: ${filename}`, 'info');
    }
});

// Effect controls
document.querySelectorAll('[data-effect]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-effect]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        trailEffect = btn.dataset.effect;
        debugLog(`Trail effect: ${trailEffect}`, 'info');
    });
});

// AI Finish Sketch button
document.getElementById('aiFinishBtn').addEventListener('click', async () => {
    aiResultModal.classList.add('show');
    document.getElementById('loadingSpinner').style.display = 'block';
    document.getElementById('resultDisplay').style.display = 'none';
    document.getElementById('errorDisplay').style.display = 'none';
    
    statusIndicator.classList.add('processing');
    statusIndicator.classList.remove('running');
    statusText.textContent = 'AI Finishing...';
    
    try {
        const blob = await new Promise(resolve => drawingCanvas.toBlob(resolve, 'image/png'));
        const formData = new FormData();
        formData.append('image', blob, 'drawing.png');
        
        const response = await fetch(`${BACKEND_URL}/finish-drawing`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const result = await response.json();
        
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('resultDisplay').style.display = 'block';
        document.getElementById('detectedObject').textContent = 'FINISHED SKETCH';
        
        // Load generated image with error handling

// AI Ghost Guide button - OVERLAY MODE!
document.getElementById('aiGhostBtn').addEventListener('click', async () => {
    debugLog('Ghost Guide: Starting...', 'info');
    
    try {
        const blob = await new Promise(resolve => drawingCanvas.toBlob(resolve, 'image/png'));
        const formData = new FormData();
        formData.append('image', blob, 'drawing.png');
        
        statusIndicator.classList.add('processing');
        statusText.textContent = 'AI Creating Ghost Guide...';
        
        const response = await fetch(`${BACKEND_URL}/ghost-guide`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Load ghost image
        ghostImage = new Image();
        ghostImage.crossOrigin = 'anonymous';
        ghostImage.onload = () => {
            debugLog(`Ghost Guide loaded: ${result.description}`, 'info');
            statusText.textContent = 'Running';
            statusIndicator.classList.remove('processing');
            statusIndicator.classList.add('running');
            
            // Render ghost ONCE as background
            drawingCtx.save();
            drawingCtx.globalAlpha = ghostOpacity;
            const scale = Math.min(
                drawingCanvas.width / ghostImage.width,
                drawingCanvas.height / ghostImage.height
            );
            const x = (drawingCanvas.width - ghostImage.width * scale) / 2;
            const y = (drawingCanvas.height - ghostImage.height * scale) / 2;
            drawingCtx.drawImage(ghostImage, x, y, ghostImage.width * scale, ghostImage.height * scale);
            drawingCtx.restore();
            
            debugLog('Ghost rendered on canvas! Draw over it!', 'info');
            
            // Speak witty message
            const wittyMessages = [
                `Here's a pro version! Try to trace it if you dare!`,
                `Ghost mode activated! Can you follow my lines?`,
                `I made it pretty. Your turn to copy!`,
                `Behold! The AI's masterpiece. Now trace it!`,
                `Follow the ghost... if you can keep up!`
            ];
            const randomMsg = wittyMessages[Math.floor(Math.random() * wittyMessages.length)];
            speakText(randomMsg);
        };
        ghostImage.onerror = () => {
            debugLog('Ghost Guide: Image load failed, retrying...', 'error');
            setTimeout(() => {
                ghostImage.src = result.image_url + '&t=' + Date.now();
            }, 1000);
        };
        ghostImage.src = result.image_url;
        
    } catch (error) {
        debugLog(`Ghost Guide error: ${error.message}`, 'error');
        alert('Ghost Guide failed. Backend running?');
        statusText.textContent = 'Error';
        statusIndicator.classList.remove('processing');
    }
});
        const imgElement = document.getElementById('generatedImage');
        imgElement.onerror = () => {
            debugLog('Image load failed, retrying...', 'error');
            imgElement.src = result.image_url + '&t=' + Date.now();
        };
        imgElement.src = result.image_url;
        
        debugLog('AI Finish complete', 'info');
        
    } catch (error) {
        console.error('AI Finish error:', error);
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('errorDisplay').style.display = 'block';
        document.getElementById('errorMessage').textContent = `Error: ${error.message}`;
    } finally {
        statusIndicator.classList.remove('processing');
        if (cameraStarted) {
            statusIndicator.classList.add('running');
            statusText.textContent = 'Running';
        } else {
            statusText.textContent = 'Not Running';
        }
    }
});

// AI Analyze button
document.getElementById('aiAnalyzeBtn').addEventListener('click', async () => {
    // Show modal
    aiResultModal.classList.add('show');
    document.getElementById('loadingSpinner').style.display = 'block';
    document.getElementById('resultDisplay').style.display = 'none';
    document.getElementById('errorDisplay').style.display = 'none';
    
    // Update status
    statusIndicator.classList.add('processing');
    statusIndicator.classList.remove('running');
    statusText.textContent = 'AI Processing...';
    
    try {
        // Convert canvas to blob
        const blob = await new Promise(resolve => drawingCanvas.toBlob(resolve, 'image/png'));
        
        // Create form data
        const formData = new FormData();
        formData.append('image', blob, 'drawing.png');
        
        // Send to backend
        const response = await fetch(`${BACKEND_URL}/analyze-drawing`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Display result
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('resultDisplay').style.display = 'block';
        document.getElementById('detectedObject').textContent = result.description.toUpperCase();
        
        // Load generated image with error handling
        const imgElement = document.getElementById('generatedImage');
        imgElement.onerror = () => {
            debugLog('Image load failed, retrying...', 'error');
            // Retry with cache buster
            imgElement.src = result.image_url + '&t=' + Date.now();
        };
        imgElement.src = result.image_url;
        
        debugLog(`AI Result: ${result.description}`, 'info');
        
    } catch (error) {
        console.error('AI Analysis error:', error);
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('errorDisplay').style.display = 'block';
        document.getElementById('errorMessage').textContent = `Error: ${error.message}. Make sure the backend server is running.`;
    } finally {
        // Restore status
        statusIndicator.classList.remove('processing');
        if (cameraStarted) {
            statusIndicator.classList.add('running');
            statusText.textContent = 'Running';
        } else {
            statusText.textContent = 'Not Running';
        }
    }
});

// Close modal
document.getElementById('closeModal').addEventListener('click', () => {
    aiResultModal.classList.remove('show');
});

// Close modal on outside click
aiResultModal.addEventListener('click', (e) => {
    if (e.target === aiResultModal) {
        aiResultModal.classList.remove('show');
    }
});

console.log('%c🎨 AirDraw Vision - Web', 'color: #667eea; font-size: 20px; font-weight: bold');
console.log('%c✅ Optimized for performance - Single hand mode', 'color: #4CAF50; font-size: 14px');
console.log('%c- Hand tracking: 1 hand, ~40-60 FPS', 'color: #999');
console.log('%c- Face detection: Every 10 frames', 'color: #999');
console.log('%c- Model complexity: Lightweight', 'color: #999');
console.log('%c- Voice Chat: Enabled 🎤', 'color: #4CAF50');

// ==== VOICE CHAT FEATURE ====
const voiceModal = document.getElementById('voiceModal');
const voiceOrb = document.getElementById('voiceOrb');
const voiceStatus = document.getElementById('voiceStatus');
const voiceBtn = document.getElementById('voiceBtn');
const voiceTranscript = document.getElementById('voiceTranscript');
const voiceResponse = document.getElementById('voiceResponse');
const floatingVoiceBtn = document.getElementById('floatingVoiceBtn');

let recognition;
let isListening = false;

// Initialize Speech Recognition with better noise handling
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;
    
    // Noise filtering - only trigger on actual speech
    let silenceTimeout;
    
    recognition.onspeechstart = () => {
        clearTimeout(silenceTimeout);
        debugLog('Voice: Speech detected (not noise)', 'info');
    };
    
    recognition.onspeechend = () => {
        silenceTimeout = setTimeout(() => {
            debugLog('Voice: Speech ended', 'info');
        }, 500);
    };
    
    recognition.onstart = () => {
        isListening = true;
        voiceOrb.classList.add('listening');
        voiceBtn.classList.add('listening');
        voiceStatus.textContent = 'Listening...';
        
        // Stop any ongoing speech when user starts speaking
        if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            debugLog('Voice: Speech interrupted by user', 'info');
        }
        
        debugLog('Voice: Listening started', 'info');
    };
    
    recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        voiceTranscript.textContent = `You: "${transcript}"`;
        debugLog(`Voice: "${transcript}"`, 'info');
        
        // Check for voice commands first
        const command = transcript.toLowerCase().trim();
        
        // Voice commands handling - BETTER DETECTION & REAL EXECUTION
        if (command.includes('start') || command.includes('open') || command.includes('turn on') || 
            command.includes('camera') || command.includes('begin') || command.includes('bắt đầu')) {
            // More flexible: "start camera", "open", "camera", "turn on", etc
            if (command.includes('camera') || command.includes('start') || command.includes('open') || command.includes('bắt đầu')) {
                voiceResponse.textContent = 'AI: Opening camera for you!';
                document.getElementById('startCameraBtn').click(); // This works!
                speakText('Opening camera for you!');
                debugLog('Voice command: Starting camera', 'info');
                return;
            }
        }
        
        if (command.includes('stop') || command.includes('close') || command.includes('turn off') || command.includes('dừng')) {
            if (command.includes('camera')) {
                voiceResponse.textContent = 'AI: Stopping camera!';
                document.getElementById('stopCameraBtn').click();
                speakText('Stopping camera!');
                debugLog('Voice command: Stopping camera', 'info');
                return;
            }
        }
        
        if (command.includes('clear') || command.includes('xóa') || command.includes('erase') || command.includes('delete')) {
            voiceResponse.textContent = 'AI: Clearing canvas!';
            document.getElementById('clearCanvasBtn').click();
            speakText('Canvas cleared!');
            debugLog('Voice command: Clearing canvas', 'info');
            return;
        }
        
        if (command.includes('save') || command.includes('lưu') || command.includes('download')) {
            voiceResponse.textContent = 'AI: Saving your drawing!';
            document.getElementById('saveBtn').click();
            speakText('Saving your drawing!');
            return;
        }
        
        if (command.includes('analyze') || command.includes('what is this') || command.includes('what did i draw')) {
            voiceResponse.textContent = 'AI: Analyzing your drawing...';
            document.getElementById('aiAnalyzeBtn').click();
            speakText('Let me analyze your drawing');
            debugLog('Voice command: Analyzing drawing', 'info');
            return;
        }
        
        // Enhanced this picture / ghost guide
        if (command.includes('enhance') || command.includes('ghost') || command.includes('guide') || 
            command.includes('improve') || command.includes('make it better')) {
            voiceResponse.textContent = 'AI: Creating ghost guide...';
            document.getElementById('aiGhostBtn').click();
            debugLog('Voice command: Ghost guide activated', 'info');
            return;
        }
        
        // If not a command, get AI response
        await getAIResponse(transcript);
    };
    
    recognition.onerror = (event) => {
        // Filter out noise errors
        if (event.error === 'no-speech') {
            debugLog('Voice: No speech detected (might be noise)', 'info');
            voiceStatus.textContent = 'No speech detected. Try again!';
        } else if (event.error === 'audio-capture') {
            debugLog(`Voice error: Microphone issue`, 'error');
            voiceStatus.textContent = 'Microphone error!';
        } else {
            debugLog(`Voice error: ${event.error}`, 'error');
            voiceStatus.textContent = 'Error. Try again!';
        }
        stopListening();
    };
    
    recognition.onend = () => {
        stopListening();
    };
} else {
    console.warn('Speech Recognition not supported');
}

function startListening() {
    if (recognition && !isListening) {
        recognition.start();
    }
}

function stopListening() {
    isListening = false;
    voiceOrb.classList.remove('listening');
    voiceBtn.classList.remove('listening');
    voiceStatus.textContent = 'Tap to speak';
}

// Helper function for text-to-speech - FASTER!
function speakText(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.6; // Much faster! (was 1.3)
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        window.speechSynthesis.speak(utterance);
    }
}

async function getAIResponse(text) {
    try {
        voiceOrb.classList.add('speaking');
        voiceStatus.textContent = 'AI is thinking...';
        
        const response = await fetch(`${BACKEND_URL}/voice-chat?text=${encodeURIComponent(text)}`, {
            method: 'POST'
        });
        
        if (!response.ok) throw new Error('AI request failed');
        
        const result = await response.json();
        const aiText = result.response;
        
        voiceResponse.textContent = `AI: ${aiText}`;
        voiceOrb.classList.remove('speaking');
        voiceStatus.textContent = 'Done! Tap to speak again';
        
        debugLog('AI responded', 'info');
        
        // Text-to-Speech
        speakText(aiText);
        
    } catch (error) {
        debugLog(`AI error: ${error.message}`, 'error');
        voiceResponse.textContent = 'AI: Sorry, I encountered an error. Please try again!';
        voiceOrb.classList.remove('speaking');
        voiceStatus.textContent = 'Error. Try again!';
    }
}

// Open voice modal
floatingVoiceBtn.addEventListener('click', () => {
    voiceModal.classList.add('show');
    voiceTranscript.textContent = '';
    voiceResponse.textContent = '';
    debugLog('Voice Chat opened', 'info');
});

// Close voice modal
document.getElementById('closeVoiceModal').addEventListener('click', () => {
    voiceModal.classList.remove('show');
    if (isListening) {
        recognition.stop();
    }
    debugLog('Voice Chat closed', 'info');
});

// Voice button click
voiceBtn.addEventListener('click', () => {
    if (!isListening) {
        startListening();
    } else {
        recognition.stop();
    }
});

// Screen capture button - AI sees ONLY drawing + emotion!
document.getElementById('screenCaptureBtn').addEventListener('click', async () => {
    try {
        voiceOrb.classList.add('speaking');
        voiceStatus.textContent = 'AI analyzing your drawing...';
        voiceTranscript.textContent = 'You: 👁️ What did I draw?';
        
        debugLog('AI Vision: Analyzing with Gemini...', 'info');
        
        // Create a composite canvas - ONLY DRAWING + TEXT
        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = drawingCanvas.width;
        compositeCanvas.height = drawingCanvas.height + 60;
        const ctx = compositeCanvas.getContext('2d');
        
        // White background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, compositeCanvas.width, compositeCanvas.height);
        
        // Draw the drawing canvas
        ctx.drawImage(drawingCanvas, 0, 0);
        
        // Add emotion label at bottom
        ctx.fillStyle = 'black';
        ctx.font = 'bold 20px Arial';
        const emotionText = `Current Emotion: ${currentEmotion}`;
        ctx.fillText(emotionText, 10, compositeCanvas.height - 30);
        
        debugLog(`Screen capture: Canvas created with emotion: ${currentEmotion}`, 'info');
        
        // Convert to blob
        const blob = await new Promise(resolve => compositeCanvas.toBlob(resolve, 'image/jpeg', 0.95));
        
        debugLog(`Screen capture: Blob size ${(blob.size/1024).toFixed(1)}KB`, 'info');
        
        // Send to AI with emotion context
        const formData = new FormData();
        formData.append('image', blob, 'drawing.jpg');
        
        voiceStatus.textContent = 'AI is analyzing...';
        
        const response = await fetch(`${BACKEND_URL}/analyze-screen`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Server error: ${response.status} - ${errorText}`);
        }
        
        const result = await response.json();
        const aiText = result.response;
        
        voiceResponse.textContent = `AI: ${aiText}`;
        voiceOrb.classList.remove('speaking');
        voiceStatus.textContent = 'Done!';
        
        debugLog(`Drawing analyzed: ${aiText}`, 'info');
        
        // Speak result
        speakText(aiText);
        
    } catch (error) {
        debugLog(`Screen capture error: ${error.message}`, 'error');
        voiceResponse.textContent = `AI: Error - ${error.message}. Make sure backend is running!`;
        voiceOrb.classList.remove('speaking');
        voiceStatus.textContent = 'Error';
        speakText('Sorry, I had trouble analyzing your drawing.');
    }
});

