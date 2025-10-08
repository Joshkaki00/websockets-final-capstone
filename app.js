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
const gameState = {
    players: {},
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
        this.weapon = 'pistol';
        this.money = 0;
        this.wanted = 0;
        this.inVehicle = false;
        this.vehicleId = null;
        this.lastUpdate = Date.now();
    }

    update() {
        // Basic physics and movement will be handled on client side
        // Server validates and broadcasts updates
        this.lastUpdate = Date.now();
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
