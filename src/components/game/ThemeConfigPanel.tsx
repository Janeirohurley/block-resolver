// Panel de configuration du thème
import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Settings, RotateCcw, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESET_ACCENTS = [
  { label: 'Émeraude', color: '#10b981' },
  { label: 'Bleu', color: '#3b82f6' },
  { label: 'Violet', color: '#8b5cf6' },
  { label: 'Orange', color: '#f97316' },
  { label: 'Rose', color: '#ec4899' },
  { label: 'Cyan', color: '#06b6d4' },
];

const DEFAULT_BLOCK_COLORS = [
  '#3b82f6', // bleu
  '#22c55e', // vert
  '#ef4444', // rouge
  '#f97316', // orange
  '#a855f7', // violet
  '#06b6d4', // cyan
  '#eab308', // jaune
  '#ec4899', // rose
];

export const ThemeConfigPanel: React.FC = () => {
  const { theme, updateTheme, resetTheme } = useTheme();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Paramètres">
          <Settings className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="bg-sidebar w-72">
        <SheetHeader>
          <SheetTitle className="text-sidebar-foreground">Paramètres du thème</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-5 mt-4">
          {/* Mode clair/sombre */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
              Apparence
            </Label>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {theme.isDark ? (
                  <Moon className="h-4 w-4 text-sidebar-foreground" />
                ) : (
                  <Sun className="h-4 w-4 text-sidebar-foreground" />
                )}
                <span className="text-sm text-sidebar-foreground">
                  {theme.isDark ? 'Mode sombre' : 'Mode clair'}
                </span>
              </div>
              <Switch
                checked={theme.isDark}
                onCheckedChange={v => updateTheme({ isDark: v })}
              />
            </div>
          </div>

          <Separator className="bg-sidebar-border" />

          {/* Couleur d'accent */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
              Couleur principale
            </Label>
            <div className="flex flex-wrap gap-2">
              {PRESET_ACCENTS.map(preset => (
                <button
                  key={preset.color}
                  type="button"
                  onClick={() => updateTheme({ accentColor: preset.color })}
                  className={cn(
                    'w-8 h-8 rounded-md border-2 transition-all',
                    theme.accentColor === preset.color
                      ? 'border-sidebar-foreground scale-110 shadow-md'
                      : 'border-transparent hover:scale-105'
                  )}
                  style={{ backgroundColor: preset.color }}
                  title={preset.label}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <label className="text-xs text-sidebar-foreground/70">Personnalisé:</label>
              <input
                type="color"
                value={theme.accentColor}
                onChange={e => updateTheme({ accentColor: e.target.value })}
                className="w-8 h-8 rounded-md cursor-pointer border border-sidebar-border bg-transparent"
              />
              <span className="text-xs text-sidebar-foreground font-mono">
                {theme.accentColor}
              </span>
            </div>
          </div>

          <Separator className="bg-sidebar-border" />

          {/* Couleurs des blocs */}
          <div className="flex flex-col gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70">
              Palette des blocs
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {theme.blockColors.map((color, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <input
                    type="color"
                    value={color}
                    onChange={e => {
                      const newColors = [...theme.blockColors];
                      newColors[i] = e.target.value;
                      updateTheme({ blockColors: newColors });
                    }}
                    className="w-9 h-9 rounded-md cursor-pointer border border-sidebar-border bg-transparent"
                    title={`Couleur ${i + 1}`}
                  />
                  <span className="text-[9px] text-sidebar-foreground/50 font-mono">
                    {i + 1}
                  </span>
                </div>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-sidebar-foreground hover:bg-sidebar-accent text-xs mt-1"
              onClick={() => updateTheme({ blockColors: DEFAULT_BLOCK_COLORS })}
            >
              Réinitialiser les couleurs
            </Button>
          </div>

          <Separator className="bg-sidebar-border" />

          {/* Reset complet */}
          <Button
            variant="ghost"
            size="sm"
            className="text-sidebar-foreground hover:bg-sidebar-accent flex items-center gap-2"
            onClick={resetTheme}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Réinitialiser tout
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ThemeConfigPanel;
