// Thugs.io Client - Socket.IO Game Client
class ThugsIOClient {
    constructor() {
        this.socket = null;
        this.canvas = null;
        this.ctx = null;
        this.miniCanvas = null;
        this.miniCtx = null;
        
        // Game state
        this.players = {};
        this.localPlayer = null;
        this.bullets = [];
        this.policeNPCs = [];
        this.gameStarted = false;
        this.gameStartTime = Date.now();
        this.camera = { x: 0, y: 0 };
        
        // Input handling
        this.keys = {};
        this.mouse = { x: 0, y: 0, down: false };
        this.chatMode = false;
        
        // Game world settings
        this.worldWidth = 1600;
        this.worldHeight = 1200;
        
        // Initialize the game
        this.init();
    }

    init() {
        // Get canvas elements
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.miniCanvas = document.getElementById('minimapCanvas');
        this.miniCtx = this.miniCanvas.getContext('2d');
        
        // Setup socket connection
        this.setupSocket();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup UI
        this.setupUI();
        
        // Start game loop
        this.gameLoop();
        
        console.log('🚗 Thugs.io client initialized');
    }

    setupSocket() {
        this.socket = io();
        
        // Connection events
        this.socket.on('connect', () => {
            console.log('Connected to server');
            this.updateLoadingText('Connected! Loading game...');
            this.updateLoadingProgress(50);
        });

        this.socket.on('disconnect', () => {
            console.log('Disconnected from server');
            this.showLoadingScreen();
            this.updateLoadingText('Connection lost. Reconnecting...');
        });

        // Game state events
        this.socket.on('gameState', (gameState) => {
            console.log('Received game state', gameState);
            this.players = gameState.players;
            
            // Set local player
            this.localPlayer = this.players[this.socket.id];
            if (this.localPlayer) {
                this.camera.x = this.localPlayer.x - this.canvas.width / 2;
                this.camera.y = this.localPlayer.y - this.canvas.height / 2;
            }
            
            // Add welcome message
            this.addSystemMessage('Welcome to Thugs.io! Use WASD to move, mouse to aim, click to shoot.', 'system');
            
            this.updateLoadingProgress(100);
            setTimeout(() => {
                this.hideLoadingScreen();
                this.gameStarted = true;
            }, 1000);
        });

        // Player events
        this.socket.on('playerJoined', (player) => {
            console.log('Player joined:', player.id);
            this.players[player.id] = player;
            this.updatePlayerCount();
            
            // Add system message to chat
            this.addSystemMessage(`Player ${player.id.substring(0, 8)} joined the game`, 'join');
        });

        this.socket.on('playerLeft', (playerId) => {
            console.log('Player left:', playerId);
            delete this.players[playerId];
            this.updatePlayerCount();
            
            // Add system message to chat
            this.addSystemMessage(`Player ${playerId.substring(0, 8)} left the game`, 'leave');
        });

        this.socket.on('playerUpdate', (playerData) => {
            if (this.players[playerData.id]) {
                this.players[playerData.id].x = playerData.x;
                this.players[playerData.id].y = playerData.y;
                this.players[playerData.id].angle = playerData.angle;
                this.players[playerData.id].speed = playerData.speed;
            }
        });

        // Combat events
        this.socket.on('bulletFired', (bulletData) => {
            this.addBullet(bulletData);
        });

        this.socket.on('bulletRemoved', (bulletId) => {
            this.removeBullet(bulletId);
        });

        this.socket.on('playerHit', (hitData) => {
            this.handlePlayerHit(hitData);
        });

        this.socket.on('playerDied', (deathData) => {
            this.handlePlayerDeath(deathData);
        });

        this.socket.on('gameUpdate', (updateData) => {
            this.handleGameUpdate(updateData);
        });

        this.socket.on('policeKilled', (data) => {
            this.handlePoliceKilled(data);
        });

        this.socket.on('wantedLevelChanged', (data) => {
            this.handleWantedLevelChanged(data);
        });

        // Chat events
        this.socket.on('chatMessage', (messageData) => {
            this.addChatMessage(messageData);
        });
    }

    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            // Don't handle game keys when in chat mode
            if (this.chatMode && e.code !== 'Enter' && e.code !== 'Escape') {
                return;
            }
            
            this.keys[e.code] = true;
            
            // Chat toggle
            if (e.code === 'Enter') {
                this.toggleChat();
                e.preventDefault();
            }
            
            // Escape to close chat
            if (e.code === 'Escape' && this.chatMode) {
                this.toggleChat();
                e.preventDefault();
            }
            
            // Prevent default for game keys only when not in chat mode
            if (!this.chatMode && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) {
                e.preventDefault();
            }
        });

        document.addEventListener('keyup', (e) => {
            // Don't handle game keys when in chat mode
            if (this.chatMode && e.code !== 'Enter' && e.code !== 'Escape') {
                return;
            }
            
            this.keys[e.code] = false;
        });

        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            
            this.mouse.x = (e.clientX - rect.left) * scaleX;
            this.mouse.y = (e.clientY - rect.top) * scaleY;
        });

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left click
                this.mouse.down = true;
                this.shoot();
            }
        });

        this.canvas.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                this.mouse.down = false;
            }
        });

        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // Chat input
        const messageInput = document.getElementById('messageInput');
        messageInput.addEventListener('keydown', (e) => {
            if (e.code === 'Enter') {
                this.sendChatMessage();
            } else if (e.code === 'Escape') {
                this.toggleChat();
            }
        });

        document.getElementById('sendButton').addEventListener('click', () => {
            this.sendChatMessage();
        });

        // Respawn button
        document.getElementById('respawnButton').addEventListener('click', () => {
            this.respawn();
        });
    }

    setupUI() {
        this.updatePlayerCount();
        this.updateLoadingText('Connecting to server...');
        this.updateLoadingProgress(25);
    }

    gameLoop() {
        if (this.gameStarted) {
            this.update();
            this.render();
        }
        requestAnimationFrame(() => this.gameLoop());
    }

    update() {
        if (!this.localPlayer) return;

        // Handle input
        this.handleInput();
        
        // Update bullets
        this.updateBullets();
        
        // Update camera
        this.updateCamera();
        
        // Send player update to server
        this.sendPlayerUpdate();
    }

    handleInput() {
        if (!this.localPlayer || this.chatMode) return;

        let dx = 0;
        let dy = 0;
        const speed = this.localPlayer.maxSpeed;

        // Movement
        if (this.keys['KeyW'] || this.keys['ArrowUp']) dy -= speed;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) dy += speed;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) dx -= speed;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) dx += speed;

        // Normalize diagonal movement
        if (dx !== 0 && dy !== 0) {
            dx *= 0.707;
            dy *= 0.707;
        }

        // Update player position
        this.localPlayer.x += dx;
        this.localPlayer.y += dy;

        // Clamp to world bounds
        this.localPlayer.x = Math.max(25, Math.min(this.worldWidth - 25, this.localPlayer.x));
        this.localPlayer.y = Math.max(25, Math.min(this.worldHeight - 25, this.localPlayer.y));

        // Calculate angle to mouse
        const worldMouseX = this.mouse.x + this.camera.x;
        const worldMouseY = this.mouse.y + this.camera.y;
        this.localPlayer.angle = Math.atan2(
            worldMouseY - this.localPlayer.y,
            worldMouseX - this.localPlayer.x
        );

        // Set speed for animation
        this.localPlayer.speed = Math.sqrt(dx * dx + dy * dy);
    }

    updateCamera() {
        if (!this.localPlayer) return;

        // Smooth camera follow
        const targetX = this.localPlayer.x - this.canvas.width / 2;
        const targetY = this.localPlayer.y - this.canvas.height / 2;
        
        this.camera.x += (targetX - this.camera.x) * 0.1;
        this.camera.y += (targetY - this.camera.y) * 0.1;

        // Clamp camera to world bounds
        this.camera.x = Math.max(0, Math.min(this.worldWidth - this.canvas.width, this.camera.x));
        this.camera.y = Math.max(0, Math.min(this.worldHeight - this.canvas.height, this.camera.y));
    }

    updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.x += Math.cos(bullet.angle) * bullet.speed;
            bullet.y += Math.sin(bullet.angle) * bullet.speed;
            bullet.life--;

            // Remove bullets that are out of bounds or expired
            if (bullet.life <= 0 || 
                bullet.x < 0 || bullet.x > this.worldWidth ||
                bullet.y < 0 || bullet.y > this.worldHeight) {
                this.bullets.splice(i, 1);
            }
        }
    }

    render() {
        // Clear canvas
        this.ctx.fillStyle = '#1a1a1a';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid
        this.drawGrid();

        // Draw players
        this.drawPlayers();

        // Draw police NPCs
        this.drawPolice();

        // Draw bullets
        this.drawBullets();

        // Draw minimap
        this.drawMinimap();
    }

    drawGrid() {
        this.ctx.strokeStyle = 'rgba(255, 107, 0, 0.1)';
        this.ctx.lineWidth = 1;

        const gridSize = 50;
        const startX = -(this.camera.x % gridSize);
        const startY = -(this.camera.y % gridSize);

        for (let x = startX; x < this.canvas.width; x += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = startY; y < this.canvas.height; y += gridSize) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
    }

    drawPlayers() {
        Object.values(this.players).forEach(player => {
            const screenX = player.x - this.camera.x;
            const screenY = player.y - this.camera.y;

            // Skip if player is off screen
            if (screenX < -50 || screenX > this.canvas.width + 50 ||
                screenY < -50 || screenY > this.canvas.height + 50) {
                return;
            }

            this.ctx.save();
            this.ctx.translate(screenX, screenY);
            this.ctx.rotate(player.angle);

            // Draw player body with different colors based on state
            if (!player.isAlive) {
                // Dead player - gray and transparent
                this.ctx.globalAlpha = 0.5;
                this.ctx.fillStyle = '#666';
            } else if (player.id === this.socket.id) {
                // Local player - green
                this.ctx.fillStyle = '#00ff41';
            } else {
                // Other players - orange
                this.ctx.fillStyle = '#ff6b00';
            }
            
            this.ctx.fillRect(-15, -10, 30, 20);

            // Draw player outline
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(-15, -10, 30, 20);

            // Draw weapon only if alive
            if (player.isAlive) {
                this.ctx.fillStyle = '#888';
                this.ctx.fillRect(15, -2, 20, 4);
            }

            this.ctx.restore();

            // Draw player name/ID
            this.ctx.fillStyle = player.isAlive ? '#fff' : '#666';
            this.ctx.font = '12px Orbitron';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(
                player.id.substring(0, 8),
                screenX,
                screenY - 25
            );

            // Draw health bar only for alive players
            if (player.isAlive) {
                const healthWidth = 30;
                const healthHeight = 4;
                const healthPercent = player.health / 100;

                this.ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
                this.ctx.fillRect(screenX - healthWidth/2, screenY - 35, healthWidth, healthHeight);
                
                this.ctx.fillStyle = 'rgba(0, 255, 65, 0.9)';
                this.ctx.fillRect(screenX - healthWidth/2, screenY - 35, healthWidth * healthPercent, healthHeight);
            } else {
                // Draw "DEAD" text
                this.ctx.fillStyle = '#ff0000';
                this.ctx.font = 'bold 10px Orbitron';
                this.ctx.fillText('DEAD', screenX, screenY - 35);
            }
        });
    }

    drawBullets() {
        this.ctx.fillStyle = '#ffff00';
        this.bullets.forEach(bullet => {
            const screenX = bullet.x - this.camera.x;
            const screenY = bullet.y - this.camera.y;

            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, 3, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    drawMinimap() {
        // Clear minimap
        this.miniCtx.fillStyle = '#000';
        this.miniCtx.fillRect(0, 0, this.miniCanvas.width, this.miniCanvas.height);

        // Draw world bounds
        this.miniCtx.strokeStyle = '#ff6b00';
        this.miniCtx.lineWidth = 2;
        this.miniCtx.strokeRect(1, 1, this.miniCanvas.width - 2, this.miniCanvas.height - 2);

        // Draw players as dots
        Object.values(this.players).forEach(player => {
            const miniX = (player.x / this.worldWidth) * this.miniCanvas.width;
            const miniY = (player.y / this.worldHeight) * this.miniCanvas.height;

            this.miniCtx.fillStyle = player.id === this.socket.id ? '#00ff41' : '#ff6b00';
            this.miniCtx.beginPath();
            this.miniCtx.arc(miniX, miniY, 3, 0, Math.PI * 2);
            this.miniCtx.fill();
        });
    }

    // Socket communication methods
    sendPlayerUpdate() {
        if (!this.localPlayer) return;

        this.socket.emit('playerMove', {
            x: this.localPlayer.x,
            y: this.localPlayer.y,
            angle: this.localPlayer.angle,
            speed: this.localPlayer.speed
        });
    }

    shoot() {
        if (!this.localPlayer || this.chatMode) return;

        this.socket.emit('playerShoot', {
            angle: this.localPlayer.angle
        });
    }

    addBullet(bulletData) {
        this.bullets.push({
            id: bulletData.id,
            x: bulletData.x,
            y: bulletData.y,
            angle: bulletData.angle,
            speed: 10,
            life: 120, // 2 seconds at 60fps
            playerId: bulletData.playerId
        });
    }

    removeBullet(bulletId) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            if (this.bullets[i].id === bulletId) {
                this.bullets.splice(i, 1);
                break;
            }
        }
    }

    handlePlayerHit(hitData) {
        // Update player health
        if (this.players[hitData.playerId]) {
            this.players[hitData.playerId].health = hitData.health;
            
            // Show damage indicator
            this.showDamageIndicator(hitData.playerId, hitData.damage);
            
            // If it's the local player, update UI
            if (hitData.playerId === this.socket.id) {
                this.updateHealthUI();
                
                // Screen flash effect for taking damage
                this.flashScreen('#ff0000', 0.3);
            }
        }
        
        // Add hit message to chat
        const attackerName = hitData.attackerId.substring(0, 8);
        const victimName = hitData.playerId.substring(0, 8);
        
        if (!hitData.died) {
            this.addSystemMessage(`${attackerName} hit ${victimName} for ${hitData.damage} damage`, 'hit');
        }
    }

    handlePlayerDeath(deathData) {
        // Update player state
        if (this.players[deathData.playerId]) {
            this.players[deathData.playerId].isAlive = false;
            this.players[deathData.playerId].health = 0;
        }
        
        // Update killer's stats
        if (this.players[deathData.killerId]) {
            this.players[deathData.killerId].kills = deathData.kills;
        }
        
        // Add kill message to chat
        const killerName = deathData.killerId.substring(0, 8);
        const victimName = deathData.playerId.substring(0, 8);
        this.addSystemMessage(`${killerName} eliminated ${victimName}`, 'kill');
        
        // If local player died, show death screen
        if (deathData.playerId === this.socket.id) {
            this.showDeathScreen(killerName);
        }
        
        // If local player got the kill, show kill notification
        if (deathData.killerId === this.socket.id) {
            this.showKillNotification(victimName);
            this.updateMoneyUI();
        }
    }

    handleGameUpdate(updateData) {
        // Update all player data
        Object.values(updateData.players).forEach(playerData => {
            if (this.players[playerData.id]) {
                Object.assign(this.players[playerData.id], playerData);
            }
        });
        
        // Update police NPCs
        if (updateData.police) {
            this.policeNPCs = updateData.police;
        }
        
        // Update UI if local player data changed
        if (this.localPlayer) {
            this.updateHealthUI();
            this.updateMoneyUI();
            this.updateWantedUI();
        }
    }

    handlePoliceKilled(data) {
        // Add message to chat
        const killerName = data.killerId.substring(0, 8);
        this.addSystemMessage(`${killerName} eliminated a police officer (+$50)`, 'police');
        
        // Show notification if local player killed police
        if (data.killerId === this.socket.id) {
            this.showKillNotification('POLICE OFFICER');
        }
    }

    handleWantedLevelChanged(data) {
        if (this.players[data.playerId]) {
            this.players[data.playerId].wanted = data.wantedLevel;
            
            // Update UI if it's the local player
            if (data.playerId === this.socket.id) {
                this.updateWantedUI();
                
                // Show wanted level notification
                if (data.wantedLevel > 0) {
                    this.showWantedNotification(data.wantedLevel);
                }
            }
        }
    }

    // Chat system
    toggleChat() {
        this.chatMode = !this.chatMode;
        const chatInput = document.getElementById('chatInput');
        const messageInput = document.getElementById('messageInput');

        if (this.chatMode) {
            chatInput.style.display = 'flex';
            messageInput.focus();
        } else {
            chatInput.style.display = 'none';
            messageInput.value = '';
        }
    }

    sendChatMessage() {
        const messageInput = document.getElementById('messageInput');
        const message = messageInput.value.trim();

        if (message && message.length > 0) {
            this.socket.emit('chatMessage', message);
            messageInput.value = '';
        }

        this.toggleChat();
    }

    addChatMessage(messageData) {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'chat-message';

        const timestamp = new Date(messageData.timestamp).toLocaleTimeString();
        const playerName = messageData.playerId.substring(0, 8);

        messageDiv.innerHTML = `
            <span class="chat-timestamp">[${timestamp}]</span>
            <span class="chat-player">${playerName}:</span>
            <span class="chat-text">${messageData.message}</span>
        `;

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Remove old messages (keep last 50)
        while (chatMessages.children.length > 50) {
            chatMessages.removeChild(chatMessages.firstChild);
        }
    }

    addSystemMessage(message, type = 'system') {
        const chatMessages = document.getElementById('chatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message system-message ${type}`;

        const timestamp = new Date().toLocaleTimeString();

        messageDiv.innerHTML = `
            <span class="chat-timestamp">[${timestamp}]</span>
            <span class="chat-system">${message}</span>
        `;

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Remove old messages (keep last 50)
        while (chatMessages.children.length > 50) {
            chatMessages.removeChild(chatMessages.firstChild);
        }
    }

    // UI Updates
    updatePlayerCount() {
        const count = Object.keys(this.players).length;
        document.getElementById('onlineCount').textContent = count;
    }

    updateHealthUI() {
        if (!this.localPlayer) return;
        
        const healthPercent = (this.localPlayer.health / 100) * 100;
        document.getElementById('healthFill').style.width = healthPercent + '%';
        document.getElementById('healthText').textContent = this.localPlayer.health;
    }

    updateMoneyUI() {
        if (!this.localPlayer) return;
        
        document.getElementById('moneyText').textContent = '$' + this.localPlayer.money;
    }

    updateWantedUI() {
        if (!this.localPlayer) return;
        
        const stars = document.querySelectorAll('#wantedStars .star');
        stars.forEach((star, index) => {
            if (index < this.localPlayer.wanted) {
                star.classList.add('active');
            } else {
                star.classList.remove('active');
            }
        });
    }

    showWantedNotification(wantedLevel) {
        const notification = document.createElement('div');
        notification.textContent = `WANTED LEVEL ${wantedLevel}`;
        notification.style.position = 'fixed';
        notification.style.top = '30%';
        notification.style.left = '50%';
        notification.style.transform = 'translate(-50%, -50%)';
        notification.style.color = '#ff0000';
        notification.style.fontSize = '28px';
        notification.style.fontWeight = 'bold';
        notification.style.textShadow = '0 0 15px rgba(255, 0, 0, 0.8)';
        notification.style.pointerEvents = 'none';
        notification.style.zIndex = '1001';
        notification.style.animation = 'pulse 0.5s ease-in-out';
        
        document.body.appendChild(notification);
        
        // Animate and remove
        setTimeout(() => {
            let opacity = 1;
            const fadeOut = () => {
                opacity -= 0.05;
                notification.style.opacity = opacity;
                
                if (opacity > 0) {
                    requestAnimationFrame(fadeOut);
                } else {
                    document.body.removeChild(notification);
                }
            };
            fadeOut();
        }, 2000);
    }

    showDamageIndicator(playerId, damage) {
        // Create floating damage text
        const player = this.players[playerId];
        if (!player) return;
        
        const screenX = player.x - this.camera.x;
        const screenY = player.y - this.camera.y;
        
        // Create damage indicator element
        const indicator = document.createElement('div');
        indicator.textContent = `-${damage}`;
        indicator.style.position = 'absolute';
        indicator.style.left = screenX + 'px';
        indicator.style.top = screenY + 'px';
        indicator.style.color = '#ff0000';
        indicator.style.fontWeight = 'bold';
        indicator.style.fontSize = '18px';
        indicator.style.pointerEvents = 'none';
        indicator.style.zIndex = '1000';
        indicator.style.textShadow = '2px 2px 4px rgba(0,0,0,0.8)';
        
        document.body.appendChild(indicator);
        
        // Animate and remove
        let opacity = 1;
        let y = screenY;
        const animate = () => {
            y -= 2;
            opacity -= 0.05;
            indicator.style.top = y + 'px';
            indicator.style.opacity = opacity;
            
            if (opacity > 0) {
                requestAnimationFrame(animate);
            } else {
                document.body.removeChild(indicator);
            }
        };
        requestAnimationFrame(animate);
    }

    flashScreen(color, opacity) {
        const flash = document.createElement('div');
        flash.style.position = 'fixed';
        flash.style.top = '0';
        flash.style.left = '0';
        flash.style.width = '100%';
        flash.style.height = '100%';
        flash.style.backgroundColor = color;
        flash.style.opacity = opacity;
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '999';
        
        document.body.appendChild(flash);
        
        setTimeout(() => {
            let currentOpacity = opacity;
            const fadeOut = () => {
                currentOpacity -= 0.05;
                flash.style.opacity = currentOpacity;
                
                if (currentOpacity > 0) {
                    requestAnimationFrame(fadeOut);
                } else {
                    document.body.removeChild(flash);
                }
            };
            fadeOut();
        }, 100);
    }

    showDeathScreen(killerName) {
        const deathScreen = document.getElementById('gameOverScreen');
        const survivalTime = Math.floor((Date.now() - this.gameStartTime) / 1000);
        const minutes = Math.floor(survivalTime / 60);
        const seconds = survivalTime % 60;
        
        document.getElementById('survivalTime').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('totalMoney').textContent = '$' + (this.localPlayer ? this.localPlayer.money : 0);
        document.getElementById('killCount').textContent = this.localPlayer ? this.localPlayer.kills : 0;
        
        deathScreen.style.display = 'flex';
        
        // Auto-respawn after 5 seconds
        setTimeout(() => {
            this.respawn();
        }, 5000);
    }

    showKillNotification(victimName) {
        // Create kill notification
        const notification = document.createElement('div');
        notification.textContent = `ELIMINATED ${victimName}`;
        notification.style.position = 'fixed';
        notification.style.top = '50%';
        notification.style.left = '50%';
        notification.style.transform = 'translate(-50%, -50%)';
        notification.style.color = '#00ff41';
        notification.style.fontSize = '24px';
        notification.style.fontWeight = 'bold';
        notification.style.textShadow = '0 0 10px rgba(0, 255, 65, 0.8)';
        notification.style.pointerEvents = 'none';
        notification.style.zIndex = '1001';
        
        document.body.appendChild(notification);
        
        // Animate and remove
        setTimeout(() => {
            let opacity = 1;
            const fadeOut = () => {
                opacity -= 0.05;
                notification.style.opacity = opacity;
                
                if (opacity > 0) {
                    requestAnimationFrame(fadeOut);
                } else {
                    document.body.removeChild(notification);
                }
            };
            fadeOut();
        }, 2000);
    }

    updateLoadingText(text) {
        document.getElementById('loadingText').textContent = text;
    }

    updateLoadingProgress(percent) {
        document.getElementById('loadingProgress').style.width = percent + '%';
    }

    showLoadingScreen() {
        document.getElementById('loadingScreen').style.display = 'flex';
        this.gameStarted = false;
    }

    hideLoadingScreen() {
        document.getElementById('loadingScreen').style.display = 'none';
    }

    respawn() {
        document.getElementById('gameOverScreen').style.display = 'none';
        // Respawn logic would be handled by server
        location.reload(); // Simple respawn for now
    }
}

// Initialize the game when page loads
document.addEventListener('DOMContentLoaded', () => {
    window.game = new ThugsIOClient();
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('Game paused - tab hidden');
    } else {
        console.log('Game resumed - tab visible');
    }
});
