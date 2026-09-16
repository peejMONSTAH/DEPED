import React, { createContext, useContext, useEffect } from 'react';

export type AppTheme = 'light' | 'dark';

interface ThemeContextValue {
  readonly theme: AppTheme;
}

const lightTheme: ThemeContextValue = { theme: 'light' };
const ThemeContext = createContext<ThemeContextValue>(lightTheme);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    // Migrate any saved dark preference from earlier versions.
    localStorage.removeItem('app_theme');
  }, []);

  return <ThemeContext.Provider value={lightTheme}>{children}</ThemeContext.Provider>;
};

// Read-only theme access for components that adapt their colors.
export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
