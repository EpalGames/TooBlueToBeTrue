import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Diamond, Heart, ShieldAlert, Settings, Pause, Play, RefreshCw, MonitorPlay, Vibrate, Home, Trophy, Send, Volume2 } from 'lucide-react';

type GameState = 'LOADING' | 'NAME_INPUT' | 'MENU' | 'PLAYING' | 'BOSS_TRANSITION' | 'BOSS' | 'GAME_OVER' | 'VICTORY' | 'LEADERBOARD' | 'SETTINGS';

interface Boss {
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  state: 'idle' | 'attack1' | 'attack2' | 'attack3' | 'special' | 'ultra';
  timer: number;
  phase: number;
  dx: number;
}

interface Entity {
  x: number;
  y: number;
  radius: number;
  speed: number;
  rotation: number;
  rotSpeed: number;
  type: 'diamond' | 'rock';
  color?: string;
  points?: number;
  damage?: number;
  vertices?: { x: number; y: number }[];
}

interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  dx: number;
  invincibleTimer: number;
  facingRight: boolean;
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState>('LOADING');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [highScore, setHighScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [bossHealth, setBossHealth] = useState(1000);
  const [maxBossHealth, setMaxBossHealth] = useState(1000);
  
  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<{name: string, score: number, date: string}[]>([]);
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('playerName') || '');
  const [scoreSubmitted, setScoreSubmitted] = useState(false);
  
  // Settings & QoL State
  const [fpsLimit, setFpsLimit] = useState<number>(144);
  const [isPaused, setIsPaused] = useState(false);
  const [enableScreenShake, setEnableScreenShake] = useState(true); // QoL 5: Screen Shake Toggle
  const [enableBetterEffects, setEnableBetterEffects] = useState(true); // QoL 6: Better Effects Toggle
  const [diamondCurrency, setDiamondCurrency] = useState(() => Number(localStorage.getItem('diamondCurrency')) || 0);
  const [musicVolume, setMusicVolume] = useState(() => parseFloat(localStorage.getItem('musicVolume') ?? '0.5'));

  // Game loop refs
  const audioRef = useRef<HTMLAudioElement>(null);
  const requestRef = useRef<number>(0);
  const playerRef = useRef<Player>({ x: 0, y: 0, width: 40, height: 80, speed: 8, dx: 0, invincibleTimer: 0, facingRight: true });
  const entitiesRef = useRef<Entity[]>([]);
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const lastTimeRef = useRef<number>(0);
  const spawnTimerRef = useRef<number>(0);
  const difficultyRef = useRef<number>(1);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; isBullet?: boolean }[]>([]);
  const shakeTimerRef = useRef<number>(0);
  const gameTimerRef = useRef<number>(120);
  const bossRef = useRef<Boss | null>(null);
  const easterEgg67TimerRef = useRef<number>(0);
  const hasTriggered67Ref = useRef<boolean>(false);
  
  // Refs for state accessed inside the game loop
  const fpsLimitRef = useRef(fpsLimit);
  const isPausedRef = useRef(isPaused);
  const gameStateRef = useRef(gameState);
  const enableScreenShakeRef = useRef(enableScreenShake);
  const enableBetterEffectsRef = useRef(enableBetterEffects);

  useEffect(() => { fpsLimitRef.current = fpsLimit; }, [fpsLimit]);
  useEffect(() => { enableScreenShakeRef.current = enableScreenShake; }, [enableScreenShake]);
  useEffect(() => { enableBetterEffectsRef.current = enableBetterEffects; }, [enableBetterEffects]);
  
  useEffect(() => {
    localStorage.setItem('musicVolume', musicVolume.toString());
    if (audioRef.current) {
      audioRef.current.volume = musicVolume;
    }
  }, [musicVolume]);

  useEffect(() => {
    if (!audioRef.current) return;
    if (gameState === 'MENU' || gameState === 'SETTINGS' || gameState === 'LEADERBOARD') {
      audioRef.current.play().catch(e => console.log('Audio autoplay prevented:', e));
    } else {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [gameState]);

  useEffect(() => { 
    if (!isPausedRef.current && isPaused) {
      // Pausing
    } else if (isPausedRef.current && !isPaused) {
      // Unpausing - reset lastTime to prevent huge delta jump
      lastTimeRef.current = performance.now();
    }
    isPausedRef.current = isPaused; 
  }, [isPaused]);
  useEffect(() => { gameStateRef.current = gameState; }, [gameState]);

  // QoL 4: Auto-Pause on Window Blur
  useEffect(() => {
    const handleBlur = () => {
      if (gameStateRef.current === 'PLAYING') {
        setIsPaused(true);
      }
    };
    window.addEventListener('blur', handleBlur);
    return () => window.removeEventListener('blur', handleBlur);
  }, []);

  useEffect(() => {
    if (gameState === 'LOADING') {
      const timer = setTimeout(() => {
        if (localStorage.getItem('playerName')) {
          setGameState('MENU');
        } else {
          setGameState('NAME_INPUT');
        }
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [gameState]);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      setLeaderboard(data);
    } catch (e) {
      console.error('Failed to fetch leaderboard:', e);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Initialize game
  const initGame = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    playerRef.current = {
      x: canvas.width / 2 - 20,
      y: canvas.height - 140,
      width: 40,
      height: 80,
      speed: 8,
      dx: 0,
      invincibleTimer: 0,
      facingRight: true
    };
    entitiesRef.current = [];
    particlesRef.current = [];
    shakeTimerRef.current = 0;
    easterEgg67TimerRef.current = 0;
    hasTriggered67Ref.current = false;
    gameTimerRef.current = 120;
    setTimeLeft(120);
    bossRef.current = null;
    setScore(0);
    setLives(3);
    setScoreSubmitted(false);
    difficultyRef.current = 1;
    spawnTimerRef.current = 0;
    setGameState('PLAYING');
    setIsPaused(false);
    lastTimeRef.current = performance.now();
  };

  // Input handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true;
      
      if ((e.code === 'Escape' || e.code === 'KeyP') && gameStateRef.current === 'PLAYING') {
        setIsPaused(prev => !prev);
      }
      
      if (e.code === 'KeyR' && (gameStateRef.current === 'GAME_OVER' || isPausedRef.current)) {
        initGame();
      }

      if (e.code === 'KeyM' && isPausedRef.current) {
        setGameState('MENU');
        setIsPaused(false);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    if (gameState === 'GAME_OVER' || gameState === 'VICTORY') {
      setHighScore(prev => Math.max(prev, score));
      if (score > 0 && !scoreSubmitted && playerName.trim()) {
        fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: playerName.trim(), score })
        }).then(() => {
          setScoreSubmitted(true);
          fetchLeaderboard();
        }).catch(e => console.error(e));
      }
    }
  }, [gameState, score, playerName, scoreSubmitted]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        if (playerRef.current.y > canvas.height - 140) {
          playerRef.current.y = canvas.height - 140;
        }
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Main Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const createParticles = (x: number, y: number, color: string, count: number) => {
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x, y,
          vx: (Math.random() - 0.5) * 12,
          vy: (Math.random() - 0.5) * 12,
          life: 1,
          color,
          size: Math.random() * 5 + 2
        });
      }
    };

    const generateRockVertices = (radius: number) => {
      const vertices = [];
      const numPoints = 7 + Math.floor(Math.random() * 5);
      for (let i = 0; i < numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        const r = radius * (0.7 + Math.random() * 0.4);
        vertices.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r });
      }
      return vertices;
    };

    const drawCaveBackground = (time: number) => {
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, '#1e1b4b'); // deep indigo
      bgGrad.addColorStop(1, '#0f172a'); // slate
      
      // Draw slightly larger to cover screen shake gaps
      ctx.fillStyle = bgGrad;
      ctx.fillRect(-20, -20, canvas.width + 40, canvas.height + 40);

      ctx.fillStyle = '#0a0818'; 
      
      // Left Wall
      ctx.beginPath();
      ctx.moveTo(-20, -20);
      for(let y = -20; y <= canvas.height; y += 50) {
        const xOffset = Math.sin(y * 0.01) * 40;
        ctx.lineTo(80 + xOffset, y);
      }
      ctx.lineTo(-20, canvas.height + 20);
      ctx.fill();

      // Right Wall
      ctx.beginPath();
      ctx.moveTo(canvas.width + 20, -20);
      for(let y = -20; y <= canvas.height; y += 50) {
        const xOffset = Math.sin(y * 0.015) * 40;
        ctx.lineTo(canvas.width - 80 + xOffset, y);
      }
      ctx.lineTo(canvas.width + 20, canvas.height + 20);
      ctx.fill();

      // Ground
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, canvas.height - 60, canvas.width, 60);
      
      // Ground details
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, canvas.height - 50, canvas.width, 50);
    };

    const drawHumanPlayer = (player: Player, time: number) => {
      ctx.save();
      ctx.translate(player.x + player.width / 2, player.y + player.height / 2);
      
      if (!player.facingRight) {
        ctx.scale(-1, 1);
      }
      
      if (player.invincibleTimer > 0) {
        ctx.globalAlpha = Math.floor(time / 100) % 2 === 0 ? 0.4 : 1;
      }

      const isWalking = Math.abs(player.dx) > 0.1;
      const walkAngle = isWalking ? Math.sin(time * 0.015) * 0.8 : 0;

      // Backpack
      ctx.fillStyle = '#1e3a8a';
      ctx.beginPath();
      ctx.roundRect(-20, -15, 15, 25, 4);
      ctx.fill();
      
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.roundRect(-22, -10, 5, 15, 2);
      ctx.fill();

      // Back Arm
      ctx.save();
      ctx.translate(0, -10);
      ctx.rotate(-walkAngle);
      ctx.fillStyle = '#1d4ed8';
      ctx.beginPath();
      ctx.roundRect(-4, 0, 8, 25, 4);
      ctx.fill();
      ctx.restore();

      // Back Leg
      ctx.save();
      ctx.translate(0, 15);
      ctx.rotate(-walkAngle);
      ctx.fillStyle = '#1e40af';
      ctx.beginPath();
      ctx.roundRect(-5, 0, 10, 25, 4);
      ctx.fill();
      ctx.restore();

      // Torso
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.roundRect(-10, -15, 20, 35, 6);
      ctx.fill();

      // Suit accents
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-5, -10);
      ctx.lineTo(5, 5);
      ctx.stroke();

      // Head
      ctx.save();
      ctx.translate(0, -25);
      if (isWalking) ctx.translate(0, Math.abs(Math.sin(time * 0.015)) * 2);
      
      ctx.fillStyle = '#fcd34d'; // Skin
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();

      // Goggles
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.roundRect(2, -4, 12, 8, 2);
      ctx.fill();
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(4, -2, 4, 4);

      // Hair
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.moveTo(-12, 2);
      ctx.lineTo(-14, -8);
      ctx.lineTo(-6, -14);
      ctx.lineTo(4, -12);
      ctx.lineTo(12, -6);
      ctx.lineTo(8, -2);
      ctx.lineTo(0, -8);
      ctx.fill();
      ctx.restore();

      // Front Leg
      ctx.save();
      ctx.translate(0, 15);
      ctx.rotate(walkAngle);
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.roundRect(-5, 0, 10, 25, 4);
      ctx.fill();
      ctx.restore();

      // Front Arm
      ctx.save();
      ctx.translate(0, -10);
      ctx.rotate(walkAngle);
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.roundRect(-4, 0, 8, 25, 4);
      ctx.fill();
      ctx.restore();

      ctx.restore();
    };

    const update = (time: number) => {
      const now = performance.now();
      const elapsed = now - lastTimeRef.current;
      const fpsInterval = 1000 / fpsLimitRef.current;

      if (elapsed < fpsInterval) {
        animationFrameId = requestAnimationFrame(update);
        return;
      }
      
      lastTimeRef.current = now; // Fix: Set to now to prevent double-counting remainders
      const timeScale = Math.min(elapsed / 16.66, 3);

      ctx.save(); // Save context before screen shake

      // Apply Screen Shake
      if (enableScreenShakeRef.current && shakeTimerRef.current > 0) {
        const intensity = (shakeTimerRef.current / 300) * 12; // Max 12px shake
        const dx = (Math.random() - 0.5) * intensity;
        const dy = (Math.random() - 0.5) * intensity;
        ctx.translate(dx, dy);
        
        if (!isPausedRef.current) {
          shakeTimerRef.current -= elapsed;
        }
      }

      // Apply 67 Easter Egg Wobble
      if (easterEgg67TimerRef.current > 0) {
        const wobbleX = Math.sin(now / 30) * 15;
        const wobbleY = Math.cos(now / 40) * 15;
        ctx.translate(wobbleX, wobbleY);
        
        if (!isPausedRef.current) {
          easterEgg67TimerRef.current -= elapsed;
        }
      }

      drawCaveBackground(now);

      if (gameStateRef.current === 'LOADING' || gameStateRef.current === 'GAME_OVER' || gameStateRef.current === 'VICTORY' || gameStateRef.current === 'LEADERBOARD' || gameStateRef.current === 'NAME_INPUT') {
        ctx.restore(); // Restore shake translation
        animationFrameId = requestAnimationFrame(update);
        return;
      }

      const player = playerRef.current;

      if (!isPausedRef.current) {
        // --- GAME LOGIC ---
        if (gameStateRef.current === 'MENU') {
          // Decorative menu diamonds
          if (Math.random() < 0.08 * timeScale) {
            const isLeft = Math.random() > 0.5;
            const x = isLeft ? Math.random() * (canvas.width * 0.25) : canvas.width - Math.random() * (canvas.width * 0.25);
            const radius = 10 + Math.random() * 20;
            entitiesRef.current.push({
              x,
              y: -radius * 2,
              radius,
              speed: 2 + Math.random() * 4,
              rotation: Math.random() * Math.PI * 2,
              rotSpeed: (Math.random() - 0.5) * 0.1,
              type: 'diamond',
              color: ['#38bdf8', '#bae6fd', '#1d4ed8'][Math.floor(Math.random() * 3)],
            });
          }
          for (let i = entitiesRef.current.length - 1; i >= 0; i--) {
            const entity = entitiesRef.current[i];
            entity.y += entity.speed * timeScale;
            entity.rotation += entity.rotSpeed * timeScale;
            if (entity.y > canvas.height + 50) {
              entitiesRef.current.splice(i, 1);
            }
          }
        } else {
          if (gameStateRef.current === 'PLAYING') {
            gameTimerRef.current -= elapsed / 1000;
          if (gameTimerRef.current <= 0) {
            gameTimerRef.current = 0;
            setGameState('BOSS_TRANSITION');
            // Initialize Boss Kermelis
            const bossMaxHp = 3000 + score * 7.5; // Power scales with diamonds (Buffed 50%)
            bossRef.current = {
              x: canvas.width / 2 - 80,
              y: -200,
              width: 160,
              height: 160,
              health: bossMaxHp,
              maxHealth: bossMaxHp,
              state: 'idle',
              timer: 0,
              phase: 1,
              dx: 4 // Buffed speed
            };
            setBossHealth(bossMaxHp);
            setMaxBossHealth(bossMaxHp);
          }
          // Update UI timer every second
          if (Math.floor(gameTimerRef.current) !== timeLeft) {
            setTimeLeft(Math.floor(gameTimerRef.current));
          }
        }

        if (keysRef.current['ArrowLeft'] || keysRef.current['KeyA']) {
          player.dx -= 1.5 * timeScale;
          player.facingRight = false;
        } else if (keysRef.current['ArrowRight'] || keysRef.current['KeyD']) {
          player.dx += 1.5 * timeScale;
          player.facingRight = true;
        } else {
          player.dx *= Math.pow(0.8, timeScale);
        }
        
        player.dx = Math.max(-player.speed, Math.min(player.speed, player.dx));
        player.x += player.dx * timeScale;

        if (player.x < 60) {
          player.x = 60;
          player.dx = 0;
        }
        if (player.x + player.width > canvas.width - 60) {
          player.x = canvas.width - player.width - 60;
          player.dx = 0;
        }

        if (player.invincibleTimer > 0) {
          player.invincibleTimer -= elapsed;
        }

        // Better Effects: Player Trail
        if (enableBetterEffectsRef.current && Math.abs(player.dx) > 1 && Math.random() < 0.3 * timeScale) {
          particlesRef.current.push({
            x: player.x + player.width / 2 + (Math.random() - 0.5) * 20,
            y: player.y + player.height - 10,
            vx: -player.dx * 0.2 + (Math.random() - 0.5),
            vy: Math.random() * 2,
            life: 1,
            color: '#38bdf8',
            size: 2 + Math.random() * 3
          });
        }

        if (gameStateRef.current === 'PLAYING') {
          spawnTimerRef.current += elapsed;
          const spawnRate = Math.max(200, 1000 - difficultyRef.current * 40); 
          const speedMultiplier = gameTimerRef.current <= 30 ? 2.0 : (gameTimerRef.current <= 60 ? 1.5 : 1); // Faster at 1 min, fastest at 30s
          
          if (spawnTimerRef.current > spawnRate) {
            spawnTimerRef.current = 0;
            const isDiamond = Math.random() > 0.6; 
            
            let color = '#38bdf8';
            let points = 0;
            let damage = 0;

            if (isDiamond) {
              const rand = Math.random();
              if (rand < 0.1) { color = '#ef4444'; damage = 3; } // Red (3 dmg)
              else if (rand < 0.25) { color = '#fcd34d'; damage = 2; } // Gold (2 dmg)
              else if (rand < 0.5) { color = '#1d4ed8'; points = 5; } // Deep Blue
              else if (rand < 0.75) { color = '#38bdf8'; points = 3; } // Normal Blue
              else { color = '#bae6fd'; points = 1; } // Light Blue
            }
            
            let radius = isDiamond ? 16 : 20 + Math.random() * 25;
            let speed = (3 + Math.random() * 4) * (1 + difficultyRef.current * 0.08) * speedMultiplier;

            if (isDiamond) {
              if (color === '#ef4444') {
                radius *= 1.5;
                speed *= 1.1;
              } else if (color === '#fcd34d') {
                radius *= 2;
                speed *= 1.2;
              }
            } else {
              if (radius > 35) {
                speed *= 1.3; // Big rocks fall faster
              }
            }
            
            entitiesRef.current.push({
              x: Math.random() * (canvas.width - 200) + 100,
              y: -radius * 2,
              radius,
              speed,
              rotation: Math.random() * Math.PI * 2,
              rotSpeed: (Math.random() - 0.5) * 0.1,
              type: isDiamond ? 'diamond' : 'rock',
              color,
              points,
              damage,
              vertices: isDiamond ? undefined : generateRockVertices(radius)
            });
          }
        }

        // Boss Logic
        if (gameStateRef.current === 'BOSS_TRANSITION' && bossRef.current) {
          const boss = bossRef.current;
          boss.y += 2 * timeScale;
          if (boss.y >= 50) {
            setGameState('BOSS');
          }
        } else if (gameStateRef.current === 'BOSS' && bossRef.current) {
          const boss = bossRef.current;
          boss.timer += elapsed;
          
          // Phase 2 check
          if (boss.health <= boss.maxHealth / 2 && boss.phase === 1) {
            boss.phase = 2;
            boss.dx *= 1.5; // Faster movement
          }
          
          // Phase 3 check (Gold Health)
          if (boss.health <= boss.maxHealth * 0.25 && boss.phase === 2) {
            boss.phase = 3;
            boss.dx *= 1.08; // 8% faster
          }

          // Boss Movement
          boss.x += boss.dx * timeScale;
          if (boss.x < 60) {
            boss.x = 60;
            boss.dx = Math.abs(boss.dx);
          } else if (boss.x + boss.width > canvas.width - 60) {
            boss.x = canvas.width - 60 - boss.width;
            boss.dx = -Math.abs(boss.dx);
          }

          // Boss Attacks
          const attackThreshold = boss.phase === 3 ? 600 : (boss.phase === 2 ? 800 : 1200); // Buffed attack speed
          if (boss.timer > attackThreshold) {
            boss.timer = 0;
            const attackType = Math.random();
            
            if (boss.phase === 3 && attackType < 0.25) {
              boss.state = 'phase3_ulti'; // Phase 3 Ulti
              for (let i = 0; i < 8; i++) {
                const radius = 20;
                entitiesRef.current.push({
                  x: 100 + i * ((canvas.width - 200) / 7),
                  y: boss.y + boss.height,
                  radius,
                  speed: 15,
                  rotation: 0,
                  rotSpeed: 0.2,
                  type: 'diamond',
                  color: '#fcd34d',
                  damage: 2
                });
              }
            } else if (boss.phase >= 2 && attackType < 0.4) {
              boss.state = 'ultra'; // Ultra attack
              for (let i = 0; i < 5; i++) {
                const radius = 35;
                entitiesRef.current.push({
                  x: 100 + i * ((canvas.width - 200) / 4),
                  y: boss.y + boss.height,
                  radius,
                  speed: 8,
                  rotation: 0,
                  rotSpeed: 0.1,
                  type: 'rock',
                  vertices: generateRockVertices(radius)
                });
              }
            } else if (attackType < 0.55) {
              boss.state = 'attack1'; // Drop rocks
              for (let i = 0; i < 3; i++) {
                const radius = 25 + Math.random() * 15;
                entitiesRef.current.push({
                  x: boss.x + boss.width / 2 + (Math.random() - 0.5) * 100,
                  y: boss.y + boss.height,
                  radius,
                  speed: 5 + Math.random() * 3,
                  rotation: 0,
                  rotSpeed: (Math.random() - 0.5) * 0.2,
                  type: 'rock',
                  vertices: generateRockVertices(radius)
                });
              }
            } else if (attackType < 0.75) {
              boss.state = 'attack2'; // Fast rocks
              const radius = 20;
              entitiesRef.current.push({
                x: boss.x + boss.width / 2,
                y: boss.y + boss.height,
                radius,
                speed: 12,
                rotation: 0,
                rotSpeed: 0.2,
                type: 'rock',
                vertices: generateRockVertices(radius)
              });
            } else if (attackType < 0.9) {
              boss.state = 'attack3'; // Diamond bait (drops a diamond)
              const isRed = Math.random() < 0.25; // 25% chance for red diamond
              const radius = isRed ? 16 * 1.5 : 16 * 2;
              entitiesRef.current.push({
                x: boss.x + boss.width / 2,
                y: boss.y + boss.height,
                radius: radius,
                speed: isRed ? 6 * 1.1 : 4 * 1.2,
                rotation: 0,
                rotSpeed: 0.1,
                type: 'diamond',
                color: isRed ? '#ef4444' : '#fcd34d',
                damage: isRed ? 3 : 1
              });
            } else {
              boss.state = 'special'; // Giant rock
              const radius = 60;
              entitiesRef.current.push({
                x: boss.x + boss.width / 2,
                y: boss.y + boss.height,
                radius,
                speed: 5, // Faster giant rock
                rotation: 0,
                rotSpeed: 0.05,
                type: 'rock',
                vertices: generateRockVertices(radius)
              });
            }
          } else if (boss.timer > 500) {
            boss.state = 'idle';
          }

          // Player shooting boss (auto-shoot if playing)
          if (Math.random() < 0.15 * timeScale) {
            // Player shoots upward
            particlesRef.current.push({
              x: player.x + player.width / 2,
              y: player.y,
              vx: 0,
              vy: -15,
              life: 1,
              color: '#38bdf8',
              size: 4,
              isBullet: true
            });
          }
        }

        // Particle vs Boss collision
        if (gameStateRef.current === 'BOSS' && bossRef.current) {
          const boss = bossRef.current;
          for (let i = particlesRef.current.length - 1; i >= 0; i--) {
            const p = particlesRef.current[i];
            if (p.isBullet && p.y < boss.y + boss.height && p.x > boss.x && p.x < boss.x + boss.width) {
              // Hit boss
              particlesRef.current.splice(i, 1);
              let damage = 10 + (score / 100); // Damage scales with score
              if (boss.health <= boss.maxHealth * 0.25) {
                damage *= 0.5; // Half damage at 25% health
              }
              boss.health -= damage;
              setBossHealth(Math.floor(boss.health));
              createParticles(p.x, p.y, boss.health <= boss.maxHealth * 0.25 ? '#fcd34d' : '#ef4444', enableBetterEffectsRef.current ? 10 : 5);
              
              if (boss.health <= 0) {
                setGameState('VICTORY');
                setScore(s => s + 5000);
              }
            }
          }
        }

        for (let i = entitiesRef.current.length - 1; i >= 0; i--) {
          const entity = entitiesRef.current[i];
          entity.y += entity.speed * timeScale;
          entity.rotation += entity.rotSpeed * timeScale;

          const px = player.x + player.width / 2;
          const py = player.y + player.height / 2;
          
          const dx = px - entity.x;
          const dy = py - entity.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < entity.radius + player.width / 2) {
            if (entity.type === 'diamond' && !entity.damage) {
              setScore(s => {
                const newScore = s + (entity.points || 1);
                difficultyRef.current = 1 + Math.floor(newScore / 150) * 0.5;
                if (newScore === 67 && !hasTriggered67Ref.current) {
                  hasTriggered67Ref.current = true;
                  easterEgg67TimerRef.current = 3000;
                }
                return newScore;
              });
              setDiamondCurrency(d => {
                const newD = d + (entity.points || 1);
                localStorage.setItem('diamondCurrency', newD.toString());
                return newD;
              });
              createParticles(entity.x, entity.y, entity.color || '#38bdf8', 20);
              entitiesRef.current.splice(i, 1);
              continue;
            } else if (player.invincibleTimer <= 0) {
              const dmg = entity.damage || 1;
              setLives(l => {
                const newLives = l - dmg;
                if (newLives <= 0) {
                  setGameState('GAME_OVER');
                }
                return newLives;
              });
              createParticles(entity.x, entity.y, '#94a3b8', 30);
              createParticles(px, py, '#ef4444', 15);
              
              player.invincibleTimer = 1500;
              shakeTimerRef.current = 300; // Trigger screen shake
              
              entitiesRef.current.splice(i, 1);
              continue;
            }
          }

          // Floor collision
          if (entity.y + entity.radius > canvas.height - 60) {
            if (entity.type === 'rock') {
              createParticles(entity.x, canvas.height - 60, '#94a3b8', 15);
            }
            entitiesRef.current.splice(i, 1);
            continue;
          }
        }

        for (let i = particlesRef.current.length - 1; i >= 0; i--) {
          const p = particlesRef.current[i];
          p.x += p.vx * timeScale;
          p.y += p.vy * timeScale;
          p.life -= 0.02 * timeScale;
          
          if (p.life <= 0) {
            particlesRef.current.splice(i, 1);
          }
        }
        } // End of non-MENU logic
      }

      // --- RENDERING ---
      if (gameStateRef.current !== 'MENU') {
        drawHumanPlayer(player, now);
      }

      if (bossRef.current && (gameStateRef.current === 'BOSS_TRANSITION' || gameStateRef.current === 'BOSS')) {
        const boss = bossRef.current;
        ctx.save();
        ctx.translate(boss.x + boss.width / 2, boss.y + boss.height / 2);
        
        // Boss body (Suit)
        ctx.fillStyle = '#1e293b'; // Dark slate/black suit
        ctx.beginPath();
        // Shoulders and torso
        ctx.moveTo(-60, 0); // Left shoulder
        ctx.lineTo(60, 0);  // Right shoulder
        ctx.lineTo(65, 80); // Right hip
        ctx.lineTo(-65, 80); // Left hip
        ctx.closePath();
        ctx.fill();

        // High collar
        ctx.fillStyle = '#0f172a'; // Darker collar
        ctx.beginPath();
        ctx.roundRect(-25, -15, 50, 25, 5);
        ctx.fill();

        // Suit center line (zipper/seam)
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, 10);
        ctx.lineTo(0, 80);
        ctx.stroke();

        // Arms (hanging down)
        ctx.fillStyle = '#1e293b';
        ctx.beginPath();
        ctx.roundRect(-75, 0, 25, 70, 10);
        ctx.roundRect(50, 0, 25, 70, 10);
        ctx.fill();

        // Hands
        ctx.fillStyle = '#cbd5e1'; // Pale skin tone
        ctx.beginPath();
        ctx.arc(-62.5, 70, 12, 0, Math.PI * 2);
        ctx.arc(62.5, 70, 12, 0, Math.PI * 2);
        ctx.fill();

        // Head (Bald with gray hair on sides)
        const skinColor = boss.phase === 2 ? '#fca5a5' : '#cbd5e1'; // Pale skin tone, red if angry
        
        // Gray hair on sides (fluffy)
        ctx.fillStyle = '#94a3b8'; // Gray hair
        ctx.beginPath();
        // Left hair fluff
        ctx.arc(-35, -45, 15, 0, Math.PI * 2);
        ctx.arc(-42, -30, 12, 0, Math.PI * 2);
        ctx.arc(-35, -15, 10, 0, Math.PI * 2);
        // Right hair fluff
        ctx.arc(35, -45, 15, 0, Math.PI * 2);
        ctx.arc(42, -30, 12, 0, Math.PI * 2);
        ctx.arc(35, -15, 10, 0, Math.PI * 2);
        ctx.fill();

        // Head base (Oval)
        ctx.fillStyle = skinColor;
        ctx.beginPath();
        ctx.ellipse(0, -35, 35, 45, 0, 0, Math.PI * 2);
        ctx.fill();

        // Forehead wrinkles
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-15, -65);
        ctx.lineTo(15, -65);
        ctx.moveTo(-20, -58);
        ctx.lineTo(20, -58);
        ctx.stroke();

        // Angry Eyebrows (Thick gray)
        ctx.strokeStyle = '#64748b'; // Darker gray
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-25, -40);
        ctx.lineTo(-5, -30);
        ctx.moveTo(25, -40);
        ctx.lineTo(5, -30);
        ctx.stroke();

        // Eyes
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        // Stern eye shape
        ctx.ellipse(-15, -25, 8, 4, 0, 0, Math.PI * 2);
        ctx.ellipse(15, -25, 8, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        
        // Pupils
        ctx.fillStyle = (boss.state === 'special' || boss.state === 'ultra' || boss.phase === 2) ? '#ef4444' : '#1e3a8a'; // Blue or red pupils
        ctx.beginPath();
        ctx.arc(-15, -25, 3, 0, Math.PI * 2);
        ctx.arc(15, -25, 3, 0, Math.PI * 2);
        ctx.fill();

        // Eye bags
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(-15, -20, 8, Math.PI, 0, true);
        ctx.arc(15, -20, 8, Math.PI, 0, true);
        ctx.stroke();

        // Nose (Prominent)
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -30);
        ctx.lineTo(-6, -10);
        ctx.lineTo(6, -10);
        ctx.stroke();

        // Nasolabial folds (smile/frown lines)
        ctx.beginPath();
        ctx.moveTo(-10, -5);
        ctx.quadraticCurveTo(-15, 5, -20, 15);
        ctx.moveTo(10, -5);
        ctx.quadraticCurveTo(15, 5, 20, 15);
        ctx.stroke();

        // Mouth (Stern frown)
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 2;
        ctx.beginPath();
        if (boss.state === 'idle' && boss.phase === 1) {
          ctx.moveTo(-15, 5);
          ctx.quadraticCurveTo(0, 0, 15, 5); // Frown
          ctx.stroke();
        } else {
          // Yelling
          ctx.fillStyle = '#000000';
          ctx.ellipse(0, 5, 10, 8, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        // Chin crease
        ctx.beginPath();
        ctx.arc(0, 15, 6, 0, Math.PI);
        ctx.stroke();
        
        ctx.restore();
      }

      for (let i = 0; i < entitiesRef.current.length; i++) {
        const entity = entitiesRef.current[i];
        ctx.save();
        ctx.translate(entity.x, entity.y);
        ctx.rotate(entity.rotation);

        if (entity.type === 'diamond') {
          const mainColor = entity.color || '#38bdf8';
          let lightColor = '#bae6fd';
          if (mainColor === '#fcd34d') lightColor = '#fef3c7';
          else if (mainColor === '#ef4444') lightColor = '#fca5a5';
          else if (mainColor === '#1d4ed8') lightColor = '#60a5fa';
          else if (mainColor === '#bae6fd') lightColor = '#e0f2fe';
          
          const r = entity.radius;
          
          ctx.fillStyle = mainColor;
          ctx.strokeStyle = lightColor;
          ctx.lineWidth = 2;
          
          // Classic Diamond Shape
          ctx.beginPath();
          ctx.moveTo(-r * 0.6, -r * 0.5); // Top left
          ctx.lineTo(r * 0.6, -r * 0.5);  // Top right
          ctx.lineTo(r, -r * 0.1);        // Mid right
          ctx.lineTo(0, r * 0.8);         // Bottom point
          ctx.lineTo(-r, -r * 0.1);       // Mid left
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          // Facets
          ctx.beginPath();
          ctx.moveTo(-r * 0.6, -r * 0.5);
          ctx.lineTo(0, -r * 0.1);
          ctx.lineTo(r * 0.6, -r * 0.5);
          ctx.moveTo(-r, -r * 0.1);
          ctx.lineTo(r, -r * 0.1);
          ctx.moveTo(0, -r * 0.1);
          ctx.lineTo(0, r * 0.8);
          ctx.stroke();
          
          // Highlight
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.beginPath();
          ctx.moveTo(-r * 0.6, -r * 0.5);
          ctx.lineTo(0, -r * 0.5);
          ctx.lineTo(-r * 0.2, -r * 0.1);
          ctx.lineTo(-r, -r * 0.1);
          ctx.closePath();
          ctx.fill();

        } else {
          ctx.fillStyle = '#475569';
          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 3;
          ctx.beginPath();
          if (entity.vertices) {
            ctx.moveTo(entity.vertices[0].x, entity.vertices[0].y);
            for (let j = 1; j < entity.vertices.length; j++) {
              ctx.lineTo(entity.vertices[j].x, entity.vertices[j].y);
            }
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          
          ctx.fillStyle = '#334155';
          ctx.beginPath();
          ctx.arc(entity.radius * 0.3, entity.radius * 0.2, entity.radius * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      for (let i = 0; i < particlesRef.current.length; i++) {
        const p = particlesRef.current[i];
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        if (p.isBullet) {
          ctx.fillRect(p.x - p.size/2, p.y - p.size*2, p.size, p.size * 4);
        } else {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // Draw 67 Easter Egg Texts
      if (easterEgg67TimerRef.current > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, easterEgg67TimerRef.current / 500)})`;
        ctx.font = '900 64px Inter';
        ctx.textAlign = 'center';
        for (let x = 0; x < canvas.width + 100; x += 120) {
            for (let y = 0; y < canvas.height + 100; y += 100) {
                ctx.fillText('67', x + Math.sin(now/200 + y)*30, y + Math.cos(now/200 + x)*30);
            }
        }
      }

      ctx.restore(); // Restore shake translation

      if (isPausedRef.current) {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = 'italic 900 64px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
        
        ctx.font = '600 20px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Press P or ESC to resume', canvas.width / 2, canvas.height / 2 + 50);
        ctx.fillText('Press R to quick restart', canvas.width / 2, canvas.height / 2 + 80);
        ctx.fillText('Press M for Main Menu', canvas.width / 2, canvas.height / 2 + 110);
      }

      animationFrameId = requestAnimationFrame(update);
    };

    lastTimeRef.current = performance.now();
    animationFrameId = requestAnimationFrame(update);

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 selection:bg-blue-500/30">
      {gameState === 'LOADING' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1 }}
            className="text-center"
          >
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-sky-300 to-blue-600 mb-4 italic">
              TooBlueToBeTrue
            </h1>
            <p className="text-slate-400 font-bold tracking-widest uppercase">A game made by EpalGames</p>
            <div className="mt-8 w-64 h-2 bg-slate-800 rounded-full overflow-hidden mx-auto">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 2.5, ease: "easeInOut" }}
                className="h-full bg-blue-500"
              />
            </div>
          </motion.div>
        </div>
      )}

      <canvas
        ref={canvasRef}
        className="block w-full h-full"
      />

      {/* HUD */}
      {(gameState === 'PLAYING' || gameState === 'BOSS_TRANSITION' || gameState === 'BOSS') && (
        <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start pointer-events-none z-10">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-6 py-3 rounded-2xl border-b-4 border-slate-800 shadow-2xl skew-x-[-5deg]">
              <Diamond className="w-8 h-8 text-sky-400 skew-x-[5deg]" />
              <span className="text-4xl font-black text-white tracking-tighter skew-x-[5deg]">{score}</span>
            </div>
            {gameState === 'PLAYING' && (
              <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-xl border-b-2 border-slate-800 shadow-lg skew-x-[-5deg] mt-2">
                <span className="text-xl font-bold text-rose-400 skew-x-[5deg]">
                  {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                </span>
              </div>
            )}
          </div>
          
          {gameState === 'BOSS' && (
            <div className="absolute top-6 left-1/2 -translate-x-1/2 w-1/2 max-w-md flex flex-col items-center gap-2">
              <span className="text-rose-500 font-black tracking-widest uppercase text-xl drop-shadow-lg">Kermelis</span>
              <div className="w-full h-6 bg-slate-900/80 rounded-full border-2 border-slate-800 overflow-hidden shadow-2xl">
                <div 
                  className={`h-full transition-all duration-200 ${bossHealth <= maxBossHealth * 0.25 ? 'bg-gradient-to-r from-yellow-500 to-yellow-300' : 'bg-gradient-to-r from-rose-600 to-rose-400'}`}
                  style={{ width: `${Math.max(0, (bossHealth / maxBossHealth) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex flex-col items-end gap-4 pointer-events-auto">
            <div className="flex gap-2 bg-slate-900/80 p-3 rounded-2xl backdrop-blur-md border-b-4 border-slate-800 shadow-2xl skew-x-[-5deg]">
              {[...Array(3)].map((_, i) => (
                <Heart
                  key={i}
                  className={`w-8 h-8 skew-x-[5deg] transition-all duration-300 ${
                    i < lives ? 'text-rose-500 fill-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.6)]' : 'text-slate-800 fill-slate-900'
                  }`}
                />
              ))}
            </div>
            
            <div className="flex gap-2">
              <button 
                onClick={() => setIsPaused(!isPaused)}
                className="p-3 bg-slate-800/90 hover:bg-slate-700 rounded-xl backdrop-blur-md border-b-4 border-slate-900 transition-all active:translate-y-1 active:border-b-0 shadow-lg"
                title="Pause (P or Esc)"
              >
                {isPaused ? <Play className="w-6 h-6 text-white" /> : <Pause className="w-6 h-6 text-white" />}
              </button>
              <button 
                onClick={initGame}
                className="p-3 bg-slate-800/90 hover:bg-slate-700 rounded-xl backdrop-blur-md border-b-4 border-slate-900 transition-all active:translate-y-1 active:border-b-0 shadow-lg"
                title="Quick Restart (R)"
              >
                <RefreshCw className="w-6 h-6 text-white" />
              </button>
              {isPaused && (
                <button 
                  onClick={() => { setGameState('MENU'); setIsPaused(false); }}
                  className="p-3 bg-slate-800/90 hover:bg-slate-700 rounded-xl backdrop-blur-md border-b-4 border-slate-900 transition-all active:translate-y-1 active:border-b-0 shadow-lg"
                  title="Main Menu (M)"
                >
                  <Home className="w-6 h-6 text-white" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Name Input Screen */}
      {gameState === 'NAME_INPUT' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-md z-50 p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-slate-900/90 p-10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border-t border-slate-700 max-w-md w-full text-center backdrop-blur-xl"
          >
            <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-sky-300 to-blue-600 mb-4 tracking-tighter italic drop-shadow-lg">
              ENTER YOUR NAME
            </h2>
            <p className="text-slate-400 mb-8 font-bold tracking-widest text-sm uppercase">This will be used for the leaderboard.</p>
            
            <input 
              type="text" 
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Diver Name..."
              maxLength={15}
              className="w-full bg-slate-950 border-2 border-slate-700 rounded-xl px-6 py-4 text-white font-black text-xl text-center focus:outline-none focus:border-blue-500 transition-colors mb-8"
            />
            
            <button
              onClick={() => {
                if (playerName.trim()) {
                  localStorage.setItem('playerName', playerName.trim());
                  setGameState('MENU');
                }
              }}
              disabled={!playerName.trim()}
              className="group relative w-full py-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black text-xl uppercase tracking-widest skew-x-[-10deg] transition-all hover:scale-105 shadow-[0_0_20px_rgba(37,99,235,0.4)] border-b-4 border-blue-900 hover:border-blue-400 active:border-b-0 active:translate-y-1"
            >
              <span className="block skew-x-[10deg]">Continue</span>
            </button>
          </motion.div>
        </div>
      )}

      {/* Stylish Main Menu */}
      {gameState === 'MENU' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-sm z-50">
          <div className="absolute top-6 right-6 flex items-center gap-3 bg-slate-900/80 backdrop-blur-md px-5 py-3 rounded-2xl border-b-4 border-slate-800 shadow-2xl skew-x-[-5deg]">
            <Diamond className="w-6 h-6 text-sky-400 skew-x-[5deg]" />
            <span className="text-2xl font-black text-white tracking-tighter skew-x-[5deg]">{diamondCurrency}</span>
          </div>

          <motion.div
            initial={{ y: -40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="text-center mb-12"
          >
            <h1 className="text-7xl md:text-9xl font-black text-transparent bg-clip-text bg-gradient-to-b from-sky-300 via-blue-500 to-blue-800 tracking-tighter italic drop-shadow-[0_0_40px_rgba(37,99,235,0.4)] mb-2">
              TooBlueToBeTrue
            </h1>
            <p className="text-sky-200 tracking-[0.4em] font-bold text-sm md:text-xl drop-shadow-lg">
              COLLECT. DODGE. SURVIVE.
            </p>
          </motion.div>

          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="flex flex-col items-center gap-6 w-full max-w-md"
          >
            <button
              onClick={initGame}
              className="group relative w-full py-5 bg-blue-600 hover:bg-blue-500 text-white font-black text-3xl uppercase tracking-widest skew-x-[-10deg] transition-all hover:scale-105 shadow-[0_0_30px_rgba(37,99,235,0.4)] hover:shadow-[0_0_50px_rgba(56,189,248,0.6)] border-b-8 border-blue-900 hover:border-blue-400 active:border-b-0 active:translate-y-2"
            >
              <span className="block skew-x-[10deg]">Start Dive</span>
            </button>

            <button
              onClick={() => { setGameState('LEADERBOARD'); fetchLeaderboard(); }}
              className="group relative w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-black text-xl uppercase tracking-widest skew-x-[-10deg] transition-all hover:scale-105 shadow-[0_0_20px_rgba(0,0,0,0.4)] border-b-4 border-slate-900 hover:border-slate-500 active:border-b-0 active:translate-y-1 flex items-center justify-center gap-3"
            >
              <Trophy className="w-6 h-6 skew-x-[10deg] text-fuchsia-400" />
              <span className="block skew-x-[10deg]">Leaderboard</span>
            </button>

            <button
              onClick={() => setGameState('SETTINGS')}
              className="group relative w-full py-4 bg-slate-800 hover:bg-slate-700 text-white font-black text-xl uppercase tracking-widest skew-x-[-10deg] transition-all hover:scale-105 shadow-[0_0_20px_rgba(0,0,0,0.4)] border-b-4 border-slate-900 hover:border-slate-500 active:border-b-0 active:translate-y-1 flex items-center justify-center gap-3"
            >
              <Settings className="w-6 h-6 skew-x-[10deg] text-slate-400" />
              <span className="block skew-x-[10deg]">Settings</span>
            </button>
            
            <div className="flex gap-6 text-slate-500 text-xs font-bold uppercase tracking-widest mt-4">
              <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded">A</kbd> <kbd className="px-1.5 py-0.5 bg-slate-800 rounded">D</kbd> Move</span>
              <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded">P</kbd> Pause</span>
              <span><kbd className="px-1.5 py-0.5 bg-slate-800 rounded">R</kbd> Restart</span>
            </div>
          </motion.div>
        </div>
      )}

      {/* Stylish Game Over */}
      {gameState === 'GAME_OVER' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-slate-900/90 p-10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border-t border-slate-700 max-w-md w-full text-center backdrop-blur-xl"
          >
            <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-rose-400 to-rose-700 mb-2 tracking-tighter italic drop-shadow-lg">
              CRUSHED
            </h2>
            <p className="text-slate-400 mb-10 font-bold tracking-widest text-sm uppercase">The cave claimed another diver.</p>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-950/50 p-6 rounded-2xl border-b-4 border-slate-800 skew-x-[-5deg]">
                <div className="text-slate-500 text-xs font-black uppercase tracking-widest mb-2 skew-x-[5deg]">Final Score</div>
                <div className="text-5xl font-black text-sky-400 skew-x-[5deg] drop-shadow-[0_0_10px_rgba(56,189,248,0.3)]">{score}</div>
              </div>
              <div className="bg-slate-950/50 p-6 rounded-2xl border-b-4 border-slate-800 skew-x-[-5deg]">
                <div className="text-slate-500 text-xs font-black uppercase tracking-widest mb-2 skew-x-[5deg]">High Score</div>
                <div className="text-5xl font-black text-white skew-x-[5deg]">{highScore}</div>
              </div>
            </div>

            {scoreSubmitted && (
              <div className="mb-8 text-emerald-400 font-bold uppercase tracking-widest text-sm bg-emerald-950/30 py-3 rounded-xl border border-emerald-900/50">
                Score Auto-Submitted!
              </div>
            )}

            <button
              onClick={initGame}
              className="group relative w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-xl uppercase tracking-widest skew-x-[-10deg] transition-all hover:scale-105 shadow-[0_0_20px_rgba(37,99,235,0.4)] border-b-4 border-blue-900 hover:border-blue-400 active:border-b-0 active:translate-y-1 mb-4 flex items-center justify-center gap-3"
            >
              <RefreshCw className="w-6 h-6 skew-x-[10deg]" /> 
              <span className="block skew-x-[10deg]">Dive Again</span>
            </button>
            <button
              onClick={() => setGameState('MENU')}
              className="w-full py-4 px-6 bg-transparent hover:bg-slate-800 text-slate-500 hover:text-white rounded-xl font-black uppercase tracking-widest text-sm transition-all"
            >
              Main Menu
            </button>
          </motion.div>
        </div>
      )}
      {/* Stylish Victory */}
      {gameState === 'VICTORY' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 backdrop-blur-md z-50">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-slate-900/90 p-10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border-t border-slate-700 max-w-md w-full text-center backdrop-blur-xl"
          >
            <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-400 to-emerald-700 mb-2 tracking-tighter italic drop-shadow-lg">
              VICTORY
            </h2>
            <p className="text-slate-400 mb-10 font-bold tracking-widest text-sm uppercase">Kermelis has been defeated.</p>
            
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="bg-slate-950/50 p-6 rounded-2xl border-b-4 border-slate-800 skew-x-[-5deg]">
                <div className="text-slate-500 text-xs font-black uppercase tracking-widest mb-2 skew-x-[5deg]">Final Score</div>
                <div className="text-5xl font-black text-sky-400 skew-x-[5deg] drop-shadow-[0_0_10px_rgba(56,189,248,0.3)]">{score}</div>
              </div>
              <div className="bg-slate-950/50 p-6 rounded-2xl border-b-4 border-slate-800 skew-x-[-5deg]">
                <div className="text-slate-500 text-xs font-black uppercase tracking-widest mb-2 skew-x-[5deg]">High Score</div>
                <div className="text-5xl font-black text-white skew-x-[5deg]">{highScore}</div>
              </div>
            </div>

            {scoreSubmitted && (
              <div className="mb-8 text-emerald-400 font-bold uppercase tracking-widest text-sm bg-emerald-950/30 py-3 rounded-xl border border-emerald-900/50">
                Score Auto-Submitted!
              </div>
            )}

            <button
              onClick={initGame}
              className="group relative w-full py-4 bg-blue-600 hover:bg-blue-500 text-white font-black text-xl uppercase tracking-widest skew-x-[-10deg] transition-all hover:scale-105 shadow-[0_0_20px_rgba(37,99,235,0.4)] border-b-4 border-blue-900 hover:border-blue-400 active:border-b-0 active:translate-y-1 mb-4 flex items-center justify-center gap-3"
            >
              <RefreshCw className="w-6 h-6 skew-x-[10deg]" /> 
              <span className="block skew-x-[10deg]">Play Again</span>
            </button>
            <button
              onClick={() => setGameState('MENU')}
              className="w-full py-4 px-6 bg-transparent hover:bg-slate-800 text-slate-500 hover:text-white rounded-xl font-black uppercase tracking-widest text-sm transition-all"
            >
              Main Menu
            </button>
          </motion.div>
        </div>
      )}

      {/* Leaderboard Screen */}
      {gameState === 'LEADERBOARD' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-md z-50 p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-slate-900/90 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border-t border-slate-700 max-w-lg w-full backdrop-blur-xl flex flex-col max-h-[90vh]"
          >
            <div className="flex items-center justify-center gap-4 mb-8">
              <Trophy className="w-10 h-10 text-fuchsia-400" />
              <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-fuchsia-300 to-fuchsia-600 tracking-tighter italic drop-shadow-lg">
                TOP DIVERS
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-3 mb-8 custom-scrollbar">
              {leaderboard.length === 0 ? (
                <div className="text-center text-slate-500 py-10 font-bold uppercase tracking-widest">No scores yet. Be the first!</div>
              ) : (
                leaderboard.map((entry, index) => (
                  <div key={index} className="flex items-center justify-between bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${
                        index === 0 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' : 
                        index === 1 ? 'bg-slate-300/20 text-slate-300 border border-slate-300/50' : 
                        index === 2 ? 'bg-amber-600/20 text-amber-500 border border-amber-600/50' : 
                        'bg-slate-800 text-slate-500'
                      }`}>
                        {index + 1}
                      </div>
                      <span className="font-bold text-lg text-slate-200">{entry.name}</span>
                    </div>
                    <span className="font-black text-2xl text-sky-400">{entry.score}</span>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setGameState('MENU')}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black uppercase tracking-widest text-sm transition-all border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"
            >
              Back to Menu
            </button>
          </motion.div>
        </div>
      )}

      {/* Settings Screen */}
      {gameState === 'SETTINGS' && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 backdrop-blur-md z-50 p-6">
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-slate-900/90 p-8 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] border-t border-slate-700 max-w-md w-full backdrop-blur-xl flex flex-col"
          >
            <div className="flex items-center justify-center gap-4 mb-8">
              <Settings className="w-10 h-10 text-slate-400" />
              <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-slate-300 to-slate-600 tracking-tighter italic drop-shadow-lg">
                SETTINGS
              </h2>
            </div>
            
            <div className="space-y-6 mb-8">
              <div className="flex items-center justify-between group bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                <div className="flex items-center gap-3">
                  <MonitorPlay className="w-6 h-6 text-slate-500 group-hover:text-sky-400 transition-colors" />
                  <span className="text-lg font-bold text-slate-300">FPS Limit</span>
                </div>
                <div className="flex gap-2 bg-slate-900 p-1.5 rounded-lg border border-slate-700">
                  {[30, 60, 144].map(fps => (
                    <button
                      key={fps}
                      onClick={() => setFpsLimit(fps)}
                      className={`px-4 py-2 rounded-md text-sm font-black transition-all ${
                        fpsLimit === fps 
                          ? 'bg-blue-600 text-white shadow-[0_0_10px_rgba(37,99,235,0.5)]' 
                          : 'text-slate-500 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {fps}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between group bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                <div className="flex items-center gap-3">
                  <Vibrate className="w-6 h-6 text-slate-500 group-hover:text-rose-400 transition-colors" />
                  <span className="text-lg font-bold text-slate-300">Screen Shake</span>
                </div>
                <button
                  onClick={() => setEnableScreenShake(!enableScreenShake)}
                  className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors duration-300 focus:outline-none ${
                    enableScreenShake ? 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'bg-slate-800'
                  }`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 ${
                    enableScreenShake ? 'translate-x-9' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between group bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                <div className="flex items-center gap-3">
                  <Diamond className="w-6 h-6 text-slate-500 group-hover:text-fuchsia-400 transition-colors" />
                  <span className="text-lg font-bold text-slate-300">Better Effects</span>
                </div>
                <button
                  onClick={() => setEnableBetterEffects(!enableBetterEffects)}
                  className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors duration-300 focus:outline-none ${
                    enableBetterEffects ? 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.5)]' : 'bg-slate-800'
                  }`}
                >
                  <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform duration-300 ${
                    enableBetterEffects ? 'translate-x-9' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              <div className="flex items-center justify-between group bg-slate-950/50 p-4 rounded-xl border border-slate-800/50">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-6 h-6 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                  <span className="text-lg font-bold text-slate-300">Menu Music</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={musicVolume}
                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                    className="w-24 accent-blue-600"
                  />
                  <span className="text-slate-400 font-mono text-sm w-8 text-right">
                    {Math.round(musicVolume * 100)}%
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setGameState('MENU')}
              className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-black uppercase tracking-widest text-sm transition-all border-b-4 border-slate-900 active:border-b-0 active:translate-y-1"
            >
              Back to Menu
            </button>
          </motion.div>
        </div>
      )}

      {/* Background Audio Element */}
      <audio 
        ref={audioRef} 
        src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" 
        loop 
        preload="auto"
      />
    </div>
  );
}
