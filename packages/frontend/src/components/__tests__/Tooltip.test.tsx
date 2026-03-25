import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from '../Tooltip.tsx';

describe('Tooltip', () => {
  it('renders the info icon', () => {
    const { container } = render(<Tooltip text="Help text" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('shows tooltip text on hover', async () => {
    const user = userEvent.setup();
    render(<Tooltip text="Lower values are snappier" />);

    expect(screen.queryByText('Lower values are snappier')).not.toBeInTheDocument();

    await user.hover(screen.getByRole('button'));
    expect(screen.getByText('Lower values are snappier')).toBeInTheDocument();

    await user.unhover(screen.getByRole('button'));
    expect(screen.queryByText('Lower values are snappier')).not.toBeInTheDocument();
  });
});
