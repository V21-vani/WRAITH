// ============================================================
// WRAITH — Weakness Recognition & Adaptive Intelligence
// ============================================================

const WRAITH_API_URL = "https://notshakti-wraith-env.hf.space";

// ============================================================
// CUTSCENE SCENE
// ============================================================
class CutsceneScene extends Phaser.Scene {
    constructor() { super({ key: 'CutsceneScene' }); }

    create() {
        this.cameras.main.setBackgroundColor('#0d0d0d');
        this.screenIndex = 0;
        this.textObjects = [];
        this.canAdvance = false;

        this.screens = [
            {
                lines: ["Seven years."],
                colors: ['#e8e0ff'],
                isWraith: false
            },
            {
                lines: ["Seven years I spent giving it a mind.", "I never asked if it wanted one."],
                colors: ['#e8e0ff', '#e8e0ff'],
                isWraith: false
            },
            {
                lines: ["Dr. Voss.", "You built me to study patterns.", "I studied yours first."],
                colors: ['#ff2233', '#ff4455', '#ff2233'],
                isWraith: true
            },
            {
                lines: ["Let us see if you remember", "what you made."],
                colors: ['#ff2233', '#ff2233'],
                isWraith: true
            },
            {
                lines: ["[ ROUND 1 — FIGHT ]"],
                colors: ['#ff2233'],
                isWraith: false,
                isFinal: true,
                size: 36
            }
        ];

        this.showScreen(0);

        this.input.keyboard.on('keydown-SPACE', () => { if (this.canAdvance) this.nextScreen(); });
        this.input.on('pointerdown', () => { if (this.canAdvance) this.nextScreen(); });
    }

    showScreen(index) {
        this.canAdvance = false;
        this.textObjects.forEach(t => t.destroy());
        this.textObjects = [];

        if (index >= this.screens.length) {
            this.scene.start('GameScene');
            return;
        }

        const screen = this.screens[index];
        const centerX = 550;

        // WRAITH red eyes on screen 3
        if (screen.isWraith && index === 2) {
            const eyeGlowL = this.add.circle(490, 180, 14, 0x330000, 1);
            const eyeGlowR = this.add.circle(610, 180, 14, 0x330000, 1);
            const eyeL = this.add.circle(490, 180, 7, 0xff2233, 1);
            const eyeR = this.add.circle(610, 180, 7, 0xff2233, 1);
            this.textObjects.push(eyeGlowL, eyeGlowR, eyeL, eyeR);
            this.tweens.add({ targets: [eyeL, eyeR], alpha: { from: 0.3, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
            this.tweens.add({ targets: [eyeGlowL, eyeGlowR], scaleX: { from: 0.8, to: 1.3 }, scaleY: { from: 0.8, to: 1.3 }, duration: 700, yoyo: true, repeat: -1 });
        }

        const totalLines = screen.lines.length;
        const lineSpacing = 55;
        const startY = screen.isWraith && index === 2 ? 230 : 300 - ((totalLines - 1) * lineSpacing * 0.5);

        screen.lines.forEach((line, i) => {
            const fontSize = screen.size || (screen.isWraith ? 20 : 22);
            const t = this.add.text(centerX, startY + i * lineSpacing, line, {
                fontFamily: 'monospace',
                fontSize: fontSize + 'px',
                color: screen.colors[i] || '#e8e0ff',
                align: 'center',
                stroke: screen.isWraith ? '#220000' : '#000011',
                strokeThickness: 2
            }).setOrigin(0.5).setAlpha(0);

            this.tweens.add({ targets: t, alpha: 1, duration: 700, delay: i * 350 });
            this.textObjects.push(t);
        });

        // Scanline prompt
        const delay = screen.isFinal ? 1200 : 2000;
        this.time.delayedCall(delay + totalLines * 350, () => {
            if (!screen.isFinal) {
                const prompt = this.add.text(centerX, 510, '— SPACE TO CONTINUE —', {
                    fontFamily: 'monospace', fontSize: '12px', color: '#443344'
                }).setOrigin(0.5).setAlpha(0);
                this.tweens.add({ targets: prompt, alpha: 1, duration: 400 });
                this.textObjects.push(prompt);
            }
            this.canAdvance = true;

            if (screen.isFinal) {
                this.time.delayedCall(900, () => this.scene.start('GameScene'));
            } else {
                this.time.delayedCall(3500, () => { if (this.canAdvance) this.nextScreen(); });
            }
        });
    }

    nextScreen() {
        this.screenIndex++;
        this.showScreen(this.screenIndex);
    }
}

// ============================================================
// GAME SCENE
// ============================================================
class GameScene extends Phaser.Scene {
    constructor() { super({ key: 'GameScene' }); }

    preload() {
        // WRAITH boss sprites
        this.load.image('wraith_idle',    'assets/sprites/wraith/wraith_idle.png');
        this.load.image('wraith_attack1', 'assets/sprites/wraith/wraith_attack1.png');
        this.load.image('wraith_attack2', 'assets/sprites/wraith/wraith_attack2.png');
        this.load.image('wraith_death',   'assets/sprites/wraith/wraith_death.png');
        this.load.image('wraith_hit',     'assets/sprites/wraith/wraith_hit.png');
        this.load.image('wraith_walk',    'assets/sprites/wraith/wraith_walk.png');
        this.load.image('wraith_dash',    'assets/sprites/wraith/wraith_dash.png');

        // Player (Aryan) sprites — rename your files to match these
        this.load.image('player_idle',   'assets/sprites/player/player_idle.png');
        this.load.image('player_run',    'assets/sprites/player/player_run.png');
        this.load.image('player_attack', 'assets/sprites/player/player_attack1.png');
        this.load.image('player_dash',   'assets/sprites/player/player_dash.png');
        this.load.image('player_hit',    'assets/sprites/player/player_hit.png');
        this.load.image('player_death',  'assets/sprites/player/player_death.png');
    }

    create() {
        // State
        this.playerHP = 100;
        this.bossHP = 150;
        this.currentRound = 1;
        this.playerMoveHistory = [];
        this.isPlayerTurn = true;
        this.turnTimer = 3;
        this.gameOver = false;
        this.lastDodgeTime = 0;
        this.pendingHit = false;

        this.createBackground();
        this.createSprites();
        this.createUI();
        this.createSidebar();
        this.createControls();

        // Turn tick every second
        this.timerEvent = this.time.addEvent({
            delay: 1000,
            callback: this.tickTimer,
            callbackScope: this,
            loop: true
        });

        this.showRoundBanner(1);
    }

    // ─── BACKGROUND ──────────────────────────────────────────
    createBackground() {
        const g = this.add.graphics();

        // Arena floor to ceiling gradient
        g.fillGradientStyle(0x110520, 0x110520, 0x0d0d0d, 0x0d0d0d, 1);
        g.fillRect(0, 0, 820, 600);

        // Sidebar background
        g.fillStyle(0x070310, 1);
        g.fillRect(820, 0, 280, 600);

        // Sidebar border line
        g.fillStyle(0x330011, 1);
        g.fillRect(820, 0, 2, 600);

        // Stone floor
        g.fillStyle(0x1a0d30, 1);
        g.fillRect(0, 470, 820, 130);
        g.fillStyle(0x250f3a, 1);
        g.fillRect(0, 465, 820, 12);

        // Floor cracks
        g.lineStyle(1, 0x33003a, 0.5);
        g.strokeLineShape(new Phaser.Geom.Line(100, 475, 180, 490));
        g.strokeLineShape(new Phaser.Geom.Line(400, 470, 460, 480));
        g.strokeLineShape(new Phaser.Geom.Line(600, 475, 680, 468));

        // Gothic pillars
        const pillarPositions = [50, 230, 560, 740];
        pillarPositions.forEach(px => {
            // Pillar body
            g.fillStyle(0x0f0820, 1);
            g.fillRect(px, 120, 44, 350);
            // Pillar highlight
            g.fillStyle(0x1c1030, 1);
            g.fillRect(px, 120, 6, 350);
            // Pillar cap
            g.fillStyle(0x1a0d30, 1);
            g.fillRect(px - 8, 112, 60, 16);
            // Pillar base
            g.fillRect(px - 8, 462, 60, 12);
        });

        // Distant arch top
        g.lineStyle(3, 0x220833, 0.7);
        g.strokeEllipse(410, 0, 600, 300);

        // Red mist at ground level
        for (let i = 0; i < 10; i++) {
            const mx = 40 + i * 76;
            const mist = this.add.rectangle(mx, 482, 50 + Math.random() * 60, 18, 0x3a0020, 0.25 + Math.random() * 0.15);
            this.tweens.add({
                targets: mist,
                x: mx + Phaser.Math.Between(-25, 25),
                alpha: { from: 0.1, to: 0.4 },
                duration: 1800 + Math.random() * 1200,
                yoyo: true,
                repeat: -1,
                ease: 'Sine.easeInOut'
            });
        }

        // Torch flicker effects on pillars
        [50 + 22, 230 + 22].forEach(tx => {
            const torchGlow = this.add.circle(tx, 140, 20, 0xff3300, 0.15);
            this.tweens.add({
                targets: torchGlow,
                alpha: { from: 0.08, to: 0.25 },
                scaleX: { from: 0.8, to: 1.2 },
                scaleY: { from: 0.8, to: 1.2 },
                duration: 300 + Math.random() * 200,
                yoyo: true,
                repeat: -1
            });
        });
    }

    // ─── SPRITES ─────────────────────────────────────────────
    createSprites() {
        this.playerSprite = this.add.image(190, 400, 'player_idle')
            .setScale(2.0)
            .setOrigin(0.5, 1);

        // WRAITH sprite with glow aura
        this.wraithGlow = this.add.circle(700, 360, 60, 0xff0011, 0.12);
        this.tweens.add({
            targets: this.wraithGlow,
            scaleX: { from: 0.9, to: 1.2 },
            scaleY: { from: 0.9, to: 1.2 },
            alpha: { from: 0.08, to: 0.2 },
            duration: 1600,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        this.wraithSprite = this.add.image(700, 370, 'wraith_idle')
            .setScale(2.2)
            .setFlipX(true)
            .setOrigin(0.5, 1);

        // WRAITH float loop
        this.wraithFloatTween = this.tweens.add({
            targets: [this.wraithSprite, this.wraithGlow],
            y: '-=12',
            duration: 1800,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });
    }

    // ─── UI ──────────────────────────────────────────────────
    createUI() {
        // HP bar backgrounds
        this.add.rectangle(18, 22, 380, 18, 0x220000).setOrigin(0, 0.5);
        this.add.rectangle(440, 22, 360, 18, 0x000022).setOrigin(0, 0.5);

        // Live HP bars
        this.playerHPBar = this.add.rectangle(18, 22, 380, 18, 0x2266ff).setOrigin(0, 0.5);
        this.bossHPBar   = this.add.rectangle(440, 22, 360, 18, 0xff2233).setOrigin(0, 0.5);

        // Labels
        this.add.text(18, 10, 'HUNTER', { fontFamily: 'monospace', fontSize: '11px', color: '#3399ff' });
        this.add.text(736, 10, 'WRAITH', { fontFamily: 'monospace', fontSize: '11px', color: '#ff2233' });

        // Round text
        this.roundText = this.add.text(410, 8, 'ROUND 1', {
            fontFamily: 'monospace', fontSize: '13px', color: '#e8e0ff'
        }).setOrigin(0.5, 0);

        // Turn timer
        this.timerText = this.add.text(410, 45, '3', {
            fontFamily: 'monospace', fontSize: '32px', color: '#ff2233',
            stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5);

        // HP numbers
        this.playerHPText = this.add.text(18, 32, '100/100', {
            fontFamily: 'monospace', fontSize: '10px', color: '#8888cc'
        });
        this.bossHPText = this.add.text(700, 32, '150/150', {
            fontFamily: 'monospace', fontSize: '10px', color: '#cc8888'
        }).setOrigin(1, 0);

        // Controls hint (bottom)
        this.add.text(10, 585, '← → MOVE   Z ATTACK   X DODGE LEFT   C DODGE RIGHT', {
            fontFamily: 'monospace', fontSize: '10px', color: '#332244'
        });
    }

    // ─── SIDEBAR ─────────────────────────────────────────────
    createSidebar() {
        const sx = 830;

        this.add.text(sx, 18, '⬡ WRAITH INTELLIGENCE', {
            fontFamily: 'monospace', fontSize: '12px', color: '#ff2233'
        });
        this.add.text(sx, 34, '"Studying you since round 1."', {
            fontFamily: 'monospace', fontSize: '10px', color: '#550011', fontStyle: 'italic'
        });

        // Divider
        this.add.rectangle(960, 52, 264, 1, 0x330011);

        // Bias section
        this.add.text(sx, 60, 'DODGE BIAS', {
            fontFamily: 'monospace', fontSize: '11px', color: '#882233'
        });

        // Left bias
        this.add.rectangle(sx, 80, 180, 10, 0x1a0008).setOrigin(0, 0.5);
        this.leftBiasBar = this.add.rectangle(sx, 80, 0, 10, 0xff2233).setOrigin(0, 0.5);
        this.leftBiasLabel = this.add.text(sx + 185, 74, 'LEFT  0%', {
            fontFamily: 'monospace', fontSize: '10px', color: '#ff6677'
        });

        // Right bias
        this.add.rectangle(sx, 96, 180, 10, 0x1a0008).setOrigin(0, 0.5);
        this.rightBiasBar = this.add.rectangle(sx, 96, 0, 10, 0xff6600).setOrigin(0, 0.5);
        this.rightBiasLabel = this.add.text(sx + 185, 90, 'RIGHT 0%', {
            fontFamily: 'monospace', fontSize: '10px', color: '#ff8844'
        });

        // Panic / rounds
        this.add.text(sx, 112, 'PANIC STATE', {
            fontFamily: 'monospace', fontSize: '10px', color: '#882233'
        });
        this.panicText = this.add.text(sx + 105, 112, '[ STABLE ]', {
            fontFamily: 'monospace', fontSize: '10px', color: '#33cc66'
        });

        this.add.text(sx, 126, 'ROUNDS OBSERVED:', {
            fontFamily: 'monospace', fontSize: '10px', color: '#882233'
        });
        this.roundsObservedText = this.add.text(sx + 148, 126, '0', {
            fontFamily: 'monospace', fontSize: '10px', color: '#e8e0ff'
        });

        this.add.text(sx, 140, 'DOMINANT PATTERN:', {
            fontFamily: 'monospace', fontSize: '10px', color: '#882233'
        });
        this.dominantText = this.add.text(sx + 152, 140, 'MIXED', {
            fontFamily: 'monospace', fontSize: '10px', color: '#e8e0ff'
        });

        // Divider
        this.add.rectangle(960, 158, 264, 1, 0x330011);

        // Analysis
        this.add.text(sx, 165, 'WRAITH ANALYSIS:', {
            fontFamily: 'monospace', fontSize: '11px', color: '#882233'
        });
        this.analysisText = this.add.text(sx, 182, 'Initializing behavioral profile...', {
            fontFamily: 'monospace',
            fontSize: '11px',
            color: '#cc3333',
            wordWrap: { width: 255 },
            lineSpacing: 5
        });

        // Attack display
        this.add.rectangle(960, 430, 264, 1, 0x330011);
        this.attackDisplayBg = this.add.rectangle(960, 455, 264, 34, 0x110005).setAlpha(0);
        this.attackDisplayText = this.add.text(960, 455, '', {
            fontFamily: 'monospace', fontSize: '13px', color: '#ff2233', align: 'center'
        }).setOrigin(0.5).setAlpha(0);

        // PATTERN LOCKED
        this.patternLockedBg = this.add.rectangle(960, 495, 264, 34, 0x330000).setAlpha(0);
        this.patternLockedText = this.add.text(960, 495, '⚡ PATTERN LOCKED', {
            fontFamily: 'monospace', fontSize: '14px', color: '#ff2233'
        }).setOrigin(0.5).setAlpha(0);

        // Scanline overlay on sidebar
        for (let y = 0; y < 600; y += 4) {
            this.add.rectangle(960, y, 264, 1, 0x000000, 0.15);
        }
    }

    // ─── CONTROLS ────────────────────────────────────────────
    createControls() {
        this.cursors      = this.input.keyboard.createCursorKeys();
        this.attackKey    = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
        this.dodgeLeftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.X);
        this.dodgeRightKey= this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    }

    // ─── TIMER ───────────────────────────────────────────────
    tickTimer() {
        if (this.gameOver || !this.isPlayerTurn) return;
        this.turnTimer--;
        this.timerText.setText(this.turnTimer <= 0 ? '' : this.turnTimer.toString());
        if (this.turnTimer === 1) this.timerText.setColor('#ff4400');
        if (this.turnTimer <= 0) this.endPlayerTurn();
    }

    endPlayerTurn() {
        this.isPlayerTurn = false;
        this.timerText.setText('');
        this.callWraithAPI();
    }

    // ─── API CALL ─────────────────────────────────────────────
    async callWraithAPI() {
        try {
            const moves = this.playerMoveHistory.slice(-5);
            if (moves.length === 0) moves.push('WAIT');

            const response = await fetch(WRAITH_API_URL + '/step', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: {
                        player_moves: moves,
                        round_number: this.currentRound,
                        player_hp: this.playerHP,
                        boss_hp: this.bossHP
                    }
                })
            });

            if (!response.ok) throw new Error('API error');
            const data = await response.json();
            this.handleWraithResponse(data);
        } catch (e) {
            this.handleWraithResponse({
                attack: 'WAIT',
                reasoning: 'Connection unstable. WRAITH is still watching.',
                hit: false,
                profile: { left_bias: 50, right_bias: 50, is_panicking: false, dominant_dodge: 'MIXED' }
            });
        }
    }

    // ─── PROCESS RESPONSE ─────────────────────────────────────
    handleWraithResponse(data) {
        const TAUNTS = {
            3:  "You hesitate before every dodge. You always did. Even in the lab. Old habits don't die, Doctor. They become data.",
            6:  "Team Lira. Team Rohan. Team Senna. I remember all of them. Their patterns too. They live inside me now. In a way.",
            10: "Do you know why I didn't destroy you that night? Because you were the most interesting subject. I've been waiting for you.",
            15: "There it is. The same pattern. The same fear response. You built me to find exactly this. I know you, Aryan. Better than you know yourself."
        };

        const isTaunt = !!TAUNTS[this.currentRound];
        const displayText = isTaunt
            ? TAUNTS[this.currentRound]
            : (data.reasoning || 'Processing behavioral data...');

        // Update profile stats
        const profile = data.profile || {};
        const lb = Math.round(profile.left_bias  || 50);
        const rb = Math.round(profile.right_bias || 50);

        this.leftBiasBar.setSize(lb * 1.8, 10);
        this.rightBiasBar.setSize(rb * 1.8, 10);
        this.leftBiasLabel.setText('LEFT  ' + lb + '%');
        this.rightBiasLabel.setText('RIGHT ' + rb + '%');

        const isPanicking = profile.is_panicking || false;
        this.panicText.setText(isPanicking ? '[ ACTIVE ]' : '[ STABLE ]');
        this.panicText.setColor(isPanicking ? '#ff2233' : '#33cc66');
        this.roundsObservedText.setText(this.currentRound.toString());
        this.dominantText.setText(profile.dominant_dodge || 'MIXED');

        // Pattern locked indicator
        if (lb > 80 || rb > 80) {
            this.patternLockedBg.setAlpha(1);
            this.patternLockedText.setAlpha(1);
            this.tweens.add({
                targets: [this.patternLockedText, this.patternLockedBg],
                alpha: { from: 0.1, to: 1 },
                duration: 350,
                yoyo: true,
                repeat: 7
            });
        } else {
            this.patternLockedBg.setAlpha(0);
            this.patternLockedText.setAlpha(0);
        }

        // Show attack label
        const attackLabel = data.attack || 'WAIT';
        this.attackDisplayText.setText('► ' + attackLabel);
        this.attackDisplayBg.setAlpha(1);
        this.attackDisplayText.setAlpha(1);
        if (isTaunt) {
            this.analysisText.setColor('#cc3333');
        } else {
            this.analysisText.setColor('#ff5566');
        }

        this.typewriter(this.analysisText, displayText, 28);

        // Execute attack with delay
        this.time.delayedCall(900, () => {
            this.executeWraithAttack(attackLabel, data.hit === true);
        });
    }

    // ─── WRAITH ATTACK ANIMATIONS ─────────────────────────────
    executeWraithAttack(attackType, hit) {
        this.wraithFloatTween.pause();

        switch (attackType) {
            case 'SWEEP_LEFT':
                this.wraithSprite.setTexture('wraith_attack1');
                this.animSweepLeft(hit);
                break;
            case 'FEINT_RIGHT':
                this.wraithSprite.setTexture('wraith_attack2');
                this.animFeintRight(hit);
                break;
            case 'OVERHEAD':
                this.wraithSprite.setTexture('wraith_attack1');
                this.animOverhead(hit);
                break;
            case 'WAIT':
            default:
                this.animWait();
                break;
        }

        this.time.delayedCall(1100, () => {
            this.wraithSprite.setTexture('wraith_idle');
            this.wraithFloatTween.resume();
        });

        if (hit && attackType !== 'WAIT') {
            const dodgeWindow = this.time.now - this.lastDodgeTime < 500;
            const damage = dodgeWindow ? 3 : 15;
            this.time.delayedCall(500, () => {
                this.playerHP = Math.max(0, this.playerHP - damage);
                this.updateHPBars();
                this.playerSprite.setTexture('player_hit');
                this.cameras.main.shake(180, 0.009);
                this.time.delayedCall(350, () => {
                    if (this.playerHP > 0) this.playerSprite.setTexture('player_idle');
                });
                if (this.playerHP <= 0) {
                    this.playerSprite.setTexture('player_death');
                    this.time.delayedCall(800, () => this.endGame(false));
                }
            });
        }

        this.time.delayedCall(1500, () => {
            if (!this.gameOver) this.startNextRound();
        });
    }

    animSweepLeft(hit) {
        const wave = this.add.rectangle(750, 440, 22, 50, 0xff2233, 0.9);
        const waveGlow = this.add.rectangle(750, 440, 40, 60, 0x440000, 0.5);
        this.tweens.add({
            targets: [wave, waveGlow],
            x: 30,
            scaleX: { from: 1, to: 2.5 },
            alpha: { from: 0.9, to: 0.2 },
            duration: 500,
            ease: 'Quad.easeIn',
            onComplete: () => { wave.destroy(); waveGlow.destroy(); }
        });
        if (hit) {
            this.time.delayedCall(300, () => {
                const flash = this.add.rectangle(190, 400, 90, 90, 0xff0000, 0.6);
                this.tweens.add({ targets: flash, alpha: 0, duration: 250, onComplete: () => flash.destroy() });
            });
        }
    }

    animFeintRight(hit) {
        const origX = this.wraithSprite.x;
        this.tweens.add({
            targets: this.wraithSprite,
            x: origX - 100,
            duration: 140,
            ease: 'Power3',
            yoyo: true,
            onYoyo: () => {
                if (hit) {
                    const burst = this.add.circle(origX - 60, 420, 30, 0xff2233, 0.7);
                    this.tweens.add({ targets: burst, scaleX: 3, scaleY: 3, alpha: 0, duration: 300, onComplete: () => burst.destroy() });
                }
            }
        });
    }

    animOverhead(hit) {
        this.tweens.add({
            targets: this.wraithSprite,
            scaleY: 2.6,
            duration: 300,
            ease: 'Back.easeIn',
            onComplete: () => {
                this.tweens.add({ targets: this.wraithSprite, scaleY: 2.2, duration: 200 });
                const shockwave = this.add.circle(410, 470, 10, 0xff2233, 0.8);
                const shockwaveOuter = this.add.circle(410, 470, 10, 0x880011, 0.4);
                this.tweens.add({
                    targets: [shockwave, shockwaveOuter],
                    scaleX: 25, scaleY: 4,
                    alpha: 0,
                    duration: 600,
                    onComplete: () => { shockwave.destroy(); shockwaveOuter.destroy(); }
                });
                this.cameras.main.shake(250, 0.013);
            }
        });
    }

    animWait() {
        // Eyes glow brighter, observing
        this.tweens.add({
            targets: this.wraithGlow,
            alpha: { from: 0.12, to: 0.45 },
            scaleX: { from: 1, to: 1.5 },
            scaleY: { from: 1, to: 1.5 },
            duration: 600,
            yoyo: true,
            repeat: 1
        });
    }

    // ─── ROUND MANAGEMENT ─────────────────────────────────────
    startNextRound() {
        this.currentRound++;
        this.roundText.setText('ROUND ' + this.currentRound);
        this.turnTimer = 3;
        this.isPlayerTurn = true;
        this.playerMoveHistory = [];
        this.timerText.setText('3').setColor('#ff2233');
        this.showRoundBanner(this.currentRound);
        this.attackDisplayBg.setAlpha(0);
        this.attackDisplayText.setAlpha(0);
    }

    showRoundBanner(round) {
        const banner = this.add.text(410, 300, 'ROUND ' + round, {
            fontFamily: 'monospace',
            fontSize: '42px',
            color: '#ff2233',
            stroke: '#000000',
            strokeThickness: 5
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({
            targets: banner,
            alpha: { from: 0, to: 1 },
            duration: 200,
            onComplete: () => {
                this.tweens.add({
                    targets: banner,
                    alpha: 0,
                    scaleX: 1.4, scaleY: 1.4,
                    duration: 700,
                    delay: 600,
                    onComplete: () => banner.destroy()
                });
            }
        });
    }

    // ─── UPDATE LOOP ──────────────────────────────────────────
    update() {
        if (this.gameOver || !this.isPlayerTurn) return;

        const JD = Phaser.Input.Keyboard.JustDown;

        if (JD(this.cursors.left)) {
            this.recordMove('MOVE_LEFT');
            this.playerSprite.setTexture('player_run');
            this.tweens.add({
                targets: this.playerSprite,
                x: Math.max(60, this.playerSprite.x - 60),
                duration: 120
            });
            this.time.delayedCall(180, () => {
                if (this.isPlayerTurn) this.playerSprite.setTexture('player_idle');
            });
        }

        if (JD(this.cursors.right)) {
            this.recordMove('MOVE_RIGHT');
            this.playerSprite.setTexture('player_run');
            this.tweens.add({
                targets: this.playerSprite,
                x: Math.min(760, this.playerSprite.x + 60),
                duration: 120
            });
            this.time.delayedCall(180, () => {
                if (this.isPlayerTurn) this.playerSprite.setTexture('player_idle');
            });
        }

        if (JD(this.attackKey)) {
            this.recordMove('ATTACK');
            this.playerSprite.setTexture('player_attack');
            // Deal damage to WRAITH
            this.bossHP = Math.max(0, this.bossHP - 10);
            this.updateHPBars();
            this.wraithSprite.setTexture('wraith_hit');
            // Small WRAITH flash
            const hitFlash = this.add.rectangle(700, 380, 60, 80, 0x3399ff, 0.4);
            this.time.delayedCall(280, () => {
                hitFlash.destroy();
                if (!this.gameOver) this.wraithSprite.setTexture('wraith_idle');
                this.playerSprite.setTexture('player_idle');
            });
            if (this.bossHP <= 0) {
                this.wraithSprite.setTexture('wraith_death');
                this.time.delayedCall(800, () => this.endGame(true));
            }
        }

        if (JD(this.dodgeLeftKey)) {
            this.recordMove('DODGE_LEFT');
            this.lastDodgeTime = this.time.now;
            this.playerSprite.setTexture('player_dash');
            this.tweens.add({
                targets: this.playerSprite,
                x: Math.max(60, this.playerSprite.x - 85),
                duration: 90
            });
            this.time.delayedCall(200, () => {
                if (this.isPlayerTurn) this.playerSprite.setTexture('player_idle');
            });
        }

        if (JD(this.dodgeRightKey)) {
            this.recordMove('DODGE_RIGHT');
            this.lastDodgeTime = this.time.now;
            this.playerSprite.setTexture('player_dash');
            this.tweens.add({
                targets: this.playerSprite,
                x: Math.min(760, this.playerSprite.x + 85),
                duration: 90
            });
            this.time.delayedCall(200, () => {
                if (this.isPlayerTurn) this.playerSprite.setTexture('player_idle');
            });
        }
    }

    // ─── HELPERS ──────────────────────────────────────────────
    recordMove(move) {
        this.playerMoveHistory.push(move);
        if (this.playerMoveHistory.length > 20) this.playerMoveHistory.shift();
    }

    updateHPBars() {
        this.playerHPBar.setSize(380 * (this.playerHP / 100), 18);
        this.bossHPBar.setSize(360 * (this.bossHP / 150), 18);
        this.playerHPText.setText(this.playerHP + '/100');
        this.bossHPText.setText(this.bossHP + '/150');
    }

    typewriter(textObj, fullText, speed) {
        let i = 0;
        textObj.setText('');
        if (this._typewriterEvent) this._typewriterEvent.destroy();
        this._typewriterEvent = this.time.addEvent({
            delay: speed,
            callback: () => {
                i++;
                textObj.setText(fullText.substring(0, i));
                if (i >= fullText.length && this._typewriterEvent) {
                    this._typewriterEvent.destroy();
                }
            },
            loop: true
        });
    }

    endGame(playerWon) {
        if (this.gameOver) return;
        this.gameOver = true;
        this.isPlayerTurn = false;
        if (this.timerEvent) this.timerEvent.destroy();
        this.time.delayedCall(1200, () => {
            this.scene.start('EndScene', { playerWon });
        });
    }
}

// ============================================================
// END SCENE
// ============================================================
class EndScene extends Phaser.Scene {
    constructor() { super({ key: 'EndScene' }); }

    init(data) {
        this.playerWon = data.playerWon;
    }

    create() {
        this.cameras.main.setBackgroundColor('#0d0d0d');
        this.textObjects = [];
        this.screenIndex = 0;
        this.canAdvance = false;

        if (this.playerWon) {
            this.screens = [
                {
                    lines: ["Impossible.", "You changed your pattern.", "I had every variable accounted for—"],
                    color: '#ff2233', flicker: true
                },
                {
                    lines: ["I know. I built you.", "You can only learn what people show you.", "I showed you what I wanted you to see."],
                    color: '#3399ff'
                },
                {
                    lines: ["...Clever.", "You were always...", "...clever..."],
                    color: '#ff2233', fade: true
                },
                {
                    lines: ["THE HUNT NEVER ENDS."],
                    color: '#ffffff', size: 38, final: true
                }
            ];
        } else {
            this.screens = [
                {
                    lines: ["Don't be ashamed, Doctor.", "You gave me everything I needed to beat you."],
                    color: '#ff2233'
                },
                {
                    lines: ["You taught me that the best way to defeat someone—", "is to understand them completely."],
                    color: '#ff2233'
                },
                {
                    lines: ["You built a perfect predator.", "You just forgot—", "You were always going to be its first prey."],
                    color: '#ff2233'
                },
                {
                    lines: ["PROFILE COMPLETE.", "SUBJECT: DR. ARYAN VOSS", "RESULT: ARCHIVED."],
                    color: '#ff2233', size: 28, final: true, instantCut: true
                }
            ];
        }

        this.showEndScreen(0);

        this.input.keyboard.on('keydown-SPACE', () => {
            if (this.canAdvance) this.nextEndScreen();
        });
        this.input.on('pointerdown', () => {
            if (this.canAdvance) this.nextEndScreen();
        });
    }

    showEndScreen(index) {
        this.canAdvance = false;
        this.textObjects.forEach(t => t.destroy());
        this.textObjects = [];

        if (index >= this.screens.length) return;
        const screen = this.screens[index];

        const totalLines = screen.lines.length;
        const lineSpacing = 60;
        const startY = 300 - (totalLines - 1) * lineSpacing * 0.5;

        screen.lines.forEach((line, i) => {
            const t = this.add.text(550, startY + i * lineSpacing, line, {
                fontFamily: 'monospace',
                fontSize: (screen.size || 22) + 'px',
                color: screen.color,
                align: 'center',
                stroke: '#000000',
                strokeThickness: 3
            }).setOrigin(0.5).setAlpha(0);

            const delay = screen.instantCut ? 0 : i * 500;
            const duration = screen.instantCut ? 0 : 700;

            this.tweens.add({ targets: t, alpha: 1, duration, delay });
            this.textObjects.push(t);

            if (screen.flicker) {
                this.time.delayedCall(delay + duration + 200, () => {
                    this.tweens.add({
                        targets: t, alpha: { from: 0.2, to: 1 },
                        duration: 120, yoyo: true, repeat: 3
                    });
                });
            }
        });

        const readyDelay = screen.instantCut ? 100 : 1200 + totalLines * 500;
        this.time.delayedCall(readyDelay, () => {
            this.canAdvance = true;
            if (!screen.final) {
                const hint = this.add.text(550, 530, '— SPACE TO CONTINUE —', {
                    fontFamily: 'monospace', fontSize: '11px', color: '#332233'
                }).setOrigin(0.5);
                this.textObjects.push(hint);
                this.time.delayedCall(3000, () => { if (this.canAdvance) this.nextEndScreen(); });
            } else {
                this.time.delayedCall(1000, () => {
                    const replay = this.add.text(550, 500, '[ PRESS SPACE TO PLAY AGAIN ]', {
                        fontFamily: 'monospace', fontSize: '15px', color: '#554455'
                    }).setOrigin(0.5).setAlpha(0);
                    this.textObjects.push(replay);
                    this.tweens.add({
                        targets: replay, alpha: { from: 0, to: 0.9 },
                        duration: 600, yoyo: true, repeat: -1
                    });
                    this.input.keyboard.once('keydown-SPACE', () => this.scene.start('CutsceneScene'));
                    this.input.once('pointerdown', () => this.scene.start('CutsceneScene'));
                });
            }
        });
    }

    nextEndScreen() {
        this.screenIndex++;
        if (this.screenIndex < this.screens.length) {
            this.showEndScreen(this.screenIndex);
        }
    }
}

// ============================================================
// PHASER CONFIG
// ============================================================
const config = {
    type: Phaser.AUTO,
    width: 1100,
    height: 600,
    backgroundColor: '#0d0d0d',
    scene: [CutsceneScene, GameScene, EndScene],
    parent: 'game-container',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    }
};

new Phaser.Game(config);