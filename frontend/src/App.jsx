import { Routes, Route } from 'react-router-dom'
import { TopBar } from './components/layout/TopBar.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Watchlist from './pages/Watchlist.jsx'
import Intelligence from './pages/Intelligence.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  return (
    <div className="min-h-screen bg-bg">
      <TopBar />
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/watchlist" element={<Watchlist />} />
        <Route path="/intelligence" element={<Intelligence />} />
        <Route path="/intelligence/:symbol" element={<Intelligence />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </div>
  )
}
