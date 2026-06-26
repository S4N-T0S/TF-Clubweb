import { Component } from 'react';
import { ErrorDisplay } from './ErrorDisplay';

// App-level safety net
export class RootErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-900">
          <ErrorDisplay
            error={this.state.error?.message || 'Something went wrong.'}
            onRetry={() => window.location.reload()}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
