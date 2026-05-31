// Composant de visualisation miniature d'un bloc
import React from 'react';
import type { BlockDefinition, BlockShape } from '@/types/types';
import { applyTransform, normalizeShape } from '@/lib/blockUtils';

interface BlockPreviewProps {
  definition: BlockDefinition;
  color: string;
  rotation?: 0 | 90 | 180 | 270;
  flipped?: boolean;
  cellSize?: number;
  className?: string;
}

export const BlockPreview: React.FC<BlockPreviewProps> = ({
  definition,
  color,
  rotation = 0,
  flipped = false,
  cellSize = 12,
  className = '',
}) => {
  const shape: BlockShape = applyTransform(definition.shape, rotation, flipped);
  const normalized = normalizeShape(shape);
  const maxRow = Math.max(...normalized.map(([r]) => r)) + 1;
  const maxCol = Math.max(...normalized.map(([, c]) => c)) + 1;

  const occupied = new Set(normalized.map(([r, c]) => `${r},${c}`));

  return (
    <div
      className={`inline-flex flex-col gap-px ${className}`}
      style={{ lineHeight: 0 }}
    >
      {Array.from({ length: maxRow }).map((_, r) => (
        <div key={r} className="flex gap-px">
          {Array.from({ length: maxCol }).map((_, c) => (
            <div
              key={c}
              style={{
                width: cellSize,
                height: cellSize,
                backgroundColor: occupied.has(`${r},${c}`) ? color : 'transparent',
                borderRadius: 2,
                border: occupied.has(`${r},${c}`)
                  ? `1px solid ${color}cc`
                  : 'none',
                boxShadow: occupied.has(`${r},${c}`)
                  ? `inset 0 1px 0 ${color}88, inset 0 -1px 0 ${color}44`
                  : 'none',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export default BlockPreview;
