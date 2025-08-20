import { useEffect, useRef, useState } from "react";
import { type GameState } from "./Game";

type Props = {
    gameState: GameState;
    ropeFrame: number;
};

const MAX_WIDTH = 900;
const ARENA_HEIGHT = 220;

const ANIM_TOTAL_FRAMES = 6;
const SPRITE_COLUMNS = 3;          // columns in the single row sheet
const FRAME_INTERVAL_MS = 250;     // same 250ms
const ORIGINAL_FRAME_WIDTH = 256;
const ORIGINAL_FRAME_HEIGHT = 512;
const PLAYER_SCALE = 0.18;

const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
    });

export default function CanvasArena({ gameState, ropeFrame }: Props) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const assetsRef = useRef<{
        bg?: HTMLImageElement;
        rope?: HTMLImageElement[];
        man?: HTMLImageElement;
        man2?: HTMLImageElement;
        manTensed?: HTMLImageElement;
        man2Tensed?: HTMLImageElement;
    }>({});

    const [animFrame, setAnimFrame] = useState(0); // 0..5 like CharacterSprite

    // Advance animation counter (0..5)
    useEffect(() => {
        const id = setInterval(() => {
            setAnimFrame(f => (f + 1) % ANIM_TOTAL_FRAMES);
        }, FRAME_INTERVAL_MS);
        return () => clearInterval(id);
    }, []);

    // Preload assets once
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [bg, man, man2, manTensed, man2Tensed, r1, r2, r3] = await Promise.all([
                    loadImage("/game-bg.webp"),
                    loadImage("/sprites/man.png"),
                    loadImage("/sprites/man2.png"),
                    loadImage("/sprites/man_tensed.png"),
                    loadImage("/sprites/man2_tensed.png"),
                    loadImage("/rope1.png"),
                    loadImage("/rope2.png"),
                    loadImage("/rope3.png"),
                ]);
                if (cancelled) return;
                assetsRef.current = { bg, man, man2, manTensed, man2Tensed, rope: [r1, r2, r3] };
            } catch {
                /* ignore */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // Draw loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const { teamA, teamB, yourTeamIsA, barPosition, winThreshold } = gameState;
        const yourTeam = yourTeamIsA ? teamA : teamB;
        const oppTeam = yourTeamIsA ? teamB : teamA;
        const adjustedBar = yourTeamIsA ? barPosition : -barPosition;
        const width = canvas.width;
        const height = canvas.height;

        const leftPatterns: Record<number, number[]> = {
            1: [15],
            2: [15, 35],
            3: [15, 32, 44],
            4: [15, 25, 35, 45],
            5: [10, 15, 20, 25, 30],
        };
        const rightPatterns: Record<number, number[]> = {
            1: [85],
            2: [65, 85],
            3: [56, 68, 85],
            4: [55, 65, 75, 85],
            5: [70, 75, 80, 85, 90],
        };
        const leftPositions = leftPatterns[yourTeam.players.length] || [];
        const rightPositions = rightPatterns[oppTeam.players.length] || [];

        const assets = assetsRef.current;
        console.log(adjustedBar);

        const oppTeamLosing = adjustedBar < 0;
        const yourTeamLosing = adjustedBar > 0;

        const yourTeamSheet = yourTeamLosing
            ? assets.manTensed ?? assets.man
            : assets.man;

        const oppTeamSheet = oppTeamLosing
            ? assets.man2Tensed ?? assets.man2
            : assets.man2;


        const ropeImg = assets.rope?.[ropeFrame - 1];

        ctx.clearRect(0, 0, width, height);

        // Background
        if (assets.bg) ctx.drawImage(assets.bg, 0, 0, width, height);
        else {
            ctx.fillStyle = "#133";
            ctx.fillRect(0, 0, width, height);
        }

        const PIXELS_PER_UNIT = 4;
        const markerOffset = winThreshold * 3.5; // distance from center for markers
        const ropeTranslate = adjustedBar * PIXELS_PER_UNIT; // rope shift in px

        // Threshold markers (aligned exactly to ±winThreshold)
        const centerX = width / 2;
        const markerWidth = 8;
        const markerHeight = 100;
        ctx.save();
        ctx.translate(0, height - 30);

        // Left (your side win when adjustedBar <= -winThreshold)
        ctx.save();
        ctx.translate(centerX - markerOffset - markerWidth / 2, -markerHeight / 2);
        ctx.fillStyle = adjustedBar <= -winThreshold ? "#4ade80" : "#ffffff";
        ctx.globalAlpha = 0.9;
        ctx.transform(1, 0, -0.2, 1, 0, 0); // slight perspective skew
        ctx.fillRect(0, 0, markerWidth, markerHeight);
        ctx.restore();

        // Right (opponent side win when adjustedBar >= winThreshold)
        ctx.save();
        ctx.translate(centerX + markerOffset - markerWidth / 2, -markerHeight / 2);
        ctx.fillStyle = adjustedBar >= winThreshold ? "#f87171" : "#ffffff";
        ctx.globalAlpha = 0.9;
        ctx.transform(1, 0, 0.2, 1, 0, 0);
        ctx.fillRect(0, 0, markerWidth, markerHeight);
        ctx.restore();

        ctx.restore();


        // Rope
        if (ropeImg) {
            ctx.save();
            const ropeDrawWidth = width * 0.9;
            const ropeDrawHeight = ropeImg.height * (ropeDrawWidth / ropeImg.width);
            const ropeY = height / 2 - 10;
            const baseRopeX = (width - ropeDrawWidth) / 2 + ropeTranslate;

            // Light jitter only while not near win
            let jitterX = 0, jitterY = 0;
            if (Math.abs(adjustedBar) < winThreshold * 0.5) {
                jitterX = Math.random() * 4 - 2;
                jitterY = Math.random() * 2 - 1;
            }
            ctx.drawImage(
                ropeImg,
                baseRopeX + jitterX,
                ropeY + jitterY,
                ropeDrawWidth,
                ropeDrawHeight
            );
            ctx.restore();
            ctx.filter = "none";
        }

        // Determine visible frame like CharacterSprite (frame % 3)
        const visibleFrame = animFrame % SPRITE_COLUMNS;
        const frameWidth = ORIGINAL_FRAME_WIDTH;
        const frameHeight = ORIGINAL_FRAME_HEIGHT;
        const sx = visibleFrame * frameWidth;
        const sy = 0; // single row
        const dw = frameWidth * PLAYER_SCALE;
        const dh = frameHeight * PLAYER_SCALE;

        const drawPlayers = (
            list: typeof yourTeam.players,
            bases: number[],
            facingLeft: boolean,
            sheet?: HTMLImageElement
        ) => {
            if (!sheet) return;
            list.forEach((p, i) => {
                const base = bases[i] ?? (facingLeft ? 35 : 65);
                const finalPercent = base + adjustedBar / 3;
                const pullEffect = adjustedBar / 10;
                const clampedPercent = Math.max(5, Math.min(95, finalPercent));
                const x = (clampedPercent / 100) * width;
                const y = height / 2 + 5;

                ctx.save();
                ctx.translate(x, y);

                // Draw label BEFORE mirroring so text is not reversed
                const label = p.name.length > 10 ? p.name.slice(0, 10) + "..." : p.name;
                ctx.font = "12px sans-serif";
                ctx.textAlign = "center";
                ctx.lineWidth = 3;
                ctx.strokeStyle = "rgba(0,0,0,0.5)";
                ctx.fillStyle = "rgba(255,255,255,0.9)";
                ctx.strokeText(label, 0, -dh / 2 - 8);
                ctx.fillText(label, 0, -dh / 2 - 8);

                // Mirror only the sprite when needed
                if (!facingLeft) ctx.scale(-1, 1);

                ctx.drawImage(
                    sheet,
                    sx,
                    sy,
                    frameWidth,
                    frameHeight,
                    -dw / 2,
                    -dh / 2,
                    dw,
                    dh
                );

                // (Optional) apply pull effect to future elements (currently unused)
                ctx.translate(pullEffect, 0);

                ctx.restore();
            });
            if (Math.abs(adjustedBar) > 10) {
                ctx.beginPath();
                ctx.ellipse(0, dh / 2, 10, 4, 0, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(200, 200, 200, 0.3)";
                ctx.fill();
            }
        };

        drawPlayers(yourTeam.players, leftPositions, true, yourTeamSheet);
        drawPlayers(oppTeam.players, rightPositions, false, oppTeamSheet);
    }, [gameState, ropeFrame, animFrame]);

    return (
        <div className="w-full flex items-center justify-center">
            <canvas
                ref={canvasRef}
                width={MAX_WIDTH}
                height={ARENA_HEIGHT}
                className="w-full max-w-4xl h-56 rounded-md bg-[#0b1e24] shadow-inner"
            />
        </div>
    );
}