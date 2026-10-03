import Dashboard from "./Dashboard";
import ContactPage from "./ContactPage";

export default function App() {
  const path = window.location.pathname;
  if (path.startsWith("/c/")) {
    const token = path.slice(3);
    return <ContactPage token={token} />;
  }
  return <Dashboard />;
}
