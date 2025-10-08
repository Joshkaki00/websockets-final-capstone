const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'static')));

// Game state
const players = {};
const bullets = [];
const policeNPCs = [];
const gameState = {
    players: {},
    bullets: [],
    npcs: [],
    policeNPCs: [],
    vehicles: [],
    weapons: [],
    gameTime: Date.now()
};

// Player class
class Player {
    constructor(id, x = 400, y = 300) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.angle = 0;
        this.speed = 0;
        this.maxSpeed = 5;
        this.health = 100;
        this.maxHealth = 100;
        this.weapon = 'pistol';
        this.money = 0;
        this.wanted = 0;
        this.lastCrimeTime = 0;
        this.inVehicle = false;
        this.vehicleId = null;
        this.lastUpdate = Date.now();
        this.kills = 0;
        this.deaths = 0;
        this.isAlive = true;
        this.respawnTime = 0;
        this.radius = 15; // For collision detection
    }

    update() {
        // Handle respawn
        if (!this.isAlive && Date.now() >= this.respawnTime) {
            this.respawn();
        }
        
        // Handle wanted level decay
        if (this.wanted > 0 && this.lastCrimeTime > 0) {
            const timeSinceLastCrime = Date.now() - this.lastCrimeTime;
            const decayTime = 30000; // 30 seconds per star
            
            if (timeSinceLastCrime > decayTime) {
                this.decreaseWanted();
                this.lastCrimeTime = Date.now(); // Reset timer for next decay
            }
        }
        
        this.lastUpdate = Date.now();
    }

    takeDamage(damage, attackerId) {
        if (!this.isAlive) return false;
        
        this.health -= damage;
        
        // Increase wanted level when taking damage from another player
        if (attackerId && players[attackerId] && attackerId !== this.id) {
            players[attackerId].increaseWanted(1);
        }
        
        if (this.health <= 0) {
            this.health = 0;
            this.die(attackerId);
            return true; // Player died
        }
        return false; // Player survived
    }

    die(killerId) {
        this.isAlive = false;
        this.deaths++;
        this.respawnTime = Date.now() + 5000; // 5 second respawn
        
        // Award kill to attacker and increase their wanted level
        if (killerId && players[killerId] && killerId !== this.id) {
            players[killerId].kills++;
            players[killerId].money += 100; // Money for kill
            players[killerId].increaseWanted(2); // Big wanted increase for kills
        }
        
        // Reset wanted level on death
        this.wanted = 0;
        
        console.log(`Player ${this.id} was killed by ${killerId || 'unknown'}`);
    }

    increaseWanted(amount) {
        this.wanted = Math.min(5, this.wanted + amount); // Max 5 stars
        this.lastCrimeTime = Date.now();
        
        // Spawn police if wanted level is high enough
        if (this.wanted >= 2) {
            this.spawnPolice();
        }
        
        console.log(`Player ${this.id} wanted level: ${this.wanted}`);
    }

    decreaseWanted() {
        if (this.wanted > 0) {
            this.wanted = Math.max(0, this.wanted - 1);
        }
    }

    spawnPolice() {
        // Don't spawn too many police for one player
        const playerPolice = policeNPCs.filter(p => p.targetId === this.id);
        const maxPolice = this.wanted * 2; // 2 police per wanted star
        
        if (playerPolice.length < maxPolice) {
            const policeCount = Math.min(2, maxPolice - playerPolice.length);
            
            for (let i = 0; i < policeCount; i++) {
                // Spawn police at random location near player
                const angle = Math.random() * Math.PI * 2;
                const distance = 200 + Math.random() * 300;
                const x = this.x + Math.cos(angle) * distance;
                const y = this.y + Math.sin(angle) * distance;
                
                const police = new PoliceNPC(
                    `police_${Date.now()}_${Math.random()}`,
                    Math.max(50, Math.min(1550, x)),
                    Math.max(50, Math.min(1150, y)),
                    this.id
                );
                
                policeNPCs.push(police);
            }
        }
    }

    respawn() {
        this.isAlive = true;
        this.health = this.maxHealth;
        // Respawn at random location
        this.x = Math.random() * 1500 + 50;
        this.y = Math.random() * 1100 + 50;
        this.speed = 0;
        console.log(`Player ${this.id} respawned`);
    }
}

// Police NPC class
class PoliceNPC {
    constructor(id, x, y, targetId) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.angle = 0;
        this.speed = 0;
        this.maxSpeed = 4; // Slightly slower than players
        this.health = 75; // Less health than players
        this.targetId = targetId;
        this.radius = 15;
        this.lastShot = 0;
        this.shootCooldown = 1500; // 1.5 seconds between shots
        this.isAlive = true;
        this.aggroRange = 300; // How close they need to be to start chasing
        this.shootRange = 150; // How close to start shooting
    }

    update() {
        if (!this.isAlive) return;

        const target = players[this.targetId];
        if (!target || !target.isAlive || target.wanted === 0) {
            // Target is dead, disconnected, or no longer wanted - remove this police
            this.isAlive = false;
            return;
        }

        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Only chase if target is within aggro range
        if (distance < this.aggroRange) {
            // Move towards target
            this.angle = Math.atan2(dy, dx);
            
            if (distance > 50) { // Don't get too close
                this.x += Math.cos(this.angle) * this.maxSpeed;
                this.y += Math.sin(this.angle) * this.maxSpeed;
                this.speed = this.maxSpeed;
            } else {
                this.speed = 0;
            }

            // Keep in bounds
            this.x = Math.max(this.radius, Math.min(1600 - this.radius, this.x));
            this.y = Math.max(this.radius, Math.min(1200 - this.radius, this.y));

            // Shoot at target if in range
            if (distance < this.shootRange && Date.now() - this.lastShot > this.shootCooldown) {
                this.shootAtTarget(target);
                this.lastShot = Date.now();
            }
        }
    }

    shootAtTarget(target) {
        const bulletId = `police_${this.id}_${Date.now()}_${Math.random()}`;
        
        // Create bullet aimed at target
        const bullet = new Bullet(
            bulletId,
            this.x + Math.cos(this.angle) * 20,
            this.y + Math.sin(this.angle) * 20,
            this.angle,
            this.id
        );
        
        bullet.damage = 20; // Police do slightly less damage
        bullets.push(bullet);
        
        // Broadcast bullet
        io.emit('bulletFired', {
            id: bulletId,
            playerId: this.id,
            x: bullet.x,
            y: bullet.y,
            angle: bullet.angle,
            weapon: 'police_pistol',
            isPolice: true
        });
    }

    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.isAlive = false;
            return true; // Police died
        }
        return false;
    }
}

// Bullet class
class Bullet {
    constructor(id, x, y, angle, playerId) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.speed = 10;
        this.damage = 25;
        this.playerId = playerId;
        this.life = 120; // 2 seconds at 60fps
        this.radius = 3;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;
        this.life--;
        
        // Check world bounds
        if (this.x < 0 || this.x > 1600 || this.y < 0 || this.y > 1200) {
            return false; // Remove bullet
        }
        
        return this.life > 0;
    }
}

// Collision detection
function checkCollision(obj1, obj2) {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < (obj1.radius + obj2.radius);
}

// Player collision with other players
function handlePlayerCollisions() {
    const playerList = Object.values(players).filter(p => p.isAlive);
    
    for (let i = 0; i < playerList.length; i++) {
        for (let j = i + 1; j < playerList.length; j++) {
            const p1 = playerList[i];
            const p2 = playerList[j];
            
            if (checkCollision(p1, p2)) {
                // Simple collision response - push players apart
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                if (distance > 0) {
                    const pushDistance = (p1.radius + p2.radius - distance) / 2;
                    const pushX = (dx / distance) * pushDistance;
                    const pushY = (dy / distance) * pushDistance;
                    
                    p1.x -= pushX;
                    p1.y -= pushY;
                    p2.x += pushX;
                    p2.y += pushY;
                    
                    // Keep players in bounds
                    p1.x = Math.max(p1.radius, Math.min(1600 - p1.radius, p1.x));
                    p1.y = Math.max(p1.radius, Math.min(1200 - p1.radius, p1.y));
                    p2.x = Math.max(p2.radius, Math.min(1600 - p2.radius, p2.x));
                    p2.y = Math.max(p2.radius, Math.min(1200 - p2.radius, p2.y));
                }
            }
        }
    }
}

// Bullet collision with players and police
function handleBulletCollisions() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        let bulletHit = false;
        
        // Check collision with players
        Object.values(players).forEach(player => {
            if (player.isAlive && 
                player.id !== bullet.playerId && 
                !bullet.playerId.startsWith('police_') && // Police bullets can hit anyone
                checkCollision(bullet, player)) {
                
                // Player hit by bullet
                const died = player.takeDamage(bullet.damage, bullet.playerId);
                
                // Broadcast hit event
                io.emit('playerHit', {
                    playerId: player.id,
                    attackerId: bullet.playerId,
                    damage: bullet.damage,
                    health: player.health,
                    died: died
                });
                
                if (died) {
                    io.emit('playerDied', {
                        playerId: player.id,
                        killerId: bullet.playerId,
                        kills: players[bullet.playerId] ? players[bullet.playerId].kills : 0
                    });
                }
                
                bulletHit = true;
            }
        });
        
        // Check collision with police (only player bullets can hit police)
        if (!bulletHit && !bullet.playerId.startsWith('police_')) {
            policeNPCs.forEach(police => {
                if (police.isAlive && checkCollision(bullet, police)) {
                    const died = police.takeDamage(bullet.damage);
                    
                    // Award money for killing police
                    if (died && players[bullet.playerId]) {
                        players[bullet.playerId].money += 50;
                        players[bullet.playerId].increaseWanted(1); // Killing police increases wanted level
                        
                        io.emit('policeKilled', {
                            policeId: police.id,
                            killerId: bullet.playerId
                        });
                    }
                    
                    bulletHit = true;
                }
            });
        }
        
        if (bulletHit) {
            bullets.splice(i, 1);
        }
    }
}

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Create new player
    const newPlayer = new Player(socket.id);
    players[socket.id] = newPlayer;
    gameState.players[socket.id] = newPlayer;

    // Send initial game state to new player
    socket.emit('gameState', gameState);
    
    // Notify other players of new player
    socket.broadcast.emit('playerJoined', newPlayer);

    // Handle player movement
    socket.on('playerMove', (data) => {
        if (players[socket.id] && players[socket.id].isAlive) {
            // Validate movement data
            const player = players[socket.id];
            const newX = Math.max(player.radius, Math.min(1600 - player.radius, data.x));
            const newY = Math.max(player.radius, Math.min(1200 - player.radius, data.y));
            
            player.x = newX;
            player.y = newY;
            player.angle = data.angle;
            player.speed = data.speed;
            
            // Broadcast to other players
            socket.broadcast.emit('playerUpdate', {
                id: socket.id,
                x: player.x,
                y: player.y,
                angle: player.angle,
                speed: player.speed,
                health: player.health,
                isAlive: player.isAlive
            });
        }
    });

    // Handle shooting
    socket.on('playerShoot', (data) => {
        if (players[socket.id] && players[socket.id].isAlive) {
            const player = players[socket.id];
            const bulletId = `${socket.id}_${Date.now()}_${Math.random()}`;
            
            // Create bullet
            const bullet = new Bullet(
                bulletId,
                player.x + Math.cos(data.angle) * 20, // Spawn bullet in front of player
                player.y + Math.sin(data.angle) * 20,
                data.angle,
                player.id
            );
            
            bullets.push(bullet);
            
            // Broadcast bullet to all players
            io.emit('bulletFired', {
                id: bulletId,
                playerId: socket.id,
                x: bullet.x,
                y: bullet.y,
                angle: bullet.angle,
                weapon: player.weapon
            });
        }
    });

    // Handle chat messages
    socket.on('chatMessage', (message) => {
        if (players[socket.id]) {
            io.emit('chatMessage', {
                playerId: socket.id,
                message: message,
                timestamp: Date.now()
            });
        }
    });

    // Handle disconnect
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);
        
        // Remove player from game state
        delete players[socket.id];
        delete gameState.players[socket.id];
        
        // Notify other players
        socket.broadcast.emit('playerLeft', socket.id);
    });
});

// Game loop - runs at 60 FPS
setInterval(() => {
    // Update players
    Object.values(players).forEach(player => {
        player.update();
    });
    
    // Update police NPCs
    for (let i = policeNPCs.length - 1; i >= 0; i--) {
        const police = policeNPCs[i];
        police.update();
        
        // Remove dead or inactive police
        if (!police.isAlive) {
            policeNPCs.splice(i, 1);
        }
    }
    
    // Update bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        if (!bullet.update()) {
            bullets.splice(i, 1);
            // Notify clients that bullet was removed
            io.emit('bulletRemoved', bullet.id);
        }
    }
    
    // Handle collisions
    handlePlayerCollisions();
    handleBulletCollisions();
    
    // Update game state
    gameState.players = players;
    gameState.bullets = bullets;
    gameState.policeNPCs = policeNPCs;
    gameState.gameTime = Date.now();
    
    // Broadcast updated player positions and health
    const playerUpdates = {};
    Object.values(players).forEach(player => {
        playerUpdates[player.id] = {
            id: player.id,
            x: player.x,
            y: player.y,
            angle: player.angle,
            speed: player.speed,
            health: player.health,
            isAlive: player.isAlive,
            kills: player.kills,
            deaths: player.deaths,
            money: player.money,
            wanted: player.wanted
        };
    });
    
    // Broadcast police positions
    const policeUpdates = policeNPCs.map(police => ({
        id: police.id,
        x: police.x,
        y: police.y,
        angle: police.angle,
        speed: police.speed,
        health: police.health,
        isAlive: police.isAlive,
        targetId: police.targetId
    }));
    
    // Send periodic updates (every 10 frames = ~6 times per second)
    if (Date.now() % 166 < 16) { // Roughly every 166ms
        io.emit('gameUpdate', {
            players: playerUpdates,
            police: policeUpdates,
            bulletCount: bullets.length
        });
    }
}, 1000 / 60);

// Start server
server.listen(PORT, () => {
    console.log(`🚗 Thugs.io server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} to play!`);
});
