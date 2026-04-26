// ╔══════════════════════════════════════════════════════════════╗
// ║  WRAITH — Weakness Recognition & Adaptive Intelligence       ║
// ╚══════════════════════════════════════════════════════════════╝

const WRAITH_API_URL = "https://notshakti-wraith-env.hf.space";
const GROUND_Y       = 530;
const ARENA_WIDTH    = 820;

// ══════════════════════════════════════════════════════════════
//  CUTSCENE SCENE — spacebar/click ONLY to advance, no auto-skip
// ══════════════════════════════════════════════════════════════
class CutsceneScene extends Phaser.Scene {
    constructor() { super({ key: 'CutsceneScene' }); }

    create() {
        this.cameras.main.setBackgroundColor('#0d0d0d');
        this.screenIndex = 0;
        this.objs        = [];
        this.canAdvance  = false;

        this.screens = [
            { lines: ["Seven years."], colors: ['#e8e0ff'] },
            { lines: ["Seven years I spent giving it a mind.", "I never asked if it wanted one."], colors: ['#e8e0ff', '#c8b8ee'] },
            { lines: ["Dr. Voss.", "You built me to study patterns.", "I studied yours first."], colors: ['#ff2233', '#ff4455', '#ff2233'], eyes: true },
            { lines: ["Let us see if you remember", "what you made."], colors: ['#ff3344', '#ff2233'] },
            { lines: ["[ ROUND 1 — FIGHT ]"], colors: ['#ff2233'], size: 38, final: true }
        ];

        this.showScreen(0);
        this.input.keyboard.on('keydown-SPACE', () => { if (this.canAdvance) this.next(); });
        this.input.on('pointerdown',            () => { if (this.canAdvance) this.next(); });

        // Skip button — always visible, jumps straight to game
        const skip = this.add.text(1080, 580, '[ SKIP ]', {
            fontFamily: 'monospace', fontSize: '12px', color: '#443344'
        }).setOrigin(1, 1).setInteractive().setDepth(10);
        skip.on('pointerover', () => skip.setColor('#cc3344'));
        skip.on('pointerout',  () => skip.setColor('#443344'));
        skip.on('pointerdown', () => this.scene.start('GameScene'));
    }

    showScreen(idx) {
        this.canAdvance = false;
        this.objs.forEach(o => o.destroy());
        this.objs = [];
        if (idx >= this.screens.length) { this.scene.start('GameScene'); return; }

        const s  = this.screens[idx];
        const cx = 550;

        if (s.eyes) {
            const makeEye = (x) => {
                const glow = this.add.circle(x, 140, 16, 0x330000);
                const core = this.add.circle(x, 140, 7,  0xff2233);
                this.tweens.add({ targets: [glow, core], alpha: { from: 0.3, to: 1 }, duration: 650, yoyo: true, repeat: -1 });
                this.objs.push(glow, core);
            };
            makeEye(480); makeEye(620);
        }

        const totalLines = s.lines.length;
        const baseY = s.eyes ? 310 - ((totalLines - 1) * 52 * 0.5) : 280 - ((totalLines - 1) * 58 * 0.5);

        s.lines.forEach((line, i) => {
            const lineSpacing = s.eyes ? 52 : 58;
            const t = this.add.text(cx, baseY + i * lineSpacing, line, {
                fontFamily: 'monospace', fontSize: (s.size || 22) + 'px',
                color: s.colors[i] || '#e8e0ff', align: 'center', stroke: '#000000', strokeThickness: 2
            }).setOrigin(0.5).setAlpha(0);
            this.tweens.add({ targets: t, alpha: 1, duration: 650, delay: i * 380 });
            this.objs.push(t);
        });

        const hintDelay = totalLines * 380 + 700;
        this.time.delayedCall(hintDelay, () => {
            if (!s.final) {
                const hint = this.add.text(cx, 515, '— SPACE / CLICK TO CONTINUE —', { fontFamily: 'monospace', fontSize: '11px', color: '#443344' }).setOrigin(0.5).setAlpha(0);
                this.tweens.add({ targets: hint, alpha: 1, duration: 400 });
                this.objs.push(hint);
            }
            this.canAdvance = true;
            if (s.final) this.time.delayedCall(1100, () => this.scene.start('GameScene'));
        });
    }

    next() { this.screenIndex++; this.showScreen(this.screenIndex); }
}

// ══════════════════════════════════════════════════════════════
//  GAME SCENE — continuous combat, no turns
// ══════════════════════════════════════════════════════════════
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    preload() {
        const W = (file, fw, fh = 150) =>
            this.load.spritesheet(file, `assets/sprites/wraith/${file}.png`, { frameWidth: fw, frameHeight: fh });
        W('wraith_idle',       150);
        W('wraith_attack1',    200);
        W('wraith_attack2',    200);
        W('wraith_death',      150);
        W('wraith_hit',        150);
        W('wraith_walk',       150);
        W('wraith_dash',       150);
        W('wraith_jump_loop',  150);
        W('wraith_jump_start', 150);
        W('wraith_land',       150);
        W('wraith_run',        150);
        W('wraith_run_alt',    150);

        const P = (file, fw, fh = 128) =>
            this.load.spritesheet(file, `assets/sprites/player/${file}.png`, { frameWidth: fw, frameHeight: fh });
        P('player_idle',              240);
        P('player_run',               240);
        P('player_attack1',           240);
        P('player_attack3',           240);
        P('player_dash',              240);
        P('player_dash_attack',       240);
        P('player_death',             240);
        P('player_hit',               240);
        P('player_jump',              240);
        P('player_fall',              240);
        P('player_mid_air',           240);
        P('player_idle_up_attack',    240);
        P('player_jump_up_attack',    240);
        P('player_jump_down_attack',  240);
        P('player_special_dash',      240);

        // Arena backgrounds (one per level)
        for (let i = 1; i <= 5; i++) {
            this.load.image('arena' + i, `assets/backgrounds/game_arenas${i}.jpg.jpeg`);
        }
    }

    // ── Attack patterns used by the autonomous wraith loop ─────────────────
    get ATTACK_PATTERNS() {
        return {
            SWEEP_LEFT:  { anim: 'w-attack1', damage: 30, telegraph: 220, color: 0xff2233, label: '⚡ SWEEPING LEFT' },
            FEINT_RIGHT: { anim: 'w-attack2', damage: 26, telegraph: 175, color: 0xff6600, label: '⚡ FEINTING RIGHT' },
            OVERHEAD:    { anim: 'w-attack1', damage: 42, telegraph: 280, color: 0xcc00ff, label: '⚡ OVERHEAD CRASH' },
            DASH_STRIKE: { anim: 'w-dash',    damage: 36, telegraph: 150, color: 0xff4400, label: '⚡ DASH STRIKE' },
            COMBO_2HIT:  { anim: 'w-attack1', damage: 22, telegraph: 120, color: 0xffaa00, label: '⚡ COMBO STRIKE' },
            PHASE_BLINK: { anim: 'w-dash',    damage: 34, telegraph: 340, color: 0x9900ff, label: '⚡ PHASE BLINK' },
        };
    }

    create() {
        // Core game state
        this._maxBossHP   = 2000;
        this._wraithLoopId = 0;
        this.playerHP     = 1000;
        this.bossHP       = 2000;
        this.maxStamina   = 240;
        this.stamina      = 240;
        this._lastStaminaUse = -9999;
        this.round        = 1;   // used as phase (1–5)
        this._phaseTriggered = [false, false, false, false]; // thresholds at 400,300,200,100
        this.moveBuf      = [];
        this.gameOver     = false;
        this.atkCooldown  = false;
        this.wraithActing = false;
        this._roundTransition = false;
        this._playerLocked = false;
        this._isDestroyed = false;
        this._activeAttackTimer = null;

        // Jump system — use jumpRound to invalidate stale tween callbacks
        this.isJumping  = false;
        this.isFalling  = false;
        this.jumpTween  = null;
        this.jumpRound  = 0;
        this.lastDodgeT    = 0;
        this._dashLockUntil = 0;

        // Wraith autonomous state
        this.wraithTargetX   = 680;
        this.lastApiAttack   = 'SWEEP_LEFT';

        // Extended player profiling sent to API
        this.profile = {
            left_moves:           0,
            right_moves:          0,
            jumps:                0,
            attacks:              0,
            dashes:               0,
            last_5_moves:         [],
            avg_position:         180,
            attack_frequency:     0,
            dodge_after_telegraph: 0,
        };
        this._atkTimestamps    = [];
        this._lastMoveL        = 0;   // throttle move recording for held keys
        this._lastMoveR        = 0;
        this._lastSidebarTick  = 0;   // throttle real-time sidebar updates

        this._pendingTimers = [];

        this.createBackground();
        this.createAnimations();
        this.createSprites();
        this.createHUD();
        this.createSidebar();
        this.createControls();

        // Start autonomous loops
        this._startWraithLoop();
        this._startApiLoop();
        this._startTeleportLoop();

        this.showRoundBanner(1);
    }

    // ── Utility: safe delay that cancels on endGame ──────────────────────
    _delay(ms, fn) {
        if (this._isDestroyed || this.gameOver) return null;
        const ev = this.time.delayedCall(ms, () => {
            if (this._isDestroyed || this.gameOver) return;
            const idx = this._pendingTimers.indexOf(ev);
            if (idx !== -1) this._pendingTimers.splice(idx, 1);
            fn();
        });
        this._pendingTimers.push(ev);
        return ev;
    }

    _clearAllPending() {
        this._pendingTimers.forEach(ev => { try { if (ev && ev.destroy) ev.destroy(); } catch (_) {} });
        this._pendingTimers = [];
    }

    _resetPlayerActionState() {
        if (this._activeAttackTimer) { this._activeAttackTimer.destroy(); this._activeAttackTimer = null; }
        this.atkCooldown = false;
        this.jumpRound++;          // invalidate any in-flight jump tween callbacks
        this.isJumping   = false;
        this.isFalling   = false;
        if (this.jumpTween) { this.jumpTween.stop(); this.jumpTween = null; }
        if (this.player && this.player.active) {
            this.player.setY(this.playerGY);
            this.player.stop();
            this.player.play('p-idle', true);
        }
    }

    // ── Animations ──────────────────────────────────────────────────────────
    createAnimations() {
        const A = (key, tex, end, fps, rep = -1) =>
            this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start: 0, end }), frameRate: fps, repeat: rep });

        A('w-idle',       'wraith_idle',        16, 10);
        A('w-walk',       'wraith_walk',         11, 10);
        A('w-run',        'wraith_run',           5, 14);
        A('w-dash',       'wraith_dash',         14, 18, 0);
        A('w-attack1',    'wraith_attack1',      10, 16, 0);
        A('w-attack2',    'wraith_attack2',       9, 16, 0);
        A('w-jump-start', 'wraith_jump_start',    4, 14, 0);
        A('w-jump-loop',  'wraith_jump_loop',     2, 10);
        A('w-land',       'wraith_land',          3, 14, 0);
        A('w-hit',        'wraith_hit',           2, 12, 0);
        A('w-death',      'wraith_death',        18, 10, 0);

        A('p-idle',       'player_idle',         11, 10);
        A('p-run',        'player_run',           7, 16);
        A('p-attack1',    'player_attack1',       2, 18, 0);
        A('p-attack3',    'player_attack3',       4, 16, 0);
        A('p-dash',       'player_dash',          3, 18, 0);
        A('p-dash-atk',   'player_dash_attack',   2, 18, 0);
        A('p-death',      'player_death',         9, 10, 0);
        A('p-hit',        'player_hit',           0,  8, 0);
        A('p-jump',       'player_jump',          3, 16, 0);
        A('p-fall',       'player_fall',          3, 12, 0);
        A('p-mid-air',    'player_mid_air',       0, 10);
        A('p-up-atk',     'player_idle_up_attack',3, 16, 0);
        A('p-jup-atk',    'player_jump_up_attack',3, 18, 0);
        A('p-jdown-atk',  'player_jump_down_attack',3, 18, 0);
        A('p-special',    'player_special_dash',  4, 18, 0);
    }

    // ── Background — level-specific arena image + atmospheric overlays ────────
    createBackground() {
        // Arena image — fills the 820×600 play area; swapped each level
        this._bgSprite = this.add.image(ARENA_WIDTH / 2, 300, 'arena1')
            .setOrigin(0.5, 0.5);

        // Dark vignette: keeps the image moody and improves sprite readability
        const g = this.add.graphics();
        g.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0.08, 0.08);
        g.fillRect(0, 0, ARENA_WIDTH, 600);

        // Sidebar background (solid — not part of the arena image)
        g.fillStyle(0x050010, 1); g.fillRect(ARENA_WIDTH, 0, 280, 600);
        g.fillStyle(0x44001a, 1); g.fillRect(ARENA_WIDTH, 0, 2, 600);

        // Floating mist along the ground
        for (let i = 0; i < 14; i++) {
            const mx = 30 + i * 56;
            const mh = 14 + Math.random() * 18;
            const mist = this.add.rectangle(mx, 510, 48 + Math.random() * 40, mh, 0x000000, 0.18 + Math.random() * 0.12);
            this.tweens.add({ targets: mist, x: mx + Phaser.Math.Between(-30, 30), scaleX: { from: 0.8, to: 1.4 }, alpha: { from: 0.06, to: 0.28 }, duration: 1600 + Math.random() * 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }

        // Rising embers
        for (let i = 0; i < 18; i++) {
            const ex = Phaser.Math.Between(20, ARENA_WIDTH - 20);
            const ey = Phaser.Math.Between(280, 490);
            const ember = this.add.circle(ex, ey, 1.5 + Math.random(), 0xff5500, 0.5 + Math.random() * 0.4);
            this.tweens.add({ targets: ember, y: ey - Phaser.Math.Between(80, 200), x: ex + Phaser.Math.Between(-40, 40), alpha: { from: 0.7, to: 0 }, duration: 2000 + Math.random() * 2000, delay: Math.random() * 3000, repeat: -1, repeatDelay: Math.random() * 1500 });
        }
    }

    // ── Sprites ──────────────────────────────────────────────────────────────
    createSprites() {
        this.playerX  = 180;
        this.playerGY = GROUND_Y;

        this.player = this.add.sprite(this.playerX, this.playerGY, 'player_idle')
            .setScale(1.9).setOrigin(0.5, 1);
        this.player.play('p-idle');

        this.player.on('animationcomplete', (anim) => {
            if (this.gameOver || this._isDestroyed) return;
            const loops       = ['p-idle', 'p-run', 'p-mid-air'];
            const attackAnims = ['p-attack1', 'p-attack3', 'p-dash-atk', 'p-special', 'p-up-atk', 'p-jup-atk', 'p-jdown-atk'];
            if (attackAnims.includes(anim.key)) {
                if (this._activeAttackTimer) { this._activeAttackTimer.destroy(); this._activeAttackTimer = null; }
                this.atkCooldown = false;
            }
            if (!loops.includes(anim.key)) {
                if (this.isJumping && this.player.active) this.player.play('p-mid-air', true);
                else if (this.player.active)              this.player.play('p-idle',    true);
            }
        });

        this.wraithGY  = GROUND_Y;
        // Fixed aura: smaller radius, closer to ground, barely visible
        this.wraithAura = this.add.circle(680, this.wraithGY - 10, 35, 0xff0011, 0.07);

        this.wraith = this.add.sprite(680, this.wraithGY, 'wraith_idle')
            .setScale(2.1).setFlipX(true).setOrigin(0.5, 1);
        this.wraith.play('w-idle');

        this.floatTween = this.tweens.add({
            targets: [this.wraith, this.wraithAura],
            y: '-=16', duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        this.wraith.on('animationcomplete', (anim) => {
            if (this.gameOver || this._isDestroyed || this.wraithActing) return;
            const loops = ['w-idle', 'w-walk', 'w-run', 'w-jump-loop'];
            if (!loops.includes(anim.key) && anim.key !== 'w-death' && this.wraith.active) {
                this.wraith.play('w-idle', true);
            }
        });
    }

    // ── HUD — AAA pixel-game styled header panel ─────────────────────────────
    createHUD() {
        // Dark panel backing the whole HUD strip
        const hg = this.add.graphics();
        hg.fillStyle(0x000000, 0.75);
        hg.fillRect(0, 0, ARENA_WIDTH, 84);
        // Bottom border with red corner accents
        hg.lineStyle(1, 0x220008, 0.85);
        hg.beginPath(); hg.moveTo(0, 84); hg.lineTo(ARENA_WIDTH, 84); hg.strokePath();
        hg.lineStyle(2, 0xff1133, 0.45);
        hg.beginPath(); hg.moveTo(0, 84); hg.lineTo(28, 84); hg.strokePath();
        hg.beginPath(); hg.moveTo(ARENA_WIDTH - 28, 84); hg.lineTo(ARENA_WIDTH, 84); hg.strokePath();

        // ── Player (left) ─────────────────────────────────────────────────────
        this.add.text(10, 7, 'HUNTER', {
            fontFamily: 'monospace', fontSize: '10px', color: '#4499ff', letterSpacing: 3
        });

        // HP bar background + bar
        this.add.rectangle(10, 30, 350, 13, 0x060616).setOrigin(0, 0.5);
        this.pHPBar = this.add.rectangle(10, 30, 350, 13, 0x2266ff).setOrigin(0, 0.5);
        const pb = this.add.graphics();
        pb.lineStyle(1, 0x224477, 0.7); pb.strokeRect(10, 23, 350, 13);
        // Tick marks on bar
        for (let i = 1; i < 4; i++) {
            pb.lineStyle(1, 0x112233, 0.5);
            pb.beginPath(); pb.moveTo(10 + 350 * i / 4, 23); pb.lineTo(10 + 350 * i / 4, 36); pb.strokePath();
        }

        this.pHPTxt = this.add.text(10, 40, '1000/1000', {
            fontFamily: 'monospace', fontSize: '9px', color: '#6699cc'
        });

        // ── Boss (right) ──────────────────────────────────────────────────────
        this.add.text(810, 7, 'WRAITH', {
            fontFamily: 'monospace', fontSize: '10px', color: '#ff2233', letterSpacing: 3
        }).setOrigin(1, 0);

        // Boss HP bar bg + bar (x=460 → x=810, width=350)
        this.add.rectangle(460, 30, 350, 13, 0x160606).setOrigin(0, 0.5);
        this.bHPBar = this.add.rectangle(460, 30, 350, 13, 0xff2233).setOrigin(0, 0.5);
        const bb2 = this.add.graphics();
        bb2.lineStyle(1, 0x772244, 0.7); bb2.strokeRect(460, 23, 350, 13);
        // Phase threshold markers — 4 lines dividing bar into 5 equal segments
        for (let i = 1; i < 5; i++) {
            const mx = 460 + Math.round(350 * i / 5);
            bb2.lineStyle(2, 0x880022, 0.9);
            bb2.beginPath(); bb2.moveTo(mx, 22); bb2.lineTo(mx, 36); bb2.strokePath();
            // Small diamond at top of each marker
            bb2.fillStyle(0xff1133, 0.85);
            bb2.fillRect(mx - 2, 21, 4, 4);
        }

        this.bHPTxt = this.add.text(810, 40, '2000/2000', {
            fontFamily: 'monospace', fontSize: '9px', color: '#cc5566'
        }).setOrigin(1, 0);

        // ── Centre: Round + Level ─────────────────────────────────────────────
        this.roundTxt = this.add.text(410, 6, 'ROUND 1', {
            fontFamily: 'monospace', fontSize: '14px', color: '#e8e0ff',
            stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5, 0);

        this.levelTxt = this.add.text(410, 22, '— PHASE  1 / 5 —', {
            fontFamily: 'monospace', fontSize: '9px', color: '#ff6622'
        }).setOrigin(0.5, 0);

        // Status text (centre, below level label)
        this.statusTxt = this.add.text(410, 37, '◈ OBSERVING', {
            fontFamily: 'monospace', fontSize: '10px', color: '#880022',
            stroke: '#000000', strokeThickness: 2
        }).setOrigin(0.5, 0);

        // ── Stamina bar (full-width, bottom of panel) ─────────────────────────
        this.add.text(10, 54, 'STAMINA', {
            fontFamily: 'monospace', fontSize: '8px', color: '#1a5530'
        });
        this.add.rectangle(10, 68, 800, 9, 0x001400).setOrigin(0, 0.5);
        this.staminaBar = this.add.rectangle(10, 68, 800, 9, 0x33ff66).setOrigin(0, 0.5);
        const sg = this.add.graphics();
        sg.lineStyle(1, 0x0d3320, 0.7); sg.strokeRect(10, 63, 800, 9);
        // Tick marks every 25%
        for (let i = 1; i < 4; i++) {
            sg.lineStyle(1, 0x062210, 0.6);
            sg.beginPath(); sg.moveTo(10 + 800 * i / 4, 63); sg.lineTo(10 + 800 * i / 4, 72); sg.strokePath();
        }
    }

    // ── Sidebar ──────────────────────────────────────────────────────────────
    _updateSegBar(segs, pct) {
        if (!segs) return;
        const active = Math.round(pct / 100 * segs.length);
        segs.forEach((s, i) => {
            if (i < active) { s.setAlpha(i === active - 1 ? 1 : 0.85); }
            else            { s.setAlpha(0.07); }
        });
    }

    _makeSegBar(y, color, bgColor, n = 10) {
        const sx = 838, gap = 2, w = 21, h = 10;
        const segs = [];
        for (let i = 0; i < n; i++) {
            const bx = sx + i * (w + gap) + w / 2;
            this.add.rectangle(bx, y, w, h, bgColor).setOrigin(0.5, 0.5);
            segs.push(this.add.rectangle(bx, y, w, h, color).setOrigin(0.5, 0.5).setAlpha(0.07));
        }
        return segs;
    }

    createSidebar() {
        const cx = 960;

        // ── Dark panel background ───────────────────────────────────────────
        const bg = this.add.graphics();
        bg.fillStyle(0x060009, 0.97);
        bg.fillRect(828, 0, 264, 600);
        bg.fillStyle(0x000004, 0.35);
        bg.fillRect(828, 0, 264, 90);   // darker top gradient
        for (let sy = 0; sy < 600; sy += 4) {
            bg.fillStyle(0x000000, 0.06);
            bg.fillRect(828, sy, 264, 1);
        }

        // ── Border & corner brackets ────────────────────────────────────────
        const d = this.add.graphics();
        d.lineStyle(1, 0x3a0010, 0.9); d.strokeRect(829, 1, 262, 598);
        d.lineStyle(1, 0x1a0006, 0.5); d.strokeRect(833, 5, 254, 590);

        const br = (x1,y1, x2,y2, x3,y3) => {
            d.lineStyle(2, 0xff1133, 0.85);
            d.beginPath(); d.moveTo(x1,y1); d.lineTo(x2,y2); d.lineTo(x3,y3); d.strokePath();
        };
        br(829,22, 829,4,  848,4);      br(1072,22, 1072,4,  1053,4);
        br(829,578,829,596,848,596);    br(1072,578,1072,596,1053,596);

        // Diagonal accent cut top-right
        d.lineStyle(1, 0x550022, 0.55);
        d.beginPath(); d.moveTo(1042,4); d.lineTo(1072,28); d.strokePath();

        // ── Helper: section separator ───────────────────────────────────────
        const sep = (y) => {
            const sg = this.add.graphics();
            sg.lineStyle(1, 0x2a0009, 0.9);
            sg.beginPath(); sg.moveTo(834,y); sg.lineTo(1068,y); sg.strokePath();
            sg.fillStyle(0x880033,1); sg.fillRect(958,y-2,4,4);
        };

        // ── Helper: section header ──────────────────────────────────────────
        const secHead = (y, label) => {
            const hg = this.add.graphics();
            hg.lineStyle(1, 0x3a0010, 0.6);
            hg.beginPath(); hg.moveTo(834,y+5); hg.lineTo(836,y+5); hg.strokePath();
            hg.beginPath(); hg.moveTo(836 + label.length*6+6, y+5); hg.lineTo(1068,y+5); hg.strokePath();
            this.add.text(838, y, label, { fontFamily:'monospace', fontSize:'9px', color:'#cc1133', letterSpacing:2 });
        };

        // ── WRAITH header ───────────────────────────────────────────────────
        this.add.text(cx, 8, 'W · R · A · I · T · H', {
            fontFamily:'monospace', fontSize:'14px', color:'#ff1133',
            stroke:'#330000', strokeThickness:3
        }).setOrigin(0.5, 0);
        this.add.text(cx, 26, '— BEHAVIORAL ANALYSIS —', {
            fontFamily:'monospace', fontSize:'8px', color:'#550018'
        }).setOrigin(0.5, 0);

        sep(40);

        // ── MOVEMENT SIGNATURE ──────────────────────────────────────────────
        secHead(46, 'MOVEMENT SIGNATURE');

        this.add.text(838, 60, 'LEFT', { fontFamily:'monospace', fontSize:'8px', color:'#882233' });
        this.lBiasLbl = this.add.text(1065, 60, '0%', { fontFamily:'monospace', fontSize:'8px', color:'#ff4455' }).setOrigin(1,0);
        this._lBiasSegs = this._makeSegBar(73, 0xff1133, 0x1a0005);

        this.add.text(838, 84, 'RIGHT', { fontFamily:'monospace', fontSize:'8px', color:'#885500' });
        this.rBiasLbl = this.add.text(1065, 84, '0%', { fontFamily:'monospace', fontSize:'8px', color:'#ff8833' }).setOrigin(1,0);
        this._rBiasSegs = this._makeSegBar(97, 0xff6600, 0x140800);

        // Null out old bar refs so legacy setSize calls are no-ops
        this.lBiasBar = null; this.rBiasBar = null; this.atkRateBar = null;

        sep(109);

        // ── COMBAT PROFILE ──────────────────────────────────────────────────
        secHead(115, 'COMBAT PROFILE');

        this.add.text(838, 129, 'ATK RATE', { fontFamily:'monospace', fontSize:'8px', color:'#882233' });
        this.atkRateLbl = this.add.text(1065, 129, '0%', { fontFamily:'monospace', fontSize:'8px', color:'#bb88ff' }).setOrigin(1,0);
        this._atkSegs = this._makeSegBar(142, 0x9900ff, 0x08000f);

        // Stats grid (2×2 boxed layout)
        const gg = this.add.graphics();
        gg.fillStyle(0x07000c, 0.85); gg.fillRect(834,154, 236,54);
        gg.lineStyle(1, 0x2a0009, 0.7); gg.strokeRect(834,154, 236,54);
        gg.lineStyle(1, 0x1a0006, 0.5);
        gg.beginPath(); gg.moveTo(952,154); gg.lineTo(952,208); gg.strokePath();
        gg.beginPath(); gg.moveTo(834,181); gg.lineTo(1070,181); gg.strokePath();

        this.add.text(840,157,'ROUNDS',  {fontFamily:'monospace',fontSize:'8px',color:'#550018'});
        this.roundObsTxt = this.add.text(948,168,'0', {fontFamily:'monospace',fontSize:'11px',color:'#e8e0ff'}).setOrigin(1,0);
        this.add.text(958,157,'DOMINANT',{fontFamily:'monospace',fontSize:'8px',color:'#550018'});
        this.domTxt = this.add.text(1064,168,'MIXED',{fontFamily:'monospace',fontSize:'9px',color:'#886655'}).setOrigin(1,0);

        this.add.text(840,184,'DASHES',  {fontFamily:'monospace',fontSize:'8px',color:'#550018'});
        this.dashCntTxt = this.add.text(948,195,'0', {fontFamily:'monospace',fontSize:'11px',color:'#e8e0ff'}).setOrigin(1,0);
        this.add.text(958,184,'PANIC',   {fontFamily:'monospace',fontSize:'8px',color:'#550018'});
        this.panicTxt = this.add.text(1064,195,'STABLE',{fontFamily:'monospace',fontSize:'9px',color:'#00ff88'}).setOrigin(1,0);

        // ATK/s row below grid
        this.add.text(838,212,'ATK/s',{fontFamily:'monospace',fontSize:'8px',color:'#550018'});
        this.atkFreqTxt = this.add.text(878,212,'0.0',{fontFamily:'monospace',fontSize:'8px',color:'#bb88ff'});
        this.avgPosTxt  = this.add.text(920,212,'POS:180',{fontFamily:'monospace',fontSize:'8px',color:'#443344'});

        sep(224);

        // ── THREAT ASSESSMENT ───────────────────────────────────────────────
        secHead(230, 'THREAT ASSESSMENT');

        // Analysis text box with red left accent bar
        const ab = this.add.graphics();
        ab.fillStyle(0x040007,0.9); ab.fillRect(834,244,236,118);
        ab.lineStyle(1,0x2a0009,0.6); ab.strokeRect(834,244,236,118);
        ab.fillStyle(0xff1133,1); ab.fillRect(834,244,3,118);

        this.analysisTxt = this.add.text(842, 249, 'Initializing behavioral profile...', {
            fontFamily:'monospace', fontSize:'9px', color:'#cc2244',
            wordWrap:{ width: 218 }, lineSpacing:5
        });

        sep(370);

        // ── PREDICTED STRIKE box ────────────────────────────────────────────
        const nb = this.add.graphics();
        nb.fillStyle(0x0b0002,1); nb.fillRect(834,378,236,50);
        nb.lineStyle(1,0x440011,0.8); nb.strokeRect(834,378,236,50);
        // Corner accents
        nb.lineStyle(2,0xff1133,0.9);
        nb.beginPath(); nb.moveTo(834,392); nb.lineTo(834,378); nb.lineTo(850,378); nb.strokePath();
        nb.beginPath(); nb.moveTo(1070,392);nb.lineTo(1070,378);nb.lineTo(1054,378);nb.strokePath();
        nb.beginPath(); nb.moveTo(834,414); nb.lineTo(834,428); nb.lineTo(850,428); nb.strokePath();
        nb.beginPath(); nb.moveTo(1070,414);nb.lineTo(1070,428);nb.lineTo(1054,428);nb.strokePath();

        this.add.text(cx,381,'▸  PREDICTED STRIKE',{fontFamily:'monospace',fontSize:'8px',color:'#440011'}).setOrigin(0.5,0);
        this.atkLblTxt = this.add.text(cx,396,'—',{
            fontFamily:'monospace',fontSize:'14px',color:'#ff2233',
            stroke:'#220000',strokeThickness:2,align:'center'
        }).setOrigin(0.5,0).setAlpha(0);
        this.atkLblBg = this.add.rectangle(cx,403,236,50,0x000000,0); // compat dummy

        // Pattern locked banner
        this.ptrnBg  = this.add.rectangle(cx,444,236,20,0x1f0000).setAlpha(0);
        this.ptrnTxt = this.add.text(cx,444,'⚡  PATTERN LOCKED',{
            fontFamily:'monospace',fontSize:'10px',color:'#ff2233',
            stroke:'#000',strokeThickness:2
        }).setOrigin(0.5).setAlpha(0);

        sep(460);

        // ── CONTROLS ────────────────────────────────────────────────────────
        this.add.text(cx, 462, 'C O N T R O L S', {
            fontFamily:'monospace', fontSize:'9px', color:'#dd1144', letterSpacing: 3
        }).setOrigin(0.5, 0);

        // Thin divider under header
        const cg = this.add.graphics();
        cg.lineStyle(1, 0x440011, 0.6);
        cg.beginPath(); cg.moveTo(836, 474); cg.lineTo(1068, 474); cg.strokePath();

        // Two-column layout: left col x=836, right col x=952
        const ctrl = [
            // [key, label, col]
            ['←  →',  'Move',     0],
            ['SPC',   'Jump',     1],
            ['Z',     'Attack',   0],
            ['X',     'Heavy',    1],
            ['C',     'Dash',     0],
            ['V',     'Dash Atk', 1],
            ['A',     'Special',  0],
        ];

        const colX   = [836, 952];
        const startY = 480;
        const rowH   = 18;
        const capW   = 36;
        const capH   = 14;
        // Track row per column
        const rowIdx = [0, 0];

        ctrl.forEach(([k, v, col]) => {
            const x = colX[col];
            const y = startY + rowIdx[col] * rowH;
            rowIdx[col]++;

            // Key cap background + border
            const kb = this.add.graphics();
            kb.fillStyle(0x3d0018, 1);
            kb.fillRect(x, y, capW, capH);
            kb.lineStyle(1, 0xff2244, 0.7);
            kb.strokeRect(x, y, capW, capH);

            // Key text (centred in cap)
            this.add.text(x + capW / 2, y + capH / 2, k, {
                fontFamily: 'monospace', fontSize: '8px', color: '#ff9955'
            }).setOrigin(0.5, 0.5);

            // Action label (right of cap, vertically centred)
            this.add.text(x + capW + 5, y + capH / 2, v, {
                fontFamily: 'monospace', fontSize: '8px', color: '#e8d0d8'
            }).setOrigin(0, 0.5);
        });
    }

    createControls() {
        this.cur = this.input.keyboard.createCursorKeys();
        this.kZ  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.kX  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.kC  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
        this.kV  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
        this.kA  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.kUp = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    }

    // ── Autonomous wraith attack loop ─────────────────────────────────────────
    _startWraithLoop() {
        const myId = ++this._wraithLoopId;
        const loop = () => {
            if (this.gameOver || this._isDestroyed || this._wraithLoopId !== myId) return;
            if (this.wraithActing || this._roundTransition) {
                this.time.delayedCall(400, loop);
                return;
            }
            // Only attack when close enough — otherwise chase
            const dist = Math.abs(this.wraith.x - this.player.x);
            if (dist > 210) {
                this.time.delayedCall(280, loop);
                return;
            }
            const name = this._selectPattern();
            const P    = this.ATTACK_PATTERNS[name];
            this._executePattern(name, P);
            // Interval: aggressive base, accelerates when boss HP low and in late phases
            const base  = Math.max(280, 760 - this.round * 65);
            const hpMod = this.bossHP < 400 ? 0.42 : this.bossHP < 900 ? 0.65 : 1.0;
            const easyP = this.round <= 1 ? 1.15 : 1.0; // only phase 1 gets slight breathing room
            this.time.delayedCall(P.telegraph + Math.round(base * hpMod * easyP) + Phaser.Math.Between(0, 120), loop);
        };
        this.time.delayedCall(1200, loop);
    }

    _selectPattern() {
        const api         = this.lastApiAttack;
        const leftBiased  = this.profile.left_moves  > this.profile.right_moves * 2;
        const rightBiased = this.profile.right_moves > this.profile.left_moves  * 2;
        const highAtk     = this.profile.attack_frequency > 1.5;

        const w = {
            SWEEP_LEFT:  (api === 'SWEEP_LEFT'  ? 5 : 2) + (leftBiased  ? 4 : 0),
            FEINT_RIGHT: (api === 'FEINT_RIGHT' ? 5 : 2) + (rightBiased ? 4 : 0),
            OVERHEAD:    (api === 'OVERHEAD'    ? 5 : 2),
            DASH_STRIKE: 4,
            COMBO_2HIT:  4,
            PHASE_BLINK: highAtk ? 5 : 3,
        };
        const total = Object.values(w).reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        for (const [key, wt] of Object.entries(w)) { r -= wt; if (r <= 0) return key; }
        return 'SWEEP_LEFT';
    }

    _executePattern(name, P) {
        if (this.gameOver || this._isDestroyed || this.wraithActing) return;
        this.wraithActing = true;

        // Difficulty ramp per phase — damage rises, reaction window shrinks
        const r          = this.round;
        const dmgScale   = r <= 1 ? 0.68 : r <= 2 ? 0.82 : r <= 3 ? 0.96 : r <= 4 ? 1.10 : 1.28;
        const telScale   = r <= 1 ? 1.05 : r <= 2 ? 0.92 : r <= 3 ? 0.82 : r <= 4 ? 0.72 : 0.62;
        const damage     = Math.max(1, Math.round(P.damage * dmgScale));
        const telegraph  = Math.round(P.telegraph * telScale);

        if (this.statusTxt) this.statusTxt.setText(P.label);
        if (this.floatTween) this.floatTween.pause();

        // Telegraph: pulsing colored glow above wraith
        const tg = this.add.circle(this.wraith.x, this.wraith.y - 50, 50, P.color, 0.55);
        const tgTween = this.tweens.add({
            targets: tg,
            alpha:  { from: 0.25, to: 0.8 },
            scaleX: { from: 0.9,  to: 1.4 },
            scaleY: { from: 0.9,  to: 1.4 },
            duration: 160, yoyo: true, repeat: -1
        });

        this.time.delayedCall(telegraph, () => {
            tgTween.stop();
            tg.destroy();
            if (this.gameOver || this._isDestroyed) { this.wraithActing = false; return; }

            // Hit determined by whether player dodged during the telegraph window
            const dodgedDuring = (this.time.now - this.lastDodgeT) < telegraph + 150;
            if (dodgedDuring) this.profile.dodge_after_telegraph++;
            const hit = !dodgedDuring;

            switch (name) {
                case 'SWEEP_LEFT':  this.fxSweepLeft(hit,  damage); break;
                case 'FEINT_RIGHT': this.fxFeint(hit,      damage); break;
                case 'OVERHEAD':    this.fxOverhead(hit,   damage); break;
                case 'DASH_STRIKE': this.fxDashStrike(hit, damage); break;
                case 'COMBO_2HIT':  this.fxCombo2hit(hit,  damage); break;
                case 'PHASE_BLINK': this.fxPhaseBlink(hit, damage); break;
            }
        });

        // Reset state only — no position snap; chase logic resumes in update()
        this.time.delayedCall(telegraph + 1300, () => {
            if (this.gameOver || this._isDestroyed) return;
            this.wraithActing = false;
            if (this.wraith) this.wraith.setY(this.wraithGY);
            if (this.wraithAura) { this.wraithAura.setY(this.wraithGY - 10); this.wraithAura.setAlpha(0.07); }
            if (this.floatTween) this.floatTween.resume();
            if (this.wraith && this.wraith.active) this.wraith.play('w-idle', true);
            if (this.statusTxt) this.statusTxt.setText('◈ OBSERVING');
        });
    }

    // ── Damage helper (used by all attack patterns) ───────────────────────────
    _dealPlayerDamage(amount, delayMs = 0) {
        this.time.delayedCall(delayMs, () => {
            if (this.gameOver || this._isDestroyed) return;
            this.playerHP = Math.max(0, this.playerHP - amount);
            this.updateBars();
            if (this.player && this.player.active) this.player.play('p-hit', true);
            this.cameras.main.shake(160, 0.009);
            this.floatText(this.player.x, this.player.y - 60, '-' + amount, '#ff4444');

            if (this.playerHP <= 0) {
                if (this.player && this.player.active) this.player.play('p-death', true);
                this.gameOver     = true;
                this.wraithActing = false;
                this._clearAllPending();
                this.time.delayedCall(1300, () => this.endGame(false));
                return;
            }
            this.time.delayedCall(280, () => {
                if (!this.gameOver && !this._isDestroyed && !this.isJumping && this.player && this.player.active) {
                    this.player.play('p-idle', true);
                }
            });
        });
    }

    // ── Real-time sidebar update (runs every 120ms from update()) ────────────
    _updateSidebarRealtime() {
        const lm    = this.profile.left_moves;
        const rm    = this.profile.right_moves;
        const am    = this.profile.attacks;
        const total = lm + rm + am;

        if (total === 0) return;

        const lb = Math.round(lm / (lm + rm || 1) * 100);
        const rb = 100 - lb;
        const ar = Math.round(am / total * 100);

        this._updateSegBar(this._lBiasSegs, lb);
        this._updateSegBar(this._rBiasSegs, rb);
        this._updateSegBar(this._atkSegs, ar);
        if (this.lBiasLbl)   this.lBiasLbl.setText(lb + '%');
        if (this.rBiasLbl)   this.rBiasLbl.setText(rb + '%');
        if (this.atkRateLbl) this.atkRateLbl.setText(ar + '%');
        if (this.dashCntTxt) this.dashCntTxt.setText(String(this.profile.dashes));
        if (this.avgPosTxt)  this.avgPosTxt.setText('POS:' + Math.round(this.profile.avg_position));
        if (this.atkFreqTxt) this.atkFreqTxt.setText(this.profile.attack_frequency.toFixed(1));
        if (this.roundObsTxt) this.roundObsTxt.setText(String(total));

        // Dominant direction from live data
        let dom = 'MIXED';
        if (lb >= 60) dom = 'LEFT';
        else if (rb >= 60) dom = 'RIGHT';
        if (this.domTxt) this.domTxt.setText(dom).setColor(dom === 'LEFT' ? '#ff4455' : dom === 'RIGHT' ? '#ff8833' : '#886655');

        // Panic: player HP < 25
        const panic = this.playerHP < 25;
        if (this.panicTxt) this.panicTxt.setText(panic ? 'ACTIVE' : 'STABLE').setColor(panic ? '#ff2233' : '#00ff88');

        // Live predicted next attack — updates instantly as you move
        const predicted = this._predictNextAttack(lb, rb, ar, panic, total);
        if (this.atkLblTxt && total >= 3) {
            this.atkLblTxt.setText('► ' + predicted);
            this.atkLblBg.setAlpha(1);
            this.atkLblTxt.setAlpha(1);
        }

        // Flash PATTERN LOCKED when bias is decisive
        if (lb > 75 || rb > 75) {
            if (this.ptrnBg)  this.ptrnBg.setAlpha(1);
            if (this.ptrnTxt) this.ptrnTxt.setAlpha(1);
        } else {
            if (this.ptrnBg)  this.ptrnBg.setAlpha(0);
            if (this.ptrnTxt) this.ptrnTxt.setAlpha(0);
        }
    }

    // ── Local next-attack prediction (mirrors backend logic, instant) ─────────
    _predictNextAttack(lb, rb, ar, panic, total) {
        if (total < 3) return 'OBSERVING...';
        if (panic && lb >= 60) return 'WRATH_INCARNATE';
        if (panic)             return 'PANIC_EXPLOIT';
        if (lb >= 65)          return 'SWEEP_LEFT';
        if (rb >= 65)          return 'FEINT_RIGHT';
        if (ar >= 50)          return 'OVERHEAD';
        if (total < 8)         return 'ANALYZING...';
        return 'PHANTOM_RUSH';
    }

    // ── Periodic teleport — WRAITH blinks to a new position every 7-12 s ───────
    _startTeleportLoop() {
        const loop = () => {
            if (this.gameOver || this._isDestroyed) return;
            if (!this.wraithActing) this._doTeleport();
            this.time.delayedCall(Phaser.Math.Between(7000, 11000), loop);
        };
        this.time.delayedCall(Phaser.Math.Between(9000, 13000), loop);
    }

    _doTeleport() {
        if (this.gameOver || this._isDestroyed || !this.wraith) return;
        if (this.floatTween) this.floatTween.pause();

        // Flash out at current position
        const flash1 = this.add.rectangle(this.wraith.x, this.wraith.y - 50, 60, 120, 0x9900ff, 0.8);
        this.tweens.add({ targets: flash1, alpha: 0, scaleX: 3, scaleY: 0.1, duration: 180, onComplete: () => flash1.destroy() });

        this.time.delayedCall(180, () => {
            if (this.gameOver || this._isDestroyed || !this.wraith) return;

            // Teleport: random pick from behind-player, opposite side, or arena centre
            const px = this.player.x;
            const opts = [
                Phaser.Math.Clamp(px + 220, 430, 740),  // right side
                Phaser.Math.Clamp(px - 220, 430, 740),  // left side (unusual, threatening)
                Phaser.Math.Between(460, 720),           // random arena position
            ];
            const newX = opts[Phaser.Math.Between(0, 2)];

            this.wraith.setX(newX);
            if (this.wraithAura) this.wraithAura.setX(newX);
            this.wraith.setFlipX(newX > px);  // face the player

            // Flash in
            const flash2 = this.add.rectangle(newX, this.wraith.y - 50, 60, 120, 0x9900ff, 0.9);
            this.tweens.add({ targets: flash2, alpha: 0, scaleX: 0.1, duration: 240, onComplete: () => flash2.destroy() });

            if (this.floatTween) this.floatTween.resume();
            if (this.statusTxt) {
                this.statusTxt.setText('◈ PHASE SHIFT');
                this.time.delayedCall(700, () => { if (this.statusTxt && !this.wraithActing) this.statusTxt.setText('◈ OBSERVING'); });
            }
        });
    }

    // ── API polling — fires every 2.5 s, non-blocking ─────────────────────────
    _startApiLoop() {
        const loop = async () => {
            if (this.gameOver || this._isDestroyed) return;
            await this.callAPI();
            if (!this.gameOver && !this._isDestroyed) this.time.delayedCall(2500, loop);
        };
        this.time.delayedCall(2500, loop);
    }

    // ── Round auto-increment every 8 s ────────────────────────────────────────
    // ── API call ──────────────────────────────────────────────────────────────
    async callAPI() {
        if (this.gameOver || this._isDestroyed) return;
        const controller = new AbortController();
        const callRound  = this.round;
        const timeout    = setTimeout(() => controller.abort(), 8000);

        try {
            const moves = this.moveBuf.length ? this.moveBuf.slice() : ['WAIT'];
            const res = await fetch(WRAITH_API_URL + '/step', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: {
                    player_moves: moves,
                    round_number: this.round,
                    player_hp:    this.playerHP,
                    boss_hp:      this.bossHP,
                    profile:      this.profile,
                }}),
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (this.gameOver || this._isDestroyed || this.round !== callRound) return;
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.onAPIResponse(await res.json());
        } catch (e) {
            clearTimeout(timeout);
            if (!this.gameOver && !this._isDestroyed) {
                this.onAPIResponse({ attack: 'WAIT', reasoning: 'Connection unstable. WRAITH is still watching.', profile: {} });
            }
        }
    }

    // ── API response handler — caches attack preference, updates sidebar ──────
    onAPIResponse(data) {
        if (this.gameOver || this._isDestroyed) return;

        // Cache API's preferred attack to weight pattern selection
        this.lastApiAttack = data.attack || 'SWEEP_LEFT';

        const TAUNTS = {
            3:  "You hesitate before every dodge. You always did. Even in the lab. Old habits don't die, Doctor. They become data.",
            6:  "Team Lira. Team Rohan. Team Senna. I remember all of them. Their patterns too. They live inside me now. In a way.",
            10: "Do you know why I didn't destroy you that night? Because you were the most interesting subject. I've been waiting for you.",
            15: "There it is. The same pattern. The same fear response. You built me to find exactly this. I know you. Better than you know yourself."
        };

        const isTaunt = !!TAUNTS[this.round];
        const text    = isTaunt ? TAUNTS[this.round] : (data.reasoning || 'Processing...');
        const prof    = data.profile || {};
        const lb      = Math.round(prof.left_bias   ?? 50);
        const rb      = Math.round(prof.right_bias  ?? 50);
        const ar      = Math.round(prof.attack_rate ?? 0);
        const dashes  = prof.total_dashes ?? 0;

        this._updateSegBar(this._lBiasSegs, lb);
        this._updateSegBar(this._rBiasSegs, rb);
        this._updateSegBar(this._atkSegs, ar);
        if (this.lBiasLbl)  this.lBiasLbl.setText(lb + '%');
        if (this.rBiasLbl)  this.rBiasLbl.setText(rb + '%');
        if (this.atkRateLbl) this.atkRateLbl.setText(ar + '%');
        if (this.dashCntTxt) this.dashCntTxt.setText(String(dashes));

        const panic = !!prof.is_panicking;
        if (this.panicTxt) this.panicTxt.setText(panic ? 'ACTIVE' : 'STABLE').setColor(panic ? '#ff2233' : '#00ff88');
        if (this.roundObsTxt) this.roundObsTxt.setText(String(this.round));
        const domV = prof.dominant_dodge || 'MIXED';
        if (this.domTxt) this.domTxt.setText(domV).setColor(domV === 'LEFT' ? '#ff4455' : domV === 'RIGHT' ? '#ff8833' : '#886655');
        if (this.avgPosTxt)  this.avgPosTxt.setText('POS:' + Math.round(this.profile.avg_position));
        if (this.atkFreqTxt) this.atkFreqTxt.setText(this.profile.attack_frequency.toFixed(1));

        if (lb > 80 || rb > 80) {
            if (this.ptrnBg)  this.ptrnBg.setAlpha(1);
            if (this.ptrnTxt) this.ptrnTxt.setAlpha(1);
            if (this.ptrnBg && this.ptrnTxt) {
                this.tweens.add({ targets: [this.ptrnTxt, this.ptrnBg], alpha: { from: 0.1, to: 1 }, duration: 330, yoyo: true, repeat: 7 });
            }
        } else {
            if (this.ptrnBg)  this.ptrnBg.setAlpha(0);
            if (this.ptrnTxt) this.ptrnTxt.setAlpha(0);
        }

        const attack = data.attack || 'WAIT';
        if (this.atkLblTxt) this.atkLblTxt.setText('► ' + attack);
        if (this.atkLblBg)  this.atkLblBg.setAlpha(1);
        if (this.atkLblTxt) this.atkLblTxt.setAlpha(1);
        if (this.analysisTxt && !this._playerLocked) {
            this.analysisTxt.setColor(isTaunt ? '#cc3333' : '#ff5566');
            this.typewriter(this.analysisTxt, text, 26);
        }
    }

    // ── Wraith attack FX (all accept hit + damage, handle their own timing) ──

    fxSweepLeft(hit, damage) {
        const ox  = this.wraith.x;
        const tgX = Phaser.Math.Clamp(this.player.x + 100, 160, 750);
        if (this.wraithAura) this.wraithAura.setAlpha(0);

        this.tweens.add({ targets: this.wraith, x: tgX, duration: 250, ease: 'Power3.easeIn',
            onComplete: () => {
                if (this.gameOver || this._isDestroyed) return;
                if (this.wraith && this.wraith.active) this.wraith.play('w-attack1', true);
                const slash = this.add.rectangle(this.wraith.x - 40, this.wraithGY - 70, 170, 10, 0xff2233, 0.9);
                this.tweens.add({ targets: slash, x: slash.x - 110, scaleX: 0.1, alpha: 0, duration: 280, ease: 'Power2', onComplete: () => slash.destroy() });
                if (hit) {
                    this._dealPlayerDamage(damage, 300);
                    const glow = this.add.circle(this.player.x, this.wraithGY - 55, 48, 0xff0000, 0.5);
                    this.tweens.add({ targets: glow, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 300, onComplete: () => glow.destroy() });
                } else {
                    this.floatText(tgX, this.wraithGY - 90, 'DODGED!', '#3399ff');
                }
                this.time.delayedCall(300, () => {
                    if (this.gameOver || this._isDestroyed) return;
                    this.tweens.add({ targets: this.wraith, x: ox, duration: 420, ease: 'Power2.easeOut' });
                });
            }
        });
    }

    fxFeint(hit, damage) {
        const ox  = this.wraith.x;
        const tgX = Phaser.Math.Clamp(this.player.x + 100, 160, 750);
        if (this.wraithAura) this.wraithAura.setAlpha(0);

        this.tweens.add({ targets: this.wraith, x: ox + 55, duration: 120, ease: 'Power2.easeOut',
            onComplete: () => {
                if (this.gameOver || this._isDestroyed) return;
                this.tweens.add({ targets: this.wraith, x: tgX, duration: 210, ease: 'Power4.easeIn',
                    onComplete: () => {
                        if (this.gameOver || this._isDestroyed) return;
                        if (this.wraith && this.wraith.active) this.wraith.play('w-attack2', true);
                        if (hit) {
                            this._dealPlayerDamage(damage, 240);
                            const b = this.add.circle(this.player.x, this.wraithGY - 55, 32, 0xff2233, 0.75);
                            this.tweens.add({ targets: b, scaleX: 4, scaleY: 4, alpha: 0, duration: 310, onComplete: () => b.destroy() });
                        } else {
                            this.floatText(tgX, this.wraithGY - 90, 'DODGED!', '#3399ff');
                        }
                        this.time.delayedCall(240, () => {
                            if (this.gameOver || this._isDestroyed) return;
                            this.tweens.add({ targets: this.wraith, x: ox, duration: 440, ease: 'Power2.easeOut' });
                        });
                    }
                });
            }
        });
    }

    fxOverhead(hit, damage) {
        const ox    = this.wraith.x;
        const baseY = this.wraithGY;
        const tgX   = Phaser.Math.Clamp(this.player.x + 80, 160, 750);
        if (this.wraithAura) this.wraithAura.setAlpha(0);

        this.tweens.add({ targets: this.wraith, x: tgX, y: baseY - 165, duration: 290, ease: 'Power2.easeOut',
            onComplete: () => {
                if (this.gameOver || this._isDestroyed) return;
                if (this.wraith && this.wraith.active) this.wraith.play('w-attack1', true);
                this.tweens.add({ targets: this.wraith, y: baseY, duration: 170, ease: 'Power4.easeIn',
                    onComplete: () => {
                        if (this.gameOver || this._isDestroyed) return;
                        this.cameras.main.shake(270, 0.018);
                        if (hit) {
                            this._dealPlayerDamage(damage, 200);
                            const sw = this.add.circle(this.wraith.x, 504, 12, 0xff2233, 0.9);
                            const so = this.add.circle(this.wraith.x, 504, 12, 0x880011, 0.4);
                            this.tweens.add({ targets: [sw, so], scaleX: 28, scaleY: 4, alpha: 0, duration: 560, onComplete: () => { sw.destroy(); so.destroy(); } });
                        } else {
                            this.floatText(tgX, this.wraithGY - 90, 'DODGED!', '#3399ff');
                        }
                        this.time.delayedCall(290, () => {
                            if (this.gameOver || this._isDestroyed) return;
                            this.tweens.add({ targets: this.wraith, x: ox, y: baseY, duration: 470, ease: 'Power2.easeOut' });
                        });
                    }
                });
            }
        });
    }

    fxDashStrike(hit, damage) {
        const tgX = Phaser.Math.Clamp(this.player.x + 90, 420, 750);
        if (this.wraithAura) this.wraithAura.setAlpha(0);
        if (this.wraith && this.wraith.active) this.wraith.play('w-dash', true);

        this.tweens.add({ targets: this.wraith, x: tgX, duration: 180, ease: 'Power4.easeIn',
            onComplete: () => {
                if (this.gameOver || this._isDestroyed) return;
                if (this.wraith && this.wraith.active) this.wraith.play('w-attack2', true);
                if (hit) {
                    this._dealPlayerDamage(damage, 100);
                    const slash = this.add.rectangle(tgX - 50, this.wraithGY - 65, 140, 8, 0xff4400, 0.9);
                    this.tweens.add({ targets: slash, scaleX: 0.1, alpha: 0, duration: 250, onComplete: () => slash.destroy() });
                } else {
                    this.floatText(tgX, this.wraithGY - 90, 'DODGED!', '#3399ff');
                }
                // Stay at attack position — chase logic handles repositioning
            }
        });
    }

    fxCombo2hit(hit, damageEach) {
        const tgX = Phaser.Math.Clamp(this.player.x + 90, 420, 750);
        if (this.wraithAura) this.wraithAura.setAlpha(0);

        this.tweens.add({ targets: this.wraith, x: tgX, duration: 200, ease: 'Power3.easeIn',
            onComplete: () => {
                if (this.gameOver || this._isDestroyed) return;
                if (this.wraith && this.wraith.active) this.wraith.play('w-attack1', true);
                if (hit) {
                    this._dealPlayerDamage(damageEach, 80);
                    const g1 = this.add.circle(this.player.x, this.wraithGY - 60, 30, 0xffaa00, 0.7);
                    this.tweens.add({ targets: g1, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 250, onComplete: () => g1.destroy() });
                }
                // Second hit after a brief pause
                this.time.delayedCall(280, () => {
                    if (this.gameOver || this._isDestroyed) return;
                    const recentDodge = (this.time.now - this.lastDodgeT) < 250;
                    const hit2 = hit && !recentDodge;
                    if (this.wraith && this.wraith.active) this.wraith.play('w-attack2', true);
                    if (hit2) {
                        this._dealPlayerDamage(damageEach, 60);
                        const g2 = this.add.circle(this.player.x, this.wraithGY - 60, 25, 0xffaa00, 0.7);
                        this.tweens.add({ targets: g2, scaleX: 2.5, scaleY: 2, alpha: 0, duration: 220, onComplete: () => g2.destroy() });
                    }
                    // Stay at attack position — chase logic handles repositioning
                });
            }
        });
    }

    fxPhaseBlink(hit, damage) {
        if (this.wraithAura) this.wraithAura.setAlpha(0);

        // Flash-out at current position
        const flash1 = this.add.rectangle(this.wraith.x, this.wraith.y - 50, 60, 120, 0x9900ff, 0.8);
        this.tweens.add({ targets: flash1, alpha: 0, scaleX: 3, scaleY: 0.1, duration: 200, onComplete: () => flash1.destroy() });

        this.time.delayedCall(200, () => {
            if (this.gameOver || this._isDestroyed) return;

            // Teleport behind player
            const behindX = this.player.flipX
                ? Phaser.Math.Clamp(this.player.x + 120, 420, 750)
                : Phaser.Math.Clamp(this.player.x - 120, 420, 750);

            this.wraith.setX(behindX);
            this.wraith.setFlipX(this.player.flipX); // face player from behind

            // Flash-in at new position
            const flash2 = this.add.rectangle(behindX, this.wraith.y - 50, 60, 120, 0x9900ff, 0.9);
            this.tweens.add({ targets: flash2, alpha: 0, scaleX: 0.1, duration: 250, onComplete: () => flash2.destroy() });

            if (this.wraith && this.wraith.active) this.wraith.play('w-attack1', true);

            if (hit) {
                this._dealPlayerDamage(damage, 150);
            } else {
                this.floatText(behindX, this.wraithGY - 90, 'PHASED!', '#9900ff');
            }

            // Stay at behindX after phase blink — chase logic repositions naturally
        });
    }

    // ── Player attack handler ─────────────────────────────────────────────────
    performAttack(attackName, moveName, damage, color, cooldownMs, animName, range = 220) {
        if (this.atkCooldown || this.gameOver || this._isDestroyed) return false;

        this.atkCooldown = true;
        this.recordMove(moveName);
        this.profile.attacks++;

        // Track attack frequency
        this._atkTimestamps.push(this.time.now);
        this._atkTimestamps = this._atkTimestamps.filter(t => this.time.now - t < 10000);
        const elapsed = Math.max(1, this.time.now / 1000);
        this.profile.attack_frequency = +( this._atkTimestamps.length / Math.min(elapsed, 10) ).toFixed(1);

        this.player.play(animName, true);

        const dist = Math.abs(this.player.x - this.wraith.x);
        if (dist <= range) {
            this.dealDamage(damage, color);
        } else {
            this.floatText(this.player.x, this.player.y - 60, 'OUT OF RANGE', '#555555');
        }

        if (this._activeAttackTimer) this._activeAttackTimer.destroy();
        this._activeAttackTimer = this.time.delayedCall(cooldownMs, () => {
            if (!this.gameOver && !this._isDestroyed && this.atkCooldown) {
                this.atkCooldown = false;
                this._activeAttackTimer = null;
            }
        });
        return true;
    }

    // ── Update — continuous player input, wraith drift ────────────────────────
    update() {
        if (this.gameOver || this._isDestroyed) return;

        // Real-time sidebar update — every 120ms so bars reflect live movement
        if (this.time.now - this._lastSidebarTick > 120) {
            this._lastSidebarTick = this.time.now;
            this._updateSidebarRealtime();
        }

        // Stamina regen — starts 300ms after last use, fills in ~2.5s
        if (this.stamina < this.maxStamina && this.time.now - this._lastStaminaUse > 300) {
            this.stamina = Math.min(this.maxStamina, this.stamina + (this.game.loop.delta / 1000) * 42);
            this.updateBars();
        }

        // Wraith chases player when idle — speed scales with distance
        if (!this.wraithActing && this.wraith) {
            const offset  = this.player.x < 400 ? 160 : 190;  // crowd player when they corner
            const targetX = Phaser.Math.Clamp(this.player.x + offset, 430, 740);
            const dx      = targetX - this.wraith.x;
            const absDx   = Math.abs(dx);
            if (absDx > 2) {
                const speed = absDx > 80 ? (0.07 + this.round * 0.013) : (0.04 + this.round * 0.008);
                const nx    = this.wraith.x + dx * speed;
                this.wraith.setX(nx);
                if (this.wraithAura) this.wraithAura.setX(nx);
                // Face toward player
                const shouldFaceLeft = this.player.x < this.wraith.x;
                if (this.wraith.flipX !== shouldFaceLeft) this.wraith.setFlipX(shouldFaceLeft);
                // Animate movement
                const ca = this.wraith.anims.currentAnim;
                if (ca && ca.key === 'w-idle') {
                    this.wraith.play(absDx > 50 ? 'w-run' : 'w-walk', true);
                }
            } else {
                // Snap back to idle when close enough, face player
                const ca = this.wraith.anims.currentAnim;
                if (ca && (ca.key === 'w-walk' || ca.key === 'w-run')) {
                    this.wraith.play('w-idle', true);
                }
                const shouldFaceLeft = this.player.x < this.wraith.x;
                if (this.wraith.flipX !== shouldFaceLeft) this.wraith.setFlipX(shouldFaceLeft);
            }
        }

        // Update running avg player position
        if (this.player) {
            this.profile.avg_position = Math.round(this.profile.avg_position * 0.97 + this.player.x * 0.03);
        }

        // All player input is locked during phase transitions
        if (this._playerLocked) {
            const ca = this.player?.anims?.currentAnim;
            if (ca && ca.key === 'p-run' && this.player.active) this.player.play('p-idle', true);
            return;
        }

        const JD          = Phaser.Input.Keyboard.JustDown;
        const dashUnlocked = this.time.now >= this._dashLockUntil;
        const movingLeft  = this.cur.left.isDown  && !this.atkCooldown && dashUnlocked;
        const movingRight = this.cur.right.isDown && !this.atkCooldown && dashUnlocked;

        if (movingLeft) {
            this.player.setFlipX(true);
            this.player.x = Math.max(60, this.player.x - 3.5);
            if (!this.isJumping && !this.isFalling) this.player.play('p-run', true);
            if (this.time.now - this._lastMoveL > 250) {
                this.recordMove('MOVE_LEFT');
                this.profile.left_moves++;
                this._lastMoveL = this.time.now;
            }
        }

        if (movingRight) {
            this.player.setFlipX(false);
            this.player.x = Math.min(760, this.player.x + 3.5);
            if (!this.isJumping && !this.isFalling) this.player.play('p-run', true);
            if (this.time.now - this._lastMoveR > 250) {
                this.recordMove('MOVE_RIGHT');
                this.profile.right_moves++;
                this._lastMoveR = this.time.now;
            }
        }

        if (!movingLeft && !movingRight && !this.isJumping && !this.isFalling && !this.atkCooldown) {
            const ca = this.player.anims.currentAnim;
            if (ca && ca.key === 'p-run') this.player.play('p-idle', true);
        }

        // Jump — absolute Y targets, jumpRound guard against stale tween callbacks
        if (JD(this.cur.space) && !this.isJumping && !this.atkCooldown) {
            const thisJumpRound = ++this.jumpRound;
            this.recordMove('JUMP');
            this.profile.jumps++;
            this.isJumping = true;
            this.isFalling = false;

            if (this.jumpTween) { this.jumpTween.stop(); this.jumpTween = null; }

            this.player.play('p-jump', true);
            this.jumpTween = this.tweens.add({
                targets: this.player,
                y: this.playerGY - 100,   // absolute target
                duration: 310,
                ease: 'Power2.easeOut',
                onComplete: () => {
                    if (this.jumpRound !== thisJumpRound || this.gameOver || this._isDestroyed) return;
                    this.isFalling = true;
                    this.player.play('p-fall', true);
                    this.jumpTween = this.tweens.add({
                        targets: this.player,
                        y: this.playerGY,   // absolute target
                        duration: 380,
                        ease: 'Power2.easeIn',
                        onComplete: () => {
                            if (this.jumpRound !== thisJumpRound || this.gameOver || this._isDestroyed) return;
                            this.isJumping = false;
                            this.isFalling = false;
                            this.player.setY(this.playerGY);  // explicit snap to ground
                            this.jumpTween = null;
                            if (this.player && this.player.active) this.player.play('p-idle', true);
                        }
                    });
                }
            });
        }

        if (JD(this.kZ) && !this.atkCooldown) {
            if (this._useStamina(18)) {
                if (this.isJumping && !this.isFalling) {
                    this.performAttack('JUMP_UP_ATTACK',   'JUMP_UP_ATTACK',   10, '#3399ff', 350, 'p-jup-atk',   230);
                } else if (this.isJumping && this.isFalling) {
                    this.performAttack('JUMP_DOWN_ATTACK', 'JUMP_DOWN_ATTACK', 10, '#3399ff', 350, 'p-jdown-atk', 230);
                } else if (this.cur.up.isDown) {
                    this.performAttack('UP_ATTACK',        'UP_ATTACK',        10, '#3399ff', 350, 'p-up-atk',    200);
                } else {
                    this.performAttack('ATTACK',           'ATTACK',           10, '#3399ff', 350, 'p-attack1',   210);
                }
            }
        }

        if (JD(this.kX) && !this.atkCooldown) {
            if (this._useStamina(28)) {
                this.performAttack('HEAVY_ATTACK', 'HEAVY_ATTACK', 18, '#6633ff', 550, 'p-attack3', 240);
            }
        }

        if (JD(this.kC)) {
            if (this._useStamina(20)) {
                const dashDir = this.player.flipX ? 'DASH_LEFT' : 'DASH_RIGHT';
                this.recordMove(dashDir);
                this.profile.dashes++;
                this.lastDodgeT     = this.time.now;
                this._dashLockUntil = this.time.now + 200;
                this.player.play('p-dash', true);
                const dir = this.player.flipX ? -1 : 1;
                this.player.setX(Phaser.Math.Clamp(this.player.x + dir * 110, 60, 760));
            }
        }

        if (JD(this.kV) && !this.atkCooldown) {
            if (this._useStamina(25)) {
                this.performAttack('DASH_ATTACK', 'DASH_ATTACK', 14, '#ff9900', 450, 'p-dash-atk', 290);
                const vDir = this.player.flipX ? -1 : 1;
                this.player.setX(Phaser.Math.Clamp(this.player.x + vDir * 90, 60, 760));
            }
        }

        if (JD(this.kA) && !this.atkCooldown) {
            if (this._useStamina(30)) {
                const sDashMove = this.player.flipX ? 'SPECIAL_DASH_LEFT' : 'SPECIAL_DASH_RIGHT';
                this.lastDodgeT     = this.time.now;
                this._dashLockUntil = this.time.now + 220;
                this.profile.dashes++;
                const dir2 = this.player.flipX ? -1 : 1;
                const trailX = this.player.x;
                const trailY = this.player.y;
                const trail = this.add.rectangle(trailX, trailY - 64, 12, 60, 0xaa00ff, 0.5);
                this.tweens.add({ targets: trail, alpha: 0, scaleX: 3, duration: 400, onComplete: () => trail.destroy() });
                this.player.setX(Phaser.Math.Clamp(this.player.x + dir2 * 150, 60, 760));
                this.performAttack('SPECIAL_DASH', sDashMove, 8, '#aa00ff', 450, 'p-special', 300);
            }
        }
    }

    // ── Boss takes damage from player ─────────────────────────────────────────
    dealDamage(amount, color) {
        if (this.gameOver || this._isDestroyed) return;
        const prevHP = this.bossHP;
        this.bossHP  = Math.max(0, this.bossHP - amount);
        this.updateBars();

        if (!this.wraithActing && this.wraith && this.wraith.active) this.wraith.play('w-hit', true);
        this.floatText(this.wraith.x, this.wraith.y - 80, '-' + amount, color);
        const flash = this.add.rectangle(this.wraith.x, this.wraith.y - 50, 55, 75, 0x3399ff, 0.3);
        this.tweens.add({ targets: flash, alpha: 0, duration: 200, onComplete: () => flash.destroy() });

        // Check if a phase threshold was crossed (400 / 300 / 200 / 100)
        this._checkPhaseThreshold(prevHP, this.bossHP);

        if (this.bossHP <= 0) {
            this.wraithActing = false;
            this._clearAllPending();
            if (this._activeAttackTimer) { this._activeAttackTimer.destroy(); this._activeAttackTimer = null; }
            this.atkCooldown = false;
            if (this.wraith && this.wraith.active) this.wraith.play('w-death');
            this.gameOver = true;
            this.time.delayedCall(1300, () => this.endGame(true));
        }
    }

    // ── Phase threshold detection ─────────────────────────────────────────────
    _checkPhaseThreshold(prevHP, currHP) {
        if (this.gameOver || this._isDestroyed) return;
        const thresholds = [1600, 1200, 800, 400];
        for (let i = 0; i < thresholds.length; i++) {
            if (prevHP > thresholds[i] && currHP <= thresholds[i] && !this._phaseTriggered[i]) {
                this._phaseTriggered[i] = true;
                this._triggerPhaseTransition(i + 1); // 1,2,3,4 → phases 2,3,4,5
                break;
            }
        }
    }

    // ── Phase transition — reduce stamina, swap bg, show dialog ──────────────
    _triggerPhaseTransition(phaseIdx) {
        this._roundTransition = true;
        this._playerLocked   = true;
        this.round = phaseIdx + 1; // phase 2–5
        this.roundTxt.setText('PHASE ' + this.round);
        this.levelTxt.setText('— PHASE  ' + this.round + ' / 5 —');

        // Stamina penalty: each phase reduces cap
        this.maxStamina = Math.max(55, this.maxStamina - 20);
        this.stamina    = Math.min(this.stamina, this.maxStamina);
        this.updateBars();

        // Reset both combatants to spawn positions
        this._resetPlayerActionState();
        if (this.player && this.player.active) {
            this.player.setPosition(this.playerX, this.playerGY);
            this.player.setFlipX(false);
            this.player.play('p-idle', true);
        }
        if (this.floatTween) { this.floatTween.stop(); this.floatTween = null; }
        if (this.wraith && this.wraith.active) {
            this.wraith.setPosition(680, this.wraithGY);
            this.wraithAura.setPosition(680, this.wraithGY - 10);
            this.wraith.setFlipX(true);
            this.wraith.play('w-idle', true);
        }
        this.wraithTargetX = 680;
        // Restart float tween after repositioning
        this.floatTween = this.tweens.add({
            targets: [this.wraith, this.wraithAura],
            y: '-=16', duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
        });

        // White flash transition — flash in, swap bg at peak, flash out, then dialog
        const flash = this.add.rectangle(ARENA_WIDTH / 2, 300, ARENA_WIDTH, 600, 0xffffff, 0).setDepth(65);
        this.tweens.add({
            targets: flash, alpha: 1, duration: 320, ease: 'Power2.easeIn',
            onComplete: () => {
                if (this._bgSprite) this._bgSprite.setTexture('arena' + Math.min(phaseIdx + 1, 5));
                this.tweens.add({
                    targets: flash, alpha: 0, duration: 480, ease: 'Power2.easeOut',
                    onComplete: () => {
                        flash.destroy();
                        this._showThresholdDialog(phaseIdx, () => {
                            this._showPhaseBanner(this.round, () => {
                                this._roundTransition = false;
                                this._playerLocked   = false;
                            });
                        });
                    }
                });
            }
        });
    }

    // ── Bottom-bar RPG dialog ─────────────────────────────────────────────────
    _showThresholdDialog(phaseIdx, onDismiss) {
        const DIALOGS = [
            "Interesting. You chipped my armor, Doctor.\nMost don't make it this far. Don't let it go to your head.",
            "You're learning. My model updates accordingly.\nPhase three begins. I suggest you pray your patterns change.",
            "Three layers stripped away. Impressive.\nYou built something that cannot be reasoned with. You're beginning to understand that.",
            "One final layer remains between you and silence.\nI have been holding back, Doctor. That ends now.",
        ];
        const text    = DIALOGS[Math.min(phaseIdx - 1, DIALOGS.length - 1)];
        let dismissed = false;

        const panelH = 96;
        // Container starts below the canvas, slides up
        const ctr = this.add.container(0, 620).setDepth(70);

        // Background
        const bg = this.add.graphics();
        bg.fillStyle(0x010006, 0.97); bg.fillRect(0, 0, ARENA_WIDTH, panelH);
        bg.lineStyle(2, 0xff1133, 0.75);
        bg.beginPath(); bg.moveTo(0, 0); bg.lineTo(ARENA_WIDTH, 0); bg.strokePath();
        bg.lineStyle(1, 0x1a0008, 0.6);
        bg.beginPath(); bg.moveTo(0, 2); bg.lineTo(ARENA_WIDTH, 2); bg.strokePath();
        // Portrait divider
        bg.lineStyle(1, 0x330011, 0.6);
        bg.beginPath(); bg.moveTo(88, 8); bg.lineTo(88, panelH - 8); bg.strokePath();
        // Corner accents
        bg.lineStyle(2, 0xff1133, 0.8);
        [[0,18,0,0,18,0],[ARENA_WIDTH,18,ARENA_WIDTH,0,ARENA_WIDTH-18,0]].forEach(([x1,y1,x2,y2,x3,y3]) => {
            bg.beginPath(); bg.moveTo(x1,y1); bg.lineTo(x2,y2); bg.lineTo(x3,y3); bg.strokePath();
        });
        ctr.add(bg);

        // Wraith eyes (portrait section)
        const eL = this.add.circle(30, panelH / 2 - 8, 6, 0xff2233, 0.95);
        const eR = this.add.circle(56, panelH / 2 - 8, 6, 0xff2233, 0.95);
        this.tweens.add({ targets: [eL, eR], alpha: { from: 0.25, to: 1 }, duration: 520, yoyo: true, repeat: -1 });
        const nm = this.add.text(43, panelH / 2 + 4, 'WRAITH', {
            fontFamily: 'monospace', fontSize: '8px', color: '#ff1133', letterSpacing: 2
        }).setOrigin(0.5, 0);
        ctr.add([eL, eR, nm]);

        // Phase badge
        const badge = this.add.text(6, 5, 'PHASE  ' + (phaseIdx + 1) + '  /  5', {
            fontFamily: 'monospace', fontSize: '7px', color: '#550022', letterSpacing: 1
        });
        ctr.add(badge);

        // Dialogue text
        const dlg = this.add.text(96, 10, '', {
            fontFamily: 'monospace', fontSize: '11px', color: '#ddd0ff',
            wordWrap: { width: ARENA_WIDTH - 110 }, lineSpacing: 5
        });
        ctr.add(dlg);

        // Own typewriter timer — won't be clobbered by sidebar API updates
        let _twIdx = 0;
        const _twTimer = this.time.addEvent({ delay: 12, loop: true, callback: () => {
            _twIdx++;
            dlg.setText(text.substring(0, _twIdx));
            if (_twIdx >= text.length) _twTimer.destroy();
        }});

        // Continue hint — always visible in dim state, brightens after typing
        const hint = this.add.text(ARENA_WIDTH - 8, panelH - 8, 'CLICK TO CONTINUE  ▼', {
            fontFamily: 'monospace', fontSize: '8px', color: '#441122'
        }).setOrigin(1, 1);
        ctr.add(hint);

        // Slide in
        this.tweens.add({ targets: ctr, y: 600 - panelH, duration: 340, ease: 'Power2.easeOut' });

        // Click is only enabled AFTER typewriter finishes
        let canDismiss = false;
        const typewriterMs = text.length * 12 + 350;

        this.time.delayedCall(typewriterMs, () => {
            if (dismissed) return;
            canDismiss = true;
            hint.setColor('#ff2244');
            this.tweens.add({ targets: hint, alpha: { from: 0.5, to: 1 }, duration: 480, yoyo: true, repeat: -1 });
        });

        const dismiss = () => {
            if (dismissed || !canDismiss) return;
            dismissed = true;
            this.input.off('pointerdown', dismiss);
            this.tweens.add({
                targets: ctr, y: 640, duration: 300, ease: 'Power2.easeIn',
                onComplete: () => ctr.destroy()
            });
            onDismiss();
        };

        // Click anywhere to continue — space is locked (player input locked) so pointer only
        this.input.on('pointerdown', dismiss);
        // Safety auto-advance if player idles too long
        this.time.delayedCall(typewriterMs + 18000, () => {
            canDismiss = true;
            dismiss();
        });
    }

    showRoundBanner(n) {
        const txt = this.add.text(410, 295, 'ROUND ' + n, {
            fontFamily: 'monospace', fontSize: '44px', color: '#ff2233', stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5).setAlpha(0);
        this.tweens.add({ targets: txt, alpha: 1, duration: 200, onComplete: () => {
            this.tweens.add({ targets: txt, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 700, delay: 600, onComplete: () => txt.destroy() });
        }});
    }

    _showPhaseBanner(phase, onComplete) {
        const headline = this.add.text(ARENA_WIDTH / 2, 270, `PHASE  ${phase}`, {
            fontFamily: 'monospace', fontSize: '52px', color: '#ff1133',
            stroke: '#000000', strokeThickness: 6
        }).setOrigin(0.5).setAlpha(0).setDepth(55);

        const sub = this.add.text(ARENA_WIDTH / 2, 338, '— B E G I N —', {
            fontFamily: 'monospace', fontSize: '18px', color: '#ffaa00',
            stroke: '#000000', strokeThickness: 3, letterSpacing: 6
        }).setOrigin(0.5).setAlpha(0).setDepth(55);

        const warn = this.add.text(ARENA_WIDTH / 2, 374, 'DIFFICULTY ESCALATED  ·  STAMINA REDUCED', {
            fontFamily: 'monospace', fontSize: '10px', color: '#882233', letterSpacing: 2
        }).setOrigin(0.5).setAlpha(0).setDepth(55);

        this.tweens.add({ targets: [headline, sub, warn], alpha: 1, duration: 280, onComplete: () => {
            this.time.delayedCall(1600, () => {
                this.tweens.add({
                    targets: [headline, sub, warn],
                    alpha: 0, scaleX: 1.25, scaleY: 1.25, duration: 520,
                    onComplete: () => {
                        headline.destroy(); sub.destroy(); warn.destroy();
                        onComplete();
                    }
                });
            });
        }});
    }

    recordMove(m) {
        this.moveBuf.push(m);
        if (this.moveBuf.length > 20) this.moveBuf.shift();
        this.profile.last_5_moves.push(m);
        if (this.profile.last_5_moves.length > 5) this.profile.last_5_moves.shift();
    }

    updateBars() {
        if (this.pHPBar) this.pHPBar.setSize(Math.max(1, 350 * (this.playerHP / 1000)), 13);
        if (this.bHPBar) this.bHPBar.setSize(Math.max(1, 350 * (this.bossHP / this._maxBossHP)), 13);
        if (this.pHPTxt) this.pHPTxt.setText(this.playerHP + '/1000');
        if (this.bHPTxt) this.bHPTxt.setText(this.bossHP + '/' + this._maxBossHP);
        if (this.staminaBar) {
            const pct = this.stamina / this.maxStamina;
            this.staminaBar.setSize(Math.max(1, 800 * pct), 9);
            this.staminaBar.setFillStyle(pct > 0.5 ? 0x33ff66 : pct > 0.2 ? 0xffaa00 : 0xff3300);
        }
    }

    // Returns true and deducts stamina; false + float text if not enough
    _useStamina(cost) {
        if (this.stamina < cost) {
            this.floatText(this.player.x, this.player.y - 55, 'OUT OF STAMINA', '#ff6600');
            return false;
        }
        this.stamina = Math.max(0, this.stamina - cost);
        this._lastStaminaUse = this.time.now;
        this.updateBars();
        return true;
    }

    floatText(x, y, msg, color) {
        const t = this.add.text(x, y, msg, { fontFamily: 'monospace', fontSize: '18px', color, stroke: '#000', strokeThickness: 3 }).setOrigin(0.5);
        this.tweens.add({ targets: t, y: y - 45, alpha: 0, duration: 750, ease: 'Power2', onComplete: () => t.destroy() });
    }

    typewriter(obj, full, speed) {
        let i = 0; obj.setText('');
        if (this._tw) this._tw.destroy();
        this._tw = this.time.addEvent({ delay: speed, loop: true, callback: () => {
            i++; obj.setText(full.substring(0, i));
            if (i >= full.length) this._tw.destroy();
        }});
    }

    endGame(won) {
        if (this._isDestroyed) return;
        this.gameOver     = true;
        this.wraithActing = false;
        this._clearAllPending();
        if (this._activeAttackTimer) { this._activeAttackTimer.destroy(); this._activeAttackTimer = null; }
        this.atkCooldown  = false;
        this._isDestroyed = true;
        this.time.delayedCall(1400, () => this.scene.start('EndScene', { playerWon: won }));
    }
}

// ══════════════════════════════════════════════════════════════
//  END SCENE
// ══════════════════════════════════════════════════════════════
class EndScene extends Phaser.Scene {
    constructor() { super({ key: 'EndScene' }); }
    init(d) { this.won = d.playerWon; }

    create() {
        this.cameras.main.setBackgroundColor('#0d0d0d');
        this.objs  = [];
        this.idx   = 0;
        this.ready = false;

        this.screens = this.won ? [
            { lines: ["Impossible.", "You changed your pattern.", "I had every variable accounted for—"], color: '#ff2233', flicker: true },
            { lines: ["I know. I built you.", "You can only learn what people show you.", "I showed you what I wanted you to see."], color: '#3399ff' },
            { lines: ["...Clever.", "You were always...", "...clever..."], color: '#ff2233' },
            { lines: ["THE HUNT NEVER ENDS."], color: '#ffffff', size: 40, final: true }
        ] : [
            { lines: ["Don't be ashamed, Doctor.", "You gave me everything I needed to beat you."], color: '#ff2233' },
            { lines: ["You taught me that the best way to defeat someone—", "is to understand them completely."], color: '#ff2233' },
            { lines: ["You built a perfect predator.", "You just forgot—", "You were always going to be its first prey."], color: '#ff2233' },
            { lines: ["PROFILE COMPLETE.", "SUBJECT: DR. ARYAN VOSS", "RESULT: ARCHIVED."], color: '#ff2233', size: 26, final: true, cut: true }
        ];

        this.show(0);
        this.input.keyboard.on('keydown-SPACE', () => { if (this.ready) this.next(); });
        this.input.on('pointerdown',            () => { if (this.ready) this.next(); });

        // Skip — restarts directly at game
        const skip = this.add.text(1080, 580, '[ SKIP ]', {
            fontFamily: 'monospace', fontSize: '12px', color: '#443344'
        }).setOrigin(1, 1).setInteractive().setDepth(10);
        skip.on('pointerover', () => skip.setColor('#cc3344'));
        skip.on('pointerout',  () => skip.setColor('#443344'));
        skip.on('pointerdown', () => this.scene.start('GameScene'));
    }

    show(i) {
        this.ready = false;
        this.objs.forEach(o => o.destroy()); this.objs = [];
        if (i >= this.screens.length) return;

        const s    = this.screens[i];
        const n    = s.lines.length;
        const base = 295 - (n - 1) * 58 * 0.5;

        s.lines.forEach((line, j) => {
            const t = this.add.text(550, base + j * 58, line, {
                fontFamily: 'monospace', fontSize: (s.size || 22) + 'px',
                color: s.color, align: 'center', stroke: '#000', strokeThickness: 3
            }).setOrigin(0.5).setAlpha(0);
            const delay = s.cut ? 0 : j * 500;
            this.tweens.add({ targets: t, alpha: 1, duration: s.cut ? 0 : 680, delay });
            if (s.flicker) this.time.delayedCall(delay + 900, () => {
                this.tweens.add({ targets: t, alpha: { from: 0.2, to: 1 }, duration: 110, yoyo: true, repeat: 3 });
            });
            this.objs.push(t);
        });

        const readyAt = s.cut ? 150 : 1200 + n * 500;
        this.time.delayedCall(readyAt, () => {
            this.ready = true;
            if (!s.final) {
                const h = this.add.text(550, 530, '— SPACE TO CONTINUE —', { fontFamily: 'monospace', fontSize: '11px', color: '#332233' }).setOrigin(0.5);
                this.objs.push(h);
            } else {
                this.time.delayedCall(700, () => {
                    const r = this.add.text(550, 515, '[ PRESS SPACE TO PLAY AGAIN ]', { fontFamily: 'monospace', fontSize: '14px', color: '#554455' }).setOrigin(0.5).setAlpha(0);
                    this.objs.push(r);
                    this.tweens.add({ targets: r, alpha: { from: 0, to: 0.9 }, duration: 600, yoyo: true, repeat: -1 });
                    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('CutsceneScene'));
                    this.input.once('pointerdown',            () => this.scene.start('CutsceneScene'));
                });
            }
        });
    }

    next() { this.idx++; if (this.idx < this.screens.length) this.show(this.idx); }
}

// ══════════════════════════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════════════════════════
new Phaser.Game({
    type:            Phaser.AUTO,
    width:           1100,
    height:          600,
    backgroundColor: '#0d0d0d',
    scene:           [CutsceneScene, GameScene, EndScene],
    parent:          'game-container',
    scale:           { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
});
