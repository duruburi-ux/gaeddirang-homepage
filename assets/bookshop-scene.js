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
  const cameraTarget = new THREE.Vector3(0, 1.8, -.25);
  const cameraHome = { azimuth: .43, elevation: .62 };
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

  const room = group(scene);
  box(room, 15.2, .48, 10.7, palette.oakEdge, 0, -.32, -.1, .2);
  box(room, 15.05, .15, 10.55, palette.oakLight, 0, -.095, -.1, .09);
  // Separate beveled floorboards catch the sunlight and make the floor tangible.
  for (let row = 0; row < 20; row++) {
    const z = -5.15 + row * .51;
    for (let col = 0; col < 4; col++) {
      const x = -5.63 + col * 3.76;
      const plank = box(room, 3.735, .045, .486, (row + col) % 4 === 0 ? palette.floorAlt : palette.floor, x, -.017, z, .015);
      plank.castShadow = false;
    }
  }
  box(room, 15.2, 5.45, .2, palette.plaster, 0, 2.58, -5.45, .05);
  box(room, .2, 5.45, 10.65, palette.plaster, -7.52, 2.58, -.1, .05);
  box(room, 15.05, .24, .16, palette.oakLight, 0, .12, -5.29, .025);
  box(room, .16, .24, 10.3, palette.oakLight, -7.36, .12, -.1, .025);
  box(room, 15.2, .24, .34, palette.oakLight, 0, 5.17, -5.39, .07);
  box(room, .33, .24, 10.65, palette.oakLight, -7.5, 5.17, -.1, .07);
  box(room, .2, 5.45, .22, palette.oakEdge, -7.38, 2.58, 5.08, .04);

  const hemi = new THREE.HemisphereLight('#fff5db', '#9ba082', 2.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0cb', 3.4);
  sun.position.set(-5, 12, 8);
  sun.target.position.set(0, 0, -1);
  sun.castShadow = true;
  const shadowResolution = host.clientWidth < 600 ? 1024 : 2048;
  sun.shadow.mapSize.set(shadowResolution, shadowResolution);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 35;
  sun.shadow.bias = -.0004;
  sun.shadow.normalBias = .028;
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight('#d7e7de', .9);
  fill.position.set(8, 6, -1);
  scene.add(fill);
  const warmLights = [];
  const lampGlow = material('#fff3b8', { emissive: '#ffcf6c', emissiveIntensity: .7, roughness: .48 });
  const glass = material('#cfe1c2', { roughness: .22, transparent: true, opacity: .3 });

  // An arched, deeply recessed window opens onto a tiny green landscape.
  const windowGroup = group(room, -7.35, 0, -.4);
  windowGroup.rotation.y = Math.PI / 2;
  const archShape = new THREE.Shape();
  archShape.moveTo(-1.3, 1.25);
  archShape.lineTo(1.3, 1.25);
  archShape.lineTo(1.3, 3.4);
  archShape.absarc(0, 3.4, 1.3, 0, Math.PI, false);
  archShape.lineTo(-1.3, 1.25);
  const archGeo = new THREE.ShapeGeometry(archShape, 40);
  geometries.set('windowArch', archGeo);
  const sky = material('#b6d9c4', { roughness: 1, emissive: '#a6cdbc', emissiveIntensity: .14 });
  const skyMesh = new THREE.Mesh(archGeo, sky);
  skyMesh.position.z = .02;
  windowGroup.add(skyMesh);
  const hillMat = material('#86a878');
  sphere(windowGroup, 1.4, .75, .065, hillMat, -.45, 1.7, .05);
  sphere(windowGroup, .7, .85, .055, palette.sage, .74, 1.7, .08);
  sphere(windowGroup, .45, .31, .08, material('#e6eee0'), -.54, 3.4, .065);
  sphere(windowGroup, .43, .28, .075, material('#e6eee0'), -.2, 3.39, .06);
  sphere(windowGroup, .33, .22, .07, material('#e6eee0'), .14, 3.4, .06);
  const smallTree = group(windowGroup, .78, 1.6, .15);
  cylinder(smallTree, .035, .045, 1.1, palette.oakEdge, 0, .38);
  sphere(smallTree, .43, .5, .09, palette.moss, 0, 1.0, 0);
  const glassMesh = new THREE.Mesh(archGeo, glass);
  glassMesh.position.z = .19;
  windowGroup.add(glassMesh);
  box(windowGroup, .13, 2.19, .22, palette.oakLight, -1.35, 2.3, .21, .04);
  box(windowGroup, .13, 2.19, .22, palette.oakLight, 1.35, 2.3, .21, .04);
  const archRim = torus(windowGroup, 1.35, .075, palette.oakLight, 0, 3.4, .2, Math.PI);
  box(windowGroup, 2.86, .18, .48, palette.oakLight, 0, 1.24, .24, .045);
  box(windowGroup, .07, 3.36, .11, palette.oakLight, 0, 2.92, .31, .02);
  box(windowGroup, 2.65, .075, .11, palette.oakLight, 0, 2.76, .31, .02);
  // Folded linen curtains, rather than billboard illustrations.
  const curtain = material('#e8ddbf', { roughness: 1 });
  for (const side of [-1, 1]) {
    for (let fold = 0; fold < 5; fold++) {
      const x = side * (1.28 + fold * .075);
      const mesh = cylinder(windowGroup, .067, .081, 2.94, curtain, x, 2.85, .43, 16);
      mesh.rotation.z = side * -.065;
    }
    box(windowGroup, .35, .08, .25, palette.sage, side * 1.39, 2.18, .46, .02);
  }
  cylinder(windowGroup, .045, .045, 3.5, palette.brass, 0, 4.66, .42).rotation.z = Math.PI / 2;

  const bookMats = ['#6f8c6d', '#ba7d69', '#dbb56b', '#7d9895', '#958ca0', '#e3cfb0', '#698087', '#c1a36f', '#bbaca0'].map(c => material(c));
  const shelfBookMats = {
    heart: ['#b7958e', '#a78073', '#819579', '#d8c2ad', '#a4aba0', '#c9b19d'].map(c => material(c)),
    story: ['#788b88', '#a98877', '#69786e', '#d9c5a9', '#998a7b', '#a4aea1'].map(c => material(c)),
    travel: ['#d0ae61', '#91a488', '#c2996e', '#d5cfac', '#8fa5a0', '#c4ac7f'].map(c => material(c)),
  };
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
          child.material.map = tex;
          child.material.color.set('#ffffff');
          child.material.needsUpdate = true;
        }
      });
    });
  });
  function uprightBook(parent, width, height, depth, mat, x, y, z, tilt = 0) {
    const book = group(parent, x, y, z);
    book.rotation.z = tilt;
    box(book, width, height, depth, mat, 0, height / 2, 0, .025);
    box(book, width * .69, height - .11, depth - .085, palette.page, .011, height / 2, -.037, .012);
    box(book, width + .012, .035, depth + .02, mat, 0, .03, 0, .012);
    box(book, width + .012, .035, depth + .02, mat, 0, height - .03, 0, .012);
    box(book, width * .7, .035, .009, palette.ivory, 0, height * .23, depth / 2 + .007, .004);
    box(book, width * .7, .035, .009, palette.ivory, 0, height * .73, depth / 2 + .007, .004);
    return book;
  }
  function displayBook(parent, id, mat, x, y, z, rotation = 0, featured = false) {
    const display = group(parent, x, y, z);
    display.rotation.y = rotation;
    display.rotation.x = -.1;
    const width = featured ? .68 : .58;
    const height = featured ? .86 : .79;
    box(display, width, height, .11, mat, 0, height / 2, 0, .025);
    const coverMat = material(mat.color, { map: bookCoverTextures.get(id) || null });
    const coverGeo = new THREE.PlaneGeometry(width - .065, height - .08);
    geometries.set('cover' + geometries.size, coverGeo);
    const cover = new THREE.Mesh(coverGeo, coverMat);
    cover.position.set(0, height / 2, .059);
    cover.userData.bookId = id;
    cover.userData.coverFace = true;
    display.add(cover);
    if (!options.bookCovers || !options.bookCovers[id]) {
      // The cover decoration consists of actual raised, printed-looking objects.
      sphere(display, .13, .13, .006, palette.ivory, 0, .48, .067);
      box(display, .27, .022, .011, palette.ivory, 0, .22, .067, .002);
      box(display, .2, .016, .011, palette.ivory, 0, .17, .067, .002);
    }
    box(parent, width + .1, .09, .35, palette.oakLight, x, y + .03, z + .075, .025);
    return display;
  }
  const shelfConfigs = [
    { id: 'heart', x: -4.7, title: '마음과 기록', sub: '마음이 쉬어가는 책', tint: '#ead4c5', coverIds: ['outside', 'feeling', 'night'] },
    { id: 'story', x: 0, title: '작가의 서재', sub: '이야기가 자라는 자리', tint: '#e2e8cd', coverIds: ['uncomfortable', 'someday', 'door'] },
    { id: 'travel', x: 4.7, title: '빵과 여행', sub: '호기심을 따라 걷기', tint: '#eee2bf', coverIds: ['breadful', 'bread2', 'bread1'] },
  ];
  for (const config of shelfConfigs) {
    const shelf = interact(group(room, config.x, 0, -4.59), config.id);
    obstacle(config.x, -4.54, 1.89, .62);
    softShadow(room, 2.2, .86, .28, config.x, -4.4);
    box(shelf, 3.8, 3.5, .2, palette.oakEdge, 0, 1.95, -.46, .09);
    box(shelf, 3.48, 3.25, .075, material('#c7aa7c'), 0, 1.93, -.34, .02);
    for (const x of [-1.79, 1.79]) box(shelf, .18, 3.72, .92, palette.oakLight, x, 1.92, 0, .065);
    box(shelf, 3.85, .2, 1.04, palette.oakLight, 0, 3.72, .02, .065);
    box(shelf, 3.73, .34, .91, palette.oakLight, 0, .34, 0, .055);
    for (const y of [.62, 1.6, 2.58]) box(shelf, 3.61, .11, .92, palette.oakLight, 0, y, 0, .028);
    box(shelf, 3.28, .6, .13, palette.oakLight, 0, 4.08, .04, .1);
    label(shelf, config.title, config.sub, 3.02, 0, 4.08, .115, config.tint);
    for (const x of [-1.12, 1.12]) {
      cylinder(shelf, .026, .026, .2, palette.brass, x, 3.88, .045);
    }
    for (let row = 0; row < 3; row++) {
      let cursor = -1.52;
      const rowY = .685 + row * .98;
      const hasActualCover = Boolean(options.bookCovers?.[config.coverIds[row]]);
      const bookCount = hasActualCover ? 6 : row === 2 ? 7 : 10;
      for (let i = 0; i < bookCount; i++) {
        const width = .14 + random() * .13;
        const height = .56 + random() * .29;
        const mat = shelfBookMats[config.id][(i + row * 2) % shelfBookMats[config.id].length];
        uprightBook(shelf, width, height, .47 + random() * .08, mat, cursor + width / 2, rowY, .12, i === bookCount - 1 ? -.11 : (random() - .5) * .025);
        cursor += width + .035;
      }
      if (hasActualCover || row === 2) displayBook(shelf, config.coverIds[row], shelfBookMats[config.id][0], 1.02, rowY, .17, -.07, row === 2);
      if (row === 0 && !hasActualCover) {
        const stack = group(shelf, 1.1, rowY, .16);
        for (let i = 0; i < 3; i++) {
          const horizontalBook = box(stack, .64 - i * .025, .1, .44, bookMats[(i + 4) % bookMats.length], i * .01, .052 + i * .108, 0, .02);
          horizontalBook.rotation.y = (i - 1) * .04;
          box(stack, .55, .06, .012, palette.page, i * .01, .052 + i * .108, .225, .007);
        }
      }
      if (row === 1) {
        const bookend = group(shelf, hasActualCover ? .45 : 1.13, rowY, .11);
        sphere(bookend, .18, .15, .16, palette.ceramic, 0, .14, 0);
        sphere(bookend, .16, .16, .14, palette.ceramic, 0, .33, .035);
        sphere(bookend, .045, .08, .04, palette.ceramic, -.1, .47, .025);
        sphere(bookend, .045, .08, .04, palette.ceramic, .1, .47, .025);
        sphere(bookend, .018, .021, .012, palette.dark, -.055, .34, .165);
        sphere(bookend, .018, .021, .012, palette.dark, .055, .34, .165);
        sphere(bookend, .019, .018, .009, palette.pink, 0, .285, .173);
      }
    }
    // Each category has a different physical silhouette at the shelf's crown.
    const categoryProp = group(shelf, -1.27, 3.84, .32);
    if (config.id === 'heart') {
      const notebook = material('#bf928b', { roughness: .95 });
      box(categoryProp, .54, .065, .37, notebook, 0, .035, 0, .025);
      box(categoryProp, .48, .042, .32, palette.page, 0, .072, 0, .009);
      box(categoryProp, .54, .025, .37, notebook, 0, .106, 0, .012);
      box(categoryProp, .028, .012, .38, palette.sage, .16, .123, 0, .005);
      const letter = group(categoryProp, -.03, .13, -.045);
      letter.rotation.z = -.11;
      box(letter, .44, .29, .045, palette.ivory, 0, .145, 0, .018);
      curveTube(letter, [[-.195, .267, .027], [0, .118, .029], [.195, .267, .027]], .004, palette.oakLight);
      sphere(letter, .028, .027, .009, palette.pink, 0, .129, .034);
    } else if (config.id === 'story') {
      box(categoryProp, .57, .06, .39, palette.page, 0, .034, 0, .009);
      const manuscript = box(categoryProp, .56, .016, .38, palette.ivory, .012, .074, .014, .007);
      manuscript.rotation.y = -.08;
      for (let i = 0; i < 5; i++) box(categoryProp, .33 - i % 2 * .06, .002, .006, palette.oakEdge, -.04, .084, -.12 + i * .044, .001).castShadow = false;
      const pencilCup = cylinder(categoryProp, .11, .095, .19, palette.darkSage, .13, .173, -.045, 24);
      for (let i = 0; i < 3; i++) {
        const pen = cylinder(categoryProp, .013, .013, .32, i === 1 ? palette.brass : palette.oakLight, .08 + i * .05, .4, -.05, 10);
        pen.rotation.z = (i - 1) * .13;
        cylinder(categoryProp, 0, .013, .045, palette.dark, .08 + i * .05 + (1 - i) * .02, .576, -.05, 10);
      }
    } else {
      const breadCrust = material('#cfa263', { roughness: 1 });
      const breadScore = material('#f1d2a0', { roughness: 1 });
      const basket = material('#af8754', { roughness: 1 });
      box(categoryProp, .59, .13, .42, basket, 0, .066, 0, .075);
      box(categoryProp, .51, .025, .35, palette.linen, 0, .14, 0, .04);
      const loaf = sphere(categoryProp, .25, .16, .17, breadCrust, 0, .238, 0);
      loaf.rotation.y = -.12;
      for (let i = 0; i < 3; i++) {
        const x = -.13 + i * .13;
        curveTube(categoryProp, [[x - .024, .339, -.09], [x, .378, 0], [x + .024, .34, .09]], .014, breadScore);
      }
      for (const side of [-1, 1]) {
        const handle = torus(categoryProp, .097, .014, basket, side * .294, .11, 0, Math.PI);
        handle.rotation.y = Math.PI / 2;
      }
    }
    for (const x of [-1.68, 1.68]) box(shelf, .19, .15, .74, palette.oakEdge, x, .105, 0, .04);
  }

  function plant(parent, x, z, size = 1, potColor = palette.terracotta) {
    const p = group(parent, x, 0, z);
    cylinder(p, .33 * size, .24 * size, .54 * size, potColor, 0, .27 * size);
    const rim = torus(p, .32 * size, .045 * size, potColor, 0, .54 * size, 0);
    rim.rotation.x = Math.PI / 2;
    cylinder(p, .295 * size, .295 * size, .025, material('#645940'), 0, .55 * size);
    const leafMat = material('#719567', { roughness: .8 });
    const leafLight = material('#a3b887', { roughness: .84 });
    for (let stemIndex = 0; stemIndex < 8; stemIndex++) {
      const a = stemIndex * Math.PI * .77;
      const end = [.3 * Math.sin(a) * size, (.96 + random() * .54) * size, .3 * Math.cos(a) * size];
      curveTube(p, [[0, .55 * size, 0], [end[0] * .65, end[1] * .7, end[2] * .65], end], .014 * size, palette.darkSage);
      const leaf = sphere(p, .15 * size, .36 * size, .055 * size, stemIndex % 2 ? leafMat : leafLight, ...end);
      leaf.rotation.z = -.65 * Math.sin(a);
      leaf.rotation.x = .7 * Math.cos(a);
      leaf.rotation.y = a;
    }
    softShadow(parent, .5 * size, .5 * size, .24, x, z);
    return p;
  }
  plant(room, -6.48, -2.8, .95);
  obstacle(-6.48, -2.8, .4, .4);
  plant(room, 6.45, -2.85, 1.15, palette.ceramic);
  obstacle(6.45, -2.85, .5, .5);
  plant(room, -6.48, 4.06, 1.15);
  obstacle(-6.48, 4.06, .5, .5);
  plant(room, 6.35, 3.84, .76, palette.ceramic);
  obstacle(6.35, 3.84, .4, .4);

  // Thick tufted rugs ground the furniture without hiding the wood floor.
  const rug = box(room, 4.7, .04, 3.4, palette.linen, 3.2, .025, 1.05, .55);
  rug.castShadow = false;
  const rugInside = box(room, 4.43, .016, 3.13, material('#c8d1b1'), 3.2, .054, 1.05, .45);
  rugInside.castShadow = false;
  for (let i = 0; i < 15; i++) {
    for (const end of [-1, 1]) {
      const fringe = box(room, .025, .025, .19, palette.linen, 1.23 + i * .28, .043, 1.05 + end * 1.78, .01);
      fringe.rotation.y = (i % 3 - 1) * .15;
      fringe.castShadow = false;
    }
  }
  const welcomeMat = material('#bd9777', { roughness: 1 });
  box(room, 2.65, .035, 1.2, welcomeMat, -.4, .026, 4.24, .22).castShadow = false;
  const doormat = label(room, '어서 와요', '', 1.85, -.4, .05, 4.24, '#b99475');
  doormat.rotation.x = -Math.PI / 2;

  function cup(parent, x, y, z, mat = palette.ceramic) {
    cylinder(parent, .12, .09, .2, mat, x, y + .1, z);
    const top = cylinder(parent, .105, .105, .007, material('#835d3d'), x, y + .201, z);
    const handle = torus(parent, .081, .025, mat, x + .135, y + .11, z);
    handle.rotation.y = Math.PI / 2;
    cylinder(parent, .175, .175, .022, mat, x, y + .009, z);
    return { top, handle };
  }
  const table = interact(group(room, 3.18, 0, .94), 'table');
  obstacle(3.18, .94, 1.57, 1.34);
  cylinder(table, 1.32, 1.38, .18, palette.oakLight, 0, 1.31);
  cylinder(table, .5, .7, .16, palette.oak, 0, .16);
  cylinder(table, .22, .33, 1.04, palette.oak, 0, .69);
  softShadow(room, 1.7, 1.6, .3, 3.18, .94);
  const tablecloth = cylinder(table, .74, .74, .017, palette.linen, -.05, 1.409, .03);
  cup(table, .59, 1.415, .43);
  cup(table, -.63, 1.415, -.19, palette.sage);
  cylinder(table, .36, .36, .025, palette.ceramic, -.19, 1.427, .46);
  for (let i = 0; i < 3; i++) {
    const cookie = cylinder(table, .095, .095, .043, material('#c99953'), -.34 + i * .16, 1.46, .46, 24);
    for (let chip = 0; chip < 3; chip++) sphere(table, .01, .006, .01, palette.oakEdge, cookie.position.x + (random() - .5) * .09, 1.484, .46 + (random() - .5) * .1);
  }
  const openBook = group(table, .2, 1.431, -.43);
  openBook.rotation.y = -.35;
  box(openBook, .64, .035, .45, palette.sage, 0, 0, 0, .018);
  for (const side of [-1, 1]) {
    const pages = box(openBook, .3, .028, .42, palette.page, side * .154, .025, 0, .007);
    pages.rotation.z = side * -.07;
    for (let line = 0; line < 7; line++) box(openBook, .21, .002, .006, material('#9e9c85'), side * .16, .047, -.13 + line * .044, .001).castShadow = false;
  }
  const flowerVase = cylinder(table, .075, .13, .23, palette.ceramic, -.19, 1.545, -.08);
  for (let i = 0; i < 3; i++) {
    const fx = -.19 + (i - 1) * .07;
    curveTube(table, [[-.19, 1.66, -.08], [fx, 1.89, -.1], [fx, 1.95, -.1]], .006, palette.sage);
    sphere(table, .046, .034, .046, i % 2 ? palette.pink : palette.ivory, fx, 1.98, -.1);
  }
  function stool(x, z, rotation) {
    const s = group(room, x, 0, z);
    s.rotation.y = rotation;
    cylinder(s, .47, .48, .16, palette.oakLight, 0, .62);
    cylinder(s, .405, .405, .12, material('#93a27a', { roughness: 1 }), 0, .735);
    for (const [lx, lz] of [[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25]]) {
      const leg = cylinder(s, .042, .067, .61, palette.oak, lx, .32, lz, 16);
      leg.rotation.z = -lx * .28;
      leg.rotation.x = lz * .28;
    }
    softShadow(room, .57, .57, .2, x, z);
    obstacle(x, z, .41, .41);
    return s;
  }
  stool(3.18, -.79, 0);
  stool(4.88, 1.27, .6);
  stool(2.96, 2.74, -.1);

  // The bookseller's oak counter has real joinery, drawers and a wrapping station.
  const counter = interact(group(room, -4.65, 0, 1.36), 'counter');
  obstacle(-4.65, 1.36, 1.7, .73);
  box(counter, 3.28, 1.36, 1.31, palette.oak, 0, .78, 0, .12);
  box(counter, 3.57, .19, 1.52, palette.oakLight, 0, 1.5, .015, .09);
  box(counter, 3.06, 1.12, .025, palette.oakLight, 0, .82, .669, .04);
  for (const x of [-.96, 0, .96]) {
    box(counter, .85, .85, .045, palette.oak, x, .82, .7, .065);
    box(counter, .68, .67, .03, palette.oakLight, x, .82, .728, .05);
  }
  box(counter, 3.22, .13, .16, palette.oakEdge, 0, .16, .67, .03);
  for (const x of [-1.27, 1.27]) box(counter, .23, .19, 1.08, palette.oakEdge, x, .11, 0, .04);
  softShadow(room, 2.1, 1.04, .28, -4.65, 1.36);
  const checkout = group(counter, -.78, 1.615, -.03);
  box(checkout, .52, .095, .45, palette.darkSage, 0, .045, 0, .06);
  const display = box(checkout, .49, .41, .075, palette.darkSage, 0, .28, -.08, .055);
  display.rotation.x = -.24;
  const displayScreen = box(checkout, .405, .3, .013, material('#bed4b3', { roughness: .2, emissive: '#93ae83', emissiveIntensity: .12 }), 0, .282, -.027, .03);
  displayScreen.rotation.x = -.24;
  box(counter, .88, .2, .63, material('#c99a68'), .66, 1.699, .01, .03);
  box(counter, .035, .211, .65, palette.ivory, .66, 1.707, .01, .007);
  box(counter, .9, .21, .03, palette.ivory, .66, 1.707, .02, .006);
  const bow = torus(counter, .08, .02, palette.ivory, .61, 1.82, .01);
  bow.rotation.x = Math.PI / 2;
  const bow2 = torus(counter, .08, .02, palette.ivory, .74, 1.82, .01);
  bow2.rotation.x = Math.PI / 2;
  cup(counter, -1.37, 1.603, -.33, palette.sage);
  const counterSign = group(counter, 1.36, 1.601, .35);
  box(counterSign, .36, .31, .03, palette.oakLight, 0, .155, 0, .025);
  counterSign.rotation.x = -.1;
  label(counterSign, '계산대', '', .31, 0, .155, .02);

  const sofa = group(room, -5.94, 0, -1.2);
  sofa.rotation.y = Math.PI / 2;
  box(sofa, 2.04, .31, .84, palette.sage, 0, .43, 0, .16);
  box(sofa, 2.04, .94, .29, palette.sage, 0, .97, -.39, .17);
  for (const side of [-1, 1]) {
    box(sofa, .25, .61, .9, palette.sage, side * .99, .71, 0, .11);
    box(sofa, .14, .29, .14, palette.oakEdge, side * .77, .17, .24, .04);
    box(sofa, .14, .29, .14, palette.oakEdge, side * .77, .17, -.27, .04);
  }
  for (const side of [-1, 1]) box(sofa, .84, .19, .67, material('#90a381'), side * .45, .66, .035, .09);
  const cushion = box(sofa, .47, .5, .19, material('#e8c3a1'), -.54, 1.0, -.23, .13);
  cushion.rotation.z = -.16;
  const cushion2 = box(sofa, .47, .5, .19, palette.linen, .61, 1.0, -.23, .13);
  cushion2.rotation.z = .17;
  obstacle(-5.94, -1.2, .69, 1.12);
  softShadow(room, .8, 1.35, .23, -5.94, -1.2);

  function pendant(x, z, height = 4.52) {
    const lamp = group(room, x, height, z);
    cylinder(lamp, .017, .017, .65, palette.brass, 0, .33);
    cylinder(lamp, .055, .36, .29, palette.sage, 0, -.16);
    cylinder(lamp, .315, .315, .04, lampGlow, 0, -.317);
    cylinder(lamp, .062, .07, .095, palette.brass, 0, .005);
    const light = new THREE.PointLight('#ffd998', 9, 7, 2);
    light.position.set(0, -.51, 0);
    lamp.add(light);
    warmLights.push(light);
  }
  pendant(-4.59, 1.37, 4.26);
  pendant(3.18, .94, 4.45);

  const wallClock = group(room, 6.91, 4.56, -5.27);
  cylinder(wallClock, .31, .31, .12, palette.oakEdge).rotation.x = Math.PI / 2;
  cylinder(wallClock, .261, .261, .014, palette.ivory, 0, 0, .069).rotation.x = Math.PI / 2;
  for (let hour = 0; hour < 12; hour++) {
    const a = hour * Math.PI / 6;
    const tick = box(wallClock, .018, hour % 3 === 0 ? .044 : .027, .012, palette.oakEdge, Math.sin(a) * .216, Math.cos(a) * .216, .079, .003);
    tick.rotation.z = -a;
  }
  const shortHand = box(wallClock, .016, .135, .015, palette.dark, -.035, .049, .088, .004);
  shortHand.rotation.z = -.55;
  box(wallClock, .016, .19, .015, palette.dark, .047, .062, .097, .004).rotation.z = -.7;
  sphere(wallClock, .025, .025, .012, palette.brass, 0, 0, .105);

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
  player.root.position.set(.06, 0, 3.14);
  player.root.rotation.y = .1;
  const keeper = makeCharacter('bear', 'bread', true);
  keeper.root.position.set(-4.6, 0, -.03);
  keeper.root.rotation.y = .13;
  interact(keeper.root, 'keeper');
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
  const namePlate = group(room, -4.58, 2.14, -.15);
  box(namePlate, 1.14, .31, .065, palette.ivory, 0, 0, 0, .1);
  label(namePlate, '책방지기 두루', '', 1.06, 0, 0, .04);

  // These are authored bookstore NPCs, not connected or remotely controlled
  // visitors. They use existing seating / an empty room edge, not a new layout.
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
  reader.root.position.set(-5.86, .34, -.62);
  reader.root.rotation.y = Math.PI / 3;
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
  traveler.root.position.set(5.87, 0, 2.45);
  traveler.root.rotation.y = -.52;
  traveler.root.scale.setScalar(.88);
  traveler.leftArm.rotation.x = -.5;
  const rolledMap = cylinder(traveler.body, .055, .055, .43, palette.page, -.24, .69, .31, 20);
  rolledMap.rotation.z = Math.PI / 2;
  const mapBand = cylinder(traveler.body, .059, .059, .032, palette.sage, -.24, .69, .31, 20);
  mapBand.rotation.z = Math.PI / 2;
  interact(traveler.root, 'guest-traveler');
  // The reader sits within the sofa's existing obstacle. Only the standing
  // guest gets a small collision footprint, outside the central walking aisle.
  obstacle(5.87, 2.45, .37, .35);
  batchGuestBody(traveler);
  const travelerBadge = guestNameBadge(traveler, '보리', 2.58);
  const guests = [
    { id: 'guest-reader', name: '모모', character: reader, badge: readerBadge, greetingUntil: 0, greetingVisible: false, phase: 1.4 },
    { id: 'guest-traveler', name: '보리', character: traveler, badge: travelerBadge, greetingUntil: 0, greetingVisible: false, phase: 3.1 },
  ];

  const targets = {
    heart: new THREE.Vector3(-4.68, 0, -3.12),
    story: new THREE.Vector3(0, 0, -3.12),
    travel: new THREE.Vector3(4.64, 0, -3.12),
    keeper: new THREE.Vector3(-2.68, 0, -.12),
    counter: new THREE.Vector3(-4.62, 0, 2.64),
    table: new THREE.Vector3(1.32, 0, .99),
    'guest-reader': new THREE.Vector3(-4.45, 0, -1.14),
    'guest-traveler': new THREE.Vector3(4.84, 0, 3.0),
  };
  const facingTargets = {
    heart: new THREE.Vector3(-4.7, 0, -4.4), story: new THREE.Vector3(0, 0, -4.4), travel: new THREE.Vector3(4.7, 0, -4.4),
    keeper: keeper.root.position, counter: new THREE.Vector3(-4.65, 0, 1.36), table: new THREE.Vector3(3.18, 0, .94),
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

  const nav = { minX: -6.9, maxX: 6.9, minZ: -4.9, maxZ: 4.67, step: .32, radius: .34 };
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
        targetAzimuth = THREE.MathUtils.clamp(pointerStart.azimuth - dx * .0034, -.28, .85);
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
    const viewHeight = Math.max(12.8, 19.3 / aspect);
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
      scene.background.set(evening ? '#d8d9ce' : '#e8ece0');
      scene.fog.color.copy(scene.background);
      hemi.color.set(evening ? '#ecd8bc' : '#fff5db');
      hemi.intensity = evening ? 1.38 : 2.1;
      sun.color.set(evening ? '#ffbf83' : '#fff0cb');
      sun.intensity = evening ? 1.8 : 3.4;
      sun.position.set(evening ? -9 : -5, evening ? 6 : 12, 8);
      fill.intensity = evening ? .65 : .9;
      warmLights.forEach(light => { light.intensity = evening ? 16 : 9; });
      lampGlow.emissiveIntensity = evening ? 1.1 : .7;
      sky.color.set(evening ? '#c4b6ac' : '#b6d9c4');
      renderer.toneMappingExposure = evening ? 1.04 : 1.05;
      renderer.shadowMap.needsUpdate = true;
    },
    rotateCamera() {
      targetAzimuth = targetAzimuth > .55 ? -.13 : targetAzimuth < .1 ? .43 : .76;
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
      const guestInfo = guests.map(guest => {
        const projected = new THREE.Vector3(0, 1.5, .38).applyMatrix4(guest.character.root.matrixWorld).project(camera);
        const target = targets[guest.id];
        return { id: guest.id, name: guest.name, kind: 'scripted-npc', animal: guest.character.root.userData.animal, shirt: guest.character.root.userData.shirt, position: guest.character.root.position.toArray(), approach: target.toArray(), approachClear: !blocked(target.x, target.z), screen: { x: (projected.x + 1) * host.clientWidth / 2, y: (1 - projected.y) * host.clientHeight / 2 } };
      });
      return { mode: 'real-3d', avatar: player.root.userData.animal, shirt: player.root.userData.shirt, player: player.root.position.toArray(), target: activeTarget, moving: currentPath.length > 0, pendingInteraction, lighting: dayMode, meshCount: renderer.info.render.calls, camera: { azimuth, elevation }, width: host.clientWidth, height: host.clientHeight, inView, reducedMotion, guests: guestInfo };
    },
  };
}
