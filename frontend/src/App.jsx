import { Routes, Route } from 'react-router-dom'
import { TopBar } from './components/layout/TopBar.jsx'
import { BottomNav } from './components/layout/BottomNav.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Watchlist from './pages/Watchlist.jsx'
import Intelligence from './pages/Intelligence.jsx'
import Settings from './pages/Settings.jsx'

export default function App() {
  return (
    <div className="min-h-screen bg-bg">
      <TopBar />
      {/* pb-20 on mobile clears the fixed bottom nav */}
      <main className="pb-20 md:pb-0">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/intelligence" element={<Intelligence />} />
          <Route path="/intelligence/:symbol" element={<Intelligence />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}
