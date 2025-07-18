// Simplified main.js for public folder pages - no ES6 modules
// This version loads MediaPipe from CDN directly

let hands, camera;
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
const swipeHistoryLength = 10;
const swipeThreshold = 50;
const swipeSpeedThreshold = 30;
const swipeTimeWindow = 800;
let lastSwipeTime = 0;
const swipeCooldown = 1000;
var highlightedButton = null;
var numButtons = 0;
let inactivityTimer = null;

// Variables for depth/push gesture detection
let depthHistory = [];
const depthHistoryLength = 15;
const pushThreshold = 0.02;
const pushSpeedThreshold = 0.05;
const pushTimeWindow = 1000;
let lastPushTime = 0;
const pushCooldown = 1500;
let isPushActive = false;

// Camera selection variables
let availableCameras = [];
let selectedCameraId = null;

// Initialize MediaPipe Hands when the page loads
window.addEventListener('load', async function() {
  // Wait for MediaPipe to load from CDN
  if (typeof Hands === 'undefined') {
    console.error('MediaPipe Hands not loaded. Make sure to include the CDN scripts.');
    return;
  }

  hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.5,
  });

  hands.onResults(onResults);

  // Set initial highlighted button
  highlightedButton = document.getElementById('1');
  if (!highlightedButton) {
    const buttons = document.getElementsByTagName('button');
    if (buttons.length > 0) {
      highlightedButton = buttons[0];
    }
  }

  if (highlightedButton && highlightedButton.id) {
    highlightedButton.classList.add('highlighted-btn' + highlightedButton.id);
  }
  numButtons = document.getElementsByTagName('button').length;

  // Initialize camera
  await initializeCamera();
});

function onResults(results) {
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
      sumZ += point.z;
    }
    const avgX = sumX / landmarks.length;
    const avgY = sumY / landmarks.length;
    const avgZ = sumZ / landmarks.length;
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

    const handDepthElement = document.getElementById('hand-depth');
    if (handDepthElement) {
      handDepthElement.textContent = `Hand depth: ${avgZ.toFixed(3)}`;
    }

    const currentTime = Date.now();
    const handSpeedElement = document.getElementById('hand-speed');

    if (previousCenter && previousTime && handSpeedElement) {
      const deltaTime = (currentTime - previousTime) / 1000;
      const deltaX = centerX - previousCenter.x;
      const deltaY = centerY - previousCenter.y;
      const speedX = deltaX / deltaTime;
      const speedY = deltaY / deltaTime;
      handSpeedElement.textContent = `Hand speed: (${speedX.toFixed(1)}, ${speedY.toFixed(1)}) px/s`;
    } else if (handSpeedElement) {
      handSpeedElement.textContent = 'Hand speed: (0.0, 0.0) px/s';
    }

    previousCenter = { x: centerX, y: centerY, z: avgZ };
    previousTime = currentTime;

    detectMovement();
    const pushDetected = detectPushGesture();
    if (!isPushActive && !pushDetected) {
      detectSwipeGesture();
    }
  }

  canvasCtx.restore();
}

async function initializeCamera() {
  try {
    await getAvailableCameras();
    createCameraSelector();
    await startCamera();
  } catch (error) {
    console.error('Error initializing camera:', error);
  }
}

async function getAvailableCameras() {
  try {
    await navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
      stream.getTracks().forEach(track => track.stop());
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

function createCameraSelector() {
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
  
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'Default Camera';
  selector.appendChild(defaultOption);
  
  availableCameras.forEach((camera, index) => {
    const option = document.createElement('option');
    option.value = camera.deviceId;
    let label = camera.label || `Camera ${index + 1}`;
    option.textContent = label;
    selector.appendChild(option);
  });
  
  selector.addEventListener('change', async (event) => {
    const selectedDeviceId = event.target.value;
    selectedCameraId = selectedDeviceId || null;
    console.log('Selected camera:', selectedDeviceId || 'default');
    await startCamera(selectedCameraId);
  });
  
  const videoContainer = document.querySelector('.videoCentered');
  if (videoContainer) {
    videoContainer.appendChild(selector);
  }
}

async function startCamera(deviceId = null) {
  try {
    if (camera) {
      camera.stop();
    }
    
    const cameraConfig = {
      onFrame: async () => {
        await hands.send({ image: videoElement });
      },
      width: 640,
      height: 480,
    };
    
    if (deviceId) {
      cameraConfig.deviceId = { exact: deviceId };
    } else {
      cameraConfig.facingMode = 'environment';
    }
    
    camera = new Camera(videoElement, cameraConfig);
    await camera.start();
    console.log('Camera started successfully');
  } catch (error) {
    console.error('Error starting camera:', error);
  }
}

// Navigation functions
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

// Gesture detection functions (simplified versions)
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
  }
}

const detectSwipeGesture = () => {
  if (!previousCenter) return;

  const currentTime = Date.now();
  if (currentTime - lastSwipeTime < swipeCooldown) {
    return;
  }

  swipeHistory.push({
    x: previousCenter.x,
    y: previousCenter.y,
    time: currentTime
  });

  if (swipeHistory.length > swipeHistoryLength) {
    swipeHistory.shift();
  }

  swipeHistory = swipeHistory.filter(entry =>
    currentTime - entry.time <= swipeTimeWindow
  );

  if (swipeHistory.length < 3) return;

  const startPoint = swipeHistory[0];
  const endPoint = swipeHistory[swipeHistory.length - 1];
  const totalDisplacementX = endPoint.x - startPoint.x;
  const totalDisplacementY = endPoint.y - startPoint.y;
  const totalTime = endPoint.time - startPoint.time;

  // Horizontal swipes
  if (Math.abs(totalDisplacementX) > swipeThreshold &&
      Math.abs(totalDisplacementY) < Math.abs(totalDisplacementX) * 0.7 &&
      totalTime > 0) {
    
    const averageSpeed = Math.abs(totalDisplacementX) / (totalTime / 1000);
    
    if (averageSpeed > swipeSpeedThreshold) {
      lastSwipeTime = currentTime;
      
      if (totalDisplacementX > 0) {
        console.log('🔥 LEFT SWIPE DETECTED! 🔥');
        onSwipeLeft();
      } else {
        console.log('🔥 RIGHT SWIPE DETECTED! 🔥');
        onSwipeRight();
      }
      
      swipeHistory = [];
      return;
    }
  }

  // Vertical swipes
  if (Math.abs(totalDisplacementY) > swipeThreshold &&
      Math.abs(totalDisplacementX) < Math.abs(totalDisplacementY) * 0.7 &&
      totalTime > 0) {
    
    const averageSpeed = Math.abs(totalDisplacementY) / (totalTime / 1000);
    
    if (averageSpeed > swipeSpeedThreshold) {
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

const detectPushGesture = () => {
  if (!previousCenter || !previousCenter.z) return false;
  
  const currentTime = Date.now();
  if (currentTime - lastPushTime < pushCooldown) {
    isPushActive = false;
    return false;
  }

  depthHistory.push({
    z: previousCenter.z,
    time: currentTime
  });

  if (depthHistory.length > depthHistoryLength) {
    depthHistory.shift();
  }

  depthHistory = depthHistory.filter(entry =>
    currentTime - entry.time <= pushTimeWindow
  );

  if (depthHistory.length < 5) {
    isPushActive = false;
    return false;
  }

  const startPoint = depthHistory[0];
  const endPoint = depthHistory[depthHistory.length - 1];
  const totalDisplacementZ = endPoint.z - startPoint.z;
  const totalTime = endPoint.time - startPoint.time;

  if (Math.abs(totalDisplacementZ) > pushThreshold && totalTime > 0) {
    const averageSpeed = Math.abs(totalDisplacementZ) / (totalTime / 1000);

    if (averageSpeed > pushSpeedThreshold) {
      lastPushTime = currentTime;
      isPushActive = false;

      if (totalDisplacementZ < 0) {
        console.log('🔥 PUSH GESTURE DETECTED! 🔥');
        onPushGesture();
      } else {
        console.log('🔥 PULL GESTURE DETECTED! 🔥');
        onPullGesture();
      }

      depthHistory = [];
      return true;
    }
  }

  return isPushActive;
}

// Swipe action functions
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
    showSelectionFeedback(highlightedButton);
    
    setTimeout(() => {
      highlightedButton.click();
      console.log(`Button ${highlightedButton.id} clicked!`);
    }, 800);
  }
}

const onPullGesture = () => {
  console.log('Action: Pull Away From Screen!');
  updateSwipeStatus('👋 PULL GESTURE', '#6C5CE7');
}

// Helper functions
const showSelectionFeedback = (button) => {
  if (!button) return;
  button.classList.add('button-selected');
  setTimeout(() => {
    button.classList.remove('button-selected');
  }, 800);
}

const addHighlight = (button) => {
  if (button && button.id) {
    button.classList.add('highlighted-btn' + button.id);
  }
}

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

const updateSwipeStatus = (message, color) => {
  const swipeStatusElement = document.getElementById('swipe-status');
  if (swipeStatusElement) {
    swipeStatusElement.textContent = message;
    swipeStatusElement.style.backgroundColor = color;
    swipeStatusElement.style.color = 'white';

    setTimeout(() => {
      swipeStatusElement.textContent = 'Swipe: None';
      swipeStatusElement.style.backgroundColor = 'rgba(0,0,0,0.7)';
    }, 2000);
  }
}
