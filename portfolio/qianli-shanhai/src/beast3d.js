/**
 * 《千里江山 · 山海入画》3D 纯代码 Procedural 山海神兽生成与交互动画
 * 包含：夫诸(白鹿四角)、当康(金豕麦穗)、鹿蜀(赤尾虎纹)、青鸟(三青羽)、驳(独角玄兽)、白泽(万物圣兽)
 */

import * as THREE from 'three';

export class Beast3DManager {
  constructor(scene) {
    this.scene = scene;
    this.beastObjects = {};
    this.particles = [];
  }

  createBeastMesh(beastData) {
    const group = new THREE.Group();
    group.name = `beast_${beastData.id}`;
    group.position.set(beastData.coordinates.x, beastData.coordinates.y, beastData.coordinates.z);

    switch (beastData.id) {
      case 'fuzhu':
        this._buildFuzhu(group);
        break;
      case 'dangkang':
        this._buildDangkang(group);
        break;
      case 'lushu':
        this._buildLushu(group);
        break;
      case 'qingniao':
        this._buildQingniao(group);
        break;
      case 'bo':
        this._buildBo(group);
        break;
      case 'baize':
        this._buildBaize(group);
        break;
      default:
        this._buildDefaultBeast(group, beastData);
    }

    // 围绕神兽的旋转泥金八卦灵气符光
    const runeRing = this._createRuneAura(beastData.goldColor);
    group.add(runeRing);
    group.userData.runeRing = runeRing;
    group.userData.data = beastData;
    group.userData.isAwakened = false;

    this.scene.add(group);
    this.beastObjects[beastData.id] = group;
    return group;
  }

  // 1. 【夫诸】(白鹿四角，踏水而立)
  _buildFuzhu(group) {
    const matBody = new THREE.MeshStandardMaterial({
      color: 0xF2F5F8,
      roughness: 0.2,
      metalness: 0.1,
      emissive: 0x98D2EB,
      emissiveIntensity: 0.2
    });
    const matGold = new THREE.MeshStandardMaterial({
      color: 0xF3C93E,
      roughness: 0.3,
      metalness: 0.8,
      emissive: 0xF3C93E,
      emissiveIntensity: 0.4
    });

    // 鹿身
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.2, 8), matBody);
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.3;
    group.add(body);

    // 颈部与头部
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.2, 6), matBody);
    neck.position.set(0.8, 2.0, 0);
    neck.rotation.z = -Math.PI / 4;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 6), matBody);
    head.position.set(1.3, 2.4, 0);
    head.rotation.z = -Math.PI / 2.3;
    group.add(head);

    // 四支修长优雅的白鹿金角
    for (let i = 0; i < 4; i++) {
      const angle = (i - 1.5) * 0.35;
      const antler = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.08, 1.4, 5), matGold);
      antler.position.set(1.2 + Math.cos(angle) * 0.2, 2.8 + Math.sin(angle) * 0.4, (i % 2 === 0 ? 0.3 : -0.3));
      antler.rotation.x = (i % 2 === 0 ? 0.4 : -0.4);
      antler.rotation.z = -0.3 + angle;
      group.add(antler);
    }

    // 四蹄
    for (let i = 0; i < 4; i++) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 1.5, 6), matBody);
      const lx = (i < 2 ? 0.6 : -0.6);
      const lz = (i % 2 === 0 ? 0.35 : -0.35);
      leg.position.set(lx, 0.75, lz);
      group.add(leg);
    }
  }

  // 2. 【当康】(金豕长牙，丰穰之兽)
  _buildDangkang(group) {
    const matBody = new THREE.MeshStandardMaterial({
      color: 0xDFA743,
      roughness: 0.4,
      emissive: 0xDFA743,
      emissiveIntensity: 0.25
    });
    const matTusk = new THREE.MeshStandardMaterial({ color: 0xFFFFF0, roughness: 0.2 });

    const body = new THREE.Mesh(new THREE.SphereGeometry(1.0, 10, 8), matBody);
    body.scale.set(1.3, 0.9, 0.9);
    body.position.y = 1.0;
    group.add(body);

    // 头部与突出的大獠牙
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 8), matBody);
    head.position.set(1.0, 1.0, 0);
    group.add(head);

    const tuskL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), matTusk);
    tuskL.position.set(1.4, 0.9, 0.4);
    tuskL.rotation.x = Math.PI / 4;
    tuskL.rotation.z = -Math.PI / 6;
    group.add(tuskL);

    const tuskR = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 5), matTusk);
    tuskR.position.set(1.4, 0.9, -0.4);
    tuskR.rotation.x = -Math.PI / 4;
    tuskR.rotation.z = -Math.PI / 6;
    group.add(tuskR);
  }

  // 3. 【鹿蜀】(白首虎纹赤尾)
  _buildLushu(group) {
    const matBody = new THREE.MeshStandardMaterial({
      color: 0xE2C59D,
      roughness: 0.3,
      emissive: 0xC49A45,
      emissiveIntensity: 0.2
    });
    const matHead = new THREE.MeshStandardMaterial({ color: 0xFDFEFE, roughness: 0.2 });
    const matTail = new THREE.MeshStandardMaterial({
      color: 0xD94A38,
      emissive: 0xE85642,
      emissiveIntensity: 0.5
    });

    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 2.2, 8), matBody);
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.4;
    group.add(body);

    const head = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 6), matHead);
    head.position.set(1.2, 2.3, 0);
    head.rotation.z = -Math.PI / 2.5;
    group.add(head);

    // 如火赤尾
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.6, 6), matTail);
    tail.position.set(-1.4, 1.6, 0);
    tail.rotation.z = Math.PI / 3;
    group.add(tail);
  }

  // 4. 【青鸟】(羽翼翠青，凌云翱翔)
  _buildQingniao(group) {
    const matFeather = new THREE.MeshStandardMaterial({
      color: 0x228B78,
      emissive: 0x36C9AE,
      emissiveIntensity: 0.4,
      roughness: 0.2
    });
    const matGold = new THREE.MeshStandardMaterial({ color: 0xF3C93E, metalness: 0.8 });

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.4, 6), matFeather);
    body.rotation.z = Math.PI / 2.2;
    body.position.y = 1.8;
    group.add(body);

    // 展开的双翼
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.6), matFeather);
    wingL.position.set(0, 1.9, 0.9);
    wingL.rotation.y = 0.3;
    group.add(wingL);
    group.userData.wingL = wingL;

    const wingR = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.6), matFeather);
    wingR.position.set(0, 1.9, -0.9);
    wingR.rotation.y = -0.3;
    group.add(wingR);
    group.userData.wingR = wingR;

    // 金喙与三翎尾羽
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 4), matGold);
    beak.position.set(0.9, 1.8, 0);
    beak.rotation.z = -Math.PI / 2;
    group.add(beak);
  }

  // 5. 【驳】(独角玄兽，如豹踞石)
  _buildBo(group) {
    const matBody = new THREE.MeshStandardMaterial({
      color: 0x36454F,
      roughness: 0.3,
      emissive: 0x1E2B37,
      emissiveIntensity: 0.3
    });
    const matHorn = new THREE.MeshStandardMaterial({
      color: 0xF1D369,
      metalness: 0.9,
      emissive: 0xF1D369,
      emissiveIntensity: 0.5
    });

    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.2), matBody);
    body.position.y = 1.3;
    group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.8), matBody);
    head.position.set(1.2, 1.8, 0);
    group.add(head);

    // 额顶锋锐长角
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1.3, 6), matHorn);
    horn.position.set(1.5, 2.6, 0);
    horn.rotation.z = -Math.PI / 4;
    group.add(horn);
  }

  // 6. 【白泽】(万象圣灵，金角双翼)
  _buildBaize(group) {
    const matBody = new THREE.MeshStandardMaterial({
      color: 0xFFFAFA,
      roughness: 0.15,
      emissive: 0xFCF8E3,
      emissiveIntensity: 0.45
    });
    const matGold = new THREE.MeshStandardMaterial({
      color: 0xF3C93E,
      metalness: 0.9,
      roughness: 0.2,
      emissive: 0xF3C93E,
      emissiveIntensity: 0.6
    });

    // 巍峨身躯
    const body = new THREE.Mesh(new THREE.ConeGeometry(1.1, 3.0, 10), matBody);
    body.rotation.z = Math.PI / 2;
    body.position.y = 1.8;
    group.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), matBody);
    head.position.set(1.6, 2.7, 0);
    group.add(head);

    // 尊贵盘旋金角
    for (let i = 0; i < 2; i++) {
      const horn = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.1, 8, 16, Math.PI * 1.2), matGold);
      horn.position.set(1.5, 3.4, (i === 0 ? 0.55 : -0.55));
      horn.rotation.y = (i === 0 ? 0.4 : -0.4);
      group.add(horn);
    }
  }

  _buildDefaultBeast(group, beastData) {
    const mat = new THREE.MeshStandardMaterial({ color: beastData.themeColor });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), mat);
    mesh.position.y = 1.2;
    group.add(mesh);
  }

  // 神兽周围旋转光环
  _createRuneAura(goldHex) {
    const ringGeo = new THREE.RingGeometry(2.4, 2.7, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(goldHex),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = Math.PI / 2;
    ringMesh.position.y = 0.15;
    return ringMesh;
  }

  // 唤醒动画触发
  triggerAwaken(beastId) {
    const beast = this.beastObjects[beastId];
    if (!beast) return;
    beast.userData.isAwakened = true;

    // 触发剧烈的金光粒子喷涌
    this._spawnAwakenParticles(beast.position);

    // 放大光环
    if (beast.userData.runeRing) {
      beast.userData.runeRing.material.opacity = 0.95;
      beast.userData.runeRing.scale.set(1.4, 1.4, 1.4);
    }
  }

  _spawnAwakenParticles(pos) {
    const count = 40;
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xFFEB8A,
        transparent: true,
        opacity: 0.9
      });
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), mat);
      p.position.copy(pos);
      p.position.y += 1.0;
      const angle = Math.random() * Math.PI * 2;
      const speed = 2.0 + Math.random() * 4.0;
      p.userData = {
        vel: new THREE.Vector3(Math.cos(angle) * speed, 3.5 + Math.random() * 4.0, Math.sin(angle) * speed),
        life: 1.0
      };
      this.scene.add(p);
      this.particles.push(p);
    }
  }

  update(dt, time) {
    // 浮动呼吸动画
    Object.values(this.beastObjects).forEach((beast) => {
      const data = beast.userData.data;
      if (!data) return;

      // 悠缓呼吸浮沉
      const breathe = Math.sin(time * 2.2 + beast.position.x) * 0.12;
      beast.position.y = data.coordinates.y + breathe;

      // 旋转灵气符阵
      if (beast.userData.runeRing) {
        beast.userData.runeRing.rotation.z += dt * (beast.userData.isAwakened ? 1.5 : 0.6);
      }

      // 青鸟扇动翅膀
      if (data.id === 'qingniao' && beast.userData.wingL && beast.userData.wingR) {
        const flap = Math.sin(time * 6.5) * 0.45;
        beast.userData.wingL.rotation.x = flap;
        beast.userData.wingR.rotation.x = -flap;
      }
    });

    // 更新粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.position.addScaledVector(p.userData.vel, dt);
      p.userData.vel.y -= 5.0 * dt; // 重力
      p.userData.life -= dt * 0.7;
      p.material.opacity = p.userData.life;
      if (p.userData.life <= 0) {
        this.scene.remove(p);
        this.particles.splice(i, 1);
      }
    }
  }
}
