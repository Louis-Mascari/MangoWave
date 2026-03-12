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

  it('switches to Rendering tab', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Rendering' }));

    expect(screen.getByText('Frame Rate')).toBeInTheDocument();
    expect(screen.getByText('Resolution')).toBeInTheDocument();
  });

  it('shows butterchurn config controls on Rendering tab', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Rendering' }));

    expect(screen.getByText('Mesh Resolution')).toBeInTheDocument();
    expect(screen.getByText('Texture Quality')).toBeInTheDocument();
    expect(screen.getByText('Anti-Aliasing')).toBeInTheDocument();
  });

  it('shows Analysis section on Rendering tab', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Rendering' }));

    expect(screen.getByText('Analysis')).toBeInTheDocument();
    expect(screen.getByText('FFT Size')).toBeInTheDocument();
  });

  it('shows Presets tab with Transition Time, Display, and Autopilot', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Presets' }));

    expect(screen.getByText(/Transition Time/)).toBeInTheDocument();
    expect(screen.getByText('Preset Name Display')).toBeInTheDocument();
    expect(screen.getByText('Song Info Display')).toBeInTheDocument();
    expect(screen.getByText('Autopilot')).toBeInTheDocument();
  });

  it('switches back to Equalizer tab', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Rendering' }));
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

  it('shows Data tab with export and import', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Data' }));

    expect(screen.getByText('Data', { selector: 'h3' })).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(screen.getByText('Export Settings')).toBeInTheDocument();
    expect(screen.getByText('Import Settings')).toBeInTheDocument();
  });

  it('shows all 8 export category checkboxes on Data tab', async () => {
    const user = userEvent.setup();
    render(<SettingsPanel />);

    await user.click(screen.getByRole('button', { name: 'Data' }));

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(8);
    expect(screen.getByText('Audio Analysis')).toBeInTheDocument();
    expect(screen.getByText('EQ')).toBeInTheDocument();
    expect(screen.getByText('Display')).toBeInTheDocument();
    expect(screen.getByText('Favorites')).toBeInTheDocument();
    expect(screen.getByText('Blocked Presets')).toBeInTheDocument();
    expect(screen.getByText('Pack Settings')).toBeInTheDocument();
  });
});
