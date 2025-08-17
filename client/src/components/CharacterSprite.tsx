import React, { useState, useEffect } from "react";

interface CharacterSpriteProps {
  scale?: number;
  imgSrc: string;
}

export default function CharacterSprite({ scale = 0.15, imgSrc }: CharacterSpriteProps) {
    const [frame, setFrame] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setFrame((prev) => (prev + 1) % 6); // 6 frames
        }, 250);
        return () => clearInterval(interval);
    }, []);

    const originalFrameWidth = 256;
    const originalFrameHeight = 512;
    
    const scaledWidth = originalFrameWidth * scale;
    const scaledHeight = originalFrameHeight * scale;

    const frameX = -(frame % 3) * originalFrameWidth;
    const frameY = 0;

    return (
        <div
            style={{
                width: `${scaledWidth}px`,
                height: `${scaledHeight}px`,
                backgroundImage: `url('/sprites/${imgSrc}.png')`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: `${frameX * scale}px ${frameY * scale}px`,
                backgroundSize: `${originalFrameWidth * 3 * scale}px ${originalFrameHeight * scale}px`,
            }}
        />
    );
}