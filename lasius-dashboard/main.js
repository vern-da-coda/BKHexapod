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
const btnTestLeg = document.getElementById('btn-test-leg');
const btnEstop = document.getElementById('btn-estop');

// Tab Navigation elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

// Leg Control elements (Beinsteuerung)
const selectLeg = document.getElementById('select-leg');
const legInfoBadge = document.getElementById('leg-info-badge');
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

    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, -20, 0);
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

    // 3. Add Metallic Servo Mount Collar Rings at 6 Leg Axes
    const mountPoints = [
        { x: -65, z: -90 }, // LF
        { x: -75, z: 0 },   // LM
        { x: -65, z: 90 },  // LR
        { x: 65,  z: -90 }, // RF
        { x: 75,  z: 0 },   // RM
        { x: 65,  z: 90 },  // RR
    ];
    const ringGeo = new THREE.TorusGeometry(8, 1.4, 8, 24);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
        color: 0x222533,
        roughness: 0.35,
        metalness: 0.7
    });
    mountPoints.forEach(pt => {
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(pt.x, 7.5, pt.z);
        bodyMesh.add(ringMesh);
    });

    // 4. Direction Headlights / Cyan LEDs
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
        scene.add(coxaGroup);
        scene.add(femurGroup);
        scene.add(tibiaGroup);
        robot3DMeshes.legs[legName] = {
            coxaGroup,
            femurGroup,
            tibiaGroup
        };
    }
}

// Shared leg geometries and materials
let sharedCoxaBoxGeo, sharedPinionGeo, sharedFemurPlateGeo, sharedFemurSpacerGeo, sharedScrewGeo;
let sharedTibiaGeo, sharedFootPadGeo, sharedJointRingGeo;
let hardwareMat, carbonPlateMat, screwMat, brassMat, coxaAccentMat, femurAccentMat, tibiaAccentMat, footAccentMat;

function initLegGeometriesAndMaterials() {
    if (sharedTibiaGeo) return; // already initialized

    // Materials
    hardwareMat = new THREE.MeshStandardMaterial({ color: 0x1d1e26, roughness: 0.55, metalness: 0.25 });
    carbonPlateMat = new THREE.MeshStandardMaterial({ color: 0x242632, roughness: 0.45, metalness: 0.35 });
    screwMat = new THREE.MeshStandardMaterial({ color: 0xd8dbe2, roughness: 0.25, metalness: 0.85 });
    brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.75 });

    coxaAccentMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, roughness: 0.4, metalness: 0.3 });
    femurAccentMat = new THREE.MeshStandardMaterial({ color: 0x2980b9, roughness: 0.4, metalness: 0.3 });
    tibiaAccentMat = new THREE.MeshStandardMaterial({ color: 0x8e44ad, roughness: 0.4, metalness: 0.3 });
    footAccentMat = new THREE.MeshStandardMaterial({ color: 0xe67e22, roughness: 0.35, metalness: 0.3 });

    // 1. Coxa Geometries (Rectangular servo bracket: 50 x 28 x 30 mm)
    sharedCoxaBoxGeo = new THREE.BoxGeometry(50, 28, 30);
    // Pinion gear at top (chassis pivot)
    sharedPinionGeo = new THREE.CylinderGeometry(3.2, 3.2, 5, 16);
    // Joint accent ring
    sharedJointRingGeo = new THREE.TorusGeometry(5.5, 1.2, 8, 20);

    // 2. Femur Geometries (Dual parallel carbon-fiber plates: 100 mm center-to-center)
    const femurShape = new THREE.Shape();
    femurShape.absarc(0, 0, 13, Math.PI / 2, -Math.PI / 2, false);
    femurShape.lineTo(100, -13);
    femurShape.absarc(100, 0, 13, -Math.PI / 2, Math.PI / 2, false);
    femurShape.lineTo(0, 13);
    femurShape.closePath();

    sharedFemurPlateGeo = new THREE.ExtrudeGeometry(femurShape, {
        depth: 2.5,
        bevelEnabled: true,
        bevelThickness: 0.6,
        bevelSize: 0.6,
        bevelSegments: 2
    });
    sharedFemurPlateGeo.translate(0, 0, -1.25);

    // Center spacer / servo core between plates
    sharedFemurSpacerGeo = new THREE.BoxGeometry(68, 21, 16);
    sharedScrewGeo = new THREE.CylinderGeometry(2.4, 2.4, 0.8, 12);
    sharedScrewGeo.rotateX(Math.PI / 2);

    // 3. Tibia Geometry (Curved insect sickle claw with double spur & crescent window)
    const tibiaShape = new THREE.Shape();
    tibiaShape.moveTo(0, 14);
    tibiaShape.lineTo(13, 5);
    // Upper posterior spur
    tibiaShape.lineTo(25, 8);
    // Notch between spurs
    tibiaShape.lineTo(14, -2);
    // Lower posterior spur
    tibiaShape.lineTo(22, -14);
    // Dorsal curved outer blade spine
    tibiaShape.lineTo(14, -26);
    tibiaShape.lineTo(16, -50);
    tibiaShape.lineTo(15, -75);
    tibiaShape.lineTo(11, -100);
    tibiaShape.lineTo(4, -120);
    // Rounded foot tip
    tibiaShape.lineTo(0, -130);
    tibiaShape.lineTo(-4, -130);
    tibiaShape.lineTo(-6, -126);
    // Ventral inner brace curve
    tibiaShape.lineTo(-7, -118);
    tibiaShape.lineTo(-10, -95);
    tibiaShape.lineTo(-8, -65);
    tibiaShape.lineTo(-4, -35);
    tibiaShape.lineTo(-8, -15);
    tibiaShape.lineTo(-14, 0);
    tibiaShape.lineTo(0, 14);
    tibiaShape.closePath();

    // Hollow crescent cutout slot
    const hole = new THREE.Path();
    hole.moveTo(3, -36);
    hole.lineTo(7, -60);
    hole.lineTo(6, -85);
    hole.lineTo(2, -108);
    hole.lineTo(-2, -108);
    hole.lineTo(-3, -85);
    hole.lineTo(-1, -60);
    hole.lineTo(0, -36);
    hole.closePath();
    tibiaShape.holes.push(hole);

    sharedTibiaGeo = new THREE.ExtrudeGeometry(tibiaShape, {
        depth: 5.5,
        bevelEnabled: true,
        bevelThickness: 0.8,
        bevelSize: 0.8,
        bevelSegments: 2
    });
    sharedTibiaGeo.translate(0, 0, -2.75);

    // Foot tip ground contact pad
    sharedFootPadGeo = new THREE.SphereGeometry(3.5, 12, 12);
}

function createCoxaGroup() {
    const group = new THREE.Group();
    // Servo bracket body (centered along x from 5 to 55)
    const box = new THREE.Mesh(sharedCoxaBoxGeo, hardwareMat);
    box.position.set(30, 0, 0);
    group.add(box);

    // Brass top gear pinion at chassis pivot
    const pinion = new THREE.Mesh(sharedPinionGeo, brassMat);
    pinion.position.set(0, 16.5, 0);
    group.add(pinion);

    // Accent ring at hip pivot
    const ring0 = new THREE.Mesh(sharedJointRingGeo, coxaAccentMat);
    ring0.rotateX(Math.PI / 2);
    ring0.position.set(0, 0, 0);
    group.add(ring0);

    // Output bearing at femur axis (x = 60)
    const ring1 = new THREE.Mesh(sharedJointRingGeo, femurAccentMat);
    ring1.rotateY(Math.PI / 2);
    ring1.position.set(60, 0, 0);
    group.add(ring1);

    return group;
}

function createFemurGroup() {
    const group = new THREE.Group();
    // Inner plate (z = -9 mm)
    const plateInner = new THREE.Mesh(sharedFemurPlateGeo, carbonPlateMat);
    plateInner.position.set(0, 0, -9);
    group.add(plateInner);

    // Outer plate (z = +9 mm)
    const plateOuter = new THREE.Mesh(sharedFemurPlateGeo, carbonPlateMat);
    plateOuter.position.set(0, 0, 9);
    group.add(plateOuter);

    // Spacer / core block between plates
    const spacer = new THREE.Mesh(sharedFemurSpacerGeo, hardwareMat);
    spacer.position.set(50, 0, 0);
    group.add(spacer);

    // Two silver structural screws through outer plate
    const screw1 = new THREE.Mesh(sharedScrewGeo, screwMat);
    screw1.position.set(42, 0, 10.6);
    group.add(screw1);

    const screw2 = new THREE.Mesh(sharedScrewGeo, screwMat);
    screw2.position.set(65, 0, 10.6);
    group.add(screw2);

    // Accent ring at hip joint
    const ringHip = new THREE.Mesh(sharedJointRingGeo, femurAccentMat);
    ringHip.rotateY(Math.PI / 2);
    ringHip.position.set(0, 0, 0);
    group.add(ringHip);

    // Accent ring at knee joint
    const ringKnee = new THREE.Mesh(sharedJointRingGeo, tibiaAccentMat);
    ringKnee.rotateY(Math.PI / 2);
    ringKnee.position.set(100, 0, 0);
    group.add(ringKnee);

    return group;
}

function createTibiaGroup() {
    const group = new THREE.Group();
    // Curved insect sickle blade with crescent cutout & posterior spurs
    const blade = new THREE.Mesh(sharedTibiaGeo, hardwareMat);
    group.add(blade);

    // Knee pivot cap with accent ring
    const ringKnee = new THREE.Mesh(sharedJointRingGeo, tibiaAccentMat);
    ringKnee.rotateY(Math.PI / 2);
    ringKnee.position.set(0, 0, 0);
    group.add(ringKnee);

    // Foot tip pad (orange accent / ground contact)
    const footPad = new THREE.Mesh(sharedFootPadGeo, footAccentMat);
    footPad.position.set(0, -130, 0);
    group.add(footPad);

    return group;
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
    btnView3D.setAttribute('aria-selected', mode === '3d');
    btnViewMulti.setAttribute('aria-selected', mode === 'multi');
    btnViewTop.setAttribute('aria-selected', mode === 'top');
    btnViewSide.setAttribute('aria-selected', mode === 'side');
    btnViewFront.setAttribute('aria-selected', mode === 'front');

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
    updateMinimapSelection(legKey);
    updateLegJointUI();
}

function updateLegJointUI() {
    if (!selectLeg) return;
    const legKey = selectLeg.value || selectedLegKey;
    const names = getLegServoNames(legKey);

    updateMinimapSelection(legKey);

    if (legInfoBadge) legInfoBadge.textContent = legKey;
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
}

// Minimap leg button click and keyboard event listeners
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
    });
}

if (selectLeg) {
    selectLeg.addEventListener('change', () => {
        selectedLegKey = selectLeg.value;
        if (selectTestLeg) selectTestLeg.value = selectedLegKey;
        updateMinimapSelection(selectedLegKey);
        updateLegJointUI();
    });
}

if (selectTestLeg) {
    selectTestLeg.addEventListener('change', () => {
        if (selectLeg) selectLeg.value = selectTestLeg.value;
        selectedLegKey = selectTestLeg.value;
        updateMinimapSelection(selectedLegKey);
        updateLegJointUI();
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
        btnRunStepTest.textContent = '⏳ Step cycle running...';
        sendCommand({ action: "test_leg", leg: leg, cycles: cycles, stride: 36.0, lift: 30.0 });
        logOrderEntry(`Test run: ${leg} (${cycles} cycles)`, 'running');
        setTimeout(() => {
            btnRunStepTest.disabled = false;
            btnRunStepTest.innerHTML = '&#9654; Start Step Cycle';
        }, cycles * 1300 + 1000);
    });
}

if (btnSweepCoxa) {
    btnSweepCoxa.addEventListener('click', () => {
        const leg = selectTestLeg ? selectTestLeg.value : selectedLegKey;
        const names = getLegServoNames(leg);
        sendCommand({ action: "sweep_joint", servo: names.coxa });
        logOrderEntry(`Sweep Coxa: ${names.coxa}`, 'running');
    });
}

if (btnSweepFemur) {
    btnSweepFemur.addEventListener('click', () => {
        const leg = selectTestLeg ? selectTestLeg.value : selectedLegKey;
        const names = getLegServoNames(leg);
        sendCommand({ action: "sweep_joint", servo: names.femur });
        logOrderEntry(`Sweep Femur: ${names.femur}`, 'running');
    });
}

if (btnSweepTibia) {
    btnSweepTibia.addEventListener('click', () => {
        const leg = selectTestLeg ? selectTestLeg.value : selectedLegKey;
        const names = getLegServoNames(leg);
        sendCommand({ action: "sweep_joint", servo: names.tibia });
        logOrderEntry(`Sweep Tibia: ${names.tibia}`, 'running');
    });
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
        btnEstop.textContent = '⛔ STOPPED';
        setTimeout(() => {
            btnEstop.textContent = '⛔ E-Stop';
        }, 3000);
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

drawRobot();
