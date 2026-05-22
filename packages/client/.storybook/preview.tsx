import type { Preview } from '@storybook/react';
import React from 'react';

// Mock useSettings to avoid runtime errors in Storybook
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockUseSettings = (): any => ({
  theme: 'dark',
  language: 'en',
  soundVolume: 0.8,
  musicVolume: 0.6,
  showfps: false,
});

jest.mock('../src/ui/SettingsPanel', () => ({
  useSettings: mockUseSettings,
}));

// Global decorator to wrap stories in ThemeProvider-like context
// Replace with actual ThemeProvider from your app if available
export const decorators = [
  (Story: React.ComponentType) => (
    <div style={{ padding: '1rem', backgroundColor: '#1a1a2e' }}>
      <Story />
    </div>
  ),
];

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    globalTypes: {
      theme: {
        name: 'Theme',
        description: 'Global theme for components',
        defaultValue: 'dark',
        toolbar: {
          icon: 'circlehollow',
          items: ['light', 'dark', 'cosmic'],
          showName: true,
        },
      },
    },
  },
};

export default preview;