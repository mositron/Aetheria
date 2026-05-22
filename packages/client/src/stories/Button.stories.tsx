import type { Meta, StoryObj } from '@storybook/react';
import React from 'react';

type ButtonVariant = 'primary' | 'success' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

// Simple styled button component for demonstration
const StyledButton = ({ 
  label, 
  variant = 'primary', 
  size = 'md', 
  onClick 
}: { 
  label?: string; 
  variant?: ButtonVariant; 
  size?: ButtonSize; 
  onClick?: () => void;
}) => {
  const baseStyles: React.CSSProperties = {
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    transition: 'opacity 0.2s',
  };

  const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: { backgroundColor: '#3b82f6', color: '#fff' },
    success: { backgroundColor: '#22c55e', color: '#fff' },
    danger: { backgroundColor: '#ef4444', color: '#fff' },
  };

  const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
    sm: { padding: '4px 8px', fontSize: '12px' },
    md: { padding: '8px 16px', fontSize: '14px' },
    lg: { padding: '12px 24px', fontSize: '16px' },
  };

  return (
    <button
      style={{ ...baseStyles, ...variantStyles[variant], ...sizeStyles[size] }}
      onClick={onClick}
    >
      {label}
    </button>
  );
};

const meta: Meta<typeof StyledButton> = {
  title: 'Components/Button',
  component: StyledButton,
  tags: ['autodocs'],
  argTypes: {
    label: { 
      control: 'text',
      description: 'Button label text',
    },
    variant: {
      control: 'select',
      options: ['primary', 'success', 'danger'],
      description: 'Button variant',
    },
    size: {
      control: 'select',
      options: ['sm', 'md', 'lg'],
      description: 'Button size',
    },
  },
  parameters: {
    docs: {
      description: 'A simple button component with variant and size options.',
    },
  },
};

export default meta;
type Story = StoryObj<typeof StyledButton>;

export const Primary: Story = {
  args: {
    label: 'Primary Button',
    variant: 'primary',
    size: 'md',
  },
};

export const Success: Story = {
  args: {
    label: 'Success Button',
    variant: 'success',
    size: 'md',
  },
};

export const Danger: Story = {
  args: {
    label: 'Danger Button',
    variant: 'danger',
    size: 'md',
  },
};

export const Small: Story = {
  args: {
    label: 'Small Button',
    variant: 'primary',
    size: 'sm',
  },
};

export const Large: Story = {
  args: {
    label: 'Large Button',
    variant: 'primary',
    size: 'lg',
  },
};