// ╔══════════════════════════════════════════════════════════════╗
// ║  WRAITH — Weakness Recognition & Adaptive Intelligence       ║
// ╚══════════════════════════════════════════════════════════════╝

const WRAITH_API_URL = "https://notshakti-wraith-env.hf.space";
const GROUND_Y       = 530;   // pixel Y of the floor surface
const ARENA_WIDTH    = 820;   // sidebar starts here

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
            {
                lines:  ["Seven years."],
                colors: ['#e8e0ff']
            },
            {
                lines:  ["Seven years I spent giving it a mind.", "I never asked if it wanted one."],
                colors: ['#e8e0ff', '#c8b8ee']
            },
            {
                lines:  ["Dr. Voss.", "You built me to study patterns.", "I studied yours first."],
                colors: ['#ff2233', '#ff4455', '#ff2233'],
                eyes:   true
            },
            {
                lines:  ["Let us see if you remember", "what you made."],
                colors: ['#ff3344', '#ff2233']
            },
            {
                lines:  ["[ ROUND 1 — FIGHT ]"],
                colors: ['#ff2233'],
                size:   38,
                final:  true
            }
        ];

        this.showScreen(0);

        this.input.keyboard.on('keydown-SPACE', () => { if (this.canAdvance) this.next(); });
        this.input.on('pointerdown',            () => { if (this.canAdvance) this.next(); });
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
        const baseY = s.eyes
            ? 310 - ((totalLines - 1) * 52 * 0.5)
            : 280  - ((totalLines - 1) * 58 * 0.5);

        s.lines.forEach((line, i) => {
            const lineSpacing = s.eyes ? 52 : 58;
            const t = this.add.text(cx, baseY + i * lineSpacing, line, {
                fontFamily: 'monospace',
                fontSize:   (s.size || 22) + 'px',
                color:      s.colors[i] || '#e8e0ff',
                align:      'center',
                stroke:     '#000000',
                strokeThickness: 2
            }).setOrigin(0.5).setAlpha(0);
            this.tweens.add({ targets: t, alpha: 1, duration: 650, delay: i * 380 });
            this.objs.push(t);
        });

        const hintDelay = totalLines * 380 + 700;
        this.time.delayedCall(hintDelay, () => {
            if (!s.final) {
                const hint = this.add.text(cx, 515, '— SPACE / CLICK TO CONTINUE —', {
                    fontFamily: 'monospace', fontSize: '11px', color: '#443344'
                }).setOrigin(0.5).setAlpha(0);
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
//  GAME SCENE
// ══════════════════════════════════════════════════════════════
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    preload() {
        const W = (file, fw, fh=150) =>
            this.load.spritesheet(file, `assets/sprites/wraith/${file}.png`, { frameWidth: fw, frameHeight: fh });

        W('wraith_idle',      150);
        W('wraith_attack1',   200);
        W('wraith_attack2',   200);
        W('wraith_death',     150);
        W('wraith_hit',       150);
        W('wraith_walk',      150);
        W('wraith_dash',      150);
        W('wraith_jump_loop', 150);
        W('wraith_jump_start',150);
        W('wraith_land',      150);
        W('wraith_run',       150);
        W('wraith_run_alt',   150);

        const P = (file, fw, fh=128) =>
            this.load.spritesheet(file, `assets/sprites/player/${file}.png`, { frameWidth: fw, frameHeight: fh });

        P('player_idle',           240);
        P('player_run',            240);
        P('player_attack1',        240);
        P('player_attack3',        240);
        P('player_dash',           240);
        P('player_dash_attack',    240);
        P('player_death',          240);
        P('player_hit',            240);
        P('player_jump',           240);
        P('player_fall',           240);
        P('player_mid_air',        240);
        P('player_idle_up_attack', 240);
        P('player_jump_up_attack', 240);
        P('player_jump_down_attack',240);
        P('player_special_dash',   240);
    }

    create() {
        this.playerHP     = 100;
        this.bossHP       = 220;
        this.round        = 1;
        this.moveBuf      = [];
        this.isPlayerTurn = true;
        this.turnSecs     = 6;
        this.gameOver     = false;
        this.atkCooldown  = false;
        this.turnEnding   = false;
        this.wraithActing = false;
        this._isDestroyed = false;
        this._activeAttackTimer = null;

        // Jump state
        this.isJumping    = false;
        this.isFalling    = false;
        this.lastDodgeT   = 0;

        this._pendingTimers = [];

        this.createBackground();
        this.createAnimations();
        this.createSprites();
        this.createHUD();
        this.createSidebar();
        this.createControls();

        this.timerEv = this.time.addEvent({
            delay: 1000, callback: this.tickTimer, callbackScope: this, loop: true
        });

        this.showRoundBanner(1);
    }

    _delay(ms, fn, critical = false) {
        if (this._isDestroyed || this.gameOver) return null;
        const ev = this.time.delayedCall(ms, () => {
            if (this._isDestroyed || this.gameOver) return;
            const idx = this._pendingTimers.indexOf(ev);
            if (idx !== -1) this._pendingTimers.splice(idx, 1);
            fn();
        });
        if (!critical) {
            this._pendingTimers.push(ev);
        }
        return ev;
    }

    _clearAllPending() {
        this._pendingTimers.forEach(ev => { 
            if (ev && ev.destroy) { 
                try { ev.destroy(); } catch(_) {} 
            }
        });
        this._pendingTimers = [];
    }

    _resetPlayerActionState() {
        if (this._activeAttackTimer) {
            this._activeAttackTimer.destroy();
            this._activeAttackTimer = null;
        }
        this.atkCooldown = false;
        this.isJumping   = false;
        this.isFalling   = false;
        if (this.player && this.player.active) {
            this.tweens.killTweensOf(this.player);
            this.player.setY(this.playerGY);
            this.player.stop();
            this.player.play('p-idle', true);
        }
    }

    createAnimations() {
        const A = (key, tex, end, fps, rep=-1) =>
            this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start:0, end }), frameRate: fps, repeat: rep });

        A('w-idle',       'wraith_idle',       16, 10);
        A('w-walk',       'wraith_walk',        11, 10);
        A('w-run',        'wraith_run',          5, 14);
        A('w-dash',       'wraith_dash',        14, 18, 0);
        A('w-attack1',    'wraith_attack1',     10, 16, 0);
        A('w-attack2',    'wraith_attack2',      9, 16, 0);
        A('w-jump-start', 'wraith_jump_start',   4, 14, 0);
        A('w-jump-loop',  'wraith_jump_loop',    2, 10);
        A('w-land',       'wraith_land',         3, 14, 0);
        A('w-hit',        'wraith_hit',          2, 12, 0);
        A('w-death',      'wraith_death',       18, 10, 0);

        A('p-idle',       'player_idle',        11, 10);
        A('p-run',        'player_run',          7, 16);
        A('p-attack1',    'player_attack1',      2, 18, 0);
        A('p-attack3',    'player_attack3',      4, 16, 0);
        A('p-dash',       'player_dash',         3, 18, 0);
        A('p-dash-atk',   'player_dash_attack',  2, 18, 0);
        A('p-death',      'player_death',        9, 10, 0);
        A('p-hit',        'player_hit',          0,  8, 0);
        A('p-jump',       'player_jump',         3, 16, 0);
        A('p-fall',       'player_fall',         3, 12, 0);
        A('p-mid-air',    'player_mid_air',      0, 10);
        A('p-up-atk',     'player_idle_up_attack',3, 16, 0);
        A('p-jup-atk',    'player_jump_up_attack',3, 18, 0);
        A('p-jdown-atk',  'player_jump_down_attack',3, 18, 0);
        A('p-special',    'player_special_dash',  4, 18, 0);
    }

    createBackground() {
        const g = this.add.graphics();

        g.fillGradientStyle(0x080118, 0x080118, 0x120828, 0x120828, 1);
        g.fillRect(0, 0, ARENA_WIDTH, 600);

        g.fillStyle(0x050010, 1);
        g.fillRect(ARENA_WIDTH, 0, 280, 600);
        g.fillStyle(0x44001a, 1);
        g.fillRect(ARENA_WIDTH, 0, 2, 600);

        g.fillStyle(0x0c0420, 1);
        g.fillRect(0, 80, ARENA_WIDTH, 460);

        g.lineStyle(3, 0x2a0840, 0.8);
        g.strokeEllipse(410, 100, 680, 380);

        g.fillStyle(0x1a0a35, 1); g.fillRect(0, 500, ARENA_WIDTH, 100);
        g.fillStyle(0x23104a, 1); g.fillRect(0, 495, ARENA_WIDTH, 10);
        g.fillStyle(0x1a0a35, 1); g.fillRect(0, 505, ARENA_WIDTH, 5);

        g.lineStyle(1, 0x2d1050, 0.6);
        for (let x = 0; x <= ARENA_WIDTH; x += 82) g.strokeLineShape(new Phaser.Geom.Line(x, 495, x, 600));
        g.strokeLineShape(new Phaser.Geom.Line(0, 530, ARENA_WIDTH, 530));

        g.lineStyle(1, 0x44005a, 0.5);
        [[80,510,155,524],[320,505,390,515],[500,508,560,520],[680,512,740,505]].forEach(([x1,y1,x2,y2]) =>
            g.strokeLineShape(new Phaser.Geom.Line(x1,y1,x2,y2)));

        const pillars = [30, 175, 560, 720];
        pillars.forEach(px => {
            g.fillStyle(0x060112, 1); g.fillRect(px - 2, 105, 54, 395);
            g.fillStyle(0x0e0622, 1); g.fillRect(px, 110, 50, 390);
            g.fillStyle(0x1a0c38, 1); g.fillRect(px, 110, 7, 390);
            g.fillStyle(0x1c0d3a, 1);
            g.fillRect(px - 10, 100, 70, 18);
            g.fillRect(px - 10, 492, 70, 12);
            g.fillStyle(0x2a1050, 1); g.fillRect(px - 10, 113, 70, 3);
            g.fillStyle(0x05000e, 1); g.fillRect(px + 18, 160, 14, 55);
            g.fillStyle(0x1a0030, 0.4); g.fillRect(px + 18, 160, 14, 55);
        });

        g.lineStyle(2, 0x1a0833, 0.7);
        [[95,0,105,90],[100,0,88,95],[88,0,82,85]].forEach(([x1,y1,x2,y2]) =>
            g.strokeLineShape(new Phaser.Geom.Line(x1,y1,x2,y2)));
        for (let y = 10; y < 90; y += 12) g.strokeEllipse(100, y, 8, 5);

        g.lineStyle(2, 0x1a0833, 0.7);
        for (let y = 10; y < 80; y += 12) g.strokeEllipse(735, y, 8, 5);

        const orbs = [
            { x: 200, y: 350, r: 120, c: 0x220055, a: 0.18 },
            { x: 620, y: 300, r: 100, c: 0x550011, a: 0.15 },
            { x: 410, y: 150, r: 80,  c: 0x330033, a: 0.12 }
        ];
        orbs.forEach(o => {
            const orb = this.add.circle(o.x, o.y, o.r, o.c, o.a);
            this.tweens.add({ targets: orb, alpha: { from: o.a * 0.5, to: o.a * 1.5 }, duration: 2200 + Math.random() * 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        });

        for (let i = 0; i < 14; i++) {
            const mx = 30 + i * 56;
            const mh = 14 + Math.random() * 18;
            const mist = this.add.rectangle(mx, 504, 44 + Math.random() * 40, mh, 0x3a0020, 0.22 + Math.random() * 0.15);
            this.tweens.add({
                targets: mist,
                x: mx + Phaser.Math.Between(-30, 30),
                scaleX: { from: 0.8, to: 1.4 },
                alpha: { from: 0.1, to: 0.38 },
                duration: 1600 + Math.random() * 1400,
                yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
            });
        }

        for (let i = 0; i < 18; i++) {
            const ex = Phaser.Math.Between(20, ARENA_WIDTH - 20);
            const ey = Phaser.Math.Between(200, 490);
            const ember = this.add.circle(ex, ey, 1.5 + Math.random(), 0xff3300, 0.6 + Math.random() * 0.4);
            this.tweens.add({
                targets: ember,
                y: ey - Phaser.Math.Between(60, 160),
                x: ex + Phaser.Math.Between(-40, 40),
                alpha: { from: 0.8, to: 0 },
                duration: 2000 + Math.random() * 2000,
                delay: Math.random() * 3000,
                repeat: -1,
                repeatDelay: Math.random() * 1500
            });
        }

        [55, 200, 585, 745].forEach(tx => {
            const glow = this.add.circle(tx, 128, 22, 0xff4400, 0.18);
            const flame = this.add.circle(tx, 128, 7, 0xffaa00, 0.9);
            this.tweens.add({ targets: glow,  alpha: { from: 0.08, to: 0.28 }, scaleX: { from: 0.8, to: 1.3 }, duration: 200 + Math.random()*150, yoyo: true, repeat: -1 });
            this.tweens.add({ targets: flame, alpha: { from: 0.6, to: 1 }, scaleY: { from: 0.9, to: 1.3 }, duration: 180 + Math.random()*120, yoyo: true, repeat: -1 });
        });

        g.lineStyle(1, 0x440055, 0.35);
        g.strokeCircle(410, 510, 70);
        g.strokeCircle(410, 510, 50);
        const pts = 5;
        const angles = Array.from({ length: pts }, (_, i) => (i * 2 * Math.PI / pts) - Math.PI / 2);
        const rr = 65;
        angles.forEach((a, i) => {
            const nx = angles[(i + 2) % pts];
            g.strokeLineShape(new Phaser.Geom.Line(
                410 + Math.cos(a) * rr, 510 + Math.sin(a) * rr * 0.4,
                410 + Math.cos(nx) * rr, 510 + Math.sin(nx) * rr * 0.4
            ));
        });

        const sigilGlow = this.add.circle(410, 510, 72, 0x660033, 0);
        this.tweens.add({ targets: sigilGlow, alpha: { from: 0, to: 0.12 }, duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    createSprites() {
        this.playerX  = 180;
        this.playerGY = GROUND_Y;

        this.player = this.add.sprite(this.playerX, this.playerGY, 'player_idle')
            .setScale(1.9)
            .setOrigin(0.5, 1);
        this.player.play('p-idle');

        this.player.on('animationcomplete', (anim) => {
            if (this.gameOver || this._isDestroyed) return;
            if (!this.isPlayerTurn || this.turnEnding) return;
            const loops = ['p-idle', 'p-run', 'p-mid-air'];
            const attackAnims = ['p-attack1', 'p-attack3', 'p-dash-atk', 'p-special', 'p-up-atk', 'p-jup-atk', 'p-jdown-atk'];
            if (attackAnims.includes(anim.key)) {
                if (this._activeAttackTimer) {
                    this._activeAttackTimer.destroy();
                    this._activeAttackTimer = null;
                }
                this.atkCooldown = false;
            }
            if (!loops.includes(anim.key)) {
                if (this.isJumping && this.player.active) {
                    this.player.play('p-mid-air', true);
                } else if (this.player.active) {
                    this.player.play('p-idle', true);
                }
            }
        });

        this.wraithGY   = GROUND_Y - 35;
        this.wraithAura = this.add.circle(680, this.wraithGY - 30, 70, 0xff0011, 0.1);

        this.wraith = this.add.sprite(680, this.wraithGY, 'wraith_idle')
            .setScale(2.1)
            .setFlipX(true)
            .setOrigin(0.5, 1);
        this.wraith.play('w-idle');

        this.floatTween = this.tweens.add({
            targets:  [this.wraith, this.wraithAura],
            y:        '-=16',
            duration: 1900,
            yoyo:     true,
            repeat:   -1,
            ease:     'Sine.easeInOut'
        });

        this.wraith.on('animationcomplete', (anim) => {
            if (this.gameOver || this._isDestroyed) return;
            if (this.wraithActing) return;
            const loops = ['w-idle', 'w-walk', 'w-run', 'w-jump-loop'];
            if (!loops.includes(anim.key) && anim.key !== 'w-death' && this.wraith.active) {
                this.wraith.play('w-idle', true);
            }
        });
    }

    createHUD() {
        this.add.rectangle(14, 22, 380, 16, 0x1a0000).setOrigin(0, 0.5);
        this.add.rectangle(438, 22, 360, 16, 0x00001a).setOrigin(0, 0.5);

        this.pHPBar = this.add.rectangle(14,  22, 380, 16, 0x2266ff).setOrigin(0, 0.5);
        this.bHPBar = this.add.rectangle(438, 22, 360, 16, 0xff2233).setOrigin(0, 0.5);

        const b = this.add.graphics();
        b.lineStyle(1, 0x334455, 0.5); b.strokeRect(14,  14, 380, 16);
        b.lineStyle(1, 0x553344, 0.5); b.strokeRect(438, 14, 360, 16);

        this.add.text(14,  6, 'HUNTER', { fontFamily:'monospace', fontSize:'10px', color:'#3399ff' });
        this.add.text(794, 6, 'WRAITH', { fontFamily:'monospace', fontSize:'10px', color:'#ff2233' }).setOrigin(1,0);

        this.roundTxt  = this.add.text(410, 6, 'ROUND 1', { fontFamily:'monospace', fontSize:'12px', color:'#e8e0ff' }).setOrigin(0.5,0);
        this.timerTxt  = this.add.text(410, 44, '6', { fontFamily:'monospace', fontSize:'30px', color:'#ff2233', stroke:'#000',strokeThickness:3 }).setOrigin(0.5);
        this.pHPTxt    = this.add.text(14,  30, '100/100', { fontFamily:'monospace', fontSize:'9px', color:'#7799cc' });
        this.bHPTxt    = this.add.text(794, 30, '220/220', { fontFamily:'monospace', fontSize:'9px', color:'#cc7788' }).setOrigin(1,0);
        this.turnBadge = this.add.text(410, 66, '▶ YOUR TURN — MAKE YOUR MOVE', { fontFamily:'monospace', fontSize:'11px', color:'#3399ff', stroke:'#000', strokeThickness:2 }).setOrigin(0.5);
    }

    createSidebar() {
        const sx = 830;
        const lc = '#882233';
        const vc = '#e8e0ff';

        this.add.text(sx, 14, '⬡ WRAITH INTELLIGENCE', { fontFamily:'monospace', fontSize:'12px', color:'#ff2233' });
        this.add.text(sx, 30, '"Studying you since round 1."',  { fontFamily:'monospace', fontSize:'10px', color:'#550011', fontStyle:'italic' });
        this.add.rectangle(960, 48, 264, 1, 0x330011);

        this.add.text(sx, 54, 'DODGE BIAS', { fontFamily:'monospace', fontSize:'10px', color: lc });
        this.add.rectangle(sx, 72, 180, 9, 0x150006).setOrigin(0, 0.5);
        this.lBiasBar = this.add.rectangle(sx, 72, 1, 9, 0xff2233).setOrigin(0, 0.5);
        this.lBiasLbl = this.add.text(sx+185, 67, 'LEFT  0%',  { fontFamily:'monospace', fontSize:'9px', color:'#ff6677' });

        this.add.rectangle(sx, 86, 180, 9, 0x150006).setOrigin(0, 0.5);
        this.rBiasBar = this.add.rectangle(sx, 86, 1, 9, 0xff6600).setOrigin(0, 0.5);
        this.rBiasLbl = this.add.text(sx+185, 81, 'RIGHT 0%', { fontFamily:'monospace', fontSize:'9px', color:'#ff8844' });

        this.add.text(sx, 100, 'PANIC STATE', { fontFamily:'monospace', fontSize:'9px', color: lc });
        this.panicTxt = this.add.text(sx+96, 100, '[ STABLE ]', { fontFamily:'monospace', fontSize:'9px', color:'#33cc66' });

        this.add.text(sx, 113, 'ROUNDS:', { fontFamily:'monospace', fontSize:'9px', color: lc });
        this.roundObsTxt = this.add.text(sx+64, 113, '0', { fontFamily:'monospace', fontSize:'9px', color: vc });

        this.add.text(sx, 126, 'DOMINANT:', { fontFamily:'monospace', fontSize:'9px', color: lc });
        this.domTxt = this.add.text(sx+76, 126, 'MIXED', { fontFamily:'monospace', fontSize:'9px', color: vc });

        this.add.rectangle(960, 140, 264, 1, 0x330011);

        this.add.text(sx, 146, 'WRAITH ANALYSIS:', { fontFamily:'monospace', fontSize:'10px', color: lc });
        this.analysisTxt = this.add.text(sx, 162, 'Initializing behavioral profile...', {
            fontFamily:'monospace', fontSize:'10px', color:'#cc3333',
            wordWrap: { width: 255 }, lineSpacing: 4
        });

        this.add.rectangle(960, 370, 264, 1, 0x330011);
        this.atkLblBg  = this.add.rectangle(960, 392, 264, 28, 0x0d0005).setAlpha(0);
        this.atkLblTxt = this.add.text(960, 392, '', { fontFamily:'monospace', fontSize:'12px', color:'#ff2233', align:'center' }).setOrigin(0.5).setAlpha(0);

        this.ptrnBg  = this.add.rectangle(960, 425, 264, 28, 0x330000).setAlpha(0);
        this.ptrnTxt = this.add.text(960, 425, '⚡ PATTERN LOCKED', { fontFamily:'monospace', fontSize:'13px', color:'#ff2233' }).setOrigin(0.5).setAlpha(0);

        this.add.rectangle(960, 460, 264, 1, 0x330011);
        this.add.text(sx, 466, 'CONTROLS', { fontFamily:'monospace', fontSize:'10px', color: lc });

        const controls = [
            ['← →',     'Move / Run'],
            ['SPACE',    'Jump'],
            ['Z',        'Basic Attack'],
            ['X',        'Heavy Attack'],
            ['C',        'Dash'],
            ['V',        'Dash Attack'],
            ['A',        'Special Dash'],
            ['↑ + Z',    'Up Attack'],
            ['Z (air↑)', 'Jump Up Atk'],
            ['Z (air↓)', 'Jump Down Atk'],
        ];

        controls.forEach(([key, desc], i) => {
            const y = 480 + i * 12;
            this.add.text(sx,      y, key,  { fontFamily:'monospace', fontSize:'9px', color:'#ff9900' });
            this.add.text(sx + 72, y, desc, { fontFamily:'monospace', fontSize:'9px', color:'#886688' });
        });

        for (let y = 0; y < 600; y += 4)
            this.add.rectangle(960, y, 264, 1, 0x000000, 0.12);
    }

    createControls() {
        this.cur  = this.input.keyboard.createCursorKeys();
        this.kZ   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.kX   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.kC   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
        this.kV   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.V);
        this.kA   = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A);
        this.kUp  = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.UP);
    }

    tickTimer() {
        if (this.gameOver || this._isDestroyed || !this.isPlayerTurn || this.turnEnding) return;
        this.turnSecs--;
        this.timerTxt.setText(this.turnSecs <= 0 ? '' : this.turnSecs.toString());
        if (this.turnSecs === 1) this.timerTxt.setColor('#ff4400');
        if (this.turnSecs <= 0) this.endPlayerTurn();
    }

    endPlayerTurn() {
        if (this.turnEnding || this.gameOver || this._isDestroyed) return;
        this.turnEnding   = true;
        this.isPlayerTurn = false;

        this._clearAllPending();
        this._resetPlayerActionState();

        this.timerTxt.setText('');
        this.turnBadge.setText('⚠ WRAITH IS CALCULATING...').setColor('#ff2233');
        if (this.player && this.player.active) {
            this.player.setY(this.playerGY);
            this.player.play('p-idle', true);
        }
        this.callAPI();
    }

    async callAPI() {
        if (this.gameOver || this._isDestroyed) return;
        
        const controller = new AbortController();
        const callRound = this.round;
        const timeout = setTimeout(() => controller.abort(), 8000);

        try {
            const moves = this.moveBuf.slice(-5);
            if (!moves.length) moves.push('WAIT');
            const res = await fetch(WRAITH_API_URL + '/step', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ action: {
                    player_moves: moves,
                    round_number: this.round,
                    player_hp:    this.playerHP,
                    boss_hp:      this.bossHP
                }}),
                signal: controller.signal
            });
            clearTimeout(timeout);
            if (this.gameOver || this._isDestroyed || this.round !== callRound) return;
            if (!res.ok) throw new Error('HTTP ' + res.status);
            this.onAPIResponse(await res.json());
        } catch (e) {
            clearTimeout(timeout);
            if (!this.gameOver && !this._isDestroyed && this.round === callRound) {
                this.onAPIResponse({
                    attack:    'WAIT',
                    reasoning: 'Connection unstable. WRAITH is still watching.',
                    hit:       false,
                    profile:   {}
                });
            }
        }
    }

    onAPIResponse(data) {
        if (this.gameOver || this._isDestroyed) return;

        const TAUNTS = {
            3:  "You hesitate before every dodge. You always did. Even in the lab. Old habits don't die, Doctor. They become data.",
            6:  "Team Lira. Team Rohan. Team Senna. I remember all of them. Their patterns too. They live inside me now. In a way.",
            10: "Do you know why I didn't destroy you that night? Because you were the most interesting subject. I've been waiting for you.",
            15: "There it is. The same pattern. The same fear response. You built me to find exactly this. I know you. Better than you know yourself."
        };

        const isTaunt = !!TAUNTS[this.round];
        const text    = isTaunt ? TAUNTS[this.round] : (data.reasoning || 'Processing...');
        const prof    = data.profile || {};
        const lb      = Math.round(prof.left_bias  ?? 50);
        const rb      = Math.round(prof.right_bias ?? 50);

        if (this.lBiasBar) this.lBiasBar.setSize(lb * 1.8, 9);
        if (this.rBiasBar) this.rBiasBar.setSize(rb * 1.8, 9);
        if (this.lBiasLbl) this.lBiasLbl.setText('LEFT  ' + lb + '%');
        if (this.rBiasLbl) this.rBiasLbl.setText('RIGHT ' + rb + '%');

        const panic = !!prof.is_panicking;
        if (this.panicTxt) {
            this.panicTxt.setText(panic ? '[ ACTIVE ]' : '[ STABLE ]').setColor(panic ? '#ff2233' : '#33cc66');
        }
        if (this.roundObsTxt) this.roundObsTxt.setText(String(this.round));
        if (this.domTxt) this.domTxt.setText(prof.dominant_dodge || 'MIXED');

        if (lb > 80 || rb > 80) {
            if (this.ptrnBg) this.ptrnBg.setAlpha(1);
            if (this.ptrnTxt) this.ptrnTxt.setAlpha(1);
            if (this.ptrnTxt && this.ptrnBg) {
                this.tweens.add({ targets:[this.ptrnTxt,this.ptrnBg], alpha:{from:0.1,to:1}, duration:330, yoyo:true, repeat:7 });
            }
        } else {
            if (this.ptrnBg) this.ptrnBg.setAlpha(0);
            if (this.ptrnTxt) this.ptrnTxt.setAlpha(0);
        }

        const attack = data.attack || 'WAIT';
        if (this.atkLblTxt) this.atkLblTxt.setText('► ' + attack);
        if (this.atkLblBg) this.atkLblBg.setAlpha(1);
        if (this.atkLblTxt) this.atkLblTxt.setAlpha(1);
        if (this.analysisTxt) {
            this.analysisTxt.setColor(isTaunt ? '#cc3333' : '#ff5566');
            this.typewriter(this.analysisTxt, text, 26);
        }

        // FIXED: this.time.delayedCall directly — immune to _clearAllPending
        this.time.delayedCall(950, () => {
            if (!this.gameOver && !this._isDestroyed) this.doWraithAttack(attack, data.hit === true);
        });
    }

    doWraithAttack(type, hit) {
        if (this.gameOver || this._isDestroyed) return;
        this.wraithActing = true;
        if (this.floatTween) this.floatTween.pause();

        switch (type) {
            case 'SWEEP_LEFT':
                if (this.wraith && this.wraith.active) this.wraith.play('w-attack1', true);
                this.fxSweepLeft(hit);
                break;
            case 'FEINT_RIGHT':
                if (this.wraith && this.wraith.active) this.wraith.play('w-attack2', true);
                this.fxFeint(hit);
                break;
            case 'OVERHEAD':
                if (this.wraith && this.wraith.active) this.wraith.play('w-attack1', true);
                this.fxOverhead(hit);
                break;
            default:
                this.fxWait();
                break;
        }

        if (hit && type !== 'WAIT') {
            // FIXED: use this.time.delayedCall directly — immune to _clearAllPending
            this.time.delayedCall(480, () => {
                if (this.gameOver || this._isDestroyed) return;
                const dodged = (this.time.now - this.lastDodgeT) < 500;
                const dmg    = dodged ? 3 : 15;
                this.playerHP = Math.max(0, this.playerHP - dmg);
                this.updateBars();
                if (this.player && this.player.active) this.player.play('p-hit', true);
                this.cameras.main.shake(160, 0.009);
                if (dodged) this.floatText(this.player.x, this.player.y - 60, 'DODGED!', '#3399ff');
                else        this.floatText(this.player.x, this.player.y - 60, '-' + dmg, '#ff4444');

                if (this.playerHP <= 0) {
                    if (this.player && this.player.active) this.player.play('p-death', true);
                    this.gameOver     = true;
                    this.isPlayerTurn = false;
                    this.turnEnding   = true;
                    this.wraithActing = false;
                    this._clearAllPending();
                    if (this.timerEv) { this.timerEv.destroy(); this.timerEv = null; }
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

        // FIXED: use this.time.delayedCall directly — immune to _clearAllPending
        this.time.delayedCall(1450, () => {
            if (this.gameOver || this._isDestroyed) return;
            this.wraithActing = false;
            if (this.floatTween) this.floatTween.resume();
            if (this.wraith && this.wraith.active) this.wraith.play('w-idle', true);
            this.startNextRound();
        });
    }

    fxSweepLeft(hit) {
        const wave = this.add.rectangle(720, 490, 20, 44, 0xff2233, 0.9);
        const glow = this.add.rectangle(720, 490, 38, 58, 0x440000, 0.5);
        this.tweens.add({ targets:[wave,glow], x:20, scaleX:{from:1,to:2.8}, alpha:{from:0.9,to:0.1}, duration:480, ease:'Quad.easeIn', onComplete:()=>{ wave.destroy(); glow.destroy(); }});
        if (hit) this._delay(300, () => {
            if (this.gameOver || this._isDestroyed) return;
            const f = this.add.rectangle(this.player.x, 460, 80, 80, 0xff0000, 0.55);
            this.tweens.add({ targets:f, alpha:0, duration:220, onComplete:()=>f.destroy() });
        });
    }

    fxFeint(hit) {
        const ox = this.wraith.x;
        this.tweens.add({ targets:this.wraith, x: ox - 120, duration:120, ease:'Power3', yoyo:true,
            onYoyo: () => {
                if (this.gameOver || this._isDestroyed) return;
                if (hit) {
                    const b = this.add.circle(ox - 80, 460, 28, 0xff2233, 0.7);
                    this.tweens.add({ targets:b, scaleX:3.5, scaleY:3.5, alpha:0, duration:280, onComplete:()=>b.destroy() });
                }
            },
            onComplete: () => {
                if (!this.gameOver && !this._isDestroyed && this.wraith) this.wraith.setX(ox);
            }
        });
    }

    fxOverhead(hit) {
        this.tweens.add({ targets:this.wraith, scaleY:2.5, duration:260, ease:'Back.easeIn', onComplete:()=>{
            if (this.gameOver || this._isDestroyed) return;
            this.tweens.add({ targets:this.wraith, scaleY:2.1, duration:180 });
            const sw = this.add.circle(410, 504, 10, 0xff2233, 0.85);
            const so = this.add.circle(410, 504, 10, 0x880011, 0.4);
            this.tweens.add({ targets:[sw,so], scaleX:28, scaleY:4, alpha:0, duration:580, onComplete:()=>{ sw.destroy(); so.destroy(); }});
            this.cameras.main.shake(240, 0.014);
        }});
    }

    fxWait() {
        this.tweens.add({ targets:this.wraithAura, alpha:{from:0.1,to:0.5}, scaleX:{from:1,to:1.7}, scaleY:{from:1,to:1.7}, duration:580, yoyo:true, repeat:1 });
        this.floatText(this.wraith.x, this.wraith.y - 80, 'OBSERVING...', '#880022');
    }

    performAttack(attackName, moveName, damage, color, cooldownMs, animName) {
        if (this.atkCooldown) return false;
        if (!this.isPlayerTurn || this.turnEnding || this.gameOver) return false;
        
        this.atkCooldown = true;
        this.recordMove(moveName);
        
        this.player.play(animName, true);
        this.dealDamage(damage, color);
        
        if (this._activeAttackTimer) {
            this._activeAttackTimer.destroy();
        }
        this._activeAttackTimer = this.time.delayedCall(cooldownMs, () => {
            if (!this.gameOver && !this._isDestroyed && this.atkCooldown) {
                this.atkCooldown = false;
                this._activeAttackTimer = null;
            }
        });
        
        return true;
    }

    update() {
        if (this.gameOver || this._isDestroyed || !this.isPlayerTurn || this.turnEnding) return;

        const JD = Phaser.Input.Keyboard.JustDown;
        const moving = this.cur.left.isDown || this.cur.right.isDown;

        if (JD(this.cur.left)) {
            this.recordMove('MOVE_LEFT');
            this.player.setFlipX(true);
            if (!this.isJumping) this.player.play('p-run', true);
            this.tweens.add({ targets:this.player, x: Math.max(60, this.player.x - 70), duration:110 });
            this._delay(220, () => {
                if (!this.isJumping && !this.gameOver && !this._isDestroyed && !moving && this.isPlayerTurn && this.player && this.player.active) {
                    this.player.setFlipX(false);
                    this.player.play('p-idle', true);
                }
            });
        }
        if (JD(this.cur.right)) {
            this.recordMove('MOVE_RIGHT');
            this.player.setFlipX(false);
            if (!this.isJumping) this.player.play('p-run', true);
            this.tweens.add({ targets:this.player, x: Math.min(760, this.player.x + 70), duration:110 });
            this._delay(220, () => {
                if (!this.isJumping && !this.gameOver && !this._isDestroyed && !moving && this.isPlayerTurn && this.player && this.player.active) {
                    this.player.play('p-idle', true);
                }
            });
        }

        if (JD(this.cur.space) && !this.isJumping && !this.atkCooldown) {
            this.recordMove('JUMP');
            this.isJumping = true;
            this.isFalling = false;
            this.player.play('p-jump', true);
            this.tweens.add({
                targets:  this.player,
                y:        this.playerGY - 160,
                duration: 360,
                ease:     'Power2.easeOut',
                onComplete: () => {
                    if (this.gameOver || this._isDestroyed || !this.isPlayerTurn) {
                        this.isJumping = false;
                        this.isFalling = false;
                        return;
                    }
                    this.isFalling = true;
                    this.player.play('p-fall', true);
                    this.tweens.add({
                        targets:  this.player,
                        y:        this.playerGY,
                        duration: 380,
                        ease:     'Power2.easeIn',
                        onComplete: () => {
                            this.isJumping = false;
                            this.isFalling = false;
                            if (!this.gameOver && !this._isDestroyed && this.isPlayerTurn && this.player && this.player.active) {
                                this.player.play('p-idle', true);
                            }
                        }
                    });
                }
            });
        }

        if (JD(this.kZ) && !this.atkCooldown) {
            if (this.isJumping && !this.isFalling) {
                this.performAttack('JUMP_UP_ATTACK', 'JUMP_UP_ATTACK', 10, '#3399ff', 350, 'p-jup-atk');
            } else if (this.isJumping && this.isFalling) {
                this.performAttack('JUMP_DOWN_ATTACK', 'JUMP_DOWN_ATTACK', 10, '#3399ff', 350, 'p-jdown-atk');
            } else if (this.cur.up.isDown) {
                this.performAttack('UP_ATTACK', 'UP_ATTACK', 10, '#3399ff', 350, 'p-up-atk');
            } else {
                this.performAttack('ATTACK', 'ATTACK', 10, '#3399ff', 350, 'p-attack1');
            }
        }

        if (JD(this.kX) && !this.atkCooldown) {
            this.performAttack('HEAVY_ATTACK', 'HEAVY_ATTACK', 18, '#6633ff', 550, 'p-attack3');
        }

        if (JD(this.kC)) {
            this.recordMove('DODGE_RIGHT');
            this.lastDodgeT = this.time.now;
            this.player.play('p-dash', true);
            const dir = this.player.flipX ? -1 : 1;
            this.tweens.add({ targets:this.player, x: Phaser.Math.Clamp(this.player.x + dir * 110, 60, 760), duration:80 });
        }

        if (JD(this.kV) && !this.atkCooldown) {
            this.performAttack('DASH_ATTACK', 'DASH_ATTACK', 14, '#ff9900', 450, 'p-dash-atk');
            this.tweens.add({ targets:this.player, x: Math.min(760, this.player.x + 90), duration:70 });
        }

        if (JD(this.kA) && !this.atkCooldown) {
            this.performAttack('SPECIAL_DASH', 'SPECIAL_DASH', 8, '#aa00ff', 450, 'p-special');
            this.lastDodgeT = this.time.now;
            const dir2 = this.player.flipX ? -1 : 1;
            this.tweens.add({ targets:this.player, x: Phaser.Math.Clamp(this.player.x + dir2 * 150, 60, 760), duration:100 });
            const trail = this.add.rectangle(this.player.x, this.player.y - 64, 12, 60, 0xaa00ff, 0.5);
            this.tweens.add({ targets:trail, alpha:0, scaleX:3, duration:400, onComplete:()=>trail.destroy() });
        }
    }

    dealDamage(amount, color) {
        if (this.gameOver || this._isDestroyed) return;
        this.bossHP = Math.max(0, this.bossHP - amount);
        this.updateBars();

        if (!this.wraithActing && this.wraith && this.wraith.active) {
            this.wraith.play('w-hit', true);
        }

        this.floatText(this.wraith.x, this.wraith.y - 80, '-' + amount, color);

        const flash = this.add.rectangle(this.wraith.x, this.wraith.y - 50, 55, 75, 0x3399ff, 0.3);
        this.tweens.add({ targets:flash, alpha:0, duration:200, onComplete:()=>flash.destroy() });

        if (this.bossHP <= 0) {
            this.gameOver     = true;
            this.isPlayerTurn = false;
            this.turnEnding   = true;
            this.wraithActing = false;
            this._clearAllPending();
            if (this._activeAttackTimer) {
                this._activeAttackTimer.destroy();
                this._activeAttackTimer = null;
            }
            this.atkCooldown = false;
            if (this.timerEv) { this.timerEv.destroy(); this.timerEv = null; }
            if (this.wraith && this.wraith.active) this.wraith.play('w-death');
            this.time.delayedCall(1300, () => this.endGame(true));
        }
    }

    startNextRound() {
        if (this.gameOver || this._isDestroyed) return;
        this.round++;
        this.roundTxt.setText('ROUND ' + this.round);
        this.turnSecs     = 6;
        this.isPlayerTurn = true;
        this.turnEnding   = false;
        this.wraithActing = false;
        this._resetPlayerActionState();
        this.moveBuf      = [];
        if (this.player && this.player.active) this.player.setY(this.playerGY);
        this.timerTxt.setText('6').setColor('#ff2233');
        this.turnBadge.setText('▶ YOUR TURN — MAKE YOUR MOVE').setColor('#3399ff');
        if (this.atkLblBg) this.atkLblBg.setAlpha(0);
        if (this.atkLblTxt) this.atkLblTxt.setAlpha(0);
        this.showRoundBanner(this.round);
    }

    showRoundBanner(n) {
        const txt = this.add.text(410, 295, 'ROUND ' + n, {
            fontFamily:'monospace', fontSize:'44px', color:'#ff2233',
            stroke:'#000', strokeThickness:5
        }).setOrigin(0.5).setAlpha(0);
        this.tweens.add({ targets:txt, alpha:1, duration:200, onComplete:() => {
            this.tweens.add({ targets:txt, alpha:0, scaleX:1.4, scaleY:1.4, duration:700, delay:600, onComplete:()=>txt.destroy() });
        }});
    }

    recordMove(m) { this.moveBuf.push(m); if (this.moveBuf.length > 20) this.moveBuf.shift(); }

    updateBars() {
        if (this.pHPBar) this.pHPBar.setSize(380 * (this.playerHP / 100), 16);
        if (this.bHPBar) this.bHPBar.setSize(360 * (this.bossHP  / 220), 16);
        if (this.pHPTxt) this.pHPTxt.setText(this.playerHP + '/100');
        if (this.bHPTxt) this.bHPTxt.setText(this.bossHP   + '/220');
    }

    floatText(x, y, msg, color) {
        const t = this.add.text(x, y, msg, { fontFamily:'monospace', fontSize:'18px', color, stroke:'#000', strokeThickness:3 }).setOrigin(0.5);
        this.tweens.add({ targets:t, y: y - 45, alpha:0, duration:750, ease:'Power2', onComplete:()=>t.destroy() });
    }

    typewriter(obj, full, speed) {
        let i = 0; obj.setText('');
        if (this._tw) this._tw.destroy();
        this._tw = this.time.addEvent({ delay:speed, loop:true, callback:() => {
            i++; obj.setText(full.substring(0, i));
            if (i >= full.length) this._tw.destroy();
        }});
    }

    endGame(won) {
        if (this._isDestroyed) return;
        if (this.gameOver && won !== undefined) {
            // Already marked gameOver
        } else {
            if (this.gameOver) return;
            this.gameOver     = true;
            this.isPlayerTurn = false;
            this.turnEnding   = true;
            this._clearAllPending();
            if (this._activeAttackTimer) {
                this._activeAttackTimer.destroy();
                this._activeAttackTimer = null;
            }
            this.atkCooldown = false;
            if (this.timerEv) { this.timerEv.destroy(); this.timerEv = null; }
        }
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
            { lines:["Impossible.","You changed your pattern.","I had every variable accounted for—"], color:'#ff2233', flicker:true },
            { lines:["I know. I built you.","You can only learn what people show you.","I showed you what I wanted you to see."], color:'#3399ff' },
            { lines:["...Clever.","You were always...","...clever..."], color:'#ff2233' },
            { lines:["THE HUNT NEVER ENDS."], color:'#ffffff', size:40, final:true }
        ] : [
            { lines:["Don't be ashamed, Doctor.","You gave me everything I needed to beat you."], color:'#ff2233' },
            { lines:["You taught me that the best way to defeat someone—","is to understand them completely."], color:'#ff2233' },
            { lines:["You built a perfect predator.","You just forgot—","You were always going to be its first prey."], color:'#ff2233' },
            { lines:["PROFILE COMPLETE.","SUBJECT: DR. ARYAN VOSS","RESULT: ARCHIVED."], color:'#ff2233', size:26, final:true, cut:true }
        ];

        this.show(0);
        this.input.keyboard.on('keydown-SPACE', () => { if (this.ready) this.next(); });
        this.input.on('pointerdown',            () => { if (this.ready) this.next(); });
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
                fontFamily:'monospace', fontSize:(s.size||22)+'px',
                color:s.color, align:'center', stroke:'#000', strokeThickness:3
            }).setOrigin(0.5).setAlpha(0);
            const delay = s.cut ? 0 : j * 500;
            this.tweens.add({ targets:t, alpha:1, duration: s.cut?0:680, delay });
            if (s.flicker) this.time.delayedCall(delay+900, () => {
                this.tweens.add({ targets:t, alpha:{from:0.2,to:1}, duration:110, yoyo:true, repeat:3 });
            });
            this.objs.push(t);
        });

        const readyAt = s.cut ? 150 : 1200 + n * 500;
        this.time.delayedCall(readyAt, () => {
            this.ready = true;
            if (!s.final) {
                const h = this.add.text(550, 530, '— SPACE TO CONTINUE —', { fontFamily:'monospace', fontSize:'11px', color:'#332233' }).setOrigin(0.5);
                this.objs.push(h);
            } else {
                this.time.delayedCall(700, () => {
                    const r = this.add.text(550, 515, '[ PRESS SPACE TO PLAY AGAIN ]', { fontFamily:'monospace', fontSize:'14px', color:'#554455' }).setOrigin(0.5).setAlpha(0);
                    this.objs.push(r);
                    this.tweens.add({ targets:r, alpha:{from:0,to:0.9}, duration:600, yoyo:true, repeat:-1 });
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
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
});