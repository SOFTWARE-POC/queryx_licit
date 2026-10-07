import { useState, type FormEvent } from "react";
import { api, ApiError } from "../lib/api";
import type { Session } from "../lib/types";
import { IconChart } from "../components/icons";

function maskCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function Login(props: { onLogin: (s: Session) => void; notice?: string | null }) {
  const [cpf, setCpf] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      props.onLogin(await api.login(cpf, password));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login">
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="login-brand">
          <span className="brand-mark"><IconChart size={18} color="#fff" strokeWidth={2.2} /></span>
          <span className="brand-name" style={{ color: "var(--ink)" }}>LICITA<b style={{ color: "var(--primary)" }}>+</b> Relatórios</span>
        </div>
        <div>
          <h1>Entrar</h1>
          <p>Use o mesmo CPF e senha do LICITA+.</p>
        </div>
        {props.notice && !error && <div className="notice">{props.notice}</div>}
        {error && <div className="form-error" role="alert">{error}</div>}
        <label className="form-field">
          CPF
          <input inputMode="numeric" autoComplete="username" value={cpf} onChange={(e) => setCpf(maskCpf(e.target.value))}
            placeholder="000.000.000-00" required autoFocus />
        </label>
        <label className="form-field">
          Senha
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button type="submit" className="btn primary" disabled={busy || cpf.replace(/\D/g, "").length !== 11 || !password}>
          {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
