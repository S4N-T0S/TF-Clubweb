import { Component, Suspense, lazy, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { LoadingDisplay } from './LoadingDisplay';

class ChunkErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('Lazy section failed:', error, info);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

const ErrorPanel = ({ variant, onClose }) => {
  const panel = (
    <div className="relative w-full max-w-sm bg-gray-800 rounded-xl border border-gray-700 shadow-2xl p-6 text-center">
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      )}
      <div className="mx-auto mb-4 p-3 bg-red-900/30 rounded-full w-fit">
        <AlertTriangle className="w-7 h-7 text-red-500" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{"Couldn't load this section"}</h3>
      <p className="text-sm text-gray-400 mb-5">
        You may have lost connection. Reload the page to try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors active:scale-95 transform duration-150"
      >
        <RefreshCw className="w-4 h-4" />
        Reload page
      </button>
    </div>
  );

  if (variant === 'modal') {
    return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">{panel}</div>;
  }
  return <div className="flex items-center justify-center py-10 px-4">{panel}</div>;
};

/**
 * Drop-in replacement for `<Suspense>` around a code-split component: if the chunk
 * fails to load it shows a panel with a reload button instead of crashing the app.
 *
 *   <LazyBoundary loader={() => import('./Foo')} fallback={<Spinner />} onClose={closeModal}>
 *     {(Foo) => <Foo {...props} />}
 *   </LazyBoundary>
 *
 * - `variant`  'modal' renders the error panel as a centered overlay, 'inline' in flow.
 * - `onClose`  optional; shows a Close button on the error panel.
 * - `children` render prop receiving the resolved lazy component.
 */
export const LazyBoundary = ({ loader, fallback, variant = 'modal', onClose, children }) => {
  const [Lazy] = useState(() => lazy(loader));

  return (
    <ChunkErrorBoundary fallback={<ErrorPanel variant={variant} onClose={onClose} />}>
      <Suspense fallback={fallback ?? <LoadingDisplay variant="component" />}>
        {children(Lazy)}
      </Suspense>
    </ChunkErrorBoundary>
  );
};
