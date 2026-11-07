import { Routes, Route, useLocation } from 'react-router'
import Home from './pages/Home'
import Admin from './pages/Admin'
import Cabinet from './pages/Cabinet'
import Share from './pages/Share'
import { TaskDock, TasksProvider } from './components/TaskDock'

export default function App() {
  const location = useLocation()
  const showDock = location.pathname === '/' || location.pathname === '/cabinet'
  return (
    <TasksProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/cabinet" element={<Cabinet />} />
        <Route path="/s/:token" element={<Share />} />
      </Routes>
      {showDock && <TaskDock />}
    </TasksProvider>
  )
}
