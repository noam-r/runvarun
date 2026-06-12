import { Component, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  handleReset = () => {
    try {
      localStorage.removeItem('runvarun:v1');
    } catch {
      // If even this fails, nothing we can do
    }
    window.location.reload();
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h1>RunVaRun</h1>
          <p>Something went wrong.</p>
          <div className="error-boundary__actions">
            <button className="btn btn-primary" onClick={this.handleReload}>
              Reload app
            </button>
            <button className="btn btn-secondary" onClick={this.handleReset}>
              Reset all data &amp; reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
