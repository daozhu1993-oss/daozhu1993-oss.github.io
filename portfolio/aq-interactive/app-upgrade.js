/**
 * 未庄 · 增强与集成总控制器 (Weizhuang App Upgrade Orchestrator)
 * 将 Web Audio 声景、看客行为轮盘、阿Q精神胜利量表、宣纸海报生成器与游戏原生循环无缝结合。
 */

import { audioManager } from './audio.js';
import { SpectatorSystem } from './spectator.js';
import { AhQPsycheEngine } from './psyche.js';
import { ArchivePosterGenerator } from './poster.js';

export class WeizhuangOrchestrator {
  constructor() {
    this.audio = audioManager;
    this.spectator = new SpectatorSystem(this.audio);
    this.psyche = new AhQPsycheEngine(this.audio);
    this.poster = new ArchivePosterGenerator(this.spectator, this.audio);
    this.currentScene = 'shrine';
  }

  bootstrap() {
    console.log('未庄 · 可行走叙事世界 v1.30+ 增强套件启动');

    // 1. 初始化各子系统
    this.spectator.init();
    this.psyche.init();

    // 2. 绑定看客行为对阿Q与声景的连锁反应
    this.spectator.onAction((eventType, data) => {
      if (eventType === 'spectator-choice') {
        const { action, confrontation } = data;
        // 起哄或添油加醋，极大概率触发阿Q的精神胜利法反弹
        if (action === 'cheer' || action === 'provoke') {
          setTimeout(() => {
            this.psyche.triggerVictory('看客起哄', action === 'provoke' ? 3 : 0);
          }, 400);
        } else if (action === 'sneer') {
          setTimeout(() => {
            this.psyche.triggerVictory('看客冷笑', 1);
          }, 600);
        }
      }
    });

    // 3. 拦截与替换顶部 HUD 按钮
    this._bindHeaderButtons();

    // 4. 监听场景切换 (body data-scene 属性变动)
    this._observeSceneTransitions();

    // 5. 监听对话面板与现场交互
    this._observeDialogAndHotspots();

    // 6. 移动端触控手势优化
    this._setupTouchGestures();

    // 7. 用户首次交互时解锁 Web Audio
    const unlockAudio = () => {
      this.audio.ensureContext();
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
    window.addEventListener('click', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    window.addEventListener('touchstart', unlockAudio, { passive: true });
  }

  _bindHeaderButtons() {
    // 声音切换按钮
    const soundBtn = document.getElementById('sound-toggle');
    if (soundBtn) {
      soundBtn.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
        const enabled = this.audio.toggle();
        soundBtn.textContent = enabled ? '声音 开' : '声音 关';
        if (enabled) {
          soundBtn.classList.remove('is-muted');
        } else {
          soundBtn.classList.add('is-muted');
        }
      }, true);
    }

    // 分享/带走这一局 -> 宣纸海报生成器
    const shareBtn = document.getElementById('share-button');
    if (shareBtn) {
      shareBtn.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
        this.poster.showPosterModal();
      }, true);
    }

    // 重置按钮 -> 同步重置看客数据
    const resetBtn = document.getElementById('reset-world');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.spectator.stats.watchedCount = 0;
        this.spectator.stats.cheerCount = 0;
        this.spectator.stats.sneerCount = 0;
        this.spectator.stats.silenceCount = 0;
        this.spectator.stats.provokeCount = 0;
        this.spectator.updateHUD();
      });
    }
  }

  _observeSceneTransitions() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes' && m.attributeName === 'data-scene') {
          const newScene = document.body.getAttribute('data-scene') || 'shrine';
          if (newScene !== this.currentScene) {
            this.currentScene = newScene;
            this.audio.setScene(newScene);
            this.spectator.recordVisit(newScene);
            console.log(`[未庄] 踏足新现场: ${newScene}`);
          }
        }
      }
    });

    observer.observe(document.body, { attributes: true });
    // 初始化当前场景声景
    const initialScene = document.body.getAttribute('data-scene') || 'shrine';
    this.currentScene = initialScene;
    this.spectator.recordVisit(initialScene);
  }

  _observeDialogAndHotspots() {
    // 监听阿Q点击或走近交涉
    const aqActor = document.getElementById('paint-aq');
    if (aqActor) {
      aqActor.addEventListener('click', () => {
        // 唤出看客反应轮或触发阿Q对话
        this.spectator.showReactionWheel({
          title: '阿Q在看着你',
          description: '他刚在土谷祠坐下，眼珠子骨碌碌转，警惕地打量着你这个生面孔。',
          target: 'aq'
        });
      });
    }

    // 监听王胡点击
    const wanghuActor = document.getElementById('paint-wanghu');
    if (wanghuActor) {
      wanghuActor.addEventListener('click', () => {
        this.spectator.showReactionWheel({
          title: '王胡与阿Q斗虱',
          description: '王胡把破夹袄脱在膝盖上，捉出一个大虱子，放在嘴里毕毕剥剥地咬。阿Q气不过，也伸手去摸……',
          target: 'wanghu'
        });
      });
    }

    // 监听赵府门房
    const gatekeeperActor = document.getElementById('paint-gatekeeper');
    if (gatekeeperActor) {
      gatekeeperActor.addEventListener('click', () => {
        this.spectator.showReactionWheel({
          title: '赵府门房喝问',
          description: '门房斜眼打量着台阶下的人：“赵太爷的名号，也是你随便提的？回去照照镜子！”',
          target: 'gatekeeper'
        });
      });
    }

    // 监听对话发送记录
    const dialogForm = document.getElementById('dialog-form');
    if (dialogForm) {
      dialogForm.addEventListener('submit', () => {
        this.spectator.recordDialogue();
        this.audio.playBrushStroke();
      });
    }

    // 监听线索交互
    const interactionCard = document.getElementById('interaction-card');
    if (interactionCard) {
      const cardObserver = new MutationObserver(() => {
        if (!interactionCard.hidden) {
          this.audio.playBrushStroke();
        }
      });
      cardObserver.observe(interactionCard, { attributes: true, attributeFilter: ['hidden'] });
    }
  }

  _setupTouchGestures() {
    // 移动端双击或长按背景唤出看客立场轮
    const stage = document.getElementById('painted-stage');
    if (!stage) return;

    let touchStartTime = 0;
    stage.addEventListener('touchstart', () => {
      touchStartTime = Date.now();
    }, { passive: true });

    stage.addEventListener('touchend', () => {
      const duration = Date.now() - touchStartTime;
      // 长按超过 650ms 触发驻足凝视
      if (duration > 650) {
        this.spectator.showReactionWheel({
          title: '驻足凝视未庄',
          description: '你停下脚步，风吹过屋檐，街上的人从你身边漠然走过。',
          target: 'scene'
        });
      }
    }, { passive: true });
  }
}

// 自动实例化并在 DOM 就绪后启动
export const appOrchestrator = new WeizhuangOrchestrator();
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => appOrchestrator.bootstrap());
} else {
  appOrchestrator.bootstrap();
}
