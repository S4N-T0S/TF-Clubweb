import { Component, useEffect } from 'react';
import { useRouteError, isRouteErrorResponse } from 'react-router-dom';
import { ErrorDisplay } from './ErrorDisplay';

const CrashScreen = ({ error }) => (
  <div className="min-h-screen bg-gray-900">
    <ErrorDisplay
      title="Something went wrong"
      error={error}
      onRetry={() => window.location.reload()}
      onGoHome={() => window.location.assign('/')}
    />
  </div>
);

// App-level safety net for errors thrown outside the router (providers, router setup).
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
      return <CrashScreen error={this.state.error} />;
    }
    return this.props.children;
  }
}

// Route-level error screen. The data router catches render errors before they can
// reach RootErrorBoundary, so without this it shows react-router's unstyled default page.
export const RouteErrorBoundary = () => {
  const error = useRouteError();

  useEffect(() => {
    console.error('Unhandled route error:', error);
  }, [error]);

  const normalized = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error ? error : String(error);

  return <CrashScreen error={normalized} />;
};
