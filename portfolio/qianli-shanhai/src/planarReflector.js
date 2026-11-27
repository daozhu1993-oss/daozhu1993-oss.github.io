/**
 * 《千里江山 · 借笔还魂》真平面水面倒影引擎 (Song River Planar Reflector)
 * 零外部 addons 依赖，原生 Three.js r160 实现 1/2 分辨率实时平面镜像渲染，
 * 将青绿群峰、千步虹桥、水心高阁与夜间渔火真实倒映在江面之上，
 * 配合 water-ssr-shader.js 的 5-Tap 高斯墨韵采样，达成《入画 · WITHIN》同级柔墨倒影。
 */

import * as THREE from 'three';

export class SongRiverReflector {
  constructor(waterY = 1.05, resolution = 512) {
    this.waterY = waterY;
    this.resolution = resolution;
    this.enabled = true;
    this._frameCounter = 0;

    this.renderTarget = new THREE.WebGLRenderTarget(resolution, resolution, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false
    });

    this.virtualCamera = new THREE.PerspectiveCamera();
    this.textureMatrix = new THREE.Matrix4();

    this._mirrorPos = new THREE.Vector3();
    this._mirrorLook = new THREE.Vector3();
    this._camDir = new THREE.Vector3();
    this._camUp = new THREE.Vector3();
    this._biasMatrix = new THREE.Matrix4().set(
      0.5, 0.0, 0.0, 0.5,
      0.0, 0.5, 0.0, 0.5,
      0.0, 0.0, 0.5, 0.5,
      0.0, 0.0, 0.0, 1.0
    );
  }

  get texture() {
    return this.renderTarget.texture;
  }

  /**
   * 在主场景渲染之前捕获平面镜像倒影
   */
  render(renderer, scene, camera, waterMesh) {
    if (!this.enabled || !waterMesh) return;

    // 当相机位于水面之下时跳过反射渲染
    if (camera.position.y < this.waterY + 0.05) return;

    // 1. 计算关于水平面 y = this.waterY 对称的镜像虚拟相机
    this._mirrorPos.copy(camera.position);
    this._mirrorPos.y = 2.0 * this.waterY - camera.position.y;

    camera.getWorldDirection(this._camDir);
    this._camDir.y = -this._camDir.y;

    this._mirrorLook.copy(this._mirrorPos).add(this._camDir);

    // 翻转 up 向量 Y 分量以保持正确的镜像滚转与水平方向
    this._camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this._camUp.y = -this._camUp.y;
    // 水平镜像时使用标准正向 up(0,1,0) 即可让水平方向与主视角一致、垂直上下翻转
    this.virtualCamera.position.copy(this._mirrorPos);
    this.virtualCamera.up.set(0, 1, 0);
    this.virtualCamera.lookAt(this._mirrorLook);
    this.virtualCamera.fov = camera.fov;
    this.virtualCamera.aspect = camera.aspect;
    this.virtualCamera.near = camera.near;
    this.virtualCamera.far = camera.far;
    this.virtualCamera.updateMatrixWorld();
    this.virtualCamera.updateProjectionMatrix();

    // 2. 构建世界坐标 -> 镜像纹理投影矩阵
    this.textureMatrix.copy(this._biasMatrix);
    this.textureMatrix.multiply(this.virtualCamera.projectionMatrix);
    this.textureMatrix.multiply(this.virtualCamera.matrixWorldInverse);

    // 3. 隐藏水面网格，渲染镜像世界到 RenderTarget
    const prevVisible = waterMesh.visible;
    const prevTarget = renderer.getRenderTarget();
    const prevShadowAuto = renderer.shadowMap ? renderer.shadowMap.autoUpdate : false;

    waterMesh.visible = false;
    if (renderer.shadowMap) renderer.shadowMap.autoUpdate = false;

    renderer.setRenderTarget(this.renderTarget);
    renderer.clear();
    renderer.render(scene, this.virtualCamera);

    if (renderer.shadowMap) renderer.shadowMap.autoUpdate = prevShadowAuto;
    renderer.setRenderTarget(prevTarget);
    waterMesh.visible = prevVisible;
  }

  dispose() {
    if (this.renderTarget) this.renderTarget.dispose();
  }
}
