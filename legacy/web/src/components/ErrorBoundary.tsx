import { Component, type ReactNode } from "react";

/** Um erro de renderização derruba só a tela atual, não o app inteiro. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="card">
        <div className="state error" role="alert">
          <h3>Esta tela encontrou um erro</h3>
          Recarregue a página. Se continuar, avise o suporte com o nome da tela.
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn" onClick={() => window.location.reload()}>Recarregar</button>
          </div>
        </div>
      </div>
    );
  }
}
