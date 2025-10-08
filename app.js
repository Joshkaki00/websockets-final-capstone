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
const gameState = {
    players: {},
    bullets: [],
    npcs: [],
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
        
        this.lastUpdate = Date.now();
    }

    takeDamage(damage, attackerId) {
        if (!this.isAlive) return false;
        
        this.health -= damage;
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
        
        // Award kill to attacker
        if (killerId && players[killerId] && killerId !== this.id) {
            players[killerId].kills++;
            players[killerId].money += 100; // Money for kill
        }
        
        console.log(`Player ${this.id} was killed by ${killerId || 'unknown'}`);
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

// Bullet collision with players
function handleBulletCollisions() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];
        let bulletHit = false;
        
        Object.values(players).forEach(player => {
            if (player.isAlive && 
                player.id !== bullet.playerId && 
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
        if (players[socket.id]) {
            // Validate movement data
            const player = players[socket.id];
            player.x = Math.max(0, Math.min(1600, data.x)); // Clamp to game world bounds
            player.y = Math.max(0, Math.min(1200, data.y));
            player.angle = data.angle;
            player.speed = data.speed;
            
            // Broadcast to other players
            socket.broadcast.emit('playerUpdate', {
                id: socket.id,
                x: player.x,
                y: player.y,
                angle: player.angle,
                speed: player.speed
            });
        }
    });

    // Handle shooting
    socket.on('playerShoot', (data) => {
        if (players[socket.id]) {
            const player = players[socket.id];
            // Broadcast bullet to all players
            io.emit('bulletFired', {
                playerId: socket.id,
                x: player.x,
                y: player.y,
                angle: data.angle,
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
    // Update game state
    Object.values(players).forEach(player => {
        player.update();
    });
    
    // You can add more game logic here like:
    // - NPC movement
    // - Vehicle physics
    // - Collision detection
    // - Wanted level updates
    
}, 1000 / 60);

// Start server
server.listen(PORT, () => {
    console.log(`🚗 Thugs.io server running on port ${PORT}`);
    console.log(`🌐 Open http://localhost:${PORT} to play!`);
});
