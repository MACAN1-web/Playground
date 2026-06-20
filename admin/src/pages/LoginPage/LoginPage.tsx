type LoginPageProps = {
  email: string;
  password: string;
  message: string;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
};

export function LoginPage({ email, password, message, onEmailChange, onPasswordChange, onSubmit }: LoginPageProps) {
  return <section className="admin-login">
    <form className="panel" onSubmit={onSubmit}>
      <p className="eyebrow">Для сотрудников</p>
      <h2>Вход в админку</h2>
      <input type="email" placeholder="Email администратора" value={email} onChange={(event) => onEmailChange(event.target.value)} />
      <input type="password" placeholder="Пароль" value={password} onChange={(event) => onPasswordChange(event.target.value)} />
      <button>Войти</button>
      {message && <p className="message">{message}</p>}
    </form>
  </section>;
}
