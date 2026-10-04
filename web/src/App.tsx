import Dashboard from "./Dashboard";
import ContactPage from "./ContactPage";
import EmailPage from "./EmailPage";

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/c/")) {
    const token = path.slice(3);
    return <ContactPage token={token} />;
  }
  if (path === "/email") {
    return <EmailPage />;
  }
  return <Dashboard />;
}
