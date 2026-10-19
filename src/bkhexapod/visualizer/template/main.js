// Canvas & Container references
const topCanvas = document.getElementById('robotCanvas');
const topCtx = topCanvas.getContext('2d');
const sideCanvas = document.getElementById('sideCanvas');
const sideCtx = sideCanvas.getContext('2d');
const frontCanvas = document.getElementById('frontCanvas');
const frontCtx = frontCanvas.getContext('2d');
const threeContainer = document.getElementById('threejs-container');

const statusElement = document.getElementById('status');
const statusDot = document.getElementById('status-dot');

// View switching elements
const btnView3D = document.getElementById('btn-view-3d');
const btnViewMulti = document.getElementById('btn-view-multi');
const btnViewTop = document.getElementById('btn-view-top');
const btnViewSide = document.getElementById('btn-view-side');
const btnViewFront = document.getElementById('btn-view-front');

const card3D = document.getElementById('card-3d');
const cardTop = document.getElementById('card-top');
const cardSide = document.getElementById('card-side');
const cardFront = document.getElementById('card-front');
const btnResetCam = document.getElementById('btn-reset-cam');

// Control elements - Locomotion & Gait
const btnTogglePause = document.getElementById('btn-toggle-pause');
const btnPauseIcon = document.getElementById('btn-pause-icon');
const btnPauseText = document.getElementById('btn-pause-text');

const gaitSelector = document.getElementById('gait-selector');
const gaitButtons = gaitSelector ? gaitSelector.querySelectorAll('.btn-group-btn') : [];

// D-Pad buttons
const dpadFwd = document.getElementById('dpad-fwd');
const dpadBack = document.getElementById('dpad-back');
const dpadLeft = document.getElementById('dpad-left');
const dpadRight = document.getElementById('dpad-right');
const dpadFL = document.getElementById('dpad-fl');
const dpadFR = document.getElementById('dpad-fr');
const dpadRotL = document.getElementById('dpad-rot-l');
const dpadRotR = document.getElementById('dpad-rot-r');
const dpadStop = document.getElementById('dpad-stop');
const allDpadButtons = [dpadFwd, dpadBack, dpadLeft, dpadRight, dpadFL, dpadFR, dpadRotL, dpadRotR, dpadStop];

// Gait parameters sliders
const sliderSpeed = document.getElementById('slider-speed');
const valSpeed = document.getElementById('val-speed');
const sliderStepHeight = document.getElementById('slider-step-height');
const valStepHeight = document.getElementById('val-step-height');
const sliderStepLength = document.getElementById('slider-step-length');
const valStepLength = document.getElementById('val-step-length');

// Body attitude sliders
const sliderHeight = document.getElementById('slider-height');
const valHeight = document.getElementById('val-height');
const sliderRoll = document.getElementById('slider-roll');
const valRoll = document.getElementById('val-roll');
const sliderPitch = document.getElementById('slider-pitch');
const valPitch = document.getElementById('val-pitch');
const btnResetPose = document.getElementById('btn-reset-pose');

// Dynamic WebSocket connection (connects to Raspberry Pi IP or localhost automatically)
const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsHost = window.location.hostname || 'localhost';
const ws = new WebSocket(`${wsProtocol}//${wsHost}:8765`);

let robotLayout = {};
let jointAngles = {};
let isPaused = false;
let currentViewMode = '3d'; // '3d', 'multi', 'top', 'side', 'front'
let currentGait = 'tripod';
let currentWalkX = 0.0;
let currentWalkY = 1.0;
let currentTurnZ = 0.0;

// --- THREE.JS 3D SCENE SETUP ---
let scene, camera, renderer, controls;
let robot3DMeshes = { body: null, legs: {} };
let cylinderGeometry, sphereGeometry;
let coxaMat, femurMat, tibiaMat, jointMat, footMat, chassisMat, eyeMat;

function initThreeJS() {
    if (typeof THREE === 'undefined') {
        console.warn("Three.js not loaded.");
        return;
    }

    const width = threeContainer.clientWidth || 820;
    const height = threeContainer.clientHeight || 520;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a24);

    camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
    camera.position.set(240, 180, 280);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    threeContainer.appendChild(renderer.domElement);

    if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.target.set(0, -20, 0);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 + 0.15; // don't go too far below ground
        controls.minDistance = 80;
        controls.maxDistance = 1200;
    }

    // Grid at ground level (Z = -80 in BKHexapod coords -> Y = -80 in Three.js coords)
    const grid = new THREE.GridHelper(700, 35, 0x4e4e62, 0x2a2a38);
    grid.position.y = -80;
    scene.add(grid);

    // Coordinate Axes Guide (subtle RGB lines at world origin)
    const axes = new THREE.AxesHelper(40);
    axes.position.y = -79;
    scene.add(axes);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(250, 450, 200);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x3498db, 0.4);
    rimLight.position.set(-200, 100, -200);
    scene.add(rimLight);

    // Geometries & Materials
    cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 16);
    cylinderGeometry.translate(0, 0.5, 0); // origin at base of cylinder

    sphereGeometry = new THREE.SphereGeometry(1, 16, 16);

    chassisMat = new THREE.MeshStandardMaterial({ color: 0x343444, roughness: 0.5, metalness: 0.3 });
    eyeMat = new THREE.MeshStandardMaterial({ color: 0x3498db, emissive: 0x1b4f72, roughness: 0.3 });
    jointMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.4, metalness: 0.6 });
    coxaMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.4, metalness: 0.2 });
    femurMat = new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.4, metalness: 0.2 });
    tibiaMat = new THREE.MeshStandardMaterial({ color: 0x8e44ad, roughness: 0.4, metalness: 0.2 });
    footMat = new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.3, metalness: 0.3 });

    animateThreeJS();
}

function animateThreeJS() {
    requestAnimationFrame(animateThreeJS);
    if (controls) controls.update();
    if (renderer && scene && camera) {
        renderer.render(scene, camera);
    }
}

function buildThreeJSRobot(layout) {
    if (!scene || !layout.body || !layout.legs) return;

    // Remove existing meshes if any
    if (robot3DMeshes.body) scene.remove(robot3DMeshes.body);
    for (const legName in robot3DMeshes.legs) {
        const m = robot3DMeshes.legs[legName];
        scene.remove(m.s0); scene.remove(m.s1); scene.remove(m.s2); scene.remove(m.s3);
        scene.remove(m.coxa); scene.remove(m.femur); scene.remove(m.tibia);
    }
    robot3DMeshes.legs = {};

    // 1. Build Extruded Hexagon Chassis Body
    const shape = new THREE.Shape();
    const verts = layout.body.vertices;
    if (verts && verts.length >= 6) {
        shape.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
            shape.lineTo(verts[i].x, verts[i].y);
        }
        shape.closePath();

        const extrudeSettings = { depth: 16, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 2, bevelThickness: 2 };
        const bodyGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        // Center vertically around Z=0 and rotate so shape XY lies on Three.js XZ plane
        bodyGeo.center();
        bodyGeo.rotateX(Math.PI / 2);

        const bodyMesh = new THREE.Mesh(bodyGeo, chassisMat);
        bodyMesh.position.set(0, 0, 0);

        // Direction headlights / indicator eyes (pointing front: -Z in Three.js)
        const eyeGeo = new THREE.SphereGeometry(3.5, 12, 12);
        const eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
        eyeLeft.position.set(-18, 4, -45);
        bodyMesh.add(eyeLeft);

        const eyeRight = new THREE.Mesh(eyeGeo, eyeMat);
        eyeRight.position.set(18, 4, -45);
        bodyMesh.add(eyeRight);

        scene.add(bodyMesh);
        robot3DMeshes.body = bodyMesh;
    }

    // 2. Build 3D Leg Meshes (Spheres and Cylinders)
    const createSphere = (mat, radius) => {
        const m = new THREE.Mesh(sphereGeometry, mat);
        m.scale.set(radius, radius, radius);
        scene.add(m);
        return m;
    };

    const createCylinder = (mat, radius) => {
        const m = new THREE.Mesh(cylinderGeometry, mat);
        m.scale.set(radius, 1, radius);
        scene.add(m);
        return m;
    };

    for (const legName in layout.legs) {
        robot3DMeshes.legs[legName] = {
            s0: createSphere(jointMat, 4.5),
            coxa: createCylinder(coxaMat, 3.8),
            s1: createSphere(jointMat, 4.0),
            femur: createCylinder(femurMat, 3.4),
            s2: createSphere(jointMat, 4.2),
            tibia: createCylinder(tibiaMat, 2.8),
            s3: createSphere(footMat, 4.5)
        };
    }
}

function update3DLegs(legs3D) {
    if (!scene) return;

    const toVec3 = (p) => new THREE.Vector3(p.x, p.z, p.y); // (X, Z, Y) -> (threeX, threeY, threeZ)

    const updateCylinder = (mesh, vA, vB, radius) => {
        const dir = new THREE.Vector3().subVectors(vB, vA);
        const len = dir.length();
        if (len < 0.001) return;

        mesh.position.copy(vA);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        mesh.scale.set(radius, len, radius);
    };

    for (const legName in legs3D) {
        const m = robot3DMeshes.legs[legName];
        if (!m) continue;

        const pts = legs3D[legName];
        const v0 = toVec3(pts.p0);
        const v1 = toVec3(pts.p1);
        const v2 = toVec3(pts.p2);
        const v3 = toVec3(pts.p3);

        m.s0.position.copy(v0);
        updateCylinder(m.coxa, v0, v1, 3.8);

        m.s1.position.copy(v1);
        updateCylinder(m.femur, v1, v2, 3.4);

        m.s2.position.copy(v2);
        updateCylinder(m.tibia, v2, v3, 2.8);

        m.s3.position.copy(v3);
    }
}

// Reset camera view button
if (btnResetCam) {
    btnResetCam.addEventListener('click', () => {
        if (camera && controls) {
            camera.position.set(240, 180, 280);
            controls.target.set(0, -20, 0);
            controls.update();
        }
    });
}

// --- WEBSOCKET CLIENT ---
function sendCommand(cmd) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: "command",
            ...cmd
        }));
    }
}

// View mode handlers
function setViewMode(mode) {
    currentViewMode = mode;
    btnView3D.classList.toggle('active', mode === '3d');
    btnViewMulti.classList.toggle('active', mode === 'multi');
    btnViewTop.classList.toggle('active', mode === 'top');
    btnViewSide.classList.toggle('active', mode === 'side');
    btnViewFront.classList.toggle('active', mode === 'front');

    if (mode === '3d') {
        card3D.classList.remove('hidden');
        cardTop.classList.add('hidden');
        cardSide.classList.add('hidden');
        cardFront.classList.add('hidden');
    } else if (mode === 'multi') {
        card3D.classList.add('hidden');
        cardTop.classList.remove('hidden');
        cardSide.classList.remove('hidden');
        cardFront.classList.remove('hidden');
        topCanvas.width = 380; topCanvas.height = 350;
        sideCanvas.width = 380; sideCanvas.height = 350;
        frontCanvas.width = 380; frontCanvas.height = 350;
    } else if (mode === 'top') {
        card3D.classList.add('hidden');
        cardTop.classList.remove('hidden');
        cardSide.classList.add('hidden');
        cardFront.classList.add('hidden');
        topCanvas.width = 740; topCanvas.height = 480;
    } else if (mode === 'side') {
        card3D.classList.add('hidden');
        cardTop.classList.add('hidden');
        cardSide.classList.remove('hidden');
        cardFront.classList.add('hidden');
        sideCanvas.width = 740; sideCanvas.height = 480;
    } else if (mode === 'front') {
        card3D.classList.add('hidden');
        cardTop.classList.add('hidden');
        cardSide.classList.add('hidden');
        cardFront.classList.remove('hidden');
        frontCanvas.width = 740; frontCanvas.height = 480;
    }
    drawRobot();
}

btnView3D.addEventListener('click', () => setViewMode('3d'));
btnViewMulti.addEventListener('click', () => setViewMode('multi'));
btnViewTop.addEventListener('click', () => setViewMode('top'));
btnViewSide.addEventListener('click', () => setViewMode('side'));
btnViewFront.addEventListener('click', () => setViewMode('front'));

ws.onopen = () => {
    statusElement.textContent = "Connected";
    statusDot.classList.add('connected');
};

ws.onmessage = (event) => {
    try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'layout') {
            robotLayout = msg.data;
            statusElement.textContent = "Live Stream Active";
            buildThreeJSRobot(robotLayout);
            drawRobot();
        } else if (msg.type === 'angles') {
            jointAngles = msg.data;
            drawRobot();
        } else if (msg.type === 'state') {
            updateControlUI(msg.data);
        }
    } catch (e) {
        console.error("Error processing websocket message:", e);
    }
};

function updateControlUI(state) {
    if (state.is_paused !== undefined) {
        isPaused = state.is_paused;
        if (isPaused) {
            btnPauseIcon.textContent = "\u25b6";
            btnPauseText.textContent = "Resume";
            btnTogglePause.className = "btn btn-paused";
        } else {
            btnPauseIcon.textContent = "\u23f8";
            btnPauseText.textContent = "Pause";
            btnTogglePause.className = "btn btn-primary";
        }
    }
    if (state.gait_speed !== undefined) {
        sliderSpeed.value = state.gait_speed;
        valSpeed.textContent = Number(state.gait_speed).toFixed(1) + "x";
    }
    if (state.step_height !== undefined) {
        sliderStepHeight.value = state.step_height;
        valStepHeight.textContent = Number(state.step_height).toFixed(0) + " mm";
    }
    if (state.step_length !== undefined) {
        sliderStepLength.value = state.step_length;
        valStepLength.textContent = Number(state.step_length).toFixed(0) + " mm";
    }
    if (state.gait_type !== undefined) {
        currentGait = state.gait_type;
        gaitButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.gait === currentGait);
        });
    }
    if (state.walk_x !== undefined) currentWalkX = state.walk_x;
    if (state.walk_y !== undefined) currentWalkY = state.walk_y;
    if (state.turn_z !== undefined) currentTurnZ = state.turn_z;
    highlightActiveDpad();

    if (state.body_height !== undefined) {
        sliderHeight.value = state.body_height;
        valHeight.textContent = Number(state.body_height).toFixed(0) + " mm";
    }
    if (state.body_roll !== undefined) {
        sliderRoll.value = state.body_roll;
        valRoll.textContent = Number(state.body_roll).toFixed(0) + "\u00b0";
    }
    if (state.body_pitch !== undefined) {
        sliderPitch.value = state.body_pitch;
        valPitch.textContent = Number(state.body_pitch).toFixed(0) + "\u00b0";
    }
}

function highlightActiveDpad() {
    allDpadButtons.forEach(btn => btn && btn.classList.remove('active'));

    const isStopped = Math.abs(currentWalkX) < 0.05 && Math.abs(currentWalkY) < 0.05 && Math.abs(currentTurnZ) < 0.05;
    if (isStopped) {
        if (dpadStop) dpadStop.classList.add('active');
        return;
    }

    if (Math.abs(currentTurnZ) > 0.3) {
        if (currentTurnZ > 0 && dpadRotL) dpadRotL.classList.add('active');
        else if (currentTurnZ < 0 && dpadRotR) dpadRotR.classList.add('active');
        return;
    }

    if (currentWalkY > 0.4) {
        if (currentWalkX < -0.3 && dpadFL) dpadFL.classList.add('active');
        else if (currentWalkX > 0.3 && dpadFR) dpadFR.classList.add('active');
        else if (dpadFwd) dpadFwd.classList.add('active');
    } else if (currentWalkY < -0.4) {
        if (dpadBack) dpadBack.classList.add('active');
    } else if (currentWalkX < -0.4) {
        if (dpadLeft) dpadLeft.classList.add('active');
    } else if (currentWalkX > 0.4) {
        if (dpadRight) dpadRight.classList.add('active');
    }
}

// --- CONTROLS EVENT LISTENERS ---

// Pause toggle
btnTogglePause.addEventListener('click', () => {
    sendCommand({ action: "toggle_pause" });
});

// Gait selector buttons
gaitButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        const gait = btn.dataset.gait;
        sendCommand({ action: "set_gait_type", value: gait });
    });
});

// Direction Pad Handlers
if (dpadFwd) dpadFwd.addEventListener('click', () => {
    sendCommand({ action: "set_walk", x: 0, y: 1 });
    sendCommand({ action: "set_turn", z: 0 });
});
if (dpadBack) dpadBack.addEventListener('click', () => {
    sendCommand({ action: "set_walk", x: 0, y: -1 });
    sendCommand({ action: "set_turn", z: 0 });
});
if (dpadLeft) dpadLeft.addEventListener('click', () => {
    sendCommand({ action: "set_walk", x: -1, y: 0 });
    sendCommand({ action: "set_turn", z: 0 });
});
if (dpadRight) dpadRight.addEventListener('click', () => {
    sendCommand({ action: "set_walk", x: 1, y: 0 });
    sendCommand({ action: "set_turn", z: 0 });
});
if (dpadFL) dpadFL.addEventListener('click', () => {
    sendCommand({ action: "set_walk", x: -0.71, y: 0.71 });
    sendCommand({ action: "set_turn", z: 0 });
});
if (dpadFR) dpadFR.addEventListener('click', () => {
    sendCommand({ action: "set_walk", x: 0.71, y: 0.71 });
    sendCommand({ action: "set_turn", z: 0 });
});
if (dpadRotL) dpadRotL.addEventListener('click', () => {
    sendCommand({ action: "set_walk", x: 0, y: 0 });
    sendCommand({ action: "set_turn", z: 1.0 });
});
if (dpadRotR) dpadRotR.addEventListener('click', () => {
    sendCommand({ action: "set_walk", x: 0, y: 0 });
    sendCommand({ action: "set_turn", z: -1.0 });
});
if (dpadStop) dpadStop.addEventListener('click', () => {
    sendCommand({ action: "stop_motion" });
});

// Keyboard controls (WASD, QE, Arrows, Space)
const activeKeys = new Set();
window.addEventListener('keydown', (e) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault(); // prevent scrolling
    }
    if (e.code === 'Space' && !e.repeat) {
        sendCommand({ action: "stop_motion" });
        return;
    }

    activeKeys.add(e.code);
    applyKeyboardMotion();
});

window.addEventListener('keyup', (e) => {
    activeKeys.delete(e.code);
    applyKeyboardMotion();
});

function applyKeyboardMotion() {
    let wx = 0.0, wy = 0.0, tz = 0.0;

    if (activeKeys.has('KeyW') || activeKeys.has('ArrowUp')) wy += 1.0;
    if (activeKeys.has('KeyS') || activeKeys.has('ArrowDown')) wy -= 1.0;
    if (activeKeys.has('KeyA') || activeKeys.has('ArrowLeft')) wx -= 1.0;
    if (activeKeys.has('KeyD') || activeKeys.has('ArrowRight')) wx += 1.0;
    if (activeKeys.has('KeyQ')) tz += 1.0;
    if (activeKeys.has('KeyE')) tz -= 1.0;

    if (wx !== 0.0 && wy !== 0.0) {
        // Normalize diagonal walking
        const inv = 1.0 / Math.sqrt(wx * wx + wy * wy);
        wx = Number((wx * inv).toFixed(2));
        wy = Number((wy * inv).toFixed(2));
    }

    if (activeKeys.size === 0 || (wx === 0.0 && wy === 0.0 && tz === 0.0)) {
        // Only stop if directional keys were being used
        // (don't override mouse button clicks when user isn't using keyboard)
        return;
    }

    sendCommand({ action: "set_walk", x: wx, y: wy });
    sendCommand({ action: "set_turn", z: tz });
}

// Sliders: Speed, Step Height, Step Length
sliderSpeed.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valSpeed.textContent = val.toFixed(1) + "x";
    sendCommand({ action: "set_speed", value: val });
});

sliderStepHeight.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valStepHeight.textContent = val.toFixed(0) + " mm";
    sendCommand({ action: "set_step_height", value: val });
});

sliderStepLength.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valStepLength.textContent = val.toFixed(0) + " mm";
    sendCommand({ action: "set_step_length", value: val });
});

// Sliders: Height, Roll, Pitch
sliderHeight.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valHeight.textContent = val.toFixed(0) + " mm";
    sendCommand({ action: "set_height", value: val });
});

sliderRoll.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valRoll.textContent = val.toFixed(0) + "\u00b0";
    sendCommand({ action: "set_roll", value: val });
});

sliderPitch.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    valPitch.textContent = val.toFixed(0) + "\u00b0";
    sendCommand({ action: "set_pitch", value: val });
});

if (btnResetPose) {
    btnResetPose.addEventListener('click', () => {
        sliderHeight.value = -80;
        valHeight.textContent = "-80 mm";
        sliderRoll.value = 0;
        valRoll.textContent = "0\u00b0";
        sliderPitch.value = 0;
        valPitch.textContent = "0\u00b0";
        sendCommand({ action: "reset_pose" });
    });
}

ws.onclose = () => {
    statusElement.textContent = "Disconnected";
    statusDot.classList.remove('connected');
};

ws.onerror = (error) => {
    console.error("WebSocket error:", error);
    statusElement.textContent = "Connection Error";
    statusDot.classList.remove('connected');
};

/**
 * 3D Forward Kinematics for a given leg.
 * Natural insect posture: Femur angles UPWARDS above horizontal, Tibia reaches DOWNWARDS to ground.
 * Returns joint positions {p0, p1, p2, p3} in robot coordinate frame (mm).
 */
function computeLeg3D(leg, angles) {
    const mount = leg.mount_point;
    const baseAngle = (leg.base_angle !== undefined) ? leg.base_angle : 0;

    const coxaAngle = (angles[leg.coxa.name] || 0) * Math.PI / 180;
    const femurAngle = (angles[leg.femur.name] || 0) * Math.PI / 180;
    const tibiaServoAngle = (angles[leg.tibia.name] || 0) * Math.PI / 180;

    const totalAngle = baseAngle + coxaAngle;

    // p0: Body mount point (Z = 0)
    const p0 = { x: mount.x, y: mount.y, z: 0 };

    // p1: Coxa end / Femur start (Coxa moves in horizontal plane)
    const p1 = {
        x: p0.x + leg.coxa.length * Math.cos(totalAngle),
        y: p0.y + leg.coxa.length * Math.sin(totalAngle),
        z: 0
    };

    // p2: Knee joint (Femur points UPWARDS by femurAngle above horizontal)
    const femurHoriz = leg.femur.length * Math.cos(femurAngle);
    const femurVert = leg.femur.length * Math.sin(femurAngle); // positive upwards

    const p2 = {
        x: p1.x + femurHoriz * Math.cos(totalAngle),
        y: p1.y + femurHoriz * Math.sin(totalAngle),
        z: p1.z + femurVert
    };

    // Tibia: knee bend angle is 90° + tibiaServoAngle
    const kneeBend = (Math.PI / 2) + tibiaServoAngle;
    // Tibia pitch angle relative to horizontal (sloping downwards):
    const tibiaPitch = femurAngle - kneeBend;

    const tibiaHoriz = leg.tibia.length * Math.cos(tibiaPitch);
    const tibiaVert = leg.tibia.length * Math.sin(tibiaPitch); // negative downwards

    // p3: Foot tip
    const p3 = {
        x: p2.x + tibiaHoriz * Math.cos(totalAngle),
        y: p2.y + tibiaHoriz * Math.sin(totalAngle),
        z: p2.z + tibiaVert
    };

    return { p0, p1, p2, p3 };
}

function drawRobot() {
    if (!robotLayout.legs) return;

    // Precalculate 3D joint positions for all legs
    const legs3D = {};
    for (const legName in robotLayout.legs) {
        legs3D[legName] = computeLeg3D(robotLayout.legs[legName], jointAngles);
    }

    // Always update 3D WebGL scene
    update3DLegs(legs3D);

    // Update 2D Canvas views as needed
    if (currentViewMode === 'multi' || currentViewMode === 'top') {
        drawTopView(legs3D);
    }
    if (currentViewMode === 'multi' || currentViewMode === 'side') {
        drawSideView(legs3D);
    }
    if (currentViewMode === 'multi' || currentViewMode === 'front') {
        drawFrontView(legs3D);
    }
}

function drawTopView(legs3D) {
    const width = topCanvas.width;
    const height = topCanvas.height;
    topCtx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const scale = width > 500 ? 1.05 : 0.85;

    // Draw robot body (hexagon matching mount points)
    topCtx.beginPath();
    const vertices = robotLayout.body && robotLayout.body.vertices;
    if (vertices && vertices.length === 6) {
        for (let i = 0; i < vertices.length; i++) {
            const x = centerX + vertices[i].x * scale;
            const y = centerY + vertices[i].y * scale;
            if (i === 0) topCtx.moveTo(x, y); else topCtx.lineTo(x, y);
        }
    }
    topCtx.closePath();
    topCtx.fillStyle = '#343444';
    topCtx.fill();
    topCtx.strokeStyle = '#4e4e62';
    topCtx.lineWidth = 2;
    topCtx.stroke();

    // Front direction indicator (arrow on body pointing forward/up: -Y)
    topCtx.beginPath();
    topCtx.moveTo(centerX - 10 * scale, centerY - 35 * scale);
    topCtx.lineTo(centerX + 10 * scale, centerY - 35 * scale);
    topCtx.lineTo(centerX, centerY - 55 * scale);
    topCtx.closePath();
    topCtx.fillStyle = '#3498db';
    topCtx.fill();

    // Draw each leg in top-down view (X, Y)
    for (const legName in legs3D) {
        const pts = legs3D[legName];
        const c0 = { x: centerX + pts.p0.x * scale, y: centerY + pts.p0.y * scale };
        const c1 = { x: centerX + pts.p1.x * scale, y: centerY + pts.p1.y * scale };
        const c2 = { x: centerX + pts.p2.x * scale, y: centerY + pts.p2.y * scale };
        const c3 = { x: centerX + pts.p3.x * scale, y: centerY + pts.p3.y * scale };

        // Coxa segment (Red)
        topCtx.beginPath();
        topCtx.moveTo(c0.x, c0.y);
        topCtx.lineTo(c1.x, c1.y);
        topCtx.strokeStyle = '#e74c3c';
        topCtx.lineWidth = 4;
        topCtx.stroke();

        // Femur segment (Blue)
        topCtx.beginPath();
        topCtx.moveTo(c1.x, c1.y);
        topCtx.lineTo(c2.x, c2.y);
        topCtx.strokeStyle = '#2980b9';
        topCtx.lineWidth = 3;
        topCtx.stroke();

        // Tibia segment (Purple)
        topCtx.beginPath();
        topCtx.moveTo(c2.x, c2.y);
        topCtx.lineTo(c3.x, c3.y);
        topCtx.strokeStyle = '#8e44ad';
        topCtx.lineWidth = 2.5;
        topCtx.stroke();

        // Joint points
        topCtx.fillStyle = '#2c3e50';
        topCtx.beginPath(); topCtx.arc(c0.x, c0.y, 4, 0, 2 * Math.PI); topCtx.fill();
        topCtx.fillStyle = '#34495e';
        topCtx.beginPath(); topCtx.arc(c1.x, c1.y, 3, 0, 2 * Math.PI); topCtx.fill();
        topCtx.beginPath(); topCtx.arc(c2.x, c2.y, 3, 0, 2 * Math.PI); topCtx.fill();
        // Foot tip
        topCtx.fillStyle = '#e67e22';
        topCtx.beginPath(); topCtx.arc(c3.x, c3.y, 4, 0, 2 * Math.PI); topCtx.fill();
    }
}

function drawSideView(legs3D) {
    const width = sideCanvas.width;
    const height = sideCanvas.height;
    sideCtx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const bodyCanvasY = height * 0.44;
    const scale = width > 500 ? 1.05 : 0.85;

    // Ground level is at Z = -80 mm in robot coordinates
    const groundCanvasY = bodyCanvasY + 80 * scale;

    // 1. Ground Plane (Line with Hatching)
    sideCtx.strokeStyle = '#3e3e52';
    sideCtx.lineWidth = 1.5;
    sideCtx.beginPath();
    sideCtx.moveTo(25, groundCanvasY);
    sideCtx.lineTo(width - 25, groundCanvasY);
    sideCtx.stroke();

    // Ground hatches
    sideCtx.strokeStyle = '#2d2d3d';
    sideCtx.lineWidth = 1;
    for (let x = 30; x < width - 30; x += 16) {
        sideCtx.beginPath();
        sideCtx.moveTo(x, groundCanvasY);
        sideCtx.lineTo(x - 8, groundCanvasY + 10);
        sideCtx.stroke();
    }

    // Direction & Level indicators
    sideCtx.fillStyle = '#7a7a92';
    sideCtx.font = '11px sans-serif';
    sideCtx.fillText("\u25c0 FRONT", 25, 24);
    sideCtx.fillText("REAR \u25b6", width - 75, 24);
    sideCtx.fillText("Ground (Z = -80 mm)", 25, groundCanvasY + 20);

    // 2. Draw Left (Far/Background) Legs with dimmed opacity (0.40)
    for (const legName in legs3D) {
        if (legName.startsWith('left_')) {
            drawLegSide(sideCtx, legs3D[legName], centerX, bodyCanvasY, scale, 0.40);
        }
    }

    // 3. Draw Robot Body Chassis (Side Profile)
    let minY = Infinity, maxY = -Infinity;
    if (robotLayout.body && robotLayout.body.vertices) {
        for (const v of robotLayout.body.vertices) {
            if (v.y < minY) minY = v.y;
            if (v.y > maxY) maxY = v.y;
        }
    } else {
        minY = -70; maxY = 70;
    }

    const bodyStartX = centerX + minY * scale;
    const bodyWidth = (maxY - minY) * scale;
    const chassisHeight = 22 * scale;

    sideCtx.fillStyle = '#343444';
    sideCtx.strokeStyle = '#4e4e62';
    sideCtx.lineWidth = 2;
    sideCtx.beginPath();
    if (sideCtx.roundRect) {
        sideCtx.roundRect(bodyStartX, bodyCanvasY - chassisHeight / 2, bodyWidth, chassisHeight, 5);
    } else {
        sideCtx.rect(bodyStartX, bodyCanvasY - chassisHeight / 2, bodyWidth, chassisHeight);
    }
    sideCtx.fill();
    sideCtx.stroke();

    // Direction arrow on body pointing FRONT (left)
    sideCtx.fillStyle = '#3498db';
    sideCtx.beginPath();
    sideCtx.moveTo(bodyStartX + 8, bodyCanvasY);
    sideCtx.lineTo(bodyStartX + 18, bodyCanvasY - 5);
    sideCtx.lineTo(bodyStartX + 18, bodyCanvasY + 5);
    sideCtx.closePath();
    sideCtx.fill();

    // 4. Draw Right (Near/Foreground) Legs with full opacity (1.0)
    for (const legName in legs3D) {
        if (legName.startsWith('right_')) {
            drawLegSide(sideCtx, legs3D[legName], centerX, bodyCanvasY, scale, 1.0);
        }
    }
}

function drawLegSide(ctx, pts, centerX, bodyCanvasY, scale, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;

    const toCanvas = (p) => ({
        x: centerX + p.y * scale,
        y: bodyCanvasY - p.z * scale
    });

    const c0 = toCanvas(pts.p0);
    const c1 = toCanvas(pts.p1);
    const c2 = toCanvas(pts.p2);
    const c3 = toCanvas(pts.p3);

    // Coxa segment (Red)
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Femur segment (Blue)
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Tibia segment (Purple)
    ctx.beginPath();
    ctx.moveTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.strokeStyle = '#8e44ad';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Joint dots
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath(); ctx.arc(c0.x, c0.y, 3.5, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#34495e';
    ctx.beginPath(); ctx.arc(c1.x, c1.y, 3, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#2980b9';
    ctx.beginPath(); ctx.arc(c2.x, c2.y, 4, 0, 2 * Math.PI); ctx.fill();

    // Foot tip (Orange)
    ctx.fillStyle = '#e67e22';
    ctx.beginPath(); ctx.arc(c3.x, c3.y, 4, 0, 2 * Math.PI); ctx.fill();

    ctx.restore();
}

function drawFrontView(legs3D) {
    const width = frontCanvas.width;
    const height = frontCanvas.height;
    frontCtx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const bodyCanvasY = height * 0.44;
    const scale = width > 500 ? 1.05 : 0.85;

    // Ground level is at Z = -80 mm in robot coordinates
    const groundCanvasY = bodyCanvasY + 80 * scale;

    // 1. Ground Plane (Line with Hatching)
    frontCtx.strokeStyle = '#3e3e52';
    frontCtx.lineWidth = 1.5;
    frontCtx.beginPath();
    frontCtx.moveTo(25, groundCanvasY);
    frontCtx.lineTo(width - 25, groundCanvasY);
    frontCtx.stroke();

    // Ground hatches
    frontCtx.strokeStyle = '#2d2d3d';
    frontCtx.lineWidth = 1;
    for (let x = 30; x < width - 30; x += 16) {
        frontCtx.beginPath();
        frontCtx.moveTo(x, groundCanvasY);
        frontCtx.lineTo(x - 8, groundCanvasY + 10);
        frontCtx.stroke();
    }

    // Direction & Level indicators
    frontCtx.fillStyle = '#7a7a92';
    frontCtx.font = '11px sans-serif';
    frontCtx.fillText("\u25c0 LEFT", 25, 24);
    frontCtx.fillText("RIGHT \u25b6", width - 75, 24);
    frontCtx.fillText("Ground (Z = -80 mm)", 25, groundCanvasY + 20);

    // 2. Depth ordering for Front View
    for (const legName of ['left_rear', 'right_rear']) {
        if (legs3D[legName]) {
            drawLegFront(frontCtx, legs3D[legName], centerX, bodyCanvasY, scale, 0.38);
        }
    }

    for (const legName of ['left_middle', 'right_middle']) {
        if (legs3D[legName]) {
            drawLegFront(frontCtx, legs3D[legName], centerX, bodyCanvasY, scale, 0.68);
        }
    }

    // 3. Draw Robot Body Chassis (Front Cross Section)
    let minX = Infinity, maxX = -Infinity;
    if (robotLayout.body && robotLayout.body.vertices) {
        for (const v of robotLayout.body.vertices) {
            if (v.x < minX) minX = v.x;
            if (v.x > maxX) maxX = v.x;
        }
    } else {
        minX = -80; maxX = 80;
    }

    const bodyStartX = centerX + minX * scale;
    const bodyWidth = (maxX - minX) * scale;
    const chassisHeight = 22 * scale;

    frontCtx.fillStyle = '#343444';
    frontCtx.strokeStyle = '#4e4e62';
    frontCtx.lineWidth = 2;
    frontCtx.beginPath();
    if (frontCtx.roundRect) {
        frontCtx.roundRect(bodyStartX, bodyCanvasY - chassisHeight / 2, bodyWidth, chassisHeight, 5);
    } else {
        frontCtx.rect(bodyStartX, bodyCanvasY - chassisHeight / 2, bodyWidth, chassisHeight);
    }
    frontCtx.fill();
    frontCtx.stroke();

    // Front headlights / status indicators
    frontCtx.fillStyle = '#3498db';
    frontCtx.beginPath();
    frontCtx.arc(centerX - 16 * scale, bodyCanvasY, 3.5 * scale, 0, 2 * Math.PI);
    frontCtx.arc(centerX + 16 * scale, bodyCanvasY, 3.5 * scale, 0, 2 * Math.PI);
    frontCtx.fill();

    // 4. Front legs (closest to viewer)
    for (const legName of ['left_front', 'right_front']) {
        if (legs3D[legName]) {
            drawLegFront(frontCtx, legs3D[legName], centerX, bodyCanvasY, scale, 1.0);
        }
    }
}

function drawLegFront(ctx, pts, centerX, bodyCanvasY, scale, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;

    const toCanvas = (p) => ({
        x: centerX + p.x * scale,
        y: bodyCanvasY - p.z * scale
    });

    const c0 = toCanvas(pts.p0);
    const c1 = toCanvas(pts.p1);
    const c2 = toCanvas(pts.p2);
    const c3 = toCanvas(pts.p3);

    // Coxa segment (Red)
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.strokeStyle = '#e74c3c';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Femur segment (Blue)
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.strokeStyle = '#2980b9';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Tibia segment (Purple)
    ctx.beginPath();
    ctx.moveTo(c2.x, c2.y);
    ctx.lineTo(c3.x, c3.y);
    ctx.strokeStyle = '#8e44ad';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Joint dots
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath(); ctx.arc(c0.x, c0.y, 3.5, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#34495e';
    ctx.beginPath(); ctx.arc(c1.x, c1.y, 3, 0, 2 * Math.PI); ctx.fill();
    ctx.fillStyle = '#2980b9';
    ctx.beginPath(); ctx.arc(c2.x, c2.y, 4, 0, 2 * Math.PI); ctx.fill();

    // Foot tip (Orange)
    ctx.fillStyle = '#e67e22';
    ctx.beginPath(); ctx.arc(c3.x, c3.y, 4, 0, 2 * Math.PI); ctx.fill();

    ctx.restore();
}

// Initialize Three.js scene
initThreeJS();
drawRobot();
