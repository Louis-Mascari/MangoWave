import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StartScreen } from '../StartScreen.tsx';
import { useSpotifyStore } from '../../store/useSpotifyStore.ts';

describe('StartScreen', () => {
  it('renders epilepsy warning', () => {
    render(<StartScreen onStart={vi.fn()} error={null} />);
    expect(screen.getByText('Photosensitivity Warning')).toBeInTheDocument();
  });

  it('renders the title', () => {
    render(<StartScreen onStart={vi.fn()} error={null} />);
    expect(screen.getByText('MangoWave')).toBeInTheDocument();
  });

  it('calls onStart when button is clicked', async () => {
    const user = userEvent.setup();
    const onStart = vi.fn();
    render(<StartScreen onStart={onStart} error={null} />);

    await user.click(screen.getByText('Start Visualizer'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('renders error when provided', () => {
    render(<StartScreen onStart={vi.fn()} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('does not render error when null', () => {
    render(<StartScreen onStart={vi.fn()} error={null} />);
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });

  it('renders audio sharing instructions', () => {
    render(<StartScreen onStart={vi.fn()} error={null} />);
    expect(screen.getByText('How it works')).toBeInTheDocument();
  });

  it('renders Connect Spotify button when not connected', () => {
    useSpotifyStore.setState({ sessionId: null });
    render(<StartScreen onStart={vi.fn()} error={null} />);
    expect(screen.getByText('Connect Spotify')).toBeInTheDocument();
  });

  it('shows connected state when Spotify sessionId exists', () => {
    useSpotifyStore.setState({
      sessionId: 'test-session',
      user: { displayName: 'Test User', id: '123' },
    });
    render(<StartScreen onStart={vi.fn()} error={null} />);
    expect(screen.getByText('Connected as Test User')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
    useSpotifyStore.setState({ sessionId: null, user: null });
  });
});
