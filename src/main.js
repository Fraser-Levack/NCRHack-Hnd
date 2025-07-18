import { Hands } from '@mediapipe/hands';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { Camera } from '@mediapipe/camera_utils';

const videoElement = document.getElementById('input_video');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');

canvasElement.width = 640;
canvasElement.height = 480;
videoElement.width = 640;
videoElement.height = 480;

// Variables for speed tracking
let previousCenter = null;
let previousTime = null;

// Variables for swipe gesture detection
let swipeHistory = [];
const swipeHistoryLength = 10; // Number of frames to track
const swipeThreshold = 50; // Reduced from 100 - Minimum total displacement for a swipe
const swipeSpeedThreshold = 30; // Reduced from 50 - Minimum speed to be considered a swipe
const swipeTimeWindow = 800; // Increased from 500 - Maximum time for a swipe gesture (ms)
let lastSwipeTime = 0; // Track when the last swipe was detected
const swipeCooldown = 1000; // Minimum time between swipe detections (ms)
var highlightedButton = null; // Track the currently highlighted button
var numButtons = 0;
let inactivityTimer = null; // Timer for inactivity detection


// Variables for depth/push gesture detection
let depthHistory = [];
const depthHistoryLength = 15; // Number of frames to track depth
const pushThreshold = 0.02; // Minimum Z displacement for push/pull gesture
const pushSpeedThreshold = 0.05; // Minimum Z speed for push/pull detection
const pushTimeWindow = 1000; // Maximum time for a push gesture (ms)
let lastPushTime = 0; // Track when the last push was detected
const pushCooldown = 1500; // Minimum time between push detections (ms)
let isPushActive = false; // Flag to indicate if push/pull is currently being detected

// Camera selection variables
let availableCameras = [];
let selectedCameraId = null;

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.5,
});

// Function to enumerate available cameras
async function getAvailableCameras() {
  try {
    // First, request permission to access cameras to get proper labels
    await navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
      stream.getTracks().forEach(track => track.stop()); // Stop the stream immediately
    });
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    availableCameras = devices.filter(device => device.kind === 'videoinput');
    
    console.log('Available cameras:', availableCameras.map(cam => ({
      label: cam.label,
      deviceId: cam.deviceId.substring(0, 10) + '...'
    })));
    
    return availableCameras;
  } catch (error) {
    console.error('Error enumerating cameras:', error);
    return [];
  }
}

// Function to create camera selection UI
function createCameraSelector() {
  // Always show the selector for debugging, even with one camera
  
  const selector = document.createElement('select');
  selector.id = 'camera-selector';
  selector.style.cssText = `
    position: absolute;
    top: 200px;
    right: 10px;
    z-index: 20;
    padding: 8px;
    border-radius: 4px;
    background: rgba(0,0,0,0.8);
    color: white;
    border: 1px solid #ccc;
    min-width: 200px;
  `;
  
  // Add default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Default Camera';
  selector.appendChild(defaultOption);
  
  // Add camera options with better labeling
  availableCameras.forEach((camera, index) => {
    const option = document.createElement('option');
    option.value = camera.deviceId;
    
    // Create more descriptive labels
    let label = camera.label || `Camera ${index + 1}`;
    
    // If label is generic, try to make it more descriptive
    if (label.includes('camera2 0, facing back')) {
      label = `Back Camera ${index + 1}`;
    } else if (label.includes('camera2 0, facing front')) {
      label = `Front Camera ${index + 1}`;
    } else if (label.includes('Integrated')) {
      label = `Integrated Camera ${index + 1}`;
    } else if (!camera.label) {
      label = `Camera ${index + 1} (ID: ${camera.deviceId.substring(0, 8)}...)`;
    }
    
    option.textContent = label;
    selector.appendChild(option);
  });
  
  // Add info text
  const infoDiv = document.createElement('div');
  infoDiv.style.cssText = `
    position: absolute;
    top: 200px;
    right: 10px;
    z-index: 19;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(0,0,0,0.6);
    color: white;
    font-size: 12px;
    max-width: 200px;
  `;
  infoDiv.textContent = `Found ${availableCameras.length} camera(s). Some may be the same physical device.`;
  
  // Add event listener for camera selection
  selector.addEventListener('change', async (event) => {
    const selectedDeviceId = event.target.value;
    selectedCameraId = selectedDeviceId || null;
    console.log('Selected camera:', selectedDeviceId || 'default');
    await restartCameraWithSelection();
  });
  
  // Add to video container
  const videoContainer = document.querySelector('.videoCentered');
  if (videoContainer) {
    videoContainer.appendChild(selector);
    videoContainer.appendChild(infoDiv);
  }
}

window.onload = async function () {
  // set initial highlighted button 
  // button positions: 
  // 1             2
  // 3             4
  // 5             6
  highlightedButton = document.getElementById('1');
  if (!highlightedButton) {
    // Fallback to find any button if button '1' doesn't exist
    const buttons = document.getElementsByTagName('button');
    if (buttons.length > 0) {
      highlightedButton = buttons[0];
    }
  }

  if (highlightedButton && highlightedButton.id) {
    highlightedButton.classList.add('highlighted-btn' + highlightedButton.id);
  }
  numButtons = document.getElementsByTagName('button').length;
  
  // Initialize camera system
  await initializeCamera();
}

hands.onResults((results) => {
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
  canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];

    drawConnectors(canvasCtx, landmarks, Hands.HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
    drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1 });

    let sumX = 0, sumY = 0, sumZ = 0;
    for (const point of landmarks) {
      sumX += point.x;
      sumY += point.y;
      sumZ += point.z; // Add Z coordinate for depth
    }
    const avgX = sumX / landmarks.length;
    const avgY = sumY / landmarks.length;
    const avgZ = sumZ / landmarks.length; // Calculate average depth
    const centerX = avgX * canvasElement.width;
    const centerY = avgY * canvasElement.height;

    canvasCtx.beginPath();
    canvasCtx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
    canvasCtx.fillStyle = 'red';
    canvasCtx.fill();

    const handCenterElement = document.getElementById('hand-center');
    if (handCenterElement) {
      handCenterElement.textContent = `Hand center: (${centerX.toFixed(1)}, ${centerY.toFixed(1)}, ${avgZ.toFixed(3)})`;
    }

    // Display hand depth
    const handDepthElement = document.getElementById('hand-depth');
    if (handDepthElement) {
      handDepthElement.textContent = `Hand depth: ${avgZ.toFixed(3)}`;
    }

    // Calculate and display hand speed
    const currentTime = Date.now();
    const handSpeedElement = document.getElementById('hand-speed');

    if (previousCenter && previousTime && handSpeedElement) {
      const deltaTime = (currentTime - previousTime) / 1000; // Convert to seconds
      const deltaX = centerX - previousCenter.x;
      const deltaY = centerY - previousCenter.y;

      const speedX = deltaX / deltaTime; // pixels per second
      const speedY = deltaY / deltaTime; // pixels per second

      handSpeedElement.textContent = `Hand speed: (${speedX.toFixed(1)}, ${speedY.toFixed(1)}) px/s`;
    } else if (handSpeedElement) {
      handSpeedElement.textContent = 'Hand speed: (0.0, 0.0) px/s';
    }

    // Update previous values for next frame
    previousCenter = { x: centerX, y: centerY, z: avgZ };
    previousTime = currentTime;

    // Detect movement direction
    detectMovement();

    // PRIORITY 1: Detect push/pull gestures first (they take priority)
    const pushDetected = detectPushGesture();

    // PRIORITY 2: Only detect swipe gestures if no push/pull is active
    if (!isPushActive && !pushDetected) {
      detectSwipeGesture();
    }
  }

  canvasCtx.restore();
});

let camera; // Declare camera variable

// Function to start camera with optional device selection
async function startCamera(deviceId = null) {
  try {
    // Stop existing camera if running
    if (camera) {
      camera.stop();
    }
    
    // Create camera constraints
    const cameraConfig = {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480,
    };
    
    // If a specific device is requested, add facingMode and deviceId constraints
    if (deviceId) {
      cameraConfig.deviceId = { exact: deviceId };
      console.log('Starting camera with specific device ID:', deviceId.substring(0, 10) + '...');
    } else {
      // For default camera, prefer back camera if available
      cameraConfig.facingMode = 'environment'; // 'user' for front, 'environment' for back
      console.log('Starting default camera (preferring back camera)');
    }
    
    camera = new Camera(videoElement, cameraConfig);
    await camera.start();
    console.log('Camera started successfully');
    
    // Update UI to show which camera is active
    updateCameraStatus(deviceId);
    
  } catch (error) {
    console.error('Error starting camera:', error);
    
    // If specific device fails, try with different facing mode
    if (deviceId) {
      console.log('Specific camera failed, trying with user-facing...');
      try {
        const fallbackConfig = {
          onFrame: async () => {
            await hands.send({ image: videoElement });
          },
          width: 640,
          height: 480,
          facingMode: 'user' // Try front camera
        };
        camera = new Camera(videoElement, fallbackConfig);
        await camera.start();
        console.log('Fallback camera started');
      } catch (fallbackError) {
        console.error('Fallback camera also failed:', fallbackError);
        // Final fallback - no constraints
        await startCamera();
      }
    }
  }
}

// Function to update camera status display
function updateCameraStatus(deviceId) {
  const infoDiv = document.querySelector('.videoCentered div[style*="font-size: 12px"]');
  if (infoDiv) {
    const activeCamera = deviceId ? 
      availableCameras.find(cam => cam.deviceId === deviceId) : 
      { label: 'Default Camera' };
    
    infoDiv.textContent = `Active: ${activeCamera?.label || 'Unknown Camera'} | Found ${availableCameras.length} total`;
  }
}

// Function to restart camera with new selection
async function restartCameraWithSelection() {
  console.log('Switching to camera:', selectedCameraId);
  await startCamera(selectedCameraId);
}

// Initialize camera and UI on page load
async function initializeCamera() {
  await getAvailableCameras();
  createCameraSelector();
  await startCamera();
}

// Helper function to show selection feedback on button
const showSelectionFeedback = (button) => {
  if (!button) return;
  
  // Add selection effect class instead of inline styles
  button.classList.add('button-selected');
  
  // Remove the selection class after the animation completes
  setTimeout(() => {
    button.classList.remove('button-selected');
  }, 800); // Match the animation duration
}

// Helper functions for dynamic highlighting
const addHighlight = (button) => {
  if (button && button.id) {
    button.classList.add('highlighted-btn' + button.id);
  }
}

inactivityTimer = setTimeout(() => {
  if (highlightedButton && numButtons == 1) {
    removeHighlight(highlightedButton);
  }
}, 2000);

const removeHighlight = (button) => {
  if (button && button.id) {
    button.classList.remove('highlighted-btn' + button.id);
  }
}

const setHighlightedButton = (newButton) => {
  if (highlightedButton) {
    removeHighlight(highlightedButton);
  }
  highlightedButton = newButton;
  if (highlightedButton) {
    addHighlight(highlightedButton);
  }
}

// detect movement from maintained speed either left or right
const detectMovement = () => {
  const handSpeedElement = document.getElementById('hand-speed');
  if (handSpeedElement) {
    clearTimeout(inactivityTimer);
    if (!highlightedButton || numButtons == 1) {
      highlightedButton = document.getElementById('1');
      if (highlightedButton) {
        highlightedButton.classList.add('highlighted-btn' + highlightedButton.id);
      }
    }

    inactivityTimer = setTimeout(() => {
      if (numButtons == 1) {
        if (highlightedButton) {
          highlightedButton.classList.remove('highlighted-button');
        }
      }
    }, 2000);

    const speedText = handSpeedElement.textContent;
    const speedMatch = speedText.match(/Hand speed: \(([^,]+), ([^)]+)\) px\/s/);
    if (speedMatch) {
      const speedX = parseFloat(speedMatch[1]);
      const tolerance = 30; // Define a tolerance for movement detection
      if (speedX > tolerance) {
        console.log('Hand moving right');
      } else if (speedX < -tolerance) {
        console.log('Hand moving left');
      } else {
        console.log('Hand stationary');
      }
    }
  }
}

// Enhanced swipe gesture detection (horizontal and vertical)
const detectSwipeGesture = () => {
  if (!previousCenter) return;

  const currentTime = Date.now();

  // Check if we're still in cooldown period from last swipe
  if (currentTime - lastSwipeTime < swipeCooldown) {
    return; // Skip detection during cooldown
  }

  // Add current position to history
  swipeHistory.push({
    x: previousCenter.x,
    y: previousCenter.y,
    time: currentTime
  });

  // Keep only recent history
  if (swipeHistory.length > swipeHistoryLength) {
    swipeHistory.shift();
  }

  // Remove old entries outside time window
  swipeHistory = swipeHistory.filter(entry =>
    currentTime - entry.time <= swipeTimeWindow
  );

  if (swipeHistory.length < 3) return;

  // Calculate total displacement and check for consistent direction
  const startPoint = swipeHistory[0];
  const endPoint = swipeHistory[swipeHistory.length - 1];
  const totalDisplacementX = endPoint.x - startPoint.x;
  const totalDisplacementY = endPoint.y - startPoint.y; // Keep sign for up/down detection
  const totalTime = endPoint.time - startPoint.time;

  // Check for horizontal swipes
  if (Math.abs(totalDisplacementX) > swipeThreshold &&
    Math.abs(totalDisplacementY) < Math.abs(totalDisplacementX) * 0.7 && // More horizontal than vertical
    totalTime > 0) {

    const averageSpeed = Math.abs(totalDisplacementX) / (totalTime / 1000);

    if (averageSpeed > swipeSpeedThreshold) {
      // Check for consistent horizontal direction
      let consistentDirection = true;
      let previousDirection = null;

      for (let i = 1; i < swipeHistory.length; i++) {
        const deltaX = swipeHistory[i].x - swipeHistory[i - 1].x;
        if (Math.abs(deltaX) > 3) {
          const currentDirection = deltaX > 0 ? 'right' : 'left';
          if (previousDirection && previousDirection !== currentDirection) {
            consistentDirection = false;
            break;
          }
          previousDirection = currentDirection;
        }
      }

      if (consistentDirection && previousDirection) {
        lastSwipeTime = currentTime;

        if (totalDisplacementX > 0) {
          console.log('🔥 LEFT SWIPE DETECTED! 🔥');
          onSwipeLeft();
        } else {
          console.log('🔥 RIGHT SWIPE DETECTED! 🔥');
          onSwipeRight();
        }

        swipeHistory = [];
        return; // Exit after horizontal swipe detection
      }
    }
  }

  // Check for vertical swipes
  if (Math.abs(totalDisplacementY) > swipeThreshold &&
    Math.abs(totalDisplacementX) < Math.abs(totalDisplacementY) * 0.7 && // More vertical than horizontal
    totalTime > 0) {

    const averageSpeed = Math.abs(totalDisplacementY) / (totalTime / 1000);

    if (averageSpeed > swipeSpeedThreshold) {
      // Check for consistent vertical direction
      let consistentDirection = true;
      let previousDirection = null;

      for (let i = 1; i < swipeHistory.length; i++) {
        const deltaY = swipeHistory[i].y - swipeHistory[i - 1].y;
        if (Math.abs(deltaY) > 3) {
          const currentDirection = deltaY > 0 ? 'down' : 'up';
          if (previousDirection && previousDirection !== currentDirection) {
            consistentDirection = false;
            break;
          }
          previousDirection = currentDirection;
        }
      }

      if (consistentDirection && previousDirection) {
        lastSwipeTime = currentTime;

        if (totalDisplacementY > 0) {
          console.log('🔥 DOWN SWIPE DETECTED! 🔥');
          onSwipeDown();
        } else {
          console.log('🔥 UP SWIPE DETECTED! 🔥');
          onSwipeUp();
        }

        swipeHistory = [];
      }
    }
  }
}

// Enhanced push/pull gesture detection (depth-based)
const detectPushGesture = () => {
  if (!previousCenter || !previousCenter.z) return false;

  const currentTime = Date.now();

  // Check if we're still in cooldown period from last push
  if (currentTime - lastPushTime < pushCooldown) {
    isPushActive = false;
    return false; // Skip detection during cooldown
  }

  // Add current depth to history
  depthHistory.push({
    z: previousCenter.z,
    time: currentTime
  });

  // Keep only recent history
  if (depthHistory.length > depthHistoryLength) {
    depthHistory.shift();
  }

  // Remove old entries outside time window
  depthHistory = depthHistory.filter(entry =>
    currentTime - entry.time <= pushTimeWindow
  );

  if (depthHistory.length < 5) {
    isPushActive = false;
    return false;
  }

  // Calculate recent depth movement to detect if push is in progress
  const recentFrames = depthHistory.slice(-5); // Look at last 5 frames
  let recentDepthChange = 0;
  for (let i = 1; i < recentFrames.length; i++) {
    recentDepthChange += Math.abs(recentFrames[i].z - recentFrames[i - 1].z);
  }

  // Set isPushActive if there's significant recent depth movement
  isPushActive = recentDepthChange > 0.01; // Lower threshold for detecting push motion

  // Calculate total depth displacement for final gesture detection
  const startPoint = depthHistory[0];
  const endPoint = depthHistory[depthHistory.length - 1];
  const totalDisplacementZ = endPoint.z - startPoint.z;
  const totalTime = endPoint.time - startPoint.time;

  // Check if depth change meets thresholds for complete gesture
  if (Math.abs(totalDisplacementZ) > pushThreshold && totalTime > 0) {
    const averageSpeed = Math.abs(totalDisplacementZ) / (totalTime / 1000);

    if (averageSpeed > pushSpeedThreshold) {
      // Check for consistent depth direction
      let consistentDirection = true;
      let previousDirection = null;

      for (let i = 1; i < depthHistory.length; i++) {
        const deltaZ = depthHistory[i].z - depthHistory[i - 1].z;
        if (Math.abs(deltaZ) > 0.005) { // Small threshold for depth changes
          const currentDirection = deltaZ > 0 ? 'away' : 'toward';
          if (previousDirection && previousDirection !== currentDirection) {
            consistentDirection = false;
            break;
          }
          previousDirection = currentDirection;
        }
      }

      if (consistentDirection && previousDirection) {
        lastPushTime = currentTime;
        isPushActive = false; // Reset after detection

        if (totalDisplacementZ < 0) { // Negative Z means closer to camera
          console.log('🔥 PUSH GESTURE DETECTED! 🔥');
          onPushGesture();
        } else { // Positive Z means farther from camera
          console.log('🔥 PULL GESTURE DETECTED! 🔥');
          onPullGesture();
        }

        depthHistory = [];
        return true; // Gesture was detected
      }
    }
  }

  return isPushActive; // Return whether push motion is in progress
}


// Callback functions for swipe actions
const onSwipeLeft = () => {
  console.log('Action: Swiped Left!');
  updateSwipeStatus('← LEFT SWIPE', '#FF6B6B');

  if (highlightedButton && highlightedButton.id &&
    parseInt(highlightedButton.id) - 1 >= 1 &&
    (parseInt(highlightedButton.id) - 1) % 2 === 1) {
    const newButton = document.getElementById((parseInt(highlightedButton.id) - 1).toString());
    setHighlightedButton(newButton);
  }
}


const onSwipeRight = () => {
  console.log('Action: Swiped Right!');
  updateSwipeStatus('RIGHT SWIPE →', '#4ECDC4');

  if (highlightedButton && highlightedButton.id &&
    parseInt(highlightedButton.id) + 1 <= numButtons &&
    (parseInt(highlightedButton.id) + 1) % 2 === 0) {
    const newButton = document.getElementById((parseInt(highlightedButton.id) + 1).toString());
    setHighlightedButton(newButton);
  }
}

const onSwipeUp = () => {
  console.log('Action: Swiped Up!');
  updateSwipeStatus('↑ UP SWIPE', '#45B7D1');
  if (highlightedButton && highlightedButton.id &&
    parseInt(highlightedButton.id) - 2 >= 1) {
    const newButton = document.getElementById((parseInt(highlightedButton.id) - 2).toString());
    setHighlightedButton(newButton);
  }
}

const onSwipeDown = () => {
  console.log('Action: Swiped Down!');
  updateSwipeStatus('↓ DOWN SWIPE', '#96CEB4');
  if (highlightedButton && highlightedButton.id &&
    parseInt(highlightedButton.id) + 2 <= numButtons) {
    const newButton = document.getElementById((parseInt(highlightedButton.id) + 2).toString());
    setHighlightedButton(newButton);
  }
}

const onPushGesture = () => {
  console.log('Action: Push Toward Screen!');
  updateSwipeStatus('👊 PUSH GESTURE', '#FF8C42');

  if (highlightedButton) {
    // Add visual feedback effect
    showSelectionFeedback(highlightedButton);
    
    // Add delay before clicking the button
    setTimeout(() => {
      highlightedButton.click();
      console.log(`Button ${highlightedButton.id} clicked!`);
    }, 800); // 800ms delay for user feedback
  }
}

const onPullGesture = () => {
  console.log('Action: Pull Away From Screen!');
  updateSwipeStatus('👋 PULL GESTURE', '#6C5CE7');
  // Add your pull functionality here
  // Example: zoom out, deselect, go back, etc.
}

// Helper function to update swipe status display
const updateSwipeStatus = (message, color) => {
  const swipeStatusElement = document.getElementById('swipe-status');
  if (swipeStatusElement) {
    swipeStatusElement.textContent = message;
    swipeStatusElement.style.backgroundColor = color;
    swipeStatusElement.style.color = 'white';

    // Reset after 2 seconds
    setTimeout(() => {
      swipeStatusElement.textContent = 'Swipe: None';
      swipeStatusElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
    }, 2000);
  }
}

// Simple navigation functions for public folder structure
window.startATM = function () {
  window.location.href = "/txMenu/txMenu.html";
}

window.exitATM = function () {
  window.location.href = "/";
}

window.depositCash = function () {
  window.location.href = "/cashDeposit/cashDeposit.html";
}

window.withdrawal = function () {
  window.location.href = "/withdrawal/withdrawal.html";
}

window.balance = function () {
  window.location.href = "/balance/balance.html";
}

window.done = function () {
  window.location.href = "/done/done.html";
}

window.withdrawSuccess = function () {
  console.log("Withdrawal successful, redirecting to success page.");
  window.location.href = "/withdrawSuccess/withdrawSuccess.html";
}