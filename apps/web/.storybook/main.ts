import type { StorybookConfig } from '@storybook/tanstack-react';

const config: StorybookConfig = {
  "stories": [
    "../src/**/*.mdx",
    "../src/**/*.stories.@(js|jsx|mjs|ts|tsx)"
  ],
  "addons": [
    "@chromatic-com/storybook",
    "@storybook/addon-vitest",
    "@storybook/addon-a11y",
    "@storybook/addon-docs"
  ],
  // Use package names (not getAbsolutePath) so Node resolves `/preset` via
  // package exports. @storybook/tanstack-react ships preset only under dist/.
  "framework": "@storybook/tanstack-react"
};
export default config;
