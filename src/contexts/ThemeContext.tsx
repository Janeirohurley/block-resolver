// Contexte de thème pour l'application
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ThemeConfig } from '@/types/types';
import { DEFAULT_THEME } from '@/types/types';

interface ThemeContextValue {
  theme: ThemeConfig;
  updateTheme: (partial: Partial<ThemeConfig>) => void;
  resetTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setTheme] = useState<ThemeConfig>(() => {
    try {
      const saved = localStorage.getItem('blockpuzzle-theme');
      return saved ? { ...DEFAULT_THEME, ...JSON.parse(saved) } : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });

  useEffect(() => {
    // Appliquer le mode dark/light
    if (theme.isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Appliquer la couleur d'accent personnalisée
    const hex = theme.accentColor;
    const hsl = hexToHsl(hex);
    if (hsl) {
      document.documentElement.style.setProperty(
        '--primary',
        `${hsl.h} ${hsl.s}% ${hsl.l}%`
      );
      document.documentElement.style.setProperty(
        '--ring',
        `${hsl.h} ${hsl.s}% ${hsl.l}%`
      );
    }

    // Sauvegarder
    localStorage.setItem('blockpuzzle-theme', JSON.stringify(theme));
  }, [theme]);

  const updateTheme = (partial: Partial<ThemeConfig>) => {
    setTheme(prev => ({ ...prev, ...partial }));
  };

  const resetTheme = () => setTheme(DEFAULT_THEME);

  return (
    <ThemeContext.Provider value={{ theme, updateTheme, resetTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme doit être utilisé dans ThemeProvider');
  return ctx;
};

// Convertir hex en HSL
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}
