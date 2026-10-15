/* Original, procedural 3D artwork for the Gaeddirang bookshop prototype. */
function createBookshopScene(THREE, RoundedBoxGeometry, options) {
  const host = options.container;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8ece0');
  scene.fog = new THREE.Fog('#e8ece0', 38, 70);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, host.clientWidth < 600 ? 1.45 : 1.8));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor('#e8ece0', 1);
  renderer.domElement.setAttribute('aria-label', '입체 개띠랑 책방. 책장, 책방지기와 가상 손님을 클릭하거나 빈 바닥을 눌러 걸어갈 수 있어요.');
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:pan-y;cursor:grab';
  host.appendChild(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, .1, 100);
  const cameraTarget = new THREE.Vector3(0, 2, .5);
  const cameraHome = { azimuth: -.56, elevation: .65 };
  let azimuth = cameraHome.azimuth;
  let elevation = cameraHome.elevation;
  let targetAzimuth = azimuth;
  let targetElevation = elevation;
  const geometries = new Map();
  const materials = [];
  const textures = [];
  const colliders = [];
  const interactionRoots = [];
  const labels = [];
  const clock = new THREE.Clock();
  let elapsed = 0;
  let animationFrame = 0;
  let disposed = false;
  let inView = true;
  let dayMode = 'day';
  let activeTarget = null;
  let pendingInteraction = null;
  let currentPath = [];
  let pointerStart = null;
  let dragDistance = 0;
  let hoveringInteractive = false;
  let hoverObject = null;
  let keeperGreetingUntil = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const pointerWorld = new THREE.Vector3();
  const randomSeed = { n: 817 };
  const random = () => {
    randomSeed.n = (randomSeed.n * 1664525 + 1013904223) >>> 0;
    return randomSeed.n / 4294967296;
  };
  function material(color, extra) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: .76, metalness: 0, ...extra });
    materials.push(m);
    return m;
  }
  const palette = {
    oak: material('#c49862', { roughness: .62 }),
    oakLight: material('#d8b786', { roughness: .67 }),
    oakEdge: material('#a57748', { roughness: .69 }),
    ivory: material('#fff3d9'),
    plaster: material('#f2e7cc', { roughness: 1 }),
    sage: material('#7b9a6b'),
    darkSage: material('#536b4c'),
    moss: material('#668750'),
    terracotta: material('#c88767', { roughness: .9 }),
    ceramic: material('#f4e6c8', { roughness: .34 }),
    cream: material('#f6e2bb', { roughness: .84 }),
    fur: material('#e7c89b', { roughness: 1 }),
    dark: material('#34291f', { roughness: .38 }),
    brass: material('#b8914e', { roughness: .38, metalness: .35 }),
    page: material('#efdfbd', { roughness: .94 }),
    linen: material('#b9c6a0', { roughness: 1 }),
    pink: material('#dfaca1'),
    floor: material('#d8bc89', { roughness: .86 }),
    floorAlt: material('#d3b27d', { roughness: .85 }),
  };
  const woodCanvas = document.createElement('canvas');
  woodCanvas.width = woodCanvas.height = 512;
  const woodCtx = woodCanvas.getContext('2d');
  woodCtx.fillStyle = '#dec397';
  woodCtx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 230; i++) {
    const x = random() * 512;
    woodCtx.beginPath();
    woodCtx.strokeStyle = `rgba(119,82,43,${.018 + random() * .027})`;
    woodCtx.lineWidth = .35 + random() * 1.2;
    woodCtx.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 16) woodCtx.lineTo(x + Math.sin(y * .021 + i) * (2 + random() * 7), y);
    woodCtx.stroke();
  }
  const woodTexture = new THREE.CanvasTexture(woodCanvas);
  woodTexture.colorSpace = THREE.SRGBColorSpace;
  woodTexture.wrapS = woodTexture.wrapT = THREE.RepeatWrapping;
  woodTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  textures.push(woodTexture);
  palette.floor.map = woodTexture;
  palette.floorAlt.map = woodTexture;
  if (options.woodTextureUrl) {
    new THREE.TextureLoader().load(options.woodTextureUrl, tex => {
      if (disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(2, 2);
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textures.push(tex);
      palette.oak.map = tex;
      palette.oakLight.map = tex;
      palette.oak.needsUpdate = palette.oakLight.needsUpdate = true;
    });
  }
  function roundedGeometry(w, h, d, radius = .09, smoothness = 3) {
    const r = Math.min(radius, w / 2, h / 2, d / 2);
    const key = [w, h, d, r, smoothness].join(',');
    if (!geometries.has(key)) geometries.set(key, new RoundedBoxGeometry(w, h, d, smoothness, r));
    return geometries.get(key);
  }
  function box(parent, w, h, d, mat, x = 0, y = 0, z = 0, radius = .07) {
    const mesh = new THREE.Mesh(roundedGeometry(w, h, d, radius), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function sphere(parent, rx, ry, rz, mat, x = 0, y = 0, z = 0) {
    const key = 'sphere';
    if (!geometries.has(key)) geometries.set(key, new THREE.SphereGeometry(1, 28, 20));
    const mesh = new THREE.Mesh(geometries.get(key), mat);
    mesh.scale.set(rx, ry, rz);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function cylinder(parent, rTop, rBottom, height, mat, x = 0, y = 0, z = 0, segments = 40) {
    const key = ['cylinder', rTop, rBottom, height, segments].join(',');
    if (!geometries.has(key)) geometries.set(key, new THREE.CylinderGeometry(rTop, rBottom, height, segments));
    const mesh = new THREE.Mesh(geometries.get(key), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function torus(parent, radius, tube, mat, x = 0, y = 0, z = 0, arc = Math.PI * 2) {
    const key = ['torus', radius, tube, arc].join(',');
    if (!geometries.has(key)) geometries.set(key, new THREE.TorusGeometry(radius, tube, 12, 36, arc));
    const mesh = new THREE.Mesh(geometries.get(key), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function curveTube(parent, points, radius, mat) {
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 18, radius, 8, false);
    geometries.set('tube' + geometries.size, geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function group(parent, x = 0, y = 0, z = 0) {
    const result = new THREE.Group();
    result.position.set(x, y, z);
    parent.add(result);
    return result;
  }
  function softShadow(parent, rx, rz, opacity = .2, x = 0, z = 0) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(45,34,22,.8)');
    gradient.addColorStop(.55, 'rgba(45,34,22,.4)');
    gradient.addColorStop(1, 'rgba(45,34,22,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    textures.push(tex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity, depthWrite: false });
    materials.push(mat);
    const geo = new THREE.PlaneGeometry(rx * 2, rz * 2);
    geometries.set('shadow' + geometries.size, geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, .018, z);
    parent.add(mesh);
    return mesh;
  }
  function label(parent, text, subtitle, width, x, y, z, color = '#f6eedb') {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 192;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 768, 192);
    ctx.fillStyle = '#40533f';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 58px "Pretendard", "Apple SD Gothic Neo", sans-serif';
    ctx.fillText(text, 384, subtitle ? 75 : 98);
    if (subtitle) {
      ctx.font = '500 28px "Pretendard", "Apple SD Gothic Neo", sans-serif';
      ctx.fillStyle = '#869271';
      ctx.fillText(subtitle, 384, 139);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    textures.push(tex);
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .9 });
    materials.push(mat);
    const geo = new THREE.PlaneGeometry(width, width / 4);
    geometries.set('label' + geometries.size, geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    labels.push(mesh);
    return mesh;
  }
  function interact(root, id) {
    root.userData.interactionId = id;
    interactionRoots.push(root);
    return root;
  }
  function obstacle(x, z, halfW, halfD) { colliders.push({ x, z, halfW, halfD }); }

  // The photographs establish the furniture and circulation, not measured
  // dimensions. These proportions leave a little room for game characters.
  const room = group(scene);
  const layoutLandmarks = [];
  let lastArrived = null;
  function landmark(id, kind, position, mat) {
    layoutLandmarks.push({ id, kind, position: new THREE.Vector3(...position), material: mat || palette.ivory });
  }
  const tile = material('#62686b', { roughness: .94 });
  const tileAlt = material('#596166', { roughness: .94 });
  const grout = material('#434b50', { roughness: 1 });
  const white = material('#f3f2ec', { roughness: .88 });
  const black = material('#252b29', { roughness: .56 });
  const brown = material('#805b3e', { roughness: .78 });
  const darkWood = material('#70513c', { roughness: .8 });
  const yellow = material('#e3bf4c', { roughness: .73 });
  const orange = material('#df7944', { roughness: .72 });
  scene.background.set('#e9e9e2');
  scene.fog.color.copy(scene.background);
  box(room, 8.95, .26, 15.15, white, 0, -.2, 0, .1);
  box(room, 8.8, .045, 15, grout, 0, -.045, 0, .008);
  const tileGeo = new THREE.BoxGeometry(1.083, .03, 1.054);
  geometries.set('photo-floor-tile', tileGeo);
  for (let row = 0; row < 14; row++) for (let col = 0; col < 8; col++) {
    const mesh = new THREE.Mesh(tileGeo, (row + col * 3) % 7 === 0 ? tileAlt : tile);
    mesh.position.set(-3.85 + col * 1.1, -.012, -6.955 + row * 1.07);
    mesh.receiveShadow = true;
    room.add(mesh);
  }
  landmark('floor-gray-tile', 'gray-tile-floor', [0, .01, .5], tile);
  // White walls are cut away on the viewing side; no ceiling hides the room.
  box(room, .15, .82, 15.1, white, -4.47, .41, 0, .025);
  box(room, .15, 4.7, 12.6, white, 4.47, 2.35, -1.2, .025);
  box(room, .15, 1.0, 2.5, white, 4.47, .5, 6.35, .025);
  box(room, 8.95, 1.08, .15, white, 0, .54, -7.55, .025);
  box(room, 8.95, .3, .18, white, 0, 4.55, -7.55, .025);
  box(room, .15, .13, 15, white, -4.37, .085, 0, .015);
  box(room, .15, .13, 15, white, 4.37, .085, 0, .015);
  const hemi = new THREE.HemisphereLight('#fff6e5', '#a4a69d', 2.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff2d9', 3.25);
  sun.position.set(-6, 11, 8);
  sun.target.position.set(0, 0, -.5);
  sun.castShadow = true;
  const shadowResolution = host.clientWidth < 600 ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowResolution, shadowResolution);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 13, bottom: -13, near: 1, far: 36 });
  sun.shadow.bias = -.0004;
  sun.shadow.normalBias = .025;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#e6ece6', .9);
  fill.position.set(6, 7, -4);
  scene.add(fill);
  const warmLights = [];
  const lampGlow = material('#fff2b8', { emissive: '#ffd78e', emissiveIntensity: .7, roughness: .45 });
  const sky = material('#9ca5a0', { roughness: .62, emissive: '#78867d', emissiveIntensity: .07 });
  const glass = material('#b9ceca', { roughness: .18, transparent: true, opacity: .13, metalness: .04 });
  function imageDecal(parent, url, w, h, x, y, z) {
    if (!url) return;
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, alphaTest: .03, side: THREE.DoubleSide });
    materials.push(mat);
    const geo = new THREE.PlaneGeometry(w, h);
    geometries.set('photo-decal-' + geometries.size, geo);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    new THREE.TextureLoader().load(url, tex => {
      if (disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textures.push(tex);
      mat.map = tex;
      mat.needsUpdate = true;
    }, undefined, () => {});
    return mesh;
  }
  // The actual back window is flat, with black rectangular glazing.
  const backWindow = group(room, 0, 0, -7.44);
  box(backWindow, 8.55, 3.24, .055, sky, 0, 2.73, -.055, .008);
  for (const x of [-4.3, 0, 4.3]) box(backWindow, .075, 3.42, .13, black, x, 2.75, .02, .012);
  for (const y of [1.08, 2.43, 4.43]) box(backWindow, 8.67, .075, .13, black, 0, y, .025, .012);
  for (const x of [-3.5, -2.9, 1.4, 2.05]) {
    const reflection = box(backWindow, .09, 2.7, .012, material('#e1e8df', { transparent: true, opacity: .18, roughness: .3 }), x, 2.77, .018, .003);
    reflection.rotation.z = -.08;
  }
  const brandMarkUrl = options.brandMarkUrl || '/assets/images/brand/gd-universe-logomark.png';
  const brandLogoUrl = options.brandLogoUrl || '/assets/images/brand/gd-universe-logo.png';
  imageDecal(backWindow, brandMarkUrl, .83, .83, -2.15, 3.2, .106);
  imageDecal(backWindow, brandMarkUrl, .83, .83, 2.15, 3.2, .106);
  landmark('back-black-glazing', 'black-framed-window', [0, 2.75, -7.4], black);
  // The storefront is also black glass. Its open left door stays outside the
  // navigation bounds; the front fixed pane is cut low for the game camera.
  const entrance = group(room, 0, 0, 7.48);
  for (const x of [-4.3, 4.3]) box(entrance, .09, 4.48, .13, black, x, 2.24, 0, .014);
  box(entrance, 8.7, .11, .14, black, 0, 4.45, 0, .018);
  box(entrance, 5.1, .07, .11, black, 1.75, .12, 0, .012);
  box(entrance, 5.05, .87, .025, glass, 1.75, .59, -.018, .003);
  box(entrance, 5.1, .055, .1, black, 1.75, 1.03, 0, .01);
  const door = group(entrance, -4.23, 0, .02);
  door.rotation.y = -1.02;
  for (const x of [0, 1.9]) box(door, .065, 4.24, .09, black, x, 2.12, 0, .012);
  for (const y of [.07, 1.03, 4.21]) box(door, 1.95, .065, .09, black, .95, y, 0, .012);
  box(door, 1.81, 4.07, .022, glass, .95, 2.13, -.015, .003);
  box(door, .045, .6, .075, black, 1.69, 1.72, .07, .01);
  const shopSign = group(entrance, 0, 4.77, .025);
  box(shopSign, 3.4, .49, .095, white, 0, 0, 0, .045);
  label(shopSign, '개띠랑 책공방', '', 3.1, 0, 0, .055, '#f6f1e4');
  const yellowSign = group(room, -1.9, 0, 7.74);
  for (const x of [-.62, .62]) box(yellowSign, .045, .94, .05, black, x, .47, -.035, .009);
  box(yellowSign, 1.62, 1.08, .085, yellow, 0, 1.28, 0, .045);
  imageDecal(yellowSign, brandLogoUrl, 1.39, .391, 0, 1.43, .052);
  label(yellowSign, '책공방 안내', '', 1.21, 0, 1.03, .055, '#e4bf4b');
  landmark('front-black-glazing', 'black-framed-open-door', [-1.2, 2.35, 7.5], black);

  const bookMats = ['#79917c', '#c48f80', '#d1b66d', '#8da49e', '#b7a7ae', '#e1d2b9', '#768c96', '#c4a582'].map(c => material(c));
  const bookCoverTextures = new Map();
  Object.entries(options.bookCovers || {}).forEach(([id, url]) => {
    new THREE.TextureLoader().load(url, tex => {
      if (disposed) { tex.dispose(); return; }
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      textures.push(tex);
      bookCoverTextures.set(id, tex);
      scene.traverse(child => {
        if (child.userData.bookId === id && child.userData.coverFace) {
          child.material.map = tex; child.material.color.set('#ffffff'); child.material.needsUpdate = true;
        }
      });
    }, undefined, () => {});
  });
  function uprightBook(parent, width, height, depth, mat, x, y, z, tilt = 0) {
    const book = group(parent, x, y, z); book.rotation.z = tilt;
    box(book, width, height, depth, mat, 0, height / 2, 0, .014);
    box(book, width * .72, height - .065, depth - .045, palette.page, .005, height / 2, -.012, .006);
    box(book, width * .65, .017, .006, white, 0, height * .24, depth / 2 + .005, .002);
    return book;
  }
  function faceoutBook(parent, id, x, y, z, width = .46, height = .64) {
    if (!options.bookCovers || !options.bookCovers[id]) return null;
    const book = group(parent, x, y, z); book.rotation.x = -.12;
    box(book, width, height, .075, bookMats[2], 0, height / 2, 0, .012);
    const mat = material('#ffffff', { map: bookCoverTextures.get(id) || null });
    const geo = new THREE.PlaneGeometry(width - .035, height - .035);
    geometries.set('photo-cover-' + geometries.size, geo);
    const face = new THREE.Mesh(geo, mat);
    face.position.set(0, height / 2, .042);
    face.userData.bookId = id; face.userData.coverFace = true;
    book.add(face);
    return book;
  }
  function bookStack(parent, x, y, z, count = 3, width = .62, depth = .45) {
    for (let i = 0; i < count; i++) {
      const stack = group(parent, x + i * .009, y + i * .095, z);
      stack.rotation.y = (i % 3 - 1) * .055;
      box(stack, width, .085, depth, bookMats[i % bookMats.length], 0, .042, 0, .012);
      box(stack, width - .05, .05, .009, palette.page, 0, .043, depth / 2 + .004, .004);
    }
  }
  function flowerCard(parent, x, y, z, w = .38, h = .51, tint = palette.pink) {
    const card = group(parent, x, y, z);
    box(card, w, h, .018, white, 0, 0, 0, .012);
    curveTube(card, [[0, -h * .3, .016], [.015, 0, .02], [0, h * .18, .02]], .006, palette.sage);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * .4;
      const petal = sphere(card, w * .12, h * .075, .012, tint, Math.sin(a) * w * .13, h * .14 + Math.cos(a) * h * .105, .027);
      petal.rotation.z = -a;
    }
    sphere(card, .025, .025, .014, yellow, 0, h * .14, .04);
    return card;
  }
  function plant(parent, x, z, size = 1) {
    const p = group(parent, x, 0, z);
    cylinder(p, .25 * size, .19 * size, .4 * size, palette.terracotta, 0, .2 * size);
    cylinder(p, .224 * size, .224 * size, .014, darkWood, 0, .406 * size);
    for (let i = 0; i < 6; i++) {
      const a = i * 2.4;
      const end = [.24 * Math.sin(a) * size, (.82 + i % 3 * .16) * size, .24 * Math.cos(a) * size];
      curveTube(p, [[0, .4 * size, 0], [end[0] * .5, end[1] * .65, end[2] * .5], end], .012 * size, palette.sage);
      const leaf = sphere(p, .12 * size, .29 * size, .04 * size, i % 2 ? palette.sage : palette.moss, ...end);
      leaf.rotation.z = -.65 * Math.sin(a); leaf.rotation.x = .6 * Math.cos(a); leaf.rotation.y = a;
    }
    softShadow(parent, .42 * size, .42 * size, .22, x, z);
  }
  plant(room, -3.78, 6.55, .85);
  obstacle(-3.78, 6.55, .34, .34);
  plant(room, 3.95, -6.57, .62);

  // Entrance-left: a white circular rotating shelf, six separate tiers.
  const carousel = interact(group(room, -2.65, 0, 3.0), 'heart');
  cylinder(carousel, .4, .48, .14, white, 0, .1);
  cylinder(carousel, .075, .075, 3.2, white, 0, 1.76);
  for (let tier = 0; tier < 6; tier++) {
    const y = .45 + tier * .48;
    cylinder(carousel, .79, .79, .065, white, 0, y);
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const book = uprightBook(carousel, .22, .34 + (i % 2) * .03, .2, bookMats[(i + tier) % bookMats.length], Math.sin(angle) * .57, y + .04, Math.cos(angle) * .57);
      book.rotation.y = angle;
    }
  }
  cylinder(carousel, .8, .8, .075, white, 0, 3.34);
  label(carousel, '마음과 기록', '', .9, 0, 3.4, .055, '#f3f2ec');
  obstacle(-2.65, 3, .75, .75);
  softShadow(room, .98, .98, .23, -2.65, 3);
  landmark('entrance-white-carousel', 'six-tier-white-carousel', [-2.65, 1.8, 3], white);

  // Two adjoining exhibition tables: light wood on the left, projecting
  // slightly farther towards the entrance than the dark table on the right.
  function exhibitionTable(x, z, width, depth, mat) {
    const t = interact(group(room, x, 0, z), 'table');
    box(t, width, .13, depth, mat, 0, 1.18, 0, .045);
    for (const lx of [-width / 2 + .13, width / 2 - .13]) for (const lz of [-depth / 2 + .16, depth / 2 - .16]) box(t, .105, 1.12, .105, mat, lx, .56, lz, .025);
    box(t, width - .13, .075, depth - .12, mat, 0, .25, 0, .025);
    obstacle(x, z, width / 2, depth / 2);
    softShadow(room, width * .65, depth * .57, .24, x, z);
    return t;
  }
  const lightTable = exhibitionTable(-.7, -1.05, 1.5, 4.5, palette.oakLight);
  const darkTable = exhibitionTable(.88, -1.4, 1.6, 3.7, darkWood);
  landmark('center-lightwood-table', 'lightwood-exhibition-table', [-.7, 1.18, -1.05], palette.oakLight);
  landmark('center-darkwood-table', 'darkwood-exhibition-table', [.88, 1.18, -1.4], darkWood);
  [[-.25, -.95], [.24, .1], [-.2, 1.15], [.22, -1.65]].forEach((p, i) => bookStack(lightTable, p[0], 1.255, p[1], 2 + i % 2, .55, .44));
  [[-.35, -.8], [.32, .55], [.3, -.12]].forEach((p, i) => bookStack(darkTable, p[0], 1.255, p[1], 3, .54, .43));
  [[-.27, 1.86], [-.27, -1.8], [.25, -.72], [.25, .78]].forEach((p, i) => bookStack(lightTable, p[0], 1.255, p[1], 2 + i % 2, .5, .38));
  [[-.34, .08], [-.31, 1.36]].forEach(p => bookStack(darkTable, p[0], 1.255, p[1], 3, .51, .4));
  faceoutBook(lightTable, 'night', -.22, 1.265, 1.02, .36, .5);
  faceoutBook(darkTable, 'breadful', .3, 1.265, .59, .37, .51);
  for (const x of [-.38, .32]) box(lightTable, .51, .025, .36, white, x, 1.265, .42, .006);
  box(lightTable, .09, .19, .08, yellow, .38, 1.36, .42, .009);
  box(lightTable, .64, .37, .77, material('#ddd9cd'), -.17, .47, -.6, .035);
  box(darkTable, .65, .42, .71, material('#b3a28b'), .18, .5, .3, .035);
  const storageBasket = group(room, -2.05, 0, -3.89);
  box(storageBasket, .73, .08, .63, white, 0, .23, 0, .025);
  for (const x of [-.34, .34]) for (let j = 0; j < 5; j++) box(storageBasket, .018, .55, .018, white, x, .55, -.26 + j * .13, .004);
  for (const z of [-.28, .28]) for (let j = 0; j < 5; j++) box(storageBasket, .018, .55, .018, white, -.29 + j * .145, .55, z, .004);
  for (const y of [.29, .54, .8]) { box(storageBasket, .74, .018, .018, white, 0, y, -.28, .003); box(storageBasket, .74, .018, .018, white, 0, y, .28, .003); }
  for (const x of [-.26, .26]) for (const z of [-.21, .21]) sphere(storageBasket, .055, .065, .055, black, x, .09, z);
  bookStack(storageBasket, 0, .26, 0, 3, .49, .37);
  obstacle(-2.05, -3.89, .38, .33);
  landmark('center-white-mesh-cart', 'white-wire-storage-cart', [-2.05, .48, -3.89], white);

  // Right near the entrance: tall brown grid shelves and their opaque side.
  function tallGridShelf(z) {
    const shelf = interact(group(room, 3.88, 0, z), 'story'); shelf.rotation.y = -Math.PI / 2;
    box(shelf, 2.22, 3.43, .095, brown, 0, 1.8, -.38, .035);
    for (const x of [-1.11, -.37, .37, 1.11]) box(shelf, .075, 3.6, .8, brown, x, 1.83, 0, .025);
    for (const y of [.1, .95, 1.8, 2.65, 3.58]) box(shelf, 2.32, .09, .84, brown, 0, y, 0, .025);
    for (let row = 0; row < 4; row++) for (let cell = 0; cell < 3; cell++) for (let i = 0; i < 3; i++) {
      uprightBook(shelf, .13, .46 + (i % 2) * .1, .3, bookMats[(row * 2 + cell + i) % bookMats.length], -.94 + cell * .74 + i * .17, .16 + row * .85, .12);
    }
    obstacle(3.88, z, .43, 1.16);
    return shelf;
  }
  tallGridShelf(3.87); tallGridShelf(1.35);
  const partition = interact(group(room, 3.67, 0, 5.09), 'story');
  box(partition, 1.28, 3.55, .085, brown, 0, 1.79, 0, .035);
  for (let i = 0; i < 6; i++) flowerCard(partition, (i % 2 ? .3 : -.3), 1.05 + Math.floor(i / 2) * .72, .052, .49, .59, i % 3 ? palette.pink : yellow);
  obstacle(3.67, 5.09, .65, .06);
  landmark('right-tall-grid-shelves', 'brown-grid-shelves-with-opaque-side', [3.85, 1.85, 3.1], brown);
  landmark('right-flower-partition', 'opaque-flower-patchwork-panel', [3.67, 1.8, 5.09], brown);

  const slimShelf = interact(group(room, 3.93, 0, -.8), 'travel'); slimShelf.rotation.y = -Math.PI / 2;
  for (const x of [-.84, .84]) box(slimShelf, .045, 3.4, .055, black, x, 1.75, -.08, .01);
  for (let i = 0; i < 13; i++) box(slimShelf, 1.65, .055, .055, palette.oakLight, 0, 1.01 + i * .17, -.1, .012);
  for (const y of [.58, 1.35, 2.15, 2.98]) box(slimShelf, 1.74, .055, .34, palette.oakLight, 0, y, .06, .015);
  for (let i = 0; i < 3; i++) {
    const packet = box(slimShelf, .37, .52, .045, yellow, -.53 + i * .51, 1.64, .11, .015);
    packet.rotation.x = -.1;
    box(slimShelf, .21, .1, .008, white, -.53 + i * .51, 1.62, .142, .003);
  }
  torus(slimShelf, .2, .055, orange, .38, 2.44, .11);
  faceoutBook(slimShelf, 'bread1', -.37, 2.19, .11, .34, .48);
  obstacle(3.93, -.8, .23, .89);
  landmark('right-slim-blind-shelf', 'black-frame-slim-blind-book-shelf', [3.93, 1.85, -.8], black);
  const bench = group(room, 3.75, 0, -3.75); bench.rotation.y = -Math.PI / 2;
  box(bench, 2.9, .15, .74, darkWood, 0, .65, 0, .045);
  box(bench, 2.9, .52, .11, darkWood, 0, 1.06, -.31, .035);
  for (const x of [-1.17, 1.17]) for (const z of [-.24, .24]) box(bench, .09, .58, .09, darkWood, x, .3, z, .015);
  obstacle(3.75, -3.75, .43, 1.48);
  for (let i = 0; i < 4; i++) {
    const card = group(room, 4.35, 2.19, -4.8 + i * .63); card.rotation.y = -Math.PI / 2;
    flowerCard(card, 0, 0, 0, .38, .53, i % 2 ? yellow : palette.pink);
  }
  landmark('right-bench', 'long-brown-bench-with-flower-cards', [3.75, .7, -3.75], darkWood);

  const backCounter = interact(group(room, 0, 0, -6.95), 'counter');
  box(backCounter, 6.92, .09, .62, white, 0, 1.44, 0, .025);
  for (const x of [-3.26, 0, 3.26]) box(backCounter, .07, 1.4, .48, white, x, .7, 0, .012);
  box(backCounter, 6.77, .06, .4, white, 0, .18, 0, .012);
  obstacle(0, -6.95, 3.46, .31);
  const backChair = group(room, -1.0, 0, -6.28);
  for (const x of [-.2, .2]) for (const z of [-.18, .18]) box(backChair, .035, .7, .035, black, x, .35, z, .007);
  box(backChair, .5, .08, .45, white, 0, .71, 0, .055);
  box(backChair, .5, .53, .055, white, 0, 1.0, .2, .055);
  landmark('back-white-counter', 'narrow-white-window-counter-and-chair', [0, 1.44, -6.95], white);
  function lowFaceout(x, id, coverIds, landmarkId) {
    const shelf = interact(group(room, x, 0, -5.2), id);
    box(shelf, 3.1, 1.84, .08, palette.oakLight, 0, 1.03, -.24, .035);
    for (const sx of [-1.5, 1.5]) box(shelf, .09, 1.97, .65, palette.oakLight, sx, 1.0, 0, .025);
    for (let row = 0; row < 3; row++) {
      const y = .17 + row * .57;
      box(shelf, 3.04, .075, .69, palette.oakLight, 0, y, .035, .02);
      box(shelf, 3.0, .13, .055, palette.oakLight, 0, y + .065, .35, .012);
      for (let col = 0; col < 2; col++) {
        const book = faceoutBook(shelf, coverIds[row * 2 + col], col ? .7 : -.7, y + .05, .13, .39, .51);
        if (!book) bookStack(shelf, col ? .7 : -.7, y + .06, .08, 2, .45, .31);
      }
    }
    obstacle(x, -5.2, 1.55, .36);
    softShadow(room, 1.8, .64, .2, x, -5.2);
    landmark(landmarkId, 'two-column-three-tier-low-faceout-shelf', [x, 1.05, -5.2], palette.oakLight);
  }
  lowFaceout(-.95, 'heart', ['night','feeling','outside','someday','uncomfortable','night'], 'back-low-faceout-left');
  lowFaceout(2.15, 'travel', ['bread1','bread2','breadful','bread1','feeling','someday'], 'back-low-faceout-right');

  // The lamps have distinct shapes seen in the photos, without a ceiling rig.
  function pointLamp(parent, x, y, z, strength = 6) {
    const light = new THREE.PointLight('#ffe1ac', strength, 6, 2); light.position.set(x, y, z); parent.add(light); warmLights.push(light);
  }
  const yellowLamp = group(room, 2.76, 0, 5.55);
  cylinder(yellowLamp, .28, .31, .07, black, 0, .055);
  cylinder(yellowLamp, .025, .025, 2.74, black, 0, 1.4);
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * .38; const y = 2.35 + i * .22; const z = (i % 2 ? -.16 : .14);
    curveTube(yellowLamp, [[0, 1.82, 0], [x * .65, y + .08, z], [x, y, z]], .02, black);
    const shade = cylinder(yellowLamp, .11, .23, .27, yellow, x, y - .11, z); shade.rotation.z = (1 - i) * .18;
    cylinder(yellowLamp, .19, .19, .025, lampGlow, x, y - .25, z);
    pointLamp(yellowLamp, x, y - .31, z, 5);
  }
  obstacle(2.76, 5.55, .25, .25);
  landmark('entrance-yellow-three-head-lamp', 'yellow-three-head-floor-lamp', [2.76, 2.35, 5.55], yellow);
  const banker = group(lightTable, .3, 1.25, -1.65);
  cylinder(banker, .18, .21, .035, palette.brass, 0, .025);
  cylinder(banker, .024, .024, .47, palette.brass, 0, .27);
  box(banker, .62, .22, .28, material('#457862', { roughness: .33 }), 0, .56, 0, .09);
  box(banker, .52, .035, .23, lampGlow, 0, .46, 0, .015);
  pointLamp(banker, 0, .4, 0, 4);
  landmark('green-banker-lamp', 'green-bankers-lamp', [-.4, 1.8, -2.7], palette.sage);
  const taskLamp = group(darkTable, .4, 1.25, -1.2);
  cylinder(taskLamp, .17, .18, .035, white, 0, .025);
  curveTube(taskLamp, [[0, .04, 0], [.09, .51, -.02], [-.1, .76, -.06]], .022, white);
  cylinder(taskLamp, .06, .2, .19, white, -.1, .68, -.06);
  cylinder(taskLamp, .17, .17, .022, lampGlow, -.1, .576, -.06);
  pointLamp(taskLamp, -.1, .52, -.06, 4);
  const creamLamp = group(lightTable, -.23, 1.25, -.43);
  cylinder(creamLamp, .13, .16, .025, white, 0, .025);
  cylinder(creamLamp, .018, .018, .43, palette.brass, 0, .245);
  cylinder(creamLamp, .12, .27, .3, palette.ivory, 0, .55);
  cylinder(creamLamp, .22, .22, .02, lampGlow, 0, .392);
  pointLamp(creamLamp, 0, .34, 0, 4);

  function triangularEar(parent, side, furMat, innerMat) {
    const earShape = new THREE.Shape();
    earShape.moveTo(-.22, 0);
    earShape.quadraticCurveTo(-.16, .23, -.07, .48);
    earShape.quadraticCurveTo(0, .62, .08, .47);
    earShape.lineTo(.23, 0);
    earShape.quadraticCurveTo(0, -.055, -.22, 0);
    const geo = new THREE.ExtrudeGeometry(earShape, { depth: .17, bevelEnabled: true, bevelThickness: .055, bevelSize: .05, bevelSegments: 4, steps: 1, curveSegments: 12 });
    geometries.set('ear' + geometries.size, geo);
    const mesh = new THREE.Mesh(geo, furMat);
    mesh.position.set(side * .39, .48, -.06);
    mesh.rotation.z = side * -.21;
    mesh.castShadow = true;
    parent.add(mesh);
    const inner = sphere(parent, .11, .21, .022, innerMat, side * .395, .736, .166);
    inner.rotation.z = side * -.21;
  }
  const shirts = {
    forest: material('#718a63', { roughness: .96 }),
    bread: material('#d2a362', { roughness: .96 }),
    rose: material('#c68e83', { roughness: .96 }),
  };
  const characterFurs = {
    cat: material('#d8a46b', { roughness: .98 }),
    bear: material('#dec9ac', { roughness: 1 }),
    rabbit: material('#e7e1d0', { roughness: 1 }),
  };
  const earPink = material('#d8a294', { roughness: 1 });
  const eyeMat = material('#2a2723', { roughness: .24 });
  const shine = material('#fffdf6', { roughness: .1 });
  const cheekMat = material('#daa494', { roughness: 1 });
  function makeCharacter(animal = 'cat', shirt = 'forest', keeper = false) {
    const root = group(scene);
    const body = group(root);
    const furMat = keeper ? material('#f0dfc3', { roughness: 1 }) : characterFurs[animal] || characterFurs.cat;
    const shirtMat = keeper ? material('#bf806b', { roughness: 1 }) : shirts[shirt] || shirts.forest;
    const pantsMat = material(keeper ? '#97816d' : '#8a765e', { roughness: 1 });
    const torso = sphere(body, .37, .41, .27, shirtMat, 0, .71, 0);
    const collar = torus(body, .15, .031, palette.cream, 0, 1.04, 0);
    collar.rotation.x = Math.PI / 2;
    const bellyButton = sphere(body, .024, .026, .016, palette.ivory, 0, .83, .268);
    const button2 = sphere(body, .024, .026, .016, palette.ivory, 0, .69, .275);
    sphere(body, .3, .14, .245, pantsMat, 0, .385, -.009);
    const leftLeg = group(body, -.16, .31, 0);
    const rightLeg = group(body, .16, .31, 0);
    sphere(leftLeg, .125, .2, .135, furMat, 0, -.075, 0);
    sphere(rightLeg, .125, .2, .135, furMat, 0, -.075, 0);
    const shoeMat = material('#8a644b', { roughness: .8 });
    sphere(leftLeg, .149, .088, .195, shoeMat, 0, -.234, .044);
    sphere(rightLeg, .149, .088, .195, shoeMat, 0, -.234, .044);
    const leftArm = group(body, -.32, .91, 0);
    const rightArm = group(body, .32, .91, 0);
    sphere(leftArm, .136, .22, .13, shirtMat, -.04, -.12, 0);
    sphere(rightArm, .136, .22, .13, shirtMat, .04, -.12, 0);
    sphere(leftArm, .12, .15, .13, furMat, -.06, -.3, .006);
    sphere(rightArm, .12, .15, .13, furMat, .06, -.3, .006);
    leftArm.rotation.z = -.12;
    rightArm.rotation.z = .12;
    const head = group(body, 0, 1.39, .004);
    sphere(head, .61, .56, .51, furMat, 0, .02, 0);
    const muzzle = material(animal === 'bear' ? '#f5e7d0' : animal === 'cat' ? '#fff0d4' : '#f6ede0', { roughness: 1 });
    if (animal === 'cat') sphere(head, .47, .46, .21, muzzle, 0, -.055, .315);
    sphere(head, .28, .2, .105, muzzle, 0, -.14, .453);
    if (animal === 'cat') {
      triangularEar(head, -1, furMat, earPink);
      triangularEar(head, 1, furMat, earPink);
      for (const side of [-1, 1]) {
        curveTube(head, [[side * .24, -.115, .525], [side * .42, -.07, .5], [side * .52, -.052, .45]], .008, palette.oakEdge);
        curveTube(head, [[side * .25, -.18, .52], [side * .43, -.185, .49], [side * .51, -.21, .44]], .008, palette.oakEdge);
      }
      sphere(head, .044, .034, .027, material('#b18b76'), 0, -.085, .56);
      const tail = curveTube(body, [[0, .48, -.21], [.14, .55, -.48], [.25, .86, -.6], [.2, 1.0, -.54]], .075, furMat);
      tail.name = 'tail';
      // Gentle forehead markings give the original cat its own identity.
      for (const side of [-1, 1]) {
        const stripe = sphere(head, .032, .077, .014, material('#c08c58'), side * .105, .326, .437);
        stripe.rotation.z = side * -.22;
      }
    } else if (animal === 'bear') {
      for (const side of [-1, 1]) {
        sphere(head, .22, .22, .17, furMat, side * .43, .46, -.04);
        sphere(head, .127, .127, .023, earPink, side * .43, .46, .116);
      }
      sphere(head, .068, .045, .031, palette.dark, 0, -.085, .567);
      sphere(body, .105, .105, .105, furMat, 0, .48, -.29);
    } else {
      for (const side of [-1, 1]) {
        const ear = group(head, side * .28, .51, -.02);
        ear.rotation.z = side * -.15;
        sphere(ear, .15, .49, .13, furMat, 0, .29, 0);
        sphere(ear, .073, .345, .027, earPink, 0, .32, .113);
      }
      sphere(head, .039, .032, .026, earPink, 0, -.08, .563);
      sphere(body, .136, .136, .126, muzzle, 0, .48, -.29);
    }
    const eyes = group(head);
    for (const side of [-1, 1]) {
      sphere(eyes, .063, .083, .039, eyeMat, side * .225, .087, .519);
      sphere(eyes, .017, .021, .009, shine, side * .225 - .012, .118, .557);
      sphere(head, .092, .046, .013, cheekMat, side * .354, -.112, .443);
      curveTube(head, [[side * .18, .173, .465], [side * .224, .184, .453], [side * .27, .17, .434]], .009, palette.oakEdge);
    }
    curveTube(head, [[-.066, -.164, .556], [-.035, -.19, .566], [0, -.172, .573], [.035, -.19, .566], [.066, -.164, .556]], .009, palette.oakEdge);
    if (keeper) {
      const apronMat = material('#cb8c73', { roughness: 1 });
      box(body, .44, .44, .067, apronMat, 0, .65, .266, .045);
      box(body, .3, .22, .066, apronMat, 0, .91, .26, .025);
      for (const side of [-1, 1]) {
        const strap = box(body, .055, .32, .03, apronMat, side * .14, 1.02, .229, .018);
        strap.rotation.z = side * .18;
      }
      box(body, .23, .14, .025, material('#b57561'), 0, .63, .309, .027);
      sphere(body, .021, .021, .015, palette.brass, -.115, .944, .304);
      sphere(body, .021, .021, .015, palette.brass, .115, .944, .304);
      for (const side of [-1, 1]) torus(head, .122, .014, palette.brass, side * .225, .082, .534);
      curveTube(head, [[-.11, .091, .535], [0, .116, .55], [.11, .091, .535]], .012, palette.brass);
    } else {
      // A little canvas cross-body bag and stitched straps.
      const bagMat = material('#e0c094', { roughness: 1 });
      box(body, .25, .24, .1, bagMat, .27, .6, .242, .055);
      box(body, .205, .045, .115, palette.oakEdge, .27, .692, .24, .017);
      curveTube(body, [[-.22, 1.026, .14], [-.05, .88, .279], [.23, .66, .306]], .017, palette.oakEdge);
    }
    const shadow = softShadow(root, .6, .44, .31);
    root.userData.isCharacter = true;
    root.userData.animal = animal;
    root.userData.shirt = shirt;
    return { root, body, head, eyes, leftArm, rightArm, leftLeg, rightLeg, torso, shadow, keeper };
  }
  let player = makeCharacter('cat', 'forest');
  player.root.position.set(-.1, 0, 6.2);
  player.root.rotation.y = -.3;
  const keeper = makeCharacter('bear', 'bread', true);
  keeper.root.position.set(-2.65, 0, -.55);
  keeper.root.rotation.y = -.3;
  interact(keeper.root, 'keeper');
  obstacle(-2.65, -.55, .26, .26);
  // A tiny floating leaf marks the NPC and remains visible above the counter.
  const keeperMarker = group(keeper.root, 0, 2.63, 0);
  const marker = sphere(keeperMarker, .16, .22, .042, palette.sage);
  marker.rotation.z = -.38;
  curveTube(keeperMarker, [[-.025, -.12, .044], [0, 0, .05], [.024, .12, .044]], .008, palette.ivory);
  const greetingCanvas = document.createElement('canvas');
  greetingCanvas.width = 384;
  greetingCanvas.height = 128;
  const greetingContext = greetingCanvas.getContext('2d');
  greetingContext.fillStyle = '#fff7e6';
  greetingContext.beginPath();
  greetingContext.roundRect(8, 8, 368, 102, 34);
  greetingContext.fill();
  greetingContext.beginPath();
  greetingContext.moveTo(163, 107);
  greetingContext.lineTo(185, 126);
  greetingContext.lineTo(206, 107);
  greetingContext.fill();
  greetingContext.fillStyle = '#66503e';
  greetingContext.font = '700 45px "Pretendard", "Apple SD Gothic Neo", sans-serif';
  greetingContext.textAlign = 'center';
  greetingContext.textBaseline = 'middle';
  greetingContext.fillText('어서 와요!', 192, 59);
  const greetingTexture = new THREE.CanvasTexture(greetingCanvas);
  greetingTexture.colorSpace = THREE.SRGBColorSpace;
  textures.push(greetingTexture);
  const greetingMaterial = new THREE.SpriteMaterial({ map: greetingTexture, transparent: true, depthWrite: false });
  materials.push(greetingMaterial);
  const greetingBubble = new THREE.Sprite(greetingMaterial);
  greetingBubble.position.set(0, 2.84, .06);
  greetingBubble.scale.set(1.92, .64, 1);
  greetingBubble.visible = false;
  keeper.root.add(greetingBubble);
  const namePlate = group(room, -2.65, 2.14, -.55);
  box(namePlate, 1.14, .31, .065, palette.ivory, 0, 0, 0, .1);
  label(namePlate, '책방지기 두루', '', 1.06, 0, 0, .04);

  // These are authored bookstore NPCs, not connected or remotely controlled
  // visitors. The reader uses the photographed bench; Bori stays by the entry.
  function guestNameBadge(character, name, height) {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 156;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false });
    materials.push(mat);
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(0, height, .04);
    sprite.scale.set(1.92, .78, 1);
    sprite.renderOrder = 3;
    character.root.add(sprite);
    function draw(greeting) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = greeting ? '#eff3df' : '#fff8e8';
      ctx.beginPath();
      ctx.roundRect(8, 8, 368, 124, 31);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(171, 129);
      ctx.lineTo(192, 153);
      ctx.lineTo(213, 129);
      ctx.fill();
      ctx.fillStyle = '#66523d';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 42px "Pretendard", "Apple SD Gothic Neo", sans-serif';
      ctx.fillText(greeting ? name + ' · 반가워요!' : name, 192, 49);
      ctx.font = '500 27px "Pretendard", "Apple SD Gothic Neo", sans-serif';
      ctx.fillStyle = '#8a806a';
      ctx.fillText('가상 손님 · 눌러서 대화', 192, 99);
      texture.needsUpdate = true;
    }
    draw(false);
    return { sprite, draw, height };
  }
  function batchGuestBody(character) {
    character.root.updateMatrixWorld(true);
    const inverseBody = character.body.matrixWorld.clone().invert();
    const batches = new Map();
    character.body.traverse(mesh => {
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      for (let parent = mesh.parent; parent && parent !== character.body; parent = parent.parent) {
        if (parent === character.eyes) return;
      }
      const key = mesh.material.uuid + ':' + mesh.castShadow + ':' + mesh.receiveShadow;
      if (!batches.has(key)) batches.set(key, []);
      batches.get(key).push(mesh);
    });
    batches.forEach(meshes => {
      const transformed = meshes.map(mesh => {
        const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseBody, mesh.matrixWorld));
        if (!geo.getAttribute('normal')) geo.computeVertexNormals();
        return geo;
      });
      const combined = new THREE.BufferGeometry();
      ['position', 'normal', 'uv'].forEach(name => {
        const itemSize = name === 'uv' ? 2 : 3;
        const length = transformed.reduce((sum, geo) => sum + geo.getAttribute('position').count * itemSize, 0);
        const data = new Float32Array(length);
        let offset = 0;
        transformed.forEach(geo => {
          const attribute = geo.getAttribute(name);
          if (attribute) data.set(attribute.array, offset);
          offset += geo.getAttribute('position').count * itemSize;
        });
        combined.setAttribute(name, new THREE.BufferAttribute(data, itemSize));
      });
      combined.computeBoundingSphere();
      const merged = new THREE.Mesh(combined, meshes[0].material);
      merged.castShadow = meshes[0].castShadow;
      merged.receiveShadow = meshes[0].receiveShadow;
      merged.name = 'Batched virtual guest';
      character.body.add(merged);
      meshes.forEach(mesh => mesh.removeFromParent());
      transformed.forEach(geo => geo.dispose());
      geometries.set('guest-batch-' + geometries.size, combined);
    });
  }
  const reader = makeCharacter('rabbit', 'rose');
  reader.root.position.set(3.67, .34, -3.75);
  reader.root.rotation.y = -Math.PI / 3;
  reader.root.scale.setScalar(.84);
  reader.leftLeg.rotation.x = reader.rightLeg.rotation.x = -1.15;
  reader.leftArm.rotation.x = reader.rightArm.rotation.x = -.72;
  reader.shadow.visible = false;
  const readerBook = group(reader.body, 0, .73, .37);
  readerBook.rotation.x = .35;
  box(readerBook, .59, .025, .41, palette.sage, 0, 0, 0, .014);
  for (const side of [-1, 1]) {
    const page = box(readerBook, .275, .028, .37, palette.page, side * .141, .024, 0, .009);
    page.rotation.z = side * -.085;
  }
  interact(reader.root, 'guest-reader');
  batchGuestBody(reader);
  const readerBadge = guestNameBadge(reader, '모모', 2.95);

  const traveler = makeCharacter('bear', 'bread');
  traveler.root.position.set(-2.75, 0, 5.25);
  traveler.root.rotation.y = .15;
  traveler.root.scale.setScalar(.88);
  traveler.leftArm.rotation.x = -.5;
  const rolledMap = cylinder(traveler.body, .055, .055, .43, palette.page, -.24, .69, .31, 20);
  rolledMap.rotation.z = Math.PI / 2;
  const mapBand = cylinder(traveler.body, .059, .059, .032, palette.sage, -.24, .69, .31, 20);
  mapBand.rotation.z = Math.PI / 2;
  interact(traveler.root, 'guest-traveler');
  // The reader sits within the bench's existing obstacle. Only the standing
  // guest gets a small collision footprint, outside the central walking aisle.
  obstacle(-2.75, 5.25, .37, .35);
  batchGuestBody(traveler);
  const travelerBadge = guestNameBadge(traveler, '보리', 2.58);
  const guests = [
    { id: 'guest-reader', name: '모모', character: reader, badge: readerBadge, greetingUntil: 0, greetingVisible: false, phase: 1.4 },
    { id: 'guest-traveler', name: '보리', character: traveler, badge: travelerBadge, greetingUntil: 0, greetingVisible: false, phase: 3.1 },
  ];

  const targets = {
    heart: new THREE.Vector3(-1.18, 0, 3),
    story: new THREE.Vector3(2.5, 0, 3.8),
    travel: new THREE.Vector3(2.4, 0, -4.05),
    keeper: new THREE.Vector3(-2.65, 0, .75),
    counter: new THREE.Vector3(0, 0, -6.1),
    table: new THREE.Vector3(.9, 0, 1.75),
    'guest-reader': new THREE.Vector3(2.45, 0, -3.75),
    'guest-traveler': new THREE.Vector3(-1.48, 0, 5.25),
  };
  const facingTargets = {
    heart: carousel.position, story: new THREE.Vector3(3.88, 0, 3.87), travel: new THREE.Vector3(2.15, 0, -5.2),
    keeper: keeper.root.position, counter: backCounter.position, table: darkTable.position,
    'guest-reader': reader.root.position, 'guest-traveler': traveler.root.position,
  };
  const destinationRing = group(room);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: '#e5d68f', transparent: true, opacity: .65, depthWrite: false });
  materials.push(ringMaterial);
  const ring = torus(destinationRing, .34, .018, ringMaterial, 0, .037, 0);
  ring.rotation.x = -Math.PI / 2;
  destinationRing.visible = false;
  const sparkleGroup = group(room);
  const motes = [];
  const moteMaterial = new THREE.MeshBasicMaterial({ color: '#fff7d9', transparent: true, opacity: .5, depthWrite: false });
  materials.push(moteMaterial);
  if (!reducedMotion) for (let i = 0; i < 19; i++) {
    const mote = sphere(sparkleGroup, .015, .015, .015, moteMaterial, -6 + random() * 12, .8 + random() * 3.4, -4 + random() * 8);
    mote.castShadow = mote.receiveShadow = false;
    motes.push({ mesh: mote, base: mote.position.clone(), phase: random() * Math.PI * 2 });
  }

  const nav = { minX: -3.92, maxX: 3.92, minZ: -7.08, maxZ: 6.95, step: .28, radius: .34 };
  const gridW = Math.floor((nav.maxX - nav.minX) / nav.step) + 1;
  const gridH = Math.floor((nav.maxZ - nav.minZ) / nav.step) + 1;
  function blocked(x, z) {
    if (x < nav.minX || x > nav.maxX || z < nav.minZ || z > nav.maxZ) return true;
    return colliders.some(c => Math.abs(x - c.x) < c.halfW + nav.radius && Math.abs(z - c.z) < c.halfD + nav.radius);
  }
  function gridPoint(i, j) { return new THREE.Vector3(nav.minX + i * nav.step, 0, nav.minZ + j * nav.step); }
  function gridIndex(point) {
    return [Math.max(0, Math.min(gridW - 1, Math.round((point.x - nav.minX) / nav.step))), Math.max(0, Math.min(gridH - 1, Math.round((point.z - nav.minZ) / nav.step)))];
  }
  function safePoint(point) {
    if (!blocked(point.x, point.z)) return point.clone();
    const [baseX, baseZ] = gridIndex(point);
    let best = null;
    let bestDistance = Infinity;
    for (let radius = 1; radius < 16; radius++) {
      for (let i = Math.max(0, baseX - radius); i <= Math.min(gridW - 1, baseX + radius); i++) {
        for (let j = Math.max(0, baseZ - radius); j <= Math.min(gridH - 1, baseZ + radius); j++) {
          const p = gridPoint(i, j);
          if (!blocked(p.x, p.z) && p.distanceToSquared(point) < bestDistance) { best = p; bestDistance = p.distanceToSquared(point); }
        }
      }
      if (best) return best;
    }
    return player.root.position.clone();
  }
  function clearLine(a, b) {
    if (blocked(a.x, a.z) || blocked(b.x, b.z)) return false;
    // Exact segment/expanded-rectangle intersection avoids cutting tiny corners
    // that a sampled line could miss while simplifying an A* route.
    for (const c of colliders) {
      let enter = 0;
      let exit = 1;
      let intersects = true;
      for (const axis of ['x', 'z']) {
        const half = axis === 'x' ? c.halfW : c.halfD;
        const low = c[axis] - half - nav.radius + .00001;
        const high = c[axis] + half + nav.radius - .00001;
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < .000001) {
          if (a[axis] <= low || a[axis] >= high) { intersects = false; break; }
        } else {
          const t1 = (low - a[axis]) / delta;
          const t2 = (high - a[axis]) / delta;
          enter = Math.max(enter, Math.min(t1, t2));
          exit = Math.min(exit, Math.max(t1, t2));
          if (enter > exit) { intersects = false; break; }
        }
      }
      if (intersects && exit >= 0 && enter <= 1) return false;
    }
    return true;
  }
  function nearestVisibleGrid(point) {
    const [baseX, baseZ] = gridIndex(point);
    let best = null;
    let distance = Infinity;
    for (let radius = 0; radius < 10; radius++) {
      for (let i = Math.max(0, baseX - radius); i <= Math.min(gridW - 1, baseX + radius); i++) {
        for (let j = Math.max(0, baseZ - radius); j <= Math.min(gridH - 1, baseZ + radius); j++) {
          const p = gridPoint(i, j);
          const d = p.distanceToSquared(point);
          if (d < distance && clearLine(point, p)) { best = [i, j]; distance = d; }
        }
      }
      if (best) return best;
    }
    return gridIndex(point);
  }
  function pathTo(goal) {
    const start = player.root.position.clone();
    const destination = safePoint(goal);
    if (clearLine(start, destination)) return [destination];
    const [sx, sz] = nearestVisibleGrid(start);
    const [gx, gz] = nearestVisibleGrid(destination);
    const startKey = sx + sz * gridW;
    const goalKey = gx + gz * gridW;
    const open = [{ key: startKey, i: sx, j: sz, score: 0 }];
    const costs = new Map([[startKey, 0]]);
    const parents = new Map();
    const closed = new Set();
    let foundKey = null;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (let iteration = 0; open.length && iteration < 3000; iteration++) {
      open.sort((a, b) => a.score - b.score);
      const item = open.shift();
      if (closed.has(item.key)) continue;
      if (item.key === goalKey) { foundKey = item.key; break; }
      closed.add(item.key);
      for (const [di, dj] of dirs) {
        const i = item.i + di;
        const j = item.j + dj;
        if (i < 0 || j < 0 || i >= gridW || j >= gridH) continue;
        const point = gridPoint(i, j);
        if (blocked(point.x, point.z)) continue;
        if (di && dj && (blocked(nav.minX + (item.i + di) * nav.step, nav.minZ + item.j * nav.step) || blocked(nav.minX + item.i * nav.step, nav.minZ + (item.j + dj) * nav.step))) continue;
        const key = i + j * gridW;
        const cost = costs.get(item.key) + (di && dj ? 1.414 : 1);
        if (cost >= (costs.get(key) ?? Infinity)) continue;
        costs.set(key, cost);
        parents.set(key, item.key);
        open.push({ key, i, j, score: cost + Math.hypot(i - gx, j - gz) });
      }
    }
    if (foundKey == null) return [];
    const result = [destination];
    let key = foundKey;
    while (parents.has(key)) {
      const i = key % gridW;
      const j = Math.floor(key / gridW);
      result.unshift(gridPoint(i, j));
      key = parents.get(key);
    }
    result.unshift(gridPoint(sx, sz));
    const simplified = [];
    let from = start;
    for (let i = 0; i < result.length;) {
      let farthest = i;
      for (let j = i + 1; j < result.length; j++) {
        if (clearLine(from, result[j])) farthest = j;
        else break;
      }
      simplified.push(result[farthest]);
      from = result[farthest];
      i = farthest + 1;
    }
    return simplified;
  }
  function navigate(point, interactionId = null, shouldInteract = true) {
    lastArrived = null;
    pendingInteraction = shouldInteract ? interactionId : null;
    activeTarget = interactionId;
    currentPath = pathTo(point);
    destinationRing.visible = currentPath.length > 0;
    if (currentPath.length) destinationRing.position.copy(currentPath[currentPath.length - 1]);
    if (interactionId) options.onStatus?.({ heart: '마음과 기록 책장으로 가는 중', story: '작가의 서재로 가는 중', travel: '빵과 여행 책장으로 가는 중', keeper: '두루 책방지기에게 가는 중', table: '모임 테이블로 가는 중', counter: '계산대로 가는 중', 'guest-reader': '가상 손님 모모에게 가는 중', 'guest-traveler': '가상 손님 보리에게 가는 중' }[interactionId] || '걸어가는 중');
    if (!currentPath.length) {
      pendingInteraction = null;
      activeTarget = null;
      options.onStatus?.('이 자리까지는 걸어갈 수 없어요. 가까운 빈 바닥을 눌러주세요.');
    }
  }
  function arrive() {
    destinationRing.visible = false;
    if (activeTarget) {
      const id = activeTarget;
      lastArrived = id;
      const shouldInteract = pendingInteraction !== null;
      pendingInteraction = null;
      if (facingTargets[id]) {
        const face = facingTargets[id];
        player.root.rotation.y = Math.atan2(face.x - player.root.position.x, face.z - player.root.position.z);
      }
      if (id === 'keeper') keeperGreetingUntil = elapsed + 2;
      const guest = guests.find(item => item.id === id);
      if (guest) guest.greetingUntil = elapsed + 2;
      options.onStatus?.({ heart: '마음과 기록 책장 앞', story: '작가의 서재 앞', travel: '빵과 여행 책장 앞', keeper: '책방지기 두루와 이야기해요', table: '함께 읽는 모임 테이블', counter: '책을 담고 포장하는 계산대', 'guest-reader': '가상 손님 모모와 이야기해요', 'guest-traveler': '가상 손님 보리와 이야기해요' }[id] || '도착했어요');
      if (shouldInteract) options.onInteract?.(id);
    } else options.onStatus?.('책장이나 책방지기를 눌러 이야기해요');
  }
  function pointerRay(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }
  function findInteraction(event) {
    pointerRay(event);
    const hits = raycaster.intersectObjects(interactionRoots, true);
    if (!hits.length) return null;
    let root = hits[0].object;
    while (root && !root.userData.interactionId) root = root.parent;
    return root || null;
  }
  const canvas = renderer.domElement;
  function onPointerDown(event) {
    if (event.button !== 0) return;
    pointerStart = { x: event.clientX, y: event.clientY, azimuth: targetAzimuth, elevation: targetElevation, pointerId: event.pointerId, pointerType: event.pointerType };
    dragDistance = 0;
    canvas.setPointerCapture?.(event.pointerId);
    canvas.style.cursor = 'grabbing';
  }
  function onPointerMove(event) {
    if (pointerStart) {
      const dx = event.clientX - pointerStart.x;
      const dy = event.clientY - pointerStart.y;
      dragDistance = Math.hypot(dx, dy);
      if (dragDistance > 6 && (pointerStart.pointerType !== 'touch' || Math.abs(dx) > Math.abs(dy) + 5)) {
        targetAzimuth = THREE.MathUtils.clamp(pointerStart.azimuth - dx * .0034, -.92, -.14);
        if (pointerStart.pointerType !== 'touch') targetElevation = THREE.MathUtils.clamp(pointerStart.elevation + dy * .0022, .43, .82);
      }
      return;
    }
    const interaction = findInteraction(event);
    hoveringInteractive = Boolean(interaction);
    hoverObject = interaction;
    canvas.style.cursor = hoveringInteractive ? 'pointer' : 'grab';
  }
  function onPointerUp(event) {
    if (!pointerStart || event.pointerId !== pointerStart.pointerId) return;
    if (dragDistance <= 6) {
      const interaction = findInteraction(event);
      if (interaction) {
        const id = interaction.userData.interactionId;
        navigate(targets[id], id);
      } else if (raycaster.ray.intersectPlane(floorPlane, pointerWorld)) {
        if (pointerWorld.x >= nav.minX && pointerWorld.x <= nav.maxX && pointerWorld.z >= nav.minZ && pointerWorld.z <= nav.maxZ) navigate(pointerWorld.clone());
      }
    }
    pointerStart = null;
    canvas.style.cursor = hoveringInteractive ? 'pointer' : 'grab';
    canvas.releasePointerCapture?.(event.pointerId);
  }
  function onPointerCancel() { pointerStart = null; canvas.style.cursor = 'grab'; }
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('pointerleave', onPointerCancel);
  function resize() {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 600 ? 1.45 : 1.8));
    renderer.setSize(width, height, false);
    const aspect = width / height;
    const viewHeight = Math.max(15.8, 17.0 / aspect);
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    if (!inView) renderer.render(scene, camera);
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(entries => {
    inView = entries[0]?.isIntersecting ?? true;
    if (inView && !document.hidden && !animationFrame && !disposed) { clock.getDelta(); animate(); }
  }, { rootMargin: '120px' });
  intersectionObserver.observe(host);
  function visibilityChange() {
    if (!document.hidden && inView && !animationFrame && !disposed) { clock.getDelta(); animate(); }
  }
  document.addEventListener('visibilitychange', visibilityChange);
  // Batch each static material inside its own interaction root. Picking remains
  // per shelf, while hundreds of book details become a handful of GPU draws.
  function batchStaticMeshes() {
    scene.updateMatrixWorld(true);
    const batches = new Map();
    room.traverse(mesh => {
      if (!mesh.isMesh || Array.isArray(mesh.material) || mesh.userData.coverFace) return;
      let ancestor = mesh.parent;
      let root = room;
      while (ancestor && ancestor !== room) {
        if (ancestor === destinationRing || ancestor === sparkleGroup) return;
        if (ancestor.userData.interactionId) { root = ancestor; break; }
        ancestor = ancestor.parent;
      }
      const key = [root.uuid, mesh.material.uuid, mesh.castShadow, mesh.receiveShadow].join(':');
      if (!batches.has(key)) batches.set(key, { root, meshes: [], material: mesh.material, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow });
      batches.get(key).meshes.push(mesh);
    });
    batches.forEach(batch => {
      if (batch.meshes.length < 3) return;
      const inverseRoot = batch.root.matrixWorld.clone().invert();
      const transformed = batch.meshes.map(mesh => {
        const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld));
        if (!geo.getAttribute('normal')) geo.computeVertexNormals();
        return geo;
      });
      const combined = new THREE.BufferGeometry();
      ['position', 'normal', 'uv'].forEach(name => {
        const itemSize = name === 'uv' ? 2 : 3;
        const totalLength = transformed.reduce((sum, geo) => sum + geo.getAttribute('position').count * itemSize, 0);
        const data = new Float32Array(totalLength);
        let offset = 0;
        transformed.forEach(geo => {
          const attribute = geo.getAttribute(name);
          if (attribute) data.set(attribute.array, offset);
          offset += geo.getAttribute('position').count * itemSize;
        });
        combined.setAttribute(name, new THREE.BufferAttribute(data, itemSize));
      });
      combined.computeBoundingBox();
      combined.computeBoundingSphere();
      const merged = new THREE.Mesh(combined, batch.material);
      merged.castShadow = batch.castShadow;
      merged.receiveShadow = batch.receiveShadow;
      merged.name = 'Static bookshop details';
      batch.root.add(merged);
      batch.meshes.forEach(mesh => mesh.removeFromParent());
      transformed.forEach(geo => geo.dispose());
      geometries.set('batch' + geometries.size, combined);
    });
  }
  function angleLerp(from, to, amount) {
    let difference = (to - from + Math.PI) % (Math.PI * 2) - Math.PI;
    if (difference < -Math.PI) difference += Math.PI * 2;
    return from + difference * amount;
  }
  function animateCharacter(character, time, moving, delta) {
    const stride = moving ? Math.sin(time * 11) : 0;
    const smoothing = Math.min(1, delta * 12);
    const idle = reducedMotion ? 0 : Math.sin(time * 2.2) * .008;
    character.body.position.y += ((moving ? Math.abs(stride) * .055 : idle) - character.body.position.y) * smoothing;
    const legSwing = moving ? stride * .43 : 0;
    character.leftLeg.rotation.x += (legSwing - character.leftLeg.rotation.x) * smoothing;
    character.rightLeg.rotation.x += (-legSwing - character.rightLeg.rotation.x) * smoothing;
    character.leftArm.rotation.x += (-legSwing * .8 - character.leftArm.rotation.x) * smoothing;
    character.rightArm.rotation.x += (legSwing * .8 - character.rightArm.rotation.x) * smoothing;
    if (!reducedMotion) {
      character.head.rotation.z = moving ? Math.sin(time * 11) * .018 : Math.sin(time * .9 + (character.keeper ? 1.2 : 0)) * .013;
      const blink = time % (character.keeper ? 5.7 : 4.8);
      character.eyes.scale.y = time > 2.3 && blink > .08 && blink < .18 ? .12 : 1;
    }
  }
  function updateCamera(delta) {
    const ease = reducedMotion ? 1 : Math.min(1, delta * 8);
    azimuth += (targetAzimuth - azimuth) * ease;
    elevation += (targetElevation - elevation) * ease;
    const distance = 24;
    camera.position.set(cameraTarget.x + Math.sin(azimuth) * Math.cos(elevation) * distance, cameraTarget.y + Math.sin(elevation) * distance, cameraTarget.z + Math.cos(azimuth) * Math.cos(elevation) * distance);
    camera.lookAt(cameraTarget);
  }
  function animate() {
    animationFrame = 0;
    if (disposed || !inView || document.hidden) return;
    const delta = Math.min(clock.getDelta(), .085);
    elapsed += delta;
    let moving = false;
    if (currentPath.length) {
      const goal = currentPath[0];
      const offset = goal.clone().sub(player.root.position);
      offset.y = 0;
      const distance = offset.length();
      if (distance < .055) {
        player.root.position.copy(goal);
        currentPath.shift();
        if (!currentPath.length) arrive();
      } else {
        moving = true;
        offset.normalize();
        const speed = 2.3;
        const step = Math.min(distance, delta * speed);
        const next = player.root.position.clone().addScaledVector(offset, step);
        if (!blocked(next.x, next.z)) player.root.position.copy(next);
        else { currentPath = []; pendingInteraction = null; destinationRing.visible = false; }
        player.root.rotation.y = angleLerp(player.root.rotation.y, Math.atan2(offset.x, offset.z), Math.min(1, delta * 13));
      }
    }
    animateCharacter(player, elapsed, moving, delta);
    animateCharacter(keeper, elapsed + .8, false, delta);
    guests.forEach(guest => {
      animateCharacter(guest.character, elapsed + guest.phase, false, delta);
      // The guest's posed body is batched; only a gentle breath and eye blink
      // animate. Their fixed position never creates a moving corridor blocker.
      guest.character.head.rotation.z = 0;
      const greeting = elapsed < guest.greetingUntil;
      if (greeting !== guest.greetingVisible) {
        guest.greetingVisible = greeting;
        guest.badge.draw(greeting);
      }
      guest.badge.sprite.position.y = guest.badge.height + (reducedMotion ? 0 : Math.sin(elapsed * 1.7 + guest.phase) * .028);
      const emphasized = greeting || hoverObject === guest.character.root;
      guest.badge.sprite.scale.set(1.92 * (emphasized ? 1.06 : 1), .78 * (emphasized ? 1.06 : 1), 1);
    });
    const greetingActive = elapsed < keeperGreetingUntil;
    greetingBubble.visible = greetingActive;
    keeperMarker.visible = !greetingActive;
    if (!reducedMotion && greetingActive) {
      keeper.rightArm.rotation.z = 1.85 + Math.sin(elapsed * 12) * .2;
      keeper.rightArm.position.y += (1.22 - keeper.rightArm.position.y) * Math.min(1, delta * 10);
    } else {
      keeper.rightArm.rotation.z += (.12 - keeper.rightArm.rotation.z) * Math.min(1, delta * 10);
      keeper.rightArm.position.y += (.91 - keeper.rightArm.position.y) * Math.min(1, delta * 10);
    }
    if (!reducedMotion) {
      keeperMarker.position.y = 2.63 + Math.sin(elapsed * 2.6) * .052;
      ring.scale.setScalar(.99 + Math.sin(elapsed * 4) * .065);
      motes.forEach(mote => {
        mote.mesh.position.x = mote.base.x + Math.sin(elapsed * .27 + mote.phase) * .12;
        mote.mesh.position.y = mote.base.y + Math.sin(elapsed * .4 + mote.phase) * .16;
      });
    }
    if (hoverObject) {
      const id = hoverObject.userData.interactionId;
      keeperMarker.scale.setScalar(id === 'keeper' ? 1.18 : 1);
    } else keeperMarker.scale.setScalar(1);
    updateCamera(delta);
    if (moving) renderer.shadowMap.needsUpdate = true;
    renderer.render(scene, camera);
    animationFrame = requestAnimationFrame(animate);
  }
  batchStaticMeshes();
  resize();
  updateCamera(1);
  renderer.render(scene, camera);
  animate();
  options.onStatus?.('개띠랑 책방에 오신 걸 환영해요');
  options.onReady?.();
  return {
    goTo(id) { if (targets[id]) navigate(targets[id], id, false); },
    setAvatar({ animal, shirt } = {}) {
      const selectedAnimal = ['cat', 'bear', 'rabbit'].includes(animal) ? animal : player.root.userData.animal;
      const selectedShirt = ['forest', 'bread', 'rose'].includes(shirt) ? shirt : player.root.userData.shirt;
      const position = player.root.position.clone();
      const rotation = player.root.rotation.y;
      scene.remove(player.root);
      player = makeCharacter(selectedAnimal, selectedShirt);
      player.root.position.copy(position);
      player.root.rotation.y = rotation;
      renderer.shadowMap.needsUpdate = true;
    },
    setLighting(mode) {
      dayMode = mode === 'evening' ? 'evening' : 'day';
      const evening = dayMode === 'evening';
      scene.background.set(evening ? '#dcddd7' : '#e9e9e2');
      scene.fog.color.copy(scene.background);
      hemi.color.set(evening ? '#ecd8bc' : '#fff5db');
      hemi.intensity = evening ? 1.5 : 2.2;
      sun.color.set(evening ? '#ffbf83' : '#fff0cb');
      sun.intensity = evening ? 1.7 : 3.25;
      sun.position.set(evening ? -9 : -6, evening ? 6 : 11, 8);
      fill.intensity = evening ? .65 : .9;
      warmLights.forEach(light => { light.intensity = evening ? 10 : 5; });
      lampGlow.emissiveIntensity = evening ? 1.1 : .7;
      sky.color.set(evening ? '#7a827b' : '#9ca5a0');
      renderer.toneMappingExposure = evening ? 1.04 : 1.05;
      renderer.shadowMap.needsUpdate = true;
    },
    rotateCamera() {
      targetAzimuth = targetAzimuth < -.7 ? -.18 : targetAzimuth > -.3 ? -.56 : -.87;
    },
    resetCamera() { targetAzimuth = cameraHome.azimuth; targetElevation = cameraHome.elevation; },
    dispose() {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', visibilityChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointerleave', onPointerCancel);
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(mat => mat.dispose());
      textures.forEach(texture => texture.dispose());
      renderer.dispose();
      canvas.remove();
    },
    getDebugState() {
      function project(point) {
        const projected = point.clone().project(camera);
        return { x: (projected.x + 1) * host.clientWidth / 2, y: (1 - projected.y) * host.clientHeight / 2, visible: projected.x >= -1 && projected.x <= 1 && projected.y >= -1 && projected.y <= 1 && projected.z >= -1 && projected.z <= 1 };
      }
      const guestInfo = guests.map(guest => {
        const projected = new THREE.Vector3(0, 1.5, .38).applyMatrix4(guest.character.root.matrixWorld).project(camera);
        const target = targets[guest.id];
        return { id: guest.id, name: guest.name, kind: 'scripted-npc', animal: guest.character.root.userData.animal, shirt: guest.character.root.userData.shirt, position: guest.character.root.position.toArray(), approach: target.toArray(), approachClear: !blocked(target.x, target.z), screen: { x: (projected.x + 1) * host.clientWidth / 2, y: (1 - projected.y) * host.clientHeight / 2 } };
      });
      return {
        mode: 'real-3d', layout: 'photo-reference-v1',
        room: { width: 8.8, length: 15, measured: false, bounds: { minX: -4.4, maxX: 4.4, minZ: -7.5, maxZ: 7.5 } },
        landmarks: layoutLandmarks.map(item => ({ id: item.id, kind: item.kind, position: item.position.toArray(), screen: project(item.position), material: { color: '#' + item.material.color.getHexString(), roughness: item.material.roughness } })),
        targets: Object.entries(targets).map(([id, point]) => ({ id, approach: point.toArray(), approachClear: !blocked(point.x, point.z), screen: project(point) })),
        lastArrived, playerClear: !blocked(player.root.position.x, player.root.position.z), movementSpeed: 2.3,
        avatar: player.root.userData.animal, shirt: player.root.userData.shirt, player: player.root.position.toArray(), target: activeTarget, moving: currentPath.length > 0, pendingInteraction, lighting: dayMode, meshCount: renderer.info.render.calls, camera: { azimuth, elevation }, width: host.clientWidth, height: host.clientHeight, inView, reducedMotion, guests: guestInfo,
      };
    },
  };
}
