import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tooltip } from '../Tooltip.tsx';

describe('Tooltip', () => {
  it('renders the info icon', () => {
    const { container } = render(<Tooltip text="Help text" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders tooltip text in the DOM', () => {
    render(<Tooltip text="Lower values are snappier" />);
    expect(screen.getByText('Lower values are snappier')).toBeInTheDocument();
  });
});
