// Configuration
const BACKEND_URL = 'http://localhost:8000';
const FINGER_UP_THRESHOLD = 0.1;
const PEACE_Y_THRESHOLD = 0.05;
const THUMB_DISTANCE_THRESHOLD = 0.15;
const CLEAR_HOLD_TIME = 3000; // 3 seconds

// DOM Elements
const drawingCanvas = document.getElementById('drawingCanvas');
const drawingCtx = drawingCanvas.getContext('2d');
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
let lastThumbY = 0;

// Initialize drawing canvas
drawingCtx.fillStyle = 'white';
drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
drawingCtx.lineCap = 'round';
drawingCtx.lineJoin = 'round';
drawingCtx.lineWidth = 3;

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
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
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
        refineLandmarks: true,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });

    faceMesh.onResults(onFaceMeshResults);
}

// Check if finger is up
function isFingerUp(landmarks, tipIdx, pipIdx) {
    const tip = landmarks[tipIdx];
    const pip = landmarks[pipIdx];
    return tip.y < pip.y - FINGER_UP_THRESHOLD;
}

// Calculate distance between two points
function calculateDistance(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Gesture detection logic
function detectGesture(landmarks) {
    // Landmark indices
    const THUMB_TIP = 4, THUMB_IP = 3;
    const INDEX_TIP = 8, INDEX_PIP = 6;
    const MIDDLE_TIP = 12, MIDDLE_PIP = 10;
    const RING_TIP = 16, RING_PIP = 14;
    const PINKY_TIP = 20, PINKY_PIP = 18;

    // Check which fingers are up
    const indexUp = isFingerUp(landmarks, INDEX_TIP, INDEX_PIP);
    const middleUp = isFingerUp(landmarks, MIDDLE_TIP, MIDDLE_PIP);
    const ringUp = isFingerUp(landmarks, RING_TIP, RING_PIP);
    const pinkyUp = isFingerUp(landmarks, PINKY_TIP, PINKY_PIP);
    
    // Thumb check (different logic - horizontal extension)
    const thumbTip = landmarks[THUMB_TIP];
    const indexTip = landmarks[INDEX_TIP];
    const thumbDistance = calculateDistance(thumbTip, indexTip);
    const thumbUp = thumbTip.y < indexTip.y - 0.05 && thumbDistance > THUMB_DISTANCE_THRESHOLD;

    // Priority 1: Thumb up for color selection
    if (thumbUp && !indexUp && !middleUp && !ringUp && !pinkyUp) {
        return { type: 'thumb_up', thumbY: thumbTip.y };
    }

    // Priority 2: Open hand (all 4 fingers up) for clearing
    if (indexUp && middleUp && ringUp && pinkyUp) {
        return { type: 'open_hand' };
    }

    // Priority 3: Peace sign (index + middle up, others down)
    const indexMiddleYDiff = Math.abs(landmarks[INDEX_TIP].y - landmarks[MIDDLE_TIP].y);
    if (indexUp && middleUp && !ringUp && !pinkyUp && indexMiddleYDiff < PEACE_Y_THRESHOLD) {
        return { type: 'peace', indexTip: landmarks[INDEX_TIP] };
    }

    // Priority 4: Drawing mode (only index up)
    if (indexUp && !middleUp && !ringUp && !pinkyUp) {
        return { type: 'drawing', indexTip: landmarks[INDEX_TIP] };
    }

    // Default: idle/closed hand
    return { type: 'idle' };
}

// Handle hand tracking results
function onHandsResults(results) {
    // Clear overlay
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Draw hand landmarks on overlay
        drawConnectors(overlayCtx, landmarks, HAND_CONNECTIONS, {color: '#00FF00', lineWidth: 2});
        drawLandmarks(overlayCtx, landmarks, {color: '#FF0000', lineWidth: 1, radius: 3});

        // Detect gesture
        const gesture = detectGesture(landmarks);
        handleGesture(gesture);
    } else {
        // No hand detected
        handleNoHand();
    }
}

// Handle detected gesture
function handleGesture(gesture) {
    currentGesture = gesture.type;

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
        // Draw line
        const [b, g, r] = currentColor;
        drawingCtx.strokeStyle = `rgb(${r}, ${g}, ${b})`;
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

// Camera processing loop
async function processCamera() {
    if (cameraStarted) {
        await hands.send({image: webcam});
        await faceMesh.send({image: webcam});
        requestAnimationFrame(processCamera);
    }
}

// Face emotion detection
function onFaceMeshResults(results) {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const landmarks = results.multiFaceLandmarks[0];
        
        // Detect smile or frown based on mouth landmarks
        const upperLip = landmarks[13];
        const lowerLip = landmarks[14];
        const leftMouth = landmarks[61];
        const rightMouth = landmarks[291];
        
        // Calculate mouth dimensions
        const mouthHeight = Math.abs(lowerLip.y - upperLip.y);
        const mouthWidth = Math.abs(rightMouth.x - leftMouth.x);
        const smileRatio = mouthWidth / mouthHeight;
        
        // Detect eyebrows for sadness
        const leftEyebrow = landmarks[70];
        const rightEyebrow = landmarks[300];
        const noseBridge = landmarks[6];
        const eyebrowHeight = ((leftEyebrow.y + rightEyebrow.y) / 2);
        const eyebrowDistance = noseBridge.y - eyebrowHeight;
        
        // Determine emotion
        let emotion = 'Neutral';
        let icon = '😐';
        
        if (smileRatio > 4.5 && mouthHeight > 0.02) {
            emotion = 'Happy';
            icon = '😊';
        } else if (smileRatio > 5.5) {
            emotion = 'Very Happy';
            icon = '😄';
        } else if (smileRatio < 3.5 && eyebrowDistance < 0.08) {
            emotion = 'Sad';
            icon = '😢';
        } else if (eyebrowDistance < 0.06) {
            emotion = 'Very Sad';
            icon = '😭';
        }
        
        document.getElementById('emotionIcon').textContent = icon;
        document.getElementById('emotionText').textContent = emotion;
    }
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
                
                // Update UI
                statusIndicator.classList.add('running');
                statusText.textContent = 'Running';
                document.getElementById('startCameraBtn').disabled = true;
                document.getElementById('stopCameraBtn').disabled = false;
            });
        } catch (error) {
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
    drawingCtx.fillStyle = 'white';
    drawingCtx.fillRect(0, 0, drawingCanvas.width, drawingCanvas.height);
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
        document.getElementById('generatedImage').src = result.image_url;
        
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

console.log('AirDraw Vision - Web initialized!');

