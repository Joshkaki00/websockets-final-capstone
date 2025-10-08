# Thugs.io - 2D Multiplayer Crime Game

A real-time multiplayer 2D game inspired by early GTA games, built with Socket.IO and HTML5 Canvas.

## 🎮 Game Features

- **Real-time Multiplayer**: Play with multiple players simultaneously
- **GTA-Inspired Gameplay**: Top-down view with crime city theme
- **Socket.IO Integration**: Smooth real-time communication
- **Modern UI**: Retro-futuristic styling with neon colors
- **Chat System**: In-game communication
- **Minimap**: Navigate the crime city
- **Weapon System**: Combat mechanics
- **Health & Stats**: Player progression tracking

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm

### Installation & Running

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```
   Or for development with auto-restart:
   ```bash
   npm run dev
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## 🎯 Game Controls

- **WASD** - Move your character
- **Mouse** - Aim
- **Left Click** - Shoot
- **Enter** - Toggle chat
- **F** - Enter vehicle (future feature)

## 📁 Project Structure

```
thugs-io/
├── static/
│   ├── client.js     # Client-side game logic
│   ├── index.html    # Game interface
│   └── style.css     # GTA-inspired styling
├── app.js           # Server-side Socket.IO logic
├── package.json     # Dependencies and scripts
└── README.md        # This file
```

## 🔧 Technical Details

### Server (app.js)
- Express.js web server
- Socket.IO for real-time communication
- Player state management
- Game loop running at 60 FPS
- Collision detection and validation

### Client (client.js)
- HTML5 Canvas rendering
- Socket.IO client integration
- Input handling (keyboard/mouse)
- Camera system with smooth following
- Real-time player synchronization

### Features Implemented
- ✅ Real-time multiplayer movement
- ✅ Player shooting mechanics
- ✅ Chat system
- ✅ Minimap
- ✅ Health system
- ✅ Responsive UI
- ✅ Loading screens

### Future Enhancements
- 🔄 Vehicle system
- 🔄 NPC enemies
- 🔄 Weapon variety
- 🔄 Power-ups and items
- 🔄 Wanted level system
- 🔄 Sound effects
- 🔄 Game modes (team battles, missions)
- 🔄 Player customization
- 🔄 Leaderboards

## 🎨 Styling Theme

The game uses a retro-futuristic crime city aesthetic with:
- **Primary Colors**: Orange (#ff6b00) and Neon Green (#00ff41)
- **Typography**: Orbitron font for a cyberpunk feel
- **UI Elements**: Glowing borders and shadow effects
- **Color Scheme**: Dark backgrounds with bright accent colors

## 🌐 Multiplayer Architecture

- **Server Authority**: Server validates all player actions
- **Client Prediction**: Smooth movement with server reconciliation
- **Event-Based**: Socket.IO events for all game interactions
- **Scalable**: Designed to handle multiple concurrent players

## 🐛 Development Notes

- The game runs at 60 FPS on both client and server
- World bounds are set to 1600x1200 pixels
- Player movement is clamped to world boundaries
- Bullets have a 2-second lifetime
- Chat messages are limited to 100 characters

## 📝 License

MIT License - Feel free to use this for your capstone project!
