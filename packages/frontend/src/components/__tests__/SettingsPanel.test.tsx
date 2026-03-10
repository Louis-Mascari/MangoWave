import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsPanel } from '../SettingsPanel.tsx';

describe('SettingsPanel', () => {
  it('renders with Equalizer tab active by default', () => {
    render(<SettingsPanel />);
    expect(screen.getByText('Equalizer', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('Pre-Amp')).toBeInTheDocument();
  });

  it('switches to Performance tab', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Performance' }));

    expect(screen.getByText('Frame Rate')).toBeInTheDocument();
    expect(screen.getByText('Resolution')).toBeInTheDocument();
  });

  it('shows Song Info Display on Performance tab', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Performance' }));

    expect(screen.getByText('Song Info Display')).toBeInTheDocument();
  });

  it('shows Preset Name Display on Performance tab', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Performance' }));

    expect(screen.getByText('Preset Name Display')).toBeInTheDocument();
  });

  it('shows Autopilot section on Performance tab', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Performance' }));

    expect(screen.getByText('Autopilot')).toBeInTheDocument();
  });

  it('switches back to Equalizer tab', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Performance' }));
    expect(screen.getByText('Frame Rate')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Equalizer' }));
    expect(screen.getByText('Pre-Amp')).toBeInTheDocument();
  });

  it('shows Shortcuts tab with keyboard shortcuts', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Shortcuts' }));

    expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
    expect(screen.getByText('Space / N')).toBeInTheDocument();
    expect(screen.getByText('Next preset')).toBeInTheDocument();
    expect(screen.getByText('Double-click')).toBeInTheDocument();
  });
});
