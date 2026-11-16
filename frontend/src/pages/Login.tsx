import { useState } from "react";
import { api, setCsrf, type User } from "../api";
import { errorText, PageTitle } from "../components";
export function LoginPage({
  disabled,
  loggedIn,
}: {
  disabled: boolean;
  loggedIn: (user: User) => void;
}) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <PageTitle title="Đăng nhập nhân sự" />
      <section className="panel login">
        <h2>Staff / Admin</h2>
        <p>Dùng tài khoản được cấp để truy cập không gian nhân sự.</p>
        {error && (
          <p className="banner error" role="alert">
            {error}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            void api<{ user: User; csrf: string }>("/auth/login", "POST", {
              username,
              password,
            })
              .then((result) => {
                setCsrf(result.csrf);
                setPassword("");
                loggedIn(result.user);
              })
              .catch((e: unknown) => setError(errorText(e)))
              .finally(() => setBusy(false));
          }}
        >
          <label htmlFor="username">Tên đăng nhập</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={100}
            required
          />
          <label htmlFor="password">Mật khẩu</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={200}
            required
          />
          <button disabled={disabled || busy}>
            {busy ? "Đang đăng nhập…" : "Đăng nhập"}
          </button>
        </form>
      </section>
    </>
  );
}
