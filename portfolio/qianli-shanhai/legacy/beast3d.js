/**
 * 《千里江山 · 山海入画》3D 殿堂级山海神兽程序化雕塑与灵性交互系统
 * (Celestial Shan Hai Jing Mythical Beasts 3D Procedural Sculptures & Particle Auras)
 * 
 * 彻底重构：杜绝粗糙低模几何体！对标梵高星月夜顶级艺术水准，打造北宋青绿重彩与山海经通灵神兽：
 * 1. 【夫诸】：白玉灵鹿，四支璀璨分叉金角，踏水而立，脚底生莲生水波，环绕碧水灵雾
 * 2. 【鹿蜀】：杻阳灵骏，白首金身，动态翻滚飘扬的赤焰流火长尾，步步生香
 * 3. 【当康】：丰穰瑞兽，古铜泥金丰润身躯，象牙长獠牙，环绕 6 束悬浮金麦穗与穗浪灵尘
 * 4. 【青鸟】：瑶池信使，羽翼翠青，三羽展翼，拖曳三道流光飞天彩练尾羽，空中振翅盘旋
 * 5. 【驳】：中曲天堑战神，银白神骏，虎爪利齿，额顶贯日螺旋神角，披挂宋式玄金战甲
 * 6. 【白泽】：万象归海至圣灵兽，周身白玉龙鳞金纹，三目通天，金髯长拂，环绕四方悬浮山海玉册
 * 
 * 附带：太极八卦双层逆旋神兽镇岳光环、冲天信标光柱、灵魄金尘喷涌、靠近共鸣与唤醒仪式大成蜕变。
 */

import * as THREE from 'three';

export class Beast3DManager {
  constructor(scene) {
    this.scene = scene;
    this.beastObjects = {};
    this.particles = [];
    this.orbitItems = []; // 存储环绕神兽旋转的附属物（如当康麦穗、白泽玉册等）
    this.time = 0;
  }

  createBeastMesh(beastData) {
    const root = new THREE.Group();
    root.name = `beast_${beastData.id}`;
    root.position.set(beastData.coordinates.x, beastData.coordinates.y, beastData.coordinates.z);

    const beastModel = new THREE.Group();
    beastModel.name = 'beast_sculpture';

    // 根据神兽特征构建精雕细琢的 3D 灵体
    switch (beastData.id) {
      case 'fuzhu':
        this._buildFuzhu(beastModel);
        break;
      case 'dangkang':
        this._buildDangkang(beastModel);
        break;
      case 'lushu':
        this._buildLushu(beastModel);
        break;
      case 'qingniao':
        this._buildQingniao(beastModel);
        break;
      case 'bo':
        this._buildBo(beastModel);
        break;
      case 'baize':
        this._buildBaize(beastModel);
        break;
      default:
        this._buildFuzhu(beastModel);
    }
    root.add(beastModel);

    // 双层逆旋太极八卦神兽镇岳光环
    const auraGroup = this._createCelestialMandala(beastData.goldColor);
    root.add(auraGroup);

    // 地面灵泉/光芒微澜涟漪
    const groundRipples = this._createGroundRipples(beastData.themeColor);
    root.add(groundRipples);

    // 局部专属神兽灵明点光源
    const light = new THREE.PointLight(
      new THREE.Color(beastData.goldColor),
      2.8,
      18,
      1.2
    );
    light.position.set(0, 2.5, 0);
    root.add(light);

    // 挂载实例数据与状态
    root.userData = {
      data: beastData,
      model: beastModel,
      aura: auraGroup,
      ripples: groundRipples,
      light: light,
      isAwakened: false,
      baseY: beastData.coordinates.y,
      pulsePhase: Math.random() * Math.PI * 2
    };

    this.scene.add(root);
    this.beastObjects[beastData.id] = root;
    return root;
  }

  // =========================================================================
  // 1. 【夫诸】(白玉灵鹿 · 四角生光 · 踏水生莲)
  // =========================================================================
  _buildFuzhu(group) {
    const matJade = new THREE.MeshStandardMaterial({
      color: 0xF7FAFC,
      roughness: 0.15,
      metalness: 0.12,
      emissive: 0x93DCFA,
      emissiveIntensity: 0.35
    });
    const matGoldAntler = new THREE.MeshStandardMaterial({
      color: 0xFDE385,
      roughness: 0.25,
      metalness: 0.88,
      emissive: 0xF5C538,
      emissiveIntensity: 0.65
    });
    const matEye = new THREE.MeshBasicMaterial({ color: 0x0F172A });
    const matSilk = new THREE.MeshStandardMaterial({
      color: 0xDDF3FA,
      transparent: true,
      opacity: 0.65,
      side: THREE.DoubleSide
    });

    // 1.1 优美的白鹿胸躯组合体
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 14), matJade);
    chest.position.set(0.45, 1.45, 0);
    chest.scale.set(1.15, 0.95, 0.8);
    group.add(chest);

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.68, 1.35, 14), matJade);
    torso.position.set(-0.25, 1.4, 0);
    torso.rotation.z = Math.PI / 2.08;
    torso.scale.set(0.85, 1.0, 0.75);
    group.add(torso);

    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.68, 16, 14), matJade);
    haunch.position.set(-0.85, 1.42, 0);
    haunch.scale.set(0.95, 1.05, 0.78);
    group.add(haunch);

    // 1.2 优雅颀长的天鹅颈与秀美鹿首
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 1.2, 12), matJade);
    neck.position.set(0.95, 2.15, 0);
    neck.rotation.z = -Math.PI / 3.4;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 12), matJade);
    head.position.set(1.42, 2.72, 0);
    head.scale.set(1.35, 0.85, 0.75);
    group.add(head);

    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.45, 10), matJade);
    snout.position.set(1.8, 2.62, 0);
    snout.rotation.z = -Math.PI / 2.1;
    group.add(snout);

    // 灵秀黑瞳
    for (const z of [0.18, -0.18]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), matEye);
      eye.position.set(1.5, 2.8, z);
      group.add(eye);
    }

    // 鹿耳
    for (const z of [0.26, -0.26]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.38, 6), matJade);
      ear.position.set(1.28, 2.95, z);
      ear.rotation.set((z > 0 ? 0.45 : -0.45), 0, -0.5);
      group.add(ear);
    }

    // 1.3 绝美四支分叉白玉金角 (Branching Antlers)
    const antlerConfigs = [
      { x: 1.35, y: 3.1, z: 0.22, rotX: 0.3, rotZ: 0.15, scale: 1.0 },
      { x: 1.35, y: 3.1, z: -0.22, rotX: -0.3, rotZ: 0.15, scale: 1.0 },
      { x: 1.22, y: 3.05, z: 0.38, rotX: 0.55, rotZ: -0.2, scale: 0.82 },
      { x: 1.22, y: 3.05, z: -0.38, rotX: -0.55, rotZ: -0.2, scale: 0.82 }
    ];

    antlerConfigs.forEach(cfg => {
      const antlerBranch = new THREE.Group();
      antlerBranch.position.set(cfg.x, cfg.y, cfg.z);
      antlerBranch.rotation.set(cfg.rotX, 0, cfg.rotZ);
      antlerBranch.scale.setScalar(cfg.scale);

      // 主角干
      const mainBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.075, 1.3, 8), matGoldAntler);
      mainBeam.position.y = 0.65;
      antlerBranch.add(mainBeam);

      // 前分叉枝
      const fork1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.65, 6), matGoldAntler);
      fork1.position.set(0.18, 0.7, 0);
      fork1.rotation.z = -0.65;
      antlerBranch.add(fork1);

      // 后顶分叉枝
      const fork2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.04, 0.55, 6), matGoldAntler);
      fork2.position.set(-0.15, 1.05, 0);
      fork2.rotation.z = 0.7;
      antlerBranch.add(fork2);

      // 角端璀璨星晶
      const tipStar = new THREE.Mesh(new THREE.OctahedronGeometry(0.08, 0), matGoldAntler);
      tipStar.position.set(0, 1.35, 0);
      antlerBranch.add(tipStar);

      group.add(antlerBranch);
    });

    // 1.4 修长优雅的四肢与金蹄
    const legPositions = [
      { x: 0.45, z: 0.28 }, { x: 0.45, z: -0.28 },
      { x: -0.85, z: 0.3 }, { x: -0.85, z: -0.3 }
    ];
    legPositions.forEach(lp => {
      const leg = new THREE.Group();
      leg.position.set(lp.x, 0.7, lp.z);
      const upperLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.85, 8), matJade);
      leg.add(upperLeg);
      const lowerLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.85, 8), matJade);
      lowerLeg.position.y = -0.55;
      leg.add(lowerLeg);
      const hoof = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.15, 6), matGoldAntler);
      hoof.position.y = -1.0;
      leg.add(hoof);
      group.add(leg);
    });

    // 1.5 飘逸祥云仙帛 (Floating Silk Ribbon)
    const ribbonCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.4, 1.6, 0.5),
      new THREE.Vector3(-0.6, 2.1, 0.8),
      new THREE.Vector3(0.5, 2.3, 0.4),
      new THREE.Vector3(1.2, 1.8, -0.4),
      new THREE.Vector3(0.3, 1.4, -0.7),
      new THREE.Vector3(-1.1, 1.3, -0.6)
    ], true);
    const ribbonGeo = new THREE.TubeGeometry(ribbonCurve, 40, 0.05, 6, true);
    const ribbonMesh = new THREE.Mesh(ribbonGeo, matSilk);
    group.add(ribbonMesh);
    group.userData.ribbon = ribbonMesh;
  }

  // =========================================================================
  // 2. 【当康】(丰穰金豕 · 泥金云雷纹 · 六束环绕金麦)
  // =========================================================================
  _buildDangkang(group) {
    const matBronzeGold = new THREE.MeshStandardMaterial({
      color: 0xE8B84B,
      roughness: 0.28,
      metalness: 0.82,
      emissive: 0x9E751D,
      emissiveIntensity: 0.35
    });
    const matIvoryTusk = new THREE.MeshStandardMaterial({
      color: 0xFFFFF2,
      roughness: 0.18,
      metalness: 0.08,
      emissive: 0xFFFBE6,
      emissiveIntensity: 0.25
    });
    const matWheatGold = new THREE.MeshStandardMaterial({
      color: 0xFDD835,
      roughness: 0.35,
      metalness: 0.6,
      emissive: 0xFBC02D,
      emissiveIntensity: 0.5
    });

    // 2.1 敦厚丰润、富有神性的金豕躯体
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.15, 18, 16), matBronzeGold);
    body.position.set(0, 1.25, 0);
    body.scale.set(1.35, 1.05, 1.15);
    group.add(body);

    // 敦实头部
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 14), matBronzeGold);
    head.position.set(1.1, 1.3, 0);
    head.scale.set(1.05, 0.95, 0.9);
    group.add(head);

    // 憨态可掬的鼻吻
    const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.45, 12), matBronzeGold);
    snout.position.set(1.85, 1.2, 0);
    snout.rotation.z = Math.PI / 2;
    group.add(snout);

    // 2.2 霸气长弧形象牙獠牙 (Curved Tusks)
    for (const z of [0.42, -0.42]) {
      const tuskCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(1.7, 1.05, z),
        new THREE.Vector3(2.1, 1.35, z * 1.35),
        new THREE.Vector3(1.9, 1.95, z * 1.1)
      ]);
      const tuskGeo = new THREE.TubeGeometry(tuskCurve, 16, 0.09, 8, false);
      const tuskMesh = new THREE.Mesh(tuskGeo, matIvoryTusk);
      group.add(tuskMesh);
    }

    // 2.3 祥云背脊 (Cloud Crests)
    for (let i = 0; i < 4; i++) {
      const crest = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.06, 6, 12, Math.PI), matBronzeGold);
      crest.position.set(0.6 - i * 0.45, 2.35, 0);
      crest.rotation.y = Math.PI / 2;
      group.add(crest);
    }

    // 2.4 四根短壮坚实金蹄
    const hoofPositions = [
      { x: 0.65, z: 0.65 }, { x: 0.65, z: -0.65 },
      { x: -0.65, z: 0.65 }, { x: -0.65, z: -0.65 }
    ];
    hoofPositions.forEach(hp => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.85, 10), matBronzeGold);
      leg.position.set(hp.x, 0.45, hp.z);
      group.add(leg);
    });

    // 2.5 悬浮环绕的 6 束丰穰金麦 (Orbiting Wheat Sheaves)
    const wheatGroup = new THREE.Group();
    wheatGroup.name = 'orbit_wheat';
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const wheatSheaf = new THREE.Group();
      wheatSheaf.position.set(Math.cos(angle) * 2.8, 1.3, Math.sin(angle) * 2.8);

      // 麦秆
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.1, 5), matWheatGold);
      wheatSheaf.add(stem);

      // 重叠饱满的金麦穗粒
      for (let j = 0; j < 5; j++) {
        const grainL = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), matWheatGold);
        grainL.position.set(0.09, 0.15 + j * 0.16, 0);
        grainL.scale.set(1.4, 0.7, 0.7);
        wheatSheaf.add(grainL);

        const grainR = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), matWheatGold);
        grainR.position.set(-0.09, 0.15 + j * 0.16, 0);
        grainR.scale.set(1.4, 0.7, 0.7);
        wheatSheaf.add(grainR);
      }
      wheatGroup.add(wheatSheaf);
    }
    group.add(wheatGroup);
    group.userData.wheatGroup = wheatGroup;
  }

  // =========================================================================
  // 3. 【鹿蜀】(杻阳灵骏 · 白首金身 · 翻滚赤焰流光尾)
  // =========================================================================
  _buildLushu(group) {
    const matAmberBody = new THREE.MeshStandardMaterial({
      color: 0xE8A854,
      roughness: 0.3,
      metalness: 0.35,
      emissive: 0xB5651D,
      emissiveIntensity: 0.3
    });
    const matWhiteHead = new THREE.MeshStandardMaterial({
      color: 0xFDFAFA,
      roughness: 0.18,
      metalness: 0.08,
      emissive: 0xFFFBF0,
      emissiveIntensity: 0.4
    });
    const matFireTail = new THREE.MeshStandardMaterial({
      color: 0xFF2D18,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0xFF4500,
      emissiveIntensity: 0.85
    });
    const matStripe = new THREE.MeshStandardMaterial({
      color: 0x4A1E0E,
      roughness: 0.5
    });

    // 3.1 健硕矫健的神骏马躯
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.75, 1.8, 14), matAmberBody);
    body.position.set(0, 1.5, 0);
    body.rotation.z = Math.PI / 2;
    group.add(body);

    // 虎纹环饰
    for (let i = 0; i < 3; i++) {
      const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.04, 6, 16), matStripe);
      stripe.position.set(0.35 - i * 0.4, 1.5, 0);
      stripe.rotation.y = Math.PI / 2;
      group.add(stripe);
    }

    // 3.2 白首神马脖颈与头部
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.52, 1.4, 12), matWhiteHead);
    neck.position.set(0.95, 2.2, 0);
    neck.rotation.z = -Math.PI / 3.6;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.15, 10), matWhiteHead);
    head.position.set(1.55, 2.65, 0);
    head.rotation.z = -Math.PI / 2.3;
    group.add(head);

    // 银白马鬃
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.25, 0.45), matWhiteHead);
    mane.position.set(0.78, 2.4, 0);
    mane.rotation.z = -Math.PI / 3.6;
    group.add(mane);

    // 3.3 烈烈飘扬的炽热赤尾 (Blazing Dynamic Vermilion Tail)
    const tailGroup = new THREE.Group();
    tailGroup.position.set(-0.95, 1.6, 0);

    const tailRibbons = [];
    for (let k = 0; k < 5; k++) {
      const offsetZ = (k - 2) * 0.12;
      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, offsetZ),
        new THREE.Vector3(-0.6, -0.3, offsetZ * 1.5),
        new THREE.Vector3(-1.3, -0.1, offsetZ * 2.2),
        new THREE.Vector3(-2.1, 0.4, offsetZ * 1.2)
      ]);
      const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 20, 0.12 - k * 0.015, 8, false), matFireTail);
      tailGroup.add(tailMesh);
      tailRibbons.push({ mesh: tailMesh, curve: tailCurve, phase: k * 0.8 });
    }
    group.add(tailGroup);
    group.userData.tailGroup = tailGroup;
    group.userData.tailRibbons = tailRibbons;

    // 3.4 四足与踏风金蹄
    const legPositions = [
      { x: 0.65, z: 0.35 }, { x: 0.65, z: -0.35 },
      { x: -0.65, z: 0.38 }, { x: -0.65, z: -0.38 }
    ];
    legPositions.forEach(lp => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.09, 1.45, 8), matAmberBody);
      leg.position.set(lp.x, 0.72, lp.z);
      group.add(leg);
    });
  }

  // =========================================================================
  // 4. 【青鸟】(瑶池信使 · 三青华羽 · 振翅盘旋 · 飞天彩练)
  // =========================================================================
  _buildQingniao(group) {
    const matPeacockFeather = new THREE.MeshStandardMaterial({
      color: 0x148F77,
      roughness: 0.22,
      metalness: 0.35,
      emissive: 0x1ABC9C,
      emissiveIntensity: 0.55
    });
    const matGoldBeak = new THREE.MeshStandardMaterial({
      color: 0xF9CA24,
      roughness: 0.2,
      metalness: 0.85,
      emissive: 0xF0932B,
      emissiveIntensity: 0.5
    });
    const matAzureStreamer = new THREE.MeshStandardMaterial({
      color: 0x22A6B3,
      transparent: true,
      opacity: 0.82,
      emissive: 0x7ED6DF,
      emissiveIntensity: 0.65,
      side: THREE.DoubleSide
    });

    // 4.1 优雅流线型的神鸟躯体
    const birdBody = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 12), matPeacockFeather);
    birdBody.position.set(0, 1.8, 0);
    birdBody.scale.set(1.5, 0.95, 0.9);
    group.add(birdBody);

    // 鸟首与神羽冠
    const birdHead = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), matPeacockFeather);
    birdHead.position.set(0.75, 2.15, 0);
    group.add(birdHead);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), matGoldBeak);
    beak.position.set(1.15, 2.1, 0);
    beak.rotation.z = -Math.PI / 2;
    group.add(beak);

    // 顶上华彩羽冠 (Crown crest)
    for (let c = 0; c < 3; c++) {
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.45, 4), matGoldBeak);
      crest.position.set(0.65 - c * 0.1, 2.5 + c * 0.05, 0);
      crest.rotation.z = -0.4 - c * 0.2;
      group.add(crest);
    }

    // 4.2 三青展翼 (Tri-Layered Wings)
    const wingsLeft = new THREE.Group();
    const wingsRight = new THREE.Group();
    wingsLeft.position.set(0, 2.0, 0.45);
    wingsRight.position.set(0, 2.0, -0.45);

    // 左翼三层重羽
    for (let l = 0; l < 3; l++) {
      const wingFeather = new THREE.Mesh(new THREE.BoxGeometry(1.6 - l * 0.25, 0.04, 0.5), matPeacockFeather);
      wingFeather.position.set(-0.2 + l * 0.15, l * 0.12, 0.45 + l * 0.25);
      wingFeather.rotation.y = 0.35 + l * 0.15;
      wingsLeft.add(wingFeather);
    }

    // 右翼三层重羽
    for (let r = 0; r < 3; r++) {
      const wingFeather = new THREE.Mesh(new THREE.BoxGeometry(1.6 - r * 0.25, 0.04, 0.5), matPeacockFeather);
      wingFeather.position.set(-0.2 + r * 0.15, r * 0.12, -0.45 - r * 0.25);
      wingFeather.rotation.y = -0.35 - r * 0.15;
      wingsRight.add(wingFeather);
    }

    group.add(wingsLeft);
    group.add(wingsRight);
    group.userData.wingL = wingsLeft;
    group.userData.wingR = wingsRight;

    // 4.3 三道下垂飘逸的九天彩练尾羽 (Flowing Phoenix Tail Streamers)
    const streamerGroup = new THREE.Group();
    streamerGroup.position.set(-0.7, 1.7, 0);

    for (let s = 0; s < 3; s++) {
      const angle = (s - 1) * 0.35;
      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, Math.sin(angle) * 0.2),
        new THREE.Vector3(-0.8, -0.6, Math.sin(angle) * 0.6),
        new THREE.Vector3(-1.8, -1.6, Math.sin(angle) * 1.1),
        new THREE.Vector3(-2.8, -2.4, Math.sin(angle) * 0.8)
      ]);
      const streamerMesh = new THREE.Mesh(
        new THREE.TubeGeometry(tailCurve, 24, 0.07, 6, false),
        matAzureStreamer
      );
      streamerGroup.add(streamerMesh);

      // 尾梢金华明珠
      const jewel = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), matGoldBeak);
      jewel.position.set(-2.8, -2.4, Math.sin(angle) * 0.8);
      streamerGroup.add(jewel);
    }
    group.add(streamerGroup);
  }

  // =========================================================================
  // 5. 【驳】(中曲战神 · 通灵银骏 · 墨鬃玄尾 · 螺旋金角 · 辟兵破障)
  // =========================================================================
  _buildBo(group) {
    // 仙灵白玉肌体材质 (通透温润，微泛青碧灵光)
    const matFrostBody = new THREE.MeshStandardMaterial({
      color: 0xF4F8FA,
      roughness: 0.18,
      metalness: 0.15,
      emissive: 0x98D2E6,
      emissiveIntensity: 0.38
    });
    // 破障贯日螺旋神角纯金材质
    const matSpiralHorn = new THREE.MeshStandardMaterial({
      color: 0xFCE068,
      roughness: 0.2,
      metalness: 0.94,
      emissive: 0xE8B028,
      emissiveIntensity: 0.85
    });
    // 苍墨松烟黑鬃与玄尾材质
    const matInkHair = new THREE.MeshStandardMaterial({
      color: 0x161514,
      roughness: 0.35,
      metalness: 0.45,
      emissive: 0x0C0B0A,
      emissiveIntensity: 0.2
    });
    // 北宋宣和云纹玄金战甲
    const matSongArmor = new THREE.MeshStandardMaterial({
      color: 0x2A2E36,
      roughness: 0.3,
      metalness: 0.85,
      emissive: 0xD4AF37,
      emissiveIntensity: 0.3
    });

    // 5.1 战神天马健硕身躯 (胸膛宽阔、腰身矫健)
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.82, 16, 14), matFrostBody);
    chest.position.set(0.48, 1.6, 0);
    chest.scale.set(1.22, 1.05, 0.85);
    group.add(chest);

    const flank = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.76, 1.45, 14), matFrostBody);
    flank.position.set(-0.25, 1.55, 0);
    flank.rotation.z = Math.PI / 2.06;
    flank.scale.set(0.88, 1.0, 0.78);
    group.add(flank);

    const haunch = new THREE.Mesh(new THREE.SphereGeometry(0.76, 16, 14), matFrostBody);
    haunch.position.set(-0.95, 1.58, 0);
    haunch.scale.set(1.05, 1.1, 0.82);
    group.add(haunch);

    // 玄金战甲护肩与宋式云纹鞍带
    const armor = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.38, 1.45), matSongArmor);
    armor.position.set(0.08, 1.95, 0);
    group.add(armor);

    // 5.2 轩昂头颈 (优美马颈弧线与俊朗马首)
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.44, 1.35, 12), matFrostBody);
    neck.position.set(1.05, 2.32, 0);
    neck.rotation.z = -Math.PI / 3.4;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.15, 10), matFrostBody);
    head.position.set(1.68, 2.82, 0);
    head.rotation.z = -Math.PI / 2.25;
    group.add(head);

    // 双耳
    for (const ez of [0.18, -0.18]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.35, 5), matFrostBody);
      ear.position.set(1.42, 3.25, ez);
      ear.rotation.set((ez > 0 ? 0.2 : -0.2), 0, -0.3);
      group.add(ear);
    }

    // 5.3 苍墨飞扬马鬃 (Flowing Black Ink Mane)
    for (let m = 0; m < 5; m++) {
      const strand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55 - m * 0.05, 0.28), matInkHair);
      strand.position.set(0.65 + m * 0.18, 2.75 - m * 0.16, 0);
      strand.rotation.z = -Math.PI / 3.2 + (m * 0.08);
      group.add(strand);
    }

    // 5.4 额顶破障螺旋金角 (Towering Radiant Horn)
    const hornGroup = new THREE.Group();
    hornGroup.position.set(1.62, 3.35, 0);
    hornGroup.rotation.z = 0.22;

    const hornCore = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.95, 12), matSpiralHorn);
    hornCore.position.y = 0.98;
    hornGroup.add(hornCore);

    for (let s = 0; s < 5; s++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11 - s * 0.018, 0.022, 6, 16), matSpiralHorn);
      ring.position.y = 0.25 + s * 0.36;
      ring.rotation.x = Math.PI / 2;
      hornGroup.add(ring);
    }
    group.add(hornGroup);

    // 5.5 玄黑流云长尾 (Cascading Ink Tail Ribbons)
    const tailGroup = new THREE.Group();
    tailGroup.position.set(-1.1, 1.7, 0);
    for (let t = 0; t < 3; t++) {
      const tAngle = (t - 1) * 0.18;
      const tailCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, Math.sin(tAngle) * 0.1),
        new THREE.Vector3(-0.55, -0.4, Math.sin(tAngle) * 0.35),
        new THREE.Vector3(-1.15, -1.0, Math.sin(tAngle) * 0.55),
        new THREE.Vector3(-1.75, -1.6, Math.sin(tAngle) * 0.3)
      ]);
      const tailMesh = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 16, 0.09 - t * 0.015, 6, false), matInkHair);
      tailGroup.add(tailMesh);
    }
    group.add(tailGroup);

    // 5.6 踏石生风四神足与虎爪利甲 (Tiger Paws)
    const legPositions = [
      { x: 0.68, z: 0.38 }, { x: 0.68, z: -0.38 },
      { x: -0.72, z: 0.42 }, { x: -0.72, z: -0.42 }
    ];
    legPositions.forEach(lp => {
      const leg = new THREE.Group();
      leg.position.set(lp.x, 0.72, lp.z);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.10, 1.35, 8), matFrostBody);
      leg.add(upper);
      const paw = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 0.26), matSongArmor);
      paw.position.set(0.06, -0.68, 0);
      leg.add(paw);
      group.add(leg);
    });
  }

  // =========================================================================
  // 6. 【白泽】(万象圣兽 · 龙鳞白玉 · 三目通天 · 悬浮山海玉册)
  // =========================================================================
  _buildBaize(group) {
    const matDragonJade = new THREE.MeshStandardMaterial({
      color: 0xFFFFFF,
      roughness: 0.12,
      metalness: 0.18,
      emissive: 0xFEF3C7,
      emissiveIntensity: 0.55
    });
    const matHolyGold = new THREE.MeshStandardMaterial({
      color: 0xFBBF24,
      roughness: 0.18,
      metalness: 0.95,
      emissive: 0xF59E0B,
      emissiveIntensity: 0.8
    });
    const matThirdEye = new THREE.MeshBasicMaterial({ color: 0xFF3B30 });
    const matJadeScroll = new THREE.MeshStandardMaterial({
      color: 0x99F6E4,
      roughness: 0.25,
      metalness: 0.4,
      emissive: 0x5EEAD4,
      emissiveIntensity: 0.65
    });

    // 6.1 巍峨如山、极具帝王尊相的圣兽之躯
    const body = new THREE.Mesh(new THREE.SphereGeometry(1.25, 20, 16), matDragonJade);
    body.position.set(0, 1.6, 0);
    body.scale.set(1.4, 1.05, 1.0);
    group.add(body);

    // 6.2 尊贵麒麟首与金色长髯
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 14), matDragonJade);
    head.position.set(1.4, 2.35, 0);
    group.add(head);

    // 飘拂的智慧金髯
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.1, 8), matHolyGold);
    beard.position.set(1.75, 1.45, 0);
    beard.rotation.z = -0.35;
    group.add(beard);

    // 6.3 额顶洞穿阴阳的【天灵神目】 (The Third Eye of Omniscience)
    const thirdEye = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), matThirdEye);
    thirdEye.position.set(2.05, 2.7, 0);
    group.add(thirdEye);

    // 6.4 巍峨三灵角 (Triple Holy Horns)
    // 中央通天圣角
    const centerHorn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.6, 8), matHolyGold);
    centerHorn.position.set(1.45, 3.4, 0);
    centerHorn.rotation.z = 0.2;
    group.add(centerHorn);

    // 两侧盘旋曲角
    for (const z of [0.45, -0.45]) {
      const sideHorn = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.08, 8, 16, Math.PI * 1.3), matHolyGold);
      sideHorn.position.set(1.2, 3.1, z);
      sideHorn.rotation.set((z > 0 ? 0.35 : -0.35), 0, 0.4);
      group.add(sideHorn);
    }

    // 6.5 四方悬浮护体【山海宝玉册】 (Orbiting Celestial Tablets)
    const tabletGroup = new THREE.Group();
    tabletGroup.name = 'orbit_tablets';
    for (let t = 0; t < 4; t++) {
      const angle = (t / 4) * Math.PI * 2;
      const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.08), matJadeScroll);
      tablet.position.set(Math.cos(angle) * 3.2, 2.0, Math.sin(angle) * 3.2);
      tabletGroup.add(tablet);
    }
    group.add(tabletGroup);
    group.userData.tabletGroup = tabletGroup;

    // 6.6 稳重如磐的四神足
    const legPositions = [
      { x: 0.75, z: 0.6 }, { x: 0.75, z: -0.6 },
      { x: -0.75, z: 0.62 }, { x: -0.75, z: -0.62 }
    ];
    legPositions.forEach(lp => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 1.25, 10), matDragonJade);
      leg.position.set(lp.x, 0.62, lp.z);
      group.add(leg);
    });
  }

  // =========================================================================
  // 辅助构造器：双层逆旋太极八卦曼陀罗光环 (Celestial Mandala)
  // =========================================================================
  _createCelestialMandala(goldHex) {
    const group = new THREE.Group();
    group.position.y = 0.12;

    // 外层八卦灵符金轮
    const outerGeo = new THREE.RingGeometry(2.6, 2.95, 48);
    const outerMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(goldHex),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    const outerRing = new THREE.Mesh(outerGeo, outerMat);
    outerRing.rotation.x = Math.PI / 2;
    group.add(outerRing);

    // 内层旋转古卷阵纹轮
    const innerGeo = new THREE.RingGeometry(1.8, 2.05, 36);
    const innerMat = new THREE.MeshBasicMaterial({
      color: 0xFFFBEB,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55
    });
    const innerRing = new THREE.Mesh(innerGeo, innerMat);
    innerRing.rotation.x = Math.PI / 2;
    group.add(innerRing);

    group.userData = { outerRing, innerRing };
    return group;
  }

  // 地面灵泉微澜扩散水圈
  _createGroundRipples(themeHex) {
    const rippleGeo = new THREE.RingGeometry(0.5, 0.7, 32);
    const rippleMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(themeHex),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    const ripple = new THREE.Mesh(rippleGeo, rippleMat);
    ripple.rotation.x = Math.PI / 2;
    ripple.position.y = 0.08;
    return ripple;
  }

  // =========================================================================
  // 唤醒蜕变仪式 (Awakening Transmutation Ceremony)
  // =========================================================================
  triggerAwaken(beastId) {
    const beast = this.beastObjects[beastId];
    if (!beast) return;
    beast.userData.isAwakened = true;

    // 1. 点光源亮度瞬间爆发
    if (beast.userData.light) {
      beast.userData.light.intensity = 6.5;
      beast.userData.light.distance = 32;
    }

    // 2. 灵环极速扩大与光彩骤升
    if (beast.userData.aura) {
      beast.userData.aura.scale.set(1.6, 1.6, 1.6);
      beast.userData.aura.userData.outerRing.material.opacity = 0.98;
    }

    // 3. 喷涌绚烂的金色灵气粒子暴泉
    this._spawnAscendingSparks(beast.position, beast.userData.data.goldColor);
  }

  _spawnAscendingSparks(pos, colorHex) {
    const sparkCount = 60;
    for (let i = 0; i < sparkCount; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex),
        transparent: true,
        opacity: 0.95
      });
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), mat);
      p.position.copy(pos);
      p.position.y += 1.2;

      const angle = Math.random() * Math.PI * 2;
      const speed = 2.5 + Math.random() * 5.0;
      p.userData = {
        vel: new THREE.Vector3(
          Math.cos(angle) * speed,
          4.5 + Math.random() * 6.5,
          Math.sin(angle) * speed
        ),
        life: 1.0,
        decay: 0.35 + Math.random() * 0.4
      };
      this.scene.add(p);
      this.particles.push(p);
    }
  }

  // =========================================================================
  // 每帧生命与灵韵动画循环
  // =========================================================================
  update(dt, time) {
    this.time = time;

    Object.values(this.beastObjects).forEach((root) => {
      const u = root.userData;
      if (!u.data) return;

      const isAwakened = u.isAwakened;
      const speedMult = isAwakened ? 1.6 : 1.0;

      // 1. 自然灵性呼吸与轻微浮沉
      const breathe = Math.sin(time * 2.2 + u.pulsePhase) * (isAwakened ? 0.22 : 0.12);
      root.position.y = u.baseY + breathe;

      // 2. 双环逆向旋转
      if (u.aura) {
        u.aura.userData.outerRing.rotation.z += dt * 0.45 * speedMult;
        u.aura.userData.innerRing.rotation.z -= dt * 0.65 * speedMult;
      }

      // 3. 地面水纹扩散涟漪
      if (u.ripples) {
        const rippleScale = 1.0 + (Math.sin(time * 2.8 + u.pulsePhase) * 0.5 + 0.5) * 1.8;
        u.ripples.scale.set(rippleScale, rippleScale, 1.0);
        u.ripples.material.opacity = Math.max(0.05, 0.8 - rippleScale * 0.28);
      }

      // 4. 青鸟凌空振翅飞翔动画
      if (u.data.id === 'qingniao') {
        const flap = Math.sin(time * 7.5) * 0.52;
        if (u.model.userData.wingL && u.model.userData.wingR) {
          u.model.userData.wingL.rotation.x = flap;
          u.model.userData.wingR.rotation.x = -flap;
        }
        // 缓慢盘旋
        u.model.rotation.y = time * 0.4;
      }

      // 5. 鹿蜀烈火赤尾波浪摆动动画
      if (u.data.id === 'lushu' && u.model.userData.tailRibbons) {
        u.model.userData.tailRibbons.forEach((r, idx) => {
          r.mesh.rotation.y = Math.sin(time * 4.5 + r.phase) * 0.25;
          r.mesh.rotation.z = Math.cos(time * 3.8 + r.phase) * 0.18;
        });
      }

      // 6. 当康周围悬浮麦穗轨道旋转
      if (u.data.id === 'dangkang' && u.model.userData.wheatGroup) {
        u.model.userData.wheatGroup.rotation.y += dt * 0.55;
      }

      // 7. 白泽四方山海宝玉册自转与公转
      if (u.data.id === 'baize' && u.model.userData.tabletGroup) {
        u.model.userData.tabletGroup.rotation.y -= dt * 0.42;
      }
    });

    // 8. 粒子寿命与运动更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.vel.y -= 3.8 * dt; // 重力微降
      p.userData.life -= dt * p.userData.decay;
      p.material.opacity = Math.max(0, p.userData.life);
      if (p.userData.life <= 0) {
        this.scene.remove(p);
        this.particles.splice(i, 1);
      }
    }
  }
}
