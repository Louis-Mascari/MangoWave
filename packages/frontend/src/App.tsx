import { useAudioCapture } from './hooks/useAudioCapture.ts';
import { Visualizer } from './components/Visualizer.tsx';

function App() {
  const { audioEngine, isCapturing, error, startCapture, stopCapture } = useAudioCapture();

  return (
    <div className="h-screen w-screen bg-black">
      {isCapturing && audioEngine ? <Visualizer audioEngine={audioEngine} /> : null}

      {!isCapturing && (
        <div className="flex h-full flex-col items-center justify-center font-sans text-white">
          <h1 className="text-4xl font-bold">MangoWave</h1>
          <p className="mb-6 opacity-60">Click below to share a tab and start visualizing audio</p>
          <button
            onClick={startCapture}
            className="cursor-pointer rounded-lg border-none bg-orange-500 px-8 py-3 text-lg font-bold text-white hover:bg-orange-400"
          >
            Start Visualizer
          </button>
          {error && <p className="mt-4 text-red-500">{error}</p>}
        </div>
      )}

      {isCapturing && (
        <button
          onClick={stopCapture}
          className="fixed top-4 right-4 z-50 cursor-pointer rounded-md border-none bg-white/15 px-4 py-2 text-sm text-white hover:bg-white/25"
        >
          Stop
        </button>
      )}
    </div>
  );
}

export default App;
