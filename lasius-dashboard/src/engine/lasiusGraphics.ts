import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface GraphicsContainers {
  threeContainer: HTMLElement;
  topCanvas: HTMLCanvasElement;
  sideCanvas: HTMLCanvasElement;
  frontCanvas: HTMLCanvasElement;
}

export interface GraphicsCallbacks {
  onSelectLeg: (legKey: string) => void;
  onHoverJoint: (joint: 'coxa' | 'femur' | 'tibia' | null) => void;
}

export class LasiusGraphicsEngine {
  private containers: GraphicsContainers;
  private callbacks: GraphicsCallbacks;

  // Three.js scene
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private controls!: OrbitControls;
  private animFrameId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // 2D Canvas contexts
  private topCtx!: CanvasRenderingContext2D;
  private sideCtx!: CanvasRenderingContext2D;
  private frontCtx!: CanvasRenderingContext2D;

  // 2D Interaction hit points maps
  private topViewLegPoints: Record<string, any> = {};
  private sideViewLegPoints: Record<string, any> = {};
  private frontViewLegPoints: Record<string, any> = {};

  // Three.js Materials & Geometries
  private chassisMat!: THREE.MeshStandardMaterial;
  private eyeMat!: THREE.MeshStandardMaterial;
  private hardwareMat!: THREE.MeshStandardMaterial;
  private carbonPlateMat!: THREE.MeshStandardMaterial;
  private brassMat!: THREE.MeshStandardMaterial;
  private chassisAxisMat!: THREE.MeshStandardMaterial;
  private chassisMountActiveMat!: THREE.MeshStandardMaterial;
  private legNeutralMat!: THREE.MeshStandardMaterial;
  private jointNeutralMat!: THREE.MeshStandardMaterial;
  private legSelectedMat!: THREE.MeshStandardMaterial;
  private jointSelectedMat!: THREE.MeshStandardMaterial;
  private legActiveSegmentMat!: THREE.MeshStandardMaterial;
  private jointActiveMat!: THREE.MeshStandardMaterial;
  private axisGuideMat!: THREE.MeshBasicMaterial;

  private sharedCoxaBracketGeo!: THREE.BoxGeometry;
  private sharedCoxaServoGeo!: THREE.BoxGeometry;
  private sharedJointRingGeo!: THREE.TorusGeometry;
  private sharedCoxaCollarGeo!: THREE.CylinderGeometry;
  private sharedFemurPlateGeo!: THREE.ExtrudeGeometry;
  private sharedFemurRungGeo!: THREE.CylinderGeometry;
  private sharedFemurKneeServoGeo!: THREE.BoxGeometry;
  private sharedTibiaGeo!: THREE.ExtrudeGeometry;
  private sharedTibiaClampGeo!: THREE.BoxGeometry;

  // 3D Meshes map
  private robot3DMeshes: any = { body: null, legs: {}, axesGroup: null, axes: null, arcsGroup: null, mountRings: {} };
  private motionRangeArcs: any = {};
  private lastSelectedLegKinematics: any = null;

  // Internal state
  private robotLayout: any = {};
  private jointAngles: Record<string, number> = {};
  private selectedLegKey: string = 'left_rear';
  private currentHoveredJoint: 'coxa' | 'femur' | 'tibia' | null = null;
  private calibrationData: Record<string, any> = {};

  // Raycasting
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2(-999, -999);

  constructor(containers: GraphicsContainers, callbacks: GraphicsCallbacks) {
    this.containers = containers;
    this.callbacks = callbacks;

    this.init2DCanvases();
    this.initThreeJS();
    this.initMaterials();
    this.setupEvents();
  }

  private init2DCanvases() {
    this.topCtx = this.containers.topCanvas.getContext('2d')!;
    this.sideCtx = this.containers.sideCanvas.getContext('2d')!;
    this.frontCtx = this.containers.frontCanvas.getContext('2d')!;
    this.syncCanvasDimensions();
  }

  private syncCanvasDimensions() {
    for (const canvas of [this.containers.topCanvas, this.containers.sideCanvas, this.containers.frontCanvas]) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
      }
    }
  }

  private initThreeJS() {
    const el = this.containers.threeContainer;
    const width = el.clientWidth || 820;
    const height = el.clientHeight || 520;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x1a1a24);

    this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 3000);
    this.camera.position.set(380, 280, 380);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    el.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, -25, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.15;
    this.controls.minDistance = 80;
    this.controls.maxDistance = 1200;

    // Ground Grid at y = -80
    const grid = new THREE.GridHelper(700, 35, 0x4e4e62, 0x2a2a38);
    grid.position.y = -80;
    this.scene.add(grid);

    // Orientation Gizmo at (0, -80, 0)
    const axes = new THREE.AxesHelper(60);
    axes.position.set(0, -80, 0);
    this.scene.add(axes);

    // Lights
    const ambLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.9);
    dirLight1.position.set(200, 400, 200);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x7090b0, 0.4);
    dirLight2.position.set(-200, 200, -200);
    this.scene.add(dirLight2);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 0.35);
    rimLight.position.set(0, -200, 300);
    this.scene.add(rimLight);

    this.animate();
  }

  private animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);
    if (this.controls) this.controls.update();
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  private initMaterials() {
    this.chassisMat = new THREE.MeshStandardMaterial({ color: 0x343444, roughness: 0.5, metalness: 0.3 });
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0x00d2d3,
      emissive: 0x00d2d3,
      emissiveIntensity: 0.9,
      roughness: 0.2
    });

    this.hardwareMat = new THREE.MeshStandardMaterial({ color: 0x1a1b24, roughness: 0.60, metalness: 0.25 });
    this.carbonPlateMat = new THREE.MeshStandardMaterial({ color: 0x222430, roughness: 0.45, metalness: 0.35 });
    this.brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.75 });

    this.chassisAxisMat = new THREE.MeshStandardMaterial({
      color: 0xd0d4de,
      roughness: 0.3,
      metalness: 0.65
    });
    this.chassisMountActiveMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      roughness: 0.25,
      metalness: 0.5
    });

    this.legNeutralMat = new THREE.MeshStandardMaterial({ color: 0x343746, roughness: 0.45, metalness: 0.40 });
    this.jointNeutralMat = new THREE.MeshStandardMaterial({ color: 0x20222c, roughness: 0.50, metalness: 0.45 });

    this.legSelectedMat = new THREE.MeshStandardMaterial({
      color: 0x2980b9,
      roughness: 0.32,
      metalness: 0.35,
      emissive: 0x0d3b66,
      emissiveIntensity: 0.45
    });
    this.jointSelectedMat = new THREE.MeshStandardMaterial({
      color: 0x1f5f8b,
      roughness: 0.35,
      metalness: 0.55,
      emissive: 0x092540,
      emissiveIntensity: 0.40
    });

    this.legActiveSegmentMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.20,
      metalness: 0.45,
      emissive: 0x0284c7,
      emissiveIntensity: 0.85
    });
    this.jointActiveMat = new THREE.MeshStandardMaterial({
      color: 0x67e8f9,
      roughness: 0.25,
      metalness: 0.60,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.90
    });

    this.axisGuideMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.95
    });

    this.initLegGeometries();
  }

  private initLegGeometries() {
    this.sharedCoxaBracketGeo = new THREE.BoxGeometry(44, 26, 28);
    this.sharedCoxaServoGeo = new THREE.BoxGeometry(38, 20, 24);
    this.sharedJointRingGeo = new THREE.TorusGeometry(6.5, 1.2, 8, 24);
    this.sharedCoxaCollarGeo = new THREE.CylinderGeometry(7.5, 7.5, 3.2, 20);
    this.sharedCoxaCollarGeo.rotateX(Math.PI / 2);

    // Femur shape
    const femurShape = new THREE.Shape();
    femurShape.absarc(0, 0, 12, Math.PI / 2, -Math.PI / 2, false);
    femurShape.lineTo(100, -12);
    femurShape.absarc(100, 0, 12, -Math.PI / 2, Math.PI / 2, false);
    femurShape.lineTo(0, 12);
    femurShape.closePath();

    this.sharedFemurPlateGeo = new THREE.ExtrudeGeometry(femurShape, {
      depth: 2.2,
      bevelEnabled: true,
      bevelThickness: 0.5,
      bevelSize: 0.5,
      bevelSegments: 2
    });
    this.sharedFemurPlateGeo.translate(0, 0, -1.1);

    this.sharedFemurRungGeo = new THREE.CylinderGeometry(3.2, 3.2, 19, 16);
    this.sharedFemurRungGeo.rotateX(Math.PI / 2);

    this.sharedFemurKneeServoGeo = new THREE.BoxGeometry(28, 20, 18);

    // Tibia sickle blade shape
    const tibiaShape = new THREE.Shape();
    tibiaShape.moveTo(-6, 12);
    tibiaShape.lineTo(-10, 28);
    tibiaShape.lineTo(-9, 32);
    tibiaShape.lineTo(-6, 32);
    tibiaShape.lineTo(0, 15);
    tibiaShape.lineTo(12, 28);
    tibiaShape.lineTo(15, 27);
    tibiaShape.lineTo(18, 14);
    tibiaShape.lineTo(22, -6);
    tibiaShape.lineTo(24, -30);
    tibiaShape.lineTo(23, -60);
    tibiaShape.lineTo(19, -88);
    tibiaShape.lineTo(13, -110);
    tibiaShape.lineTo(6, -124);
    tibiaShape.lineTo(2, -130);
    tibiaShape.lineTo(-2, -130);
    tibiaShape.lineTo(-5, -124);
    tibiaShape.lineTo(-7, -110);
    tibiaShape.lineTo(-8, -88);
    tibiaShape.lineTo(-8, -60);
    tibiaShape.lineTo(-6, -35);
    tibiaShape.lineTo(-3, -18);
    tibiaShape.lineTo(-8, -6);
    tibiaShape.lineTo(-12, 5);
    tibiaShape.lineTo(-6, 12);
    tibiaShape.closePath();

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

    this.sharedTibiaGeo = new THREE.ExtrudeGeometry(tibiaShape, {
      depth: 3.2,
      bevelEnabled: true,
      bevelThickness: 0.6,
      bevelSize: 0.6,
      bevelSegments: 2
    });
    this.sharedTibiaGeo.translate(0, 0, -1.6);

    this.sharedTibiaClampGeo = new THREE.BoxGeometry(20, 18, 14);
  }

  public getChassisHullContour() {
    return [
      { x: 0,   y: -115 },
      { x: 18,  y: -112 },
      { x: 34,  y: -105 },
      { x: 48,  y: -95 },
      { x: 65,  y: -90 },
      { x: 74,  y: -75 },
      { x: 70,  y: -60 },
      { x: 55,  y: -45 },
      { x: 42,  y: -25 },
      { x: 38,  y: 0 },
      { x: 42,  y: 25 },
      { x: 55,  y: 45 },
      { x: 70,  y: 60 },
      { x: 74,  y: 75 },
      { x: 65,  y: 90 },
      { x: 48,  y: 95 },
      { x: 34,  y: 105 },
      { x: 18,  y: 112 },
      { x: 0,   y: 115 },
      { x: -18, y: 112 },
      { x: -34, y: 105 },
      { x: -48, y: 95 },
      { x: -65, y: 90 },
      { x: -74, y: 75 },
      { x: -70, y: 60 },
      { x: -55, y: 45 },
      { x: -42, y: 25 },
      { x: -38, y: 0 },
      { x: -42, y: -25 },
      { x: -55, y: -45 },
      { x: -70, y: -60 },
      { x: -74, y: -75 },
      { x: -65, y: -90 },
      { x: -48, y: -95 },
      { x: -34, y: -105 },
      { x: -18, y: -112 }
    ];
  }

  public getChassisBayContour() {
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

  public buildThreeJSRobot(layout: any) {
    if (!this.scene || !layout || !layout.body || !layout.legs) return;
    this.robotLayout = layout;

    if (this.robot3DMeshes.body) this.scene.remove(this.robot3DMeshes.body);
    if (this.robot3DMeshes.axesGroup) this.scene.remove(this.robot3DMeshes.axesGroup);
    if (this.robot3DMeshes.arcsGroup) this.scene.remove(this.robot3DMeshes.arcsGroup);
    this.robot3DMeshes.axesGroup = null;
    this.robot3DMeshes.axes = null;
    this.robot3DMeshes.arcsGroup = null;

    for (const legName in this.robot3DMeshes.legs) {
      const g = this.robot3DMeshes.legs[legName];
      if (g.coxaGroup) this.scene.remove(g.coxaGroup);
      if (g.femurGroup) this.scene.remove(g.femurGroup);
      if (g.tibiaGroup) this.scene.remove(g.tibiaGroup);
    }
    this.robot3DMeshes.legs = {};

    // 1. Chassis Body Mesh
    const bodyShape = new THREE.Shape();
    const hullPts = this.getChassisHullContour();
    bodyShape.moveTo(hullPts[0].x, hullPts[0].y);
    for (let i = 1; i < hullPts.length; i++) {
      bodyShape.lineTo(hullPts[i].x, hullPts[i].y);
    }
    bodyShape.closePath();

    const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
      depth: 14,
      bevelEnabled: true,
      bevelSegments: 3,
      steps: 1,
      bevelSize: 2.5,
      bevelThickness: 2.5
    });
    bodyGeo.translate(0, 0, -7);
    bodyGeo.rotateX(Math.PI / 2);

    const bodyMesh = new THREE.Mesh(bodyGeo, this.chassisMat);
    bodyMesh.position.set(0, 0, 0);

    // 2. Elevated Top Electronics Bay Deck
    const bayShape = new THREE.Shape();
    const bayPts = this.getChassisBayContour();
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

    const bayMat = new THREE.MeshStandardMaterial({ color: 0x1f212d, roughness: 0.6, metalness: 0.25 });
    const bayMesh = new THREE.Mesh(bayGeo, bayMat);
    bayMesh.position.set(0, 8.2, 0);
    bodyMesh.add(bayMesh);

    // 3. Direction Headlights (Cyan LEDs)
    const eyeGeo = new THREE.SphereGeometry(3.5, 16, 16);
    const eyeLeft = new THREE.Mesh(eyeGeo, this.eyeMat);
    eyeLeft.position.set(-16, 4.5, -106);
    bodyMesh.add(eyeLeft);

    const eyeRight = new THREE.Mesh(eyeGeo, this.eyeMat);
    eyeRight.position.set(16, 4.5, -106);
    bodyMesh.add(eyeRight);

    // 4. Directional Forward Chevron Indicator on Deck
    const chevronShape = new THREE.Shape();
    chevronShape.moveTo(0, -96);
    chevronShape.lineTo(7, -84);
    chevronShape.lineTo(2.5, -84);
    chevronShape.lineTo(0, -89);
    chevronShape.lineTo(-2.5, -84);
    chevronShape.lineTo(-7, -84);
    chevronShape.closePath();

    const chevronGeo = new THREE.ExtrudeGeometry(chevronShape, { depth: 1, bevelEnabled: false });
    chevronGeo.rotateX(Math.PI / 2);
    const chevronMat = new THREE.MeshStandardMaterial({
      color: 0x3498db,
      emissive: 0x1b4f72,
      roughness: 0.4
    });
    const chevronMesh = new THREE.Mesh(chevronGeo, chevronMat);
    chevronMesh.position.set(0, 10.2, 0);
    bodyMesh.add(chevronMesh);

    this.scene.add(bodyMesh);
    this.robot3DMeshes.body = bodyMesh;

    // 5. Build Legs
    for (const legName in layout.legs) {
      const coxaGroup = this.createCoxaGroup();
      const femurGroup = this.createFemurGroup();
      const tibiaGroup = this.createTibiaGroup();

      [coxaGroup, femurGroup, tibiaGroup].forEach(g => {
        g.traverse(child => {
          if ((child as THREE.Mesh).isMesh) {
            child.userData.legName = legName;
          }
        });
      });

      this.scene.add(coxaGroup);
      this.scene.add(femurGroup);
      this.scene.add(tibiaGroup);

      this.robot3DMeshes.legs[legName] = { coxaGroup, femurGroup, tibiaGroup };
    }

    this.initAxisGuideObjects();
    this.initMotionRangeArcObjects();
    this.update3DLegHighlights();
    this.drawRobot();
  }

  private createCoxaGroup(): THREE.Group {
    const group = new THREE.Group();

    const bracket = new THREE.Mesh(this.sharedCoxaBracketGeo, this.legNeutralMat);
    bracket.position.set(28, 0, 0);
    bracket.userData = { jointType: 'coxa' };
    group.add(bracket);

    const servoBox = new THREE.Mesh(this.sharedCoxaServoGeo, this.hardwareMat);
    servoBox.position.set(30, 0, 0);
    servoBox.userData = { jointType: 'coxa' };
    group.add(servoBox);

    const ring1 = new THREE.Mesh(this.sharedJointRingGeo, this.jointNeutralMat);
    ring1.position.set(60, 0, 0);
    ring1.rotateY(Math.PI / 2);
    ring1.userData = { jointType: 'coxa' };
    group.add(ring1);

    const collar = new THREE.Mesh(this.sharedCoxaCollarGeo, this.hardwareMat);
    collar.position.set(60, 0, 0);
    collar.userData = { jointType: 'coxa' };
    group.add(collar);

    group.userData = { bracket, servoBox, ring1, collar };
    return group;
  }

  private createFemurGroup(): THREE.Group {
    const group = new THREE.Group();

    const plateInner = new THREE.Mesh(this.sharedFemurPlateGeo, this.legNeutralMat);
    plateInner.position.set(0, 0, 9.5);
    plateInner.userData = { jointType: 'femur' };
    group.add(plateInner);

    const plateOuter = new THREE.Mesh(this.sharedFemurPlateGeo, this.legNeutralMat);
    plateOuter.position.set(0, 0, -9.5);
    plateOuter.userData = { jointType: 'femur' };
    group.add(plateOuter);

    const rung1 = new THREE.Mesh(this.sharedFemurRungGeo, this.hardwareMat);
    rung1.position.set(32, 0, 0);
    rung1.userData = { jointType: 'femur' };
    group.add(rung1);

    const rung2 = new THREE.Mesh(this.sharedFemurRungGeo, this.hardwareMat);
    rung2.position.set(68, 0, 0);
    rung2.userData = { jointType: 'femur' };
    group.add(rung2);

    const kneeServo = new THREE.Mesh(this.sharedFemurKneeServoGeo, this.hardwareMat);
    kneeServo.position.set(100, 0, 0);
    kneeServo.userData = { jointType: 'femur' };
    group.add(kneeServo);

    const ringHip = new THREE.Mesh(this.sharedJointRingGeo, this.jointNeutralMat);
    ringHip.position.set(0, 0, 0);
    ringHip.userData = { jointType: 'femur' };
    group.add(ringHip);

    const ringKnee = new THREE.Mesh(this.sharedJointRingGeo, this.jointNeutralMat);
    ringKnee.position.set(100, 0, 0);
    ringKnee.userData = { jointType: 'femur' };
    group.add(ringKnee);

    group.userData = { plates: [plateInner, plateOuter], rungs: [rung1, rung2], kneeServo, ringHip, ringKnee };
    return group;
  }

  private createTibiaGroup(): THREE.Group {
    const group = new THREE.Group();

    const blade = new THREE.Mesh(this.sharedTibiaGeo, this.legNeutralMat);
    blade.userData = { jointType: 'tibia' };
    group.add(blade);

    const clamp = new THREE.Mesh(this.sharedTibiaClampGeo, this.hardwareMat);
    clamp.position.set(-2, -4, 0);
    clamp.userData = { jointType: 'tibia' };
    group.add(clamp);

    const ringKnee = new THREE.Mesh(this.sharedJointRingGeo, this.jointNeutralMat);
    ringKnee.position.set(0, 0, 0);
    ringKnee.userData = { jointType: 'tibia' };
    group.add(ringKnee);

    group.userData = { blade, clamp, ringKnee };
    return group;
  }

  private initAxisGuideObjects() {
    if (this.robot3DMeshes.axesGroup) return;

    const axisEndCapGeo = new THREE.SphereGeometry(1.6, 12, 12);
    const coxaCylGeo = new THREE.CylinderGeometry(0.85, 0.85, 54, 16);
    const pitchCylGeo = new THREE.CylinderGeometry(0.85, 0.85, 46, 16);

    const axesGroup = new THREE.Group();
    axesGroup.renderOrder = 999;

    // 1. Coxa vertical rotation axis
    const coxaAxisGroup = new THREE.Group();
    const coxaCyl = new THREE.Mesh(coxaCylGeo, this.axisGuideMat);
    const coxaCapTop = new THREE.Mesh(axisEndCapGeo, this.axisGuideMat);
    coxaCapTop.position.set(0, 27, 0);
    const coxaCapBottom = new THREE.Mesh(axisEndCapGeo, this.axisGuideMat);
    coxaCapBottom.position.set(0, -27, 0);
    coxaAxisGroup.add(coxaCyl, coxaCapTop, coxaCapBottom);
    axesGroup.add(coxaAxisGroup);

    // 2. Femur pitch rotation axis (local Z)
    const femurAxisGroup = new THREE.Group();
    const femurCyl = new THREE.Mesh(pitchCylGeo, this.axisGuideMat);
    femurCyl.rotateX(Math.PI / 2);
    const femurCap1 = new THREE.Mesh(axisEndCapGeo, this.axisGuideMat);
    femurCap1.position.set(0, 0, 23);
    const femurCap2 = new THREE.Mesh(axisEndCapGeo, this.axisGuideMat);
    femurCap2.position.set(0, 0, -23);
    femurAxisGroup.add(femurCyl, femurCap1, femurCap2);
    axesGroup.add(femurAxisGroup);

    // 3. Tibia knee pitch rotation axis (local Z)
    const tibiaAxisGroup = new THREE.Group();
    const tibiaCyl = new THREE.Mesh(pitchCylGeo, this.axisGuideMat);
    tibiaCyl.rotateX(Math.PI / 2);
    const tibiaCap1 = new THREE.Mesh(axisEndCapGeo, this.axisGuideMat);
    tibiaCap1.position.set(0, 0, 23);
    const tibiaCap2 = new THREE.Mesh(axisEndCapGeo, this.axisGuideMat);
    tibiaCap2.position.set(0, 0, -23);
    tibiaAxisGroup.add(tibiaCyl, tibiaCap1, tibiaCap2);
    axesGroup.add(tibiaAxisGroup);

    this.scene.add(axesGroup);
    this.robot3DMeshes.axesGroup = axesGroup;
    this.robot3DMeshes.axes = { coxa: coxaAxisGroup, femur: femurAxisGroup, tibia: tibiaAxisGroup };
  }

  private updateAxisGuideLines(v0: THREE.Vector3, v1: THREE.Vector3, v2: THREE.Vector3, normal: THREE.Vector3) {
    if (!this.robot3DMeshes.axes) return;
    const { coxa, femur, tibia } = this.robot3DMeshes.axes;
    coxa.position.copy(v0);
    femur.position.copy(v1);
    femur.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    tibia.position.copy(v2);
    tibia.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  }

  private initMotionRangeArcObjects() {
    if (this.robot3DMeshes.arcsGroup) return;

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

      const fanGeo = new THREE.BufferGeometry();
      const fanMesh = new THREE.Mesh(fanGeo, fanMat);

      const needleGeo = new THREE.BufferGeometry();
      const needle = new THREE.Line(needleGeo, needleMat);

      const beadGeo = new THREE.SphereGeometry(2.4, 12, 12);
      const bead = new THREE.Mesh(beadGeo, beadMeshMat);

      group.add(fanMesh, arcLine, ticksLine, needle, bead);
      group.renderOrder = 1000;
      return { group, arcLine, ticksLine, fanMesh, needle, bead, lineMat, fanMat, beadMeshMat };
    };

    const arcsGroup = new THREE.Group();
    const coxa = createSingleArc();
    const femur = createSingleArc();
    const tibia = createSingleArc();

    arcsGroup.add(coxa.group, femur.group, tibia.group);
    this.scene.add(arcsGroup);

    this.robot3DMeshes.arcsGroup = arcsGroup;
    this.motionRangeArcs = { coxa, femur, tibia };
  }

  private getJointLimits(sName: string, jointType: 'coxa' | 'femur' | 'tibia') {
    const sData = this.calibrationData[sName] || {};
    const defaultMin = jointType === 'tibia' ? -60 : -45;
    const defaultMax = jointType === 'tibia' ? 60 : 45;
    return {
      minAngle: sData.min_angle !== undefined ? sData.min_angle : defaultMin,
      maxAngle: sData.max_angle !== undefined ? sData.max_angle : defaultMax
    };
  }

  public updateMotionRangeArcs() {
    if (!this.motionRangeArcs || !this.motionRangeArcs.coxa || !this.lastSelectedLegKinematics) return;
    const { coxa, femur, tibia } = this.motionRangeArcs;

    const hasActiveLeg = Boolean(this.selectedLegKey && this.robotLayout.legs && this.robotLayout.legs[this.selectedLegKey]);
    coxa.group.visible = hasActiveLeg;
    femur.group.visible = hasActiveLeg;
    tibia.group.visible = hasActiveLeg;

    if (!hasActiveLeg) return;

    const { v0, v1, v2, normal, totalAngle, baseAngle } = this.lastSelectedLegKinematics;
    const legKey = this.selectedLegKey;
    const legDef = this.robotLayout.legs[legKey];
    if (!legDef) return;

    const names = {
      coxa: legDef.coxa.name,
      femur: legDef.femur.name,
      tibia: legDef.tibia.name
    };

    const rVec = new THREE.Vector3(Math.cos(totalAngle), 0, Math.sin(totalAngle)).normalize();
    const upVec = new THREE.Vector3(0, 1, 0);
    const segments = 32;

    // --- 1. COXA ARC (Horizontal plane at v0) ---
    {
      const isHovered = (this.currentHoveredJoint === 'coxa');
      coxa.lineMat.color.setHex(isHovered ? 0x67e8f9 : 0x38bdf8);
      coxa.lineMat.opacity = isHovered ? 1.0 : 0.85;
      coxa.fanMat.opacity = isHovered ? 0.28 : 0.14;
      coxa.beadMeshMat.color.setHex(isHovered ? 0xa5f3fc : 0x67e8f9);
      coxa.bead.scale.setScalar(isHovered ? 1.35 : 1.0);

      const sName = names.coxa;
      const limits = this.getJointLimits(sName, 'coxa');
      const minRad = limits.minAngle * Math.PI / 180;
      const maxRad = limits.maxAngle * Math.PI / 180;
      const curDeg = this.jointAngles[sName] || 0;
      const curRad = curDeg * Math.PI / 180;
      const R = 38;

      const pts: THREE.Vector3[] = [];
      const fanPositions: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const frac = i / segments;
        const a = baseAngle + minRad + frac * (maxRad - minRad);
        const p = new THREE.Vector3(v0.x + R * Math.cos(a), v0.y + 1.2, v0.z + R * Math.sin(a));
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

      const tickPts: THREE.Vector3[] = [];
      [minRad, 0, maxRad].forEach(offset => {
        const a = baseAngle + offset;
        tickPts.push(
          new THREE.Vector3(v0.x + (R - 5) * Math.cos(a), v0.y + 1.2, v0.z + (R - 5) * Math.sin(a)),
          new THREE.Vector3(v0.x + (R + 5) * Math.cos(a), v0.y + 1.2, v0.z + (R + 5) * Math.sin(a))
        );
      });
      coxa.ticksLine.geometry.setFromPoints(tickPts);

      const liveA = baseAngle + curRad;
      const curPos = new THREE.Vector3(v0.x + R * Math.cos(liveA), v0.y + 1.4, v0.z + R * Math.sin(liveA));
      coxa.needle.geometry.setFromPoints([new THREE.Vector3(v0.x, v0.y + 1.2, v0.z), curPos]);
      coxa.bead.position.copy(curPos);
    }

    // --- 2. FEMUR ARC (Vertical bending plane at v1) ---
    {
      const isHovered = (this.currentHoveredJoint === 'femur');
      femur.lineMat.color.setHex(isHovered ? 0x67e8f9 : 0x38bdf8);
      femur.lineMat.opacity = isHovered ? 1.0 : 0.85;
      femur.fanMat.opacity = isHovered ? 0.28 : 0.14;
      femur.beadMeshMat.color.setHex(isHovered ? 0xa5f3fc : 0x67e8f9);
      femur.bead.scale.setScalar(isHovered ? 1.35 : 1.0);

      const sName = names.femur;
      const limits = this.getJointLimits(sName, 'femur');
      const minRad = limits.minAngle * Math.PI / 180;
      const maxRad = limits.maxAngle * Math.PI / 180;
      const curDeg = this.jointAngles[sName] || 0;
      const curRad = curDeg * Math.PI / 180;
      const R = 42;

      const pts: THREE.Vector3[] = [];
      const fanPositions: number[] = [];
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

      const tickPts: THREE.Vector3[] = [];
      [minRad, 0, maxRad].forEach(offset => {
        const pInner = new THREE.Vector3().copy(v1).addScaledVector(rVec, (R - 5) * Math.cos(offset)).addScaledVector(upVec, (R - 5) * Math.sin(offset));
        const pOuter = new THREE.Vector3().copy(v1).addScaledVector(rVec, (R + 5) * Math.cos(offset)).addScaledVector(upVec, (R + 5) * Math.sin(offset));
        tickPts.push(pInner, pOuter);
      });
      femur.ticksLine.geometry.setFromPoints(tickPts);

      const curPos = new THREE.Vector3().copy(v1).addScaledVector(rVec, R * Math.cos(curRad)).addScaledVector(upVec, R * Math.sin(curRad));
      femur.needle.geometry.setFromPoints([new THREE.Vector3().copy(v1), curPos]);
      femur.bead.position.copy(curPos);
    }

    // --- 3. TIBIA ARC (Knee bending plane at v2) ---
    {
      const isHovered = (this.currentHoveredJoint === 'tibia');
      tibia.lineMat.color.setHex(isHovered ? 0x67e8f9 : 0x38bdf8);
      tibia.lineMat.opacity = isHovered ? 1.0 : 0.85;
      tibia.fanMat.opacity = isHovered ? 0.28 : 0.14;
      tibia.beadMeshMat.color.setHex(isHovered ? 0xa5f3fc : 0x67e8f9);
      tibia.bead.scale.setScalar(isHovered ? 1.35 : 1.0);

      const sName = names.tibia;
      const limits = this.getJointLimits(sName, 'tibia');
      const minRad = limits.minAngle * Math.PI / 180;
      const maxRad = limits.maxAngle * Math.PI / 180;
      const curDeg = this.jointAngles[sName] || 0;
      const curRad = curDeg * Math.PI / 180;

      const femurDeg = this.jointAngles[names.femur] || 0;
      const femurRad = femurDeg * Math.PI / 180;
      const kneeCenterPitch = femurRad - Math.PI / 2;
      const R = 44;

      const pts: THREE.Vector3[] = [];
      const fanPositions: number[] = [];
      for (let i = 0; i <= segments; i++) {
        const frac = i / segments;
        const servoAngle = minRad + frac * (maxRad - minRad);
        const pitchAngle = kneeCenterPitch - servoAngle;
        const p = new THREE.Vector3()
          .copy(v2)
          .addScaledVector(rVec, R * Math.cos(pitchAngle))
          .addScaledVector(upVec, R * Math.sin(pitchAngle));
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

      const tickPts: THREE.Vector3[] = [];
      [minRad, 0, maxRad].forEach(offset => {
        const pitchAngle = kneeCenterPitch - offset;
        const pInner = new THREE.Vector3().copy(v2).addScaledVector(rVec, (R - 5) * Math.cos(pitchAngle)).addScaledVector(upVec, (R - 5) * Math.sin(pitchAngle));
        const pOuter = new THREE.Vector3().copy(v2).addScaledVector(rVec, (R + 5) * Math.cos(pitchAngle)).addScaledVector(upVec, (R + 5) * Math.sin(pitchAngle));
        tickPts.push(pInner, pOuter);
      });
      tibia.ticksLine.geometry.setFromPoints(tickPts);

      const livePitch = kneeCenterPitch - curRad;
      const curPos = new THREE.Vector3().copy(v2).addScaledVector(rVec, R * Math.cos(livePitch)).addScaledVector(upVec, R * Math.sin(livePitch));
      tibia.needle.geometry.setFromPoints([new THREE.Vector3().copy(v2), curPos]);
      tibia.bead.position.copy(curPos);
    }
  }

  public update3DLegHighlights(activeLegKey = this.selectedLegKey, hoveredJoint = this.currentHoveredJoint) {
    if (!this.robot3DMeshes || !this.robot3DMeshes.legs) return;

    for (const legName in this.robot3DMeshes.legs) {
      const leg = this.robot3DMeshes.legs[legName];
      if (!leg) continue;

      const isSelected = (legName === activeLegKey);
      const isCoxaActive = isSelected && (hoveredJoint === 'coxa');
      const isFemurActive = isSelected && (hoveredJoint === 'femur');
      const isTibiaActive = isSelected && (hoveredJoint === 'tibia');

      // 1. Coxa Segment
      if (leg.coxaGroup && leg.coxaGroup.userData) {
        const { bracket, servoBox, ring1 } = leg.coxaGroup.userData;
        if (bracket) bracket.material = isSelected ? (isCoxaActive ? this.legActiveSegmentMat : this.legSelectedMat) : this.legNeutralMat;
        if (servoBox) servoBox.material = isSelected ? (isCoxaActive ? this.jointActiveMat : this.jointSelectedMat) : this.hardwareMat;
        if (ring1) ring1.material = isSelected ? ((isCoxaActive || isFemurActive) ? this.jointActiveMat : this.jointSelectedMat) : this.jointNeutralMat;
      }

      // 2. Femur Segment
      if (leg.femurGroup && leg.femurGroup.userData) {
        const { plates, rungs, kneeServo, ringHip, ringKnee } = leg.femurGroup.userData;
        if (plates) {
          const targetMat = isSelected ? (isFemurActive ? this.legActiveSegmentMat : this.legSelectedMat) : this.legNeutralMat;
          plates.forEach((p: any) => { if (p) p.material = targetMat; });
        }
        if (rungs) {
          const targetRungMat = isSelected ? (isFemurActive ? this.jointActiveMat : this.jointSelectedMat) : this.hardwareMat;
          rungs.forEach((r: any) => { if (r) r.material = targetRungMat; });
        }
        if (kneeServo) kneeServo.material = isSelected ? ((isFemurActive || isTibiaActive) ? this.jointActiveMat : this.jointSelectedMat) : this.hardwareMat;
        if (ringHip) ringHip.material = isSelected ? (isFemurActive ? this.jointActiveMat : this.jointSelectedMat) : this.jointNeutralMat;
        if (ringKnee) ringKnee.material = isSelected ? ((isFemurActive || isTibiaActive) ? this.jointActiveMat : this.jointSelectedMat) : this.jointNeutralMat;
      }

      // 3. Tibia Segment
      if (leg.tibiaGroup && leg.tibiaGroup.userData) {
        const { blade, clamp, ringKnee } = leg.tibiaGroup.userData;
        if (blade) blade.material = isSelected ? (isTibiaActive ? this.legActiveSegmentMat : this.legSelectedMat) : this.legNeutralMat;
        if (clamp) clamp.material = isSelected ? (isTibiaActive ? this.jointActiveMat : this.jointSelectedMat) : this.hardwareMat;
        if (ringKnee) ringKnee.material = isSelected ? (isTibiaActive ? this.jointActiveMat : this.jointSelectedMat) : this.jointNeutralMat;
      }
    }
  }

  public computeLeg3D(leg: any, angles: Record<string, number>) {
    const mount = leg.mount_point;
    const baseAngle = (leg.base_angle !== undefined) ? leg.base_angle : 0;

    const coxaAngle = (angles[leg.coxa.name] || 0) * Math.PI / 180;
    const femurAngle = (angles[leg.femur.name] || 0) * Math.PI / 180;
    const tibiaServoAngle = (angles[leg.tibia.name] || 0) * Math.PI / 180;

    const totalAngle = baseAngle + coxaAngle;

    // p0: Body mount point (Z = 0)
    const p0 = { x: mount.x, y: mount.y, z: 0 };

    // p1: Coxa end / Femur start (horizontal plane)
    const p1 = {
      x: p0.x + leg.coxa.length * Math.cos(totalAngle),
      y: p0.y + leg.coxa.length * Math.sin(totalAngle),
      z: 0
    };

    // p2: Knee joint (Femur points upwards)
    const femurHoriz = leg.femur.length * Math.cos(femurAngle);
    const femurVert = leg.femur.length * Math.sin(femurAngle);

    const p2 = {
      x: p1.x + femurHoriz * Math.cos(totalAngle),
      y: p1.y + femurHoriz * Math.sin(totalAngle),
      z: p1.z + femurVert
    };

    // Tibia: knee bend angle is 90° + tibiaServoAngle
    const kneeBend = (Math.PI / 2) + tibiaServoAngle;
    const tibiaPitch = femurAngle - kneeBend;

    const tibiaHoriz = leg.tibia.length * Math.cos(tibiaPitch);
    const tibiaVert = leg.tibia.length * Math.sin(tibiaPitch);

    // p3: Foot tip
    const p3 = {
      x: p2.x + tibiaHoriz * Math.cos(totalAngle),
      y: p2.y + tibiaHoriz * Math.sin(totalAngle),
      z: p2.z + tibiaVert
    };

    return { p0, p1, p2, p3 };
  }

  public update3DLegs(legs3D: any) {
    if (!this.scene) return;
    const toVec3 = (p: any) => new THREE.Vector3(p.x, p.z, p.y);

    for (const legName in legs3D) {
      const m = this.robot3DMeshes.legs[legName];
      if (!m) continue;

      const pts = legs3D[legName];
      const v0 = toVec3(pts.p0);
      const v1 = toVec3(pts.p1);
      const v2 = toVec3(pts.p2);
      const v3 = toVec3(pts.p3);

      const legDef = this.robotLayout.legs ? this.robotLayout.legs[legName] : null;
      const baseAngle = (legDef && legDef.base_angle !== undefined) ? legDef.base_angle : 0;
      const coxaServoName = legDef && legDef.coxa ? legDef.coxa.name : `${legName}_coxa`;
      const coxaAngle = (this.jointAngles[coxaServoName] || 0) * Math.PI / 180;
      const totalAngle = baseAngle + coxaAngle;

      const normal = new THREE.Vector3(-Math.sin(totalAngle), 0, Math.cos(totalAngle)).normalize();

      // 1. Coxa Segment
      const dir0 = new THREE.Vector3().subVectors(v1, v0);
      if (dir0.length() > 0.001) {
        const axisX0 = dir0.clone().normalize();
        const axisY0 = new THREE.Vector3(0, 1, 0);
        const axisZ0 = new THREE.Vector3().crossVectors(axisX0, axisY0).normalize();
        const mat0 = new THREE.Matrix4().makeBasis(axisX0, axisY0, axisZ0);
        m.coxaGroup.position.copy(v0);
        m.coxaGroup.quaternion.setFromRotationMatrix(mat0);
      }

      // 2. Femur Segment
      const dir1 = new THREE.Vector3().subVectors(v2, v1);
      if (dir1.length() > 0.001) {
        const axisX1 = dir1.clone().normalize();
        const axisY1 = new THREE.Vector3().crossVectors(normal, axisX1).normalize();
        const axisZ1 = new THREE.Vector3().crossVectors(axisX1, axisY1).normalize();
        const mat1 = new THREE.Matrix4().makeBasis(axisX1, axisY1, axisZ1);
        m.femurGroup.position.copy(v1);
        m.femurGroup.quaternion.setFromRotationMatrix(mat1);
      }

      // 3. Tibia Segment
      const dir2 = new THREE.Vector3().subVectors(v3, v2);
      if (dir2.length() > 0.001) {
        const axisY2 = dir2.clone().negate().normalize();
        const axisX2 = new THREE.Vector3().crossVectors(axisY2, normal).normalize();
        const axisZ2 = new THREE.Vector3().crossVectors(axisX2, axisY2).normalize();
        const mat2 = new THREE.Matrix4().makeBasis(axisX2, axisY2, axisZ2);
        m.tibiaGroup.position.copy(v2);
        m.tibiaGroup.quaternion.setFromRotationMatrix(mat2);
      }

      if (legName === this.selectedLegKey) {
        this.lastSelectedLegKinematics = { v0, v1, v2, v3, normal, totalAngle, baseAngle, legDef };
        this.updateAxisGuideLines(v0, v1, v2, normal);
        this.updateMotionRangeArcs();
      }
    }
  }

  public drawRobot() {
    if (!this.robotLayout.legs) return;

    const legs3D: any = {};
    for (const legName in this.robotLayout.legs) {
      legs3D[legName] = this.computeLeg3D(this.robotLayout.legs[legName], this.jointAngles);
    }

    this.update3DLegs(legs3D);
    this.update3DLegHighlights();

    this.syncCanvasDimensions();
    this.drawTopView(legs3D);
    this.drawFrontView(legs3D);
    this.drawSideView(legs3D);
  }

  // --- 2D ORTHOGONAL PROJECTION VIEWS ---

  public drawTopView(legs3D: any) {
    const canvas = this.containers.topCanvas;
    const ctx = this.topCtx;
    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;
    ctx.clearRect(0, 0, width, height);

    // Orientation indicator
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.fillText('TOP', 12, 16);

    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width / 680, height / 580);

    // 1. Draw outer biomimetic chassis hull
    const hullPts = this.getChassisHullContour();
    ctx.beginPath();
    for (let i = 0; i < hullPts.length; i++) {
      const x = centerX + hullPts[i].x * scale;
      const y = centerY + hullPts[i].y * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#222432';
    ctx.fill();
    ctx.strokeStyle = '#3e425a';
    ctx.lineWidth = 2.2;
    ctx.stroke();

    // 2. Inner electronics bay deck
    const bayPts = this.getChassisBayContour();
    ctx.beginPath();
    for (let i = 0; i < bayPts.length; i++) {
      const x = centerX + bayPts[i].x * scale;
      const y = centerY + bayPts[i].y * scale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#161722';
    ctx.fill();
    ctx.strokeStyle = '#2d3044';
    ctx.lineWidth = 1;
    ctx.stroke();

    // 3. Longitudinal center guideline
    ctx.beginPath();
    ctx.setLineDash([4, 4]);
    ctx.moveTo(centerX, centerY - 80 * scale);
    ctx.lineTo(centerX, centerY + 80 * scale);
    ctx.strokeStyle = '#2d3044';
    ctx.stroke();
    ctx.setLineDash([]);

    // 4. Front direction indicator arrow (pointing forward/up: -Y)
    ctx.beginPath();
    ctx.moveTo(centerX - 8 * scale, centerY - 84 * scale);
    ctx.lineTo(centerX + 8 * scale, centerY - 84 * scale);
    ctx.lineTo(centerX, centerY - 96 * scale);
    ctx.closePath();
    ctx.fillStyle = '#3498db';
    ctx.fill();

    // 5. Headlight LEDs (Cyan)
    ctx.fillStyle = '#00d2d3';
    ctx.beginPath();
    ctx.arc(centerX - 16 * scale, centerY - 106 * scale, 2.8 * scale, 0, Math.PI * 2);
    ctx.arc(centerX + 16 * scale, centerY - 106 * scale, 2.8 * scale, 0, Math.PI * 2);
    ctx.fill();

    // 6. Draw each leg in top-down view (unselected first, selected leg on top)
    const legNames = Object.keys(legs3D);
    legNames.sort((a, b) => (a === this.selectedLegKey ? 1 : b === this.selectedLegKey ? -1 : 0));

    this.topViewLegPoints = {};
    for (const legName of legNames) {
      const pts = legs3D[legName];
      if (!pts) continue;
      const isSelected = (legName === this.selectedLegKey);
      const c0 = { x: centerX + pts.p0.x * scale, y: centerY + pts.p0.y * scale };
      const c1 = { x: centerX + pts.p1.x * scale, y: centerY + pts.p1.y * scale };
      const c2 = { x: centerX + pts.p2.x * scale, y: centerY + pts.p2.y * scale };
      const c3 = { x: centerX + pts.p3.x * scale, y: centerY + pts.p3.y * scale };
      this.topViewLegPoints[legName] = { c0, c1, c2, c3 };

      const isCoxaActive = isSelected && (this.currentHoveredJoint === 'coxa');
      const isFemurActive = isSelected && (this.currentHoveredJoint === 'femur');
      const isTibiaActive = isSelected && (this.currentHoveredJoint === 'tibia');

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

      // Tibia segment
      ctx.beginPath();
      ctx.moveTo(c2.x, c2.y);
      ctx.lineTo(c3.x, c3.y);
      ctx.strokeStyle = isSelected ? (isTibiaActive ? '#38bdf8' : '#2980b9') : '#383a4c';
      ctx.lineWidth = isSelected ? (isTibiaActive ? 4 : 3) : 1.8;
      ctx.stroke();

      // Chassis mount axis point (c0) - active leg gets Minimap Blue glow #38bdf8
      ctx.fillStyle = isSelected ? '#38bdf8' : '#d0d4de';
      ctx.beginPath();
      ctx.arc(c0.x, c0.y, isSelected ? 4.5 : 3.5, 0, 2 * Math.PI);
      ctx.fill();
      if (isSelected) {
        ctx.strokeStyle = '#0284c7';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Joint points
      ctx.fillStyle = isSelected ? '#1b3b5c' : '#282936';
      ctx.beginPath(); ctx.arc(c1.x, c1.y, 3, 0, 2 * Math.PI); ctx.fill();
      ctx.beginPath(); ctx.arc(c2.x, c2.y, 3, 0, 2 * Math.PI); ctx.fill();
      // Foot tip circle completely removed per user request
    }
  }

  public drawFrontView(legs3D: any) {
    const canvas = this.containers.frontCanvas;
    const ctx = this.frontCtx;
    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;
    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const scale = Math.min(width / 620, height / 290);
    const bodyCanvasY = height * 0.36;
    const groundCanvasY = bodyCanvasY + 80 * scale;

    // 1. Ground Plane (Line with Hatching)
    ctx.strokeStyle = '#3e3e52';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, groundCanvasY);
    ctx.lineTo(width - 15, groundCanvasY);
    ctx.stroke();

    ctx.strokeStyle = '#2d2d3d';
    ctx.lineWidth = 1;
    for (let x = 20; x < width - 20; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, groundCanvasY);
      ctx.lineTo(x - 8, groundCanvasY + 8);
      ctx.stroke();
    }

    // Direction & Level indicators
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.fillText('LEFT', 12, 16);
    ctx.fillText('RIGHT', width - 46, 16);
    ctx.fillText('Ground (-80mm)', 12, groundCanvasY + 14);

    // 2. Depth ordering for Front View
    this.frontViewLegPoints = {};
    for (const legName of ['left_rear', 'right_rear']) {
      if (legs3D[legName]) {
        const isSelected = (legName === this.selectedLegKey);
        this.drawLegFront(ctx, legs3D[legName], centerX, bodyCanvasY, scale, isSelected ? 0.95 : 0.38, isSelected, legName);
      }
    }

    for (const legName of ['left_middle', 'right_middle']) {
      if (legs3D[legName]) {
        const isSelected = (legName === this.selectedLegKey);
        this.drawLegFront(ctx, legs3D[legName], centerX, bodyCanvasY, scale, isSelected ? 0.95 : 0.68, isSelected, legName);
      }
    }

    // 3. Draw Robot Body Chassis (Front Cross Section)
    let minX = -80;
    let maxX = 80;
    const bodyStartX = centerX + minX * scale;
    const bodyWidth = (maxX - minX) * scale;
    const chassisHeight = 22 * scale;

    ctx.fillStyle = '#343444';
    ctx.strokeStyle = '#4e4e62';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(bodyStartX, bodyCanvasY - chassisHeight / 2, bodyWidth, chassisHeight, 5);
    } else {
      ctx.rect(bodyStartX, bodyCanvasY - chassisHeight / 2, bodyWidth, chassisHeight);
    }
    ctx.fill();
    ctx.stroke();

    // Front headlights
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(centerX - 16 * scale, bodyCanvasY, 3.5 * scale, 0, 2 * Math.PI);
    ctx.arc(centerX + 16 * scale, bodyCanvasY, 3.5 * scale, 0, 2 * Math.PI);
    ctx.fill();

    // 4. Front legs (closest to viewer)
    for (const legName of ['left_front', 'right_front']) {
      if (legs3D[legName]) {
        const isSelected = (legName === this.selectedLegKey);
        this.drawLegFront(ctx, legs3D[legName], centerX, bodyCanvasY, scale, 1.0, isSelected, legName);
      }
    }

    // 5. If selected leg is in the background, redraw on top
    if (this.selectedLegKey && !this.selectedLegKey.endsWith('_front') && legs3D[this.selectedLegKey]) {
      this.drawLegFront(ctx, legs3D[this.selectedLegKey], centerX, bodyCanvasY, scale, 1.0, true, this.selectedLegKey);
    }
  }

  private drawLegFront(ctx: CanvasRenderingContext2D, pts: any, centerX: number, bodyCanvasY: number, scale: number, opacity: number, isSelected: boolean, legName: string) {
    ctx.save();
    ctx.globalAlpha = opacity;

    const toCanvas = (p: any) => ({
      x: centerX + p.x * scale,
      y: bodyCanvasY - p.z * scale
    });

    const c0 = toCanvas(pts.p0);
    const c1 = toCanvas(pts.p1);
    const c2 = toCanvas(pts.p2);
    const c3 = toCanvas(pts.p3);

    if (legName) {
      this.frontViewLegPoints[legName] = { c0, c1, c2, c3 };
    }

    const isCoxaActive = isSelected && (this.currentHoveredJoint === 'coxa');
    const isFemurActive = isSelected && (this.currentHoveredJoint === 'femur');
    const isTibiaActive = isSelected && (this.currentHoveredJoint === 'tibia');

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

    // Tibia sickle blade segment (curved outward)
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

    // Chassis attachment axis dot (c0)
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

    ctx.restore();
  }

  public drawSideView(legs3D: any) {
    const canvas = this.containers.sideCanvas;
    const ctx = this.sideCtx;
    const width = canvas.width;
    const height = canvas.height;
    if (width === 0 || height === 0) return;
    ctx.clearRect(0, 0, width, height);

    const centerX = width / 2;
    const scale = Math.min(width / 580, height / 290);
    const bodyCanvasY = height * 0.36;
    const groundCanvasY = bodyCanvasY + 80 * scale;

    // 1. Ground Plane (Line with Hatching)
    ctx.strokeStyle = '#3e3e52';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(15, groundCanvasY);
    ctx.lineTo(width - 15, groundCanvasY);
    ctx.stroke();

    ctx.strokeStyle = '#2d2d3d';
    ctx.lineWidth = 1;
    for (let x = 20; x < width - 20; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, groundCanvasY);
      ctx.lineTo(x - 8, groundCanvasY + 8);
      ctx.stroke();
    }

    // Direction & Level indicators
    ctx.fillStyle = '#6b7280';
    ctx.font = '10px sans-serif';
    ctx.fillText('FRONT', 12, 16);
    ctx.fillText('REAR', width - 44, 16);
    ctx.fillText('Ground (-80mm)', 12, groundCanvasY + 14);

    // 2. Draw Left (Far/Background) Legs with dimmed opacity (0.40)
    this.sideViewLegPoints = {};
    for (const legName in legs3D) {
      if (legName.startsWith('left_')) {
        const isSelected = (legName === this.selectedLegKey);
        this.drawLegSide(ctx, legs3D[legName], centerX, bodyCanvasY, scale, isSelected ? 0.95 : 0.40, isSelected, legName);
      }
    }

    // 3. Draw Robot Body Chassis (Side Profile)
    let minY = -70;
    let maxY = 70;
    const bodyStartX = centerX + minY * scale;
    const bodyWidth = (maxY - minY) * scale;
    const chassisHeight = 22 * scale;

    ctx.fillStyle = '#343444';
    ctx.strokeStyle = '#4e4e62';
    ctx.lineWidth = 2;
    ctx.beginPath();
    if ((ctx as any).roundRect) {
      (ctx as any).roundRect(bodyStartX, bodyCanvasY - chassisHeight / 2, bodyWidth, chassisHeight, 5);
    } else {
      ctx.rect(bodyStartX, bodyCanvasY - chassisHeight / 2, bodyWidth, chassisHeight);
    }
    ctx.fill();
    ctx.stroke();

    // Direction arrow on body pointing FRONT (left)
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.moveTo(bodyStartX + 8, bodyCanvasY);
    ctx.lineTo(bodyStartX + 18, bodyCanvasY - 5);
    ctx.lineTo(bodyStartX + 18, bodyCanvasY + 5);
    ctx.closePath();
    ctx.fill();

    // 4. Draw Right (Near/Foreground) Legs with full opacity (1.0)
    for (const legName in legs3D) {
      if (legName.startsWith('right_')) {
        const isSelected = (legName === this.selectedLegKey);
        this.drawLegSide(ctx, legs3D[legName], centerX, bodyCanvasY, scale, 1.0, isSelected, legName);
      }
    }

    // 5. If selected leg is in the background (left side), redraw on top
    if (this.selectedLegKey && this.selectedLegKey.startsWith('left_') && legs3D[this.selectedLegKey]) {
      this.drawLegSide(ctx, legs3D[this.selectedLegKey], centerX, bodyCanvasY, scale, 1.0, true, this.selectedLegKey);
    }
  }

  private drawLegSide(ctx: CanvasRenderingContext2D, pts: any, centerX: number, bodyCanvasY: number, scale: number, opacity: number, isSelected: boolean, legName: string) {
    ctx.save();
    ctx.globalAlpha = opacity;

    const toCanvas = (p: any) => ({
      x: centerX + p.y * scale,
      y: bodyCanvasY - p.z * scale
    });

    const c0 = toCanvas(pts.p0);
    const c1 = toCanvas(pts.p1);
    const c2 = toCanvas(pts.p2);
    const c3 = toCanvas(pts.p3);

    if (legName) {
      this.sideViewLegPoints[legName] = { c0, c1, c2, c3 };
    }

    const isCoxaActive = isSelected && (this.currentHoveredJoint === 'coxa');
    const isFemurActive = isSelected && (this.currentHoveredJoint === 'femur');
    const isTibiaActive = isSelected && (this.currentHoveredJoint === 'tibia');

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

    // Tibia sickle blade segment (curved outward)
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

    // Chassis attachment axis dot (c0)
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

    ctx.restore();
  }

  // --- HIT DETECTION & INTERACTION ---

  private distToSegmentSquared(p: { x: number; y: number }, v: { x: number; y: number }, w: { x: number; y: number }) {
    const l2 = (v.x - w.x) * (v.x - w.x) + (v.y - w.y) * (v.y - w.y);
    if (l2 === 0) return (p.x - v.x) * (p.x - v.x) + (p.y - v.y) * (p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = v.x + t * (w.x - v.x);
    const projY = v.y + t * (w.y - v.y);
    return (p.x - projX) * (p.x - projX) + (p.y - projY) * (p.y - projY);
  }

  private findClickedLeg(canvas: HTMLCanvasElement, e: MouseEvent, legPointsMap: Record<string, any>): string | null {
    if (!canvas || !legPointsMap) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const p = {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };

    let closestLeg: string | null = null;
    let minD2 = 28 * 28; // 28px hit tolerance

    for (const legName in legPointsMap) {
      const pts = legPointsMap[legName];
      if (!pts || !pts.c0 || !pts.c1 || !pts.c2 || !pts.c3) continue;
      const d0 = this.distToSegmentSquared(p, pts.c0, pts.c1);
      const d1 = this.distToSegmentSquared(p, pts.c1, pts.c2);
      const d2 = this.distToSegmentSquared(p, pts.c2, pts.c3);
      const dMin = Math.min(d0, d1, d2);
      if (dMin < minD2) {
        minD2 = dMin;
        closestLeg = legName;
      }
    }
    return closestLeg;
  }

  private setupEvents() {
    // 2D Canvases Click & Hover
    [
      { canvas: this.containers.topCanvas, getMap: () => this.topViewLegPoints },
      { canvas: this.containers.frontCanvas, getMap: () => this.frontViewLegPoints },
      { canvas: this.containers.sideCanvas, getMap: () => this.sideViewLegPoints }
    ].forEach(({ canvas, getMap }) => {
      canvas.addEventListener('click', (e) => {
        const leg = this.findClickedLeg(canvas, e, getMap());
        if (leg) {
          this.selectedLegKey = leg;
          this.callbacks.onSelectLeg(leg);
          this.drawRobot();
        }
      });

      canvas.addEventListener('mousemove', (e) => {
        const leg = this.findClickedLeg(canvas, e, getMap());
        canvas.style.cursor = leg ? 'pointer' : 'default';
      });

      canvas.addEventListener('mouseleave', () => {
        canvas.style.cursor = 'default';
      });
    });

    // 3D Canvas Click Raycaster
    const dom = this.renderer.domElement;
    dom.addEventListener('click', (e) => {
      const rect = dom.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);

      const candidates: THREE.Mesh[] = [];
      for (const legName in this.robot3DMeshes.legs) {
        const leg = this.robot3DMeshes.legs[legName];
        if (!leg) continue;
        [leg.coxaGroup, leg.femurGroup, leg.tibiaGroup].forEach(g => {
          if (g) {
            g.traverse((child: any) => {
              if (child.isMesh) {
                child.userData.legName = legName;
                candidates.push(child);
              }
            });
          }
        });
      }

      const intersects = this.raycaster.intersectObjects(candidates, false);
      if (intersects.length > 0) {
        const hitLeg = intersects[0].object.userData.legName;
        if (hitLeg) {
          this.selectedLegKey = hitLeg;
          this.callbacks.onSelectLeg(hitLeg);
          this.drawRobot();
        }
      }
    });

    // 3D Canvas Joint Hover
    dom.addEventListener('pointermove', (e) => {
      const rect = dom.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);

      const activeLeg = this.robot3DMeshes.legs[this.selectedLegKey];
      if (!activeLeg) return;

      const candidates: THREE.Mesh[] = [];
      [activeLeg.coxaGroup, activeLeg.femurGroup, activeLeg.tibiaGroup].forEach(g => {
        if (g) {
          g.traverse((child: any) => {
            if (child.isMesh && child.userData && child.userData.jointType) {
              candidates.push(child);
            }
          });
        }
      });

      const intersects = this.raycaster.intersectObjects(candidates, false);
      if (intersects.length > 0) {
        const jointType = intersects[0].object.userData.jointType;
        if (this.currentHoveredJoint !== jointType) {
          this.currentHoveredJoint = jointType;
          this.callbacks.onHoverJoint(jointType);
          this.update3DLegHighlights(this.selectedLegKey, this.currentHoveredJoint);
          this.updateMotionRangeArcs();
          this.drawRobot();
        }
      } else {
        if (this.currentHoveredJoint !== null) {
          this.currentHoveredJoint = null;
          this.callbacks.onHoverJoint(null);
          this.update3DLegHighlights(this.selectedLegKey, null);
          this.updateMotionRangeArcs();
          this.drawRobot();
        }
      }
    });

    dom.addEventListener('pointerleave', () => {
      if (this.currentHoveredJoint !== null) {
        this.currentHoveredJoint = null;
        this.callbacks.onHoverJoint(null);
        this.update3DLegHighlights(this.selectedLegKey, null);
        this.updateMotionRangeArcs();
        this.drawRobot();
      }
    });

    // Resize Observer
    if (window.ResizeObserver) {
      this.resizeObserver = new ResizeObserver(() => {
        this.resize();
      });
      this.resizeObserver.observe(this.containers.threeContainer);
      this.resizeObserver.observe(this.containers.topCanvas);
    }
  }

  public setJointAngles(angles: Record<string, number>) {
    Object.assign(this.jointAngles, angles);
    this.drawRobot();
  }

  public setSelectedLegKey(legKey: string) {
    this.selectedLegKey = legKey;
    this.drawRobot();
  }

  public setCurrentHoveredJoint(joint: 'coxa' | 'femur' | 'tibia' | null) {
    this.currentHoveredJoint = joint;
    this.update3DLegHighlights();
    this.updateMotionRangeArcs();
    this.drawRobot();
  }

  public setCalibrationData(data: Record<string, any>) {
    this.calibrationData = data;
    this.updateMotionRangeArcs();
  }

  public resetCamera() {
    if (this.camera && this.controls) {
      this.camera.position.set(380, 280, 380);
      this.controls.target.set(0, -25, 0);
      this.controls.update();
    }
  }

  public resize() {
    const el = this.containers.threeContainer;
    const width = el.clientWidth || 820;
    const height = el.clientHeight || 520;
    if (this.renderer && this.camera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
    this.syncCanvasDimensions();
    this.drawRobot();
  }

  public destroy() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.controls) this.controls.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
      if (this.renderer.domElement.parentElement) {
        this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
      }
    }
  }
}
