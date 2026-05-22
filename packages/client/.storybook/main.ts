/**
 * Storybook setup for @game/client
 * 
 * INSTALL COMMAND (run in packages/client):
 *   pnpm add -D @storybook/react @storybook/react-vite @storybook/addon-essentials storybook
 * 
 * Then start Storybook with:
 *   pnpm storybook
 */

import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  addons: ['@storybook/addon-essentials'],
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.stories.@(js|jsx|ts|tsx)'],
  docs: {
    autodocs: 'tag',
  },
};

export default config;