import { Component, type ReactNode } from "react";

// Prevents a render error from blanking the whole window — shows the error
// text instead, which is far easier to debug than a white screen.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="eb-title">Something broke in the UI</div>
          <pre className="eb-msg">{this.state.error.message}</pre>
          <button className="send-btn" onClick={() => this.setState({ error: null })}>Dismiss</button>
        </div>
      );
    }
    return this.props.children;
  }
}
