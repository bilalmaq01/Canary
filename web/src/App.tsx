import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";
import ContactPage from "./ContactPage";
import EmailPage from "./EmailPage";
import PrivacyPage from "./PrivacyPage";
import LoginPage from "./LoginPage";
import RegisterPage from "./RegisterPage";

interface User {
  id: string;
  email: string;
  name: string;
  protectedPhone: string | null;
}

const path = window.location.pathname;
const isPublic = path.startsWith("/c/") || path === "/privacy";

export default function App() {
  const [user, setUser] = useState<User | null | "loading">("loading");
  const [authView, setAuthView] = useState<"login" | "register">("login");

  useEffect(() => {
    if (isPublic) { setUser(null); return; }
    fetch("/api/auth/me")
      .then(async (res) => {
        if (res.ok) setUser((await res.json()) as User);
        else setUser(null);
      })
      .catch(() => setUser(null));
  }, []);

  const refreshUser = () => {
    fetch("/api/auth/me")
      .then(async (res) => { if (res.ok) setUser((await res.json()) as User); })
      .catch(() => {});
  };

  if (path.startsWith("/c/")) return <ContactPage token={path.slice(3)} />;
  if (path === "/privacy") return <PrivacyPage />;

  if (user === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <span className="text-gray-600 text-sm">Loading...</span>
      </div>
    );
  }

  if (!user) {
    if (authView === "register") {
      return (
        <RegisterPage
          onRegister={refreshUser}
          onGoToLogin={() => setAuthView("login")}
        />
      );
    }
    return (
      <LoginPage
        onLogin={refreshUser}
        onGoToRegister={() => setAuthView("register")}
      />
    );
  }

  const handleLogout = () => {
    void fetch("/api/auth/logout", { method: "POST" }).then(() => {
      setUser(null);
      setAuthView("login");
    });
  };

  if (path === "/email") return <EmailPage />;
  return <Dashboard user={user} onLogout={handleLogout} />;
}
