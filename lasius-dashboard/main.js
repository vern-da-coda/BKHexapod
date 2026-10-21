import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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

// View and Layout elements
const btnToggle2D = document.getElementById('btn-toggle-2d');
const strip2DWrapper = document.getElementById('strip-2d-wrapper');
const card3D = document.getElementById('card-3d');
const cardTop = document.getElementById('card-top');
const cardSide = document.getElementById('card-side');
const cardFront = document.getElementById('card-front');
const btnResetCam = document.getElementById('btn-reset-cam');

// Control elements - Locomotion & Gait
const btnTogglePause = document.getElementById('btn-toggle-pause');
const btnPauseIcon = document.getElementById('btn-pause-icon');
const btnPauseText = document.getElementById('btn-pause-text');
const btnTestLeg = document.getElementById('btn-test-leg');
const btnEstop = document.getElementById('btn-estop');
const btnRestartServer = document.getElementById('btn-restart-server');
const restartText = document.getElementById('restart-text');
const btnShutdownRobot = document.getElementById('btn-shutdown-robot');
const shutdownText = document.getElementById('shutdown-text');

// Tab Navigation elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Leg Control elements (Beinsteuerung)
const selectLeg = document.getElementById('select-leg');
const legInfoBadge = document.getElementById('leg-info-badge');
const testLegInfoBadge = document.getElementById('test-leg-info-badge');
const sliderJointCoxa = document.getElementById('slider-joint-coxa');
const valJointCoxa = document.getElementById('val-joint-coxa');
const idJointCoxa = document.getElementById('id-joint-coxa');
const sliderJointFemur = document.getElementById('slider-joint-femur');
const valJointFemur = document.getElementById('val-joint-femur');
const idJointFemur = document.getElementById('id-joint-femur');
const sliderJointTibia = document.getElementById('slider-joint-tibia');
const valJointTibia = document.getElementById('val-joint-tibia');
const idJointTibia = document.getElementById('id-joint-tibia');
const btnLegStance = document.getElementById('btn-leg-stance');
const btnLegZero = document.getElementById('btn-leg-zero');
const btnLegRelax = document.getElementById('btn-leg-relax');
const minimapLegBtns = document.querySelectorAll('.minimap-leg-btn');

// Leg Sub-Mode & Calibration elements (Option C Overlay)
const btnLegModeDirect = document.getElementById('btn-leg-mode-direct');
const btnLegModeCalib = document.getElementById('btn-leg-mode-calib');
const panelLegDirect = document.getElementById('panel-leg-direct');
const panelLegCalib = document.getElementById('panel-leg-calib');
const btnCalibAlignRef = document.getElementById('btn-calib-align-ref');
const btnCalibSave = document.getElementById('btn-calib-save');
const btnCalibResetLeg = document.getElementById('btn-calib-reset-leg');

// Tests & Diagnostics elements
const selectTestLeg = document.getElementById('select-test-leg');
const sliderTestCycles = document.getElementById('slider-test-cycles');
const valTestCycles = document.getElementById('val-test-cycles');
const btnRunStepTest = document.getElementById('btn-run-step-test');
const btnSweepCoxa = document.getElementById('btn-sweep-coxa');
const btnSweepFemur = document.getElementById('btn-sweep-femur');
const btnSweepTibia = document.getElementById('btn-sweep-tibia');
const btnAllStance = document.getElementById('btn-all-stance');
const btnRelaxAll = document.getElementById('btn-relax-all');
const orderStatusBadge = document.getElementById('order-status-badge');
const orderLog = document.getElementById('order-log');

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
let selectedLegKey = 'left_rear';
let currentLegSubMode = 'direct'; // 'direct' or 'calib'
let calibrationData = {};
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
    camera.position.set(380, 280, 380);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    threeContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -25, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.15; // don't go too far below ground
    controls.minDistance = 80;
    controls.maxDistance = 1200;

    // Grid at ground level (Z = -80 in lasius coords -> Y = -80 in Three.js coords)
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

function getChassisHullContour() {
    return [
        { x: 0,   y: -118 }, // Front nose apex
        { x: 22,  y: -114 }, // Front right chamfer
        { x: 38,  y: -104 }, // Toward front right mount
        { x: 56,  y: -98 },  // Front right socket front curve
        { x: 74,  y: -90 },  // Front right socket apex (RF mount at 65, -90)
        { x: 70,  y: -78 },  // Front right socket rear curve
        { x: 58,  y: -55 },  // Upper right waist recess
        { x: 58,  y: -30 },  // Upper right waist recess
        { x: 68,  y: -14 },  // Toward middle right mount
        { x: 84,  y: 0 },    // Middle right socket apex (RM mount at 75, 0)
        { x: 68,  y: 14 },   // Leaving middle right mount
        { x: 58,  y: 30 },   // Lower right waist recess
        { x: 58,  y: 55 },   // Lower right waist recess
        { x: 70,  y: 78 },   // Rear right socket front curve
        { x: 74,  y: 90 },   // Rear right socket apex (RR mount at 65, 90)
        { x: 56,  y: 98 },   // Rear right socket rear curve
        { x: 38,  y: 104 },  // Toward rear right chamfer
        { x: 22,  y: 114 },  // Rear right chamfer
        { x: 0,   y: 118 },  // Rear tail apex
        { x: -22, y: 114 },  // Rear left chamfer
        { x: -38, y: 104 },  // Toward rear left chamfer
        { x: -56, y: 98 },   // Rear left socket rear curve
        { x: -74, y: 90 },   // Rear left socket apex (LR mount at -65, 90)
        { x: -70, y: 78 },   // Rear left socket front curve
        { x: -58, y: 55 },   // Lower left waist recess
        { x: -58, y: 30 },   // Lower left waist recess
        { x: -68, y: 14 },   // Toward middle left mount
        { x: -84, y: 0 },    // Middle left socket apex (LM mount at -75, 0)
        { x: -68, y: -14 },  // Leaving middle left mount
        { x: -58, y: -30 },  // Upper left waist recess
        { x: -58, y: -55 },  // Upper left waist recess
        { x: -70, y: -78 },  // Front left socket rear curve
        { x: -74, y: -90 },  // Front left socket apex (LF mount at -65, -90)
        { x: -56, y: -98 },  // Front left socket front curve
        { x: -38, y: -104 }, // Toward front left chamfer
        { x: -22, y: -114 }  // Front left chamfer
    ];
}

function getChassisBayContour() {
    return [
        { x: 0,   y: -85 },
        { x: 20,  y: -80 },
        { x: 32,  y: -45 },
        { x: 36,  y: 0 },
        { x: 32,  y: 45 },
        { x: 20,  y: 80 },
        { x: 0,   y: 85 },
        { x: -20, y: 80 },
        { x: -32, y: 45 },
        { x: -36, y: 0 },
        { x: -32, y: -45 },
        { x: -20, y: -80 }
    ];
}

function buildThreeJSRobot(layout) {
    if (!scene || !layout.body || !layout.legs) return;

    // Remove existing meshes if any
    if (robot3DMeshes.body) scene.remove(robot3DMeshes.body);
    if (robot3DMeshes.axesGroup) scene.remove(robot3DMeshes.axesGroup);
    if (robot3DMeshes.arcsGroup) scene.remove(robot3DMeshes.arcsGroup);
    robot3DMeshes.axesGroup = null;
    robot3DMeshes.arcsGroup = null;
    for (const legName in robot3DMeshes.legs) {
        const m = robot3DMeshes.legs[legName];
        if (m.coxaGroup) scene.remove(m.coxaGroup);
        if (m.femurGroup) scene.remove(m.femurGroup);
        if (m.tibiaGroup) scene.remove(m.tibiaGroup);
        if (m.s0) scene.remove(m.s0);
        if (m.s1) scene.remove(m.s1);
        if (m.s2) scene.remove(m.s2);
        if (m.s3) scene.remove(m.s3);
        if (m.coxa) scene.remove(m.coxa);
        if (m.femur) scene.remove(m.femur);
        if (m.tibia) scene.remove(m.tibia);
    }
    robot3DMeshes.legs = {};

    // 1. Build Biomimetic Chassis Body Hull (Matching 2D Minimap)
    const hullShape = new THREE.Shape();
    const hullPts = getChassisHullContour();
    hullShape.moveTo(hullPts[0].x, hullPts[0].y);
    for (let i = 1; i < hullPts.length; i++) {
        hullShape.lineTo(hullPts[i].x, hullPts[i].y);
    }
    hullShape.closePath();

    const extrudeSettings = {
        depth: 14,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 2.2,
        bevelThickness: 2.2
    };
    const bodyGeo = new THREE.ExtrudeGeometry(hullShape, extrudeSettings);
    // Center vertically along extrusion thickness, then rotate so shape XY lies in Three.js XZ plane
    bodyGeo.translate(0, 0, -7);
    bodyGeo.rotateX(Math.PI / 2);

    const bodyMesh = new THREE.Mesh(bodyGeo, chassisMat);
    bodyMesh.position.set(0, 0, 0);

    // 2. Add Elevated Top Electronics Bay Plate
    const bayShape = new THREE.Shape();
    const bayPts = getChassisBayContour();
    bayShape.moveTo(bayPts[0].x, bayPts[0].y);
    for (let i = 1; i < bayPts.length; i++) {
        bayShape.lineTo(bayPts[i].x, bayPts[i].y);
    }
    bayShape.closePath();

    const bayGeo = new THREE.ExtrudeGeometry(bayShape, {
        depth: 3.5,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 1,
        bevelThickness: 1
    });
    bayGeo.translate(0, 0, -1.75);
    bayGeo.rotateX(Math.PI / 2);

    const bayMat = new THREE.MeshStandardMaterial({
        color: 0x1f212d,
        roughness: 0.6,
        metalness: 0.25
    });
    const bayMesh = new THREE.Mesh(bayGeo, bayMat);
    bayMesh.position.set(0, 8.2, 0);
    bodyMesh.add(bayMesh);

    // Initialize materials early
    initLegGeometriesAndMaterials();

    // 3. Direction Headlights / Cyan LEDs
    const eyeGeo = new THREE.SphereGeometry(3.5, 16, 16);
    const eyeMat = new THREE.MeshStandardMaterial({
        color: 0x00d2d3,
        emissive: 0x00d2d3,
        emissiveIntensity: 0.9,
        roughness: 0.2
    });
    const eyeLeft = new THREE.Mesh(eyeGeo, eyeMat);
    eyeLeft.position.set(-16, 4.5, -106);
    bodyMesh.add(eyeLeft);

    const eyeRight = new THREE.Mesh(eyeGeo, eyeMat);
    eyeRight.position.set(16, 4.5, -106);
    bodyMesh.add(eyeRight);

    // 5. Directional Forward Chevron Indicator on Deck
    const chevronShape = new THREE.Shape();
    chevronShape.moveTo(0, -96);
    chevronShape.lineTo(7, -84);
    chevronShape.lineTo(2.5, -84);
    chevronShape.lineTo(0, -89);
    chevronShape.lineTo(-2.5, -84);
    chevronShape.lineTo(-7, -84);
    chevronShape.closePath();

    const chevronGeo = new THREE.ExtrudeGeometry(chevronShape, {
        depth: 1,
        bevelEnabled: false
    });
    chevronGeo.rotateX(Math.PI / 2);
    const chevronMat = new THREE.MeshStandardMaterial({
        color: 0x3498db,
        emissive: 0x1b4f72,
        roughness: 0.4
    });
    const chevronMesh = new THREE.Mesh(chevronGeo, chevronMat);
    chevronMesh.position.set(0, 10.2, 0);
    bodyMesh.add(chevronMesh);

    scene.add(bodyMesh);
    robot3DMeshes.body = bodyMesh;

    // 2. Build 3D Leg Meshes (Authentic Hardware Morphology from Photos)
    initLegGeometriesAndMaterials();

    for (const legName in layout.legs) {
        const coxaGroup = createCoxaGroup();
        const femurGroup = createFemurGroup();
        const tibiaGroup = createTibiaGroup();
        [coxaGroup, femurGroup, tibiaGroup].forEach(g => {
            g.traverse(child => {
                if (child.isMesh) child.userData.legName = legName;
            });
        });
        scene.add(coxaGroup);
        scene.add(femurGroup);
        scene.add(tibiaGroup);
        robot3DMeshes.legs[legName] = {
            coxaGroup,
            femurGroup,
            tibiaGroup
        };
    }
    initAxisGuideObjects();
    initMotionRangeArcObjects();
    update3DLegHighlights(selectedLegKey, null);
}

// Shared leg geometries and materials
let sharedCoxaBracketGeo, sharedCoxaServoGeo, sharedCoxaPinionGeo, sharedCoxaFlangeGeo, sharedCoxaCollarGeo;
let sharedFemurPlateGeo, sharedFemurRungGeo, sharedFemurKneeServoGeo;
let sharedTibiaGeo, sharedTibiaClampGeo, sharedJointRingGeo;
let hardwareMat, carbonPlateMat, brassMat;
let chassisAxisMat, chassisMountActiveMat;
let legNeutralMat, jointNeutralMat;

// Unified CTA-Blue Leg Materials (Segment color-coding replaced by CTA-Blue hierarchy)
// 1. Selected Leg: All segments in muted CTA-Blue
let legSelectedMat, jointSelectedMat;

// 2. Active Segment: Focused/hovered segment in radiant, electric CTA-Blue
let legActiveSegmentMat, jointActiveMat;

// 3. Servo Axes & Range of Motion Arcs
let axisGuideMat, arcLineMat, arcFanMat, needleLineMat, beadMat;
let currentHoveredJoint = null;
let lastSelectedLegKinematics = null;

function initLegGeometriesAndMaterials() {
    if (sharedTibiaGeo) return; // already initialized

    // Core materials
    hardwareMat = new THREE.MeshStandardMaterial({ color: 0x1a1b24, roughness: 0.60, metalness: 0.25 });
    carbonPlateMat = new THREE.MeshStandardMaterial({ color: 0x222430, roughness: 0.45, metalness: 0.35 });
    brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.75 });

    // Chassis attachment axis material (light gray metallic)
    chassisAxisMat = new THREE.MeshStandardMaterial({
        color: 0xd0d4de,
        roughness: 0.3,
        metalness: 0.65
    });

    // Minimap active selection glow (steady Cyan/Blue #38bdf8)
    chassisMountActiveMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.25,
        metalness: 0.5,
        emissive: 0x0284c7,
        emissiveIntensity: 0.85
    });

    // Unselected leg materials (plain monochrome dark gray matching physical hardware)
    legNeutralMat = new THREE.MeshStandardMaterial({
        color: 0x2e303d,
        roughness: 0.52,
        metalness: 0.25
    });
    jointNeutralMat = new THREE.MeshStandardMaterial({
        color: 0x242531,
        roughness: 0.50,
        metalness: 0.30
    });

    // Selected leg state: All segments in muted/softened CTA-Blue (#2471a3)
    legSelectedMat = new THREE.MeshStandardMaterial({
        color: 0x2471a3,
        roughness: 0.35,
        metalness: 0.35,
        emissive: 0x0c3b60,
        emissiveIntensity: 0.50
    });
    jointSelectedMat = new THREE.MeshStandardMaterial({
        color: 0x1b4f72,
        roughness: 0.35,
        metalness: 0.40,
        emissive: 0x0a2840,
        emissiveIntensity: 0.35
    });

    // Active segment state: Radiant full CTA-Blue (#38bdf8) with glowing emissive
    legActiveSegmentMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        roughness: 0.20,
        metalness: 0.45,
        emissive: 0x0284c7,
        emissiveIntensity: 1.15
    });
    jointActiveMat = new THREE.MeshStandardMaterial({
        color: 0x60a5fa,
        roughness: 0.15,
        metalness: 0.50,
        emissive: 0x38bdf8,
        emissiveIntensity: 1.3
    });

    // Axis Guide Line Material (Pure glowing electric cyan-blue #38bdf8)
    axisGuideMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        depthTest: false,
        transparent: true,
        opacity: 0.95
    });

    // Range Arc Materials
    arcLineMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        linewidth: 2,
        transparent: true,
        opacity: 0.95,
        depthTest: false
    });
    arcFanMat = new THREE.MeshBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false
    });
    needleLineMat = new THREE.LineBasicMaterial({
        color: 0x67e8f9,
        linewidth: 2,
        depthTest: false
    });
    beadMat = new THREE.MeshBasicMaterial({
        color: 0x67e8f9,
        depthTest: false
    });

    // 1. Coxa Geometries (3D-printed bracket housing + horizontal femur servo: 60mm center-to-center)
    // Bracket body holding the servo
    sharedCoxaBracketGeo = new THREE.BoxGeometry(44, 26, 28);
    // Embedded horizontal femur servo block
    sharedCoxaServoGeo = new THREE.BoxGeometry(38, 20, 24);
    // Joint accent ring
    sharedJointRingGeo = new THREE.TorusGeometry(6.5, 1.2, 8, 24);
    // Output bearing collar at horizontal femur axis (x = 60)
    sharedCoxaCollarGeo = new THREE.CylinderGeometry(7.5, 7.5, 3.2, 20);
    sharedCoxaCollarGeo.rotateX(Math.PI / 2);

    // 2. Femur Geometries (Dual parallel carbon plates + ladder standoffs + knee servo: 100mm center-to-center)
    const femurShape = new THREE.Shape();
    femurShape.absarc(0, 0, 12, Math.PI / 2, -Math.PI / 2, false);
    femurShape.lineTo(100, -12);
    femurShape.absarc(100, 0, 12, -Math.PI / 2, Math.PI / 2, false);
    femurShape.lineTo(0, 12);
    femurShape.closePath();

    sharedFemurPlateGeo = new THREE.ExtrudeGeometry(femurShape, {
        depth: 2.2,
        bevelEnabled: true,
        bevelThickness: 0.5,
        bevelSize: 0.5,
        bevelSegments: 2
    });
    sharedFemurPlateGeo.translate(0, 0, -1.1);

    // Cylindrical standoff rungs (ladder cross-spacers between plates)
    sharedFemurRungGeo = new THREE.CylinderGeometry(3.2, 3.2, 19, 16);
    sharedFemurRungGeo.rotateX(Math.PI / 2);

    // Distal knee (tibia) servo block nestled between plates
    sharedFemurKneeServoGeo = new THREE.BoxGeometry(28, 20, 18);

    // 3. Tibia Geometry (Authentic sickle blade silhouette with twin crown fins & center teardrop window)
    const tibiaShape = new THREE.Shape();
    tibiaShape.moveTo(-6, 12);
    // Ventral / inner crown fin pointing up and in towards body
    tibiaShape.lineTo(-10, 28);
    tibiaShape.lineTo(-9, 32);
    tibiaShape.lineTo(-6, 32);
    // Saddle notch between horns
    tibiaShape.lineTo(0, 15);
    // Dorsal / outer crown fin pointing up and out
    tibiaShape.lineTo(12, 28);
    tibiaShape.lineTo(15, 27);
    // Dorsal curved outer blade spine
    tibiaShape.lineTo(18, 14);
    tibiaShape.lineTo(22, -6);
    tibiaShape.lineTo(24, -30);
    tibiaShape.lineTo(23, -60);
    tibiaShape.lineTo(19, -88);
    tibiaShape.lineTo(13, -110);
    tibiaShape.lineTo(6, -124);
    tibiaShape.lineTo(2, -130);
    // Rounded foot tip
    tibiaShape.lineTo(-2, -130);
    tibiaShape.lineTo(-5, -124);
    // Ventral inner curve
    tibiaShape.lineTo(-7, -110);
    tibiaShape.lineTo(-8, -88);
    tibiaShape.lineTo(-8, -60);
    tibiaShape.lineTo(-6, -35);
    tibiaShape.lineTo(-3, -18);
    tibiaShape.lineTo(-8, -6);
    tibiaShape.lineTo(-12, 5);
    tibiaShape.lineTo(-6, 12);
    tibiaShape.closePath();

    // Teardrop / crescent cutout window
    const hole = new THREE.Path();
    hole.moveTo(8, -24);
    hole.lineTo(13, -36);
    hole.lineTo(15, -58);
    hole.lineTo(12, -78);
    hole.lineTo(6, -88);
    hole.lineTo(3, -90);
    hole.lineTo(1, -88);
    hole.lineTo(-1, -78);
    hole.lineTo(-2, -58);
    hole.lineTo(0, -36);
    hole.lineTo(4, -24);
    hole.closePath();
    tibiaShape.holes.push(hole);

    sharedTibiaGeo = new THREE.ExtrudeGeometry(tibiaShape, {
        depth: 3.2,
        bevelEnabled: true,
        bevelThickness: 0.6,
        bevelSize: 0.6,
        bevelSegments: 2
    });
    sharedTibiaGeo.translate(0, 0, -1.6);

    // 3D-printed horn clamp block behind knee hub
    sharedTibiaClampGeo = new THREE.BoxGeometry(20, 18, 14);
}

function initAxisGuideObjects() {
    if (robot3DMeshes.axesGroup) return;

    const axisEndCapGeo = new THREE.SphereGeometry(1.6, 12, 12);
    const coxaCylGeo = new THREE.CylinderGeometry(0.85, 0.85, 54, 16);
    const pitchCylGeo = new THREE.CylinderGeometry(0.85, 0.85, 46, 16);

    const axesGroup = new THREE.Group();
    axesGroup.renderOrder = 999;

    // 1. Coxa vertical rotation axis
    const coxaAxisGroup = new THREE.Group();
    const coxaCyl = new THREE.Mesh(coxaCylGeo, axisGuideMat);
    const coxaCapTop = new THREE.Mesh(axisEndCapGeo, axisGuideMat);
    coxaCapTop.position.set(0, 27, 0);
    const coxaCapBottom = new THREE.Mesh(axisEndCapGeo, axisGuideMat);
    coxaCapBottom.position.set(0, -27, 0);
    coxaAxisGroup.add(coxaCyl);
    coxaAxisGroup.add(coxaCapTop);
    coxaAxisGroup.add(coxaCapBottom);
    axesGroup.add(coxaAxisGroup);

    // 2. Femur pitch rotation axis (local Z)
    const femurAxisGroup = new THREE.Group();
    const femurCyl = new THREE.Mesh(pitchCylGeo, axisGuideMat);
    femurCyl.rotateX(Math.PI / 2);
    const femurCap1 = new THREE.Mesh(axisEndCapGeo, axisGuideMat);
    femurCap1.position.set(0, 0, 23);
    const femurCap2 = new THREE.Mesh(axisEndCapGeo, axisGuideMat);
    femurCap2.position.set(0, 0, -23);
    femurAxisGroup.add(femurCyl);
    femurAxisGroup.add(femurCap1);
    femurAxisGroup.add(femurCap2);
    axesGroup.add(femurAxisGroup);

    // 3. Tibia knee pitch rotation axis (local Z)
    const tibiaAxisGroup = new THREE.Group();
    const tibiaCyl = new THREE.Mesh(pitchCylGeo, axisGuideMat);
    tibiaCyl.rotateX(Math.PI / 2);
    const tibiaCap1 = new THREE.Mesh(axisEndCapGeo, axisGuideMat);
    tibiaCap1.position.set(0, 0, 23);
    const tibiaCap2 = new THREE.Mesh(axisEndCapGeo, axisGuideMat);
    tibiaCap2.position.set(0, 0, -23);
    tibiaAxisGroup.add(tibiaCyl);
    tibiaAxisGroup.add(tibiaCap1);
    tibiaAxisGroup.add(tibiaCap2);
    axesGroup.add(tibiaAxisGroup);

    scene.add(axesGroup);
    robot3DMeshes.axesGroup = axesGroup;
    robot3DMeshes.axes = {
        coxa: coxaAxisGroup,
        femur: femurAxisGroup,
        tibia: tibiaAxisGroup
    };
}

function updateAxisGuideLines(v0, v1, v2, normal) {
    if (!robot3DMeshes.axes) return;
    const { coxa, femur, tibia } = robot3DMeshes.axes;

    // Coxa vertical axis through chassis pivot
    coxa.position.copy(v0);

    // Femur pitch axis through hip pivot along normal
    femur.position.copy(v1);
    femur.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

    // Tibia knee pitch axis through knee pivot along normal
    tibia.position.copy(v2);
    tibia.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
}

function initMotionRangeArcObjects() {
    if (robot3DMeshes.arcsGroup) return;

    const createSingleArc = () => {
        const group = new THREE.Group();
        group.visible = false;

        const lineMat = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            linewidth: 2,
            transparent: true,
            opacity: 0.85,
            depthTest: false
        });

        const fanMat = new THREE.MeshBasicMaterial({
            color: 0x0284c7,
            transparent: true,
            opacity: 0.14,
            side: THREE.DoubleSide,
            depthTest: false,
            depthWrite: false
        });

        const needleMat = new THREE.LineBasicMaterial({
            color: 0x67e8f9,
            linewidth: 2,
            depthTest: false
        });

        const beadMeshMat = new THREE.MeshBasicMaterial({
            color: 0x67e8f9,
            depthTest: false
        });

        const lineGeo = new THREE.BufferGeometry();
        const arcLine = new THREE.Line(lineGeo, lineMat);

        const ticksGeo = new THREE.BufferGeometry();
        const ticksLine = new THREE.LineSegments(ticksGeo, lineMat);

        const needleGeo = new THREE.BufferGeometry();
        const needle = new THREE.Line(needleGeo, needleMat);

        const beadGeo = new THREE.SphereGeometry(2.0, 12, 12);
        const bead = new THREE.Mesh(beadGeo, beadMeshMat);

        const fanMesh = new THREE.Mesh(new THREE.BufferGeometry(), fanMat);

        group.add(fanMesh);
        group.add(arcLine);
        group.add(ticksLine);
        group.add(needle);
        group.add(bead);

        return { group, arcLine, ticksLine, needle, bead, fanMesh, lineMat, fanMat, needleMat, beadMeshMat };
    };

    const arcsGroup = new THREE.Group();
    arcsGroup.renderOrder = 1000;
    const coxa = createSingleArc();
    const femur = createSingleArc();
    const tibia = createSingleArc();

    arcsGroup.add(coxa.group);
    arcsGroup.add(femur.group);
    arcsGroup.add(tibia.group);

    scene.add(arcsGroup);
    robot3DMeshes.arcsGroup = arcsGroup;
    robot3DMeshes.arcs = { coxa, femur, tibia };
}

function getJointLimits(sName, jointType) {
    const sData = (sName && calibrationData[sName]) ? calibrationData[sName] : {};
    const minAngle = sData.min_angle !== undefined ? sData.min_angle : (jointType === 'tibia' ? -60 : -45);
    const maxAngle = sData.max_angle !== undefined ? sData.max_angle : (jointType === 'tibia' ? 60 : 45);
    return { minAngle, maxAngle };
}

function updateMotionRangeArcs() {
    if (!robot3DMeshes.arcs) return;
    const { coxa, femur, tibia } = robot3DMeshes.arcs;

    // The motion range arcs are shown as soon as a leg is selected
    const hasActiveLeg = !!(selectedLegKey && lastSelectedLegKinematics);
    coxa.group.visible = hasActiveLeg;
    femur.group.visible = hasActiveLeg;
    tibia.group.visible = hasActiveLeg;

    if (!hasActiveLeg) return;

    const { v0, v1, v2, normal, totalAngle, baseAngle, legDef } = lastSelectedLegKinematics;
    const legKey = selectLeg ? selectLeg.value : selectedLegKey;
    const names = getLegServoNames(legKey);

    const rVec = new THREE.Vector3(Math.cos(totalAngle), 0, Math.sin(totalAngle)).normalize();
    const upVec = new THREE.Vector3(0, 1, 0);
    const segments = 32;

    // --- 1. COXA ARC (Horizontal plane at v0) ---
    {
        const isHovered = (currentHoveredJoint === 'coxa');
        coxa.lineMat.color.setHex(isHovered ? 0x67e8f9 : 0x38bdf8);
        coxa.lineMat.opacity = isHovered ? 1.0 : 0.85;
        coxa.fanMat.opacity = isHovered ? 0.28 : 0.14;
        coxa.beadMeshMat.color.setHex(isHovered ? 0xa5f3fc : 0x67e8f9);
        coxa.bead.scale.setScalar(isHovered ? 1.35 : 1.0);

        const sName = names.coxa;
        const limits = getJointLimits(sName, 'coxa');
        const minRad = limits.minAngle * Math.PI / 180;
        const maxRad = limits.maxAngle * Math.PI / 180;
        const curDeg = jointAngles[sName] || 0;
        const curRad = curDeg * Math.PI / 180;
        const R = 38;

        const pts = [];
        const fanPositions = [];
        for (let i = 0; i <= segments; i++) {
            const frac = i / segments;
            const a = baseAngle + minRad + frac * (maxRad - minRad);
            const p = new THREE.Vector3(
                v0.x + R * Math.cos(a),
                v0.y + 1.2,
                v0.z + R * Math.sin(a)
            );
            pts.push(p);
        }
        for (let i = 0; i < segments; i++) {
            fanPositions.push(v0.x, v0.y + 1.0, v0.z);
            fanPositions.push(pts[i].x, pts[i].y, pts[i].z);
            fanPositions.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        }

        coxa.arcLine.geometry.setFromPoints(pts);
        coxa.fanMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(fanPositions, 3));
        coxa.fanMesh.geometry.computeVertexNormals();

        // Limit & zero ticks
        const tickPts = [];
        [minRad, 0, maxRad].forEach(offset => {
            const a = baseAngle + offset;
            tickPts.push(
                new THREE.Vector3(v0.x + (R - 5) * Math.cos(a), v0.y + 1.2, v0.z + (R - 5) * Math.sin(a)),
                new THREE.Vector3(v0.x + (R + 5) * Math.cos(a), v0.y + 1.2, v0.z + (R + 5) * Math.sin(a))
            );
        });
        coxa.ticksLine.geometry.setFromPoints(tickPts);

        // Needle & Live Bead
        const liveA = baseAngle + curRad;
        const curPos = new THREE.Vector3(
            v0.x + R * Math.cos(liveA),
            v0.y + 1.4,
            v0.z + R * Math.sin(liveA)
        );
        coxa.needle.geometry.setFromPoints([new THREE.Vector3(v0.x, v0.y + 1.2, v0.z), curPos]);
        coxa.bead.position.copy(curPos);
    }

    // --- 2. FEMUR ARC (Vertical bending plane at v1) ---
    {
        const isHovered = (currentHoveredJoint === 'femur');
        femur.lineMat.color.setHex(isHovered ? 0x67e8f9 : 0x38bdf8);
        femur.lineMat.opacity = isHovered ? 1.0 : 0.85;
        femur.fanMat.opacity = isHovered ? 0.28 : 0.14;
        femur.beadMeshMat.color.setHex(isHovered ? 0xa5f3fc : 0x67e8f9);
        femur.bead.scale.setScalar(isHovered ? 1.35 : 1.0);

        const sName = names.femur;
        const limits = getJointLimits(sName, 'femur');
        const minRad = limits.minAngle * Math.PI / 180;
        const maxRad = limits.maxAngle * Math.PI / 180;
        const curDeg = jointAngles[sName] || 0;
        const curRad = curDeg * Math.PI / 180;
        const R = 42;

        const pts = [];
        const fanPositions = [];
        for (let i = 0; i <= segments; i++) {
            const frac = i / segments;
            const a = minRad + frac * (maxRad - minRad);
            const p = new THREE.Vector3()
                .copy(v1)
                .addScaledVector(rVec, R * Math.cos(a))
                .addScaledVector(upVec, R * Math.sin(a));
            pts.push(p);
        }
        for (let i = 0; i < segments; i++) {
            fanPositions.push(v1.x, v1.y, v1.z);
            fanPositions.push(pts[i].x, pts[i].y, pts[i].z);
            fanPositions.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        }

        femur.arcLine.geometry.setFromPoints(pts);
        femur.fanMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(fanPositions, 3));
        femur.fanMesh.geometry.computeVertexNormals();

        // Limit & zero ticks
        const tickPts = [];
        [minRad, 0, maxRad].forEach(a => {
            const p1 = new THREE.Vector3().copy(v1)
                .addScaledVector(rVec, (R - 5) * Math.cos(a))
                .addScaledVector(upVec, (R - 5) * Math.sin(a));
            const p2 = new THREE.Vector3().copy(v1)
                .addScaledVector(rVec, (R + 5) * Math.cos(a))
                .addScaledVector(upVec, (R + 5) * Math.sin(a));
            tickPts.push(p1, p2);
        });
        femur.ticksLine.geometry.setFromPoints(tickPts);

        // Needle & Live Bead
        const curPos = new THREE.Vector3().copy(v1)
            .addScaledVector(rVec, R * Math.cos(curRad))
            .addScaledVector(upVec, R * Math.sin(curRad));
        femur.needle.geometry.setFromPoints([v1, curPos]);
        femur.bead.position.copy(curPos);
    }

    // --- 3. TIBIA ARC (Vertical bending plane at v2) ---
    {
        const isHovered = (currentHoveredJoint === 'tibia');
        tibia.lineMat.color.setHex(isHovered ? 0x67e8f9 : 0x38bdf8);
        tibia.lineMat.opacity = isHovered ? 1.0 : 0.85;
        tibia.fanMat.opacity = isHovered ? 0.28 : 0.14;
        tibia.beadMeshMat.color.setHex(isHovered ? 0xa5f3fc : 0x67e8f9);
        tibia.bead.scale.setScalar(isHovered ? 1.35 : 1.0);

        const sName = names.tibia;
        const limits = getJointLimits(sName, 'tibia');
        const minRad = limits.minAngle * Math.PI / 180;
        const maxRad = limits.maxAngle * Math.PI / 180;
        const curDeg = jointAngles[sName] || 0;
        const curRad = curDeg * Math.PI / 180;
        const femurDeg = jointAngles[names.femur] || 0;
        const femurRad = femurDeg * Math.PI / 180;
        const R = 44;

        const pts = [];
        const fanPositions = [];
        for (let i = 0; i <= segments; i++) {
            const frac = i / segments;
            const theta = minRad + frac * (maxRad - minRad);
            const pitch = femurRad - (Math.PI / 2) - theta;
            const p = new THREE.Vector3().copy(v2)
                .addScaledVector(rVec, R * Math.cos(pitch))
                .addScaledVector(upVec, R * Math.sin(pitch));
            pts.push(p);
        }
        for (let i = 0; i < segments; i++) {
            fanPositions.push(v2.x, v2.y, v2.z);
            fanPositions.push(pts[i].x, pts[i].y, pts[i].z);
            fanPositions.push(pts[i + 1].x, pts[i + 1].y, pts[i + 1].z);
        }

        tibia.arcLine.geometry.setFromPoints(pts);
        tibia.fanMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(fanPositions, 3));
        tibia.fanMesh.geometry.computeVertexNormals();

        // Limit & zero ticks
        const tickPts = [];
        [minRad, 0, maxRad].forEach(theta => {
            const pitch = femurRad - (Math.PI / 2) - theta;
            const p1 = new THREE.Vector3().copy(v2)
                .addScaledVector(rVec, (R - 5) * Math.cos(pitch))
                .addScaledVector(upVec, (R - 5) * Math.sin(pitch));
            const p2 = new THREE.Vector3().copy(v2)
                .addScaledVector(rVec, (R + 5) * Math.cos(pitch))
                .addScaledVector(upVec, (R + 5) * Math.sin(pitch));
            tickPts.push(p1, p2);
        });
        tibia.ticksLine.geometry.setFromPoints(tickPts);

        // Needle & Live Bead
        const curPitch = femurRad - (Math.PI / 2) - curRad;
        const curPos = new THREE.Vector3().copy(v2)
            .addScaledVector(rVec, R * Math.cos(curPitch))
            .addScaledVector(upVec, R * Math.sin(curPitch));
        tibia.needle.geometry.setFromPoints([v2, curPos]);
        tibia.bead.position.copy(curPos);
    }
}

function createCoxaGroup() {
    const group = new THREE.Group();

    // 3D-printed bracket housing (centered at x = 28)
    const bracket = new THREE.Mesh(sharedCoxaBracketGeo, legNeutralMat);
    bracket.position.set(28, 0, 0);
    bracket.userData = { jointType: 'coxa' };
    group.add(bracket);

    // Embedded horizontal femur servo block
    const servoBox = new THREE.Mesh(sharedCoxaServoGeo, hardwareMat);
    servoBox.position.set(30, 0, 0);
    servoBox.userData = { jointType: 'coxa' };
    group.add(servoBox);

    // Output bearing collar at horizontal femur axis (x = 60)
    const ring1 = new THREE.Mesh(sharedCoxaCollarGeo, jointNeutralMat);
    ring1.position.set(60, 0, 0);
    ring1.userData = { jointType: 'coxa' };
    group.add(ring1);

    group.userData = { bracket, servoBox, ring1 };
    return group;
}

function createFemurGroup() {
    const group = new THREE.Group();

    // Inner parallel plate (z = -9.5 mm)
    const plateInner = new THREE.Mesh(sharedFemurPlateGeo, legNeutralMat);
    plateInner.position.set(0, 0, -9.5);
    plateInner.userData = { jointType: 'femur' };
    group.add(plateInner);

    // Outer parallel plate (z = +9.5 mm)
    const plateOuter = new THREE.Mesh(sharedFemurPlateGeo, legNeutralMat);
    plateOuter.position.set(0, 0, 9.5);
    plateOuter.userData = { jointType: 'femur' };
    group.add(plateOuter);

    // Cylindrical standoff rungs (ladder cross-struts)
    const rung1 = new THREE.Mesh(sharedFemurRungGeo, hardwareMat);
    rung1.position.set(35, 0, 0);
    rung1.userData = { jointType: 'femur' };
    group.add(rung1);

    const rung2 = new THREE.Mesh(sharedFemurRungGeo, hardwareMat);
    rung2.position.set(60, 0, 0);
    rung2.userData = { jointType: 'femur' };
    group.add(rung2);

    // Distal knee (tibia) servo block nestled between plates
    const kneeServo = new THREE.Mesh(sharedFemurKneeServoGeo, hardwareMat);
    kneeServo.position.set(88, 0, 0);
    kneeServo.userData = { jointType: 'femur' };
    group.add(kneeServo);

    // Accent ring at hip joint
    const ringHip = new THREE.Mesh(sharedJointRingGeo, jointNeutralMat);
    ringHip.position.set(0, 0, 0);
    ringHip.userData = { jointType: 'femur' };
    group.add(ringHip);

    // Accent ring at knee joint
    const ringKnee = new THREE.Mesh(sharedJointRingGeo, jointNeutralMat);
    ringKnee.position.set(100, 0, 0);
    ringKnee.userData = { jointType: 'femur' };
    group.add(ringKnee);

    group.userData = { plates: [plateInner, plateOuter], rungs: [rung1, rung2], kneeServo, ringHip, ringKnee };
    return group;
}

function createTibiaGroup() {
    const group = new THREE.Group();

    // Curved sickle blade with crown fins & central window
    const blade = new THREE.Mesh(sharedTibiaGeo, legNeutralMat);
    blade.userData = { jointType: 'tibia' };
    group.add(blade);

    // 3D-printed horn clamp block behind knee hub
    const clamp = new THREE.Mesh(sharedTibiaClampGeo, hardwareMat);
    clamp.position.set(-2, -4, 0);
    clamp.userData = { jointType: 'tibia' };
    group.add(clamp);

    // Knee pivot accent collar
    const ringKnee = new THREE.Mesh(sharedJointRingGeo, jointNeutralMat);
    ringKnee.position.set(0, 0, 0);
    ringKnee.userData = { jointType: 'tibia' };
    group.add(ringKnee);

    group.userData = { blade, clamp, ringKnee };
    return group;
}

function update3DLegHighlights(activeLegKey = selectedLegKey, hoveredJoint = currentHoveredJoint) {
    if (!robot3DMeshes || !robot3DMeshes.legs) return;

    // Update chassis mount collar rings on the body mesh (mirroring minimap selection)
    if (robot3DMeshes.mountRings) {
        for (const legKey in robot3DMeshes.mountRings) {
            const ring = robot3DMeshes.mountRings[legKey];
            if (ring) {
                ring.material = (legKey === activeLegKey) ? chassisMountActiveMat : chassisAxisMat;
            }
        }
    }

    for (const legName in robot3DMeshes.legs) {
        const leg = robot3DMeshes.legs[legName];
        if (!leg) continue;

        const isSelected = (legName === activeLegKey);
        const isCoxaActive = isSelected && (hoveredJoint === 'coxa');
        const isFemurActive = isSelected && (hoveredJoint === 'femur');
        const isTibiaActive = isSelected && (hoveredJoint === 'tibia');

        // 1. Coxa Segment
        if (leg.coxaGroup && leg.coxaGroup.userData) {
            const { bracket, servoBox, ring1 } = leg.coxaGroup.userData;
            if (bracket) {
                bracket.material = isSelected ? (isCoxaActive ? legActiveSegmentMat : legSelectedMat) : legNeutralMat;
            }
            if (servoBox) {
                servoBox.material = isSelected ? (isCoxaActive ? jointActiveMat : jointSelectedMat) : hardwareMat;
            }
            if (ring1) {
                ring1.material = isSelected ? ((isCoxaActive || isFemurActive) ? jointActiveMat : jointSelectedMat) : jointNeutralMat;
            }
        }

        // 2. Femur Segment
        if (leg.femurGroup && leg.femurGroup.userData) {
            const { plates, rungs, kneeServo, ringHip, ringKnee } = leg.femurGroup.userData;
            if (plates) {
                const targetMat = isSelected ? (isFemurActive ? legActiveSegmentMat : legSelectedMat) : legNeutralMat;
                plates.forEach((p) => { if (p) p.material = targetMat; });
            }
            if (rungs) {
                const targetRungMat = isSelected ? (isFemurActive ? jointActiveMat : jointSelectedMat) : hardwareMat;
                rungs.forEach((r) => { if (r) r.material = targetRungMat; });
            }
            if (kneeServo) {
                kneeServo.material = isSelected ? ((isFemurActive || isTibiaActive) ? jointActiveMat : jointSelectedMat) : hardwareMat;
            }
            if (ringHip) {
                ringHip.material = isSelected ? (isFemurActive ? jointActiveMat : jointSelectedMat) : jointNeutralMat;
            }
            if (ringKnee) {
                ringKnee.material = isSelected ? ((isFemurActive || isTibiaActive) ? jointActiveMat : jointSelectedMat) : jointNeutralMat;
            }
        }

        // 3. Tibia Segment
        if (leg.tibiaGroup && leg.tibiaGroup.userData) {
            const { blade, clamp, ringKnee } = leg.tibiaGroup.userData;
            if (blade) {
                blade.material = isSelected ? (isTibiaActive ? legActiveSegmentMat : legSelectedMat) : legNeutralMat;
            }
            if (clamp) {
                clamp.material = isSelected ? (isTibiaActive ? jointActiveMat : jointSelectedMat) : hardwareMat;
            }
            if (ringKnee) {
                ringKnee.material = isSelected ? (isTibiaActive ? jointActiveMat : jointSelectedMat) : jointNeutralMat;
            }
        }
    }
}

function update3DLegs(legs3D) {
    if (!scene) return;

    const toVec3 = (p) => new THREE.Vector3(p.x, p.z, p.y); // (X, Z, Y) -> (threeX, threeY, threeZ)

    for (const legName in legs3D) {
        const m = robot3DMeshes.legs[legName];
        if (!m) continue;

        const pts = legs3D[legName];
        const v0 = toVec3(pts.p0); // chassis mount
        const v1 = toVec3(pts.p1); // femur joint
        const v2 = toVec3(pts.p2); // knee joint
        const v3 = toVec3(pts.p3); // foot tip

        const legDef = robotLayout.legs ? robotLayout.legs[legName] : null;
        const baseAngle = (legDef && legDef.base_angle !== undefined) ? legDef.base_angle : 0;
        const coxaServoName = legDef && legDef.coxa ? legDef.coxa.name : `${legName}_coxa`;
        const coxaAngle = (jointAngles[coxaServoName] || 0) * Math.PI / 180;
        const totalAngle = baseAngle + coxaAngle;

        // Normal vector to the vertical bending plane of the leg
        const normal = new THREE.Vector3(-Math.sin(totalAngle), 0, Math.cos(totalAngle)).normalize();

        // 1. Coxa Segment (Bracket box from v0 to v1 in horizontal plane)
        const dir0 = new THREE.Vector3().subVectors(v1, v0);
        if (dir0.length() > 0.001) {
            const axisX0 = dir0.clone().normalize();
            const axisY0 = new THREE.Vector3(0, 1, 0);
            const axisZ0 = new THREE.Vector3().crossVectors(axisX0, axisY0).normalize();
            const mat0 = new THREE.Matrix4().makeBasis(axisX0, axisY0, axisZ0);
            m.coxaGroup.position.copy(v0);
            m.coxaGroup.quaternion.setFromRotationMatrix(mat0);
        }

        // 2. Femur Segment (Dual carbon link from v1 to v2)
        const dir1 = new THREE.Vector3().subVectors(v2, v1);
        if (dir1.length() > 0.001) {
            const axisX1 = dir1.clone().normalize();
            const axisY1 = new THREE.Vector3().crossVectors(normal, axisX1).normalize();
            const axisZ1 = new THREE.Vector3().crossVectors(axisX1, axisY1).normalize();
            const mat1 = new THREE.Matrix4().makeBasis(axisX1, axisY1, axisZ1);
            m.femurGroup.position.copy(v1);
            m.femurGroup.quaternion.setFromRotationMatrix(mat1);
        }

        // 3. Tibia Segment (Curved sickle claw from v2 to v3)
        const dir2 = new THREE.Vector3().subVectors(v3, v2);
        if (dir2.length() > 0.001) {
            // Local tibia geometry has knee at (0, 0, 0) and foot at (0, -130, 0).
            // Vector from foot up to knee is +Y in local space:
            const axisY2 = dir2.clone().negate().normalize();
            const axisX2 = new THREE.Vector3().crossVectors(axisY2, normal).normalize();
            const axisZ2 = new THREE.Vector3().crossVectors(axisX2, axisY2).normalize();
            const mat2 = new THREE.Matrix4().makeBasis(axisX2, axisY2, axisZ2);
            m.tibiaGroup.position.copy(v2);
            m.tibiaGroup.quaternion.setFromRotationMatrix(mat2);
        }

        // 4. Update Engineering Guide Lines & Motion Range Envelope for Active Leg
        if (legName === selectedLegKey) {
            lastSelectedLegKinematics = { v0, v1, v2, v3, normal, totalAngle, baseAngle, legDef };
            updateAxisGuideLines(v0, v1, v2, normal);
            updateMotionRangeArcs();
        }
    }
}

// Reset camera view button
if (btnResetCam) {
    btnResetCam.addEventListener('click', () => {
        if (camera && controls) {
            camera.position.set(380, 280, 380);
            controls.target.set(0, -25, 0);
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

// Toggle 2D Projection Strip
if (btnToggle2D && strip2DWrapper) {
    btnToggle2D.addEventListener('click', () => {
        const isCollapsed = strip2DWrapper.classList.toggle('collapsed');
        btnToggle2D.classList.toggle('active', isCollapsed);
        btnToggle2D.textContent = isCollapsed ? "+ 2D Strip" : "2D Strip";
        setTimeout(resizeCanvases, 40);
    });
}

// Canvas & Viewport Auto-Resize
function resizeCanvases() {
    // 1. Resize Three.js renderer & update aspect ratio
    if (threeContainer && renderer && camera) {
        const w = threeContainer.clientWidth;
        const h = threeContainer.clientHeight;
        if (w > 0 && h > 0) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }
    }

    // 2. Resize 2D Canvases to match their container boxes
    [
        { canvas: topCanvas, card: cardTop },
        { canvas: sideCanvas, card: cardSide },
        { canvas: frontCanvas, card: cardFront }
    ].forEach(({ canvas, card }) => {
        if (canvas && card) {
            const rect = canvas.getBoundingClientRect();
            const w = Math.round(rect.width);
            const h = Math.round(rect.height);
            if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
                canvas.width = w;
                canvas.height = h;
            }
        }
    });

    drawRobot();
}

// Attach ResizeObserver for continuous responsive scaling
if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => {
        resizeCanvases();
    });
    if (threeContainer) ro.observe(threeContainer);
    if (cardTop) ro.observe(cardTop);
}
window.addEventListener('resize', resizeCanvases);

ws.onopen = () => {
    statusElement.textContent = "Connected";
    statusDot.classList.add('connected');
};

ws.onmessage = (event) => {
    try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'layout') {
            robotLayout = msg.data;
            statusElement.textContent = "Live";
            buildThreeJSRobot(robotLayout);
            updateLegJointUI();
            drawRobot();
        } else if (msg.type === 'angles') {
            Object.assign(jointAngles, msg.data);
            updateLegJointUI();
            drawRobot();
        } else if (msg.type === 'state') {
            updateControlUI(msg.data);
        } else if (msg.type === 'order_status') {
            handleOrderStatus(msg.data);
        } else if (msg.type === 'order_result') {
            handleOrderResult(msg.data);
        } else if (msg.type === 'system_stats') {
            updateSystemStatsUI(msg.data);
        }
    } catch (e) {
        console.error("Error processing websocket message:", e);
    }
};

function updateControlUI(state) {
    if (state.is_paused !== undefined) {
        isPaused = state.is_paused;
        if (isPaused) {
            if (btnPauseIcon) btnPauseIcon.textContent = "";
            btnPauseText.textContent = "Resume";
            btnTogglePause.className = "btn btn-paused";
        } else {
            if (btnPauseIcon) btnPauseIcon.textContent = "";
            btnPauseText.textContent = "Pause Animation";
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

// --- TAB SWITCHING ---
if (tabButtons && tabPanes) {
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.tab;
            tabButtons.forEach(b => {
                const isActive = b === btn;
                b.classList.toggle('active', isActive);
                b.setAttribute('aria-selected', isActive ? 'true' : 'false');
            });
            tabPanes.forEach(pane => {
                pane.classList.toggle('active', pane.id === targetId);
            });
        });
    });
}

// --- LEG CONTROL HELPERS & EVENT LISTENERS ---
function getLegServoNames(legKey) {
    if (robotLayout.legs && robotLayout.legs[legKey]) {
        return {
            coxa: robotLayout.legs[legKey].coxa.name,
            femur: robotLayout.legs[legKey].femur.name,
            tibia: robotLayout.legs[legKey].tibia.name,
        };
    }
    return {
        coxa: `${legKey}_coxa`,
        femur: `${legKey}_femur`,
        tibia: `${legKey}_tibia`,
    };
}

function updateMinimapSelection(activeLeg) {
    const targetLeg = activeLeg || selectedLegKey;
    if (!minimapLegBtns || minimapLegBtns.length === 0) return;
    minimapLegBtns.forEach((btn) => {
        const leg = btn.dataset.leg;
        if (leg === targetLeg) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        }
    });
}

function selectLegByKey(legKey) {
    if (!legKey) return;
    selectedLegKey = legKey;
    if (selectLeg) selectLeg.value = legKey;
    if (selectTestLeg) selectTestLeg.value = legKey;
    if (testLegInfoBadge) testLegInfoBadge.textContent = legKey;
    updateMinimapSelection(legKey);
    updateLegJointUI();
    updateCalibrationUI();
    update3DLegHighlights(legKey, currentHoveredJoint);
    drawRobot();
}

function updateLegJointUI() {
    if (!selectLeg) return;
    const legKey = selectLeg.value || selectedLegKey;
    const names = getLegServoNames(legKey);

    updateMinimapSelection(legKey);
    update3DLegHighlights(legKey, currentHoveredJoint);

    if (legInfoBadge) legInfoBadge.textContent = legKey;
    if (testLegInfoBadge) testLegInfoBadge.textContent = legKey;
    if (idJointCoxa) idJointCoxa.textContent = names.coxa;
    if (idJointFemur) idJointFemur.textContent = names.femur;
    if (idJointTibia) idJointTibia.textContent = names.tibia;

    const coxaAngle = jointAngles[names.coxa] !== undefined ? jointAngles[names.coxa] : 0;
    const femurAngle = jointAngles[names.femur] !== undefined ? jointAngles[names.femur] : 0;
    const tibiaAngle = jointAngles[names.tibia] !== undefined ? jointAngles[names.tibia] : 0;

    if (sliderJointCoxa && document.activeElement !== sliderJointCoxa) {
        sliderJointCoxa.value = Math.round(coxaAngle);
        if (valJointCoxa) valJointCoxa.textContent = Math.round(coxaAngle) + "\u00b0";
    }
    if (sliderJointFemur && document.activeElement !== sliderJointFemur) {
        sliderJointFemur.value = Math.round(femurAngle);
        if (valJointFemur) valJointFemur.textContent = Math.round(femurAngle) + "\u00b0";
    }
    if (sliderJointTibia && document.activeElement !== sliderJointTibia) {
        sliderJointTibia.value = Math.round(tibiaAngle);
        if (valJointTibia) valJointTibia.textContent = Math.round(tibiaAngle) + "\u00b0";
    }
    updateCalibrationUI();
}

// Minimap leg button click, keyboard and hover event listeners
if (minimapLegBtns && minimapLegBtns.length > 0) {
    minimapLegBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const leg = btn.dataset.leg;
            if (leg) selectLegByKey(leg);
        });

        btn.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const leg = btn.dataset.leg;
                if (leg) selectLegByKey(leg);
            }
        });

        btn.addEventListener('mouseenter', () => {
            const leg = btn.dataset.leg;
            if (leg) update3DLegHighlights(leg, currentHoveredJoint);
        });

        btn.addEventListener('mouseleave', () => {
            update3DLegHighlights(selectedLegKey, currentHoveredJoint);
        });
    });
}

if (selectLeg) {
    selectLeg.addEventListener('change', () => {
        selectLegByKey(selectLeg.value);
    });
}

if (selectTestLeg) {
    selectTestLeg.addEventListener('change', () => {
        selectLegByKey(selectTestLeg.value);
    });
}

if (sliderJointCoxa) {
    sliderJointCoxa.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (valJointCoxa) valJointCoxa.textContent = Math.round(val) + "\u00b0";
        const names = getLegServoNames(selectLeg.value);
        jointAngles[names.coxa] = val;
        drawRobot();
        sendCommand({ action: "set_joint_angle", servo: names.coxa, angle: val });
    });
}

if (sliderJointFemur) {
    sliderJointFemur.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (valJointFemur) valJointFemur.textContent = Math.round(val) + "\u00b0";
        const names = getLegServoNames(selectLeg.value);
        jointAngles[names.femur] = val;
        drawRobot();
        sendCommand({ action: "set_joint_angle", servo: names.femur, angle: val });
    });
}

if (sliderJointTibia) {
    sliderJointTibia.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (valJointTibia) valJointTibia.textContent = Math.round(val) + "\u00b0";
        const names = getLegServoNames(selectLeg.value);
        jointAngles[names.tibia] = val;
        drawRobot();
        sendCommand({ action: "set_joint_angle", servo: names.tibia, angle: val });
    });
}

if (btnLegStance) {
    btnLegStance.addEventListener('click', () => {
        sendCommand({ action: "stance_leg", leg: selectLeg.value, hold: 5.0 });
        logOrderEntry(`Stance command: ${selectLeg.value}`, 'running');
    });
}

if (btnLegZero) {
    btnLegZero.addEventListener('click', () => {
        const legKey = selectLeg.value;
        const names = getLegServoNames(legKey);
        jointAngles[names.coxa] = 0;
        jointAngles[names.femur] = 0;
        jointAngles[names.tibia] = 0;
        updateLegJointUI();
        drawRobot();
        sendCommand({ action: "set_leg_joints", leg: legKey, coxa: 0, femur: 0, tibia: 0 });
        logOrderEntry(`Zeroed joints (0°): ${legKey}`, 'success');
    });
}

if (btnLegRelax) {
    btnLegRelax.addEventListener('click', () => {
        sendCommand({ action: "relax_leg", leg: selectLeg.value });
        logOrderEntry(`Relax leg: ${selectLeg.value}`, 'running');
    });
}

// ============================================================================
// SERVO CALIBRATION & DUAL-RANGE LIMITS LOGIC (Unified Direct Drive & Trim)
// ============================================================================

function updateDualRangeHighlight(joint, minVal, maxVal) {
    const highlight = document.getElementById(`highlight-${joint}`);
    if (!highlight) return;
    const totalMin = -90;
    const totalMax = 90;
    const totalSpan = totalMax - totalMin;

    const leftPercent = Math.max(0, Math.min(100, ((minVal - totalMin) / totalSpan) * 100));
    const rightPercent = Math.max(0, Math.min(100, ((maxVal - totalMin) / totalSpan) * 100));
    const widthPercent = Math.max(0, rightPercent - leftPercent);

    highlight.style.left = `${leftPercent}%`;
    highlight.style.width = `${widthPercent}%`;
}

function bindDualRangeSlider(joint) {
    const minInput = document.getElementById(`range-min-${joint}`);
    const maxInput = document.getElementById(`range-max-${joint}`);
    const lblMin = document.getElementById(`lbl-min-${joint}`);
    const lblMax = document.getElementById(`lbl-max-${joint}`);
    const tickMin = document.getElementById(`tick-min-${joint}`);
    const tickMax = document.getElementById(`tick-max-${joint}`);
    const directSlider = document.getElementById(`slider-joint-${joint}`);

    if (!minInput || !maxInput) return;

    function handleInput(e) {
        let minVal = parseInt(minInput.value, 10);
        let maxVal = parseInt(maxInput.value, 10);

        if (minVal >= maxVal) {
            if (e.target === minInput) {
                minVal = maxVal - 1;
                minInput.value = minVal;
            } else {
                maxVal = minVal + 1;
                maxInput.value = maxVal;
            }
        }

        if (lblMin) lblMin.textContent = `${minVal}°`;
        if (lblMax) lblMax.textContent = `${maxVal > 0 ? '+' : ''}${maxVal}°`;
        if (tickMin) tickMin.textContent = `${minVal}°`;
        if (tickMax) tickMax.textContent = `${maxVal > 0 ? '+' : ''}${maxVal}°`;

        updateDualRangeHighlight(joint, minVal, maxVal);

        if (directSlider) {
            directSlider.min = minVal;
            directSlider.max = maxVal;
        }

        applyLiveLimits(joint, minVal, maxVal);
    }

    minInput.addEventListener('input', handleInput);
    maxInput.addEventListener('input', handleInput);
}

async function fetchCalibrationData() {
    try {
        const resp = await fetch('/api/v1/calibration');
        if (resp.ok) {
            const data = await resp.json();
            calibrationData = data.servos || {};
            updateCalibrationUI();
        }
    } catch (e) {
        console.warn('[Calibration] Failed to fetch calibration data:', e);
    }
}

function updateCalibrationUI() {
    if (!selectLeg) return;
    const legKey = selectLeg.value || selectedLegKey;
    const names = getLegServoNames(legKey);
    const joints = ['coxa', 'femur', 'tibia'];

    joints.forEach((j) => {
        const sName = names[j];
        const sData = calibrationData[sName] || {
            name: sName,
            channel: '-',
            board_address: 0x40,
            center_offset_pulse: 0,
            orientation: 1,
            min_angle: j === 'tibia' ? -60 : -45,
            max_angle: j === 'tibia' ? 60 : 45,
            is_overridden: false,
        };

        const idEl = document.getElementById(`id-joint-${j}`);
        if (idEl) {
            const chStr = sData.channel !== undefined ? `Ch ${sData.channel}` : '';
            const addrStr = sData.board_address ? ` @ 0x${sData.board_address.toString(16)}` : '';
            idEl.textContent = `${sName} • ${chStr}${addrStr}`;
        }

        // Trim readout, slider & bipolar fill
        const offset = sData.center_offset_pulse || 0;
        const degEst = (offset / 10.0).toFixed(1);
        const sign = offset > 0 ? '+' : '';
        const readoutEl = document.getElementById(`calib-val-trim-${j}`);
        if (readoutEl) {
            readoutEl.textContent = `${sign}${offset} µs (~ ${sign}${degEst}°)`;
        }

        const sliderTrimEl = document.getElementById(`slider-trim-${j}`);
        if (sliderTrimEl && document.activeElement !== sliderTrimEl) {
            sliderTrimEl.value = offset;
        }
        updateTrimSliderFill(j, offset);

        // Invert checkbox
        const chkEl = document.getElementById(`calib-invert-${j}`);
        const chkText = document.getElementById(`calib-invert-text-${j}`);
        const isInv = sData.orientation === -1;
        if (chkEl) chkEl.checked = isInv;
        if (chkText) chkText.textContent = isInv ? 'Inverted (-1)' : 'Normal (+1)';

        // Dual-Range Limit Slider & Readouts
        const minVal = sData.min_angle !== undefined ? sData.min_angle : (j === 'tibia' ? -60 : -45);
        const maxVal = sData.max_angle !== undefined ? sData.max_angle : (j === 'tibia' ? 60 : 45);

        const rangeMinEl = document.getElementById(`range-min-${j}`);
        const rangeMaxEl = document.getElementById(`range-max-${j}`);
        if (rangeMinEl && document.activeElement !== rangeMinEl) rangeMinEl.value = minVal;
        if (rangeMaxEl && document.activeElement !== rangeMaxEl) rangeMaxEl.value = maxVal;

        const lblMin = document.getElementById(`lbl-min-${j}`);
        const lblMax = document.getElementById(`lbl-max-${j}`);
        if (lblMin) lblMin.textContent = `${minVal}°`;
        if (lblMax) lblMax.textContent = `${maxVal > 0 ? '+' : ''}${maxVal}°`;

        updateDualRangeHighlight(j, minVal, maxVal);

        // Update direct drive slider bounds and tick marks
        const directSlider = document.getElementById(`slider-joint-${j}`);
        if (directSlider) {
            directSlider.min = minVal;
            directSlider.max = maxVal;
        }
        const tickMin = document.getElementById(`tick-min-${j}`);
        const tickMax = document.getElementById(`tick-max-${j}`);
        if (tickMin) tickMin.textContent = `${minVal}°`;
        if (tickMax) tickMax.textContent = `${maxVal > 0 ? '+' : ''}${maxVal}°`;
    });
}

function applyLiveLimits(jointType, minAngle, maxAngle) {
    const legKey = selectLeg ? selectLeg.value : selectedLegKey;
    const names = getLegServoNames(legKey);
    const sName = names[jointType];

    if (!calibrationData[sName]) {
        calibrationData[sName] = {
            name: sName,
            center_offset_pulse: 0,
            orientation: 1,
            min_angle: minAngle,
            max_angle: maxAngle,
            is_overridden: true,
        };
    } else {
        calibrationData[sName].min_angle = minAngle;
        calibrationData[sName].max_angle = maxAngle;
        calibrationData[sName].is_overridden = true;
    }

    sendCommand({
        action: "calibrate_trim",
        servo: sName,
        min_angle: minAngle,
        max_angle: maxAngle,
        offset: calibrationData[sName].center_offset_pulse || 0,
        orientation: calibrationData[sName].orientation || 1,
    });

    showCalibFeedback(`Auto-saved ${sName} limits: [${minAngle}°, ${maxAngle}°]`, 'success');
}

function updateTrimSliderFill(jointType, offset) {
    const fillEl = document.getElementById(`trim-fill-${jointType}`);
    if (!fillEl) return;
    const maxBound = 600;
    const clamped = Math.max(-maxBound, Math.min(maxBound, offset));
    const pct = (Math.abs(clamped) / maxBound) * 50;
    if (clamped >= 0) {
        fillEl.style.left = '50%';
        fillEl.style.width = `${pct}%`;
    } else {
        fillEl.style.left = `${50 - pct}%`;
        fillEl.style.width = `${pct}%`;
    }
}

let lastTrimSentTime = 0;

function applyLiveTrimAbsolute(jointType, targetOffset, showToast = true) {
    const legKey = selectLeg ? selectLeg.value : selectedLegKey;
    const names = getLegServoNames(legKey);
    const sName = names[jointType];

    if (!calibrationData[sName]) {
        calibrationData[sName] = {
            name: sName,
            center_offset_pulse: 0,
            orientation: 1,
            min_angle: jointType === 'tibia' ? -60 : -45,
            max_angle: jointType === 'tibia' ? 60 : 45,
            is_overridden: true,
        };
    }

    const clampedOffset = Math.max(-1000, Math.min(1000, targetOffset));
    calibrationData[sName].center_offset_pulse = clampedOffset;
    calibrationData[sName].is_overridden = true;

    // Immediately update UI
    const degEst = (clampedOffset / 10.0).toFixed(1);
    const sign = clampedOffset > 0 ? '+' : '';
    const readoutEl = document.getElementById(`calib-val-trim-${jointType}`);
    if (readoutEl) {
        readoutEl.textContent = `${sign}${clampedOffset} µs (~ ${sign}${degEst}°)`;
    }

    const sliderEl = document.getElementById(`slider-trim-${jointType}`);
    if (sliderEl && document.activeElement !== sliderEl) {
        sliderEl.value = clampedOffset;
    }
    updateTrimSliderFill(jointType, clampedOffset);

    // Auto-save via WebSocket calibrate_trim with all calibrated params
    sendCommand({
        action: "calibrate_trim",
        servo: sName,
        offset: clampedOffset,
        orientation: calibrationData[sName].orientation || 1,
        min_angle: calibrationData[sName].min_angle,
        max_angle: calibrationData[sName].max_angle,
        angle: 0.0,
    });

    if (showToast) {
        showCalibFeedback(`Auto-saved ${sName} trim: ${sign}${clampedOffset} µs`, 'success');
    }
}

function applyLiveTrimStep(jointType, delta) {
    const legKey = selectLeg ? selectLeg.value : selectedLegKey;
    const names = getLegServoNames(legKey);
    const sName = names[jointType];
    const curOffset = (calibrationData[sName] && calibrationData[sName].center_offset_pulse !== undefined)
        ? calibrationData[sName].center_offset_pulse
        : 0;
    const newOffset = delta === 0 ? 0 : (curOffset + delta);
    applyLiveTrimAbsolute(jointType, newOffset, true);
}

function applyLiveOrientation(jointType, isInverted) {
    const legKey = selectLeg ? selectLeg.value : selectedLegKey;
    const names = getLegServoNames(legKey);
    const sName = names[jointType];

    if (!calibrationData[sName]) {
        calibrationData[sName] = {
            name: sName,
            center_offset_pulse: 0,
            orientation: 1,
            min_angle: jointType === 'tibia' ? -60 : -45,
            max_angle: jointType === 'tibia' ? 60 : 45,
            is_overridden: true,
        };
    }

    const newOrient = isInverted ? -1 : 1;
    calibrationData[sName].orientation = newOrient;
    calibrationData[sName].is_overridden = true;

    const chkText = document.getElementById(`calib-invert-text-${jointType}`);
    if (chkText) chkText.textContent = isInverted ? 'Inverted (-1)' : 'Normal (+1)';

    sendCommand({
        action: "calibrate_trim",
        servo: sName,
        orientation: newOrient,
        offset: calibrationData[sName].center_offset_pulse || 0,
        min_angle: calibrationData[sName].min_angle,
        max_angle: calibrationData[sName].max_angle,
        angle: 0.0,
    });

    showCalibFeedback(`Auto-saved ${sName} orientation: ${isInverted ? 'Inverted (-1)' : 'Normal (+1)'}`, 'success');
}

function alignLegToReferencePose() {
    const legKey = selectLeg ? selectLeg.value : selectedLegKey;
    const names = getLegServoNames(legKey);

    jointAngles[names.coxa] = 0.0;
    jointAngles[names.femur] = 0.0;
    jointAngles[names.tibia] = 0.0;
    updateLegJointUI();
    drawRobot();

    sendCommand({
        action: "set_leg_joints",
        leg: legKey,
        coxa: 0.0,
        femur: 0.0,
        tibia: 0.0,
        isolate: true,
    });

    showCalibFeedback(`${legKey} aligned to 0° reference pose. Other legs relaxed for safety.`, 'success');
}

async function resetLegCalibration() {
    const legKey = selectLeg ? selectLeg.value : selectedLegKey;
    if (!confirm(`Are you sure you want to revert all calibration overrides for ${legKey} to factory defaults?`)) {
        return;
    }

    try {
        if (btnCalibResetLeg) {
            btnCalibResetLeg.disabled = true;
            btnCalibResetLeg.textContent = 'Resetting...';
        }

        const resp = await fetch('/api/v1/calibration/reset', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leg: legKey }),
        });

        if (resp.ok) {
            showCalibFeedback(`Reverted ${legKey} to config.yaml factory settings.`, 'success');
            await fetchCalibrationData();
        } else {
            showCalibFeedback(`Error resetting calibration: ${resp.statusText}`, 'error');
        }
    } catch (e) {
        showCalibFeedback(`Network error resetting calibration: ${e}`, 'error');
    } finally {
        if (btnCalibResetLeg) {
            btnCalibResetLeg.disabled = false;
            btnCalibResetLeg.textContent = 'Reset Leg';
        }
    }
}

function testJointRange(jointType) {
    const legKey = selectLeg ? selectLeg.value : selectedLegKey;
    const names = getLegServoNames(legKey);
    const sName = names[jointType];
    const sData = calibrationData[sName] || {};
    const minVal = sData.min_angle !== undefined ? sData.min_angle : (jointType === 'tibia' ? -60 : -45);
    const maxVal = sData.max_angle !== undefined ? sData.max_angle : (jointType === 'tibia' ? 60 : 45);

    sendCommand({
        action: "sweep_joint",
        servo: sName,
        min_angle: minVal,
        max_angle: maxVal,
    });
    showCalibFeedback(`Sweeping ${sName} range [${minVal}°, ${maxVal}°]...`, 'success');
}

function runCollisionSweep(jointType) {
    const leg = selectTestLeg ? selectTestLeg.value : selectedLegKey;
    const names = getLegServoNames(leg);
    const sName = names[jointType];
    const sData = calibrationData[sName] || {};
    const minVal = sData.min_angle !== undefined ? sData.min_angle : (jointType === 'coxa' ? -45 : -90);
    const maxVal = sData.max_angle !== undefined ? sData.max_angle : (jointType === 'coxa' ? 45 : 90);

    sendCommand({
        action: "sweep_joint",
        servo: sName,
        min_angle: minVal,
        max_angle: maxVal,
    });
    logOrderEntry(`Collision Sweep ${jointType.toUpperCase()}: ${sName} [${minVal}°, ${maxVal}°]`, 'running');
}

// Floating Modal / Toast Notifications (Zero-shift overlay with 5-second fadeout)
let activeToastTimeout = null;
let activeToastFadeTimeout = null;

function showToastModal(msg, type = 'success', duration = 5000) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    // Reuse existing toast for smooth in-place update or create a new one
    let toast = container.querySelector('.floating-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = `floating-toast ${type}`;
        toast.textContent = msg;
        toast.title = 'Click to dismiss';
        toast.addEventListener('click', () => dismissToast(toast));
        container.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });
    } else {
        toast.className = `floating-toast ${type} show`;
        toast.textContent = msg;
    }

    if (activeToastTimeout) clearTimeout(activeToastTimeout);
    if (activeToastFadeTimeout) clearTimeout(activeToastFadeTimeout);

    activeToastTimeout = setTimeout(() => {
        dismissToast(toast);
    }, duration);
}

function dismissToast(toast) {
    if (!toast || !toast.parentElement) return;
    toast.classList.remove('show');
    toast.classList.add('fade-out');
    activeToastFadeTimeout = setTimeout(() => {
        if (toast && toast.parentElement) {
            toast.remove();
        }
    }, 380);
}

function showCalibFeedback(msg, type = 'success') {
    showToastModal(msg, type, 5000);
}

// Align Reference Pose Button
if (btnCalibAlignRef) {
    btnCalibAlignRef.addEventListener('click', alignLegToReferencePose);
}

// Reset Leg Button
if (btnCalibResetLeg) {
    btnCalibResetLeg.addEventListener('click', resetLegCalibration);
}

// Bind Dual Range Sliders for Coxa, Femur, Tibia
['coxa', 'femur', 'tibia'].forEach(bindDualRangeSlider);

// Trim Sliders & Nudge Listeners (Coxa, Femur, Tibia)
['coxa', 'femur', 'tibia'].forEach((j) => {
    const slider = document.getElementById(`slider-trim-${j}`);
    if (!slider) return;

    slider.addEventListener('input', (e) => {
        let val = parseInt(e.target.value, 10);
        // Soft snap to 0 within +/- 2 us
        if (Math.abs(val) <= 2) {
            val = 0;
            slider.value = 0;
        }

        const now = Date.now();
        if (now - lastTrimSentTime > 40) {
            applyLiveTrimAbsolute(j, val, false);
            lastTrimSentTime = now;
        } else {
            const degEst = (val / 10.0).toFixed(1);
            const sign = val > 0 ? '+' : '';
            const readoutEl = document.getElementById(`calib-val-trim-${j}`);
            if (readoutEl) readoutEl.textContent = `${sign}${val} µs (~ ${sign}${degEst}°)`;
            updateTrimSliderFill(j, val);
        }
    });

    slider.addEventListener('change', (e) => {
        let val = parseInt(e.target.value, 10);
        if (Math.abs(val) <= 2) {
            val = 0;
            slider.value = 0;
        }
        applyLiveTrimAbsolute(j, val, true);
    });

    // Double-click slider thumb to reset to 0
    slider.addEventListener('dblclick', () => {
        applyLiveTrimAbsolute(j, 0, true);
    });
});

// Trim Nudge Buttons (-1µs, +1µs, Shift+Click = 10µs) & Click-to-Reset Badge
document.addEventListener('click', (e) => {
    const nudgeBtn = e.target.closest('.btn-trim-nudge');
    if (nudgeBtn) {
        const joint = nudgeBtn.dataset.joint;
        let step = parseInt(nudgeBtn.dataset.step, 10);
        if (e.shiftKey) {
            step *= 10;
        }
        if (joint && !isNaN(step)) {
            applyLiveTrimStep(joint, step);
        }
        return;
    }

    const readoutBtn = e.target.closest('.trim-readout-btn');
    if (readoutBtn) {
        const id = readoutBtn.id; // calib-val-trim-joint
        const joint = id.replace('calib-val-trim-', '');
        if (joint) {
            applyLiveTrimAbsolute(joint, 0, true);
        }
        return;
    }

    const btn = e.target.closest('.btn-trim-step');
    if (btn) {
        const joint = btn.dataset.joint;
        const step = parseInt(btn.dataset.step, 10);
        if (joint && !isNaN(step)) {
            applyLiveTrimStep(joint, step);
        }
    }
});

// Direction Invert Checkbox Listeners
['coxa', 'femur', 'tibia'].forEach((j) => {
    const chk = document.getElementById(`calib-invert-${j}`);
    if (chk) {
        chk.addEventListener('change', () => applyLiveOrientation(j, chk.checked));
    }
});

// Range Sweep Buttons in Leg Control Cards
document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-calib-sweep');
    if (!btn) return;
    const joint = btn.dataset.joint;
    if (joint) {
        testJointRange(joint);
    }
});

// Joint Card Hover Events -> Dynamic Glow on corresponding 3D limb segment
document.querySelectorAll('.joint-control-card').forEach((card) => {
    let jointType = null;
    if (card.classList.contains('joint-coxa')) jointType = 'coxa';
    else if (card.classList.contains('joint-femur')) jointType = 'femur';
    else if (card.classList.contains('joint-tibia')) jointType = 'tibia';

    if (jointType) {
        card.addEventListener('mouseenter', () => {
            currentHoveredJoint = jointType;
            update3DLegHighlights(selectedLegKey, currentHoveredJoint);
            updateMotionRangeArcs();
            drawRobot();
        });
        card.addEventListener('mouseleave', () => {
            if (currentHoveredJoint === jointType) {
                currentHoveredJoint = null;
                update3DLegHighlights(selectedLegKey, null);
                updateMotionRangeArcs();
                drawRobot();
            }
        });
    }
});

// Test sweep buttons hover events -> 3D limb segment glow & range arc
['coxa', 'femur', 'tibia'].forEach((j) => {
    const btn = document.getElementById(`btn-sweep-${j}`);
    if (btn) {
        btn.addEventListener('mouseenter', () => {
            currentHoveredJoint = j;
            update3DLegHighlights(selectTestLeg ? selectTestLeg.value : selectedLegKey, currentHoveredJoint);
            updateMotionRangeArcs();
            drawRobot();
        });
        btn.addEventListener('mouseleave', () => {
            if (currentHoveredJoint === j) {
                currentHoveredJoint = null;
                update3DLegHighlights(selectTestLeg ? selectTestLeg.value : selectedLegKey, null);
                updateMotionRangeArcs();
                drawRobot();
            }
        });
    }
});

// Initial calibration data fetch on page load
fetchCalibrationData();

// --- TESTS & DIAGNOSTICS EVENT LISTENERS ---
if (sliderTestCycles) {
    sliderTestCycles.addEventListener('input', (e) => {
        if (valTestCycles) valTestCycles.textContent = e.target.value;
    });
}

if (btnRunStepTest) {
    btnRunStepTest.addEventListener('click', () => {
        const leg = selectTestLeg ? selectTestLeg.value : selectedLegKey;
        const cycles = parseInt(sliderTestCycles ? sliderTestCycles.value : 5, 10) || 5;
        btnRunStepTest.disabled = true;
        btnRunStepTest.textContent = 'Step cycle running...';
        sendCommand({ action: "test_leg", leg: leg, cycles: cycles, stride: 36.0, lift: 30.0 });
        logOrderEntry(`Test run: ${leg} (${cycles} cycles)`, 'running');
        setTimeout(() => {
            btnRunStepTest.disabled = false;
            btnRunStepTest.textContent = 'Start Step Cycle';
        }, cycles * 1300 + 1000);
    });
}

if (btnSweepCoxa) {
    btnSweepCoxa.addEventListener('click', () => runCollisionSweep('coxa'));
}

if (btnSweepFemur) {
    btnSweepFemur.addEventListener('click', () => runCollisionSweep('femur'));
}

if (btnSweepTibia) {
    btnSweepTibia.addEventListener('click', () => runCollisionSweep('tibia'));
}

if (btnAllStance) {
    btnAllStance.addEventListener('click', () => {
        sendCommand({ action: "set_pose", height: -80, roll: 0, pitch: 0 });
        logOrderEntry("All legs -> Neutral Stance", 'success');
    });
}

if (btnRelaxAll) {
    btnRelaxAll.addEventListener('click', () => {
        sendCommand({ action: "relax_all" });
        logOrderEntry("All 18 servos relaxed (Relax All)", 'success');
    });
}

// Order log and status helpers
function logOrderEntry(text, statusClass) {
    if (!orderLog) return;
    const entry = document.createElement('div');
    entry.className = `order-log-entry ${statusClass || ''}`;
    const timeStr = new Date().toLocaleTimeString();
    entry.innerHTML = `<span>[${timeStr}] ${text}</span>`;
    orderLog.prepend(entry);
    while (orderLog.children.length > 20) {
        orderLog.removeChild(orderLog.lastChild);
    }
}

function handleOrderStatus(data) {
    if (orderStatusBadge) {
        orderStatusBadge.textContent = `${data.status.toUpperCase()}: ${data.action}`;
        orderStatusBadge.className = 'badge-status-running';
    }
    logOrderEntry(`Order ${data.order_id} (${data.action}): ${data.status}`, 'running');
}

function handleOrderResult(data) {
    if (orderStatusBadge) {
        orderStatusBadge.textContent = data.status === 'completed' ? 'Ready' : 'Failed';
        orderStatusBadge.className = data.status === 'completed' ? 'badge-status-idle' : 'badge-status-running';
    }
    const duration = data.duration_ms ? ` (${Math.round(data.duration_ms)}ms)` : '';
    const statusClass = data.status === 'completed' ? 'success' : 'error';
    logOrderEntry(`Order ${data.order_id} (${data.action}): ${data.message || data.status}${duration}`, statusClass);
}

// Emergency Stop (E-Stop)
if (btnEstop) {
    btnEstop.addEventListener('click', () => {
        sendCommand({ action: "emergency_stop", priority: 99 });
        btnEstop.textContent = 'STOPPED';
        setTimeout(() => {
            btnEstop.textContent = 'E-Stop';
        }, 3000);
    });
}

// Restart Server Handler
if (btnRestartServer) {
    btnRestartServer.addEventListener('click', async () => {
        if (btnRestartServer.classList.contains('restarting')) return;

        btnRestartServer.classList.add('restarting');
        if (restartText) restartText.textContent = "Restarting...";
        logOrderEntry("Server restart initiated...", "running");

        try {
            const resp = await fetch('/api/v1/server/restart', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (resp.ok) {
                logOrderEntry("Restart command accepted. Reconnecting...", "running");
            }
        } catch (e) {
            console.warn("Restart request sent (server shutting down):", e);
        }

        // Poll for server to return online
        let attempts = 0;
        const maxAttempts = 25; // 25 * 800ms = 20s
        const pollInterval = setInterval(async () => {
            attempts++;
            try {
                const res = await fetch('/api/v1/status');
                if (res.ok) {
                    clearInterval(pollInterval);
                    btnRestartServer.classList.remove('restarting');
                    if (restartText) restartText.textContent = "Restarted";
                    logOrderEntry("Server back online!", "success");
                    // Re-trigger layout and state fetch
                    fetch('/api/v1/robot')
                        .then(r => r.json())
                        .then(data => {
                            if (data && data.legs) {
                                robotLayout = data;
                                buildThreeJSRobot(robotLayout);
                                drawRobot();
                            }
                        })
                        .catch(() => {});
                    setTimeout(() => {
                        if (restartText) restartText.textContent = "Restart";
                    }, 2500);
                }
            } catch (err) {
                if (attempts >= maxAttempts) {
                    clearInterval(pollInterval);
                    btnRestartServer.classList.remove('restarting');
                    if (restartText) restartText.textContent = "Restart";
                    logOrderEntry("Restart poll timeout. Check connection.", "error");
                }
            }
        }, 800);
    });
}

// Shutdown Robot Handler
if (btnShutdownRobot) {
    btnShutdownRobot.addEventListener('click', async () => {
        if (btnShutdownRobot.classList.contains('shutting-down')) return;

        const confirmed = window.confirm(
            "Shutdown Lasius Robot?\n\n" +
            "This will safely relax all 18 servos and power off the Raspberry Pi.\n" +
            "You will need to power-cycle the hardware switch to start it again."
        );
        if (!confirmed) return;

        btnShutdownRobot.classList.add('shutting-down');
        if (shutdownText) shutdownText.textContent = "Shutting down...";
        logOrderEntry("Robot shutdown initiated. Servos relaxing & Pi powering off...", "warn");

        try {
            await fetch('/api/v1/server/shutdown', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
        } catch (e) {
            console.warn("Shutdown request sent (server powering down):", e);
        }

        // Show persistent shutdown modal after 1.5 seconds
        setTimeout(() => {
            const overlay = document.createElement('div');
            overlay.className = 'shutdown-overlay';
            overlay.innerHTML = `
                <div class="shutdown-dialog">
                    <h2>Robot Powered Down</h2>
                    <p>All 18 servos are safely relaxed and the Raspberry Pi is powered off.<br><br>It is now safe to switch off battery power.</p>
                </div>
            `;
            document.body.appendChild(overlay);
        }, 1500);
    });
}

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

    // Always update all 3 2D Canvas views (ortho strip)
    drawTopView(legs3D);
    drawSideView(legs3D);
    drawFrontView(legs3D);
}

function drawTopView(legs3D) {
    const width = topCanvas.width;
    const height = topCanvas.height;
    if (width === 0 || height === 0) return;
    topCtx.clearRect(0, 0, width, height);

    // Orientation indicator
    topCtx.fillStyle = '#6b7280';
    topCtx.font = '10px sans-serif';
    topCtx.fillText("TOP", 12, 16);

    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width / 680, height / 580);

    // Draw robot body (biomimetic chassis matching minimap & 3D view)
    const hullPts = getChassisHullContour();
    topCtx.beginPath();
    for (let i = 0; i < hullPts.length; i++) {
        const x = centerX + hullPts[i].x * scale;
        const y = centerY + hullPts[i].y * scale;
        if (i === 0) topCtx.moveTo(x, y); else topCtx.lineTo(x, y);
    }
    topCtx.closePath();
    topCtx.fillStyle = '#222432';
    topCtx.fill();
    topCtx.strokeStyle = '#3e425a';
    topCtx.lineWidth = 2.2;
    topCtx.stroke();

    // Inner electronics bay deck
    const bayPts = getChassisBayContour();
    topCtx.beginPath();
    for (let i = 0; i < bayPts.length; i++) {
        const x = centerX + bayPts[i].x * scale;
        const y = centerY + bayPts[i].y * scale;
        if (i === 0) topCtx.moveTo(x, y); else topCtx.lineTo(x, y);
    }
    topCtx.closePath();
    topCtx.fillStyle = '#161722';
    topCtx.fill();
    topCtx.strokeStyle = '#2d3044';
    topCtx.lineWidth = 1;
    topCtx.stroke();

    // Longitudinal center guideline
    topCtx.beginPath();
    topCtx.setLineDash([4, 4]);
    topCtx.moveTo(centerX, centerY - 80 * scale);
    topCtx.lineTo(centerX, centerY + 80 * scale);
    topCtx.strokeStyle = '#2d3044';
    topCtx.stroke();
    topCtx.setLineDash([]);

    // Front direction indicator arrow (pointing forward/up: -Y)
    topCtx.beginPath();
    topCtx.moveTo(centerX - 8 * scale, centerY - 84 * scale);
    topCtx.lineTo(centerX + 8 * scale, centerY - 84 * scale);
    topCtx.lineTo(centerX, centerY - 96 * scale);
    topCtx.closePath();
    topCtx.fillStyle = '#3498db';
    topCtx.fill();

    // Headlight LEDs (Cyan)
    topCtx.fillStyle = '#00d2d3';
    topCtx.beginPath();
    topCtx.arc(centerX - 16 * scale, centerY - 106 * scale, 2.8 * scale, 0, Math.PI * 2);
    topCtx.arc(centerX + 16 * scale, centerY - 106 * scale, 2.8 * scale, 0, Math.PI * 2);
    topCtx.fill();

    // Draw each leg in top-down view (X, Y)
    // Draw unselected legs first, then selected leg on top
    const legNames = Object.keys(legs3D);
    legNames.sort((a, b) => (a === selectedLegKey ? 1 : b === selectedLegKey ? -1 : 0));

    topViewLegPoints = {};
    for (const legName of legNames) {
        const pts = legs3D[legName];
        if (!pts) continue;
        const isSelected = (legName === selectedLegKey);
        const c0 = { x: centerX + pts.p0.x * scale, y: centerY + pts.p0.y * scale };
        const c1 = { x: centerX + pts.p1.x * scale, y: centerY + pts.p1.y * scale };
        const c2 = { x: centerX + pts.p2.x * scale, y: centerY + pts.p2.y * scale };
        const c3 = { x: centerX + pts.p3.x * scale, y: centerY + pts.p3.y * scale };
        topViewLegPoints[legName] = { c0, c1, c2, c3 };

        const isCoxaActive = isSelected && (currentHoveredJoint === 'coxa');
        const isFemurActive = isSelected && (currentHoveredJoint === 'femur');
        const isTibiaActive = isSelected && (currentHoveredJoint === 'tibia');

        // Coxa segment
        topCtx.beginPath();
        topCtx.moveTo(c0.x, c0.y);
        topCtx.lineTo(c1.x, c1.y);
        topCtx.strokeStyle = isSelected ? (isCoxaActive ? '#38bdf8' : '#2980b9') : '#383a4c';
        topCtx.lineWidth = isSelected ? (isCoxaActive ? 4.5 : 3.5) : 2.0;
        topCtx.stroke();

        // Femur segment
        topCtx.beginPath();
        topCtx.moveTo(c1.x, c1.y);
        topCtx.lineTo(c2.x, c2.y);
        topCtx.strokeStyle = isSelected ? (isFemurActive ? '#38bdf8' : '#2980b9') : '#383a4c';
        topCtx.lineWidth = isSelected ? (isFemurActive ? 4.5 : 3.5) : 2.0;
        topCtx.stroke();

        // Tibia segment
        topCtx.beginPath();
        topCtx.moveTo(c2.x, c2.y);
        topCtx.lineTo(c3.x, c3.y);
        topCtx.strokeStyle = isSelected ? (isTibiaActive ? '#38bdf8' : '#2980b9') : '#383a4c';
        topCtx.lineWidth = isSelected ? (isTibiaActive ? 4 : 3) : 1.8;
        topCtx.stroke();

        // Chassis mount axis point (c0) - active leg gets Minimap Blue glow #38bdf8
        topCtx.fillStyle = isSelected ? '#38bdf8' : '#d0d4de';
        topCtx.beginPath();
        topCtx.arc(c0.x, c0.y, isSelected ? 4.5 : 3.5, 0, 2 * Math.PI);
        topCtx.fill();
        if (isSelected) {
            topCtx.strokeStyle = '#0284c7';
            topCtx.lineWidth = 1.5;
            topCtx.stroke();
        }

        // Joint points
        topCtx.fillStyle = isSelected ? '#1b3b5c' : '#282936';
        topCtx.beginPath(); topCtx.arc(c1.x, c1.y, 3, 0, 2 * Math.PI); topCtx.fill();
        topCtx.beginPath(); topCtx.arc(c2.x, c2.y, 3, 0, 2 * Math.PI); topCtx.fill();
        // Foot tip circle completely removed per user request
    }
}

function drawSideView(legs3D) {
    const width = sideCanvas.width;
    const height = sideCanvas.height;
    if (width === 0 || height === 0) return;
    sideCtx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const scale = Math.min(width / 580, height / 290);
    const bodyCanvasY = height * 0.36;

    // Ground level is at Z = -80 mm in robot coordinates
    const groundCanvasY = bodyCanvasY + 80 * scale;

    // 1. Ground Plane (Line with Hatching)
    sideCtx.strokeStyle = '#3e3e52';
    sideCtx.lineWidth = 1.5;
    sideCtx.beginPath();
    sideCtx.moveTo(15, groundCanvasY);
    sideCtx.lineTo(width - 15, groundCanvasY);
    sideCtx.stroke();

    // Ground hatches
    sideCtx.strokeStyle = '#2d2d3d';
    sideCtx.lineWidth = 1;
    for (let x = 20; x < width - 20; x += 16) {
        sideCtx.beginPath();
        sideCtx.moveTo(x, groundCanvasY);
        sideCtx.lineTo(x - 8, groundCanvasY + 8);
        sideCtx.stroke();
    }

    // Direction & Level indicators
    sideCtx.fillStyle = '#6b7280';
    sideCtx.font = '10px sans-serif';
    sideCtx.fillText("FRONT", 12, 16);
    sideCtx.fillText("REAR", width - 44, 16);
    sideCtx.fillText("Ground (-80mm)", 12, groundCanvasY + 14);

    // 2. Draw Left (Far/Background) Legs with dimmed opacity (0.40)
    sideViewLegPoints = {};
    for (const legName in legs3D) {
        if (legName.startsWith('left_')) {
            const isSelected = (legName === selectedLegKey);
            drawLegSide(sideCtx, legs3D[legName], centerX, bodyCanvasY, scale, isSelected ? 0.95 : 0.40, isSelected, legName);
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
            const isSelected = (legName === selectedLegKey);
            drawLegSide(sideCtx, legs3D[legName], centerX, bodyCanvasY, scale, 1.0, isSelected, legName);
        }
    }

    // 5. If selected leg is in the background (left side), redraw it on top so it is not obscured
    if (selectedLegKey && selectedLegKey.startsWith('left_') && legs3D[selectedLegKey]) {
        drawLegSide(sideCtx, legs3D[selectedLegKey], centerX, bodyCanvasY, scale, 1.0, true, selectedLegKey);
    }
}

function drawLegSide(ctx, pts, centerX, bodyCanvasY, scale, opacity, isSelected, legName) {
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

    if (legName) {
        sideViewLegPoints[legName] = { c0, c1, c2, c3 };
    }

    const isCoxaActive = isSelected && (currentHoveredJoint === 'coxa');
    const isFemurActive = isSelected && (currentHoveredJoint === 'femur');
    const isTibiaActive = isSelected && (currentHoveredJoint === 'tibia');

    // Coxa segment
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.strokeStyle = isSelected ? (isCoxaActive ? '#38bdf8' : '#2980b9') : '#383a4c';
    ctx.lineWidth = isSelected ? (isCoxaActive ? 4.5 : 3.5) : 2.0;
    ctx.stroke();

    // Femur segment
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.strokeStyle = isSelected ? (isFemurActive ? '#38bdf8' : '#2980b9') : '#383a4c';
    ctx.lineWidth = isSelected ? (isFemurActive ? 4.5 : 3.5) : 2.0;
    ctx.stroke();

    // Tibia sickle blade segment (curved outward matching reference morphology)
    ctx.beginPath();
    ctx.moveTo(c2.x, c2.y);
    const midX = (c2.x + c3.x) / 2;
    const midY = (c2.y + c3.y) / 2;
    const dx = c3.x - c2.x;
    const dy = c3.y - c2.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
        const sign = (c3.x >= c2.x) ? 1 : -1;
        const nx = -dy / len * sign * 4.5;
        const ny = dx / len * sign * 4.5;
        ctx.quadraticCurveTo(midX + nx, midY + ny, c3.x, c3.y);
    } else {
        ctx.lineTo(c3.x, c3.y);
    }
    ctx.strokeStyle = isSelected ? (isTibiaActive ? '#38bdf8' : '#2980b9') : '#383a4c';
    ctx.lineWidth = isSelected ? (isTibiaActive ? 4 : 3) : 1.8;
    ctx.stroke();

    // Chassis attachment axis dot (c0) - active leg gets Minimap Blue glow #38bdf8
    ctx.fillStyle = isSelected ? '#38bdf8' : '#d0d4de';
    ctx.beginPath();
    ctx.arc(c0.x, c0.y, isSelected ? 4 : 3.5, 0, 2 * Math.PI);
    ctx.fill();
    if (isSelected) {
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }

    // Joint dots
    ctx.fillStyle = isSelected ? '#1b3b5c' : '#282936';
    ctx.beginPath(); ctx.arc(c1.x, c1.y, 3, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(c2.x, c2.y, 3.5, 0, 2 * Math.PI); ctx.fill();

    // Foot tip completely removed per user request

    ctx.restore();
}

function drawFrontView(legs3D) {
    const width = frontCanvas.width;
    const height = frontCanvas.height;
    if (width === 0 || height === 0) return;
    frontCtx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const scale = Math.min(width / 620, height / 290);
    const bodyCanvasY = height * 0.36;

    // Ground level is at Z = -80 mm in robot coordinates
    const groundCanvasY = bodyCanvasY + 80 * scale;

    // 1. Ground Plane (Line with Hatching)
    frontCtx.strokeStyle = '#3e3e52';
    frontCtx.lineWidth = 1.5;
    frontCtx.beginPath();
    frontCtx.moveTo(15, groundCanvasY);
    frontCtx.lineTo(width - 15, groundCanvasY);
    frontCtx.stroke();

    // Ground hatches
    frontCtx.strokeStyle = '#2d2d3d';
    frontCtx.lineWidth = 1;
    for (let x = 20; x < width - 20; x += 16) {
        frontCtx.beginPath();
        frontCtx.moveTo(x, groundCanvasY);
        frontCtx.lineTo(x - 8, groundCanvasY + 8);
        frontCtx.stroke();
    }

    // Direction & Level indicators
    frontCtx.fillStyle = '#6b7280';
    frontCtx.font = '10px sans-serif';
    frontCtx.fillText("LEFT", 12, 16);
    frontCtx.fillText("RIGHT", width - 46, 16);
    frontCtx.fillText("Ground (-80mm)", 12, groundCanvasY + 14);

    // 2. Depth ordering for Front View
    frontViewLegPoints = {};
    for (const legName of ['left_rear', 'right_rear']) {
        if (legs3D[legName]) {
            const isSelected = (legName === selectedLegKey);
            drawLegFront(frontCtx, legs3D[legName], centerX, bodyCanvasY, scale, isSelected ? 0.95 : 0.38, isSelected, legName);
        }
    }

    for (const legName of ['left_middle', 'right_middle']) {
        if (legs3D[legName]) {
            const isSelected = (legName === selectedLegKey);
            drawLegFront(frontCtx, legs3D[legName], centerX, bodyCanvasY, scale, isSelected ? 0.95 : 0.68, isSelected, legName);
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
            const isSelected = (legName === selectedLegKey);
            drawLegFront(frontCtx, legs3D[legName], centerX, bodyCanvasY, scale, 1.0, isSelected, legName);
        }
    }

    // 5. If selected leg is in the background (rear or middle), redraw it on top so it is not obscured
    if (selectedLegKey && !selectedLegKey.endsWith('_front') && legs3D[selectedLegKey]) {
        drawLegFront(frontCtx, legs3D[selectedLegKey], centerX, bodyCanvasY, scale, 1.0, true, selectedLegKey);
    }
}

function drawLegFront(ctx, pts, centerX, bodyCanvasY, scale, opacity, isSelected, legName) {
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

    if (legName) {
        frontViewLegPoints[legName] = { c0, c1, c2, c3 };
    }

    const isCoxaActive = isSelected && (currentHoveredJoint === 'coxa');
    const isFemurActive = isSelected && (currentHoveredJoint === 'femur');
    const isTibiaActive = isSelected && (currentHoveredJoint === 'tibia');

    // Coxa segment
    ctx.beginPath();
    ctx.moveTo(c0.x, c0.y);
    ctx.lineTo(c1.x, c1.y);
    ctx.strokeStyle = isSelected ? (isCoxaActive ? '#38bdf8' : '#2980b9') : '#383a4c';
    ctx.lineWidth = isSelected ? (isCoxaActive ? 4.5 : 3.5) : 2.0;
    ctx.stroke();

    // Femur segment
    ctx.beginPath();
    ctx.moveTo(c1.x, c1.y);
    ctx.lineTo(c2.x, c2.y);
    ctx.strokeStyle = isSelected ? (isFemurActive ? '#38bdf8' : '#2980b9') : '#383a4c';
    ctx.lineWidth = isSelected ? (isFemurActive ? 4.5 : 3.5) : 2.0;
    ctx.stroke();

    // Tibia sickle blade segment (curved outward matching reference morphology)
    ctx.beginPath();
    ctx.moveTo(c2.x, c2.y);
    const midX = (c2.x + c3.x) / 2;
    const midY = (c2.y + c3.y) / 2;
    const dx = c3.x - c2.x;
    const dy = c3.y - c2.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.001) {
        const sign = (c3.x >= c2.x) ? 1 : -1;
        const nx = -dy / len * sign * 4.5;
        const ny = dx / len * sign * 4.5;
        ctx.quadraticCurveTo(midX + nx, midY + ny, c3.x, c3.y);
    } else {
        ctx.lineTo(c3.x, c3.y);
    }
    ctx.strokeStyle = isSelected ? (isTibiaActive ? '#38bdf8' : '#2980b9') : '#383a4c';
    ctx.lineWidth = isSelected ? (isTibiaActive ? 4 : 3) : 1.8;
    ctx.stroke();

    // Chassis attachment axis dot (c0) - active leg gets Minimap Blue glow #38bdf8
    ctx.fillStyle = isSelected ? '#38bdf8' : '#d0d4de';
    ctx.beginPath();
    ctx.arc(c0.x, c0.y, isSelected ? 4 : 3.5, 0, 2 * Math.PI);
    ctx.fill();
    if (isSelected) {
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.2;
        ctx.stroke();
    }

    // Joint dots
    ctx.fillStyle = isSelected ? '#1b3b5c' : '#282936';
    ctx.beginPath(); ctx.arc(c1.x, c1.y, 3, 0, 2 * Math.PI); ctx.fill();
    ctx.beginPath(); ctx.arc(c2.x, c2.y, 3.5, 0, 2 * Math.PI); ctx.fill();

    // Foot tip completely removed per user request

    ctx.restore();
}

// 2D Canvas Interactive Click & Hover Selection
let topViewLegPoints = {};
let sideViewLegPoints = {};
let frontViewLegPoints = {};

function distToSegmentSquared(p, v, w) {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return (p.x - v.x) * (p.x - v.x) + (p.y - v.y) * (p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = v.x + t * (w.x - v.x);
    const projY = v.y + t * (w.y - v.y);
    return (p.x - projX) * (p.x - projX) + (p.y - projY) * (p.y - projY);
}

function findClickedLeg(canvas, e, legPointsMap) {
    if (!canvas || !legPointsMap) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const p = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
    };

    let closestLeg = null;
    let minD2 = 28 * 28; // 28px hit tolerance

    for (const legName in legPointsMap) {
        const pts = legPointsMap[legName];
        if (!pts || !pts.c0 || !pts.c1 || !pts.c2 || !pts.c3) continue;
        const d0 = distToSegmentSquared(p, pts.c0, pts.c1);
        const d1 = distToSegmentSquared(p, pts.c1, pts.c2);
        const d2 = distToSegmentSquared(p, pts.c2, pts.c3);
        const dMin = Math.min(d0, d1, d2);
        if (dMin < minD2) {
            minD2 = dMin;
            closestLeg = legName;
        }
    }
    return closestLeg;
}

[
    { canvas: topCanvas, getMap: () => topViewLegPoints },
    { canvas: sideCanvas, getMap: () => sideViewLegPoints },
    { canvas: frontCanvas, getMap: () => frontViewLegPoints }
].forEach(({ canvas, getMap }) => {
    if (!canvas) return;
    canvas.addEventListener('click', (e) => {
        const leg = findClickedLeg(canvas, e, getMap());
        if (leg) {
            selectLegByKey(leg);
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        const leg = findClickedLeg(canvas, e, getMap());
        canvas.style.cursor = leg ? 'pointer' : 'default';
    });

    canvas.addEventListener('mouseleave', () => {
        canvas.style.cursor = 'default';
    });
});

// 3D View Raycasting Leg Selection
const raycaster3D = new THREE.Raycaster();
const mouse3D = new THREE.Vector2();

if (renderer && renderer.domElement) {
    renderer.domElement.addEventListener('click', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse3D.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse3D.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster3D.setFromCamera(mouse3D, camera);

        const candidates = [];
        for (const legName in robot3DMeshes.legs) {
            const leg = robot3DMeshes.legs[legName];
            if (!leg) continue;
            [leg.coxaGroup, leg.femurGroup, leg.tibiaGroup].forEach(g => {
                if (g) {
                    g.traverse(child => {
                        if (child.isMesh) {
                            child.userData.legName = legName;
                            candidates.push(child);
                        }
                    });
                }
            });
        }

        const intersects = raycaster3D.intersectObjects(candidates, false);
        if (intersects.length > 0) {
            const hit = intersects[0];
            const hitLeg = hit.object.userData.legName;
            if (hitLeg) {
                selectLegByKey(hitLeg);
            }
        }
    });

    // 3D Joint Hover & Motion Arc Preview on Pointer Move
    renderer.domElement.addEventListener('pointermove', (e) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse3D.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse3D.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster3D.setFromCamera(mouse3D, camera);

        const activeLeg = robot3DMeshes.legs[selectedLegKey];
        if (!activeLeg) return;

        const candidates = [];
        [activeLeg.coxaGroup, activeLeg.femurGroup, activeLeg.tibiaGroup].forEach(g => {
            if (g) {
                g.traverse(child => {
                    if (child.isMesh && child.userData && child.userData.jointType) {
                        candidates.push(child);
                    }
                });
            }
        });

        const intersects = raycaster3D.intersectObjects(candidates, false);
        if (intersects.length > 0) {
            const hit = intersects[0];
            const jointType = hit.object.userData.jointType;
            if (currentHoveredJoint !== jointType) {
                currentHoveredJoint = jointType;
                update3DLegHighlights(selectedLegKey, currentHoveredJoint);
                updateMotionRangeArcs();
                drawRobot();
            }
        } else {
            if (currentHoveredJoint !== null) {
                currentHoveredJoint = null;
                update3DLegHighlights(selectedLegKey, null);
                updateMotionRangeArcs();
                drawRobot();
            }
        }
    });

    renderer.domElement.addEventListener('pointerleave', () => {
        if (currentHoveredJoint !== null) {
            currentHoveredJoint = null;
            update3DLegHighlights(selectedLegKey, null);
            updateMotionRangeArcs();
            drawRobot();
        }
    });
}

// Initialize Three.js scene & responsive viewport
initThreeJS();
resizeCanvases();

// Default robot layout based on calibrated physical dimensions
const DEFAULT_ROBOT_LAYOUT = {
    body: {
        width_front_rear: 130.0,
        width_middle: 150.0,
        axis_distance_longitudinal: 90.0,
        vertices: [
            { x: 75.0, y: 0.0 },
            { x: 65.0, y: 90.0 },
            { x: -65.0, y: 90.0 },
            { x: -75.0, y: 0.0 },
            { x: -65.0, y: -90.0 },
            { x: 65.0, y: -90.0 }
        ]
    },
    legs: {
        right_middle: {
            mount_point: { x: 75.0, y: 0.0 },
            base_angle: 0.0,
            coxa: { name: "right_middle_coxa", length: 60.0 },
            femur: { name: "right_middle_femur", length: 100.0 },
            tibia: { name: "right_middle_tibia", length: 130.0 }
        },
        right_rear: {
            mount_point: { x: 65.0, y: 90.0 },
            base_angle: 0.7853981633974483,
            coxa: { name: "right_rear_coxa", length: 60.0 },
            femur: { name: "right_rear_femur", length: 100.0 },
            tibia: { name: "right_rear_tibia", length: 130.0 }
        },
        left_rear: {
            mount_point: { x: -65.0, y: 90.0 },
            base_angle: 2.356194490192345,
            coxa: { name: "left_rear_coxa", length: 60.0 },
            femur: { name: "left_rear_femur", length: 100.0 },
            tibia: { name: "left_rear_tibia", length: 130.0 }
        },
        left_middle: {
            mount_point: { x: -75.0, y: 0.0 },
            base_angle: 3.141592653589793,
            coxa: { name: "left_middle_coxa", length: 60.0 },
            femur: { name: "left_middle_femur", length: 100.0 },
            tibia: { name: "left_middle_tibia", length: 130.0 }
        },
        left_front: {
            mount_point: { x: -65.0, y: -90.0 },
            base_angle: 3.9269908169872414,
            coxa: { name: "left_front_coxa", length: 60.0 },
            femur: { name: "left_front_femur", length: 100.0 },
            tibia: { name: "left_front_tibia", length: 130.0 }
        },
        right_front: {
            mount_point: { x: 65.0, y: -90.0 },
            base_angle: 5.497787143782138,
            coxa: { name: "right_front_coxa", length: 60.0 },
            femur: { name: "right_front_femur", length: 100.0 },
            tibia: { name: "right_front_tibia", length: 130.0 }
        }
    }
};

// Immediately render robot twin on load
robotLayout = DEFAULT_ROBOT_LAYOUT;
buildThreeJSRobot(robotLayout);
drawRobot();

// Immediate fallback layout fetch via REST API
fetch('/api/v1/robot')
    .then(r => r.json())
    .then(data => {
        if (data && data.legs && (!robotLayout.legs || Object.keys(robotLayout.legs).length === 0)) {
            robotLayout = data;
            buildThreeJSRobot(robotLayout);
            drawRobot();
        }
    })
    .catch(() => {});

// --- SYSTEM TELEMETRY & KPI UPDATE HANDLER ---
function updateSystemStatsUI(stats) {
    if (!stats) return;

    // CPU & Thermal
    if (stats.cpu) {
        const cpuPct = stats.cpu.percent !== undefined ? stats.cpu.percent : 0;
        const cpuEl = document.getElementById('sys-cpu-val');
        const cpuBar = document.getElementById('sys-cpu-bar');
        if (cpuEl) cpuEl.textContent = cpuPct.toFixed(1) + "%";
        if (cpuBar) {
            cpuBar.style.width = Math.min(100, Math.max(0, cpuPct)) + "%";
            cpuBar.className = "metric-bar-fill " + (cpuPct > 80 ? "fill-red" : (cpuPct > 50 ? "fill-amber" : "fill-green"));
        }

        const loadEl = document.getElementById('sys-loadavg-val');
        if (loadEl && stats.cpu.load_1m !== undefined) {
            loadEl.textContent = `${stats.cpu.load_1m.toFixed(2)} · ${stats.cpu.load_5m.toFixed(2)} · ${stats.cpu.load_15m.toFixed(2)}`;
        }
    }

    if (stats.thermal) {
        const temp = stats.thermal.temp_c !== undefined ? stats.thermal.temp_c : 0;
        const tempEl = document.getElementById('sys-temp-val');
        const tempBadge = document.getElementById('sys-thermal-badge');
        if (tempEl) tempEl.textContent = temp.toFixed(1) + " °C";
        if (tempBadge) {
            tempBadge.textContent = temp.toFixed(1) + " °C";
            if (temp >= 75) {
                tempBadge.className = "kpi-badge kpi-badge-alert";
            } else if (temp >= 60) {
                tempBadge.className = "kpi-badge kpi-badge-warn";
            } else {
                tempBadge.className = "kpi-badge kpi-badge-ok";
            }
        }
    }

    // RAM Memory
    if (stats.memory) {
        const mem = stats.memory;
        const ramVal = document.getElementById('sys-ram-val');
        const ramBar = document.getElementById('sys-ram-bar');
        const ramBadge = document.getElementById('sys-ram-badge');
        const ramAvail = document.getElementById('sys-ram-avail-val');

        if (ramVal) ramVal.textContent = `${Math.round(mem.used_mb)} / ${Math.round(mem.total_mb)} MB`;
        if (ramBar) {
            ramBar.style.width = Math.min(100, Math.max(0, mem.percent)) + "%";
            ramBar.className = "metric-bar-fill " + (mem.percent > 85 ? "fill-red" : (mem.percent > 70 ? "fill-amber" : "fill-blue"));
        }
        if (ramBadge) ramBadge.textContent = mem.percent.toFixed(1) + "%";
        if (ramAvail) ramAvail.textContent = `${Math.round(mem.available_mb)} MB`;
    }

    // Daemon
    if (stats.daemon) {
        const daemonRss = document.getElementById('sys-daemon-rss-val');
        const uptimeEl = document.getElementById('sys-uptime-val');
        if (daemonRss) daemonRss.textContent = `${stats.daemon.daemon_rss_mb.toFixed(1)} MB`;
        if (uptimeEl) uptimeEl.textContent = stats.daemon.uptime_formatted || "--";
    }

    // Power & Throttling Health
    if (stats.power) {
        const p = stats.power;
        const pCard = document.getElementById('sys-power-card');
        const pIcon = document.getElementById('sys-power-icon');
        const pTitle = document.getElementById('sys-power-title');
        const pDesc = document.getElementById('sys-power-desc');
        const pBadge = document.getElementById('sys-power-badge');
        const pThrottled = document.getElementById('sys-throttled-hex');
        const pUndervolt = document.getElementById('sys-undervoltage-val');

        if (pThrottled) pThrottled.textContent = p.throttled_raw || "0x0";

        if (p.under_voltage_active) {
            if (pCard) pCard.className = "power-status-card alert";
            if (pIcon) pIcon.textContent = "";
            if (pTitle) pTitle.textContent = "Under-Voltage Detected!";
            if (pDesc) pDesc.textContent = "Power rail dipped below 4.63V. Check battery/cabling!";
            if (pBadge) { pBadge.textContent = "Under-Voltage"; pBadge.className = "kpi-badge kpi-badge-alert"; }
            if (pUndervolt) { pUndervolt.textContent = "ACTIVE"; pUndervolt.className = "kpi-subval text-red"; }
        } else if (p.throttled_active) {
            if (pCard) pCard.className = "power-status-card alert";
            if (pIcon) pIcon.textContent = "";
            if (pTitle) pTitle.textContent = "Thermal Throttling Active!";
            if (pDesc) pDesc.textContent = "SoC frequency reduced due to high temperature.";
            if (pBadge) { pBadge.textContent = "Throttling"; pBadge.className = "kpi-badge kpi-badge-alert"; }
            if (pUndervolt) { pUndervolt.textContent = "Throttled"; pUndervolt.className = "kpi-subval text-amber"; }
        } else if (p.under_voltage_occurred) {
            if (pCard) pCard.className = "power-status-card warn";
            if (pIcon) pIcon.textContent = "";
            if (pTitle) pTitle.textContent = "Under-Voltage Occurred";
            if (pDesc) pDesc.textContent = "Voltage dip detected since boot. Monitor during high servo load.";
            if (pBadge) { pBadge.textContent = "Dip Detected"; pBadge.className = "kpi-badge kpi-badge-warn"; }
            if (pUndervolt) { pUndervolt.textContent = "Occurred"; pUndervolt.className = "kpi-subval text-amber"; }
        } else {
            if (pCard) pCard.className = "power-status-card";
            if (pIcon) pIcon.textContent = "";
            if (pTitle) pTitle.textContent = "5V Power Rail Stable";
            if (pDesc) pDesc.textContent = "No undervoltage or frequency capping detected.";
            if (pBadge) { pBadge.textContent = "Healthy"; pBadge.className = "kpi-badge kpi-badge-ok"; }
            if (pUndervolt) { pUndervolt.textContent = "Normal"; pUndervolt.className = "kpi-subval text-green"; }
        }
    }

    // Wi-Fi
    if (stats.wifi) {
        const w = stats.wifi;
        const wIfname = document.getElementById('sys-wifi-ifname');
        const wVal = document.getElementById('sys-wifi-val');
        const wBar = document.getElementById('sys-wifi-bar');
        const wBadge = document.getElementById('sys-wifi-badge');

        if (wIfname) wIfname.textContent = w.interface || "wlan0";
        if (wVal) {
            if (w.connected) {
                wVal.textContent = `${w.quality}/${w.quality_max} (${w.signal_dbm} dBm)`;
            } else {
                wVal.textContent = "Disconnected / Eth";
            }
        }
        if (wBar) {
            const pct = w.connected ? w.quality_percent : 0;
            wBar.style.width = pct + "%";
            wBar.className = "metric-bar-fill " + (pct > 60 ? "fill-green" : (pct > 30 ? "fill-amber" : "fill-red"));
        }
        if (wBadge) {
            if (w.connected) {
                wBadge.textContent = "Wi-Fi OK";
                wBadge.className = "kpi-badge kpi-badge-ok";
            } else {
                wBadge.textContent = "No Wi-Fi";
                wBadge.className = "kpi-badge kpi-badge-neutral";
            }
        }
    }

    // Disk
    if (stats.disk) {
        const d = stats.disk;
        const dVal = document.getElementById('sys-disk-val');
        if (dVal) dVal.textContent = `${d.used_gb} / ${d.total_gb} GB (${d.percent}%)`;
    }
}

// Initial fetch of system stats
fetch('/api/v1/system/stats')
    .then(r => r.json())
    .then(updateSystemStatsUI)
    .catch(() => {});

// Heartbeat fetch every 3 seconds for active system tab
setInterval(() => {
    const sysPane = document.getElementById('tab-pane-system');
    if (sysPane && sysPane.classList.contains('active')) {
        fetch('/api/v1/system/stats')
            .then(r => r.json())
            .then(updateSystemStatsUI)
            .catch(() => {});
    }
}, 3000);

drawRobot();
